/* Rolvo Market — merchant site. Public work and creators; contacting anyone requires an account + onboarding. */
const APP = "merchant";
const FREEMAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail|qq|163|126|aol|gmx)\./i;
let W = {};
const AFTER = { get(){ try { return JSON.parse(sessionStorage.getItem("pfm.after")); } catch { return null; } }, set(v){ v ? sessionStorage.setItem("pfm.after", JSON.stringify(v)) : sessionStorage.removeItem("pfm.after"); } };
const CATS = Object.keys(TAXONOMY);
const allWorks = () => DB.roster().flatMap(c => c.works.map(w => ({ w, c })));

function gate(after, then){ requireAuth(u => { if (u.onboarded) return then(u); AFTER.set(after); go("#/onboarding"); }); }
const hireCTA = c => h("button", { class: "btn primary", onclick: () => { closeSheet(); gate({ type: "hire", creatorId: c.id }, () => startProject(c)); } }, "Start a project with " + first(c.name));

function header(){
  const u = me(); const n = pendingCount(u && u.id);
  const links = [["#/", "Home"], ["#/work", "Work"]]; if (u) links.push(["#/chats", "Messages", n]);
  const right = u ? [h("button", { class: "btn primary small", onclick: () => gate({ type: "find" }, () => go("#/find")) }, "Start a project"), h("a", { href: "#/account", "aria-label": "Account" }, avatar(u))]
    : [h("button", { class: "btn quiet small", onclick: () => openSignIn() }, "Sign in"), h("button", { class: "btn primary small", onclick: () => gate({ type: "find" }, () => go("#/find")) }, "Start a project")];
  mountHeader({ brand: "Rolvo", sub: "Market", links, right, home: "#/" });
}
function render(){
  header();
  const r = route(); const m = $("#main"); m.replaceChildren(); const v = r.parts[0];
  if (!v) vHome(m);
  else if (v === "work") vWork(m, r.q);
  else if (v === "creators") vWork(m, { cat: (r.q.cats || "").split(",")[0] || "", q: r.q.q || "" });   // the creator list is gone: old links land on Work
  else if (v === "creator") vCreator(m, r.parts[1]);
  else if (v === "find") vFind(m, r.q);
  else if (v === "onboarding") vOnboarding(m);
  else if (v === "chats") vChats(m, null);
  else if (v === "chat") vChats(m, r.parts[1]);
  else if (v === "orders") return go("#/chats");
  else if (v === "order") return go("#/chat/" + r.parts[1]);
  else if (v === "account") vAccount(m);
  else return go("#/");
  if (!["onboarding", "chats", "chat"].includes(v)) m.append(footer());
}

