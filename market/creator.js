/* Rolvo Market — creator site. Public pitch; sign in → application → dashboard (inbox, profile, payouts). */
const APP = "creator";
let W = {};
const CATS = Object.keys(TAXONOMY);

function header(){
  const u = me(); const live = u && u.live; const n = pendingCount(u && u.id);
  const links = live ? [["#/chats", "Inbox", n], ["#/work", "Work"], ["#/profile", "Profile"], ["#/payouts", "Wallet"]] : u ? [["#/", "Home"], ["#/work", "Work"], ["#/claim", "Claim profile"], ["#/apply", "Apply"]] : [["#/", "Home"], ["#/claim", "Claim profile"]];
  const next = u2 => go(u2.live ? "#/chats" : "#/apply");
  const right = u ? [live ? h("a", { class: "btn quiet small", href: "#/creator-preview" }, "View public profile") : null, h("a", { href: "#/profile", "aria-label": "Profile" }, avatar(u))]
    : [h("button", { class: "btn quiet small", onclick: () => openSignIn(next) }, "Log in"), h("button", { class: "btn primary small", onclick: () => Auth.open(next, null, { signup: true }) }, "Sign up")];
  mountHeader({ brand: "Rolvo", sub: "For creators", links, right, home: live ? "#/chats" : "#/" });
}
function render(){
  header();
  const r = route(); const m = $("#main"); m.replaceChildren(); const v = r.parts[0]; const u = me();
  if (!v) { if (u && u.live) return go("#/chats"); vLanding(m); }
  else if (v === "apply") { if (!u) { vLanding(m); Auth.open(() => render(), null, { signup: true }); } else vApply(m); }
  else if (v === "work") { if (!u) return requireAuth(() => render()); vWork(m, r.q || {}); }
  else if (v === "claim") vClaim(m, r.q || {});
  else if (v === "inbox" || v === "orders") return go("#/chats");
  else if (v === "chats") { if (!u) return requireAuth(() => render()); if (!u.live) return go("#/apply"); vChats(m, null); }
  else if (v === "chat") { if (!u) return requireAuth(() => render()); vChats(m, r.parts[1]); }
  else if (v === "order") return go("#/chat/" + r.parts[1]);
  else if (v === "profile") dash(m, "profile", vProfile);
  else if (v === "payouts") dash(m, "payouts", vPayouts);
  else if (v === "creator-preview") vPreview(m);
  else return go("#/");
  if (!(v === "apply" && u) && !["chats", "chat"].includes(v)) m.append(footer());
}

