/* Rolvo — creator site. Public pitch; sign in → application → dashboard (inbox, profile, payouts). */
const APP = "creator";
let W = {};
const CATS = Object.keys(TAXONOMY);

function header(){
  const u = me(); const live = u && u.live; const n = pendingCount(u && u.id);
  const links = live ? [["#/chats", "Inbox", n], ["#/profile", "Profile"], ["#/payouts", "Payouts"]] : [["#/", "Home"], ["#/claim", "Claim profile"], ["#/apply", "Apply"]];
  const right = u ? [live ? h("a", { class: "btn quiet small", href: "#/creator-preview" }, "View public profile") : null, h("a", { href: "#/profile", "aria-label": "Profile" }, avatar(u))]
    : [h("button", { class: "btn quiet small", onclick: () => openSignIn(u2 => go(u2.live ? "#/chats" : "#/apply")) }, "Sign in"), h("button", { class: "btn primary small", onclick: () => requireAuth(u2 => go(u2.live ? "#/chats" : "#/apply")) }, "Apply")];
  mountHeader({ brand: "Rolvo", sub: "For creators", links, right, home: live ? "#/chats" : "#/" });
}
function render(){
  header();
  const r = route(); const m = $("#main"); m.replaceChildren(); const v = r.parts[0]; const u = me();
  if (!v) { if (u && u.live) return go("#/chats"); vLanding(m); }
  else if (v === "apply") vApply(m);
  else if (v === "claim") vClaim(m, r.q || {});
  else if (v === "inbox" || v === "orders") return go("#/chats");
  else if (v === "chats") { if (!u) return requireAuth(() => render()); if (!u.live) return go("#/apply"); vChats(m, null); }
  else if (v === "chat") { if (!u) return requireAuth(() => render()); vChats(m, r.parts[1]); }
  else if (v === "order") return go("#/chat/" + r.parts[1]);
  else if (v === "profile") dash(m, "profile", vProfile);
  else if (v === "payouts") dash(m, "payouts", vPayouts);
  else if (v === "creator-preview") vPreview(m);
  else return go("#/");
  if (!["apply", "chats", "chat"].includes(v)) m.append(footer());
}

function vLanding(m){
  m.append(h("section", { class: "wrap hero" },
    h("div", { class: "stack", style: { gap: "22px" } },
      h("h1", null, "Get hired for the work you've ", h("em", null, "already made"), "."),
      h("p", { class: "lead" }, "Clients on Rolvo don't post jobs. They browse finished films by category and style, and hire the person who made them. Your portfolio is the pitch."),
      h("div", { class: "row" }, h("button", { class: "btn primary big", onclick: () => requireAuth(u => go(u.live ? "#/chats" : "#/apply")) }, "Apply to join"), h("a", { class: "btn big", href: "#/claim" }, "Claim your profile"))),
      h("p", { class: "hint" }, "Already making AI film? We may have built your profile from your public work. Claim it and clients can reach you."),
    h("div", { class: "strip" }, ...DB.roster().slice(0, 10).map(c => tile(c.works[0], c, () => playWork(c.works[0], c))))));
  m.append(h("section", { class: "wrap section" }, h("div", { class: "sec-head" }, h("h2", null, "The deal"), h("p", null, "Deposit before you start, watermarked previews until the final, revisions counted in the contract. Rolvo takes " + (COMMISSION * 100) + "% on each release; no listing fees, no bidding.")),
    h("div", { class: "kv", style: { maxWidth: "640px", fontSize: "15px" } }, h("dt", null, "Deposit"), h("dd", null, "Released to you the moment the client passes your first cut."), h("dt", null, "Balance"), h("dd", null, "Paid by the client to unlock the clean master. Released to you immediately."), h("dt", null, "If they walk"), h("dd", null, "A client who ends the contract after paying the deposit forfeits it to you."), h("dt", null, "If you walk"), h("dd", null, "The deposit is refunded and it counts against your " + BREAK_LIMIT + " breaks a month."))));
}

