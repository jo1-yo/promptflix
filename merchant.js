/* Rolvo — merchant site. Public work and creators; contacting anyone requires an account + onboarding. */
const APP = "merchant";
const FREEMAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail|qq|163|126|aol|gmx)\./i;
let W = {};
const AFTER = { get(){ try { return JSON.parse(sessionStorage.getItem("pfm.after")); } catch { return null; } }, set(v){ v ? sessionStorage.setItem("pfm.after", JSON.stringify(v)) : sessionStorage.removeItem("pfm.after"); } };
const CATS = Object.keys(TAXONOMY);

function gate(after, then){ requireAuth(u => then(u)); }
/* Switching a tag on the home page re-renders it; the page stays where the visitor was instead of jumping. */
let KEEPY = null, TOFILMS = false;
const tabGo = hash => { if ((location.hash || "#/") === hash) return; KEEPY = scrollY; go(hash); };
const hireCTA = c => h("button", { class: "btn primary", onclick: () => { closeSheet(); gate({ type: "hire", creatorId: c.id }, () => startProject(c)); } }, "Start a project with " + first(c.name));

const SEARCH_ICON = () => { const e = document.createElementNS("http://www.w3.org/2000/svg", "svg"); e.setAttribute("viewBox", "0 0 16 16"); e.setAttribute("width", "15"); e.setAttribute("height", "15"); e.setAttribute("aria-hidden", "true"); e.innerHTML = '<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'; return e; };
function header(){
  const u = me(); const n = pendingCount(u && u.id);
  const links = [[null, "Use cases"], [null, "Pricing"], [null, "Connect to your AI"], ["#/creators", "Creators"]];
  if (u) links.push(["#/chats", "Dashboard", n]);   // the client's projects: each one a chat with its order pinned on top
  const search = cls => h("button", { class: cls, type: "button", onclick: openSearch, "aria-label": "Search" }, SEARCH_ICON(), h("span", null, "Describe the video you want"));
  const right = u ? [search("navbtn searchicon"), h("a", { href: "#/account", "aria-label": "Account" }, avatar(u))]
    : [search("navbtn searchicon"), h("button", { class: "btn primary small", onclick: () => openSignIn() }, "Sign in")];
  mountHeader({ brand: "Rolvo", links, right, home: "#/", pre: [search("searchbox")], tabs: [["#/", "Home"], ["#/creators", "Creators"], ...(u ? [["#/chats", "Dashboard", n]] : [])] });
  if (route().parts[0] === "chat") for (const a of document.querySelectorAll('.navbtn[href="#/chats"]')) a.setAttribute("aria-current", "true");
}
/* Creators, messages and search results are for signed-in clients. */
const CREATORS_SIGNIN = { title: "Sign in to see creators", sub: "Profiles, rates and messages are for signed-in clients." };
const GATED = ["creators", "creator", "search", "chats", "chat", "account", "onboarding"];
let LASTOK = "#/";
const gatedHash = hash => GATED.includes((hash || "").replace(/^#\/?/, "").split(/[/?]/)[0]);
function askSignIn(target){ const v = target.replace(/^#\/?/, "").split(/[/?]/)[0]; openSignIn(() => { if (location.hash === target) render(); else go(target); }, ["creators", "creator", "search"].includes(v) ? CREATORS_SIGNIN : null); }
// links to those pages open the sign-in window in place, with no navigation and no scroll jump
document.addEventListener("click", e => { const a = e.target.closest && e.target.closest("a[href^='#/']"); if (!a || me() || !gatedHash(a.getAttribute("href"))) return; e.preventDefault(); closeSheet(); askSignIn(a.getAttribute("href")); }, true);
function render(){
  header();
  const r = route(); const v = r.parts[0];
  // a signed-out visitor never lands on a page that only says "sign in": the sign-in window opens over where they were
  if (GATED.includes(v) && !me()){ const target = location.hash; askSignIn(target); return location.replace(LASTOK); }
  LASTOK = location.hash || "#/";
  const m = $("#main"); m.replaceChildren();
  if (!v) vHome(m, r.q);
  else if (v === "creators") vCreators(m, r.q);
  else if (v === "creator") vCreator(m, r.parts[1]);
  else if (v === "recommended") return go("#/");
  else if (v === "search") vSearch(m, r.q);
  else if (v === "match") vMatch(m, r.q || {});
  else if (v === "api") vApi(m);
  else if (OPEN_SECTIONS.includes(v) && v === "use-cases") vUseCases(m);
  else if (OPEN_SECTIONS.includes(v) && v === "pricing") vPricing(m);
  else if (v === "onboarding") vOnboarding(m);
  else if (v === "chats") vChats(m, null);
  else if (v === "chat") vChats(m, r.parts[1]);
  else if (v === "orders") return go("#/chats");
  else if (v === "order") return go("#/chat/" + r.parts[1]);
  else if (v === "account") vAccount(m);
  else return go("#/");
  if (!["onboarding", "chats", "chat"].includes(v)) m.append(footer());
  const as = $("#assist"); if (as) as.hidden = ["onboarding", "chats", "chat"].includes(v);
  if (assistDraw) assistDraw();
  if (KEEPY != null){ const y = KEEPY; KEEPY = null; scrollTo(0, y); }
  else if (TOFILMS){ TOFILMS = false; const el = $("#films"); if (el) el.scrollIntoView({ block: "start" }); }
}

/* ---------- public ---------- */
const gallery = (items, limit) => h("div", { class: "gallery" }, ...items.slice(0, limit || items.length).map(({ w, c }) => tile(w, c, () => playWork(w, c, hireCTA(c)))));
function ccard(c, why){
  const est = DB.priceRange(c).est;
  return hoverPlay(h("a", { class: "ccard", href: "#/creator/" + c.id }, face(c),
    h("span", { class: "top" }, h("span", { class: est ? "est" : null, title: est ? "Estimate for this kind of work. They haven't set rates yet." : null }, rangeText(c)), h("span", null, c.tz || c.source || "")),
    h("span", { class: "cap" }, h("b", null, c.name), h("span", null, [c.where, c.bg.replace(/\.$/, "")].filter(Boolean).join(" · ")), why && why.length ? h("span", { class: "why" }, ...why.map(w => h("i", null, w))) : null)), c.works[0]);
}
/* Lists of creators show only those with something to look at: a film, or the cover image from their own site. */
const hasFace = c => c.works.length > 0 || !!c.cover;
const cgrid = (list) => h("div", { class: "cgrid" }, ...list.map(({ c, why }) => ccard(c, why)));
/* ---------- taste: the questions that used to sit behind sign-up now open in a window on arrival ----------
   Two questions, then three rounds of three films shown as a slide, the middle one playing. Each pick pulls the next three closer to it. The answers stay in this
   browser until the visitor signs in, which is asked for only when the results are ready. */
const TASTE = {
  get(){ try { return JSON.parse(localStorage.getItem("pfm.taste")); } catch { return null; } },
  set(v){ v ? localStorage.setItem("pfm.taste", JSON.stringify(v)) : localStorage.removeItem("pfm.taste"); },
  seen(){ return !!localStorage.getItem("pfm.taste.seen"); }, markSeen(){ localStorage.setItem("pfm.taste.seen", "1"); },
  work(k){ const c = DB.creator(k.c); return c && c.live && c.works[k.i] ? { w: c.works[k.i], c } : null; },
  styles(t){ const n = {}; for (const k of t.picks){ const x = this.work(k); if (x) n[x.w[2]] = (n[x.w[2]] || 0) + 1; } return Object.keys(n).sort((a, b) => n[b] - n[a]); } };
const TASTE_SIGNIN = { title: "Sign in to see your recommendations", sub: "Your three picks are saved. Similar films and the people who made them show as soon as you are in." };
let TQ = null;
const tasteKey = x => x.c.id + ":" + x.c.works.indexOf(x.w);
const tastePool = () => DB.roster().flatMap(c => c.works.map(w => ({ w, c })));
/* three films for a round: closest to the last pick first, one per creator, never one already shown */
function tasteRound(){
  const cat = TAXONOMY[TQ.cat]; const opt = cat.options.find(o => o.id === TQ.opt); const picked = TQ.picks.map(k => TASTE.work(k)).filter(Boolean);
  const last = picked[picked.length - 1]; const liked = new Set(picked.map(x => x.w[2]));
  const score = x => (last && x.w[2] === last.w[2] ? 4 : 0) + (liked.has(x.w[2]) ? 2 : 0) + (x.w[1] === TQ.cat ? 3 : 0) + (opt && opt.styles.includes(x.w[2]) ? 2 : 0);
  const seenC = new Set(); const out = [];
  for (const x of tastePool().filter(x => !TQ.shown.includes(tasteKey(x))).map(x => ({ x, s: score(x) })).sort((a, b) => b.s - a.s).map(y => y.x)){
    if (seenC.has(x.c.id)) continue; seenC.add(x.c.id); out.push(x); if (out.length === 3) break; }
  return out;
}
function openTaste(){
  TASTE.markSeen(); TQ = { step: 0, cat: null, opt: null, picks: [], shown: [], round: null }; tasteStep();
}
function tasteStep(){
  const body = h("div", { class: "win-body" }); let count, extra = null;
  const head = (t, lead) => body.append(h("div", null, h("h2", null, t), lead ? h("p", { class: "lead" }, lead) : null));
  if (TQ.step === 0){
    count = "1/2"; head("What are you making?");
    const cats = CATS.filter(id => DB.roster().some(c => c.cats.includes(id)));
    body.append(h("div", { class: "opts" }, ...cats.map(id => h("button", { class: "opt", onclick: () => { TQ.cat = id; TQ.step = 1; tasteStep(); } }, h("b", null, TAXONOMY[id].name), h("p", null, TAXONOMY[id].blurb)))));
  } else if (TQ.step === 1){
    const c = TAXONOMY[TQ.cat]; count = "2/2"; head(c.ask);
    body.append(h("div", { class: "opts" }, ...c.options.map(o => h("button", { class: "opt", onclick: () => { TQ.opt = o.id; TQ.step = 2; tasteStep(); } }, h("b", null, o.name), h("p", null, o.styles.map(st => STYLES[st].name).join(" · "))))));
  } else {
    if (!TQ.round){ TQ.round = tasteRound(); TQ.shown.push(...TQ.round.map(tasteKey)); TQ.focus = TQ.round.length > 1 ? 1 : 0; }
    const R = TQ.round; const nR = R.length; count = (TQ.picks.length + 1) + "/3";
    head("Pick the film closest to what you want.", "Each pick helps us find better creators for you.");
    const pick = x => { TQ.picks.push({ c: x.c.id, i: x.c.works.indexOf(x.w) }); TQ.round = null; TQ.picks.length === 3 ? tasteDone() : tasteStep(); };
    if (!nR) body.append(h("p", { class: "hint" }, "That is every film we have for this."));
    else {
      extra = h("button", { class: "link", onclick: () => { TQ.round = null; tasteStep(); } }, "Show 3 others");
      const title = h("b"), meta = h("span");
      const slides = R.map((x, i) => h("button", { class: "slide", type: "button", onclick: () => { if (i !== TQ.focus) focus(i); } }, cover(x.w)));
      const focus = i => { TQ.focus = i;
        slides.forEach((el, j) => { const rel = (j - i + nR) % nR; const pos = rel === 0 ? "center" : rel === 1 ? "right" : "left";
          el.dataset.pos = pos; el.setAttribute("aria-label", pos === "center" ? R[j].w[0] + ", playing" : "Show " + R[j].w[0]); el.setAttribute("aria-current", String(pos === "center")); el.tabIndex = pos === "center" ? -1 : 0; });
        body.style.setProperty("--far", slides[i].dataset.ar || 16 / 9); title.textContent = R[i].w[0]; meta.textContent = R[i].c.name; sound(); };
      // all three load at once behind their covers, so moving a film to the middle shows it already playing
      // each card takes its film's shape: known up front where the URL says it, corrected once the file reports its real size
      // sound is off until asked for (browsers only autoplay muted); once on, it follows whichever film is in the middle
      const nodes = []; const snd = h("button", { class: "slidesound", type: "button", onclick: () => { TQ.sound = !TQ.sound; sound(); } });
      const sound = () => { const on = !!TQ.sound; nodes.forEach((n, j) => n && n.sound(on && j === TQ.focus)); snd.hidden = !nodes[TQ.focus];
        snd.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on"); snd.setAttribute("aria-pressed", String(on));
        snd.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3l4.5-3.5v12L7 14.5H4z"/>' + (on ? '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>' : '<path d="M16 9.5l5 5M21 9.5l-5 5"/>') + "</svg>"; };
      const shape = (j, r) => { slides[j].style.setProperty("--ar", r); slides[j].dataset.ar = r; if (j === TQ.focus) body.style.setProperty("--far", r); };
      slides.forEach((el, j) => shape(j, filmRatio(R[j].w[5])));
      if (canPreview()) slides.forEach((el, j) => { const node = previewNode(R[j].w[5], true); if (!node) return; el.querySelector(".art").append(node); nodes[j] = node; node.addEventListener("pfm:playing", sound);
        const v = node.querySelector("video"); if (v) v.addEventListener("loadedmetadata", () => { const r = fitRatio(v.videoWidth / v.videoHeight); if (Math.abs(r / el.dataset.ar - 1) > .02) shape(j, r); }, { once: true }); });
      const step = d => focus((TQ.focus + d + nR) % nR);
      const arrow = (d, label, glyph) => nR > 1 ? h("button", { class: "slidearrow " + (d < 0 ? "prev" : "next"), type: "button", "aria-label": label, onclick: () => step(d) }, glyph) : null;
      body.append(h("div", { class: "slides", onkeydown: e => { if (e.key === "ArrowLeft"){ e.preventDefault(); step(-1); } if (e.key === "ArrowRight"){ e.preventDefault(); step(1); } } }, ...slides, arrow(-1, "Previous film", "←"), arrow(1, "Next film", "→"), snd),
        h("div", { class: "slidecap" }, h("div", { class: "who", "aria-live": "polite" }, title, meta), h("button", { class: "btn primary big", type: "button", onclick: () => pick(R[TQ.focus]) }, "Pick this film")));
      focus(TQ.focus);
    }
  }
  openSheet([h("div", { class: "wintop" }, h("span", { class: "count" }, count), extra), body], true);
  $("#panel").classList.add("winp"); $("#panel").classList.toggle("slidesp", TQ.step === 2); $("#panel").setAttribute("aria-label", "Find your match");
}
/* results need an account: the sign-in sheet opens here, not before the questions */
function tasteDone(){
  TASTE.set({ cat: TQ.cat, opt: TQ.opt, picks: TQ.picks, at: new Date().toISOString() }); TQ = null; closeSheet();
  const show = () => { tasteToProfile(); TOFILMS = true; if (location.hash === "#/?tab=rec") render(); else go("#/?tab=rec"); };
  if (me()) show(); else { render(); openSignIn(show, TASTE_SIGNIN); }
}
function tasteToProfile(){ const u = me(); const t = TASTE.get(); if (u && t) DB.saveClientProfile(u.id, { cat: t.cat, opt: t.opt, styles: TASTE.styles(t).slice(0, 2) }); }
/* ---------- home: one row of tags, Recommended first, then a tag per category ---------- */
const firstFilms = n => DB.filmed().map(c => ({ w: c.works[0], c })).slice(0, n);
/* Recommended needs three picks and an account. Without the picks the questions open; without the account the sign-in window does. */
function openRecommended(){
  const u = me(); const p = (u && u.profile) || {};
  if (!TASTE.get() && !p.cat) return openTaste();
  if (!u) return openSignIn(() => { tasteToProfile(); tabGo("#/?tab=rec"); }, TASTE_SIGNIN);
  tabGo("#/?tab=rec");
}
function recommendedTab(){
  const u = me(); const t = TASTE.get(); const p = u.profile || {}; const out = [];
  const picks = t ? t.picks.map(k => TASTE.work(k)).filter(Boolean) : []; const cat = t ? t.cat : p.cat;
  const styles = t ? TASTE.styles(t) : (p.styles || []); const mine = new Set(picks.map(tasteKey));
  const score = x => { const i = styles.indexOf(x.w[2]); return (i === 0 ? 5 : i > 0 ? 3 : 0) + (x.w[1] === cat ? 2 : 0); };
  const similar = tastePool().filter(x => !mine.has(tasteKey(x))).map(x => ({ x, s: score(x) })).filter(y => y.s > 0).sort((a, b) => b.s - a.s).slice(0, 12).map(y => y.x);
  const budget = p.budget ? p.budget.split("-").map(Number) : null;
  const makers = DB.match({ cat, styles: styles.slice(0, 2), type: p.type, budget, strict: true }).filter(x => hasFace(x.c)).slice(0, 8);
  out.push(h("div", { class: "asknote between" }, h("div", { class: "chips" }, cat ? h("span", { class: "chip on" }, TAXONOMY[cat].name) : null, ...styles.slice(0, 3).map(st => styleChip(st, true))), h("button", { class: "link", onclick: openTaste }, "Reset recommendations")),
    similar.length ? gallery(similar) : h("div", { class: "empty" }, h("b", null, "Nothing close yet."), h("button", { class: "btn", onclick: openTaste }, "Try other answers")));
  if (makers.length) out.push(h("div", { class: "sec-head", style: { marginTop: "56px" } }, h("h2", null, "Creators who make this"), h("a", { class: "link", href: "#/creators?cats=" + cat }, "All creators →")), cgrid(makers));
  return out;
}
/* A signed-out visitor sees twelve films; the next rows are there but blurred, and signing in opens them. */
const FREE_FILMS = 12;
function filmWall(items){
  if (me() || items.length <= FREE_FILMS) return [gallery(items, 36)];
  return [gallery(items, FREE_FILMS), h("div", { class: "moregate" }, h("div", { class: "blurred", "aria-hidden": "true", inert: true }, gallery(items.slice(FREE_FILMS), 8)), ...[1, 2, 3, 4].map(i => h("i", { class: "pb pb" + i, "aria-hidden": "true" })),
    h("button", { class: "btn primary big", onclick: () => openSignIn(() => render(), { title: "Sign in to keep watching", sub: "The first twelve films are open. The rest, and the people who made them, are for signed-in clients." }) }, "Sign in to see more"))];
}
/* Use cases, Pricing and Connect to your AI are named in the header but not open yet. Add an id here to open its page. */
const OPEN_SECTIONS = [];
const USE_CASES = [["biz", "Launch films and brand ads", "Product launches, campaign spots and brand films that look shot, not generated."], ["demo", "Product demo videos", "Screen-led walkthroughs where the product does the talking."], ["reels", "Reels and UGC", "Vertical films built for the feed, in volume, on a weekly rhythm."], ["film", "Short films and spec work", "Narrative shorts, festival pieces and proof-of-concept scenes."], ["duanju", "Short drama", "Vertical micro-drama in one to three minute episodes."], ["interactive", "Interactive games", "Branching stories, playable ads and cutscenes."], ["mv", "Music videos", "Full tracks, visualizers and lyric films cut to the song."], ["anim", "Animation and characters", "Mascots, 2D and 3D worlds, character-led stories."]];
/* home tags, in this order. "demo" is a style inside Business & Brand, shown as its own tag. */
const HOME_TABS = [["biz", "Business & Brand"], ["demo", "Product Demo Videos"], ["film", "Film & Short Film"], ["reels", "Reels & UGC"], ["duanju", "Short Drama"], ["interactive", "Interactive Games"], ["mv", "Music Video"], ["anim", "Animation & Character"]];
const tabFilms = id => tastePool().filter(x => id === "demo" ? x.w[2] === "demo" : x.w[1] === id);
function vHome(m, q){
  const u = me(); const canRec = !!u && !!(TASTE.get() || (u.profile || {}).cat);
  if (q.tab === "rec" && !canRec) return location.replace("#/");
  const tab = q.tab === "rec" ? "rec" : HOME_TABS.some(([id]) => id === q.tab) ? q.tab : "";
  m.append(h("section", { class: "wrap hero" },
    h("div", { class: "stack", style: { gap: "16px" } },
      h("h1", null, "The best AI video talent, all in one place."),
      h("p", { class: "lead" }, "Explore outstanding work, hire proven creators, and bring your next project to life.")),
    h("div", { class: "row cta" }, h("button", { class: "btn primary big", onclick: () => TASTE.get() ? openRecommended() : openTaste() }, "Hire a filmmaker"),
      h("button", { class: "btn big", onclick: () => $("#films").scrollIntoView({ block: "start", behavior: canPreview() ? "smooth" : "auto" }) }, "Browse works"),
      h("a", { class: "btn big", href: "#/match" }, "Match a reference"))));
  const tabBtn = (id, label, onclick) => h("button", { role: "tab", "aria-pressed": String(tab === id), onclick }, label);
  const films = tab && tab !== "rec" ? tabFilms(tab) : null;
  m.append(h("section", { class: "wrap section tight", id: "films" },
    h("div", { class: "filters", role: "tablist", "aria-label": "Films" }, tabBtn("", "All", () => tabGo("#/")), tabBtn("rec", "Recommended", openRecommended), ...HOME_TABS.map(([id, label]) => tabBtn(id, label, () => tabGo("#/?tab=" + id)))),
    ...(tab === "rec" ? recommendedTab() : films && !films.length ? [h("p", { class: "soonnote" }, "Coming soon")] : filmWall(films || firstFilms(36)))));
  // first visit: the questions open on their own. Closing them is remembered; Recommended brings them back.
  if (!TASTE.get() && !TASTE.seen()) setTimeout(() => { if (!route().parts.length && $("#sheet").hidden) openTaste(); }, 500);
}
function vUseCases(m){
  m.append(h("section", { class: "wrap section" }, h("div", { class: "stack", style: { gap: "14px", marginBottom: "36px" } }, h("h1", { class: "pname" }, "Use cases"), h("p", { class: "lead" }, "What clients hire Rolvo filmmakers to make.")),
    h("div", { class: "uses" }, ...USE_CASES.map(([id, t, d]) => h("a", { class: "use", href: "#/?tab=" + id }, h("b", null, t), h("span", null, d), h("i", { "aria-hidden": "true" }, "→"))))));
}
function vPricing(m){
  m.append(h("section", { class: "wrap section" }, h("div", { class: "stack", style: { gap: "14px", marginBottom: "36px" } }, h("h1", { class: "pname" }, "Pricing"), h("p", { class: "lead" }, "Looking is free. You pay the filmmaker you hire, through escrow.")),
    h("div", { class: "prices" },
      h("div", { class: "card" }, h("span", { class: "eyebrow" }, "Browse and match"), h("b", { class: "price" }, "Free"), h("p", { class: "hint" }, "Watch the work, answer three questions and get matched. No card needed.")),
      h("div", { class: "card" }, h("span", { class: "eyebrow" }, "Hire"), h("b", { class: "price" }, "The creator's quote"), h("p", { class: "hint" }, "Rolvo adds no fee for clients. Your deposit sits in escrow and the balance is due when you approve the final cut.")),
      h("div", { class: "card" }, h("span", { class: "eyebrow" }, "For creators"), h("b", { class: "price" }, Math.round(COMMISSION * 100) + "% per payout"), h("p", { class: "hint" }, "No listing fee and no bidding. Taken when a payment is released to you."))),
    h("div", { style: { marginTop: "32px" } }, h("button", { class: "btn primary big", onclick: () => TASTE.get() ? openRecommended() : openTaste() }, "Hire a filmmaker"))));
}

/* ---------- a small prompt in the corner: one line and the way into the three questions ---------- */
let assistDraw = null;
function mountAssist(){
  const KEY = "pfm.assist.closed"; const closed = () => sessionStorage.getItem(KEY) === "1" || innerWidth < 700 && sessionStorage.getItem(KEY) !== "0";
  const root = h("aside", { id: "assist", "aria-label": "Get started" }); document.body.append(root); let last = null;
  assistDraw = () => { const state = TASTE.get() ? "done" : closed() ? "closed" : "open"; if (state === last) return; last = state;
    if (state === "done") return root.replaceChildren();
    if (state === "closed") return root.replaceChildren(h("button", { class: "assist-open", type: "button", "aria-label": "Get started", onclick: () => { sessionStorage.setItem(KEY, "0"); assistDraw(); } }, h("img", { src: "media/rolvo-mark.png", alt: "", width: "26", height: "26" })));
    root.replaceChildren(h("div", { class: "assist-card" },
      h("div", { class: "assist-head" }, h("img", { src: "media/rolvo-mark.png", alt: "", width: "22", height: "22" }), h("b", null, "Let's get started"), h("button", { class: "close", type: "button", "aria-label": "Close", onclick: () => { sessionStorage.setItem(KEY, "1"); assistDraw(); } }, "×")),
      h("button", { class: "assist-act", type: "button", onclick: openTaste }, h("span", null, "Find filmmakers in 3 questions"), h("i", { "aria-hidden": "true" }, "→")))); };
  assistDraw();
}

/* ---------- search: say what you want, optionally attach a reference; we line up similar films ---------- */
let SEARCHREF = null;
function goSearch(t){ const to = "#/search?q=" + encodeURIComponent(t); if (!me()) return askSignIn(to); if (location.hash === to) render(); else go(to); }
function openSearch(){
  const ta = h("textarea", { class: "askta", rows: "4", maxlength: "600", "aria-label": "Describe the video you want to make", placeholder: "Describe the video you want to make in 2-3 sentences." });
  const file = h("input", { type: "file", accept: "image/*,video/*", hidden: true, onchange: e => attach(e.target.files[0]) });
  const chip = h("span", { class: "refchip", hidden: true });
  const link = h("input", { class: "i", type: "url", hidden: true, "aria-label": "Reference link", placeholder: "https://… a film close to what you want" });
  SEARCHREF = {};
  function attach(f){ if (!f) return; Object.assign(SEARCHREF, { url: URL.createObjectURL(f), video: f.type.startsWith("video"), name: f.name });
    chip.hidden = false; chip.replaceChildren(SEARCHREF.video ? h("video", { src: SEARCHREF.url, muted: true }) : h("img", { src: SEARCHREF.url, alt: "" }), h("span", null, f.name), h("button", { type: "button", "aria-label": "Remove reference", onclick: () => { delete SEARCHREF.url; chip.hidden = true; file.value = ""; } }, "×")); }
  const submit = () => { const t = ta.value.trim(); SEARCHREF.link = link.value.trim();
    if (t.length < 3) return toast(SEARCHREF.url || SEARCHREF.link ? "Add a few words too. We match on your words for now." : "Describe the video in a few words.");
    closeSheet(); goSearch(t); };
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); submit(); } });
  openSheet([h("form", { class: "win-body", onsubmit: e => { e.preventDefault(); submit(); } }, ta, link,
    h("div", { class: "row between" }, h("div", { class: "row" }, file, h("button", { class: "btn small", type: "button", onclick: () => file.click() }, "Add image or video"), h("button", { class: "btn small", type: "button", onclick: () => { link.hidden = !link.hidden; if (!link.hidden) link.focus(); } }, "Add link"), chip), h("button", { class: "btn primary", type: "submit" }, "Find creators")))], true);
  $("#panel").classList.add("winp", "searchp"); $("#panel").classList.remove("slidesp"); $("#panel").setAttribute("aria-label", "Search"); setTimeout(() => ta.focus(), 50);
}
function vSearch(m, q){
  const text = (q.q || "").trim(); if (!text) return go("#/");
  const read = DB.readBrief(text); const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const score = x => { const hay = [x.w[0], x.c.name, x.c.bg, STYLES[x.w[2]].name, TAXONOMY[x.w[1]].name].join(" ").toLowerCase();
    return (read.cat === x.w[1] ? 4 : 0) + (read.styles.includes(x.w[2]) ? 4 : 0) + words.filter(w => hay.includes(w)).length * 2; };
  const films = tastePool().map(x => ({ x, s: score(x) })).filter(y => y.s > 0).sort((a, b) => b.s - a.s).slice(0, 12).map(y => y.x);
  const makers = DB.match({ cat: read.cat, styles: read.styles, text, strict: true }).filter(x => hasFace(x.c)).slice(0, 12);
  const ref = SEARCHREF || {}; const kind = ref.url ? (ref.video ? "video" : "image") : ref.link ? "link" : null;
  m.append(h("section", { class: "wrap section" },
    h("div", { class: "recs-head" }, h("div", null, h("h1", { class: "pname" }, "Creators for this"), h("p", { class: "q" }, "“" + text + "”"),
        kind ? h("div", { class: "refnote" }, ref.url ? (ref.video ? h("video", { src: ref.url, muted: true }) : h("img", { src: ref.url, alt: "Your reference" })) : null, h("span", null, "We matched on your words. Matching from the " + kind + " itself is not connected yet.")) : null),
      h("button", { class: "btn", onclick: openSearch }, "New search")),
    makers.length ? cgrid(makers) : h("div", { class: "empty" }, h("b", null, "No one matches that yet."), h("span", null, "Try the kind of film, a style or a mood."))));
  if (films.length) m.append(h("section", { class: "wrap section" }, h("div", { class: "sec-head" }, h("h2", null, "Similar films")), gallery(films)));
}
function vApi(m){
  m.append(h("section", { class: "wrap section" }, h("div", { class: "stack", style: { gap: "16px", maxWidth: "56ch" } }, h("h1", { class: "pname" }, "API"),
    h("p", { class: "lead" }, "There is no public API yet. Tell us what you want to build and we will write back when access opens."),
    h("div", null, h("a", { class: "btn primary big", href: "mailto:" + CONFIG.supportEmail + "?subject=Rolvo%20API" }, "Email us")))));
}

/* creators: cover cards + filter drawer */
const SORTS = [["", "Best match"], ["price", "Price: low to high"], ["-price", "Price: high to low"], ["films", "Most films"]];
const F = { parse(q){ return { sort: q.sort || "", q: q.q || "", min: +q.min || 0, max: +q.max || 0, region: q.region || "", cats: (q.cats || "").split(",").filter(Boolean), styles: (q.styles || "").split(",").filter(Boolean), days: +q.days || 0, joined: +q.joined || 0 }; },
  count(f){ return (f.min || f.max ? 1 : 0) + (f.region ? 1 : 0) + f.cats.length + f.styles.length + (f.days ? 1 : 0) + (f.joined ? 1 : 0); },
  url(f){ const p = new URLSearchParams(); if (f.q) p.set("q", f.q); if (f.sort) p.set("sort", f.sort); if (f.min) p.set("min", f.min); if (f.max) p.set("max", f.max); if (f.region) p.set("region", f.region); if (f.cats.length) p.set("cats", f.cats.join(",")); if (f.styles.length) p.set("styles", f.styles.join(",")); if (f.days) p.set("days", f.days); if (f.joined) p.set("joined", 1); const s = p.toString(); return "#/creators" + (s ? "?" + s : ""); },
  apply(f){ return DB.match({ text: f.q, strict: !!f.q }).filter(({ c }) => { if (!hasFace(c)) return false; const r = DB.priceRange(c);
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
      sorted.length ? cgrid(sorted.map(x => ({ c: x.c, why: f.q ? x.why : [] }))) : h("div", { class: "empty" }, h("b", null, "No one matches all of that."), h("span", null, "Loosen a filter; our crawler is inviting creators who make it."), h("a", { class: "btn", href: "#/creators" }, "Clear filters")))));
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
        h("div", { class: "stats" }, h("div", { class: "stat" }, h("b", null, rangeText(c)), h("span", null, DB.priceRange(c).est ? "estimate" : "typical")), h("div", { class: "stat" }, h("b", null, daysText(c.days)), h("span", null, "delivery")), c.rating ? h("div", { class: "stat" }, h("b", null, "★ " + c.rating.toFixed(1)), h("span", null, c.done + " done")) : h("div", { class: "stat" }, h("b", null, c.works.length), h("span", null, "public films"))),
        h("p", { class: "hint" }, DB.priceRange(c).est ? `What ${TAXONOMY[c.cats[0]].name.toLowerCase()} work like this usually closes for. ${c.name} hasn't set rates; you agree the real price in chat.` : `From ${first(c.name)}'s starting price (${money(c.ask)})` + (c.closes.length ? ` and ${c.closes.length} closed order${c.closes.length > 1 ? "s" : ""}` : "") + "."),
        h("button", { class: "btn primary big", style: { width: "100%" }, onclick: () => gate({ type: "hire", creatorId: c.id }, () => startProject(c)) }, "Start a project"),
        !me() ? h("p", { class: "hint" }, "Sign in and a few questions about you and the job come first. Then the chat opens.") : null))));
}
let whoSkipped = false;
function whoStep(c){
  const u = me(); const p = u.profile || {};
  const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const o = Object.fromEntries(new FormData(f));
    const host = (o.website || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
    const work = (o.workEmail || "").trim().toLowerCase(); const dom = work.split("@")[1] || "";
    if (o.name.trim()) u.name = o.name.trim(); if (o.company.trim()) u.org = o.company.trim();
    u.verified = !!work && work === u.email && !FREEMAIL.test(dom) && !!host && (dom === host || host.endsWith("." + dom) || dom.endsWith("." + host));
    DB.saveClientProfile(u.id, { website: host, workEmail: work }, true); startProject(c); } },
    h("div", { class: "row2" }, field("Your name", h("input", { class: "i", name: "name", value: u.name || "", autocomplete: "name" })), field("Company", h("input", { class: "i", name: "company", value: u.org || "", autocomplete: "organization" }))),
    h("div", { class: "row2" }, field("Website", h("input", { class: "i", name: "website", value: p.website || "", placeholder: "company.com" })), field("Work email", h("input", { class: "i", name: "workEmail", type: "email", value: p.workEmail || u.email || "", placeholder: "you@company.com" }))),
    h("div", { class: "row between" }, h("button", { class: "btn quiet", type: "button", onclick: () => { whoSkipped = true; startProject(c); } }, "Skip"), h("button", { class: "btn primary", type: "submit" }, "Continue")));
  openSheet([phead("Who is this for?", c.name + " sees this before accepting. You can skip it."), f]);
}
function startProject(c){
  const u = me(); const p = { ...(u.profile || {}) };
  if (!u.onboarded && !whoSkipped) return whoStep(c);
  if (MATCHCUR && route().parts[0] === "match"){ const r = MATCHCUR;   // started from a matched film: the reference and its tags go into the brief
    p.brief = "Reference: " + (r.u || r.file + " (I'll send the file in chat)") + "\n" + (p.brief || p.goal || ""); if (r.cat) p.cat = r.cat; if (r.styles.length) p.styles = r.styles; }
  const f = h("form", { class: "form", onsubmit: async e => { e.preventDefault(); const fd = new FormData(f), btn = f.querySelector("[type=submit]");
    const job = { clientId: u.id, creatorId: c.id, title: fd.get("title").trim(), brief: fd.get("brief").trim(), cat: fd.get("cat") || null, opt: p.opt || null, style: fd.get("style") || null, price: Number(fd.get("price")) || c.ask };
    // Live, the chat is made in the database so the creator sees it on their own device; otherwise it stays in this browser.
    let o; btn.disabled = true;
    try { o = await Chat.open(c, job); } catch (err) { btn.disabled = false; return toast("Couldn't open the chat. " + err.message); }
    o ||= DB.createOrder(job);
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
/* ---------- match a reference: a film the client likes → films that look like it → the people who made them ----------
   The reference is read in the visitor's own browser. A small image model (CLIP, ~45 MB, cached after the first use) turns a few
   frames of it into a fingerprint; embeds.js holds the same fingerprint for every film here (tools/embed.mjs). Films are ranked by
   how close the two are. What it is (kind, look) is then guessed from the closest films and shown as chips the client can correct,
   which nudges the order. Nothing is uploaded. Frames can be read from an uploaded file, a YouTube link or a direct video file link;
   other sites don't let a browser read their video, so there the client answers the two questions by hand. */
let MATCHFILE = null, MATCHCUR = null;   // an uploaded reference stays in this tab: { name, url }
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
const workKey = w => w[5] && (w[5].yt || w[5].vm || w[5].mp4 || w[5].link);
const READER = {
  ready: null, lib: null, reads: {},
  load(onProgress){   // model + library fingerprints, once per visit
    return this.ready ||= (async () => {
      if (typeof EMBEDS === "undefined") await new Promise((ok, no) => { const s = document.createElement("script"); s.src = assetBase() + "embeds.js"; s.onload = ok; s.onerror = () => no(new Error("embeds")); document.head.append(s); });
      const raw = Uint8Array.from(atob(EMBEDS.data), c => c.charCodeAt(0)), d = EMBEDS.dim; const data = new Int8Array(raw.buffer);
      this.lib = new Map(EMBEDS.keys.map((k, i) => { const v = data.subarray(i * d, (i + 1) * d); let n = 0; for (const x of v) n += x * x; return [k, { v, n: Math.sqrt(n) || 1 }]; }));
      const T = await import(TRANSFORMERS);
      const processor = await T.AutoProcessor.from_pretrained(EMBEDS.model);
      const model = await T.CLIPVisionModelWithProjection.from_pretrained(EMBEDS.model, { dtype: EMBEDS.dtype, progress_callback: p => { if (p.status === "progress" && /onnx/.test(p.file || "")) onProgress(Math.round(p.progress)); } });
      this.embed = async src => { const img = typeof src === "string" ? await T.RawImage.read(src) : await T.RawImage.fromBlob(src); const { image_embeds } = await model(await processor(img)); return Array.from(image_embeds.data); };
    })().catch(e => { this.ready = null; throw e; });
  },
  /* frames of the reference: stills for YouTube, six moments of a file */
  async frames(ref){
    if (ref.yt) return ["hqdefault", "hq1", "hq2", "hq3"].map(n => `https://i.ytimg.com/vi/${ref.yt}/${n}.jpg`);
    if (!ref.video) return null;
    const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; if (!ref.local) v.crossOrigin = "anonymous"; v.src = ref.video;
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error("video")); setTimeout(() => no(new Error("video")), 15000); });
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1, cv = document.createElement("canvas"), k = 320 / Math.max(v.videoWidth, v.videoHeight, 1);
    cv.width = Math.max(1, Math.round(v.videoWidth * k)); cv.height = Math.max(1, Math.round(v.videoHeight * k)); const out = [];
    for (const f of [0.08, 0.25, 0.42, 0.58, 0.75, 0.92]){
      await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 4000); v.currentTime = dur * f; });
      cv.getContext("2d").drawImage(v, 0, 0, cv.width, cv.height); out.push(await new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.85)));   // throws for a cross-site file that doesn't allow reading
    }
    return out.filter(Boolean);
  },
  /* one read per reference: { state: "reading" | "done" | "manual" | "failed", pct, vec, guess } */
  read(key, ref, onChange){
    if (this.reads[key]) return this.reads[key];
    const r = this.reads[key] = { state: "reading", pct: null };
    (async () => {
      const load = this.load(p => { r.pct = p; onChange(false); });
      const frames = await this.frames(ref).catch(() => null);
      if (!frames || !frames.length){ r.state = "manual"; return onChange(true); }
      await load; const vs = []; for (const f of frames){ try { vs.push(await this.embed(f)); } catch {} }
      if (!vs.length){ r.state = "manual"; return onChange(true); }
      const mean = vs[0].map((_, j) => vs.reduce((s, v) => s + v[j], 0) / vs.length); const n = Math.hypot(...mean) || 1;
      r.vec = mean.map(x => x / n); r.guess = this.guess(r.vec, ref); r.state = "done"; onChange(true);
    })().catch(() => { r.state = "failed"; onChange(true); });
    return r;
  },
  sim(vec, w){ const e = this.lib && this.lib.get(workKey(w)); if (!e) return 0; let s = 0; for (let i = 0; i < vec.length; i++) s += vec[i] * e.v[i]; return s / e.n; },
  /* what the reference is, voted by the ten films closest to it */
  guess(vec, ref){
    const near = tastePool().filter(x => workKey(x.w) !== (ref.yt || ref.video)).map(x => ({ x, s: this.sim(vec, x.w) })).sort((a, b) => b.s - a.s).slice(0, 10);
    const tally = i => { const n = {}; for (const { x, s } of near) n[x.w[i]] = (n[x.w[i]] || 0) + s; return Object.entries(n).sort((a, b) => b[1] - a[1]); };
    const cats = tally(1), looks = tally(2);
    return { cat: cats.length ? cats[0][0] : "", styles: looks.filter(([, v], i) => i === 0 || (i === 1 && v >= looks[0][1] * 0.5)).map(([k]) => k) };
  } };
