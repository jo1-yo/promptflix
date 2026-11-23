// Rolvo Market — payments server (Supabase Edge Function, Deno).
// Deploy: supabase functions deploy payments --no-verify-jwt   (see README.md → Going live)
//
// Actions (POST JSON):
//   { action: "stripe_intent",  orderId, kind: "deposit"|"balance", amount, currency }  → { clientSecret, id }
//   { action: "paypal_create",  orderId, kind, amount, currency }                         → { id }
//   { action: "paypal_capture", paypalOrderId, orderId, kind }                            → { status, captureId }
//   Stripe webhook (Stripe-Signature header)                                              → records payment_intent.succeeded
//
// Creator payouts — Stripe Connect, Express accounts. These need the caller's Supabase session (Authorization: Bearer <access token>):
//   { action: "connect_onboard", country, returnUrl }   → { url }   Stripe's hosted page: identity + bank account or debit card
//   { action: "connect_status" }                        → { ready, submitted, available, pending, instant, method }
//   { action: "connect_dashboard" }                     → { url }   Stripe Express dashboard (change bank / card, see payouts)
//   { action: "connect_payout", amount, instant }       → { id, status, arrival }   "Withdraw": from the creator's Stripe balance to their bank / card
//   { action: "connect_release", orderId, kind, amount, creatorId } → { id }   escrow → creator, minus commission (test mode only for now)
//
// The charge is "separate charges and transfers": the client's payment lands in the platform balance (the escrow) tagged with
// transfer_group = order id; a release is a Transfer to the creator's connected account. Card and bank numbers only ever go to Stripe.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV=sandbox|live,
//      ALLOWED_ORIGIN (your site), SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (set by Supabase), ORDERS_IN_DB=true once market_orders is populated.
//      COMMISSION_PCT (default 1), CARD_FEE_PCT (default 2.9), CARD_FEE_FIXED (default 0.30) — keep in step with FEES in store.js.
//
// Money safety: amounts and releases must come from the order record, not the browser. Until ORDERS_IN_DB=true this function
// trusts the client amount, so it refuses live keys (sk_live_ / PAYPAL_ENV=live) and only runs in test/sandbox mode.
// connect_release is test-mode only until order state changes happen on the server.

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

const num = (k: string, d: number) => { const v = Number(env(k)); return env(k) !== "" && Number.isFinite(v) ? v : d; };
// What the client is charged, in cents: the order amount plus the card fee, grossed up so the order amount arrives whole.
const withCardFee = (amount: number) => Math.round(((amount + num("CARD_FEE_FIXED", 0.30)) / (1 - num("CARD_FEE_PCT", 2.9) / 100)) * 100);

// Who is calling: the Supabase session token → their market_profiles row.
async function caller(req: Request) {
  const r = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), authorization: req.headers.get("authorization") ?? "" } });
  if (!r.ok) throw new Error("Sign in first");
  const u = await r.json();
  const [p] = await db(`market_profiles?id=eq.${encodeURIComponent(u.id)}&select=id,role,email,stripe_account`);
  if (!p) throw new Error("No account record for this sign-in");
  return p as { id: string; role: string | null; email: string | null; stripe_account: string | null };
}
const creatorOnly = (p: { role: string | null }) => { if (p.role !== "creator") throw new Error("Creator accounts only"); };
const usd = (list: { amount: number; currency: string }[] = []) => list.filter((x) => x.currency === "usd").reduce((n, x) => n + x.amount, 0) / 100;

async function record(p: { order_id: string; kind: string; amount: number; method: string; ref: string; mode: string }) {
  if (!env("SUPABASE_SERVICE_ROLE_KEY")) return;
  await db("market_payments?on_conflict=ref", { method: "POST", headers: { prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ ...p, status: "succeeded" }) }).catch(() => {});
}

