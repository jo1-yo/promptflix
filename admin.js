/* Rolvo Market — admin. Sign-in restricted to CONFIG.adminEmails.
   Overview (money, funnel, sign-in methods, activity), orders, payments in, payouts (creator balances and withdrawals),
   clients (manual verification), creators (joined, applying, unclaimed), discovery invites, trust (disputes, break limits),
   integrations (live vs demo). The rail groups them: money, people, system. */
const APP = "admin";
const VIEWS = [[null, [["", "Overview"]]], ["Money", [["orders", "Orders"], ["payments", "Payments"], ["payouts", "Payouts"]]], ["People", [["users", "Clients"], ["creators", "Creators"], ["discovery", "Discovery"]]], ["System", [["trust", "Trust"], ["integrations", "Integrations"]]]];

function header(){
  const u = me();
  mountHeader({ brand: "Rolvo", sub: "Admin", links: [],
    right: u && u.role === "admin" ? [h("a", { class: "btn quiet small", href: "../", target: "_blank" }, "Client site"), h("a", { class: "btn quiet small", href: "../creator/", target: "_blank" }, "Creator site"), h("button", { class: "btn quiet small", onclick: () => { DB.signOut(); go("#/"); render(); } }, "Sign out")] : [],
    home: "#/" });
}
function adminSignIn(){
  Auth.open(null, { title: "Admin sign-in", sub: "Only addresses on the admin list get in." }, { methods: ["google", "email"], allow: email => CONFIG.adminEmails.includes(email) || "That address isn't on the admin list. Use your own admin email.",
    hint: LIVE.auth ? "Sign in with your own admin email. The code arrives by email, or use Google." : "Demo admin: " + CONFIG.adminEmails[0],
    onIdentity: id => { if (!id.email || !DB.ensureAdmin(id.email)) return toast("That account isn't on the admin list.");
      const u = DB.signIn(id); if (!u) return toast("That account isn't on the admin list."); closeSheet(); render(); } });
}
function render(){
  header(); const r = route(); const m = $("#main"); m.replaceChildren(); const v = r.parts[0] || "";
  const u = me();
  if (!u || u.role !== "admin"){
    m.append(h("section", { class: "wrap section narrow", style: { minHeight: "60vh", display: "grid", alignContent: "center", gap: "18px" } },
      h("h1", { class: "pname" }, "Admin"), h("p", { class: "muted" }, "Escrow, payments, verification and creator discovery."),
      h("div", null, h("button", { class: "btn primary big", onclick: adminSignIn }, "Sign in"))));
    return;
  }
  if (v === "order" || v === "chat") { vChats(m, r.parts[1]); return; }
  const views = { "": vOverview, orders: vOrders, payments: vPayments, payouts: vPayouts, users: vUsers, creators: vCreators, discovery: vDiscovery, trust: vTrust, integrations: vIntegrations };
  if (!views[v]) return go("#/");
  const counts = { users: clients().filter(x => x.onboarded && !x.verified).length, trust: DB.state.orders.filter(o => o.status === "cancelled" && !o.reviewedByAdmin).length };
  const rail = h("nav", { class: "rail" }, ...VIEWS.flatMap(([group, items]) => [group ? h("span", { class: "rgroup" }, group) : null, ...items.map(([k, l]) => h("a", { href: "#/" + k, "aria-current": String(k === v) }, l, counts[k] ? h("span", { class: "n" }, counts[k]) : null))]).filter(Boolean));
  const body = h("div", { class: "admin" }); views[v](body, r.q || {});
  m.append(h("div", { class: "wrap dash" }, rail, body));
}

