/* Rolvo — Connect to your AI. One Cloudflare Worker, no dependencies.
   · POST /mcp            remote MCP server (Streamable HTTP, stateless JSON responses)
   · GET  /v1/…           the same three reads as plain JSON
   Every call needs a personal key: a signed-in client makes one on rolvo.market/#/connect (server/mcp/mcp.sql).
   The key travels as `Authorization: Bearer <key>` or as the last path segment (/mcp/<key>) for agents that only take a URL.
   Each tool call is recorded against the account (market_agent_calls), so we know who asked for what.

   Creator data is read from the site itself (creators.js, config.js), so a deploy of the site is a deploy of the data.
   Read-only for now. Messages, orders and calls come once those live in the database. */

const SITE_DEFAULT = "https://rolvo.market";
const SERVER = { name: "rolvo", title: "Rolvo", version: "0.1.0" };
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DATA_TTL = 5 * 60 * 1000;

/* Mirrors TAXONOMY and STYLES in seed.js (names only). scripts/check.mjs fails if an id there is missing here. */
const CATEGORIES = {
  biz: ["Business & Brand", "Ads, launches, demos, brand films."],
  film: ["Film & Short Film", "Narrative shorts, spec films, festival pieces."],
  duanju: ["Short Drama", "Vertical micro-drama, 1-3 min episodes."],
  interactive: ["Interactive Games", "Branching stories, FMV, playable ads, cutscenes."],
  reels: ["Reels & UGC", "Vertical, 6-60 s, built for the feed."],
  mv: ["Music Video", "Full tracks, visualizers, lyric films."],
  anim: ["Animation & Character", "Mascots, 2D/3D, character-led stories."],
};
const STYLE_NAMES = {
  demo: ["Software demo", "Screen-led. The product does the talking."],
  story: ["Storytelling", "A character, a problem, a turn."],
  stream: ["Stream of consciousness", "Associative, dreamy, image-driven."],
  explainer: ["Explainer / motion", "Typography, diagrams, clean motion graphics."],
  hero: ["Product hero", "Macro, slow, glossy. The object as sculpture."],
  ugc: ["UGC / testimonial", "Handheld, face-to-camera."],
  trend: ["Trend / meme-native", "Fast cuts, captions, sound-driven."],
  hook: ["Hook-first", "First 2 seconds do all the work."],
  cinematic: ["Cinematic realism", "Anamorphic, graded, film-like performances."],
  surreal: ["Surreal", "Impossible physics, dream logic."],
  anime: ["Anime / stylized", "2D-inspired, bold lines."],
  noir: ["Noir / dark", "High contrast, shadows, tension."],
  doc: ["Documentary", "Observational, interview-led."],
  found: ["Found footage", "Security cams, phones, degraded video."],
  soap: ["Soap / melodrama", "Close-ups, big reactions, cliffhanger beats."],
};
const REGIONS = { americas: "Americas", emea: "Europe, Africa & Middle East", apac: "Asia-Pacific" };
const STOP = new Set("a an the and or for of to in on with my our we i me is are be need want looking find video film films videos ai that this it by from at as who can make made someone creator creators filmmaker filmmakers under about".split(" "));

/* ── data ── */
let DATA = null, DATA_AT = 0, DATA_SITE = "";
async function loadData(env){
  const site = (env.SITE || SITE_DEFAULT).replace(/\/$/, "");
  if (DATA && DATA_SITE === site && Date.now() - DATA_AT < DATA_TTL) return DATA;
  const get = async f => { const r = await fetch(site + "/" + f); if (!r.ok) throw new Error(f + " " + r.status); return r.text(); };
  try {
    const [cjs, cfg] = await Promise.all([get("creators.js"), get("config.js").catch(() => "")]);
    const start = cjs.indexOf("const CREATORS = "); const end = cjs.indexOf("];\n", start);
    if (start < 0 || end < 0) throw new Error("creators.js has an unexpected shape");
    const all = JSON.parse(cjs.slice(start + 17, end + 1));
    const feat = (cfg.match(/featured:\s*\[([\s\S]*?)\]/) || [, ""])[1].match(/"([^"]+)"/g) || [];
    const featured = feat.map(s => s.slice(1, -1));
    const rank = c => { const i = featured.indexOf(c.handle); return i < 0 ? 1e9 : i; };
    // the same roster the site shows: live creators with a film or a cover, featured first
    const roster = all.filter(c => c.live && ((c.works || []).length || c.cover)).map((c, i) => ({ c, i })).sort((a, b) => (rank(a.c) - rank(b.c)) || (a.i - b.i)).map(x => x.c);
    DATA = { roster, featured: new Set(featured), site }; DATA_AT = Date.now(); DATA_SITE = site;
  } catch (e) { if (!DATA || DATA_SITE !== site) throw e; }   // the site blipped: keep serving the last good copy
  return DATA;
}