const MATCH = {
  parse(q){ return { u: q.u || "", cat: CATS.includes(q.cat) ? q.cat : "", styles: (q.styles || "").split(",").filter(s => STYLES[s]).slice(0, 2) }; },
  url(s){ const p = new URLSearchParams(); if (s.u) p.set("u", s.u); if (s.cat) p.set("cat", s.cat); if (s.styles.length) p.set("styles", s.styles.join(",")); const t = p.toString(); return "#/match" + (t ? "?" + t : ""); },
  // read: closeness of the picture leads and the chips nudge. not read: the chips are all there is. Two films per creator at most.
  rank(s, vec, self){ const n = {}; const tags = x => { const i = s.styles.indexOf(x.w[2]); return (i === 0 ? 5 : i > 0 ? 3 : 0) + (x.w[1] === s.cat ? 3 : 0); };
    const score = vec ? x => READER.sim(vec, x.w) + tags(x) * 0.004 : tags;
    return tastePool().filter(x => workKey(x.w) !== self).map(x => ({ x, s: score(x) })).filter(y => y.s > 0).sort((a, b) => b.s - a.s).map(y => y.x).filter(x => (n[x.c.id] = (n[x.c.id] || 0) + 1) <= 2).slice(0, 12); } };
function vMatch(m, q){
  const s = MATCH.parse(q); const film = s.u ? filmLink(s.u) : null; const has = !!(s.u || MATCHFILE);
  MATCHCUR = has ? { ...s, file: MATCHFILE && MATCHFILE.name } : null;
  const set = patch => tabGo(MATCH.url({ ...s, ...patch }));
  const dropFile = () => { if (MATCHFILE){ URL.revokeObjectURL(MATCHFILE.url); MATCHFILE = null; } };
  const link = h("input", { class: "i", type: "url", name: "u", "aria-label": "Link to a video", placeholder: "https://www.youtube.com/watch?v=…", value: s.u });
  const file = h("input", { type: "file", accept: "video/*", hidden: true, onchange: e => { const f = e.target.files[0]; if (!f) return; dropFile(); MATCHFILE = { name: f.name, url: URL.createObjectURL(f) }; if (location.hash !== "#/match") go("#/match"); else render(); } });
  const form = h("form", { class: "matchin", onsubmit: e => { e.preventDefault(); const v = link.value.trim(); let ok = false; try { ok = /^https?:$/.test(new URL(v).protocol); } catch {}
      if (!ok) return toast("Paste a full link, starting with https://"); dropFile(); if (v === s.u) render(); else tabGo(MATCH.url({ u: v, cat: "", styles: [] })); } },
    link, h("button", { class: "btn primary", type: "submit" }, has ? "Change" : "Continue"), h("button", { class: "btn", type: "button", onclick: () => file.click() }, "Upload a file"), file);
  const refW = film ? ["Your reference", s.cat || CATS[0], s.styles[0] || Object.keys(STYLES)[0], null, null, { ...film, by: "You" }] : null;
  const ref = !has ? null : MATCHFILE ? h("video", { class: "matchvid", src: MATCHFILE.url, controls: true, muted: true, playsinline: true, preload: "metadata" })
    : film ? tile(refW, { name: film.on, id: "ref" }, () => playWork(refW, { name: "Your reference", id: "ref" }))
    : h("a", { class: "linkstage", href: s.u, target: "_blank", rel: "noopener" }, h("b", null, "Your reference"), h("small", null, s.u));
  // read the reference; this page redraws when the read finishes, and only the status line moves while it runs
  const key = MATCHFILE ? MATCHFILE.url : s.u; const here = location.hash;
  const source = MATCHFILE ? { video: MATCHFILE.url, local: true } : film && film.yt ? { yt: film.yt } : /\.(mp4|webm|mov)(\?|#|$)/i.test(s.u) ? { video: s.u } : {};
  const status = h("p", { class: "hint reading", role: "status" });
  const say = r => { status.textContent = r.pct != null && r.pct < 100 ? "Reading your video… getting ready " + r.pct + "%" : "Reading your video…"; };
  const rd = !has ? null : READER.read(key, source, done => { if (location.hash !== here) return; if (!done) return say(rd);
    if (rd.state === "done" && !s.cat && !s.styles.length && (rd.guess.cat || rd.guess.styles.length)) return location.replace(MATCH.url({ ...s, ...rd.guess }));
    KEEPY = scrollY; render(); });
  if (rd && rd.state === "reading") say(rd);
  const read = rd && rd.state === "done", busy = rd && rd.state === "reading";
  const chip = (on, label, onclick) => h("button", { class: "chip" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), onclick }, label);
  const looks = s.cat ? [...new Set([...TAXONOMY[s.cat].options.flatMap(o => o.styles), ...s.styles])] : Object.keys(STYLES);
  const toggle = id => set({ styles: s.styles.includes(id) ? s.styles.filter(x => x !== id) : [...s.styles, id].slice(-2) });
  const films = has && !busy && (read || s.cat || s.styles.length) ? MATCH.rank(s, read ? rd.vec : null, film && film.yt) : [];
  const makers = films.length && me() ? [...new Map(films.map(x => [x.c.id, { c: x.c, why: [] }])).values()].filter(x => hasFace(x.c)).slice(0, 8) : [];
  m.append(h("section", { class: "wrap section" },
    h("div", { class: "stack", style: { gap: "12px", marginBottom: "32px" } }, h("h1", { class: "pname" }, "Match a reference"), h("p", { class: "lead" }, "Show us a video you like. We find films that look like it, and the people who made them.")),
    h("div", { class: "mstep" }, h("span", { class: "eyebrow" }, "1 · Your reference"), form, has ? null : h("p", { class: "hint" }, "A file from your computer, or a YouTube link. It is read in your browser and never uploaded."), ref ? h("div", { class: "matchref" }, ref) : null, busy ? status : null),
    has && !busy ? h("div", { class: "mstep" }, h("span", { class: "eyebrow" }, read ? "2 · We read it as" : "2 · What is it?"),
      read ? null : h("p", { class: "hint" }, rd.state === "failed" ? "We couldn't read this one here. Tell us what it is." : "This site doesn't let a browser read its video. Tell us what it is, or upload the file."),
      h("div", { class: "chips" }, ...CATS.filter(id => DB.roster().some(c => c.cats.includes(id))).map(id => chip(s.cat === id, TAXONOMY[id].name, () => set({ cat: s.cat === id ? "" : id, styles: [] })))),
      h("div", { class: "chips" }, ...looks.map(id => chip(s.styles.includes(id), STYLES[id].name, () => toggle(id)))),
      read ? h("p", { class: "hint" }, "Change these if we got it wrong.") : null) : null,
    films.length || (has && !busy && (s.cat || s.styles.length)) ? h("div", { class: "mstep", id: "matched" }, h("span", { class: "eyebrow" }, "3 · Films like it"),
      films.length ? gallery(films) : h("div", { class: "empty" }, h("b", null, "Nothing close yet."), h("span", null, "Try another look.")),
      films.length ? h("p", { class: "hint" }, (read ? "Ordered by how close each film looks to yours. " : "") + "Open a film to start a project with the person who made it. Your reference goes into the brief.") : null) : null,
    makers.length ? h("div", { class: "mstep" }, h("div", { class: "sec-head", style: { marginBottom: "0" } }, h("h2", null, "Who made them")), cgrid(makers))
      : films.length && !me() ? h("div", null, h("button", { class: "btn", onclick: () => openSignIn(() => render(), CREATORS_SIGNIN) }, "Sign in to see who made them")) : null));
}
/* ---------- onboarding ---------- */
const VQ1 = { name: "What's your name?", role: "What's your role there?", company: "Which company is this for?", website: "What's the company website?", type: "What kind of company is it?", size: "Roughly how big is the team?" };
const VQ5 = { budget: "What's your budget per film?", cadence: "How often do you need films?", industry: "What industry are you in?", brief: "Describe the job in a sentence or two." };
function vOnboarding(m){
  const u = me(); if (!u) return requireAuth(() => render());
  const p = u.profile || {}; W.step ??= 0; scrollTo(0, 0);
  // someone who answered the questions window already told us what they make and which films they like: only who-you-are and budget are left
  const shown = TASTE.get() && p.cat ? [0, 4] : W.describe ? [0, 1, 4] : [0, 1, 2, 3, 4]; const total = shown.length; const n = shown.indexOf(W.step) + 1;
  const page = h("div", { class: "win-body" });
  m.append(h("div", { class: "flow-page" }, h("section", { class: "win", "aria-label": "Onboarding" },
    h("div", { class: "win-bar" }, h("b", null, "Getting started"), h("span", null, `Question ${n} of ${total}`),
      h("div", { class: "sp" }, W.step > 0 ? h("button", { class: "btn quiet small", onclick: () => { W.step = shown[shown.indexOf(W.step) - 1]; render(); } }, "Back") : null, h("button", { class: "btn quiet small", onclick: () => { AFTER.set(null); W = {}; go("#/"); } }, "Skip for now"))),
    h("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(n) }, h("i", { style: { width: (n / total * 100) + "%" } })),
    page)));
  const head = (title, lead, extra) => page.append(h("div", null, h("h1", null, title), lead ? h("p", { class: "lead" }, lead) : null, extra ? h("div", { style: { marginTop: "16px" } }, extra) : null));

  if (W.step === 0){
    const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const o = Object.fromEntries(new FormData(f));
      const host = (o.website || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
      const work = (o.workEmail || "").trim().toLowerCase(); const dom = work.split("@")[1] || "";
      // instant only when the work email is the one they just proved (OTP / Google) and its domain is the website's; everything else goes to manual review
      u.name = o.name.trim(); u.org = o.company.trim(); u.type = o.type;
      u.verified = work === u.email && !FREEMAIL.test(dom) && !!host && (dom === host || host.endsWith("." + dom) || dom.endsWith("." + host));
      DB.saveClientProfile(u.id, { role: o.role.trim(), website: host, type: o.type, size: o.size, workEmail: work }); W.step = shown[1]; render(); } },
      h("div", { class: "row2" }, field("Your name", h("input", { class: "i", name: "name", required: true, value: u.name || "", placeholder: "Full name" })), field("Role", h("input", { class: "i", name: "role", required: true, value: p.role || "", placeholder: "Founder, Head of Growth, Producer" }))),
      h("div", { class: "row2" }, field("Company", h("input", { class: "i", name: "company", required: true, value: u.org || "", placeholder: "Company or studio" })), field("Website", h("input", { class: "i", name: "website", required: true, value: p.website || "", placeholder: "company.com" }))),
      h("div", { class: "row2" }, field("You are a", h("select", { class: "i", name: "type", required: true }, CLIENT_TYPES.map(t => h("option", { value: t.id, selected: (p.type || u.type) === t.id }, t.name)))), field("Team size", h("select", { class: "i", name: "size" }, ...["1-10", "11-50", "51-200", "200+"].map(v => h("option", { value: v, selected: p.size === v }, v))))),
      field("Work email", h("input", { class: "i", name: "workEmail", type: "email", required: true, value: p.workEmail || (u.email && !FREEMAIL.test(u.email.split("@")[1]) ? u.email : ""), placeholder: "you@company.com" }), u.email && !FREEMAIL.test(u.email.split("@")[1]) ? null : "where creators and contracts reach you"),
      h("div", { class: "verify" }, h("span", null, h("b", null, "Signed in with " + (u.email || u.phone) + ". "), u.email && !FREEMAIL.test(u.email.split("@")[1]) ? "If that domain matches your website you're verified instantly. " : "", "Otherwise a person on our team reviews your company before your first contract, usually within a day.")),
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
    const card = (s, lbl) => { const ex = example(s); return h("button", { class: "style", "aria-label": STYLES[s].name, onclick: () => { if (W.round === 2){ W.styles = [s, W.winners.find(x => x !== s)]; W.step = 4; } else { W.winners.push(s); W.round++; } render(); } }, ex ? cover(ex.w) : art(s), h("span", { class: "lbl" }, lbl), h("span", { class: "t" }, h("b", null, STYLES[s].name), h("p", null, STYLES[s].desc), ex ? h("small", { class: "dim" }, "Example: " + ex.c.name) : null)); };
    page.append(h("div", { class: "duel" }, card(a, "A"), card(b, "B")));
    return;
  }
  if (W.step === 4){
    const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const o = Object.fromEntries(new FormData(f));
      DB.saveClientProfile(u.id, { cat: W.cat || p.cat || null, opt: W.opt || p.opt || null, styles: W.styles || p.styles || [], budget: o.budget, cadence: o.cadence, deadline: o.deadline, brief: o.brief.trim(), industry: o.industry.trim() }, true);
      const after = AFTER.get(); W = {}; toast(u.verified ? "You're verified. Welcome." : "Thanks. We'll verify your company before the first contract.");
      if (after && after.type === "hire"){ const c = DB.creator(after.creatorId); go("#/creator/" + c.id); setTimeout(() => startProject(c), 50); } else go("#/?tab=rec"); } },
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
  const via = (u.providers || ["email"]).map(x => x === "google" ? "Google" : x === "phone" ? "SMS code" : "email code").join(", ");
  const budget = p.budget ? p.budget.split("-").map(Number) : null;
  const rows = [["Sign-in", [u.email, u.phone].filter(Boolean).join(" · "), "via " + via], ["Name", u.name], ["Company", [u.org, p.website].filter(Boolean).join(" · ")], ["Work email", p.workEmail],
    ["Looking for", p.cat ? TAXONOMY[p.cat].name + (p.styles && p.styles.length ? " · " + p.styles.map(st => STYLES[st].name).join(", ") : "") : ""],
    ["Budget", budget ? money(budget[0]) + "–" + (budget[1] > 500000 ? "∞" : money(budget[1])) : ""], ["Verification", u.verified ? "Verified" : u.onboarded ? "In review" : ""]].filter(r => r[1]);
  m.append(h("section", { class: "wrap section narrow" }, h("h1", { class: "pname" }, "Account"),
    h("dl", { class: "acct" }, ...rows.map(([k, v, note]) => h("div", null, h("dt", null, k), h("dd", null, v, note ? h("small", null, note) : null)))),
    h("div", { class: "row acct-actions" }, h("button", { class: "btn", onclick: () => { W = { step: 0 }; go("#/onboarding"); } }, "Edit details"), h("a", { class: "btn", href: "#/chats" }, "Dashboard"), h("button", { class: "btn quiet", onclick: () => { DB.signOut(); go("#/"); } }, "Sign out"))));
}

bootShared();
mountAssist();