/* ---------- claim: crawled profiles become accounts ---------- */
function vClaim(m, q){
  const term = (q.q || "").toLowerCase();
  const list = DB.unclaimed().filter(c => !term || (c.name + " " + c.handle).toLowerCase().includes(term));
  const input = h("input", { class: "i", type: "search", placeholder: "Your name or handle", value: q.q || "", autofocus: true, oninput: e => { clearTimeout(input.t); input.t = setTimeout(() => go("#/claim" + (e.target.value.trim() ? "?q=" + encodeURIComponent(e.target.value.trim()) : "")), 250); } });
  m.append(h("section", { class: "wrap section narrow" },
    h("div", { class: "stack", style: { gap: "14px", marginBottom: "28px" } }, h("h1", { class: "pname" }, "Claim your profile"), h("p", { class: "muted" }, "Our crawler builds profiles from public AI film work on YouTube, X and Instagram. Find yours, prove the handle is you, and set your own rates.")),
    input,
    h("div", { class: "claimlist", style: { marginTop: "16px" } }, ...list.slice(0, 40).map(c => h("button", { class: "claimrow", onclick: () => claimSheet(c) }, cover(c.works[0]), h("div", null, c.name, h("small", null, "@" + c.handle + " · " + c.source + " · " + c.works.length + " films")))),
      list.length ? null : h("p", { class: "hint" }, "No unclaimed profile matches. ", h("a", { class: "link", href: "#/apply" }, "Apply instead →")))));
  setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
}
function claimSheet(c){
  Auth.open(null, { title: "Is this you?", sub: c.name + " · @" + c.handle + " on " + c.source }, {
    hint: `Then we DM a code to @${c.handle} on ${c.source} to prove the handle is yours (skipped in this prototype).`,
    onIdentity: identity => {
      if (!DB.claim(c.id, identity)) return toast("That login already has a creator account with work on it. Sign in instead.");
      closeSheet(); toast("Profile claimed. Set your rates next."); go("#/profile"); render();
    } });
}