/* ── shaping: what an agent may see. No email, phone or social link; contact goes through Rolvo. ── */
const priceOf = c => {
  const pts = [...(c.closes || []), ...(c.ask ? [c.ask] : [])];
  if (pts.length) return { low_usd: Math.min(...pts), high_usd: Math.max(...pts), basis: "quoted" };
  if (c.est) return { low_usd: c.est[0], high_usd: c.est[1], basis: "estimate", note: "Rolvo's estimate for this kind of work, not a price the creator quoted." };
  return null;
};
const named = (ids, table) => (ids || []).filter(id => table[id]).map(id => ({ id, name: table[id][0] }));
const workOf = w => { const m = w[5] || {}; return { title: w[0], category: w[1], style: w[2], url: m.link || null, platform: m.on || null, cover: m.cover || null }; };
const profileUrl = (c, site) => site + "/#/creator/" + c.id;
function brief(c, site){
  return { handle: c.handle, name: c.name, location: c.where || null, region: c.region || null, about: c.bg || null,
    categories: named(c.cats, CATEGORIES), styles: named(c.styles, STYLE_NAMES), price: priceOf(c), typical_days: c.days || null,
    on_rolvo: !!c.claimed, films: (c.works || []).length, top_film: c.works && c.works[0] ? workOf(c.works[0]) : null, profile_url: profileUrl(c, site) };
}
function full(c, site){
  const b = brief(c, site); delete b.top_film;
  return { ...b, timezone: c.tz || null, tools: c.tools || [], works: (c.works || []).map(workOf),
    status: c.claimed ? "This creator has joined Rolvo." : "Listed from public work. This creator has not joined Rolvo yet.",
    contact: "Open profile_url and start a project. Rolvo does not share creators' contact details." };
}

/* ── the three reads ── */
const list = v => Array.isArray(v) ? v : typeof v === "string" ? v.split(",").map(s => s.trim()).filter(Boolean) : [];
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
function searchCreators(data, a){
  const cat = a.category && CATEGORIES[a.category] ? a.category : null;
  if (a.category && !cat) throw new ToolError(`Unknown category "${a.category}". Call list_categories for the ids.`);
  const styles = list(a.styles); const bad = styles.find(s => !STYLE_NAMES[s]);
  if (bad) throw new ToolError(`Unknown style "${bad}". Call list_categories for the ids.`);
  if (a.region && !REGIONS[a.region]) throw new ToolError(`Unknown region "${a.region}". Use americas, emea or apac.`);
  const bmin = num(a.budget_min_usd), bmax = num(a.budget_max_usd), days = num(a.max_days);
  const limit = Math.min(25, Math.max(1, Math.floor(num(a.limit)) || 8));
  const words = String(a.query || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !STOP.has(w));
  const out = [];
  for (const c of data.roster){
    const p = priceOf(c);
    if (cat && !c.cats.includes(cat)) continue;
    if (a.region && c.region !== a.region) continue;
    if (days && c.days > days) continue;
    if (p && bmax && p.low_usd > bmax) continue;
    if (p && bmin && p.high_usd < bmin) continue;
    let score = 0; const why = [];
    if (cat){ score += 40; why.push(CATEGORIES[cat][0]); }
    const sm = styles.filter(s => c.styles.includes(s));
    if (styles.length && !sm.length && !words.length) continue;
    if (sm.length){ score += Math.min(50, 30 * sm.length); why.push(...sm.map(s => STYLE_NAMES[s][0])); }
    if (words.length){
      const hay = [c.name, c.handle, c.bg, c.where, ...(c.tools || []), ...c.styles.map(s => (STYLE_NAMES[s] || [s])[0]), ...c.cats.map(k => (CATEGORIES[k] || [k])[0]), ...(c.works || []).map(w => w[0])].join(" ").toLowerCase();
      const hits = words.filter(w => hay.includes(w));
      if (!hits.length && !cat && !sm.length) continue;            // a search with words must match something
      score += hits.length * 12; if (hits.length) why.push("mentions " + hits.slice(0, 3).join(", "));
    }
    if (p && (bmin || bmax)) why.push(p.basis === "estimate" ? "estimate fits the budget" : "in budget");
    out.push({ c, score, why, lift: data.featured.has(c.handle) && score > 0 ? 1 : 0 });
  }
  out.sort((x, y) => (y.lift - x.lift) || (y.score - x.score));
  return { total: out.length, returned: Math.min(limit, out.length),
    creators: out.slice(0, limit).map(m => ({ ...brief(m.c, data.site), why: [...new Set(m.why)].slice(0, 4) })),
    note: "Prices marked basis:\"estimate\" are Rolvo's range for the category, not quotes. Call get_creator for every film by one creator." };
}
function getCreator(data, a){
  const key = String(a.handle || "").trim().replace(/^@/, "").toLowerCase();
  if (!key) throw new ToolError("Pass the creator's handle, as returned by search_creators.");
  const c = data.roster.find(c => c.handle.toLowerCase() === key || c.id.toLowerCase() === key);
  if (!c) throw new ToolError(`No creator with the handle "${a.handle}". Use search_creators to find one.`);
  return full(c, data.site);
}
function listCategories(data){
  const count = (k, f) => data.roster.filter(c => c[f].includes(k)).length;
  return { categories: Object.entries(CATEGORIES).map(([id, [name, about]]) => ({ id, name, about, creators: count(id, "cats") })),
    styles: Object.entries(STYLE_NAMES).map(([id, [name, about]]) => ({ id, name, about, creators: count(id, "styles") })),
    regions: Object.entries(REGIONS).map(([id, name]) => ({ id, name })) };
}

