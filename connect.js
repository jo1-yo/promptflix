/* Rolvo — Connect to your AI (client site). The page at #/connect and the entry on the home page.
   The server is server/mcp/worker.js. A signed-in client makes one personal address here (server/mcp/mcp.sql);
   nothing is shown as working until CONFIG.mcpUrl is set. */
const AI_ASKS = ["Find three filmmakers for a sneaker launch film, under $5k.", "Who on Rolvo makes anime-style music videos?", "Shortlist explainer creators who can deliver in ten days."];
const AI_NOW = ["Search filmmakers by brief, style, budget and deadline", "Read a profile and every film", "Browse categories and styles"];
const AI_SOON = ["Message a creator", "Send an order", "Book a call"];
let AI_KEY = null;   // the key just made; kept only until the page is reloaded
const aiOpen = () => !!(CONFIG.mcpUrl && LIVE.auth);
const aiUsd = n => n >= 1000 ? "$" + (n / 1000) + "k" : "$" + n;
const aiCopy = (text, said) => { const done = () => toast(said || "Copied"); navigator.clipboard ? navigator.clipboard.writeText(text).then(done, () => toast("Copy it by hand: select the text.")) : toast("Copy it by hand: select the text."); };

/* Types `lines` one after another into `el`. `loop` keeps cycling; otherwise it stops on the first and calls `then`. */
function aiType(el, lines, loop, then){
  if (!canPreview()){ el.textContent = lines[0]; then && then(); return; }
  let i = 0, n = 0;
  const tick = () => { if (!el.isConnected) return;
    const s = lines[i]; el.textContent = s.slice(0, ++n);
    if (n < s.length) return setTimeout(tick, 26);
    if (!loop) return then && then();
    setTimeout(() => { if (!el.isConnected) return; i = (i + 1) % lines.length; n = 0; el.textContent = ""; tick(); }, 2400); };
  setTimeout(tick, 500);
}

/* Home entry. Two directions while Jane picks: the card with a small worked example (default) and the single line (#/?ai=b). */
function aiHome(variant){
  if (variant === "b"){
    const t = h("span", { class: "aitype" }); aiType(t, AI_ASKS, true);
    return h("section", { class: "wrap aihome" }, h("a", { class: "ailine", href: "#/connect", "aria-label": "Connect to your AI" },
      h("i", { class: "aidot", "aria-hidden": "true" }), h("span", { class: "aisay", "aria-hidden": "true" }, t), h("span", { class: "aigo" }, "Connect to your AI ", h("i", { "aria-hidden": "true" }, "→"))));
  }
  const hits = DB.match({ cat: "biz", styles: ["hero"], text: "launch", strict: true }).map(x => x.c).filter(c => c.works.length && c.works[0][5] && c.works[0][5].cover).slice(0, 3);
  const ask = h("span", { class: "aitype" });
  const ans = h("div", { class: "aians" }, ...hits.map(c => { const r = DB.priceRange(c);
    return h("div", { class: "aihit" }, h("img", { src: c.works[0][5].cover, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }),
      h("b", null, c.name), h("span", null, (r.est ? "~" : "") + aiUsd(r.lo) + "–" + aiUsd(r.hi))); }));
  aiType(ask, [AI_ASKS[0]], false, () => ans.classList.add("on"));
  return h("section", { class: "wrap aihome" }, h("a", { class: "aicard", href: "#/connect" },
    h("div", { class: "aicopy" }, h("span", { class: "eyebrow" }, "Connect to your AI"), h("h2", null, "Ask your AI. It finds the filmmaker."),
      h("span", { class: "btn primary" }, "Connect")),
    h("div", { class: "aidemo", "aria-hidden": "true" }, h("div", { class: "aiask" }, ask), ans)));
}