/* ---------- helpers ---------- */
const A = {
  sum: (xs, f) => xs.reduce((a, x) => a + (f ? f(x) : x), 0),
  title: (t, sub, right) => h("div", { class: "page-title" }, h("div", null, h("h2", null, t), sub ? h("p", { class: "muted small", style: { marginTop: "6px", maxWidth: "62ch" } }, sub) : null), right || null),
  kpis: items => h("div", { class: "kpis" }, ...items.map(([v, l, note]) => h("div", { class: "kpi" }, h("b", null, v), h("span", null, l), note ? h("small", null, note) : null))),
  table: (cols, rows, empty) => rows.length ? h("div", { class: "tbl" }, h("table", null, h("thead", null, h("tr", null, ...cols.map(c => h("th", { style: c.right ? { textAlign: "right" } : null }, c.l)))), h("tbody", null, ...rows))) : h("p", { class: "hint" }, empty || "Nothing yet."),
  td: (x, o = {}) => h("td", { class: o.cls || null, style: o.right ? { textAlign: "right" } : null }, x),
  method: m => m === "paypal" ? "PayPal" : m === "card" ? "Card · Stripe" : "—",
  login: u => [u.email, u.phone].filter(Boolean).join(" · ") || "—",
  providers: u => (u.providers || []).map(p => p === "google" ? "Google" : p === "phone" ? "SMS" : "Email").join(", ") || "—",
  chips: (opts, cur, base) => h("div", { class: "filters" }, ...opts.map(([k, l, n]) => h("button", { "aria-pressed": String((cur || "") === k), onclick: () => go(base + (k ? "?s=" + k : "")) }, l + (n != null ? " · " + n : "")))),
  search: (q, base, ph) => { const i = h("input", { class: "i", type: "search", placeholder: ph, value: q || "" }); return h("form", { class: "asearch", onsubmit: e => { e.preventDefault(); go(base + (i.value.trim() ? "?q=" + encodeURIComponent(i.value.trim()) : "")); } }, i); },
  clientStatus: u => u.verified ? ["Verified", "ok"] : u.onboarded ? ["Needs review", "warn"] : ["Onboarding", "dim"],
  live: on => h("span", { class: "pill " + (on ? "live" : "demo") }, on ? "Live" : "Demo"),
};
const clients = () => DB.state.users.filter(u => u.role === "client");
const joined = () => DB.state.creators.filter(c => c.claimed || !c.real);
const wallets = () => joined().map(c => [c, DB.wallet(c.id)]);
const activeOrders = () => DB.state.orders.filter(o => !["completed", "cancelled", "negotiating"].includes(o.status));
const loginText = l => l.provider === "google" ? "Google" : l.provider === "phone" ? "an SMS code" : "an email code";

