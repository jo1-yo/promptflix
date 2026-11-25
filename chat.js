/* Rolvo Market — real chats (Supabase: market_chats + market_messages, see server/market.sql → Part 3).
   Live and signed in, a project's conversation lives in the database: both sides read the same rows, and Realtime pushes a new
   message to the other side without a reload. Every such chat also gets a local order record marked `cloud: true` so the rest
   of the site (lists, badges, routes) keeps working; its messages are never written to localStorage.
   Demo mode, or a database that hasn't had Part 3 run, keeps the old behaviour: the conversation stays in this browser, and
   the thread says so. Nothing here ever shows a message as delivered unless the database took it. */
const chatSchemaMissing = e => !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "PGRST205" || e.code === "42P01");
const Chat = {
  uid: null,          // the signed-in account this is running for (auth uuid)
  state: "off",       // off (demo / signed out) | starting | on | missing (Part 3 not installed) | expired (no database session) | error
  rows: [],           // market_chats_mine: one row per chat, with the other side's card and my unread count
  msgs: {},           // chat id → messages, oldest first
  busy: {}, stale: {}, view: null, channel: null, rt: "off", pollT: null, syncT: null, boot: null,
  key: null, claimed: null,   // creator side: the profile an admin confirmed for this account, and the one it says it is

  side(){ return APP === "merchant" ? "client" : APP === "creator" ? "creator" : null; },
  on(){ return this.state === "on"; },
  row(id){ return this.rows.find(r => r.id === id); },
  unread(id){ const r = this.row(id); return r ? r.unread || 0 : 0; },
  last(o){ const r = this.row(o.id); return (r && r.last_text) || o.brief || ""; },

  /* Follows the signed-in account: starts when one appears, stops when it leaves. Safe to call any number of times. */
  ensure(){
    const u = this.side() && LIVE.auth ? DB.me() : null, id = (u && u.cloudId) || null;
    if (id === this.uid) return this.boot;
    this.stop(); this.uid = id; if (!id) return null;
    return this.boot = this.start(id).catch(e => { if (this.uid === id){ this.state = "error"; console.warn("Rolvo: chats didn't start.", e.message); this.redraw(); } });
  },
  async start(id){
    const sb = Auth.client(); if (!sb) return; this.state = "starting";
    const { data } = await sb.auth.getSession(); if (this.uid !== id) return;
    if (!data.session || data.session.user.id !== id){ this.state = "expired"; return this.redraw(); }
    if (this.side() === "creator"){   // the database needs this account's profile id before it can hand over waiting chats
      await Cloud.push(); const error = await this.link(); if (this.uid !== id) return;
      if (chatSchemaMissing(error)){ this.state = "missing"; return this.redraw(); }
    }
    await this.sync(); if (this.uid !== id || !this.on()) return;
    this.listen();
  },
  stop(){
    if (this.channel){ try { Auth.client().removeChannel(this.channel); } catch {} }
    clearInterval(this.pollT); clearTimeout(this.syncT);
    Object.assign(this, { uid: null, state: "off", rows: [], msgs: {}, busy: {}, stale: {}, view: null, channel: null, rt: "off", boot: null, key: null, claimed: null });
  },

  /* Creator side: ask the database which profile this account is confirmed for; that also hands over any chats waiting for it. */
  async link(){ const { data, error } = await Auth.client().rpc("market_chat_link"); if (data){ this.key = data.key; this.claimed = data.claimed; } return error; },
  async sync(){
    const sb = Auth.client(), id = this.uid; if (!sb || !id) return;
    if (this.on() && this.side() === "creator" && !this.key){ await this.link(); if (this.uid !== id) return; }   // still waiting for an admin to confirm the profile
    const { data, error } = await sb.rpc("market_chats_mine", { p_side: this.side() }); if (this.uid !== id) return;
    if (error){
      if (chatSchemaMissing(error)) this.state = "missing"; else if (!this.on()) this.state = "error";
      if (!this.on()) console.warn("Rolvo: chats not loaded.", error.message);
      return this.redraw();
    }
    this.rows = data || []; this.state = "on"; this.shells(); this.redraw();
    const v = this.view; if (v && v.stream.isConnected){ const r = this.row(v.id), l = this.msgs[v.id], newest = l && l.length ? l[l.length - 1].created_at : "";
      if (r && l && r.last_at > newest) this.load(v.id, true); }   // the list knows of a message the open thread hasn't got (Realtime missed it)
  },
  syncSoon(){ clearTimeout(this.syncT); this.syncT = setTimeout(() => this.sync(), 300); },

  /* One local order record per chat, so lists, routes and badges treat it like any other project. */
  shells(){
    const u = DB.me(), side = this.side(), S = DB.state; if (!u) return; const seen = new Set(); const before = JSON.stringify(S.orders.filter(o => o.cloud).map(o => [o.id, o.clientId, o.creatorId, o.title, o.joined]));
    for (const r of this.rows){
      seen.add(r.id); const m = r.meta || {};
      const clientId = side === "client" ? u.id : this.clientStub(r), creatorId = side === "creator" ? u.id : this.creatorStub(r);
      let o = DB.order(r.id);
      if (!o){ const price = Number(m.price) || 0;
        o = { id: r.id, cloud: true, clientId, creatorId, title: r.title, brief: r.brief || "", cat: m.cat || null, opt: m.opt || null, style: m.style || null, price,
          terms: { price, depositPct: 30, revisions: 3, durationDays: 7, trialDays: 3, proposedBy: clientId, accepted: {} },
          status: "negotiating", revisionsUsed: 0, deliveries: [], escrow: { deposit: "none", balance: "none" }, createdAt: r.created_at, updatedAt: r.last_at, deadline: null, contractAt: null, review: {} };
        S.orders.push(o); }
      if (side === "client") o.clientId = u.id; else o.creatorId = u.id;
      Object.assign(o, { title: r.title, brief: r.brief || "", joined: !!r.creator_joined, updatedAt: r.last_at });
    }
    const mine = o => side === "client" ? o.clientId === u.id : o.creatorId === u.id;
    S.orders = S.orders.filter(o => !o.cloud || seen.has(o.id) || !mine(o));   // a chat that is gone from the database leaves this device too
    if (before !== JSON.stringify(S.orders.filter(o => o.cloud).map(o => [o.id, o.clientId, o.creatorId, o.title, o.joined]))) DB.save();
  },
  clientStub(r){ const c = r.client || {}, id = "cu_" + c.id; let u = DB.state.users.find(x => x.id === id);
    if (!u){ u = { id, role: "client", remote: true, createdAt: r.created_at }; DB.state.users.push(u); }
    Object.assign(u, { name: c.name || "", org: c.org || "", avatar: c.avatar || null, verified: !!c.verified, onboarded: true, profile: { website: c.website || "" } }); return id; },
  creatorStub(r){ let c = DB.creator(r.creator_key);
    if (!c){ c = { id: r.creator_key, remote: true, live: false, name: (r.creator && r.creator.name) || "Creator", handle: "", where: "", bg: "", tools: [], cats: [], styles: [], fit: [], ask: null, closes: [], quotes: [], days: 7, rating: 0, done: 0, works: [] }; DB.state.creators.push(c); }
    return c.id; },

  /* The client starts a project. Returns the local order for the new chat, or null when chats aren't in the database
     (demo, or Part 3 not installed) and the caller should keep it local. Throws when it should have worked and didn't. */
  async open(c, f){
    if (this.boot) await this.boot;
    if (this.state === "off" || this.state === "missing") return null;
    if (this.state === "expired") throw new Error("Sign out and in again to message creators.");
    if (!this.on()) throw new Error("Couldn't reach Rolvo. Try again in a moment.");
    const { data, error } = await Auth.client().rpc("market_chat_open", { p_creator_key: c.id, p_creator_name: c.name || "", p_title: f.title, p_brief: f.brief || "", p_meta: { cat: f.cat || null, opt: f.opt || null, style: f.style || null, price: f.price || null } });
    if (error) throw new Error(error.message);
    await this.sync(); return DB.order(data.id) || null;
  },

  async load(id, again){
    if (this.busy[id]) { this.stale[id] = true; return; } if (this.msgs[id] && !again) return;
    this.busy[id] = true; this.stale[id] = false;
    const { data, error } = await Auth.client().from("market_messages").select("id, seq, chat_id, side, kind, body, data, created_at").eq("chat_id", id).order("seq", { ascending: false }).limit(500);
    this.busy[id] = false;
    if (!error){ const unsent = (this.msgs[id] || []).filter(m => m.pending || m.failed); this.msgs[id] = data.reverse().concat(unsent); }
    else if (!this.msgs[id]) this.msgs[id] = [];
    if (this.stale[id]) return this.load(id, true);   // something arrived while this was loading
    this.paint(true); this.seen(id);
  },
  async send(id, text){
    const tmp = { id: "tmp_" + Math.random().toString(36).slice(2, 10), chat_id: id, side: this.side(), kind: "text", body: text, created_at: new Date().toISOString(), pending: true };
    (this.msgs[id] ||= []).push(tmp); this.paint(true);
    return this.deliver(id, tmp);
  },
  async deliver(id, tmp){
    tmp.pending = true; tmp.failed = null; this.paint();
    let res; try { res = await Auth.client().rpc("market_chat_send", { p_chat: id, p_side: this.side(), p_body: tmp.body }); } catch (e) { res = { error: e }; }
    const list = this.msgs[id] || [], i = list.indexOf(tmp);
    if (res.error){ tmp.pending = false; tmp.failed = /not signed in|JWT/i.test(res.error.message || "") ? "Sign in again to send" : "Not sent"; }
    else if (i >= 0){ if (list.some(m => m.id === res.data.id)) list.splice(i, 1); else list[i] = res.data; this.touch(res.data); }
    this.paint(); this.relist();
  },
  touch(m){ const r = this.row(m.chat_id); if (!r || m.side === "system") return; Object.assign(r, { last_text: m.body.slice(0, 200), last_side: m.side, last_at: m.created_at }); const o = DB.order(r.id); if (o) o.updatedAt = m.created_at; },
  watching(id){ const v = this.view; return !!(v && v.id === id && v.stream.isConnected && !document.hidden); },
  seen(id){ const r = this.row(id); if (!r || !this.watching(id)) return; const had = r.unread; r.unread = 0;
    if (had){ Auth.client().rpc("market_chat_read", { p_chat: id, p_side: this.side() }).then(() => {}, () => {}); this.relist(); header(); } },

  /* Realtime. Row-level security decides which rows reach this browser. A slow poll backs it up, so a dropped socket or a
     table missing from the publication delays a message instead of losing it. */
  listen(){
    const sb = Auth.client();
    this.channel = sb.channel("rolvo-chat-" + APP + "-" + this.uid.slice(0, 8))
      .on("postgres_changes", { event: "*", schema: "public", table: "market_messages" }, p => this.onMessage(p.new, p.eventType))
      .on("postgres_changes", { event: "*", schema: "public", table: "market_chats" }, p => this.onChat(p.new))
      .subscribe(st => { const was = this.rt; this.rt = st; if (st === "SUBSCRIBED" && was !== "off") this.syncSoon(); });
    let n = 0; this.pollT = setInterval(() => { n++; if (document.hidden) return; if (this.rt !== "SUBSCRIBED" || n % 3 === 0 || (this.view && this.watching(this.view.id))) this.sync(); }, 20000);
  },
  onMessage(m, ev){
    if (!m || !m.chat_id) return; const r = this.row(m.chat_id); if (!r) return this.syncSoon();
    const list = this.msgs[m.chat_id];
    const known = list ? list.findIndex(x => x.id === m.id) : -1;
    if (known >= 0){ list[known] = m; this.paint(); return this.relist(); }   // an order form changed state
    if (ev === "UPDATE") return;
    if (this.busy[m.chat_id]) this.stale[m.chat_id] = true;
    else if (list){
      const i = m.side === this.side() ? list.findIndex(x => x.pending && x.body === m.body) : -1;   // my own message echoed back before the send call returned
      if (i >= 0) list[i] = m; else { const at = list.findIndex(x => x.pending || x.failed); at < 0 ? list.push(m) : list.splice(at, 0, m); }
    }
    this.touch(m);
    if (m.side !== this.side()){ if (this.watching(m.chat_id)) Auth.client().rpc("market_chat_read", { p_chat: m.chat_id, p_side: this.side() }).then(() => {}, () => {}); else r.unread = (r.unread || 0) + 1; }
    this.paint(m.side === this.side()); this.relist(); header();
  },
  onChat(c){
    if (!c || !c.id) return this.syncSoon(); const r = this.row(c.id);
    if (!r || r.creator_joined !== !!c.creator_id) return this.syncSoon();   // a new chat, or the creator just joined: fetch their card
    Object.assign(r, { client_read_at: c.client_read_at, creator_read_at: c.creator_read_at }); this.paint();
  },

  /* ---------- drawing ---------- */
  redraw(){
    const v = route().parts[0]; if (v !== "chats" && v !== "chat") return header();   // elsewhere only the badge can have changed
    const i = $(".composer input"), text = i ? i.value : "", focus = !!i && document.activeElement === i;
    render(); const j = $(".composer input"); if (j && text) j.value = text; if (j && focus) j.focus();
  },
  relist(){ const el = $(".tlist"); if (!el || !this.relistWith) return; const top = el.scrollTop; const n = this.relistWith(); el.replaceWith(n); n.scrollTop = top; },
  paint(stick){ const v = this.view; if (!v || !v.stream.isConnected) return; const s = v.stream, near = s.scrollHeight - s.scrollTop - s.clientHeight < 80;
    s.replaceChildren(...this.bubbles(v.o, v.u)); v.pin.replaceChildren(...this.pinned(v.o)); if (stick || near) s.scrollTop = s.scrollHeight; },
  bubbles(o, u){
    const list = this.msgs[o.id]; if (!list) return [h("div", { class: "msg sys" }, h("div", { class: "bub" }, "Loading messages…"))];
    const side = this.side(), r = this.row(o.id) || {}, theirRead = side === "client" ? r.creator_read_at : r.client_read_at;
    const lastMine = list.filter(m => m.side === side).pop();
    const other = first(otherOf(o, u.id).name);
    return list.map(m => {
      if (m.kind === "offer" && m.data){ const d = m.data, mine = m.side === side, open = d.status === "pending";
        const act = (label, ans, cls) => h("button", { class: "btn small " + (cls || ""), onclick: e => { e.currentTarget.disabled = true; this.answer(m, ans); } }, label);
        const change = h("button", { class: "btn small", onclick: () => this.form(o, d) }, "Change");
        return offerCard(d, { status: d.status, mine, who: DB.nameOf(m.side === "client" ? o.clientId : o.creatorId), at: m.created_at, other,
          btns: !open ? [] : mine ? [change, act("Withdraw", "withdraw", "quiet")] : [act("Accept", "accept", "primary"), change, act("Decline", "decline", "quiet")] }); }
      if (m.side === "system") return h("div", { class: "msg sys" }, h("div", { class: "bub" }, m.body));
      const mine = m.side === side, who = DB.nameOf(m.side === "client" ? o.clientId : o.creatorId);
      const st = !mine ? null : m.failed ? h("button", { class: "st link", type: "button", onclick: () => this.deliver(o.id, m) }, m.failed + " · Retry")
        : m.pending ? h("span", { class: "st" }, "Sending…")
        : m !== lastMine ? null : h("span", { class: "st" }, !o.joined && side === "client" ? "Saved · not delivered yet" : theirRead && theirRead >= m.created_at ? "Seen" : "Sent");
      return h("div", { class: "msg" + (mine ? " me" : "") + (m.failed ? " failed" : "") }, h("span", { class: "who" }, who + " · " + ago(m.created_at)), h("div", { class: "bub" }, m.body), st);
    });
  },
  thread(o, u){
    const other = otherOf(o, u.id), side = this.side();
    const stream = h("div", { class: "stream" }), pin = h("div", { class: "pinned" }, ...this.pinned(o));
    const input = h("input", { class: "i", placeholder: "Message " + first(other.name), autocomplete: "off", maxlength: "4000", "aria-label": "Message" });
    const tools = plusTray([["form", "Order form", () => this.form(o)], ["info", "Details", () => this.details(o)]]);
    const form = h("form", { class: "composer", onsubmit: e => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ""; this.send(o.id, t); input.focus(); } },
      tools.btn, input, h("button", { class: "btn primary", type: "submit" }, "Send"));
    const sub = side === "creator" ? [other.verified ? "Verified company" : null, other.profile && other.profile.website].filter(Boolean).join(" · ") : other.where ? other.where + (other.tz ? " · " + other.tz : "") : "";
    const t = h("section", { class: "thread" },
      h("div", { class: "thead" }, h("a", { class: "btn quiet small back", href: "#/chats" }, "← Back"), avatar(other), h("div", { class: "who" }, h("b", null, other.name + (other.org ? " · " + other.org : "")), sub ? h("span", null, sub) : null),
        h("div", { style: { marginLeft: "auto" }, class: "row" }, h("button", { class: "btn small", onclick: () => this.details(o) }, "Details"))),
      pin, stream, form, tools.tray);
    this.view = { id: o.id, o, u, stream, pin }; stream.replaceChildren(...this.bubbles(o, u));
    setTimeout(() => { stream.scrollTop = stream.scrollHeight; this.msgs[o.id] ? this.seen(o.id) : this.load(o.id); }, 0);
    return t;
  },
  /* The strip on top of a chat: the order as it stands. The newest open or accepted order form wins over the opening offer. */
  pinned(o){
    const side = this.side(), f = (this.msgs[o.id] || []).filter(m => m.kind === "offer" && m.data && ["pending", "accepted"].includes(m.data.status)).pop(), d = f && f.data;
    const price = d ? d.price : o.price;
    const fact = !d ? (o.price ? (side === "client" ? "Your opening offer" : "Client's opening offer") : "No price yet")
      : d.status === "accepted" ? "Agreed · pay with " + payMethodName(d.method) : f.side === side ? "Order form sent" : "Order form needs your answer";
    return [h("div", { class: "ptop" }, h("div", { class: "ptitle" }, d ? d.title : o.title), price ? h("div", { class: "pprice" }, money(price)) : null),
      h("div", { class: "pfacts" }, h("span", { class: d && d.status === "accepted" ? "ok" : null }, fact), h("span", null, "Opened " + when(o.createdAt)))];
  },
  /* Order forms: a message whose state (pending, accepted, declined…) is kept by the database, so both sides always agree on it. */
  form(o, cur){
    const last = cur || ((this.msgs[o.id] || []).filter(m => m.kind === "offer").pop() || {}).data || {};
    orderFormSheet({ title: last.title || o.title, kind: last.kind || (o.cat && TAXONOMY[o.cat] ? TAXONOMY[o.cat].name : ""), price: last.price || o.price, method: last.method }, "with " + otherOf(o, DB.me().id).name, async f => {
      const { data, error } = await Auth.client().rpc("market_offer_send", { p_chat: o.id, p_side: this.side(), p_title: f.title, p_kind: f.kind, p_price: f.price, p_method: f.method });
      if (error) throw new Error(chatSchemaMissing(error) ? "Order forms aren't switched on in the database yet." : error.message);
      this.onMessage(data); this.load(o.id, true); });   // reload: the form it replaced changed state too
  },
  async answer(m, ans){
    const { data, error } = await Auth.client().rpc("market_offer_answer", { p_msg: m.id, p_side: this.side(), p_answer: ans });
    if (error){ toast(error.message); return this.load(m.chat_id, true); }
    this.onMessage(data);
  },
  details(o){
    openSheet([phead(o.title, DB.nameOf(o.clientId) + "  ↔  " + DB.nameOf(o.creatorId) + "  ·  opened " + when(o.createdAt)),
      h("div", { class: "details" }, o.brief ? h("div", { class: "brief" }, h("span", { class: "eyebrow" }, "Brief"), h("p", null, o.brief),
        (o.cat || o.style) ? h("div", { class: "chips" }, o.cat && TAXONOMY[o.cat] ? h("span", { class: "chip on" }, TAXONOMY[o.cat].name) : null, o.style && STYLES[o.style] ? styleChip(o.style) : null) : null) : null,
        o.price ? h("p", { class: "small muted" }, "Opening offer " + money(o.price) + ". Nothing is paid until you both agree.") : null)]);
  },
  /* A line above the project list when chats can't be shown as they should. */
  note(){
    const again = () => { DB.signOut(); render(); openSignIn(() => render()); };
    if (this.state === "expired") return h("p", { class: "tnote" }, "Your session ended. ", h("button", { class: "link", type: "button", onclick: again }, "Sign in again"), " to load your messages.");
    if (this.state === "error") return h("p", { class: "tnote" }, "Can't reach Rolvo right now. ", h("button", { class: "link", type: "button", onclick: () => { this.uid = null; this.ensure(); } }, "Retry"));
    if (this.on() && this.side() === "creator" && !this.key && /^r_/.test(this.claimed || "")) return h("p", { class: "tnote" }, "Rolvo is confirming this profile is yours. Client messages arrive here after that.");
    return null;
  },
};
document.addEventListener("pfm:change", () => Chat.ensure());
document.addEventListener("DOMContentLoaded", () => Chat.ensure());
document.addEventListener("visibilitychange", () => { if (!document.hidden && Chat.on()){ Chat.sync(); if (Chat.view) Chat.seen(Chat.view.id); } });
addEventListener("online", () => { if (Chat.on()) Chat.sync(); else if (Chat.uid){ Chat.uid = null; Chat.ensure(); } });