function vLanding(m){
  m.append(h("section", { class: "wrap hero" },
    h("div", { class: "stack", style: { gap: "22px" } },
      h("h1", null, "Get hired for the work you've ", h("em", null, "already made"), "."),
      h("p", { class: "lead" }, "Clients on Rolvo don't post jobs. They browse finished films by category and style, and hire the person who made them. Your portfolio is the pitch."),
      h("div", { class: "row" }, h("button", { class: "btn primary big", onclick: () => requireAuth(u => go(u.live ? "#/chats" : "#/apply")) }, "Apply to join"), h("a", { class: "btn big", href: "#/claim" }, "Claim your profile"))),
      h("p", { class: "hint" }, "Already making AI film? We may have built your profile from your public work. Claim it and clients can reach you."),
    h("div", { class: "strip" }, ...DB.filmed().slice(0, 10).map(c => tile(c.works[0], c, () => playWork(c.works[0], c))))));
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
    head("Your work.", "Optional. Link a finished piece now, or add it later from your profile: a post on Instagram, LinkedIn, X or TikTok, a YouTube or Vimeo film, or your own site.");
    const list = h("div", { class: "worklist" }, ...u.works.map((w, i) => h("div", { class: "workrow pick" }, h("span", { class: "thumb" }, cover(w)), h("div", null, w[0], h("small", null, [w[5] && w[5].on, TAXONOMY[w[1]].name, STYLES[w[2]].name].filter(Boolean).join(" · "))), h("button", { class: "btn quiet small", onclick: () => { u.works.splice(i, 1); DB.save(); render(); } }, "Remove"))));
    const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const fd = new FormData(f); const m = workLink((fd.get("url") || "").trim());
      if (!m) return toast("Paste a full link, starting with https://");
      if (u.works.some(w => sameWork(w[5], m))) return toast("That link is already on your list.");
      m.by = u.name; u.works.push([fd.get("title").trim(), fd.get("cat"), fd.get("style"), null, null, m]); DB.save(); render(); } },
      field("Link to your work", h("input", { class: "i", name: "url", type: "url", required: true, placeholder: "https://www.instagram.com/p/…" }), "Instagram, LinkedIn, X, TikTok, YouTube, Vimeo or any public page"),
      field("Title", h("input", { class: "i", name: "title", required: true, maxlength: "60", placeholder: "Client · what it was" })),
      h("div", { class: "row2" }, field("Category", h("select", { class: "i", name: "cat" }, ...(u.cats.length ? u.cats : CATS).map(id => h("option", { value: id }, TAXONOMY[id].name)))), field("Style", h("select", { class: "i", name: "style" }, ...(u.styles.length ? u.styles : Object.keys(STYLES)).map(id => h("option", { value: id }, STYLES[id].name))))),
      h("div", null, h("button", { class: "btn", type: "submit" }, "Add link")));
    page.append(list, f, h("div", null, h("button", { class: "btn primary big", onclick: () => { W.step = 3; render(); } }, u.works.length ? "Continue" : "Skip for now")), u.works.length ? null : h("p", { class: "hint" }, "Clients find people through their films, so a profile with no work is not shown in the market until you add one."));
    return;
  }
  if (W.step === 3){
    head("Pricing.", "Pick where your films start. You can change it any time, and every project is still agreed in chat.");
    let tier = PRICE_TIERS.findLast(t => (u.ask ?? -1) >= t.ask) || null;
    const ask = h("input", { class: "i", name: "ask", type: "number", min: "0", step: "1", required: true, value: u.ask ?? "", placeholder: "0" });
    const samples = h("div");
    const tiers = h("div", { class: "tiers", role: "radiogroup", "aria-label": "Starting price" });
    const draw = () => {
      tiers.replaceChildren(...PRICE_TIERS.map(t => h("button", { type: "button", class: "tierbtn", role: "radio", "aria-checked": String(tier === t), onclick: () => { tier = t; ask.value = t.ask; draw(); } }, h("b", null, t.label), h("span", null, t.note))));
      const ex = tier ? tierSamples(tier, u) : [];
      samples.replaceChildren(...(!tier ? [] : ex.length
        ? [h("span", { class: "eyebrow" }, "Work around " + tier.label), h("div", { class: "works", style: { marginTop: "12px" } }, ...ex.map(x => tile(x.w, x.c, () => playWork(x.w, x.c)))), h("p", { class: "hint", style: { marginTop: "10px" } }, "Films by people whose estimated range for this kind of work covers this level. Estimates by category, not prices they quoted.")]
        : [h("p", { class: "hint" }, tier.ask === 0 ? "Free work is for building a first portfolio. Raise it as soon as one client says yes." : "No sample films at this level yet.")]));
    };
    const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const fd = new FormData(f);
      if (fd.get("ask") === "" || fd.get("days") == null) return toast("Pick a starting price and a delivery time.");
      Object.assign(u, { ask: +fd.get("ask"), days: +fd.get("days"), live: true, rating: u.rating || 4.8, approvedAt: now() }); DB.save(); W = {}; toast(u.works.length ? "You're live. Clients can find you now." : "You're in. Add a film to show up in the market."); go("#/chats"); } },
      field("Starting price", tiers), samples,
      h("div", { class: "row2" }, field("Exact starting price (USD)", ask, "0 is fine"), h("div")),
      field("Typical delivery time", daysPicker(u.days), "from paid deposit to first cut"),
      h("p", { class: "hint" }, "This is how long a film takes you, not how fast you reply to messages. Same day is fine for quick edits and short reels."),
      h("div", { class: "notice" }, h("b", null, "Review. "), "A person on our team looks at every application before it goes live, usually within two days. In this demo you go live immediately."),
      h("div", null, h("button", { class: "btn primary big", type: "submit" }, "Submit application")));
    draw();
    page.append(f);
  }
}