/* ---------- overview ---------- */
function vOverview(s){
  const L = DB.state.ledger, P = DB.state.payments;
  const inflow = A.sum(P, p => p.amount);
  const held = A.sum(L.filter(t => t.to === "escrow"), t => t.amount) - A.sum(L.filter(t => t.from === "escrow"), t => t.amount);
  const fee = A.sum(L.filter(t => t.type === "commission"), t => t.amount);
  const W = wallets(), balances = A.sum(W, ([, w]) => w.available), withdrawn = A.sum(W, ([, w]) => w.withdrawn);
  s.append(A.title("Overview", "This browser's data. Live, the money figures come from Stripe."),
    A.kpis([[money(inflow), "Paid in", P.length + (P.length === 1 ? " payment" : " payments")], [money(held), "In escrow"], [money(balances), "Creator balances", "released, not withdrawn"], [money(withdrawn), "Withdrawn"], [money(fee), "Commission", FEES.commission * 100 + "% of releases"], [activeOrders().length, "Active orders"]]));

  const cl = clients(), ord = DB.state.orders;
  const funnel = [["Signed up", cl.length], ["Finished onboarding", cl.filter(u => u.onboarded).length], ["Started a project", new Set(ord.map(o => o.clientId)).size], ["Paid a deposit", new Set(P.filter(p => p.kind === "deposit").map(p => p.uid)).size], ["Completed an order", new Set(ord.filter(o => o.status === "completed").map(o => o.clientId)).size]];
  const top = Math.max(1, funnel[0][1]);
  const logins = DB.state.logins || [];
  const byMethod = ["google", "email", "phone"].map(k => [k, logins.filter(l => l.provider === k).length]);
  const where = [["In escrow", held], ["Creator balances", balances], ["Withdrawn", withdrawn], ["Commission", fee]];
  const bar = (label, n, total, shown) => h("div", { class: "frow" }, h("span", null, label), h("i", null, h("em", { style: { width: Math.round(n / Math.max(1, total) * 100) + "%" } })), h("b", null, shown ?? n));
  s.append(h("div", { class: "agrid" },
    h("div", { class: "acard" }, h("span", { class: "eyebrow" }, "Client funnel"), h("div", { class: "funnel" }, ...funnel.map(([l, n]) => bar(l, n, top)))),
    h("div", { class: "acard" }, h("span", { class: "eyebrow" }, "Sign-ins by method"), h("div", { class: "funnel" }, ...byMethod.map(([k, n]) => bar(k === "google" ? "Google" : k === "phone" ? "Phone (SMS)" : "Email code", n, logins.length))),
      h("span", { class: "eyebrow", style: { marginTop: "22px", display: "block" } }, "Where the money is"), h("div", { class: "funnel" }, ...where.map(([l, amt]) => bar(l, amt, inflow, money(amt)))))));

  const attention = [
    ...cl.filter(u => u.onboarded && !u.verified).map(u => [u.lastLoginAt || u.createdAt, h("a", { class: "link", href: "#/users?s=review" }, (u.org || u.name || A.login(u)) + " needs company verification")]),
    ...ord.filter(o => o.status === "negotiating" && DB.creator(o.creatorId)?.real && !DB.creator(o.creatorId).claimed).map(o => [o.createdAt, h("a", { class: "link", href: "#/discovery" }, `“${o.title}” is waiting on ${DB.nameOf(o.creatorId)} to join`)]),
    ...ord.filter(o => o.status === "cancelled" && !o.reviewedByAdmin).map(o => [o.updatedAt, h("a", { class: "link", href: "#/trust" }, `“${o.title}” ended early`)]),
  ].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  const feed = [
    ...logins.map(l => [l.at, `${DB.nameOf(l.uid)} ${l.claim ? "claimed a profile with" : "signed in to the " + l.app + " site with"} ${loginText(l)}`]),
    ...P.map(p => [p.at, `${DB.nameOf(p.uid)} paid the ${p.kind} (${money(p.amount)}) by ${A.method(p.method)}`]),
    ...ord.map(o => [o.createdAt, `${DB.nameOf(o.clientId)} opened “${o.title}” with ${DB.nameOf(o.creatorId)}`]),
  ].sort((a, b) => String(b[0]).localeCompare(String(a[0]))).slice(0, 14);
  s.append(h("div", { class: "agrid" },
    h("div", { class: "acard" }, h("span", { class: "eyebrow" }, "Needs attention · " + attention.length), attention.length ? h("ul", { class: "alist" }, ...attention.slice(0, 8).map(([, el]) => h("li", null, el))) : h("p", { class: "hint", style: { marginTop: "10px" } }, "Nothing waiting on the team.")),
    h("div", { class: "acard" }, h("span", { class: "eyebrow" }, "Recent activity"), feed.length ? h("ul", { class: "alist" }, ...feed.map(([at, t]) => h("li", null, h("span", null, t), h("small", null, ago(at))))) : h("p", { class: "hint", style: { marginTop: "10px" } }, "No activity yet."))));
}

