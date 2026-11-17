/* Promptflix Market — checkout. Two ways to pay: card through Stripe, or PayPal. Money goes to Promptflix escrow, never to the creator directly.
   Live: Stripe Payment Element + PayPal Buttons; amounts are turned into a PaymentIntent / PayPal order by the server function
   (CONFIG.paymentsUrl → supabase/functions/payments). Demo: same sheet, no processor, a simulated confirmation.
   Either way `done({ method, ref, mode })` records the payment in the ledger. */
const loaded = {};
const loadScript = src => loaded[src] ||= new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => { delete loaded[src]; fail(new Error("Couldn't load " + src)); }; document.head.append(s); });
async function payApi(body){
  const r = await fetch(CONFIG.paymentsUrl, { method: "POST", headers: { "content-type": "application/json", ...(CONFIG.supabaseKey ? { apikey: CONFIG.supabaseKey, authorization: "Bearer " + CONFIG.supabaseKey } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Payment server error (" + r.status + ")"); return j;
}
const payIcon = which => { const s = h("span", { class: "pmicon", "aria-hidden": "true" }); s.innerHTML = which === "card"
  ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/></svg>'
  : '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#009cde" d="M9.4 21H5.9a.6.6 0 0 1-.6-.7L7.9 3.6c.1-.4.4-.6.8-.6h6c2.9 0 4.8 1.6 4.3 4.5-.6 3.6-3 5.2-6.4 5.2h-1.6c-.4 0-.7.3-.8.7z"/><path fill="#012169" d="M17.6 7.9c.9.6 1.4 1.7 1.1 3.3-.5 3.1-2.6 4.6-5.6 4.6h-.6c-.4 0-.7.3-.8.7l-.8 4.5H8a.5.5 0 0 1-.5-.6l.3-1.7"/></svg>'; return s; };

function pay(o, amt, label, done){
  let method = "card"; let stripeEls = null;
  const body = h("div", { class: "paybody" });
  const finish = pm => { done(pm); closeSheet(); toast(label + " paid with " + (pm.method === "paypal" ? "PayPal" : "card") + ". Held in escrow."); render(); };
  const busy = (btn, on, text) => { btn.disabled = on; if (text) btn.textContent = text; };
  const draw = async () => {
    body.replaceChildren();
    if (method === "card"){
      if (LIVE.stripe){
        const mount = h("div", { class: "stripe-el" }, h("p", { class: "hint" }, "Loading secure card form…"));
        const btn = h("button", { class: "btn primary big", disabled: true }, "Pay " + money(amt));
        const err = h("p", { class: "hint warn" });
        body.append(mount, err, btn);
        try {
          await loadScript("https://js.stripe.com/v3/");
          const { clientSecret } = await payApi({ action: "stripe_intent", orderId: o.id, kind: label.toLowerCase(), amount: amt, currency: "usd" });
          const stripe = Stripe(CONFIG.stripePk);
          stripeEls = stripe.elements({ clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#f2f0ea", colorBackground: "#141414", borderRadius: "10px", fontFamily: "Inter, system-ui, sans-serif" } } });
          mount.replaceChildren(); stripeEls.create("payment", { layout: "tabs" }).mount(mount); btn.disabled = false;
          btn.onclick = async () => { busy(btn, true, "Processing…"); err.textContent = "";
            const { error, paymentIntent } = await stripe.confirmPayment({ elements: stripeEls, redirect: "if_required" });
            if (error) { err.textContent = error.message; return busy(btn, false, "Pay " + money(amt)); }
            if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) finish({ method: "card", ref: paymentIntent.id, mode: "live" });
            else busy(btn, false, "Pay " + money(amt)); };
        } catch (e) { mount.replaceChildren(); err.textContent = e.message; }
      } else {
        const btn = h("button", { class: "btn primary big", onclick: () => { busy(btn, true, "Processing…"); setTimeout(() => finish({ method: "card", ref: "pi_demo_" + Math.random().toString(36).slice(2, 10), mode: "demo" }), 900); } }, "Pay " + money(amt) + " by card");
        body.append(h("div", { class: "demo-pay" }, payIcon("card"), h("div", null, h("b", null, "Stripe isn't connected yet"), h("span", null, "Live, a Stripe card form appears here (Visa, Mastercard, Amex, Apple Pay, Google Pay). Nothing is charged in demo mode."))), btn);
      }
    } else {
      if (LIVE.paypal){
        const mount = h("div", { class: "pp-el" }, h("p", { class: "hint" }, "Loading PayPal…")); const err = h("p", { class: "hint warn" });
        body.append(mount, err);
        try {
          await loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONFIG.paypalClientId)}&currency=USD&intent=capture&components=buttons&disable-funding=card,credit,paylater,venmo`);
          mount.replaceChildren();
          paypal.Buttons({ style: { layout: "vertical", color: "white", shape: "pill", label: "pay", height: 46 },
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
  const seg = h("div", { class: "seg pm", role: "tablist" }, ...[["card", "Card"], ["paypal", "PayPal"]].map(([k, l]) => h("button", { type: "button", role: "tab", "aria-selected": String(method === k), onclick: e => { method = k; for (const b of seg.children) b.setAttribute("aria-selected", String(b === e.currentTarget)); draw(); } }, payIcon(k), l)));
  openSheet([phead(label + " · " + money(amt), o.title),
    h("div", { class: "kv" }, h("dt", null, "Paid to"), h("dd", null, "Promptflix escrow, not the creator"), h("dt", null, "Released"), h("dd", null, label === "Deposit" ? "to " + DB.nameOf(o.creatorId) + " when you pass the first cut; refunded if it fails" : "to " + DB.nameOf(o.creatorId) + " now, with the clean master")),
    seg, body,
    h("p", { class: "hint" }, "Cards are processed by Stripe and PayPal by PayPal. Promptflix never sees your card number.")]);
  draw();
}