/* ---------- public ---------- */
const gallery = (items, limit) => h("div", { class: "gallery" }, ...items.slice(0, limit || items.length).map(({ w, c }) => tile(w, c, () => go("#/creator/" + c.id))));   // a film opens its maker's page; films play there
function ccard(c, why){
  const est = DB.priceRange(c).est;
  return hoverPlay(h("a", { class: "ccard", href: "#/creator/" + c.id }, face(c),
    h("span", { class: "top" }, h("span", { class: est ? "est" : null, title: est ? "Estimate for this kind of work. They haven't set rates yet." : null }, rangeText(c)), h("span", null, c.tz || c.source || "")),
    h("span", { class: "cap" }, h("b", null, c.name), h("span", null, [c.where, c.bg.replace(/\.$/, "")].filter(Boolean).join(" · ")), why && why.length ? h("span", { class: "why" }, ...why.map(w => h("i", null, w))) : null)), c.works[0]);
}
const cgrid = (list) => h("div", { class: "cgrid" }, ...list.map(({ c, why }) => ccard(c, why)));
function heroSearch(){
  const i = h("input", { class: "i", type: "search", placeholder: "Try “product ad for a skincare launch” or “anime short”", "aria-label": "Search work" });
  return h("form", { class: "hsearch", onsubmit: e => { e.preventDefault(); go("#/work" + (i.value.trim() ? "?q=" + encodeURIComponent(i.value.trim()) : "")); } }, i, h("button", { class: "btn primary", type: "submit" }, "Search"));
}
function vHome(m){
  const items = allWorks(); const strip = DB.filmed().slice(0, 12).map(c => ({ w: c.works[0], c }));
  m.append(h("section", { class: "wrap hero" },
    h("div", { class: "stack", style: { gap: "22px" } },
      h("h1", null, "The filmmakers behind the best ", h("em", null, "AI video"), "."),
      h("p", { class: "lead" }, "Find the person who made the film you liked. Pay into escrow, review watermarked cuts, release on approval."),
      heroSearch(),
      h("div", { class: "popular" }, h("span", { class: "dim small" }, "Popular"), ...[["biz", "Brand ads"], ["film", "Short films"], ["anim", "Animation"], ["mv", "Music videos"], ["reels", "UGC & Reels"]].map(([k, l]) => h("a", { class: "chip", href: "#/work?cat=" + k }, l))),
      h("div", { class: "row small" }, h("button", { class: "link", onclick: () => gate({ type: "find" }, () => go("#/find")) }, "Or describe the project and we'll match you →"))),
    h("div", { class: "strip" }, ...strip.map(({ w, c }) => tile(w, c, () => playWork(w, c, hireCTA(c)))))));
  const byCat = CATS.map(k => ({ k, list: DB.roster().filter(c => c.cats[0] === k) })).filter(x => x.list.length);
  m.append(h("section", { class: "wrap section" }, h("div", { class: "sec-head" }, h("h2", null, "Browse by category")),
    h("div", { class: "cats" }, ...byCat.map(({ k, list }) => h("a", { class: "catcard", href: "#/work?cat=" + k }, cover(list[0].works[0]), h("span", { class: "cap" }, h("b", null, TAXONOMY[k].name), h("span", null, list.length + " creators")))))));
  m.append(h("section", { class: "wrap section" }, h("div", { class: "sec-head" }, h("h2", null, "Selected work"), h("a", { class: "link", href: "#/work" }, "All work →")), gallery(DB.filmed().slice(12).filter((_, i) => i % 2 === 0).map(c => ({ w: c.works[1] || c.works[0], c })), 8)));
}
function vWork(m, q){
  const cat = q.cat || null, words = (q.q || "").toLowerCase().split(/\s+/).filter(Boolean);
  const hay = x => [x.w[0], x.c.name, x.c.bg, x.c.where, TAXONOMY[x.w[1]].name, ...x.c.styles.map(s => STYLES[s].name)].join(" ").toLowerCase();
  const items = allWorks().filter(x => (!cat || x.w[1] === cat || x.c.cats.includes(cat)) && words.every(wd => hay(x).includes(wd)));
  m.append(h("section", { class: "wrap section" }, h("div", { class: "sec-head" }, h("h2", null, "Work"), h("p", null, items.length + " films by " + new Set(items.map(x => x.c.id)).size + " creators. Every one was made by the creator you'd hire.")),
    h("div", { class: "filters" }, h("button", { "aria-pressed": String(!cat), onclick: () => go("#/work") }, "All"), ...CATS.map(id => h("button", { "aria-pressed": String(cat === id), onclick: () => go("#/work?cat=" + id) }, TAXONOMY[id].name))), gallery(items)));
}

/* creators: cover cards + filter drawer */
const SORTS = [["", "Best match"], ["price", "Price: low to high"], ["-price", "Price: high to low"], ["films", "Most films"]];
const F = { parse(q){ return { sort: q.sort || "", q: q.q || "", min: +q.min || 0, max: +q.max || 0, region: q.region || "", cats: (q.cats || "").split(",").filter(Boolean), styles: (q.styles || "").split(",").filter(Boolean), days: +q.days || 0, joined: +q.joined || 0 }; },
  count(f){ return (f.min || f.max ? 1 : 0) + (f.region ? 1 : 0) + f.cats.length + f.styles.length + (f.days ? 1 : 0) + (f.joined ? 1 : 0); },
  url(f){ const p = new URLSearchParams(); if (f.q) p.set("q", f.q); if (f.sort) p.set("sort", f.sort); if (f.min) p.set("min", f.min); if (f.max) p.set("max", f.max); if (f.region) p.set("region", f.region); if (f.cats.length) p.set("cats", f.cats.join(",")); if (f.styles.length) p.set("styles", f.styles.join(",")); if (f.days) p.set("days", f.days); if (f.joined) p.set("joined", 1); const s = p.toString(); return "#/creators" + (s ? "?" + s : ""); },
  apply(f){ return DB.match({ text: f.q, strict: !!f.q }).filter(({ c }) => { const r = DB.priceRange(c);
    if (f.min && r.hi < f.min) return false; if (f.max && r.lo > f.max) return false; if (f.region && c.region !== f.region) return false;
    if (f.cats.length && !f.cats.some(x => c.cats.includes(x))) return false; if (f.styles.length && !f.styles.some(x => c.styles.includes(x))) return false;
    if (f.days && c.days > f.days) return false; if (f.joined && c.real && !c.claimed) return false; return true; }); } };