/* ---------- orders ---------- */
const ORDER_GROUPS = [["", "All"], ["negotiating", "Negotiating"], ["active", "In progress"], ["completed", "Completed"], ["cancelled", "Ended"]];
function vOrders(s, q){
  const all = DB.state.orders.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const inGroup = (o, g) => !g || (g === "active" ? !["negotiating", "completed", "cancelled"].includes(o.status) : o.status === g);
  const term = (q.q || "").toLowerCase();
  const list = all.filter(o => inGroup(o, q.s) && (!term || [o.title, o.id, DB.nameOf(o.clientId), DB.nameOf(o.creatorId)].join(" ").toLowerCase().includes(term)));
  const paid = o => A.sum(DB.state.payments.filter(p => p.orderId === o.id), p => p.amount);
  s.append(A.title("Orders", "Every project opened on the platform. Open one to read the chat; admins can read but not write."),
    h("div", { class: "toolrow" }, A.chips(ORDER_GROUPS.map(([k, l]) => [k, l, all.filter(o => inGroup(o, k)).length]), q.s, "#/orders"), A.search(q.q, "#/orders", "Search title, client, creator")),
    A.table([{ l: "Order" }, { l: "Client" }, { l: "Creator" }, { l: "Status" }, { l: "Price", right: 1 }, { l: "Paid", right: 1 }, { l: "Updated" }],
      list.map(o => { const c = DB.creator(o.creatorId); return h("tr", { class: "click", onclick: () => go("#/chat/" + o.id) },
        A.td(h("div", null, h("b", { style: { fontWeight: 500 } }, o.title), h("small", { class: "dim", style: { display: "block" } }, o.id))), A.td(DB.nameOf(o.clientId)),
        A.td(h("div", null, DB.nameOf(o.creatorId), c && c.real && !c.claimed ? h("small", { class: "dim", style: { display: "block" } }, "not joined yet") : null)),
        A.td(h("span", { class: "badge " + o.status }, STATUS[o.status][0])), A.td(money(o.terms.price), { right: 1 }), A.td(money(paid(o)), { right: 1 }), A.td(ago(o.updatedAt), { cls: "muted" })); }),
      "No orders match."));
}

/* ---------- payments ---------- */
function vPayments(s, q){
  const all = DB.state.payments, L = DB.state.ledger;
  const hasPP = all.some(p => p.method === "paypal");
  const P = all.slice().reverse().filter(p => !q.s || p.method === q.s);
  s.append(A.title("Payments", "What clients paid in. It sits in the platform's Stripe balance as escrow until a release."),
    A.kpis([[money(A.sum(all, p => p.amount)), "Paid in", all.length + (all.length === 1 ? " payment" : " payments")], [money(A.sum(all, p => p.fee || 0)), "Card fees", "paid by clients, passed to Stripe"], [money(A.sum(L.filter(t => t.type === "commission"), t => t.amount)), "Commission", FEES.commission * 100 + "% of releases"], [all.filter(p => p.mode !== "live").length, "Demo payments", "not real money"]]),
    hasPP ? h("div", { style: { margin: "26px 0 14px" } }, A.chips([["", "All"], ["card", "Card · Stripe"], ["paypal", "PayPal"]], q.s, "#/payments")) : h("div", { style: { height: "26px" } }),
    A.table([{ l: "When" }, { l: "Order" }, { l: "Client" }, { l: "Type" }, { l: "Reference" }, { l: "Mode" }, { l: "Card fee", right: 1 }, { l: "Amount", right: 1 }],
      P.map(p => { const o = DB.order(p.orderId); return h("tr", null, A.td(when(p.at), { cls: "muted" }), A.td(o ? h("a", { class: "link", href: "#/chat/" + o.id }, o.title) : p.orderId), A.td(DB.nameOf(p.uid)), A.td(p.kind + (p.method === "paypal" ? " · PayPal" : "")), A.td(h("code", { class: "ref" }, p.ref)), A.td(A.live(p.mode === "live")), A.td(p.fee ? money(p.fee) : "—", { right: 1, cls: "muted" }), A.td(money(p.amount), { right: 1 })); }),
      "No payments yet. Clients pay the deposit after both sides accept terms."));
  const who = id => id === "promptflix" ? "Rolvo" : ["escrow", "bank"].includes(id) ? id : DB.nameOf(id);   // "promptflix" stays the platform's id inside the ledger
  s.append(h("div", { style: { marginTop: "44px" } }, A.title("Ledger", "Every movement of money: client, escrow, creator, Rolvo, bank."),
    A.table([{ l: "When" }, { l: "Order" }, { l: "Movement" }, { l: "From → to" }, { l: "Amount", right: 1 }],
      L.slice().reverse().map(t => h("tr", null, A.td(when(t.at), { cls: "muted" }), A.td(t.orderId ? (DB.order(t.orderId) || {}).title || t.orderId : "—"), A.td(t.type === "payout" ? "withdrawal" : t.type.replace(/_/g, " ")), A.td(who(t.from) + " → " + who(t.to), { cls: "muted" }), A.td(money(t.amount), { right: 1 }))), "Ledger is empty.")));
}