/* The address pane. Signed out: sign in. Signed in: make the address, shown once. */
function aiAddress(box){
  const say = (...kids) => box.replaceChildren(...kids);
  if (!aiOpen()) return say(h("b", null, "Opening soon"), h("p", { class: "hint" }, "Connections are not open yet. The page will show your address here when they are."));
  const u = me();
  if (!u) return say(h("b", null, "Your address"), h("p", { class: "hint" }, "Each client gets a personal address. Sign in to make yours."),
    h("div", null, h("button", { class: "btn primary", onclick: () => openSignIn(() => render(), { title: "Sign in to connect your AI", sub: "Your address is tied to your account." }) }, "Sign in")));
  const base = CONFIG.mcpUrl.replace(/\/$/, "");
  const make = async btn => { btn.disabled = true;
    const { data, error } = await Auth.client().rpc("market_agent_key_create");
    if (error || !data){ btn.disabled = false; return toast(/sign in/i.test((error || {}).message || "") ? "Sign in again, then make your address." : "Could not make the address. Try again."); }
    AI_KEY = data; aiAddress(box); };
  if (AI_KEY){ const url = base + "/" + AI_KEY;
    return say(h("b", null, "Your address"), h("div", { class: "aiurl" }, h("code", null, url), h("button", { class: "btn primary small", onclick: () => aiCopy(url, "Address copied") }, "Copy")),
      h("p", { class: "hint" }, "Shown once. Keep it private: it works as you. Making a new one turns this one off.")); }
  say(h("b", null, "Your address"), h("p", { class: "hint" }, "One moment."));
  (async () => {
    const sb = Auth.client(); const s = sb && (await sb.auth.getSession()).data.session;
    if (!s) return say(h("b", null, "Your address"), h("p", { class: "hint" }, "Sign in again to make your address."), h("div", null, h("button", { class: "btn primary", onclick: () => openSignIn(() => render()) }, "Sign in")));
    const { data, error } = await sb.from("market_agent_keys").select("hint,created_at,last_used_at").is("revoked_at", null).limit(1);
    if (error) return say(h("b", null, "Opening soon"), h("p", { class: "hint" }, "Connections are not open yet."));
    const k = data && data[0]; const day = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const btn = h("button", { class: k ? "btn" : "btn primary", onclick: () => make(btn) }, k ? "Make a new address" : "Make my address");
    say(h("b", null, "Your address"), h("p", { class: "hint" }, k ? `Active, ending in ${k.hint}. Made ${day(k.created_at)}${k.last_used_at ? ", last used " + day(k.last_used_at) : ", not used yet"}. A new one turns it off.` : "A personal address for your agent. It works as you, so keep it private."), h("div", null, btn));
  })().catch(() => say(h("b", null, "Your address"), h("p", { class: "hint" }, "Could not reach Rolvo. Reload to try again.")));
}

function vConnect(m){
  const box = h("div", { class: "card aiaddr" }); aiAddress(box);
  const how = [["Claude", "Settings → Connectors → Add custom connector. Paste your address."], ["ChatGPT", "Settings → Apps & Connectors → Create, with developer mode on. Paste your address."], ["Cursor, Claude Code, your own agent", "Add a remote MCP server (HTTP) with your address as the URL."]];
  const rows = (items, cls) => h("div", { class: "uses " + cls }, ...items);
  m.append(h("section", { class: "wrap section aipage" },
    h("div", { class: "stack", style: { gap: "14px", marginBottom: "36px" } }, h("h1", { class: "pname" }, "Connect to your AI"),
      h("p", { class: "lead" }, "Your agent searches Rolvo, reads the work and brings back a shortlist.")),
    box,
    h("h2", null, "Add it"), rows(how.map(([t, d]) => h("div", { class: "use" }, h("b", null, t), h("span", null, d))), "aihow"),
    h("h2", null, "Then ask"), rows(AI_ASKS.map(t => h("button", { class: "use", type: "button", onclick: () => aiCopy(t) }, h("span", null, t), h("i", null, "Copy"))), "aiasks"),
    h("h2", null, "What it can do"), rows([...AI_NOW.map(t => h("div", { class: "use" }, h("span", null, t), h("i", null, "Now"))), ...AI_SOON.map(t => h("div", { class: "use soon" }, h("span", null, t), h("i", null, "Soon")))], "aican"),
    h("p", { class: "hint aiapi" }, "Building your own? The same reads are plain JSON at /v1/creators, /v1/creators/{handle} and /v1/categories, with your key as a Bearer token.")));
}
