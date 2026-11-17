// Promptflix Market — payments server (Supabase Edge Function, Deno).
// Deploy: supabase functions deploy payments --no-verify-jwt   (see README.md → Going live)
//
// Actions (POST JSON):
//   { action: "stripe_intent",  orderId, kind: "deposit"|"balance", amount, currency }  → { clientSecret, id }
//   { action: "paypal_create",  orderId, kind, amount, currency }                         → { id }
//   { action: "paypal_capture", paypalOrderId, orderId, kind }                            → { status, captureId }
//   Stripe webhook (Stripe-Signature header)                                              → records payment_intent.succeeded
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV=sandbox|live,
//      ALLOWED_ORIGIN (your site), SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (set by Supabase), ORDERS_IN_DB=true once market_orders is populated.
//
// Money safety: the amount must come from the order record, not the browser. Until ORDERS_IN_DB=true this function
// trusts the client amount, so it refuses live keys (sk_live_ / PAYPAL_ENV=live) and only runs in test/sandbox mode.

const env = (k: string) => Deno.env.get(k) ?? "";
const cors = { "access-control-allow-origin": env("ALLOWED_ORIGIN") || "*", "access-control-allow-headers": "content-type, authorization, apikey, stripe-signature", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const isLive = () => env("STRIPE_SECRET_KEY").startsWith("sk_live_") || env("PAYPAL_ENV") === "live";

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "content-type": "application/json", prefer: "return=representation", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`db ${r.status}: ${await r.text()}`);
  return r.json();
}

// The amount to charge, in dollars. From the order row when orders live in the DB; otherwise the client's figure (test mode only).
async function expectedAmount(orderId: string, kind: string, claimed: number): Promise<number> {
  if (env("ORDERS_IN_DB") === "true") {
    const [o] = await db(`market_orders?id=eq.${encodeURIComponent(orderId)}&select=price,deposit_pct,status`);
    if (!o) throw new Error("Unknown order");
    const dep = Math.round(o.price * o.deposit_pct / 100);
    if (kind === "deposit" && o.status !== "agreed") throw new Error("Order isn't waiting for a deposit");
    if (kind === "balance" && o.status !== "final_due") throw new Error("Order isn't waiting for the balance");
    return kind === "deposit" ? dep : o.price - dep;
  }
  if (isLive()) throw new Error("Live keys need ORDERS_IN_DB=true so amounts come from the server");
  if (!Number.isFinite(claimed) || claimed < 1 || claimed > 100000) throw new Error("Bad amount");
  return Math.round(claimed);
}

async function record(p: { order_id: string; kind: string; amount: number; method: string; ref: string; mode: string }) {
  if (!env("SUPABASE_SERVICE_ROLE_KEY")) return;
  await db("market_payments?on_conflict=ref", { method: "POST", headers: { prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ ...p, status: "succeeded" }) }).catch(() => {});
}

/* ---------- Stripe ---------- */
async function stripe(path: string, params: Record<string, string>) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error?.message ?? "Stripe error"); return j;
}
async function verifyStripe(payload: string, header: string) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("STRIPE_WEBHOOK_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${payload}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new Error("Bad signature");
}

/* ---------- PayPal ---------- */
const ppBase = () => env("PAYPAL_ENV") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
async function ppToken() {
  const r = await fetch(`${ppBase()}/v1/oauth2/token`, { method: "POST", headers: { authorization: "Basic " + btoa(`${env("PAYPAL_CLIENT_ID")}:${env("PAYPAL_SECRET")}`), "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description ?? "PayPal auth error"); return j.access_token as string;
}
async function pp(path: string, body: unknown) {
  const r = await fetch(`${ppBase()}${path}`, { method: "POST", headers: { authorization: `Bearer ${await ppToken()}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.message ?? "PayPal error"); return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const sigHeader = req.headers.get("stripe-signature");
    if (sigHeader) { // Stripe webhook
      const payload = await req.text(); await verifyStripe(payload, sigHeader);
      const ev = JSON.parse(payload);
      if (ev.type === "payment_intent.succeeded") { const pi = ev.data.object; await record({ order_id: pi.metadata.order_id, kind: pi.metadata.kind, amount: pi.amount / 100, method: "card", ref: pi.id, mode: pi.livemode ? "live" : "test" }); }
      return json({ received: true });
    }
    const b = await req.json();
    if (!b.orderId || !["deposit", "balance"].includes(b.kind)) return json({ error: "orderId and kind required" }, 400);
    if (b.action === "stripe_intent") {
      const amount = await expectedAmount(b.orderId, b.kind, Number(b.amount));
      const pi = await stripe("payment_intents", { amount: String(amount * 100), currency: "usd", "automatic_payment_methods[enabled]": "true", transfer_group: b.orderId, "metadata[order_id]": b.orderId, "metadata[kind]": b.kind, description: `Promptflix ${b.kind} · ${b.orderId}` });
      return json({ clientSecret: pi.client_secret, id: pi.id });
    }
    if (b.action === "paypal_create") {
      const amount = await expectedAmount(b.orderId, b.kind, Number(b.amount));
      const o = await pp("/v2/checkout/orders", { intent: "CAPTURE", purchase_units: [{ reference_id: b.orderId, custom_id: b.kind, description: `Promptflix ${b.kind}`, amount: { currency_code: "USD", value: amount.toFixed(2) } }] });
      return json({ id: o.id });
    }
    if (b.action === "paypal_capture") {
      const c = await pp(`/v2/checkout/orders/${encodeURIComponent(b.paypalOrderId)}/capture`, {});
      const cap = c.purchase_units?.[0]?.payments?.captures?.[0];
      if (c.status === "COMPLETED" && cap) await record({ order_id: b.orderId, kind: b.kind, amount: Number(cap.amount.value), method: "paypal", ref: cap.id, mode: env("PAYPAL_ENV") === "live" ? "live" : "test" });
      return json({ status: c.status, captureId: cap?.id });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