function openFilters(f){ openSheet([phead("Filters"), filterForm(f, false)]); }
function filterForm(f, inline){
  const cb = (name, items, sel) => h("div", { class: "chips" }, ...items.map(([v, l]) => h("label", { class: "chip" + (sel.includes(v) ? " on" : "") }, h("input", { type: "checkbox", name, value: v, checked: sel.includes(v), style: { display: "none" }, onchange: e => e.target.parentNode.classList.toggle("on", e.target.checked) }), l)));
  const radio = (name, items, sel) => h("div", { class: "chips" }, ...items.map(([v, l]) => h("label", { class: "chip" + (String(sel) === String(v) ? " on" : "") }, h("input", { type: "radio", name, value: v, checked: String(sel) === String(v), style: { display: "none" }, onchange: e => { for (const x of e.target.closest(".chips").querySelectorAll("label")) x.classList.toggle("on", x.firstChild.checked); } }), l)));
  const min = h("input", { class: "i", name: "min", type: "number", min: "0", step: "100", value: f.min || "", placeholder: "0" }), max = h("input", { class: "i", name: "max", type: "number", min: "0", step: "100", value: f.max || "", placeholder: "No limit" });
  const quick = h("div", { class: "chips" }, ...[["Under $1k", 0, 1000], ["$1–3k", 1000, 3000], ["$3–6k", 3000, 6000], ["$6k+", 6000, 0]].map(([l, a, b]) => h("button", { class: "chip", type: "button", onclick: () => { min.value = a || ""; max.value = b || ""; if (inline) form.requestSubmit(); } }, l)));
  const form = h("form", { class: "form" + (inline ? " side" : ""), onchange: inline ? () => form.requestSubmit() : null, onsubmit: e => { e.preventDefault(); const fd = new FormData(form);
    go(F.url({ q: f.q, sort: f.sort, min: +fd.get("min") || 0, max: +fd.get("max") || 0, region: fd.get("region") || "", cats: fd.getAll("cats"), styles: fd.getAll("styles"), days: +fd.get("days") || 0, joined: +fd.get("joined") || 0 })); if (!inline) closeSheet(); } },
    inline ? h("div", { class: "row between" }, h("b", { class: "side-h" }, "Filters"), F.count(f) ? h("button", { class: "link small", type: "button", onclick: () => go(F.url({ q: f.q, sort: f.sort, min: 0, max: 0, region: "", cats: [], styles: [], days: 0, joined: 0 })) }, "Clear all") : null) : null,
    h("div", { class: "fgroup" }, h("span", { class: "eyebrow" }, "Price per film"), h("div", { class: "range" }, min, "to", max), quick, h("small", { class: "dim" }, "Estimates until a creator sets rates")),
    h("div", { class: "fgroup" }, h("span", { class: "eyebrow" }, "Time zone"), radio("region", [["", "Anywhere"], ...REGIONS], f.region)),
    h("div", { class: "fgroup" }, h("span", { class: "eyebrow" }, "Category"), cb("cats", CATS.map(id => [id, TAXONOMY[id].name]), f.cats)),
    h("div", { class: "fgroup" }, h("span", { class: "eyebrow" }, "Style"), cb("styles", Object.entries(STYLES).map(([id, s]) => [id, s.name]), f.styles)),
    h("div", { class: "row2" }, h("div", { class: "fgroup" }, h("span", { class: "eyebrow" }, "Typical turnaround"), radio("days", [["", "Any"], [7, "≤ 7 days"], [14, "≤ 14 days"]], f.days || "")), h("div", { class: "fgroup" }, h("span", { class: "eyebrow" }, "Availability"), radio("joined", [["", "Everyone"], [1, "On Rolvo now"]], f.joined || ""))),
    inline ? null : h("div", { class: "row between" }, h("button", { class: "btn quiet", type: "button", onclick: () => { go(F.url({ q: f.q, sort: f.sort, min: 0, max: 0, region: "", cats: [], styles: [], days: 0, joined: 0 })); closeSheet(); } }, "Clear all"), h("button", { class: "btn primary", type: "submit" }, "Show creators")));
  return form;
}
function vCreators(m, q){
  const f = F.parse(q); const matches = F.apply(f); const n = F.count(f);
  const input = h("input", { class: "i boxed", type: "search", value: f.q, placeholder: "Search by style, tool, name" });
  const chips = [];
  const drop = (patch) => go(F.url({ ...f, ...patch }));
  if (f.min || f.max) chips.push([(f.min ? money(f.min) : "$0") + "–" + (f.max ? money(f.max) : "∞"), () => drop({ min: 0, max: 0 })]);
  if (f.region) chips.push([REGIONS.find(r => r[0] === f.region)[1], () => drop({ region: "" })]);
  f.cats.forEach(c => chips.push([TAXONOMY[c].name, () => drop({ cats: f.cats.filter(x => x !== c) })]));
  f.styles.forEach(s => chips.push([STYLES[s].name, () => drop({ styles: f.styles.filter(x => x !== s) })]));
  if (f.days) chips.push(["≤ " + f.days + " days", () => drop({ days: 0 })]);
  if (f.joined) chips.push(["On Rolvo now", () => drop({ joined: 0 })]);
  const pr = c => DB.priceRange(c).lo;
  const sorted = f.sort === "price" ? [...matches].sort((a, b) => pr(a.c) - pr(b.c)) : f.sort === "-price" ? [...matches].sort((a, b) => DB.priceRange(b.c).hi - DB.priceRange(a.c).hi) : f.sort === "films" ? [...matches].sort((a, b) => b.c.works.length - a.c.works.length) : matches;
  const sort = h("select", { class: "i sort", "aria-label": "Sort", onchange: e => go(F.url({ ...f, sort: e.target.value })) }, ...SORTS.map(([v, l]) => h("option", { value: v, selected: f.sort === v }, l)));
  m.append(h("section", { class: "wrap section browse" },
    h("aside", { class: "browse-side" }, filterForm(f, true)),
    h("div", { class: "browse-main" },
      h("div", { class: "toolbar" }, h("form", { onsubmit: e => { e.preventDefault(); go(F.url({ ...f, q: input.value.trim() })); } }, input, h("button", { class: "btn primary", type: "submit" }, "Search")), h("button", { class: "btn only-narrow", onclick: () => openFilters(f) }, "Filters" + (n ? " · " + n : ""))),
      h("div", { class: "resbar" }, h("span", { class: "small muted" }, sorted.length + (sorted.length === 1 ? " creator" : " creators") + (f.q ? " for “" + f.q + "”" : "")), h("label", { class: "small dim sortl" }, "Sort ", sort)),
      chips.length ? h("div", { class: "active" }, ...chips.map(([l, fn]) => h("span", { class: "chip on" }, l, h("button", { onclick: fn, "aria-label": "Remove" }, "×")))) : null,
      sorted.length ? cgrid(sorted.map(x => ({ c: x.c, why: f.q ? x.why : [] }))) : h("div", { class: "empty" }, h("b", null, "No one matches all of that."), h("span", null, "Loosen a filter; our crawler is inviting creators who make it."), h("a", { class: "btn", href: "#/work" }, "All work")))));
}
function vCreator(m, id){
  const c = DB.creator(id); if (!c || !c.live) return m.append(h("div", { class: "wrap section" }, h("div", { class: "empty" }, "Creator not found.")));
  const reviews = DB.reviewsFor(c.id);
  m.append(h("section", { class: "wrap section profile" },
    h("div", { class: "stack", style: { gap: "36px" } },
      h("div", { class: "stack", style: { gap: "14px" } }, h("span", { class: "eyebrow" }, ["@" + c.handle, c.where, c.tz].filter(Boolean).join(" · ")), h("h1", { class: "pname" }, c.name), h("p", { class: "muted", style: { fontSize: "17px", maxWidth: "56ch" } }, c.bg),
        h("div", { class: "chips" }, ...c.cats.map(x => h("span", { class: "chip on" }, TAXONOMY[x].name)), ...c.styles.map(s => styleChip(s)), ...c.tools.map(t => h("span", { class: "chip" }, t))),
        c.real && !c.claimed ? h("div", { class: "unclaimed" }, h("span", null, h("b", null, "Not on Rolvo yet. "), `This profile was built from ${c.name}'s public work. Start a project and we'll send them your brief with an invite; the chat goes live when they claim the profile. `, h("a", { class: "link", href: c.social, target: "_blank", rel: "noopener" }, (c.source === "Portfolio" ? "Their site" : "Their " + c.source) + " ↗"))) : null),
      c.works.length ? h("div", { class: "works" }, ...c.works.map(w => tile(w, c, () => playWork(w, c, hireCTA(c)))))
        : h("div", { class: "nofilm" }, h("span", null, "No films linked here yet."), h("a", { class: "link", href: c.social, target: "_blank", rel: "noopener" }, "See " + first(c.name) + "'s work on " + (c.source === "Portfolio" ? "their site" : c.source) + " ↗")),
      h("div", null, h("span", { class: "eyebrow" }, "Reviews · " + reviews.length), reviews.length ? reviews.map(rv => h("div", { class: "rev" }, h("span", { class: "s" }, "★".repeat(rv.stars) + "☆".repeat(5 - rv.stars)), h("span", null, rv.text), h("span", { class: "small dim" }, DB.nameOf(rv.from) + " · " + when(rv.at)))) : h("p", { class: "hint", style: { marginTop: "10px" } }, "No platform reviews yet."))),
    h("aside", { class: "side" },
      h("div", { class: "card" },
        h("div", { class: "stats" }, h("div", { class: "stat" }, h("b", null, rangeText(c)), h("span", null, DB.priceRange(c).est ? "estimate" : "typical")), h("div", { class: "stat" }, h("b", null, c.days + "d"), h("span", null, "turnaround")), c.rating ? h("div", { class: "stat" }, h("b", null, "★ " + c.rating.toFixed(1)), h("span", null, c.done + " done")) : h("div", { class: "stat" }, h("b", null, c.works.length), h("span", null, "public films"))),
        h("p", { class: "hint" }, DB.priceRange(c).est ? `What ${TAXONOMY[c.cats[0]].name.toLowerCase()} work like this usually closes for. ${c.name} hasn't set rates; you agree the real price in chat.` : `From ${first(c.name)}'s starting price (${money(c.ask)})` + (c.closes.length ? ` and ${c.closes.length} closed order${c.closes.length > 1 ? "s" : ""}` : "") + "."),
        h("button", { class: "btn primary big", style: { width: "100%" }, onclick: () => gate({ type: "hire", creatorId: c.id }, () => startProject(c)) }, "Start a project"),
        !me() ? h("p", { class: "hint" }, "Sign in and a few questions about you and the job come first. Then the chat opens.") : null))));
}
function startProject(c){
  const u = me(); const p = u.profile || {};
  const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const fd = new FormData(f);
    const o = DB.createOrder({ clientId: u.id, creatorId: c.id, title: fd.get("title").trim(), brief: fd.get("brief").trim(), cat: fd.get("cat") || null, opt: p.opt || null, style: fd.get("style") || null, price: Number(fd.get("price")) || c.ask });
    AFTER.set(null); closeSheet(); go("#/chat/" + o.id); } },
    field("Project name", h("input", { class: "i", name: "title", required: true, minlength: "3", maxlength: "60", placeholder: "e.g. Lumen cold brew · launch film" })),
    field("The job", h("textarea", { class: "i", name: "brief", required: true, minlength: "10", placeholder: "Deliverables, length, ratios, where it runs, deadline, references", value: p.brief || p.goal || "" })),
    h("div", { class: "row3" },
      field("Category", h("select", { class: "i", name: "cat" }, h("option", { value: "" }, "—"), ...CATS.map(id => h("option", { value: id, selected: p.cat === id }, TAXONOMY[id].name)))),
      field("Style", h("select", { class: "i", name: "style" }, h("option", { value: "" }, "—"), ...Object.entries(STYLES).map(([id, s]) => h("option", { value: id, selected: (p.styles || [])[0] === id }, s.name)))),
      field("Your offer (USD)", h("input", { class: "i", name: "price", type: "number", min: "50", step: "50", value: c.ask }), "typical " + rangeText(c))),
    h("p", { class: "hint" }, "Opens a chat with the order pinned on top. Nothing is paid until you both accept terms."),
    h("button", { class: "btn primary", type: "submit" }, "Open chat"));
  openSheet([phead("Start a project", "with " + c.name), f]);
}
function vFind(m, q){
  const u = me(); if (!u || !u.onboarded) return gate({ type: "find" }, () => render());
  const p = u.profile || {}; const budget = p.budget ? p.budget.split("-").map(Number) : null;
  const matches = DB.match({ cat: p.cat, opt: p.opt, styles: p.styles || [], type: p.type, budget, text: q.q || "", strict: true });
  const ctx = [];
  if (p.cat) ctx.push(h("span", { class: "chip on" }, TAXONOMY[p.cat].name + (p.opt ? " › " + TAXONOMY[p.cat].options.find(o => o.id === p.opt).name : "")));
  (p.styles || []).forEach(s => ctx.push(styleChip(s, true)));
  if (budget) ctx.push(h("span", { class: "chip" }, money(budget[0]) + "–" + (budget[1] > 500000 ? "∞" : money(budget[1]))));
  m.append(h("section", { class: "wrap section" },
    h("div", { class: "sec-head" }, h("div", null, h("h2", null, "Made for you"), h("div", { class: "chips", style: { marginTop: "14px" } }, ...ctx)), h("button", { class: "btn small", onclick: () => { W = { step: 1 }; go("#/onboarding"); } }, "Change the brief")),
    matches.length ? cgrid(matches) : h("div", { class: "empty" }, h("b", null, "No exact match yet."), h("a", { class: "btn", href: "#/work" }, "All work"))));
}