/* ---------- payouts ---------- */
function vPayouts(s){
  const W = wallets().filter(([c, w]) => w.earned || w.pending || c.payout).sort((a, b) => b[1].available - a[1].available);
  const out = DB.state.ledger.filter(t => t.type === "payout").slice().reverse();
  s.append(A.title("Payouts", "What creators have earned, what they can withdraw, and what they've taken out. Bank and card details stay at Stripe."),
    A.kpis([[money(A.sum(W, ([, w]) => w.available)), "Creator balances", "ready to withdraw"], [money(A.sum(W, ([, w]) => w.pending)), "On hold", "deposits awaiting first-cut review"], [money(A.sum(out, t => t.amount)), "Withdrawn", out.length + (out.length === 1 ? " withdrawal" : " withdrawals")], [money(A.sum(out, t => t.fee || 0)), "Instant fees", FEES.instant * 100 + "% of instant payouts"], [W.filter(([c]) => !c.payout && DB.wallet(c.id).available > 0).length, "No payout method", "have money, can't withdraw yet"]]),
    h("div", { style: { marginTop: "34px" } }, h("span", { class: "eyebrow" }, "Creator wallets"),
      A.table([{ l: "Creator" }, { l: "Payout method" }, { l: "Available", right: 1 }, { l: "On hold", right: 1 }, { l: "Earned", right: 1 }, { l: "Withdrawn", right: 1 }],
        W.map(([c, w]) => h("tr", null, A.td(h("div", null, h("b", { style: { fontWeight: 500 } }, c.name), h("small", { class: "dim", style: { display: "block" } }, A.login(c)))),
          A.td(c.payout ? c.payout.label + " ···· " + c.payout.last4 : h("span", { class: w.available > 0 ? "warn" : "dim" }, "Not set")), A.td(money(w.available), { right: 1 }), A.td(money(w.pending), { right: 1, cls: "muted" }), A.td(money(w.earned), { right: 1, cls: "muted" }), A.td(money(w.withdrawn), { right: 1, cls: "muted" }))),
        "No creator has earned anything yet.")),
    h("div", { style: { marginTop: "34px" } }, h("span", { class: "eyebrow" }, "Withdrawals"),
      A.table([{ l: "When" }, { l: "Creator" }, { l: "Speed" }, { l: "To" }, { l: "Mode" }, { l: "Fee", right: 1 }, { l: "Sent", right: 1 }, { l: "Amount", right: 1 }],
        out.map(t => h("tr", null, A.td(when(t.at), { cls: "muted" }), A.td(DB.nameOf(t.from)), A.td(t.speed === "instant" ? "Instant" : "Standard"), A.td(t.method, { cls: "muted" }), A.td(A.live(t.mode === "live")), A.td(t.fee ? money(t.fee) : "—", { right: 1, cls: "muted" }), A.td(money(t.net), { right: 1 }), A.td(money(t.amount), { right: 1 }))),
        "No withdrawals yet.")));
}