class ToolError extends Error {}
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const TOOLS = [
  { name: "search_creators", title: "Search creators", run: searchCreators, annotations: RO,
    description: "Find AI filmmakers on Rolvo for a video brief. Filter by category, styles, budget (USD), turnaround and region; `query` adds free-text keywords (subject, mood, tools, a film title). Results are ranked best first, each with a price range, a top film and a Rolvo profile link. Call list_categories first if you don't know the category and style ids.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      query: { type: "string", description: "Keywords from the brief, e.g. \"sneaker launch, glossy macro\"." },
      category: { type: "string", enum: Object.keys(CATEGORIES), description: "Kind of video." },
      styles: { type: "array", items: { type: "string", enum: Object.keys(STYLE_NAMES) }, description: "One or two looks the client wants." },
      budget_min_usd: { type: "number", description: "Lowest total budget in USD." },
      budget_max_usd: { type: "number", description: "Highest total budget in USD." },
      max_days: { type: "number", description: "Needed within this many days." },
      region: { type: "string", enum: Object.keys(REGIONS), description: "Where the creator works." },
      limit: { type: "integer", minimum: 1, maximum: 25, description: "How many to return. Default 8." } } } },
  { name: "get_creator", title: "Read a creator's profile", run: getCreator, annotations: RO,
    description: "One creator's Rolvo profile: background, categories, styles, price range, typical turnaround and every film with its link and cover image. Pass the handle from search_creators.",
    inputSchema: { type: "object", additionalProperties: false, required: ["handle"], properties: { handle: { type: "string", description: "Creator handle, e.g. \"thedorbrothers\"." } } } },
  { name: "list_categories", title: "List categories and styles", run: listCategories, annotations: RO,
    description: "The video categories, visual styles and regions Rolvo uses, with how many creators are in each. Use the ids as filters in search_creators.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} } },
];
const INSTRUCTIONS = "Rolvo is a marketplace for AI filmmakers. Use these tools to shortlist creators for a client's video brief: list_categories for the vocabulary, search_creators to rank people, get_creator to read one profile and watch links. Show the client each creator's name, why they fit, the price range (say when it is an estimate) and the profile_url. Hiring, messages and payment happen on rolvo.market through that link; this connection is read-only.";