/* ---------- onboarding ---------- */
const VQ1 = { name: "What's your name?", role: "What's your role there?", company: "Which company is this for?", website: "What's the company website?", type: "What kind of company is it?", size: "Roughly how big is the team?" };
const VQ5 = { budget: "What's your budget per film?", cadence: "How often do you need films?", industry: "What industry are you in?", brief: "Describe the job in a sentence or two." };
function vOnboarding(m){
  const u = me(); if (!u) return requireAuth(() => render());
  const p = u.profile || {}; W.step ??= 0; scrollTo(0, 0);
  const total = W.describe ? 3 : 5; const shown = W.describe ? [0, 1, 4] : [0, 1, 2, 3, 4]; const n = shown.indexOf(W.step) + 1;
  const page = h("div", { class: "flow-page" }); m.append(page);
  const head = (title, lead, extra) => page.append(h("div", null, h("div", { class: "row between", style: { marginBottom: "22px" } }, h("span", { class: "counter" }, `${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`), W.step > 0 ? h("button", { class: "link", onclick: () => { W.step = shown[shown.indexOf(W.step) - 1]; render(); } }, "Back") : h("button", { class: "link", onclick: () => { AFTER.set(null); go("#/"); } }, "Skip for now")), h("div", { class: "progress" }, h("i", { style: { width: (n / total * 100) + "%" } })), h("h1", { style: { marginTop: "36px" } }, title), lead ? h("p", { class: "lead" }, lead) : null, extra ? h("div", { style: { marginTop: "18px" } }, extra) : null));

  if (W.step === 0){
    const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const o = Object.fromEntries(new FormData(f));
      const host = (o.website || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
      const work = (o.workEmail || "").trim().toLowerCase(); const dom = work.split("@")[1] || "";
      // instant only when the work email is the one they just proved (OTP / Google) and its domain is the website's; everything else goes to manual review
      u.name = o.name.trim(); u.org = o.company.trim(); u.type = o.type;
      u.verified = work === u.email && !FREEMAIL.test(dom) && !!host && (dom === host || host.endsWith("." + dom) || dom.endsWith("." + host));
      DB.saveClientProfile(u.id, { role: o.role.trim(), website: host, type: o.type, size: o.size, workEmail: work }); W.step = 1; render(); } },
      h("div", { class: "row2" }, field("Your name", h("input", { class: "i", name: "name", required: true, value: u.name || "", placeholder: "Full name" })), field("Role", h("input", { class: "i", name: "role", required: true, value: p.role || "", placeholder: "Founder, Head of Growth, Producer" }))),
      h("div", { class: "row2" }, field("Company", h("input", { class: "i", name: "company", required: true, value: u.org || "", placeholder: "Company or studio" })), field("Website", h("input", { class: "i", name: "website", required: true, value: p.website || "", placeholder: "company.com" }))),
      h("div", { class: "row2" }, field("You are a", h("select", { class: "i", name: "type", required: true }, CLIENT_TYPES.map(t => h("option", { value: t.id, selected: (p.type || u.type) === t.id }, t.name)))), field("Team size", h("select", { class: "i", name: "size" }, ...["1-10", "11-50", "51-200", "200+"].map(v => h("option", { value: v, selected: p.size === v }, v))))),
      field("Work email", h("input", { class: "i", name: "workEmail", type: "email", required: true, value: p.workEmail || (u.email && !FREEMAIL.test(u.email.split("@")[1]) ? u.email : ""), placeholder: "you@company.com" }), u.email && !FREEMAIL.test(u.email.split("@")[1]) ? null : "where creators and contracts reach you"),
      h("div", { class: "verify" }, h("span", { class: "eyebrow", style: { paddingTop: "2px" } }, "ID"), h("span", null, h("b", null, "Signed in with " + (u.email || u.phone) + ". "), u.email && !FREEMAIL.test(u.email.split("@")[1]) ? "If that domain matches your website you're verified instantly. " : "", "Otherwise a person on our team reviews your company before your first contract, usually within a day.")),
      h("div", null, h("button", { class: "btn primary big", type: "submit" }, "Continue")));
    head("Tell us who you are.", "Creators see this before they accept a project. It also lets us verify you're who you say.", Voice.button(f, VQ1, "Hi. A few quick questions so creators know who they're talking to."));
    page.append(f); return;
  }
  if (W.step === 1){
    if (!W.describe){
      head("What are you making?", "Pick the kind of film, or describe it and let us read it.");
      page.append(h("div", { class: "opts" }, ...CATS.map(id => h("button", { class: "opt", "aria-pressed": String(W.cat === id), onclick: () => { W.cat = id; W.opt = null; W.styles = []; W.step = 2; render(); } }, h("b", null, TAXONOMY[id].name), h("p", null, TAXONOMY[id].blurb)))),
        h("div", null, h("button", { class: "link", onclick: () => { W.describe = true; render(); } }, "Describe it instead, or drop a reference →")));
      return;
    }
    head("Describe it.", "A reference plus one paragraph is enough.");
    let read = null;
    const dz = h("div", { class: "dropzone" }, h("b", { style: { color: "var(--fg)", fontWeight: 500 } }, "Drop a reference video or screenshot"), h("span", { class: "small" }, "Optional. Stays on your device in this demo."), h("input", { type: "file", accept: "video/*,image/*", onchange: e => pick(e.target.files[0]) }));
    function pick(f){ if (!f) return; const url = URL.createObjectURL(f); dz.classList.add("on"); dz.replaceChildren(f.type.startsWith("video") ? h("video", { class: "thumb", src: url, muted: true, autoplay: true, loop: true, playsinline: true }) : h("img", { class: "thumb", src: url, alt: "" }), h("span", { class: "small" }, f.name)); }
    dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("on"); }); dz.addEventListener("dragleave", () => dz.classList.remove("on")); dz.addEventListener("drop", e => { e.preventDefault(); pick(e.dataTransfer.files[0]); });
    const ta = h("textarea", { class: "i", value: W.text || "", placeholder: "e.g. 30-second launch film for our invoicing app. Storytelling, one founder, feels like a short film, not a demo.", style: { minHeight: "110px" } });
    const out = h("div", { class: "readout", hidden: true });
    function show(){ read = DB.readBrief(ta.value); const cat = read.cat && TAXONOMY[read.cat]; const opt = cat && cat.options.find(o => o.id === read.opt);
      if (!read.styles.length && opt) read.styles = opt.styles.slice(0, 2); out.hidden = false;
      out.replaceChildren(h("span", { class: "eyebrow" }, "We read this as"), h("div", { class: "row" }, cat ? h("b", { style: { fontWeight: 500 } }, cat.name) : h("span", { class: "muted" }, "Category unclear"), opt ? ["›", h("b", { style: { fontWeight: 500 } }, opt.name)] : null),
        h("div", { class: "chips" }, ...Object.keys(STYLES).filter(s => !opt || opt.styles.includes(s) || read.styles.includes(s)).map(s => { const c = styleChip(s, read.styles.includes(s)); c.style.cursor = "pointer"; c.onclick = () => { read.styles = read.styles.includes(s) ? read.styles.filter(x => x !== s) : [...read.styles, s].slice(-2); show(); }; return c; })),
        h("div", { class: "row" }, cat ? h("button", { class: "btn primary", onclick: () => { W.cat = read.cat; W.opt = read.opt; W.styles = read.styles; W.text = ta.value; W.step = 4; render(); } }, "Continue") : null, h("button", { class: "btn", onclick: () => { W.describe = false; W.text = ta.value; render(); } }, "Pick the category myself"))); }
    page.append(dz, field("The job", ta), h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => { if (ta.value.trim().length < 8) return toast("Say a little more about the job."); show(); } }, "Read my brief"), h("button", { class: "link", onclick: () => { W.describe = false; render(); } }, "Back to categories")), out);
    return;
  }
  if (W.step === 2){
    const c = TAXONOMY[W.cat]; head(c.ask);
    page.append(h("div", { class: "opts" }, ...c.options.map(o => h("button", { class: "opt", "aria-pressed": String(W.opt === o.id), onclick: () => { W.opt = o.id; W.pool = o.styles.slice(); W.round = 0; W.winners = []; W.step = 3; render(); } }, h("b", null, o.name), h("p", null, o.styles.map(s => STYLES[s].name).join(" · "))))));
    return;
  }
  if (W.step === 3){
    const pairs = [[W.pool[0], W.pool[1]], [W.pool[2], W.pool[3]], W.winners]; const [a, b] = pairs[W.round];
    head(W.round < 2 ? "Which feels more like you?" : "Your lead style?", W.round < 2 ? `Round ${W.round + 1} of 3. We use both of your picks.` : "The other stays as a secondary match.");
    const used = new Set();
    const example = st => { const pool = DB.filmed().filter(c => c.styles.includes(st) && !used.has(c.id)); const c = pool.find(x => x.cats.includes(W.cat)) || pool[0]; if (!c) return null; used.add(c.id); return { c, w: c.works[0] }; };
    const card = (s, lbl) => { const ex = example(s); return h("button", { class: "style", "aria-label": STYLES[s].name, onclick: () => { if (W.round === 2){ W.styles = [s, W.winners.find(x => x !== s)]; W.step = 4; } else { W.winners.push(s); W.round++; } render(); } }, ex ? liveCover(ex.w) : art(s), h("span", { class: "lbl" }, lbl), h("span", { class: "t" }, h("b", null, STYLES[s].name), h("p", null, STYLES[s].desc), ex ? h("small", { class: "dim" }, "Example: " + ex.c.name) : null)); };
    page.append(h("div", { class: "duel" }, card(a, "A"), card(b, "B")));
    return;
  }
  if (W.step === 4){
    const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const o = Object.fromEntries(new FormData(f));
      DB.saveClientProfile(u.id, { cat: W.cat || p.cat || null, opt: W.opt || p.opt || null, styles: W.styles || p.styles || [], budget: o.budget, cadence: o.cadence, deadline: o.deadline, brief: o.brief.trim(), industry: o.industry.trim() }, true);
      const after = AFTER.get(); W = {}; toast(u.verified ? "You're verified. Welcome." : "Thanks. We'll verify your company before the first contract.");
      if (after && after.type === "hire"){ const c = DB.creator(after.creatorId); go("#/creator/" + c.id); setTimeout(() => startProject(c), 50); } else go("#/find"); } },
      h("div", { class: "row2" }, field("Budget per film", h("select", { class: "i", name: "budget" }, ...[["0-800", "Under $800"], ["800-2000", "$800–2,000"], ["2000-5000", "$2,000–5,000"], ["5000-20000", "$5,000–20,000"], ["20000-999999", "$20,000+"]].map(([v, l]) => h("option", { value: v, selected: p.budget === v }, l)))), field("How often", h("select", { class: "i", name: "cadence" }, ...[["once", "One film"], ["monthly", "A few every month"], ["ongoing", "Ongoing, volume"]].map(([v, l]) => h("option", { value: v, selected: p.cadence === v }, l))))),
      h("div", { class: "row2" }, field("Industry", h("input", { class: "i", name: "industry", value: p.industry || "", placeholder: "Specialty coffee, fintech, mobile games" })), field("Needed by", h("input", { class: "i", name: "deadline", type: "date", value: p.deadline || "" }))),
      field("The job, in your words", h("textarea", { class: "i", name: "brief", value: W.text || p.brief || "", placeholder: "Deliverables, length, where it runs, references" })),
      h("div", null, h("button", { class: "btn primary big", type: "submit" }, AFTER.get() && AFTER.get().type === "hire" ? "Finish and open the chat" : "See matching creators")));
    head("Budget and timing.", "Creators quote against this. A clear range gets faster, better replies.", Voice.button(f, VQ5, "Last part. Budget and timing."));
    page.append(f);
  }
}