/* ---------- clients ---------- */
function vUsers(s, q){
  const all = clients(); const term = (q.q || "").toLowerCase();
  const group = u => u.verified ? "verified" : u.onboarded ? "review" : "onboarding";
  const list = all.filter(u => (!q.s || group(u) === q.s) && (!term || [u.name, u.org, u.email, u.phone, (u.profile || {}).website].join(" ").toLowerCase().includes(term)))
    .sort((a, b) => String(b.lastLoginAt || b.createdAt || "").localeCompare(String(a.lastLoginAt || a.createdAt || "")));
  s.append(A.title("Clients", "Instant verification needs a proven work email on the company's own domain. Everyone else lands in review: check the company and website, then verify."),
    h("div", { class: "toolrow" }, A.chips([["", "All", all.length], ["review", "Needs review", all.filter(u => group(u) === "review").length], ["verified", "Verified", all.filter(u => group(u) === "verified").length], ["onboarding", "Onboarding", all.filter(u => group(u) === "onboarding").length]], q.s, "#/users"), A.search(q.q, "#/users", "Search name, company, email, phone")),
    A.table([{ l: "Client" }, { l: "Sign-in" }, { l: "Via" }, { l: "Company" }, { l: "Status" }, { l: "Orders", right: 1 }, { l: "Last seen" }, { l: "" }],
      list.map(u => { const p = u.profile || {}; const [st, cls] = A.clientStatus(u); return h("tr", null,
        A.td(h("div", null, h("b", { style: { fontWeight: 500 } }, u.name || "—"), p.role ? h("small", { class: "dim", style: { display: "block" } }, p.role) : null)), A.td(A.login(u), { cls: "muted" }), A.td(A.providers(u), { cls: "muted" }),
        A.td(h("div", null, u.org || "—", p.website ? h("small", { class: "dim", style: { display: "block" } }, p.website + (p.workEmail ? " · " + p.workEmail : "")) : null)),
        A.td(h("span", { class: cls }, st + (u.verifiedBy === "admin" ? " (manual)" : ""))), A.td(DB.state.orders.filter(o => o.clientId === u.id).length, { right: 1 }), A.td(u.lastLoginAt ? ago(u.lastLoginAt) : "—", { cls: "muted" }),
        A.td(u.onboarded ? h("button", { class: "btn small" + (u.verified ? " quiet" : ""), onclick: () => { DB.setVerified(u.id, !u.verified); toast(u.verified ? "Verified " + (u.org || u.name) : "Verification removed"); render(); } }, u.verified ? "Revoke" : "Verify") : null)); }),
      "No clients match."));
}

/* ---------- creators ---------- */
function vCreators(s, q){
  const all = DB.state.creators; const term = (q.q || "").toLowerCase();
  const group = c => c.real ? (c.claimed ? "joined" : "unclaimed") : (c.live ? "joined" : "applying");
  const list = all.filter(c => (!q.s || group(c) === q.s) && (!term || [c.name, c.handle, c.email, c.phone].join(" ").toLowerCase().includes(term)));
  const n = k => all.filter(c => group(c) === k).length;
  s.append(A.title("Creators", "On Rolvo = claimed a crawled profile or finished an application. Unclaimed profiles are built from public work; a client starting a project sends them an invite."),
    h("div", { class: "toolrow" }, A.chips([["", "All", all.length], ["joined", "On Rolvo", n("joined")], ["applying", "Applying", n("applying")], ["unclaimed", "Unclaimed", n("unclaimed")]], q.s, "#/creators"), A.search(q.q, "#/creators", "Search name or handle")),
    A.table([{ l: "Creator" }, { l: "Status" }, { l: "Sign-in" }, { l: "Works", right: 1 }, { l: "Orders", right: 1 }, { l: "Rates" }, { l: "" }],
      list.slice(0, 200).map(c => { const g = group(c); return h("tr", null,
        A.td(h("div", { class: "row", style: { gap: "10px", flexWrap: "nowrap" } }, h("span", { class: "thumb" }, cover(c.works[0])), h("div", null, h("b", { style: { fontWeight: 500 } }, c.name || "(no name yet)"), h("small", { class: "dim", style: { display: "block" } }, c.handle ? "@" + c.handle + (c.source ? " · " + c.source : "") : "new application")))),
        A.td(h("span", { class: g === "joined" ? "ok" : g === "applying" ? "warn" : "dim" }, g === "joined" ? "On Rolvo" : g === "applying" ? "Applying" : c.invitedAt ? "Invited " + ago(c.invitedAt) : "Unclaimed")),
        A.td(c.claimed || !c.real ? A.login(c) : "—", { cls: "muted" }), A.td(c.works.length, { right: 1 }), A.td(DB.state.orders.filter(o => o.creatorId === c.id).length || "—", { right: 1 }), A.td(c.ask ? money(c.ask) + "+" : rangeText(c) + " est.", { cls: "muted" }),
        A.td(g === "unclaimed" && !c.invitedAt ? h("button", { class: "btn small", onclick: () => { DB.inviteCreator(c.id); toast("Invite queued for " + c.name); render(); } }, "Invite") : c.social ? h("a", { class: "link small", href: c.social, target: "_blank", rel: "noopener" }, c.source + " ↗") : null)); }),
      "No creators match."));
}

