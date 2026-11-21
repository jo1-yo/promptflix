/* Rolvo Market — shared UI: helpers, sign-in, header, and the order page used by both the merchant and creator sites.
   Each site defines APP ("merchant" | "creator" | "admin") and its own render(). */
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)){
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)){ if (c == null || c === false) continue; el.append(c instanceof Node ? c : String(c)); }
  return el;
}
const money = n => "$" + (Math.round(n * 100) % 100 ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString("en-US"));   // cents only when there are any
const when = iso => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 1 ? "just now" : m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; };
const initials = n => /^\+?\d[\d\s]+$/.test(n || "") ? "#" : (n || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const first = n => { const w = (n || "").split(" "); return /^the$/i.test(w[0]) && w.length > 1 ? n : w[0]; };
let toastT; function toast(m){ const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3400); }
const route = () => { const [path, qs] = location.hash.replace(/^#/, "").split("?"); return { path: path || "/", parts: (path || "/").split("/").filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || "")) }; };
const go = hash => { location.hash = hash; };
const me = () => DB.me();

/* art: gradient fallback for works with no cover (e.g. a fresh upload); real works carry w[5].cover */
const hueOf = id => (STYLES[id] || { hue: [40, 40] }).hue;
function art(styleId, extra){ const [hue, sat] = hueOf(styleId); return h("div", { class: "art grain vig" + (extra ? " " + extra : ""), style: { "--h": hue, "--s": sat + "%" } }); }
function monogram(c){ const a = art((c.styles || [])[0], "mono"); a.append(h("i", null, initials(c.name))); return a; }
function face(c){   // creator card face: lead film, else the cover image from their own site, else a monogram
  if (c.works && c.works.length) return cover(c.works[0]); if (!c.cover) return monogram(c);
  const img = h("img", { src: c.cover, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }); const box = h("div", { class: "art cover vig" }, img);
  img.onerror = () => box.replaceWith(monogram(c)); return box; }   // card face for a creator with no film to show
function cover(w, extra){
  const m = w && w[5]; if (!m || !m.cover) return art(w ? w[2] : null, extra);
  const img = h("img", { src: m.cover, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  img.onerror = () => { if (m.yt && !img.dataset.fb){ img.dataset.fb = 1; img.src = "https://i.ytimg.com/vi/" + m.yt + "/hqdefault.jpg"; } else img.replaceWith(art(w[2])); };
  return h("div", { class: "art cover vig" + (m.lb ? " lb" : "") + (extra ? " " + extra : "") }, img);
}
function avatar(u){ if (u.avatar) return h("div", { class: "avatar" }, h("img", { src: u.avatar, alt: "", referrerpolicy: "no-referrer" })); const [hue] = hueOf((u.styles || [])[0]); return h("div", { class: "avatar", style: { background: `hsl(${hue} 42% 82%)` } }, initials(u.name || u.org || u.email || u.phone || "?")); }
const styleChip = (id, on) => h("span", { class: "chip sw" + (on ? " on" : "") }, h("i", { class: "dot", style: { background: `hsl(${hueOf(id)[0]} ${hueOf(id)[1]}% 60%)` } }), STYLES[id].name);
const kmoney = n => n >= 1000 ? "$" + (n / 1000).toFixed(n % 1000 ? 1 : 0).replace(/\.0$/, "") + "k" : "$" + n;
const rangeText = c => { const r = DB.priceRange(c); if (r.est) return "~" + kmoney(r.lo) + "–" + kmoney(r.hi).slice(1); return r.lo === r.hi ? money(r.lo) : money(r.lo) + "–" + money(r.hi); };
const workSrc = async w => w[4] ? (w[4].startsWith("f_") ? URL.createObjectURL(await Files.get(w[4])) : w[4]) : SAMPLE_CLIP;

/* sheet */
/* Windows ease in and out. Closing fades first and hides after; opening again in that moment cancels the hide. */
let sheetT = null;
function openSheet(kids, wide){ const p = $("#panel"); clearTimeout(sheetT); $("#sheet").classList.remove("closing"); p.className = "panel" + (wide ? " wide" : ""); p.replaceChildren(...[kids].flat()); $("#sheet").hidden = false; p.scrollTop = 0; }
function closeSheet(){ const sh = $("#sheet"); if (!sh.hidden && !sh.classList.contains("closing")){ sh.classList.add("closing"); clearTimeout(sheetT); sheetT = setTimeout(() => { sh.hidden = true; sh.classList.remove("closing"); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240); }
  if (typeof Auth !== "undefined") Auth.referrer(null); if (window.Voice) Voice.stop(); for (const v of document.querySelectorAll("#panel video")){ v.pause(); v.removeAttribute("src"); v.load(); } for (const n of document.querySelectorAll("#panel iframe, #panel .hoverplay")) n.remove(); }
const phead = (t, sub) => h("div", { class: "phead" }, h("div", null, h("h2", null, t), sub ? h("div", { class: "sub" }, sub) : null), h("button", { class: "close", type: "button", onclick: closeSheet, "aria-label": "Close" }, "×"));
const field = (label, ctl, note) => h("label", { class: "f" }, h("span", null, label, note ? h("small", null, note) : null), ctl);

/* sign-in: Google, phone or email (auth.js). The continuation runs once the user is in. */
function openSignIn(then, copy){ Auth.open(then, copy); }
const requireAuth = then => { const u = me(); if (u) then(u); else openSignIn(then); };

/* header + footer */
let scrollBound = false;
function mountHeader({ brand, sub, links, right, home, pre, tabs }){
  const r = route();
  const isCur = href => href === home ? (r.path === "/" || r.path === home.slice(1)) : r.path.startsWith(href.slice(1));
  // a link with no href is a section that is not open yet: signed out it asks for sign-in, signed in it says it is coming
  const mk = ([href, label, n]) => href ? h("a", { class: "navbtn", href, "aria-current": String(isCur(href)) }, label, n ? h("span", { class: "n" }, n) : null)
    : h("button", { class: "navbtn", type: "button", onclick: () => { const soon = () => toast(label + " is coming soon."); me() ? soon() : openSignIn(() => { render(); soon(); }); } }, label);
  const top = $("#top");
  top.replaceChildren(...[h("a", { class: "wordmark", href: home, "aria-label": brand + (sub ? " " + sub : "") }, h("img", { src: assetBase() + "media/rolvo-logo.png", alt: brand, width: "72", height: "22" }), sub ? h("span", null, sub) : null), pre ? h("div", { class: "navpre" }, ...pre) : null, h("nav", { class: "nav", "aria-label": "Main" }, ...links.map(mk)), h("div", { class: "topright" }, ...right)].filter(Boolean));
  $("#tabbar").replaceChildren(...(tabs || links).map(mk));
  if (!scrollBound){ scrollBound = true; const f = () => top.classList.toggle("solid", scrollY > 8 || r.path !== "/"); addEventListener("scroll", f, { passive: true }); addEventListener("hashchange", () => setTimeout(f, 0)); f(); }
  top.classList.toggle("solid", scrollY > 8 || r.path !== "/");
}
const assetBase = () => APP === "merchant" ? "" : "../";
/* Footer: who we are, where things live, and the standing credit line: the films are the creators' own. */
function footer(){
  const b = assetBase(); const col = (t, ...links) => h("div", { class: "fcol" }, h("b", null, t), ...links.filter(Boolean).map(([l, href]) => h("a", { href }, l)));
  return h("footer", { class: "wrap" },
    h("div", { class: "fgrid" },
      h("div", { class: "fbrand" }, h("img", { src: b + "media/rolvo-logo.png", alt: "Rolvo", width: "72", height: "22" }), h("p", null, "Find the filmmaker behind the best AI video.")),
      col("Clients", ["Find your match", b + "#/"], ["Creators", b + "#/creators"]),
      col("Creators", ["Join Rolvo", b + "creator/#/apply"], ["Claim your profile", b + "creator/#/claim"], ["Rolvo Select", b + "../select/"]),
      col("Company", ["API", b + "#/api"], ["Contact", "mailto:" + CONFIG.supportEmail], ["Privacy", b + "privacy/"], ["Terms", b + "terms/"], ["Admin", b + "admin/"])),
    h("div", { class: "fbase" }, h("span", { class: "credit" }, "All films shown are the work of their creators and are embedded from their public posts. Rolvo claims no ownership of them."),
      h("span", null, "© " + new Date().getFullYear() + " Rolvo")));
}
const legalBase = () => APP === "merchant" ? "" : "../";

/* work tiles + player */
for (const o of ["https://www.youtube-nocookie.com", "https://i.ytimg.com", "https://player.vimeo.com", "https://video.twimg.com"]) document.head.append(Object.assign(document.createElement("link"), { rel: "preconnect", href: o }));
/* Muted in-place preview of a film. YouTube draws its title, logo, buttons and captions over the first seconds of every embed
   and they cannot be switched off, so the frame stays behind the cover until the player reports it has been playing long
   enough for them to fade (about three seconds). A film that refuses to embed reports an error and the cover simply stays.
   The frame is also three times the box height, which keeps the top and bottom bars outside the visible third. */
const YT_PLAYERS = new WeakMap(); let ytBound = false;
function previewNode(m, fit){
  if (!m || !(m.yt || m.vm || m.mp4)) return null;
  const box = h("div", { class: "hoverplay" + (fit ? " fit" : ""), "aria-hidden": "true" }); const show = () => box.classList.add("on");
  if (m.mp4){ const v = h("video", { src: m.mp4, autoplay: true, loop: true, playsinline: true, referrerpolicy: "no-referrer" }); v.muted = true; v.addEventListener("playing", show, { once: true }); box.append(v); return box; }
  const f = h("iframe", { tabindex: "-1", allow: "autoplay; encrypted-media", referrerpolicy: "strict-origin-when-cross-origin",
    src: m.yt ? `https://www.youtube-nocookie.com/embed/${m.yt}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${m.yt}&rel=0&disablekb=1&iv_load_policy=3&fs=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}` : `https://player.vimeo.com/video/${m.vm}?background=1&autoplay=1&muted=1&loop=1` });
  box.append(f);
  if (!m.yt){ f.addEventListener("load", () => setTimeout(show, 700), { once: true }); return box; }
  const say = o => { try { f.contentWindow.postMessage(JSON.stringify(o), "*"); } catch {} };
  if (!ytBound){ ytBound = true; addEventListener("message", e => { const fn = e.source && YT_PLAYERS.get(e.source); if (!fn) return; let d = e.data; if (typeof d === "string"){ try { d = JSON.parse(d); } catch { return; } } if (d) fn(d); }); }
  let started = false;
  f.addEventListener("load", () => { YT_PLAYERS.set(f.contentWindow, d => {
      if (d.event === "onError") return box.remove();
      const st = d.event === "onStateChange" ? d.info : d.info && d.info.playerState;
      if (st === 1 && !started){ started = true; say({ event: "command", func: "unloadModule", args: ["captions"] }); setTimeout(show, 3200); } });
    say({ event: "listening", id: 1, channel: "widget" }); }, { once: true });
  return box;
}
const canPreview = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
/* hover preview: while the pointer is on a card the film plays in place of its cover; leaving puts the cover back */
function hoverPlay(el, w){
  const m = w && w[5]; if (!m || !(m.yt || m.vm || m.mp4) || !matchMedia("(hover:hover)").matches || !canPreview()) return el;
  let t = null, node = null;
  el.addEventListener("mouseenter", () => { t = setTimeout(() => { const art = el.querySelector(".art"); if (!art) return; node = previewNode(m); art.append(node); }, 0); });   // starts loading the moment the pointer arrives
  el.addEventListener("mouseleave", () => { clearTimeout(t); if (node){ node.remove(); node = null; } });
  return el;
}
function tile(w, c, onclick){ return hoverPlay(h("button", { class: "tile", "aria-label": w[0] + " by " + c.name, onclick }, cover(w), w[5] ? null : h("span", { class: "tag" }, STYLES[w[2]].name), w[3] ? h("span", { class: "len" }, w[3] + "s") : null, h("span", { class: "cap" }, h("b", null, w[0]), h("span", null, c.name + " · " + TAXONOMY[w[1]].name))), w); }
async function playWork(w, c, cta){
  const m = w[5] || {};
  let player;
  if (m.yt) player = h("iframe", { src: `https://www.youtube-nocookie.com/embed/${m.yt}?autoplay=1&rel=0&playsinline=1`, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin", title: w[0] });
  else if (m.vm) player = h("iframe", { src: `https://player.vimeo.com/video/${m.vm}?autoplay=1`, allow: "autoplay; fullscreen; picture-in-picture", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin", title: w[0] });
  else player = h("video", { src: m.mp4 || await workSrc(w), poster: m.cover || "", controls: true, autoplay: true, playsinline: true });
  const meta = [c.name, TAXONOMY[w[1]].name, w[3] ? w[3] + "s" : null].filter(Boolean).join(" · ");
  const credit = m.link ? h("a", { class: "link small", href: m.link, target: "_blank", rel: "noopener" }, "Watch on " + m.on + (m.by && m.by !== c.name && m.by !== "@" + c.handle ? " · uploaded by " + m.by : "") + " ↗") : (w[4] ? null : h("span", { class: "small dim" }, "Demo uses a stock clip"));
  openSheet([h("div", { class: "row between" }, h("div", null, h("h2", { style: { fontSize: "24px" } }, w[0]), h("div", { class: "muted small" }, meta)), h("button", { class: "close", onclick: closeSheet, "aria-label": "Close" }, "×")),
    h("div", { class: "stage" + (m.yt || m.vm ? " embed" : "") }, player),
    h("div", { class: "row between", style: { flexWrap: "wrap", gap: "12px" } }, credit, cta ? h("div", { class: "row", style: { gap: "14px" } }, h("a", { class: "link", href: "#/creator/" + c.id, onclick: closeSheet }, "All of " + (c.real ? c.name : first(c.name)) + "'s work →"), cta) : null)], true);
}

/* ---------- chats: the order lives inside the conversation (Xianyu-style) ---------- */
function actionNeeded(o, uid){
  const isC = o.clientId === uid, isK = o.creatorId === uid;
  switch (o.status){
    case "negotiating": return !o.terms.accepted[uid];
    case "agreed": return isC;
    case "in_production": return isK;
    case "trial_review": return isC;
    case "revising": { const d = DB.latest(o); return d && ["pending", "passed"].includes(d.status) ? isC : isK; }
    case "final_due": return isC;
    case "completed": return !o.review[uid];
    default: return false;
  }
}
const pendingCount = uid => uid ? DB.ordersFor(uid).filter(o => actionNeeded(o, uid)).length : 0;
const otherOf = (o, uid) => DB.user(o.clientId === uid ? o.creatorId : o.clientId);
const lastMsg = o => { const ms = DB.messages(o.id); const m = ms[ms.length - 1]; return !m ? "" : m.kind === "terms" ? "Proposed terms · " + money(m.terms.price) : m.text; };

function vChats(root, id){
  const u = me();
  if (!u) return root.append(h("div", { class: "wrap section" }, h("div", { class: "empty" }, h("b", null, "Sign in to see your messages."), h("button", { class: "btn primary", onclick: () => openSignIn(() => render()) }, "Sign in"))));
  const list = APP === "admin" ? DB.state.orders.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : DB.ordersFor(u.id);
  let o = id ? DB.order(id) : (innerWidth > 800 ? list[0] : null);
  if (o && !(o.clientId === u.id || o.creatorId === u.id || APP === "admin")) o = null;
  root.append(h("div", { class: "chats" + (o ? " open" : "") }, threadList(list, o, u), o ? thread(o, u) : h("div", { class: "thread none" }, h("div", { class: "chat-empty" }, list.length ? h("span", null, "Pick a conversation.") : [h("b", { style: { color: "var(--fg)", fontWeight: 500 } }, APP === "creator" ? "No projects yet." : "No conversations yet."), h("span", null, APP === "creator" ? "When a client starts a project with you, the chat opens here." : "Start a project with a creator and the chat opens here."), APP === "merchant" ? h("a", { class: "btn", href: "#/work" }, "Browse creators") : null]))));
}
function threadList(list, cur, u){
  return h("aside", { class: "tlist" }, h("div", { class: "th" }, h("h2", null, APP === "creator" ? "Inbox" : APP === "merchant" ? "Projects" : "Messages"), APP === "creator" ? h("span", { class: "xs dim" }, DB.breaksLeft(u.id) + " breaks left") : null),
    ...list.map(o => { const other = APP === "admin" ? DB.user(o.creatorId) : otherOf(o, u.id); const need = actionNeeded(o, u.id);
      return h("a", { class: "trow", href: "#/chat/" + o.id, "aria-current": String(cur && cur.id === o.id) }, avatar(other),
        h("div", { style: { minWidth: 0 } }, h("div", { class: "n" }, need ? h("i", { class: "dot" }) : null, APP === "admin" ? DB.nameOf(o.clientId) + " ↔ " + other.name : (other.org || other.name)), h("div", { class: "t" }, o.title + " · " + lastMsg(o))),
        h("div", { class: "r" }, h("span", null, ago(o.updatedAt)), h("span", { class: "badge " + o.status }, STATUS[o.status][0].replace("Contract ready", "Contract")))); }),
    list.length ? null : h("p", { class: "hint", style: { padding: "20px" } }, "Nothing here yet."));
}
function thread(o, u){
  const other = APP === "admin" ? DB.user(o.creatorId) : otherOf(o, u.id); const isParty = u.id === o.clientId || u.id === o.creatorId;
  const items = [...DB.messages(o.id).map(m => ({ at: m.at, m })), ...o.deliveries.map(d => ({ at: d.at, d }))].sort((a, b) => a.at.localeCompare(b.at));
  const stream = h("div", { class: "stream" }, ...items.map(it => it.m ? msgEl(it.m, o, u) : deliveryCard(o, it.d, u)));
  const input = h("input", { class: "i", placeholder: isParty ? "Message " + first(other.name) : "Admins can read but not write", disabled: !isParty, autocomplete: "off" });
  const form = h("form", { class: "composer", onsubmit: e => { e.preventDefault(); if (!input.value.trim()) return; DB.send(o.id, u.id, input.value.trim()); input.value = ""; render(); setTimeout(() => { const i = $(".composer input"); i && i.focus(); }, 0); } },
    h("button", { class: "plus", type: "button", "aria-label": "More", onclick: () => plusMenu(o, u) }, "+"), input, h("button", { class: "btn primary", type: "submit", disabled: !isParty }, "Send"));
  const t = h("section", { class: "thread" },
    h("div", { class: "thead" }, h("a", { class: "btn quiet small back", href: "#/chats" }, "← Back"), avatar(other), h("div", { class: "who" }, h("b", null, APP === "admin" ? DB.nameOf(o.clientId) + " ↔ " + other.name : other.name + (other.org ? " · " + other.org : "")), h("span", null, other.where ? other.where + (other.tz ? " · " + other.tz : "") : (other.profile && other.profile.website) || other.email || "")),
      h("div", { style: { marginLeft: "auto" }, class: "row" }, h("span", { class: "badge " + o.status }, STATUS[o.status][0]), h("button", { class: "btn small", onclick: () => openSheet(detailsSheet(o, u)) }, "Details"))),
    pinnedCard(o, u), stream, form);
  setTimeout(() => { stream.scrollTop = stream.scrollHeight; }, 0);
  return t;
}
function pinnedCard(o, u){
  const a = actionsFor(o, u); const depSt = { none: "deposit not paid", held: "deposit held by Rolvo", released: "deposit released", refunded: "deposit refunded", forfeited: "deposit forfeited" }[o.escrow.deposit];
  return h("div", { class: "pinned" },
    h("div", { class: "ptop" }, h("div", { class: "ptitle" }, o.title), h("div", { class: "pprice" }, money(o.terms.price))),
    h("div", { class: "pfacts" }, h("span", null, h("b", null, o.terms.depositPct + "%"), " deposit"), h("span", null, h("b", null, o.terms.revisions - o.revisionsUsed), " revisions left"), h("span", null, h("b", null, o.terms.durationDays + "d"), o.deadline ? " · due " + when(o.deadline) : ""), h("span", null, depSt), o.escrow.balance === "released" ? h("span", { class: "ok" }, "balance paid") : null),
    a ? h("div", { class: "pact" }, h("span", { class: "txt" }, a.text), ...a.btns.map(b => h("button", { class: "btn small " + (b.cls || ""), onclick: b.onclick }, b.label))) : null);
}
function actionsFor(o, u){
  const isC = u.id === o.clientId, isK = u.id === o.creatorId; if (!isC && !isK) return { text: STATUS[o.status][1], btns: [] };
  const d = DB.latest(o); const end = { label: "End contract", cls: "quiet danger", onclick: () => endContract(o, u) };
  const active = !["completed", "cancelled"].includes(o.status);
  let r;
  switch (o.status){
    case "negotiating": { const ok = o.terms.accepted[u.id]; const other = first(DB.nameOf(isC ? o.creatorId : o.clientId));
      r = ok ? { text: `Waiting for ${other} to accept the terms.`, btns: [{ label: "Counter-propose", onclick: () => proposeTerms(o, u) }] }
             : { text: `${first(DB.nameOf(o.terms.proposedBy))} proposed terms. Accept, or counter.`, btns: [{ label: "Accept terms", cls: "primary", onclick: () => { DB.acceptTerms(o.id, u.id); toast(DB.order(o.id).status === "agreed" ? "Contract generated." : "Accepted. Waiting for the other side."); render(); } }, { label: "Counter-propose", onclick: () => proposeTerms(o, u) }] }; break; }
    case "agreed": r = isC ? { text: "Contract signed. Pay the deposit to open the order; it's held by Rolvo.", btns: [{ label: "Pay " + money(DB.deposit(o)), cls: "primary", onclick: () => pay(o, DB.deposit(o), "Deposit", pm => DB.payDeposit(o.id, pm)) }] } : { text: "Contract signed. Waiting for the client's deposit.", btns: [] }; break;
    case "in_production": r = isK ? { text: `Deposit held. First cut due ${when(new Date(new Date(o.contractAt).getTime() + o.terms.trialDays * 864e5).toISOString())}.`, btns: [{ label: "Upload first cut", cls: "primary", onclick: () => uploadCut(o, "First cut") }] } : { text: `Deposit held. ${first(DB.nameOf(o.creatorId))} is making the first cut.`, btns: [] }; break;
    case "trial_review": r = isC ? { text: "First cut is in. Pass releases the deposit; fail refunds it.", btns: [{ label: "Review v1", cls: "primary", onclick: () => reviewSheet(o, u) }] } : { text: "Client is pre-reviewing v1.", btns: [] }; break;
    case "revising": { const n = o.terms.revisions - o.revisionsUsed;
      if (["pending", "passed"].includes(d.status)) r = isC ? { text: `v${d.v} is in. ${n} revision${n === 1 ? "" : "s"} left.`, btns: [{ label: "Review v" + d.v, cls: "primary", onclick: () => reviewSheet(o, u) }] } : { text: `Client is reviewing v${d.v}.`, btns: [] };
      else r = isK ? { text: `Revision ${o.revisionsUsed}/${o.terms.revisions} requested.`, btns: [{ label: "Upload revision", cls: "primary", onclick: () => uploadCut(o, "Revision v" + (o.deliveries.length + 1)) }] } : { text: "Revision in progress.", btns: [] }; break; }
    case "final_due": r = isC ? { text: "Final approved. The balance unlocks the clean master.", btns: [{ label: "Pay " + money(DB.balance(o)), cls: "primary", onclick: () => pay(o, DB.balance(o), "Balance", pm => DB.payBalance(o.id, pm)) }] } : { text: "Final approved. Waiting for the balance.", btns: [] }; break;
    case "completed": r = o.review[u.id] ? { text: "Done." + (isC ? " The clean master is in the thread." : ""), btns: [] } : { text: "Delivered and paid.", btns: [{ label: "Leave a review", cls: "primary", onclick: () => openSheet([phead("Rate " + DB.nameOf(isC ? o.creatorId : o.clientId)), reviewBox(o, u)]) }] }; break;
    default: r = { text: "Contract ended" + (o.endReason ? ": " + o.endReason : "."), btns: [] };
  }
  if (active) r.btns.push(end);
  return r;
}
function msgEl(mg, o, u){
  if (mg.kind === "system") return h("div", { class: "msg sys" }, h("div", { class: "bub" }, mg.text));
  const mine = mg.from === u.id; const isParty = u.id === o.clientId || u.id === o.creatorId;
  if (mg.kind === "terms"){ const t = mg.terms; const current = JSON.stringify({ ...o.terms, accepted: 0 }) === JSON.stringify({ ...t, accepted: 0 });
    return h("div", { class: "msg" + (mine ? " me" : "") }, h("span", { class: "who" }, DB.nameOf(mg.from) + " · proposed terms · " + ago(mg.at)),
      h("div", { class: "bub terms" }, h("div", { class: "tl" }, h("span", null, "price ", h("b", null, money(t.price))), h("span", null, "deposit ", h("b", null, t.depositPct + "%")), h("span", null, "revisions ", h("b", null, t.revisions)), h("span", null, "duration ", h("b", null, t.durationDays + "d")), h("span", null, "first cut ", h("b", null, t.trialDays + "d"))),
        current && o.status === "negotiating" && !o.terms.accepted[u.id] && isParty ? h("div", null, h("button", { class: "btn primary small", onclick: () => { DB.acceptTerms(o.id, u.id); render(); } }, "Accept these terms")) : current && o.status !== "negotiating" ? h("span", { class: "xs ok" }, "Accepted by both") : !current ? h("span", { class: "xs dim" }, "Superseded") : h("span", { class: "xs dim" }, "You accepted · waiting"))); }
  return h("div", { class: "msg" + (mine ? " me" : "") }, h("span", { class: "who" }, DB.nameOf(mg.from) + " · " + ago(mg.at)), h("div", { class: "bub" }, mg.text));
}
function deliveryCard(o, d, u){
  const mine = u.id === o.creatorId; const clean = o.status === "completed" && d.status === "approved" && u.id === o.clientId;
  const st = { pending: "awaiting review", passed: "passed pre-review", approved: o.status === "completed" && d.v === o.deliveries.length ? "final · clean master" : "approved", rejected: "failed pre-review", revise: "revision requested" }[d.status];
  return h("div", { class: "msg" + (mine ? " me" : "") }, h("span", { class: "who" }, DB.nameOf(o.creatorId) + " · " + ago(d.at)),
    h("div", { class: "dcard" }, h("div", { class: "dtop" }, h("b", null, (d.kind === "trial" ? "First cut" : "Revision") + " · v" + d.v), h("span", null, st)), d.note ? h("p", null, d.note) : null, d.feedback ? h("p", { style: { borderLeft: "1px solid var(--line2)", paddingLeft: "10px" } }, "“" + d.feedback + "”") : null,
      h("div", { class: "row" }, h("button", { class: "btn small", onclick: () => showPreview(o, d, clean) }, clean ? "Open clean master" : "View preview"))));
}
function plusMenu(o, u){
  const isC = u.id === o.clientId, isK = u.id === o.creatorId; const items = [];
  if (o.status === "negotiating" && (isC || isK)) items.push(["Propose terms", "Price, deposit %, revisions, dates", () => { closeSheet(); proposeTerms(o, u); }]);
  if (isK && o.status === "in_production") items.push(["Deliver first cut", "Watermarked for the client", () => { closeSheet(); uploadCut(o, "First cut"); }]);
  if (isK && o.status === "revising" && DB.latest(o).status === "revise") items.push(["Deliver revision", "v" + (o.deliveries.length + 1), () => { closeSheet(); uploadCut(o, "Revision v" + (o.deliveries.length + 1)); }]);
  items.push(["Order details", "Terms, escrow, brief, deliveries", () => { closeSheet(); openSheet(detailsSheet(o, u)); }]);
  if (!["completed", "cancelled"].includes(o.status) && (isC || isK)) items.push(["End contract", DB.breaksLeft(u.id) + " breaks left this month", () => { closeSheet(); endContract(o, u); }]);
  openSheet([phead(o.title), h("div", { class: "menu" }, ...items.map(([l, s, f]) => h("button", { onclick: f }, l, h("span", null, s))))]);
}
const FLOW = ["negotiating", "agreed", "in_production", "trial_review", "revising", "final_due"];
function detailsSheet(o, u){
  const c = DB.creator(o.creatorId); const client = DB.user(o.clientId);
  const idx = o.status === "completed" ? 6 : o.status === "cancelled" ? -1 : FLOW.indexOf(o.status);
  const esc = (label, amt, st) => h("div", { class: "box" }, h("span", null, label), h("b", null, money(amt)), h("span", { class: "st" }, st));
  const depSt = { none: "not paid", held: "held by Rolvo", released: "released to creator", refunded: "refunded to client", forfeited: "forfeited to creator" }[o.escrow.deposit];
  const balSt = { none: o.status === "final_due" ? "due now" : "due on final approval", released: "paid · master unlocked" }[o.escrow.balance];
  return [phead(o.title, (client.org || client.name) + "  ↔  " + c.name + "  ·  opened " + when(o.createdAt) + (o.deadline ? "  ·  due " + when(o.deadline) : "")),
    h("div", { class: "details" },
      h("div", null, h("div", { class: "flow" }, ...FLOW.map((s, i) => h("div", { class: idx === -1 ? "bad" : i < idx ? "done" : i === idx ? "now" : "" }))), h("div", { class: "flowlbl" }, ...["Terms", "Contract", "Deposit", "Pre-review", "Revisions", "Final"].map(x => h("span", null, x))), h("p", { class: "small muted", style: { marginTop: "10px" } }, STATUS[o.status][1])),
      h("div", { class: "terms" }, ...[[money(o.terms.price), "price"], [o.terms.depositPct + "%", "deposit"], [o.terms.revisions, "revisions"], [o.terms.durationDays + "d", "duration"], [o.terms.trialDays + "d", "first cut"]].map(([v, k]) => h("div", { class: "tm" }, h("b", null, v), h("span", null, k)))),
      h("div", { class: "escrow" }, esc("Deposit", DB.deposit(o), depSt), esc("Balance", DB.balance(o), balSt)),
      o.brief ? h("div", { class: "brief" }, h("span", { class: "eyebrow" }, "Brief"), h("p", null, o.brief), (o.cat || o.style) ? h("div", { class: "chips" }, o.cat ? h("span", { class: "chip on" }, TAXONOMY[o.cat].name) : null, o.style ? styleChip(o.style) : null) : null) : null,
      o.status === "cancelled" ? h("div", { class: "notice warn" }, h("b", null, "Ended by " + DB.nameOf(o.endedBy) + ". "), o.endReason) : null,
      o.deliveries.length ? h("div", null, h("span", { class: "eyebrow" }, "Deliveries"), h("div", { class: "dlist" }, ...o.deliveries.slice().reverse().map(d => h("div", { class: "dl" }, h("span", { class: "v" }, "v" + d.v), h("div", { class: "n" }, (d.kind === "trial" ? "First cut" : "Revision") + (d.note ? " · " + d.note : ""), h("small", null, when(d.at) + " · " + d.status)), h("button", { class: "btn small", onclick: () => showPreview(o, d, o.status === "completed" && d.status === "approved" && u.id === o.clientId) }, "View"))))) : null)];
}
function reviewSheet(o, u){
  const d = DB.latest(o); const trial = o.status === "trial_review"; const n = o.terms.revisions - o.revisionsUsed;
  const ta = h("textarea", { class: "i", placeholder: trial ? "Notes (required if you fail it)" : "What to change (required for a revision)" });
  const act = (dec, label, cls) => h("button", { class: "btn " + cls, onclick: () => { if (dec !== "approve" && ta.value.trim().length < 3) return toast("Add a note so the creator knows what to change."); DB.decide(o.id, dec, ta.value.trim()); closeSheet(); render(); } }, label);
  const box = h("div"); buildPreview(o, d, false).then(p => box.append(p));
  openSheet([phead((trial ? "Pre-review" : "Review") + " · v" + d.v, trial ? "Pass releases the deposit to the creator and opens revisions. Fail refunds you and closes the order." : `${n} revision${n === 1 ? "" : "s"} left. Approving as final moves to the balance.`), box, ta,
    h("div", { class: "row" }, trial ? [act("approve", "Pass pre-review", "primary"), act("reject", "Fail & refund", "danger")] : [act("approve", "Approve as final", "primary"), n > 0 ? act("revise", "Request revision", "") : null])], true);
}
function reviewBox(o, u){
  let stars = 5; const ta = h("textarea", { class: "i", placeholder: "How did it go?" });
  const rate = h("div", { class: "rate" }, ...[1, 2, 3, 4, 5].map(n => h("button", { class: n <= stars ? "on" : "", onclick: () => { stars = n; [...rate.children].forEach((b, i) => b.classList.toggle("on", i < n)); } }, "★")));
  return h("div", { class: "stack" }, rate, ta, h("div", null, h("button", { class: "btn primary", onclick: () => { DB.review(o.id, u.id, stars, ta.value.trim()); closeSheet(); toast("Review posted."); render(); } }, "Post review")));
}
function endContract(o, u){
  const ta = h("textarea", { class: "i", placeholder: "Why? The other side sees this." });
  const held = o.escrow.deposit === "held";
  openSheet([phead("End this contract?", `${DB.breaksLeft(u.id)} of ${BREAK_LIMIT} breaks left this month`),
    h("div", { class: "notice warn" }, held ? (u.id === o.clientId ? "The deposit is non-refundable: it goes to the creator." : "You're the creator ending it: the deposit is refunded to the client.") : "No money has moved yet."),
    ta, h("div", { class: "row" }, h("button", { class: "btn danger", onclick: () => { if (!DB.breakContract(o.id, u.id, ta.value.trim())) return toast("You've hit this month's break limit."); closeSheet(); render(); } }, "End contract"), h("button", { class: "btn quiet", onclick: closeSheet }, "Keep it"))]);
}
function proposeTerms(o, u){
  const t = o.terms;
  const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); const fd = new FormData(f);
    DB.proposeTerms(o.id, u.id, { price: +fd.get("price"), depositPct: +fd.get("dep"), revisions: +fd.get("rev"), durationDays: +fd.get("dur"), trialDays: +fd.get("trial") }); closeSheet(); render(); } },
    h("div", { class: "row2" }, field("Price (USD)", h("input", { class: "i", name: "price", type: "number", min: "50", step: "50", value: t.price, required: true })), field("Deposit %", h("input", { class: "i", name: "dep", type: "number", min: "10", max: "100", step: "5", value: t.depositPct, required: true }))),
    h("div", { class: "row3" }, field("Revisions", h("input", { class: "i", name: "rev", type: "number", min: "0", max: "10", value: t.revisions, required: true }), "0 for large commercial jobs"), field("Duration (days)", h("input", { class: "i", name: "dur", type: "number", min: "1", value: t.durationDays, required: true })), field("First cut in (days)", h("input", { class: "i", name: "trial", type: "number", min: "1", value: t.trialDays, required: true }))),
    h("p", { class: "hint" }, "A new proposal resets acceptance; the other side has to accept this version."),
    h("button", { class: "btn primary", type: "submit" }, "Send proposal"));
  openSheet([phead("Propose terms", "Both sides must accept the same version."), f]);
}
function uploadCut(o, label){
  let file = null; const url = h("input", { class: "i", type: "url", placeholder: "https://…/cut.mp4" });
  const input = h("input", { type: "file", accept: "video/mp4,video/quicktime,video/webm", onchange: e => { file = e.target.files[0] || null; } });
  const note = h("textarea", { class: "i", placeholder: "What changed, what to look at" });
  async function submit(useSample){ const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    let fileId = null, u = null;
    if (useSample) u = SAMPLE_CLIP; else if (file) fileId = await Files.put(file); else if (url.value) u = url.value; else { btn.disabled = false; return toast("Pick a file, paste a link, or use the sample clip."); }
    DB.deliver(o.id, { fileId, url: u, note: note.value.trim() }); closeSheet(); toast(label + " delivered."); render(); }
  const f = h("form", { class: "form", onsubmit: e => { e.preventDefault(); submit(false); } },
    field("Video file", input, "stays in this browser"), field("or a link", url), field("Note to client", note),
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit" }, "Deliver"), h("button", { class: "btn", type: "button", onclick: () => submit(true) }, "Use a sample clip")),
    h("p", { class: "hint" }, "The client sees this watermarked with their name and the order id, download disabled, blurred when their window loses focus. The clean file unlocks only after the balance is paid."));
  openSheet([phead("Deliver " + label, o.title), f]);
}
async function buildPreview(o, d, clean){
  let src = d.url; if (d.fileId){ const b = await Files.get(d.fileId); if (b) src = URL.createObjectURL(b); }
  const client = DB.user(o.clientId); const who = (client.org || client.name || client.email);
  const vid = h("video", { controls: true, playsinline: true, controlslist: clean ? null : "nodownload noremoteplayback", disablepictureinpicture: !clean, oncontextmenu: e => { if (!clean) e.preventDefault(); } });
  if (src) vid.src = src;
  const wm = h("div", { class: "wm" }, ...Array.from({ length: 36 }, () => h("span", null, "PREVIEW · ", h("b", null, who.toUpperCase()), " · " + o.id.toUpperCase())));
  const box = h("div", { class: "preview" + (clean ? " clean" : "") }, vid, wm, h("div", { class: "corner" }, "v" + d.v + " · ", h("b", null, clean ? "CLEAN MASTER" : "NOT FOR DISTRIBUTION")));
  const blind = h("div", { class: "blind", hidden: true }, "Preview hidden while the window is inactive"); box.append(blind);
  if (!clean){ const hide = () => { box.classList.add("hidden-away"); blind.hidden = false; vid.pause(); }; const show = () => { box.classList.remove("hidden-away"); blind.hidden = true; };
    document.addEventListener("visibilitychange", () => document.hidden ? hide() : show()); addEventListener("blur", hide); addEventListener("focus", show); }
  box.dataset.src = src || ""; return box;
}
async function showPreview(o, d, clean){
  const box = await buildPreview(o, d, clean); const src = box.dataset.src;
  openSheet([phead(o.title + " · v" + d.v, clean ? "Clean master. Licensed to " + (DB.user(o.clientId).org || DB.nameOf(o.clientId)) + "." : "Watermarked preview · download disabled · hides when the window loses focus"), box,
    clean && src ? h("a", { class: "btn primary", href: src, download: o.title.replace(/[^\w]+/g, "_") + "_v" + d.v + ".mp4" }, "Download clean master") : h("p", { class: "hint" }, "Visible watermark and blur-on-blur are the deterrent layer; production adds forensic per-viewer watermarks and signed, expiring URLs.")], true);
}

/* boot shared bits */
function bootShared(){
  $("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
  if (!LIVE.auth || !LIVE.stripe || !LIVE.paypal) document.body.classList.add("demo-mode");
  DB.load(); addEventListener("hashchange", () => { scrollTo(0, 0); render(); }); render();
  Auth.boot();   // finishes a Google redirect in live mode
}
