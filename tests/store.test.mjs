// The order and escrow rules in store.js. These are the rules that must survive the move to Supabase unchanged:
// when that happens, point the same cases at the RPCs.
import test from "node:test";
import assert from "node:assert/strict";
import { loadStore } from "./helpers.mjs";

const sum = (rows, pick) => Math.round(rows.filter(pick).reduce((n, t) => n + t.amount, 0) * 100) / 100;

/** A client, a creator and an order both sides have agreed on (status "agreed"). */
function agreedOrder(price = 2000){
  const s = loadStore("merchant");
  const client = s.DB.signIn("buyer@example.com");
  const creator = s.DB.roster()[0];
  const o = s.DB.createOrder({ clientId: client.id, creatorId: creator.id, title: "Launch film", brief: "30 seconds", price });
  s.DB.acceptTerms(o.id, creator.id);
  return { ...s, client, creator, o };
}

test("an order needs both sides to accept before it can be paid", () => {
  const s = loadStore("merchant");
  const client = s.DB.signIn("buyer@example.com");
  const o = s.DB.createOrder({ clientId: client.id, creatorId: s.DB.roster()[0].id, title: "Launch film", brief: "", price: 1000 });
  assert.equal(o.status, "negotiating");
  s.DB.payDeposit(o.id);
  assert.equal(o.status, "negotiating", "a deposit can't open an order nobody agreed to");
  assert.equal(s.DB.state.ledger.length, 0);
});

test("a completed order: every dollar the client paid is accounted for", () => {
  const { DB, FEES, creator, client, o } = agreedOrder(2000);
  assert.equal(o.status, "agreed");
  assert.equal(DB.deposit(o) + DB.balance(o), 2000);

  DB.payDeposit(o.id);                       assert.equal(o.status, "in_production"); assert.equal(o.escrow.deposit, "held");
  DB.payBalance(o.id);                       assert.equal(o.status, "in_production", "the balance isn't due yet");
  DB.deliver(o.id, { url: "https://example.com/cut1" });  assert.equal(o.status, "trial_review");
  DB.decide(o.id, "approve");                assert.equal(o.status, "revising"); assert.equal(o.escrow.deposit, "released");
  DB.deliver(o.id, { url: "https://example.com/cut2" });
  DB.decide(o.id, "approve");                assert.equal(o.status, "final_due");
  DB.payBalance(o.id);                       assert.equal(o.status, "completed"); assert.equal(o.escrow.balance, "released");

  const L = DB.state.ledger;
  const paidIn = sum(L, t => t.from === client.id && t.to === "escrow");
  const toCreator = sum(L, t => t.to === creator.id);
  const commission = sum(L, t => t.type === "commission");
  assert.equal(paidIn, 2000);
  assert.equal(commission, 2000 * FEES.commission);
  assert.equal(Math.round((toCreator + commission) * 100) / 100, paidIn, "escrow ends empty: creator + commission = what the client paid");
  assert.equal(DB.wallet(creator.id).available, toCreator);
});

test("a failed first cut refunds the whole deposit and pays nobody", () => {
  const { DB, creator, client, o } = agreedOrder(1000);
  DB.payDeposit(o.id);
  DB.deliver(o.id, { url: "https://example.com/cut1" });
  DB.decide(o.id, "reject", "Not the brief");
  assert.equal(o.status, "cancelled"); assert.equal(o.escrow.deposit, "refunded");
  const L = DB.state.ledger;
  assert.equal(sum(L, t => t.type === "deposit_refund" && t.to === client.id), DB.deposit(o));
  assert.equal(sum(L, t => t.to === creator.id), 0);
  assert.equal(sum(L, t => t.type === "commission"), 0);
});

test("revisions stop at the agreed count", () => {
  const { DB, o } = agreedOrder(1000);
  DB.payDeposit(o.id); DB.deliver(o.id, { url: "u" }); DB.decide(o.id, "approve");
  for (let i = 0; i < o.terms.revisions + 2; i++){ DB.deliver(o.id, { url: "u" + i }); DB.decide(o.id, "revise", "again"); }
  assert.equal(o.revisionsUsed, o.terms.revisions);
});

test("the card fee is grossed up so the order amount arrives whole", () => {
  const { FEES, cardFee } = loadStore();
  for (const amt of [1, 30, 99.5, 600, 1400, 25000]){
    const charged = amt + cardFee(amt);
    const left = charged - (charged * FEES.card[0] + FEES.card[1]);
    assert.ok(Math.abs(left - amt) < 0.01, `$${amt}: after the processor's cut $${left.toFixed(4)} is left`);
  }
});

test("one login can be a client and a creator, as two separate accounts", () => {
  const asClient = loadStore("merchant").DB.signIn("both@example.com");
  const asCreator = loadStore("creator").DB.signIn("both@example.com");
  assert.equal(asClient.role, "client");
  assert.ok(Array.isArray(asCreator.works), "the creator side is a creator record");
});

test("the admin console opens only for an account that is already an admin", () => {
  const { DB } = loadStore("admin", { adminEmails: ["team@rolvo.demo"] });
  assert.equal(DB.signIn("stranger@example.com"), null);
});