/* ---------- discovery ---------- */
function vDiscovery(s){
  const un = DB.unclaimed(), inv = un.filter(c => c.invitedAt), D = DB.state.discovered;
  const waiting = un.filter(c => DB.state.orders.some(o => o.creatorId === c.id && o.status === "negotiating"));
  s.append(A.title("Discovery", "The crawler builds a profile when it finds playable public work on YouTube or X. Handles with no public video wait below until they post some or answer an invite.",
      h("button", { class: "btn primary", disabled: un.every(c => c.invitedAt), onclick: () => { const k = un.filter(c => DB.inviteCreator(c.id)).length; toast(k + " invites queued"); render(); } }, "Invite all not yet invited")),
    A.kpis([[un.length, "Profiles, unclaimed"], [inv.length, "Invited"], [DB.state.creators.filter(c => c.real && c.claimed).length, "Claimed"], [waiting.length, "Have a client waiting"], [D.length, "Found, no public video"]]));
  if (waiting.length) s.append(h("div", { style: { marginTop: "30px" } }, h("span", { class: "eyebrow" }, "Clients are waiting on these"), A.table([{ l: "Creator" }, { l: "Projects waiting" }, { l: "Reach them on" }],
    waiting.map(c => h("tr", null, A.td(c.name), A.td(DB.state.orders.filter(o => o.creatorId === c.id && o.status === "negotiating").map(o => o.title).join(", ")), A.td(h("a", { class: "link", href: c.social, target: "_blank", rel: "noopener" }, c.source + " ↗")))))));
  s.append(h("div", { style: { marginTop: "30px" } }, h("span", { class: "eyebrow" }, "Found, no public video yet"), A.table([{ l: "Handle" }, { l: "Name" }, { l: "Source" }, { l: "Focus" }, { l: "Status" }],
    D.map(d => h("tr", null, A.td(d.url ? h("a", { class: "link", href: d.url, target: "_blank", rel: "noopener" }, d.handle) : d.handle), A.td(d.name || "—"), A.td(d.source, { cls: "muted" }), A.td(d.specialty), A.td(d.status === "new" ? h("button", { class: "btn small", onclick: () => { DB.invite(d.id); toast("Invite queued for " + d.handle); render(); } }, "Invite") : h("span", { class: "dim" }, d.status)))))));
}