/* ---------- application ---------- */
function vApply(m){
  const u = me(); if (!u) return requireAuth(() => render()); if (u.live) return go("#/inbox");
  W.step ??= 0;
  scrollTo(0, 0); const total = 4; const n = W.step + 1;
  const page = h("div", { class: "flow-page" }); m.append(page);
  const head = (title, lead) => page.append(h("div", null, h("div", { class: "row between", style: { marginBottom: "22px" } }, h("span", { class: "counter" }, `${String(n).padStart(2, "0")} / 0${total}`), W.step > 0 ? h("button", { class: "link", onclick: () => { W.step--; render(); } }, "Back") : h("button", { class: "link", onclick: () => { DB.signOut(); go("#/"); } }, "Sign out")), h("div", { class: "progress" }, h("i", { style: { width: (n / total * 100) + "%" } })), h("h1", { style: { marginTop: "36px" } }, title), lead ? h("p", { class: "lead" }, lead) : null));
  const chipset = (name, items, selected, max) => h("div", { class: "chips" }, ...items.map(([v, l]) => h("label", { class: "chip" + (selected.includes(v) ? " on" : "") }, h("input", { type: "checkbox", name, value: v, checked: selected.includes(v), style: { display: "none" }, onchange: e => { const box = e.target.closest(".chips"); const on = [...box.querySelectorAll("input:checked")]; if (max && on.length > max){ e.target.checked = false; return toast("Up to " + max + "."); } e.target.parentNode.classList.toggle("on", e.target.checked); } }), l)));

  if (W.step === 0){
    head("Who you are.", "Shown on your public profile. Clients read the background line before anything else.");
    const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const fd = new FormData(f);
      Object.assign(u, { name: fd.get("name").trim(), handle: fd.get("handle").trim().replace(/^@/, ""), where: fd.get("where").trim(), tz: fd.get("tz"), region: fd.get("region"), bg: fd.get("bg").trim(), tools: fd.getAll("tools") }); DB.save(); W.step = 1; render(); } },
      h("div", { class: "row2" }, field("Name", h("input", { class: "i", name: "name", required: true, value: u.name, placeholder: "Name or studio" })), field("Handle", h("input", { class: "i", name: "handle", required: true, value: u.handle, placeholder: "yourname" }))),
      h("div", { class: "row3" }, field("Based in", h("input", { class: "i", name: "where", required: true, value: u.where, placeholder: "City" })), field("Time zone", h("select", { class: "i", name: "tz" }, ...TZS.map(t => h("option", { value: t, selected: u.tz === t }, t)))), field("Region", h("select", { class: "i", name: "region" }, ...REGIONS.map(([v, l]) => h("option", { value: v, selected: u.region === v }, l))))),
      field("Background", h("textarea", { class: "i", name: "bg", required: true, maxlength: "160", value: u.bg, placeholder: "One line. Who you were before, what you're known for." }), "one sentence"),
      field("Tools", chipset("tools", TOOLS.map(t => [t, t]), u.tools)),
      h("div", null, h("button", { class: "btn primary big", type: "submit" }, "Continue")));
    page.append(f); return;
  }
  if (W.step === 1){
    head("What you make.", "This is how clients find you. Be narrow; a duanju director and a SaaS launch director are different listings.");
    const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const fd = new FormData(f); const cats = fd.getAll("cats"), styles = fd.getAll("styles");
      if (!cats.length || !styles.length) return toast("Pick at least one category and one style."); Object.assign(u, { cats, styles, fit: fd.getAll("fit") }); DB.save(); W.step = 2; render(); } },
      field("Categories", chipset("cats", CATS.map(id => [id, TAXONOMY[id].name]), u.cats)),
      field("Styles", chipset("styles", Object.entries(STYLES).map(([id, s]) => [id, s.name]), u.styles, 3), "up to 3"),
      field("Clients you work best with", chipset("fit", CLIENT_TYPES.map(t => [t.id, t.name]), u.fit)),
      h("div", null, h("button", { class: "btn primary big", type: "submit" }, "Continue")));
    page.append(f); return;
  }
  if (W.step === 2){
    head("Your work.", "At least one finished film. Each one is tagged with a category and style so the right clients see it.");
    const list = h("div", { class: "worklist" }, ...u.works.map((w, i) => h("div", { class: "workrow" }, art(w[2]), h("div", null, w[0], h("small", null, TAXONOMY[w[1]].name + " · " + STYLES[w[2]].name + " · " + w[3] + "s")), h("button", { class: "btn quiet small", onclick: () => { u.works.splice(i, 1); DB.save(); render(); } }, "Remove"))));
    let file = null;
    const f = h("form", { class: "form", onsubmit: async e => { e.preventDefault(); const fd = new FormData(f); const btn = f.querySelector("[type=submit]"); btn.disabled = true;
      const src = file ? await Files.put(file) : (fd.get("url") || null);
      u.works.push([fd.get("title").trim(), fd.get("cat"), fd.get("style"), +fd.get("secs") || 30, src]); DB.save(); render(); } },
      h("div", { class: "row2" }, field("Title", h("input", { class: "i", name: "title", required: true, maxlength: "60", placeholder: "Client · what it was" })), field("Length (seconds)", h("input", { class: "i", name: "secs", type: "number", min: "1", value: 30 }))),
      h("div", { class: "row2" }, field("Category", h("select", { class: "i", name: "cat" }, ...(u.cats.length ? u.cats : CATS).map(id => h("option", { value: id }, TAXONOMY[id].name)))), field("Style", h("select", { class: "i", name: "style" }, ...(u.styles.length ? u.styles : Object.keys(STYLES)).map(id => h("option", { value: id }, STYLES[id].name))))),
      h("div", { class: "row2" }, field("File", h("input", { type: "file", accept: "video/*", onchange: e => { file = e.target.files[0] || null; } }), "optional, stays in this browser"), field("or a link", h("input", { class: "i", name: "url", type: "url", placeholder: "https://…/film.mp4" }))),
      h("div", { class: "row" }, h("button", { class: "btn", type: "submit" }, "Add film"), h("span", { class: "hint" }, "No file or link: the demo plays a stock clip.")));
    page.append(list, f, h("div", null, h("button", { class: "btn primary big", disabled: !u.works.length, onclick: () => { W.step = 3; render(); } }, "Continue")));
    return;
  }
  if (W.step === 3){
    head("Pricing.", "Your starting price per film. Clients see a range built from this and every order you open here.");
    const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const fd = new FormData(f);
      Object.assign(u, { ask: +fd.get("ask"), days: +fd.get("days"), live: true, rating: u.rating || 4.8, approvedAt: now() }); DB.save(); W = {}; toast("You're live. Clients can find you now."); go("#/chats"); } },
      h("div", { class: "row2" }, field("Starting price (USD)", h("input", { class: "i", name: "ask", type: "number", min: "50", step: "50", required: true, value: u.ask || "", placeholder: "1500" })), field("Typical turnaround (days)", h("input", { class: "i", name: "days", type: "number", min: "1", required: true, value: u.days }))),
      h("div", { class: "notice" }, h("b", null, "Review. "), "A person on our team looks at every application before it goes live, usually within two days. In this demo you go live immediately."),
      h("div", null, h("button", { class: "btn primary big", type: "submit" }, "Submit application")));
    page.append(f);
  }
}

