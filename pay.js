/* Rolvo Market — money in and money out.
   In (pay): the client pays the order amount plus the card processing fee (FEES.card). Live: Stripe Payment Element; the server
   function (CONFIG.paymentsUrl → server/functions/payments) works out the amount and makes the PaymentIntent. The money sits in
   the platform's Stripe balance until a release. PayPal only appears if paypalClientId is set, and PayPal money can't be paid
   out through Stripe, so leave it off while creators are paid with Stripe Connect.
   Out (Payouts): each creator has a Stripe Connect Express account. Stripe's own pages collect their bank account or debit card
   and ID; releases are transfers into that account; "Withdraw" is a payout from it. Rolvo never sees card or bank numbers.
   Demo (no keys): the same screens over the local ledger, nothing charged or sent. */
const loaded = {};
const loadScript = src => loaded[src] ||= new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => { delete loaded[src]; fail(new Error("Couldn't load " + src)); }; document.head.append(s); });
async function payApi(body){
  let token = CONFIG.supabaseKey; const sb = typeof Auth !== "undefined" && Auth.client();   // the signed-in session tells the server who is asking
  if (sb){ const { data } = await sb.auth.getSession(); if (data.session) token = data.session.access_token; }
  const r = await fetch(CONFIG.paymentsUrl, { method: "POST", headers: { "content-type": "application/json", ...(CONFIG.supabaseKey ? { apikey: CONFIG.supabaseKey, authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Payment server error (" + r.status + ")"); return j;
}
const payIcon = which => { const s = h("span", { class: "pmicon", "aria-hidden": "true" }); s.innerHTML = which === "card"
  ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/></svg>'
  : '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#009cde" d="M9.4 21H5.9a.6.6 0 0 1-.6-.7L7.9 3.6c.1-.4.4-.6.8-.6h6c2.9 0 4.8 1.6 4.3 4.5-.6 3.6-3 5.2-6.4 5.2h-1.6c-.4 0-.7.3-.8.7z"/><path fill="#012169" d="M17.6 7.9c.9.6 1.4 1.7 1.1 3.3-.5 3.1-2.6 4.6-5.6 4.6h-.6c-.4 0-.7.3-.8.7l-.8 4.5H8a.5.5 0 0 1-.5-.6l.3-1.7"/></svg>'; return s; };

function pay(o, amt, label, done){
  // A browser-only order whose form says "Rolvo Wallet" is paid from the demo wallet in this browser.
  if (!o.cloud && o.terms && o.terms.method === "wallet" && Wallet.local && !pay.skipWallet) return Wallet.load().then(w => {
    const short = cents(amt - w.balance);
    openSheet([phead(label + " · " + money(amt), o.title),
      h("div", { class: "kv" }, h("dt", null, label), h("dd", null, money(amt)), h("dt", null, "From"), h("dd", null, "Rolvo Wallet · demo"), h("dt", null, "Balance"), h("dd", null, money(w.balance))),
      short > 0 ? h("button", { class: "btn primary big", onclick: () => Wallet.sheet(() => pay(o, amt, label, done), short) }, "Add " + money(short) + " to pay")
        : h("button", { class: "btn primary big", onclick: () => { Wallet.spendLocal(amt, o.title); done({ method: "wallet", ref: "wallet_demo_" + Math.random().toString(36).slice(2, 8), mode: "demo", fee: 0 }); closeSheet(); toast(label + " paid from your wallet (demo)."); render(); } }, "Pay " + money(amt)),
      h("p", { class: "hint" }, "Demo balance. No real money moves.")]);
  });
  let method = "card"; let stripeEls = null;
  const fee = cardFee(amt), total = cents(amt + fee);
  const body = h("div", { class: "paybody" });
  const finish = pm => { done({ ...pm, fee }); closeSheet(); toast(label + " paid with " + (pm.method === "paypal" ? "PayPal" : "card") + ". Held in escrow."); render(); };
  const busy = (btn, on, text) => { btn.disabled = on; if (text) btn.textContent = text; };
  const draw = async () => {
    body.replaceChildren();
    if (method === "card"){
      if (LIVE.stripe){
        const mount = h("div", { class: "stripe-el" }, h("p", { class: "hint" }, "Loading secure card form…"));
        const btn = h("button", { class: "btn primary big", disabled: true }, "Pay " + money(total));
        const err = h("p", { class: "hint warn" });
        body.append(mount, err, btn);
        try {
          await loadScript("https://js.stripe.com/v3/");
          const { clientSecret } = await payApi({ action: "stripe_intent", orderId: o.id, kind: label.toLowerCase(), amount: amt, currency: "usd" });
          const stripe = Stripe(CONFIG.stripePk);
          stripeEls = stripe.elements({ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#26251e", colorBackground: "#ffffff", colorText: "#26251e", borderRadius: "6px", fontFamily: "system-ui, sans-serif" } } });
          mount.replaceChildren(); stripeEls.create("payment", { layout: "tabs" }).mount(mount); btn.disabled = false;
          btn.onclick = async () => { busy(btn, true, "Processing…"); err.textContent = "";
            const { error, paymentIntent } = await stripe.confirmPayment({ elements: stripeEls, redirect: "if_required" });
            if (error) { err.textContent = error.message; return busy(btn, false, "Pay " + money(total)); }
            if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) finish({ method: "card", ref: paymentIntent.id, mode: "live" });
            else busy(btn, false, "Pay " + money(total)); };
        } catch (e) { mount.replaceChildren(); err.textContent = e.message; }
      } else {
        const btn = h("button", { class: "btn primary big", onclick: () => { busy(btn, true, "Processing…"); setTimeout(() => finish({ method: "card", ref: "pi_demo_" + Math.random().toString(36).slice(2, 10), mode: "demo" }), 900); } }, "Pay " + money(total) + " by card");
        body.append(h("div", { class: "demo-pay" }, payIcon("card"), h("div", null, h("b", null, "Stripe isn't connected yet"), h("span", null, "Live, a Stripe card form appears here (Visa, Mastercard, Amex, Apple Pay, Google Pay). Nothing is charged in demo mode."))), btn);
      }
    } else {
      if (LIVE.paypal){
        const mount = h("div", { class: "pp-el" }, h("p", { class: "hint" }, "Loading PayPal…")); const err = h("p", { class: "hint warn" });
        body.append(mount, err);
        try {
          await loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONFIG.paypalClientId)}&currency=USD&intent=capture&components=buttons&disable-funding=card,credit,paylater,venmo`);
          mount.replaceChildren();
          paypal.Buttons({ style: { layout: "vertical", color: "black", shape: "rect", label: "pay", height: 46 },
            createOrder: async () => (await payApi({ action: "paypal_create", orderId: o.id, kind: label.toLowerCase(), amount: amt, currency: "USD" })).id,
            onApprove: async d => { const r = await payApi({ action: "paypal_capture", paypalOrderId: d.orderID, orderId: o.id, kind: label.toLowerCase() });
              if (r.status === "COMPLETED") finish({ method: "paypal", ref: r.captureId || d.orderID, mode: "live" }); else err.textContent = "PayPal didn't complete the payment (" + r.status + ")."; },
            onError: e => { err.textContent = (e && e.message) || "PayPal error."; } }).render(mount);
        } catch (e) { mount.replaceChildren(); err.textContent = e.message; }
      } else {
        const btn = h("button", { class: "btn big ppbtn", onclick: () => { busy(btn, true, "Waiting for PayPal approval…"); setTimeout(() => finish({ method: "paypal", ref: "PAYID-DEMO-" + Math.random().toString(36).slice(2, 8).toUpperCase(), mode: "demo" }), 1100); } }, payIcon("paypal"), "Pay with PayPal");
        body.append(h("div", { class: "demo-pay" }, payIcon("paypal"), h("div", null, h("b", null, "PayPal isn't connected yet"), h("span", null, "Live, this opens PayPal to approve, then we capture the payment server-side. Nothing is charged in demo mode."))), btn);
      }
    }
  };
  const seg = !CONFIG.paypalClientId ? null : h("div", { class: "seg pm", role: "tablist" }, ...[["card", "Card"], ["paypal", "PayPal"]].map(([k, l]) => h("button", { type: "button", role: "tab", "aria-selected": String(method === k), onclick: e => { method = k; for (const b of seg.children) b.setAttribute("aria-selected", String(b === e.currentTarget)); draw(); } }, payIcon(k), l)));
  openSheet([phead(label + " · " + money(amt), o.title),
    h("div", { class: "kv" }, h("dt", null, label), h("dd", null, money(amt)), h("dt", null, "Card processing"), h("dd", null, money(fee)), h("dt", null, "Total today"), h("dd", null, h("b", { style: { fontWeight: 500 } }, money(total))),
      h("dt", null, "Paid to"), h("dd", null, "Rolvo escrow, not the creator"), h("dt", null, "Released"), h("dd", null, label === "Deposit" ? "to " + DB.nameOf(o.creatorId) + " when you pass the first cut; refunded if it fails" : "to " + DB.nameOf(o.creatorId) + " now, with the clean master")),
    ...(seg ? [seg] : []), body,
    h("p", { class: "hint" }, "Card processing is the payment processor's fee, passed on at cost. Cards are handled by Stripe; Rolvo never sees your card number.")]);
  draw();
}

/* ---------- money out ---------- */
const Payouts = {
  live(){ return LIVE.stripe; },
  /* { available, pending, earned, withdrawn, method: { kind, label, last4, instant } | null, ready, mode } */
  async status(c){
    const w = DB.wallet(c.id);
    if (!this.live()) return { ...w, method: c.payout || null, ready: !!c.payout, mode: "demo" };
    const s = await payApi({ action: "connect_status" });   // balances and payout method come from Stripe, not from this browser
    return { available: s.available || 0, pending: cents((s.pending || 0) + w.pending), earned: w.earned, withdrawn: w.withdrawn,
      method: s.method ? { ...s.method, instant: s.method.kind === "card" } : null, ready: !!s.ready, submitted: !!s.submitted, mode: "live" };
  },
  async setup(country){ const { url } = await payApi({ action: "connect_onboard", country, returnUrl: location.href }); location.href = url; },   // Stripe's hosted onboarding
  async manage(){ const { url } = await payApi({ action: "connect_dashboard" }); window.open(url, "_blank", "noopener"); },
  /* returns an error message, or null when the withdrawal went through */
  async withdraw(c, amount, instant){
    if (!this.live()) return DB.withdraw(c.id, amount, instant);
    try {
      const r = await payApi({ action: "connect_payout", amount, instant });
      const fee = instant ? cents(amount * FEES.instant) : 0;
      DB.ledger({ type: "payout", amount: cents(amount), fee, net: cents(amount - fee), from: c.id, to: "bank", speed: instant ? "instant" : "standard", method: "Stripe", status: r.status, ref: r.id, mode: "live" });
      DB.save(); return null;
    } catch (e) { return e.message; }
  },
  onRelease(o, amt, type){
    if (!this.live()) return;
    payApi({ action: "connect_release", orderId: o.id, kind: type === "balance_release" ? "balance" : "deposit", amount: amt, creatorId: o.creatorId }).catch(e => toast("The release didn't reach Stripe: " + e.message));
  },
};

/* ---------- Rolvo Wallet (clients) ----------
   Money a client keeps on Rolvo to pay order forms in one tap. Signed in on the live site the balance comes from the database
   ledger (server/market.sql → Part 5) and only the database can take money out of it. Otherwise it is a demo ledger in this
   browser. mode: "demo" (pretend funds, labelled everywhere), "test" (Stripe test keys) or "live". */
const WALLET_UNIT = 200;   // the price of one typical short film, used to say what a top-up buys
const Wallet = {
  data: null, local: true,
  tag(mode){ return mode === "live" ? "" : mode === "test" ? "Test mode" : "Demo"; },
  buys(a){ const n = Math.floor(a / WALLET_UNIT); return n < 1 ? "" : money(a) + " covers " + n + " creator" + (n === 1 ? "" : "s") + " at " + money(WALLET_UNIT) + " each."; },
  rowsLocal(){ const u = DB.me(); return ((DB.state.cwallet ||= {})[u.id] ||= []); },
  async load(){
    const u = DB.me(); if (!u) return this.data = null;
    const sb = LIVE.auth && u.cloudId && Auth.client();
    if (sb){ const { data, error } = await sb.rpc("market_wallet");
      if (!error){ this.local = false; return this.data = { mode: data.mode, balance: Number(data.balance), rows: data.rows.map(r => ({ ...r, amount: Number(r.amount) })) }; }
      if (!chatSchemaMissing(error)) throw new Error(error.message); }
    const rows = this.rowsLocal(); this.local = true;
    return this.data = { mode: "demo", balance: cents(rows.reduce((n, r) => n + r.amount, 0)), rows: rows.slice().reverse() };
  },
  /* Demo funds. Real top-ups go through topUpCard and are written to the ledger by the payments function, never from here. */
  async addDemo(amount){
    if (this.local){ this.rowsLocal().push({ amount, kind: "topup", method: "demo", note: "Demo funds", created_at: now() }); DB.save(); }
    else { const { error } = await Auth.client().rpc("market_wallet_topup_demo", { p_amount: amount }); if (error) throw new Error(error.message); }
    return this.load();
  },
  spendLocal(amount, note){ this.rowsLocal().push({ amount: -amount, kind: "order", method: "wallet", note, created_at: now() }); DB.save(); },
  /* The top-up sheet. want = an amount to suggest (e.g. what an order is short by); then(wallet) runs after funds arrive. */
  async sheet(then, want){
    let w; try { w = await this.load(); } catch (e) { return toast("Couldn't load your wallet. " + e.message); }
    if (!w) return openSignIn(() => this.sheet(then, want));
    const demo = w.mode === "demo"; let amount = want ? Math.max(1, Math.ceil(want)) : 1000;
    const custom = h("input", { class: "i", type: "number", min: "1", max: "20000", step: "1", inputmode: "numeric", placeholder: "Other amount", "aria-label": "Other amount", oninput: () => { const v = Math.round(+custom.value); if (v > 0){ amount = v; draw(); } } });
    const chips = h("div", { class: "amts" }), buys = h("p", { class: "hint" }), btn = h("button", { class: "btn primary big", type: "button" }), slot = h("div");
    const draw = () => { chips.replaceChildren(...[200, 500, 1000].map(a => h("button", { type: "button", "aria-pressed": String(amount === a), onclick: () => { amount = a; custom.value = ""; draw(); } }, money(a))));
      buys.textContent = this.buys(amount); buys.hidden = !buys.textContent; btn.textContent = "Add " + money(amount) + (demo ? " demo funds" : ""); };
    const done = async () => { closeSheet(); toast(money(amount) + (demo ? " demo funds added." : " added to your wallet.")); if (then) then(this.data); else render(); };
    btn.onclick = async () => { if (!(amount >= 1 && amount <= 20000)) return toast("Add between $1 and $20,000."); btn.disabled = true;
      try { if (demo){ await this.addDemo(amount); return done(); } await this.topUpCard(amount, slot, btn, done); }
      catch (e) { btn.disabled = false; toast(e.message); } };
    draw();
    openSheet([phead("Add funds", "Rolvo Wallet · " + money(w.balance) + (this.tag(w.mode) ? " · " + this.tag(w.mode).toLowerCase() : "")), chips, custom, buys,
      demo ? h("div", { class: "demo-pay" }, payIcon("card"), h("div", null, h("b", null, "Demo mode"), h("span", null, "Payments aren't connected yet. No card is charged and no real money is added; demo funds only show how the wallet works."))) : null,
      slot, btn]);
  },
  /* Test / live: Stripe takes the card; the payments function credits the wallet when Stripe's webhook confirms it. */
  async topUpCard(amount, slot, btn, done){
    if (!LIVE.stripe) throw new Error("Top-ups aren't connected yet.");
    await loadScript("https://js.stripe.com/v3/");
    const { clientSecret } = await payApi({ action: "wallet_topup", amount });
    const stripe = Stripe(CONFIG.stripePk), els = stripe.elements({ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#26251e", borderRadius: "6px" } } });
    const mount = h("div", { class: "stripe-el" }), err = h("p", { class: "hint warn" }); slot.replaceChildren(mount, err); els.create("payment", { layout: "tabs" }).mount(mount);
    const before = this.data.balance; btn.disabled = false; btn.textContent = "Pay " + money(cents(amount + cardFee(amount)));
    btn.onclick = async () => { btn.disabled = true; err.textContent = "";
      const { error } = await stripe.confirmPayment({ elements: els, redirect: "if_required" });
      if (error){ err.textContent = error.message; btn.disabled = false; return; }
      btn.textContent = "Waiting for confirmation…";   // the ledger row is written by the webhook, so wait for it rather than assume
      for (let i = 0; i < 15; i++){ await new Promise(r => setTimeout(r, 1500)); if ((await this.load()).balance > before) return done(); }
      err.textContent = "The payment went through but hasn't reached your wallet yet. It will appear shortly."; };
  },
};