/* Starting-price levels. `ask` is what gets saved; samples come from creators whose estimated range covers the level's middle. */
const PRICE_TIERS = [
  { ask: 0, label: "Free", note: "Building a portfolio", mid: null },
  { ask: 300, label: "Under $1k", note: "Short reels, quick edits", mid: 650 },
  { ask: 1000, label: "$1k to $3k", note: "Product and social films", mid: 2000 },
  { ask: 3000, label: "$3k to $8k", note: "Launch films, brand ads", mid: 5500 },
  { ask: 8000, label: "$8k and up", note: "Campaigns, long form", mid: 10000 },
];
function tierSamples(t, u){
  if (t.mid == null) return [];
  const pool = DB.filmed().filter(c => c.id !== u.id && c.est && c.est[0] <= t.mid && c.est[1] >= t.mid);
  const mine = pool.filter(c => c.cats.some(x => (u.cats || []).includes(x)));   // same kind of work first
  return [...mine, ...pool.filter(c => !mine.includes(c))].slice(0, 3).map(c => ({ w: c.works[0], c }));
}
const DAY_OPTS = [[0, "Same day"], [2, "1 to 2 days"], [5, "3 to 5 days"], [7, "About a week"], [14, "Two weeks"], [30, "A month or more"]];
function daysPicker(cur){
  const pick = DAY_OPTS.reduce((best, o) => Math.abs(o[0] - cur) < Math.abs(best[0] - cur) ? o : best, DAY_OPTS[3])[0];
  return h("div", { class: "chips" }, ...DAY_OPTS.map(([v, l]) => h("label", { class: "chip" + (v === pick ? " on" : "") }, h("input", { type: "radio", name: "days", value: v, checked: v === pick, style: { display: "none" }, onchange: e => { for (const x of e.target.closest(".chips").children) x.classList.toggle("on", x.contains(e.target)); } }), l)));
}

/* ---------- other creators' work: open to every signed-in creator, applicants included ---------- */
function vWork(m, q){
  const u = me(); const tab = CATS.includes(q.cat) ? q.cat : "";
  const all = DB.filmed().filter(c => c.id !== u.id).flatMap(c => c.works.map(w => ({ w, c })));
  const films = (tab ? all.filter(x => x.w[1] === tab) : DB.filmed().filter(c => c.id !== u.id).map(c => ({ w: c.works[0], c }))).slice(0, 60);
  const tabBtn = (id, label) => h("button", { role: "tab", "aria-pressed": String(tab === id), onclick: () => go("#/work" + (id ? "?cat=" + id : "")) }, label);
  m.append(h("section", { class: "wrap section" },
    h("div", { class: "stack", style: { gap: "12px", marginBottom: "24px" } }, h("h1", { class: "pname" }, "Work on Rolvo"), h("p", { class: "muted" }, "What clients see when they browse. Watch how other filmmakers present their films.")),
    h("div", { class: "filters", role: "tablist", "aria-label": "Category" }, tabBtn("", "All"), ...CATS.map(id => tabBtn(id, TAXONOMY[id].name))),
    films.length ? h("div", { class: "works" }, ...films.map(x => tile(x.w, x.c, () => playWork(x.w, x.c)))) : h("p", { class: "soonnote" }, "Coming soon")));
}