function vAccount(m){
  const u = me(); if (!u) return requireAuth(() => render()); const p = u.profile || {};
  m.append(h("section", { class: "wrap section", style: { maxWidth: "720px" } }, h("div", { class: "page-title" }, h("h2", null, u.name || "Your account"), h("button", { class: "btn quiet small", onclick: () => { DB.signOut(); go("#/"); } }, "Sign out")),
    h("div", { class: "card" }, h("div", { class: "kv" }, h("dt", null, "Sign-in"), h("dd", null, [u.email, u.phone].filter(Boolean).join(" · ") + " · via " + (u.providers || ["email"]).map(x => x === "google" ? "Google" : x === "phone" ? "SMS code" : "email code").join(", ")), h("dt", null, "Work email"), h("dd", null, p.workEmail || "—"), h("dt", null, "Company"), h("dd", null, (u.org || "—") + (p.website ? " · " + p.website : "")), h("dt", null, "Status"), h("dd", { class: u.verified ? "ok" : "warn" }, u.verified ? "Verified" : u.onboarded ? "Pending manual verification" : "Onboarding incomplete"), h("dt", null, "Looking for"), h("dd", null, p.cat ? TAXONOMY[p.cat].name + (p.styles && p.styles.length ? " · " + p.styles.map(s => STYLES[s].name).join(", ") : "") : "—"), h("dt", null, "Budget"), h("dd", null, p.budget ? p.budget.replace("-", "–").replace("999999", "∞") : "—")),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => { W = { step: 0 }; go("#/onboarding"); } }, "Edit answers"), h("a", { class: "btn", href: "#/chats" }, "Messages")))));
}

bootShared();