/* ── keys: who is calling. Checked (and each tool call recorded) by one RPC in Supabase. ── */
async function whoIs(key, env, tool, args){
  if (!key || !/^[A-Za-z0-9_]{20,120}$/.test(key)) return null;
  if (env.DEV_KEY) return key === env.DEV_KEY ? "dev" : null;           // local testing only; never set in production
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  const r = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/rpc/market_agent_use", { method: "POST",
    headers: { "content-type": "application/json", apikey: env.SUPABASE_KEY, authorization: "Bearer " + env.SUPABASE_KEY },
    body: JSON.stringify({ p_key: key, p_tool: tool || null, p_args: args || {} }) });
  if (!r.ok) return null;
  const id = await r.json(); return typeof id === "string" && id ? id : null;
}
function keyFrom(req, url){
  const h = req.headers.get("authorization") || ""; if (/^bearer\s+/i.test(h)) return h.replace(/^bearer\s+/i, "").trim();
  const m = url.pathname.match(/^\/mcp\/([^/]+)\/?$/); return m ? m[1] : url.searchParams.get("key");
}

/* ── http ── */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id", "access-control-max-age": "86400" };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra } });
const NOKEY = site => ({ error: "unauthorized", message: `This connection needs a personal Rolvo key. Sign in at ${site}/#/connect and copy your address.` });

const rpcOk = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
async function rpc(msg, ctx){
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcErr(msg && msg.id, -32600, "Invalid request");
  const { id, method, params = {} } = msg; const note = id === undefined;
  if (method === "initialize") return rpcOk(id, { protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
  if (note) return null;                                                // notifications/initialized and friends
  if (method === "ping") return rpcOk(id, {});
  if (method === "tools/list") return rpcOk(id, { tools: TOOLS.map(({ run, ...t }) => t) });
  if (method === "tools/call"){
    const tool = TOOLS.find(t => t.name === params.name);
    if (!tool) return rpcErr(id, -32602, "Unknown tool: " + params.name);
    const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
    if (!(await ctx.record(tool.name, args))) return rpcErr(id, -32001, NOKEY(ctx.site).message);
    try { const out = tool.run(await loadData(ctx.env), args); return rpcOk(id, { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out }); }
    catch (e) { if (e instanceof ToolError) return rpcOk(id, { content: [{ type: "text", text: e.message }], isError: true }); throw e; }
  }
  if (["resources/list", "prompts/list"].includes(method)) return rpcOk(id, { [method.split("/")[0]]: [] });
  return rpcErr(id, -32601, "Method not found: " + method);
}

export default {
  async fetch(req, env = {}){
    const url = new URL(req.url); const path = url.pathname.replace(/\/+$/, "") || "/";
    const site = (env.SITE || SITE_DEFAULT).replace(/\/$/, "");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (path === "/" && req.method === "GET") return json({ name: "Rolvo", about: "Connect your AI to Rolvo. Read-only for now.", connect: site + "/#/connect" });
    const key = keyFrom(req, url);
    try {
      if (path === "/mcp" || path.startsWith("/mcp/")){
        if (req.method !== "POST") return json({ error: "method_not_allowed", message: "POST JSON-RPC to this address." }, 405, { allow: "POST, OPTIONS" });
        if (!(await whoIs(key, env))) return json(NOKEY(site), 401, { "www-authenticate": 'Bearer realm="rolvo"' });
        let body; try { body = await req.json(); } catch { return json(rpcErr(null, -32700, "Parse error"), 400); }
        const ctx = { env, site, record: (tool, args) => whoIs(key, env, tool, args) };
        const many = Array.isArray(body); const outs = [];
        for (const m of many ? body : [body]){ const o = await rpc(m, ctx); if (o) outs.push(o); }
        if (!outs.length) return new Response(null, { status: 202, headers: CORS });
        return json(many ? outs : outs[0]);
      }
      if (path.startsWith("/v1/")){
        if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET, OPTIONS" });
        const q = Object.fromEntries(url.searchParams); delete q.key;
        const m = path.match(/^\/v1\/creators\/([^/]+)$/);
        const [name, args] = path === "/v1/creators" ? ["search_creators", q] : m ? ["get_creator", { handle: decodeURIComponent(m[1]) }] : path === "/v1/categories" ? ["list_categories", {}] : [];
        if (!name) return json({ error: "not_found" }, 404);
        if (!(await whoIs(key, env, name, args))) return json(NOKEY(site), 401, { "www-authenticate": 'Bearer realm="rolvo"' });
        try { return json(TOOLS.find(t => t.name === name).run(await loadData(env), args)); }
        catch (e) { if (e instanceof ToolError) return json({ error: "bad_request", message: e.message }, /^No creator/.test(e.message) ? 404 : 400); throw e; }
      }
      return json({ error: "not_found" }, 404);
    } catch (e) { return json({ error: "server_error", message: "Rolvo could not answer just now. Try again in a minute." }, 502); }
  },
};