/* ---------- Stripe ---------- */
// o.account = act as that connected account (Stripe-Account header); o.idem = idempotency key so a retry can't pay twice.
async function stripe(path: string, params: Record<string, string> = {}, o: { get?: boolean; account?: string; idem?: string } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "content-type": "application/x-www-form-urlencoded" };
  if (o.account) headers["stripe-account"] = o.account;
  if (o.idem) headers["idempotency-key"] = o.idem;
  const r = await fetch(`https://api.stripe.com/v1/${path}`, o.get ? { headers } : { method: "POST", headers, body: new URLSearchParams(params) });
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
      if (ev.type === "payment_intent.succeeded") { const pi = ev.data.object; await record({ order_id: pi.metadata.order_id, kind: pi.metadata.kind, amount: Number(pi.metadata.order_amount) || pi.amount / 100, method: "card", ref: pi.id, mode: pi.livemode ? "live" : "test" }); }
      return json({ received: true });
    }
    const b = await req.json();

    /* ----- creator payouts (Stripe Connect) ----- */
    if (b.action === "connect_onboard") {
      const p = await caller(req); creatorOnly(p);
      const back = String(b.returnUrl ?? ""); const origin = env("ALLOWED_ORIGIN");
      if (!/^https?:\/\//.test(back) || (origin && !back.startsWith(origin))) throw new Error("Bad return address");
      let acct = p.stripe_account;
      if (!acct) {
        const country = String(b.country ?? "US").toUpperCase(); if (!/^[A-Z]{2}$/.test(country)) throw new Error("Bad country");
        const a = await stripe("accounts", { type: "express", country, ...(p.email ? { email: p.email } : {}), "capabilities[transfers][requested]": "true",
          ...(country !== "US" ? { "tos_acceptance[service_agreement]": "recipient" } : {}),   // cross-border: the account only receives transfers
          "settings[payouts][schedule][interval]": "manual",                                   // money stays in their balance until they press Withdraw
          "metadata[user_id]": p.id }, { idem: `acct:${p.id}` });
        acct = a.id as string;
        await db(`market_profiles?id=eq.${encodeURIComponent(p.id)}`, { method: "PATCH", body: JSON.stringify({ stripe_account: acct, payout_country: country }) });
      }
      const link = await stripe("account_links", { account: acct!, refresh_url: back, return_url: back, type: "account_onboarding" });
      return json({ url: link.url });
    }
    if (b.action === "connect_status") {
      const p = await caller(req); creatorOnly(p);
      if (!p.stripe_account) return json({ ready: false, submitted: false, available: 0, pending: 0, instant: 0, method: null });
      const a = await stripe(`accounts/${p.stripe_account}`, {}, { get: true });
      const bal = await stripe("balance", {}, { get: true, account: p.stripe_account });
      const ext = a.external_accounts?.data?.[0];
      await db(`market_profiles?id=eq.${encodeURIComponent(p.id)}`, { method: "PATCH", body: JSON.stringify({ payouts_ready: !!a.payouts_enabled }) }).catch(() => {});
      return json({ ready: !!a.payouts_enabled, submitted: !!a.details_submitted, available: usd(bal.available), pending: usd(bal.pending), instant: usd(bal.instant_available),
        method: ext ? { kind: ext.object === "card" ? "card" : "bank", label: ext.object === "card" ? `${ext.brand} debit` : (ext.bank_name ?? "Bank account"), last4: ext.last4 } : null });
    }
    if (b.action === "connect_dashboard") {
      const p = await caller(req); creatorOnly(p); if (!p.stripe_account) throw new Error("Add a payout method first");
      const l = await stripe(`accounts/${p.stripe_account}/login_links`, {});
      return json({ url: l.url });
    }
    if (b.action === "connect_payout") {
      const p = await caller(req); creatorOnly(p); if (!p.stripe_account) throw new Error("Add a payout method first");
      const amount = Number(b.amount); if (!Number.isFinite(amount) || amount < 1) throw new Error("Bad amount");
      // Stripe refuses anything above the available balance, so the balance can't be overdrawn from here.
      const po = await stripe("payouts", { amount: String(Math.round(amount * 100)), currency: "usd", method: b.instant ? "instant" : "standard", description: "Rolvo withdrawal" }, { account: p.stripe_account });
      return json({ id: po.id, status: po.status, arrival: po.arrival_date });
    }
    if (b.action === "connect_release") {
      await caller(req);
      if (isLive() || env("ORDERS_IN_DB") === "true") throw new Error("Releases are test-mode only until order state changes run on the server");
      if (!b.orderId || !["deposit", "balance"].includes(b.kind)) throw new Error("orderId and kind required");
      const amount = Number(b.amount); if (!Number.isFinite(amount) || amount < 1 || amount > 100000) throw new Error("Bad amount");
      const [c] = await db(`market_profiles?local_id=eq.${encodeURIComponent(String(b.creatorId))}&role=eq.creator&select=stripe_account`);
      if (!c?.stripe_account) throw new Error("The creator hasn't added a payout method yet; the money stays in escrow");
      const net = Math.round(amount * (1 - num("COMMISSION_PCT", 1) / 100) * 100);
      const t = await stripe("transfers", { amount: String(net), currency: "usd", destination: c.stripe_account, transfer_group: b.orderId, "metadata[order_id]": b.orderId, "metadata[kind]": b.kind }, { idem: `release:${b.orderId}:${b.kind}` });
      return json({ id: t.id });
    }

    if (!b.orderId || !["deposit", "balance"].includes(b.kind)) return json({ error: "orderId and kind required" }, 400);
    if (b.action === "stripe_intent") {
      const amount = await expectedAmount(b.orderId, b.kind, Number(b.amount));
      const pi = await stripe("payment_intents", { amount: String(withCardFee(amount)), currency: "usd", "metadata[order_amount]": String(amount), "automatic_payment_methods[enabled]": "true", transfer_group: b.orderId, "metadata[order_id]": b.orderId, "metadata[kind]": b.kind, description: `Rolvo ${b.kind} · ${b.orderId}` });
      return json({ clientSecret: pi.client_secret, id: pi.id });
    }
    if (b.action === "paypal_create") {
      const amount = await expectedAmount(b.orderId, b.kind, Number(b.amount));
      const o = await pp("/v2/checkout/orders", { intent: "CAPTURE", purchase_units: [{ reference_id: b.orderId, custom_id: b.kind, description: `Rolvo ${b.kind}`, amount: { currency_code: "USD", value: (withCardFee(amount) / 100).toFixed(2) } }] });
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