/* ---------- dashboard ---------- */
function dash(m, active, body){
  const u = me(); if (!u) return requireAuth(() => render()); if (!u.live) return go("#/apply");
  const n = pendingCount(u.id);
  const rail = h("nav", { class: "rail" }, ...[["chats", "Inbox", n], ["work", "Work"], ["profile", "Profile"], ["payouts", "Wallet"]].map(([k, l, c]) => h("a", { href: "#/" + k, "aria-current": String(k === active) }, l, c ? h("span", { class: "n" }, c) : null)));
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
    h("div", { class: "row2" }, field("Starting price (USD)", h("input", { class: "i", name: "ask", type: "number", min: "0", step: "1", value: c.ask ?? "" })), h("div")),
    field("Typical delivery time", daysPicker(c.days), "from paid deposit to first cut"),
    field("Categories", chipset("cats", CATS.map(id => [id, TAXONOMY[id].name]), c.cats)),
    field("Styles", chipset("styles", Object.entries(STYLES).map(([id, s]) => [id, s.name]), c.styles, 3), "up to 3"),
    field("Clients you work best with", chipset("fit", CLIENT_TYPES.map(t => [t.id, t.name]), c.fit)),
    field("Tools", chipset("tools", TOOLS.map(t => [t, t]), c.tools)),
    h("div", { class: "row between" }, h("button", { class: "btn primary", type: "submit" }, "Save"), h("button", { class: "btn quiet small", type: "button", onclick: () => { DB.signOut(); go("#/"); } }, "Sign out")));
  s.append(h("div", { class: "page-title" }, h("h2", null, "Profile"), h("a", { class: "link", href: "#/creator-preview" }, "See it as clients do →")),
    h("div", { class: "stack", style: { gap: "40px" } },
      h("div", null, h("span", { class: "eyebrow" }, "Price record"), h("div", { class: "stats", style: { marginTop: "14px" } }, h("div", { class: "stat" }, h("b", null, Number.isFinite(c.ask) ? money(c.ask) : "Not set"), h("span", null, "my ask")), h("div", { class: "stat" }, h("b", null, rangeText(c)), h("span", null, "shown range")), h("div", { class: "stat" }, h("b", null, c.closes.length), h("span", null, "closed")), h("div", { class: "stat" }, h("b", null, c.quotes.length), h("span", null, "open quotes")), h("div", { class: "stat" }, h("b", null, DB.breaksLeft(c.id)), h("span", null, "breaks left"))), h("p", { class: "hint", style: { marginTop: "10px" } }, "Every order that reaches contract adds its price here, closed or not. Clients see the range, never the list.")),
      h("div", null, h("span", { class: "eyebrow" }, "Work · " + c.works.length), h("div", { class: "works", style: { marginTop: "14px" } }, ...c.works.map(w => tile(w, c, () => playWork(w, c)))), filmPicker(c), h("p", { class: "hint", style: { marginTop: "10px" } }, "Add or reorder links below.")),
      f));
}
/* ---------- choose which films clients see ---------- */
// Shown films live in c.works (first = card cover); hidden ones wait in c.shelf, so every other view keeps reading c.works.
function filmLink(url){ const y = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url), v = /vimeo\.com\/(?:video\/)?(\d{6,11})/.exec(url);
  return y ? { yt: y[1], cover: `https://i.ytimg.com/vi/${y[1]}/hqdefault.jpg`, lb: true, link: "https://www.youtube.com/watch?v=" + y[1], on: "YouTube" } : v ? { vm: v[1], cover: "https://vumbnail.com/" + v[1] + ".jpg", link: "https://vimeo.com/" + v[1], on: "Vimeo" } : null; }
