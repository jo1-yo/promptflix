/* Rolvo — Connect to your AI (client site). The page at #/connect and the entry on the home page.
   The server is server/mcp/worker.js. A signed-in client makes one personal address here (server/mcp/mcp.sql);
   nothing is shown as working until CONFIG.mcpUrl is set. */
const AI_ASKS = ["Find three filmmakers for a sneaker launch film, under $5k.", "Who on Rolvo makes anime-style music videos?", "Shortlist explainer creators who can deliver in ten days."];
const AI_NOW = ["Search filmmakers by brief, style, budget and deadline", "Read a profile and every film", "Browse categories and styles"];
const AI_SOON = ["Message a creator", "Send an order", "Book a call"];
let AI_KEY = null;   // the key just made; kept only until the page is reloaded
const aiOpen = () => !!(CONFIG.mcpUrl && LIVE.auth);
const aiCopy = (text, said) => { const done = () => toast(said || "Copied"); navigator.clipboard ? navigator.clipboard.writeText(text).then(done, () => toast("Copy it by hand: select the text.")) : toast("Copy it by hand: select the text."); };

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