/* ---------- trust ---------- */
function vTrust(s){
  const ended = DB.state.orders.filter(o => o.status === "cancelled");
  s.append(A.title("Trust", `Early ends and failed pre-reviews. Each account gets ${BREAK_LIMIT} contract breaks per 30 days; a break by the creator refunds the deposit, a break by the client forfeits it.`),
    A.table([{ l: "Order" }, { l: "Ended by" }, { l: "Reason" }, { l: "Deposit" }, { l: "" }],
      ended.map(o => h("tr", null, A.td(h("a", { class: "link", href: "#/chat/" + o.id }, o.title)), A.td(DB.nameOf(o.endedBy)), A.td(o.endReason || "—", { cls: "muted" }), A.td(o.escrow.deposit), A.td(o.reviewedByAdmin ? h("span", { class: "dim" }, "Reviewed") : h("button", { class: "btn small", onclick: () => { o.reviewedByAdmin = true; DB.save(); render(); } }, "Mark reviewed")))),
      "No contracts ended early."));
  const accts = [...clients(), ...DB.state.creators.filter(c => c.claimed || !c.real)].filter(x => DB.breaksUsed(x.id) > 0);
  s.append(h("div", { style: { marginTop: "40px" } }, h("span", { class: "eyebrow" }, "Break limits"), A.table([{ l: "Account" }, { l: "Role" }, { l: "Used / limit", right: 1 }],
    accts.map(x => h("tr", null, A.td(DB.nameOf(x.id)), A.td(x.cats ? "creator" : "client", { cls: "muted" }), A.td(DB.breaksUsed(x.id) + " / " + BREAK_LIMIT, { right: 1, cls: DB.breaksLeft(x.id) ? "" : "bad" }))), "No account has broken a contract in the last 30 days.")));
}

/* ---------- integrations ---------- */
function vIntegrations(s){
  const row = (name, on, what, todo) => h("div", { class: "integ" }, h("div", { class: "row between" }, h("b", null, name), A.live(on)), h("p", null, what), on ? null : h("p", { class: "hint" }, todo));
  s.append(A.title("Integrations", "Empty keys in config.js keep a piece in demo mode. Every flow still runs end to end; demo codes and payments never leave the browser."),
    h("div", { class: "integs" },
      row("Sign-in · Google", LIVE.google, "Google's own button and account chooser. With Supabase keys too, each Google sign-in is verified on the server; with only a client ID it's checked in the browser (fine for a prototype, not for money).", "Google Cloud → APIs & Services → Credentials → OAuth client ID (Web). Add http://localhost, http://localhost:8131 and https://imjane.top as authorized JavaScript origins, then paste the ID into googleClientId. In Supabase → Authentication → Providers → Google, add the same client ID."),
      row("Sign-in · Email code", LIVE.auth, "Supabase sends a 6-digit code. Its email template must include {{ .Token }}.", "Same Supabase keys. Add custom SMTP before launch; the built-in sender is rate-limited."),
      row("Sign-in · Phone (SMS)", LIVE.auth, "Supabase phone auth through an SMS provider (Twilio, MessageBird, Vonage).", "Enable Phone in Supabase and connect an SMS provider account."),
      row("Payments · Card (Stripe)", LIVE.stripe, "Stripe Payment Element in the checkout sheet; the PaymentIntent is created by the payments function.", "Set stripePk (pk_test_…) and paymentsUrl; put STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the function's secrets."),
      row("Payouts · Stripe Connect", LIVE.stripe, "Each creator gets a Stripe Express account. Stripe's page collects their bank account or debit card; releases are transfers; Withdraw is a payout.", "Same Stripe account with Connect turned on, plus Supabase sign-in so the function knows which creator is asking. The code has not been run against Stripe yet.")),
    h("div", { style: { marginTop: "36px" } }, h("span", { class: "eyebrow" }, "Data in this browser"),
      h("div", { class: "row", style: { marginTop: "12px" } },
        h("button", { class: "btn", onclick: () => { const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(DB.state, null, 2)], { type: "application/json" })), download: "rolvo-market-" + new Date().toISOString().slice(0, 10) + ".json" }); a.click(); } }, "Export JSON"),
        h("button", { class: "btn quiet", onclick: async () => { if (!confirm("Reset all demo data in this browser?")) return; await Files.clear(); DB.reset(); go("#/"); render(); } }, "Reset demo data"))));
}

bootShared();