/* ---------- dashboard ---------- */
function dash(m, active, body){
  const u = me(); if (!u) return requireAuth(() => render()); if (!u.live) return go("#/apply");
  const n = pendingCount(u.id);
  const rail = h("nav", { class: "rail" }, ...[["chats", "Inbox", n], ["profile", "Profile"], ["payouts", "Payouts"]].map(([k, l, c]) => h("a", { href: "#/" + k, "aria-current": String(k === active) }, l, c ? h("span", { class: "n" }, c) : null)));
  const s = h("div"); body(s);
  m.append(h("div", { class: "wrap dash" }, rail, s));
}
function vProfile(s){
  const c = me(); const r = DB.priceRange(c);
  const chipset = (name, items, selected, max) => h("div", { class: "chips" }, ...items.map(([v, l]) => h("label", { class: "chip" + (selected.includes(v) ? " on" : "") }, h("input", { type: "checkbox", name, value: v, checked: selected.includes(v), style: { display: "none" }, onchange: e => { const on = [...e.target.closest(".chips").querySelectorAll("input:checked")]; if (max && on.length > max){ e.target.checked = false; return toast("Up to " + max + "."); } e.target.parentNode.classList.toggle("on", e.target.checked); } }), l)));
  const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const fd = new FormData(f);
    Object.assign(c, { name: fd.get("name").trim(), where: fd.get("where").trim(), tz: fd.get("tz"), region: fd.get("region"), bg: fd.get("bg").trim(), ask: +fd.get("ask"), days: +fd.get("days"), tools: fd.getAll("tools"), styles: fd.getAll("styles"), cats: fd.getAll("cats"), fit: fd.getAll("fit") }); DB.save(); toast("Saved."); render(); } },
    h("div", { class: "row2" }, field("Name", h("input", { class: "i", name: "name", value: c.name, required: true })), field("Based in", h("input", { class: "i", name: "where", value: c.where }))),
    h("div", { class: "row2" }, field("Time zone", h("select", { class: "i", name: "tz" }, ...TZS.map(t => h("option", { value: t, selected: c.tz === t }, t)))), field("Region", h("select", { class: "i", name: "region" }, ...REGIONS.map(([v, l]) => h("option", { value: v, selected: c.region === v }, l))))),
    field("Background", h("textarea", { class: "i", name: "bg", value: c.bg, maxlength: "160" })),
    h("div", { class: "row2" }, field("Starting price (USD)", h("input", { class: "i", name: "ask", type: "number", min: "50", step: "50", value: c.ask })), field("Turnaround (days)", h("input", { class: "i", name: "days", type: "number", min: "1", value: c.days }))),
    field("Categories", chipset("cats", CATS.map(id => [id, TAXONOMY[id].name]), c.cats)),
    field("Styles", chipset("styles", Object.entries(STYLES).map(([id, s]) => [id, s.name]), c.styles, 3), "up to 3"),
    field("Clients you work best with", chipset("fit", CLIENT_TYPES.map(t => [t.id, t.name]), c.fit)),
    field("Tools", chipset("tools", TOOLS.map(t => [t, t]), c.tools)),
    h("div", { class: "row between" }, h("button", { class: "btn primary", type: "submit" }, "Save"), h("button", { class: "btn quiet small", type: "button", onclick: () => { DB.signOut(); go("#/"); } }, "Sign out")));
  s.append(h("div", { class: "page-title" }, h("h2", null, "Profile"), h("a", { class: "link", href: "#/creator-preview" }, "See it as clients do →")),
    h("div", { class: "stack", style: { gap: "40px" } },
      h("div", null, h("span", { class: "eyebrow" }, "Price record"), h("div", { class: "stats", style: { marginTop: "14px" } }, h("div", { class: "stat" }, h("b", null, c.ask ? money(c.ask) : "Not set"), h("span", null, "my ask")), h("div", { class: "stat" }, h("b", null, rangeText(c)), h("span", null, "shown range")), h("div", { class: "stat" }, h("b", null, c.closes.length), h("span", null, "closed")), h("div", { class: "stat" }, h("b", null, c.quotes.length), h("span", null, "open quotes")), h("div", { class: "stat" }, h("b", null, DB.breaksLeft(c.id)), h("span", null, "breaks left"))), h("p", { class: "hint", style: { marginTop: "10px" } }, "Every order that reaches contract adds its price here, closed or not. Clients see the range, never the list.")),
      h("div", null, h("span", { class: "eyebrow" }, "Work · " + c.works.length), h("div", { class: "works", style: { marginTop: "14px" } }, ...c.works.map(w => tile(w, c, () => playWork(w, c)))), h("p", { class: "hint", style: { marginTop: "10px" } }, "Add or remove films from the application flow: ", h("button", { class: "link", onclick: () => { W = { step: 2 }; c.live = false; DB.save(); go("#/apply"); } }, "edit work"), ". Your profile is hidden while you edit.")),
      f));
}
function vPayouts(s){
  const c = me(); const rows = DB.state.ledger.filter(t => t.to === c.id).slice().reverse();
  const total = rows.reduce((a, t) => a + t.amount, 0);
  s.append(h("div", { class: "page-title" }, h("h2", null, "Payouts"), h("span", { class: "stat" }, h("b", null, money(total)), h("span", null, "paid out"))),
    rows.length ? h("div", { class: "tbl" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "When"), h("th", null, "Order"), h("th", null, "Type"), h("th", { style: { textAlign: "right" } }, "Net"))), h("tbody", null, ...rows.map(t => h("tr", null, h("td", null, when(t.at)), h("td", null, h("a", { href: "#/chat/" + t.orderId }, (DB.order(t.orderId) || {}).title || t.orderId)), h("td", { class: "muted" }, t.type.replace("_", " ")), h("td", { class: "num ok" }, "+" + money(t.amount))))))) : h("div", { class: "empty" }, h("b", null, "Nothing paid out yet."), h("span", null, "Deposits release when a client passes your first cut.")));
}
function vPreview(m){
  const c = me(); if (!c) return requireAuth(() => render());
  m.append(h("section", { class: "wrap section" }, h("div", { class: "notice", style: { marginBottom: "28px" } }, h("b", null, "Preview. "), "This is your profile as clients see it on the main site. ", h("a", { class: "link", href: "../#/creator/" + c.id }, "Open there →")),
    h("div", { class: "profile" }, h("div", { class: "stack", style: { gap: "28px" } }, h("div", { class: "stack", style: { gap: "14px" } }, h("span", { class: "eyebrow" }, "@" + c.handle + " · " + c.where), h("h1", { class: "pname" }, c.name), h("p", { class: "muted", style: { fontSize: "17px", maxWidth: "56ch" } }, c.bg), h("div", { class: "chips" }, ...c.cats.map(x => h("span", { class: "chip on" }, TAXONOMY[x].name)), ...c.styles.map(s => styleChip(s)), ...c.tools.map(t => h("span", { class: "chip" }, t)))), h("div", { class: "works" }, ...c.works.map(w => tile(w, c, () => playWork(w, c))))),
      h("aside", { class: "side" }, h("div", { class: "card" }, h("div", { class: "stats" }, h("div", { class: "stat" }, h("b", null, rangeText(c)), h("span", null, "typical")), h("div", { class: "stat" }, h("b", null, c.days + "d"), h("span", null, "turnaround")), h("div", { class: "stat" }, h("b", null, c.rating ? "★ " + c.rating.toFixed(1) : "New"), h("span", null, c.done + " done"))), h("button", { class: "btn primary big", disabled: true }, "Start a project"))))));
}

bootShared();
