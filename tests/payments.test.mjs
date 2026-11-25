// The payments Edge Function, with Supabase, Stripe and PayPal stubbed. Nothing here touches the network.
import test from "node:test";
import assert from "node:assert/strict";
import { loadPayments, loadStore, stripeSignature } from "./helpers.mjs";

const BASE = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", STRIPE_SECRET_KEY: "sk_test_x", PAYPAL_ENV: "sandbox" };
const succeeded = JSON.stringify({ type: "payment_intent.succeeded", data: { object: { id: "pi_1", amount: 61833, livemode: false, metadata: { order_id: "ord_a", kind: "deposit", order_amount: "600" } } } });
const recorded = f => f.calls.filter(c => c.url.includes("market_payments")).map(c => JSON.parse(c.init.body));

test("webhook: refused when no webhook secret is set", async () => {
  const f = loadPayments(BASE, [["market_payments", () => []]]);
  const r = await f.post(succeeded, { "stripe-signature": await stripeSignature(succeeded, "anything") });
  assert.equal(r.status, 400); assert.match(r.body.error, /Webhook secret not set/);
  assert.equal(recorded(f).length, 0, "an unsigned 'payment succeeded' must not be recorded");
});

test("webhook: a wrong or stale signature is refused, a good one records the payment once", async () => {
  const env = { ...BASE, STRIPE_WEBHOOK_SECRET: "whsec_test" };
  const bad = loadPayments(env, [["market_payments", () => []]]);
  assert.equal((await bad.post(succeeded, { "stripe-signature": await stripeSignature(succeeded, "whsec_other") })).status, 400);
  assert.equal((await bad.post(succeeded, { "stripe-signature": await stripeSignature(succeeded, "whsec_test", Math.floor(Date.now() / 1000) - 3600) })).status, 400);
  assert.equal((await bad.post(succeeded, { "stripe-signature": "v1=abc" })).status, 400);
  assert.equal(recorded(bad).length, 0);

  const ok = loadPayments(env, [["market_payments", () => []]]);
  const r = await ok.post(succeeded, { "stripe-signature": await stripeSignature(succeeded, "whsec_test") });
  assert.equal(r.status, 200);
  assert.deepEqual(recorded(ok), [{ order_id: "ord_a", kind: "deposit", amount: 600, method: "card", ref: "pi_1", mode: "test", status: "succeeded" }]);
});

test("webhook: if the payment can't be written, Stripe is told to send it again", async () => {
  const f = loadPayments({ ...BASE, STRIPE_WEBHOOK_SECRET: "whsec_test" }, [["market_payments", () => new Response("down", { status: 503 })]]);
  const r = await f.post(succeeded, { "stripe-signature": await stripeSignature(succeeded, "whsec_test") });
  assert.notEqual(r.status, 200);
});

test("PayPal capture is recorded against the order PayPal was paid for, not the one the browser names", async () => {
  const f = loadPayments({ ...BASE, PAYPAL_CLIENT_ID: "id", PAYPAL_SECRET: "s" }, [
    ["/v1/oauth2/token", () => ({ access_token: "t" })],
    ["/capture", () => ({ status: "COMPLETED", purchase_units: [{ reference_id: "ord_cheap", payments: { captures: [{ id: "cap_1", custom_id: "deposit", amount: { value: "31.20" } }] } }] })],
    ["market_payments", () => []],
  ]);
  const r = await f.post({ action: "paypal_capture", paypalOrderId: "PP1", orderId: "ord_expensive", kind: "balance" });
  assert.equal(r.status, 200);
  const [row] = recorded(f);
  assert.equal(row.order_id, "ord_cheap");
  assert.equal(row.kind, "deposit");
});

test("payouts: the creator side is is_creator, whichever side the login joined first", async () => {
  const profile = p => [["/auth/v1/user", () => ({ id: "u1" })], ["market_profiles", () => [{ id: "u1", email: "a@b.c", stripe_account: null, ...p }]]];
  const both = loadPayments(BASE, profile({ role: "client", is_creator: true }));
  assert.equal((await both.post({ action: "connect_status" }, { authorization: "Bearer x" })).status, 200);
  const clientOnly = loadPayments(BASE, profile({ role: "client", is_creator: false }));
  const r = await clientOnly.post({ action: "connect_status" }, { authorization: "Bearer x" });
  assert.equal(r.status, 400); assert.match(r.body.error, /Creator accounts only/);
});

test("payouts: no session, no answer", async () => {
  const f = loadPayments(BASE, [["/auth/v1/user", () => new Response("{}", { status: 401 })]]);
  for (const action of ["connect_onboard", "connect_status", "connect_dashboard", "connect_payout", "connect_release"])
    assert.equal((await f.post({ action })).status, 400, action);
  assert.equal(f.calls.filter(c => c.url.includes("stripe.com")).length, 0);
});

test("a release looks the creator up on the creator side of the account", async () => {
  const f = loadPayments(BASE, [
    ["/auth/v1/user", () => ({ id: "u1" })],
    ["creator_local_id=eq.c_abc", () => [{ stripe_account: "acct_1" }]],
    ["market_profiles", () => [{ id: "u1", role: "client", is_creator: false, stripe_account: null }]],
    ["stripe.com/v1/transfers", () => ({ id: "tr_1" })],
  ]);
  const r = await f.post({ action: "connect_release", orderId: "ord_a", kind: "deposit", amount: 600, creatorId: "c_abc" }, { authorization: "Bearer x" });
  assert.deepEqual(r, { status: 200, body: { id: "tr_1" } });
  const sent = new URLSearchParams(f.calls.find(c => c.url.includes("transfers")).init.body);
  assert.equal(sent.get("amount"), "59400", "$600 minus 1% commission, in cents");
  assert.equal(sent.get("destination"), "acct_1");
});

test("live keys are refused while amounts still come from the browser", async () => {
  const f = loadPayments({ ...BASE, STRIPE_SECRET_KEY: "sk_live_x" }, []);
  const r = await f.post({ action: "stripe_intent", orderId: "ord_a", kind: "deposit", amount: 600 });
  assert.equal(r.status, 400); assert.match(r.body.error, /ORDERS_IN_DB/);
  assert.equal(f.calls.length, 0);
  const rel = loadPayments({ ...BASE, STRIPE_SECRET_KEY: "sk_live_x" }, [["/auth/v1/user", () => ({ id: "u1" })], ["market_profiles", () => [{ id: "u1" }]]]);
  assert.equal((await rel.post({ action: "connect_release", orderId: "ord_a", kind: "deposit", amount: 600, creatorId: "c" }, { authorization: "Bearer x" })).status, 400);
});

test("the function charges exactly what the site shows (FEES in store.js = the function's defaults)", () => {
  const { FEES, cardFee } = loadStore();
  const f = loadPayments(BASE);
  for (const amt of [1, 30, 600, 1400, 25000])
    assert.equal(f.get("withCardFee")(amt), Math.round((amt + cardFee(amt)) * 100), `card charge for a $${amt} order`);
  assert.equal(f.get("num")("COMMISSION_PCT", 1), FEES.commission * 100);
});