// Any public post or page: YouTube/Vimeo play inline, everything else (Instagram, LinkedIn, X, TikTok, a site) opens at the source.
const SITES = [[/(^|\.)instagram\.com$/, "Instagram"], [/(^|\.)linkedin\.com$/, "LinkedIn"], [/(^|\.)(x|twitter)\.com$/, "X"], [/(^|\.)tiktok\.com$/, "TikTok"], [/(^|\.)behance\.net$/, "Behance"], [/(^|\.)facebook\.com$/, "Facebook"], [/(^|\.)threads\.(net|com)$/, "Threads"], [/(^|\.)xiaohongshu\.com$/, "Xiaohongshu"], [/(^|\.)bilibili\.com$/, "Bilibili"], [/(^|\.)douyin\.com$/, "Douyin"]];
function workLink(url){
  const film = filmLink(url); if (film) return film;
  let u; try { u = new URL(url); } catch { return null; } if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, ""); const site = SITES.find(([re]) => re.test(host));
  return { link: u.href, on: site ? site[1] : host };
}
const sameWork = (a, b) => a && b && (a.yt ? a.yt === b.yt : a.vm ? a.vm === b.vm : a.link === b.link);
function filmPicker(c){
  c.shelf ||= [];
  const save = () => { DB.save(); render(); };
  const row = (w, shown, i) => h("div", { class: "workrow pick" }, h("span", { class: "thumb" }, cover(w)), h("div", null, w[0], h("small", null, shown ? (i === 0 ? "Card cover · shown" : "Shown") : "Hidden")),
    h("span", { class: "row", style: { gap: "6px", flexWrap: "nowrap" } }, shown && i > 0 ? h("button", { class: "btn quiet small", onclick: () => { c.works.unshift(c.works.splice(i, 1)[0]); save(); } }, "Make cover") : null,
    h("button", { class: "btn quiet small", onclick: () => { if (shown) c.shelf.push(c.works.splice(i, 1)[0]); else c.works.push(c.shelf.splice(i, 1)[0]); save(); } }, shown ? "Hide" : "Show")));
  const add = h("form", { class: "row", style: { gap: "8px", marginTop: "12px", flexWrap: "wrap" }, onsubmit: e => { e.preventDefault(); const fd = new FormData(add), m = workLink((fd.get("url") || "").trim());
      if (!m) return toast("Paste a full link, starting with https://");
      if ([...c.works, ...c.shelf].some(w => sameWork(w[5], m))) return toast("That link is already on your list.");
      m.by = c.name; c.works.push([fd.get("title").trim() || "Untitled", c.cats[0], c.styles[0], null, null, m]); save(); } },
    h("input", { class: "i", name: "url", type: "url", required: true, placeholder: "Link: Instagram, LinkedIn, X, YouTube…", style: { flex: "2 1 220px" } }), h("input", { class: "i", name: "title", maxlength: "60", placeholder: "Title", style: { flex: "1 1 140px" } }), h("button", { class: "btn", type: "submit" }, "Add link"));
  return h("div", { style: { marginTop: "22px" } }, h("span", { class: "eyebrow" }, "Choose your work"), h("p", { class: "hint", style: { margin: "8px 0 12px" } }, "Pick what clients see. The first one is your card cover."),
    h("div", { class: "worklist" }, ...c.works.map((w, i) => row(w, true, i)), ...c.shelf.map((w, i) => row(w, false, i))), add);
}
/* ---------- wallet ---------- */
const PAYOUT_COUNTRIES = [["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["IE", "Ireland"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"], ["SE", "Sweden"], ["PL", "Poland"], ["AU", "Australia"], ["NZ", "New Zealand"], ["JP", "Japan"], ["SG", "Singapore"], ["HK", "Hong Kong"], ["KR", "South Korea"], ["IN", "India"], ["AE", "UAE"], ["BR", "Brazil"], ["MX", "Mexico"]];
function vPayouts(s){
  const c = me(); const body = h("div", { class: "stack", style: { gap: "28px" } }, h("p", { class: "hint" }, "Loading your balance…"));
  s.append(h("div", { class: "page-title" }, h("h2", null, "Wallet")), body);
  Payouts.status(c).then(st => drawWallet(body, c, st)).catch(e => body.replaceChildren(h("div", { class: "notice warn" }, h("b", null, "Couldn't load your balance. "), e.message)));
}
function drawWallet(body, c, st){
  const m = st.method, canWithdraw = st.ready && st.available >= FEES.minPayout;
  const rows = DB.walletRows(c.id);
  const methodCard = !m
    ? h("div", { class: "card" }, h("span", { class: "eyebrow" }, "Payout method"),
        h("p", { class: "muted" }, st.submitted ? "Stripe is still checking your details. This usually takes a few minutes." : "Add the bank account or debit card your money goes to. You enter it on Stripe's secure page; Rolvo never sees the numbers."),
        h("div", null, h("button", { class: "btn primary", onclick: () => methodSheet(c) }, st.submitted ? "Continue on Stripe" : "Add payout method")))
    : h("div", { class: "card" }, h("span", { class: "eyebrow" }, "Payout method"),
        h("div", { class: "row between", style: { gap: "16px", flexWrap: "wrap" } },
          h("div", { class: "pmethod" }, h("b", null, m.label + " ···· " + m.last4), h("span", null, (m.kind === "card" ? "Debit card" : "Bank account") + (m.instant ? " · instant payouts available" : " · standard payouts"))),
          h("button", { class: "btn quiet small", onclick: () => st.mode === "live" ? Payouts.manage().catch(e => toast(e.message)) : methodSheet(c) }, st.mode === "live" ? "Manage on Stripe" : "Change")));
  body.replaceChildren(
    h("div", { class: "wallet" },
      h("div", { class: "wcard main" }, h("span", { class: "eyebrow" }, "Available"), h("b", { class: "wnum" }, money(st.available)),
        h("div", null, h("button", { class: "btn primary", disabled: !canWithdraw, onclick: () => withdrawSheet(c, st) }, "Withdraw")),
        h("span", { class: "hint" }, !st.ready ? "Add a payout method to withdraw." : st.available < FEES.minPayout ? "Smallest withdrawal is " + money(FEES.minPayout) + "." : "Standard is free. Instant costs " + FEES.instant * 100 + "%.")),
      h("div", { class: "wcard" }, h("span", { class: "eyebrow" }, "On hold"), h("b", { class: "wnum sm" }, money(st.pending)), h("span", { class: "hint" }, "Deposits held by Rolvo until the client passes your first cut.")),
      h("div", { class: "wcard" }, h("span", { class: "eyebrow" }, "Earned"), h("b", { class: "wnum sm" }, money(st.earned)), h("span", { class: "hint" }, "After the " + FEES.commission * 100 + "% platform fee. " + money(st.withdrawn) + " withdrawn."))),
    methodCard,
    h("div", null, h("span", { class: "eyebrow" }, "Activity"),
      rows.length ? h("div", { class: "tbl", style: { marginTop: "14px" } }, h("table", null, h("thead", null, h("tr", null, h("th", null, "When"), h("th", null, "What"), h("th", null, "Detail"), h("th", { style: { textAlign: "right" } }, "Amount"))), h("tbody", null, ...rows.map(t => t.type === "payout"
          ? h("tr", null, h("td", null, when(t.at)), h("td", null, "Withdrawal"), h("td", { class: "muted" }, (t.speed === "instant" ? "Instant" : "Standard") + " · " + t.method + (t.fee ? " · fee " + money(t.fee) : "")), h("td", { class: "num" }, "−" + money(t.amount)))
          : h("tr", null, h("td", null, when(t.at)), h("td", null, t.type === "deposit_release" ? "Deposit released" : "Balance released"), h("td", null, h("a", { href: "#/chat/" + t.orderId }, (DB.order(t.orderId) || {}).title || t.orderId)), h("td", { class: "num ok" }, "+" + money(t.amount)))))))
        : h("div", { class: "empty", style: { marginTop: "14px" } }, h("b", null, "No money yet."), h("span", null, "Your deposit lands here when a client passes your first cut; the balance when they approve the final."))));
}
function methodSheet(c){
  const country = h("select", { class: "i", name: "country" }, ...PAYOUT_COUNTRIES.map(([v, l]) => h("option", { value: v, selected: (c.payout && c.payout.country || "US") === v }, l)));
  const kids = [phead("Payout method", "Where your earnings are sent."), field("Country of your bank account", country)];
  if (Payouts.live()){
    const btn = h("button", { class: "btn primary big", onclick: async () => { btn.disabled = true; btn.textContent = "Opening Stripe…"; try { await Payouts.setup(country.value); } catch (e) { btn.disabled = false; btn.textContent = "Continue to Stripe"; toast(e.message); } } }, "Continue to Stripe");
    kids.push(btn, h("p", { class: "hint" }, "Stripe asks for your legal name, date of birth, address, and a bank account or debit card. It takes about five minutes."));
  } else {
    const pick = m => { DB.setPayoutMethod(c.id, { ...m, country: country.value, mode: "demo" }); closeSheet(); toast("Payout method added."); render(); };
    kids.push(h("div", { class: "demo-pay" }, payIcon("card"), h("div", null, h("b", null, "Stripe isn't connected yet"), h("span", null, "Live, Stripe's own page opens here and collects your bank account or debit card. In demo mode pick a sample method; no real numbers are entered anywhere."))),
      h("button", { class: "btn big", onclick: () => pick({ kind: "card", label: "Visa debit", last4: "4242", instant: country.value === "US" }) }, "Sample debit card ···· 4242"),
      h("button", { class: "btn big", onclick: () => pick({ kind: "bank", label: "Bank account", last4: "6789", instant: false }) }, "Sample bank account ···· 6789"));
  }
  openSheet(kids);
}
function withdrawSheet(c, st){
  let instant = false;
  const amount = h("input", { class: "i", type: "number", name: "amount", min: String(FEES.minPayout), max: String(st.available), step: "0.01", value: String(st.available), required: true, inputmode: "decimal" });
  const sum = h("div", { class: "kv" });
  const btn = h("button", { class: "btn primary big", type: "submit" }, "Withdraw");
  const draw = () => { const a = Math.min(st.available, Math.max(0, +amount.value || 0)), fee = instant ? cents(a * FEES.instant) : 0;
    sum.replaceChildren(h("dt", null, "Fee"), h("dd", null, fee ? money(fee) : "Free"), h("dt", null, "You receive"), h("dd", null, h("b", { style: { fontWeight: 500 } }, money(cents(a - fee)))), h("dt", null, "Arrives"), h("dd", null, instant ? "Within minutes" : "1 to 2 business days"), h("dt", null, "To"), h("dd", null, st.method.label + " ···· " + st.method.last4)); };
  const seg = h("div", { class: "seg", role: "tablist" }, ...[[false, "Standard · free"], [true, "Instant · " + FEES.instant * 100 + "%"]].map(([v, l]) => h("button", { type: "button", role: "tab", "aria-selected": String(instant === v), disabled: v && !st.method.instant, title: v && !st.method.instant ? "Instant payouts need a debit card" : null, onclick: e => { instant = v; for (const b of seg.children) b.setAttribute("aria-selected", String(b === e.currentTarget)); draw(); } }, l)));
  amount.oninput = draw; draw();
  const f = h("form", { class: "form", onsubmit: async e => { e.preventDefault(); btn.disabled = true; btn.textContent = "Sending…";
      const err = await Payouts.withdraw(c, +amount.value, instant);
      if (err){ btn.disabled = false; btn.textContent = "Withdraw"; return toast(err); }
      closeSheet(); toast(instant ? "On its way. It should arrive within minutes." : "On its way. Expect it in 1 to 2 business days."); render(); } },
    field("Amount (USD)", amount, money(st.available) + " available"), seg, sum, btn,
    st.method.instant ? null : h("p", { class: "hint" }, "Instant payouts need a debit card as your payout method."));
  openSheet([phead("Withdraw", "From your Rolvo balance to your own account."), f]);
}
function vPreview(m){
  const c = me(); if (!c) return requireAuth(() => render());
  m.append(h("section", { class: "wrap section" }, h("div", { class: "notice", style: { marginBottom: "28px" } }, h("b", null, "Preview. "), "This is your profile as clients see it on the main site. ", h("a", { class: "link", href: "../#/creator/" + c.id }, "Open there →")),
    h("div", { class: "profile" }, h("div", { class: "stack", style: { gap: "28px" } }, h("div", { class: "stack", style: { gap: "14px" } }, h("span", { class: "eyebrow" }, "@" + c.handle + " · " + c.where), h("h1", { class: "pname" }, c.name), h("p", { class: "muted", style: { fontSize: "17px", maxWidth: "56ch" } }, c.bg), h("div", { class: "chips" }, ...c.cats.map(x => h("span", { class: "chip on" }, TAXONOMY[x].name)), ...c.styles.map(s => styleChip(s)), ...c.tools.map(t => h("span", { class: "chip" }, t)))), h("div", { class: "works" }, ...c.works.map(w => tile(w, c, () => playWork(w, c))))),
      h("aside", { class: "side" }, h("div", { class: "card" }, h("div", { class: "stats" }, h("div", { class: "stat" }, h("b", null, rangeText(c)), h("span", null, "typical")), h("div", { class: "stat" }, h("b", null, daysText(c.days)), h("span", null, "delivery")), h("div", { class: "stat" }, h("b", null, c.rating ? "★ " + c.rating.toFixed(1) : "New"), h("span", null, c.done + " done"))), h("button", { class: "btn primary big", disabled: true }, "Start a project"))))));
}

bootShared();
