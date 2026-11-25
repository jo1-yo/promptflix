/* Rolvo Market — data layer.
   Persists to localStorage (records) + IndexedDB (uploaded preview files) so the whole flow runs locally with no backend.
   Every method here maps 1:1 onto a table/RPC in the eventual Supabase schema; keep the shapes stable. */

const KEY = "pfm.v3";   // v3: real crawled creators replace the fictional roster
/* Money rules. Change the numbers here only; terms/ and the README quote them, and the payments function mirrors them. */
const FEES = {
  commission: 0.01,        // Rolvo's take on each release to the creator
  card: [0.029, 0.30],     // the processor's card fee, added on top of what the client pays so the order price arrives whole
  instant: 0.01,           // creator's fee for an instant payout to a debit card; standard withdrawals are free
  minPayout: 5,
};
const COMMISSION = FEES.commission;
const cents = n => Math.round(n * 100) / 100;
const cardFee = amt => cents((amt + FEES.card[1]) / (1 - FEES.card[0]) - amt);   // grossed up: after the processor takes its cut, exactly `amt` is left
const BREAK_LIMIT = 10;           // contract breaks allowed per rolling 30 days, per account
const BREAK_WINDOW = 30 * 864e5;

const now = () => new Date().toISOString();
const rid = p => p + "_" + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));

function fresh(){
  return {
    sessions: { merchant:null, creator:null, admin:null },
    users: clone(USERS),
    creators: clone(CREATORS).map(c => ({...c, quotes:[]})),
    discovered: clone(DISCOVERED),
    orders: [], messages: [], ledger: [], reviews: [], payments: [], logins: [],
    breaks: {},            // userId -> [iso timestamps]
  };
}

const DB = {
  state: null,
  load(){ try { this.state = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { this.state = fresh(); } if (!this.state.users) this.state = fresh();
    this.state.users.forEach(u => { if (u.name === "Promptflix team") u.name = "Rolvo team"; });   // browsers seeded before the rename
    for (const seed of CREATORS){ const c = this.state.creators.find(x => x.id === seed.id); if (c) for (const k of ["tz", "region", "email", "live"]) if (c[k] == null) c[k] = seed[k];
      if (c && c.real && !c.claimed){ c.works = clone(seed.works); c.cover = seed.cover || null; }   // unclaimed profiles follow the generated list; a claimed creator's own picks are kept
      if (!c){ this.state.creators.push({ ...clone(seed), quotes: [] }); this.state.discovered = (this.state.discovered || []).filter(d => d.url !== seed.social); } }   // creators added to the list after this browser first saved (e.g. the ones with no film yet) // migrate fields added after a record was saved
    if (!this.state.sessions) this.state.sessions = { merchant: null, creator: null, admin: null };
    for (const k of ["payments", "logins"]) this.state[k] ||= [];
    return this.state; },
  save(){ localStorage.setItem(KEY, JSON.stringify(this.state)); document.dispatchEvent(new CustomEvent("pfm:change")); },
  reset(){ localStorage.removeItem(KEY); this.state = fresh(); this.save(); },

  /* identity: one session per app (merchant / creator / admin) so one browser can hold both sides of a deal */
  me(){ const id = this.state.sessions[APP]; return id ? this.user(id) : null; },
  user(id){ return this.state.users.find(u => u.id === id) || this.creator(id); },
  /* identity = { email?, phone?, provider: "google"|"email"|"phone", name?, avatar? } — already verified by Auth (OTP / OAuth) */
  /* One login (email or phone) can hold a client account and a creator account. `side` picks which one: "merchant", "creator" or "admin". */
  findByIdentity(id, side){
    const pool = side === "creator" ? this.state.creators : side === "admin" ? this.state.users.filter(u => u.role === "admin")
      : side === "merchant" ? this.state.users.filter(u => u.role !== "admin") : [...this.state.users, ...this.state.creators];
    return pool.find(x => (id.email && x.email === id.email) || (id.phone && x.phone === id.phone));
  },
  signIn(identity){
    const id = typeof identity === "string" ? { email: identity, provider: "email" } : { ...identity };
    if (id.email) id.email = id.email.trim().toLowerCase();
    let u = this.findByIdentity(id, APP);
    if (APP === "admin"){ if (!u) return null; }     // only the admin console is limited to a list; the public sites take any email or phone
    if (!u){   // first time on this side: the same login gets its own account here, whatever it has on the other side
      const base = { email: id.email || null, phone: id.phone || null, name: id.name || "", avatar: id.avatar || null, createdAt: now() };
      if (APP === "merchant") { u = { id: rid("u"), role: "client", org: "", onboarded: false, ...base }; this.state.users.push(u); }
      else { u = { id: rid("c"), live: false, handle: "", where: "", bg: "", tools: [], cats: [], styles: [], fit: [], ask: null, closes: [], quotes: [], days: 7, rating: 0, done: 0, works: [], ...base }; this.state.creators.push(u); }
    }
    if (id.email && !u.email) u.email = id.email; if (id.phone && !u.phone) u.phone = id.phone;
    if (id.avatar && !u.avatar) u.avatar = id.avatar; if (id.name && !u.name) u.name = id.name;
    u.providers = [...new Set([...(u.providers || []), id.provider || "email"])]; u.lastLoginAt = now();
    (this.state.logins ||= []).push({ at: now(), uid: u.id, app: APP, provider: id.provider || "email", mode: id.mode || "demo" });
    this.state.sessions[APP] = u.id; this.save(); return u;
  },
  signOut(){ this.state.sessions[APP] = null; this.save(); if (typeof Cloud !== "undefined") Cloud.signOut(); },
  /* featured creators (CONFIG.featured, by handle) lead every list; the rest keep their order */
  featuredRank(c){ const i = (CONFIG.featured || []).indexOf(c.handle); return i < 0 ? 1e9 : i; },
  roster(){ const rank = c => this.featuredRank(c); return this.state.creators.filter(c => c.live).map((c, i) => ({ c, i })).sort((a, b) => (rank(a.c) - rank(b.c)) || (a.i - b.i)).map(x => x.c); },
  filmed(){ return this.roster().filter(c => c.works.length); },   // for strips and galleries that need a film to show
  nameOf(id){ const u = this.user(id); return u ? (u.name || u.org || u.email || "Someone") : "Someone"; },
  creator(id){ return this.state.creators.find(c => c.id === id); },
  saveClientProfile(uid, profile, done){ const u = this.user(uid); u.profile = {...(u.profile||{}), ...profile}; if (done) u.onboarded = true; this.save(); },

  /* pricing: range from the creator's own ask, every quote an order opened with, and every closed price */
  priceRange(c){
    const pts = [c.ask, ...(c.closes||[]), ...(c.quotes||[])].filter(Number.isFinite);
    if (!pts.length && c.est) return { lo: c.est[0], hi: c.est[1], ask: null, n: 0, est: true }; // unclaimed: category estimate, not their quote
    if (!pts.length) return { lo: 0, hi: 0, ask: null, n: 0, est: true };
    return { lo: Math.min(...pts), hi: Math.max(...pts), ask: c.ask, n: (c.closes||[]).length };
  },
  /* claiming: a crawled profile becomes a real account once its owner proves the social handle (demo skips the DM code) */
  unclaimed(){ return this.state.creators.filter(c => c.real && !c.claimed); },
  claim(id, identity){ const c = this.creator(id); if (!c || c.claimed) return null;
    const dupe = this.findByIdentity(identity, "creator"); if (dupe && dupe.id !== id && (dupe.works || []).length) return null; // that login already owns a real account
    if (dupe && !(dupe.works || []).length) this.state.creators = this.state.creators.filter(x => x !== dupe);    // drop an empty application started with the same login
    c.claimed = true; c.email = identity.email || null; c.phone = identity.phone || null; c.providers = [identity.provider || "email"]; c.claimedAt = now(); c.lastLoginAt = now();
    (this.state.logins ||= []).push({ at: now(), uid: c.id, app: APP, provider: identity.provider || "email", mode: identity.mode || "demo", claim: true });
    for (const o of this.state.orders.filter(o => o.creatorId === id && o.status === "negotiating")) this.sys(o.id, `${c.name} joined Rolvo and can reply now.`);
    this.state.sessions.creator = id; this.save(); return c; },

  /* matching */
  readBrief(text){
    const out = { cat:null, opt:null, styles:[] };
    for (const [re, hit] of LEXICON) if (re.test(text)){
      if (hit.cat && !out.cat){ out.cat = hit.cat; out.opt = hit.opt; }
      if (hit.style && !out.styles.includes(hit.style) && out.styles.length < 2) out.styles.push(hit.style);
    }
    return out;
  },
  match(q){ // q = {cat, opt, styles[], type, budget:[lo,hi], text}
    const words = (q.text||"").toLowerCase().split(/\s+/).filter(Boolean);
    const lift = c => this.featuredRank(c) < 1e9 ? 1 : 0;
    return this.roster().map(c => {
      let s = 0; const why = [];
      if (q.cat && c.cats.includes(q.cat)){ s += 40; why.push(TAXONOMY[q.cat].name); }
      const sm = (q.styles||[]).filter(st => c.styles.includes(st));
      if (sm.length){ s += Math.min(50, 30 * sm.length); why.push(...sm.map(st => STYLES[st].name)); }
      if (q.type && c.fit.includes(q.type)){ s += 15; why.push("works with " + CLIENT_TYPES.find(t => t.id === q.type).name.toLowerCase()); }
      const r = this.priceRange(c);
      if (q.budget && r.lo <= q.budget[1] && r.hi >= q.budget[0]){ s += 10; why.push("in budget"); }
      if (words.length){ const hay = [c.name, c.handle, c.bg, ...c.tools, ...c.styles.map(x => STYLES[x].name), ...c.cats.map(x => TAXONOMY[x].name), ...c.works.map(w => w[0])].join(" ").toLowerCase();
        const hits = words.filter(w => hay.includes(w)).length; s += hits * 12; }
      s += c.rating * 2;
      return { c, score: s, why: [...new Set(why)].slice(0, 4) };
    }).filter(m => !q.strict || m.score >= 12).sort((a, b) => (lift(b.c) - lift(a.c)) || (b.score - a.score));   // a featured creator needs a real match to show, then goes ahead of everyone else. 12 = one matching word
  },

  /* orders */
  order(id){ return this.state.orders.find(o => o.id === id); },
  ordersFor(uid){ return this.state.orders.filter(o => o.clientId === uid || o.creatorId === uid).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
  createOrder({clientId, creatorId, title, brief, cat, opt, style, price}){
    const c = this.creator(creatorId);
    const r = this.priceRange(c); price = price || c.ask || Math.round((r.lo + r.hi) / 2 / 100) * 100;
    const o = { id: rid("ord"), clientId, creatorId, title, brief, cat, opt, style, price,
      terms: { price, depositPct: 30, revisions: 3, durationDays: Math.max(1, c.days), trialDays: Math.max(c.days ? 2 : 1, Math.round(c.days * 0.4)), proposedBy: clientId, accepted: { [clientId]: true } },
      status: "negotiating", revisionsUsed: 0, deliveries: [], escrow: { deposit: "none", balance: "none" },
      createdAt: now(), updatedAt: now(), deadline: null, contractAt: null, review: {} };
    this.state.orders.push(o);
    this.sys(o.id, `${this.nameOf(clientId)} opened a project with ${c.name}. Agree on terms in chat to start the order.`);
    if (c.real && !c.claimed) this.sys(o.id, LIVE.auth ? `${c.name} isn't on Rolvo yet.`   // live, nothing is sent from a chat that only exists in this browser, so don't say it was
      : `${c.name} isn't on Rolvo yet. We've sent them your brief and an invite through ${c.source}; this chat goes live when they claim their profile.`);
    this.save(); return o;
  },
  touch(o){ o.updatedAt = now(); },
  sys(orderId, text){ this.state.messages.push({ id: rid("m"), orderId, from: "system", kind: "system", text, at: now() }); },
  messages(orderId){ return this.state.messages.filter(m => m.orderId === orderId); },
  send(orderId, from, text){ this.state.messages.push({ id: rid("m"), orderId, from, kind: "text", text, at: now() }); this.touch(this.order(orderId)); this.save(); },

  proposeTerms(orderId, by, terms){
    const o = this.order(orderId); if (o.status !== "negotiating") return;
    o.terms = { ...terms, proposedBy: by, accepted: { [by]: true } }; o.price = terms.price;
    this.state.messages.push({ id: rid("m"), orderId, from: by, kind: "terms", terms: clone(o.terms), at: now() });
    this.touch(o); this.save();
  },
  acceptTerms(orderId, by){
    const o = this.order(orderId); if (o.status !== "negotiating") return;
    o.terms.accepted[by] = true;
    if (o.terms.accepted[o.clientId] && o.terms.accepted[o.creatorId]){
      o.status = "agreed"; o.contractAt = now();
      o.deadline = new Date(Date.now() + o.terms.durationDays * 864e5).toISOString();
      const c = this.creator(o.creatorId); c.quotes.push(o.terms.price); // every opened order enters the creator's asking record, win or lose
      this.sys(orderId, `Contract generated. ${this.nameOf(o.clientId)} pays the ${o.terms.depositPct}% deposit to open the order.`);
    }
    this.touch(o); this.save();
  },

  deposit(o){ return Math.round(o.terms.price * o.terms.depositPct / 100); },
  balance(o){ return o.terms.price - this.deposit(o); },
  ledger(entry){ this.state.ledger.push({ id: rid("tx"), at: now(), ...entry }); },

  /* pm = { method: "card"|"paypal", ref, mode: "demo"|"live" } from Pay — the processor already confirmed it */
  payment(o, kind, amount, pm){ (this.state.payments ||= []).push({ id: rid("pay"), at: now(), orderId: o.id, uid: o.clientId, kind, amount, fee: pm.fee || 0, method: pm.method, ref: pm.ref, mode: pm.mode || "demo", status: "succeeded" }); },
  payDeposit(orderId, pm = { method: "card", ref: "demo", mode: "demo" }){
    const o = this.order(orderId); if (o.status !== "agreed") return;
    o.status = "in_production"; o.escrow.deposit = "held";
    this.payment(o, "deposit", this.deposit(o), pm);
    this.ledger({ orderId, type: "deposit_in", amount: this.deposit(o), from: o.clientId, to: "escrow", method: pm.method });
    this.sys(orderId, `Deposit $${this.deposit(o)} received and held by Rolvo. ${this.nameOf(o.creatorId)} can start. First cut due in ${o.terms.trialDays} days.`);
    this.touch(o); this.save();
  },
  deliver(orderId, { fileId, url, note }){
    const o = this.order(orderId);
    const kind = o.status === "in_production" ? "trial" : o.status === "revising" ? "revision" : null; if (!kind) return;
    const d = { id: rid("dl"), v: o.deliveries.length + 1, kind, fileId: fileId || null, url: url || null, note: note || "", at: now(), status: "pending", feedback: "" };
    o.deliveries.push(d);
    o.status = kind === "trial" ? "trial_review" : "revising";
    this.sys(orderId, kind === "trial" ? `First cut v1 is up for pre-review. Watermarked preview only.` : `Revision v${d.v} is up. ${o.terms.revisions - o.revisionsUsed} revision${o.terms.revisions - o.revisionsUsed === 1 ? "" : "s"} left after this.`);
    this.touch(o); this.save(); return d;
  },
  latest(o){ return o.deliveries[o.deliveries.length - 1]; },
  decide(orderId, decision, feedback){
    const o = this.order(orderId); const d = this.latest(o); if (!d || !["pending", "passed"].includes(d.status)) return;
    d.feedback = feedback || "";
    if (o.status === "trial_review"){
      if (decision === "approve"){ // pre-review passed: platform releases the deposit to the creator, revision phase opens
        d.status = "passed"; o.status = "revising"; o.escrow.deposit = "released";
        this.release(o, this.deposit(o), "deposit_release");
        this.sys(orderId, `Pre-review passed. Deposit released to ${this.nameOf(o.creatorId)} (minus ${COMMISSION * 100}% platform fee). Revision phase open: ${o.terms.revisions} revisions.`);
      } else { // pre-review failed: refund, order ends, counts as the creator's break (incomplete delivery)
        d.status = "rejected"; o.status = "cancelled"; o.escrow.deposit = "refunded"; o.endedBy = o.clientId; o.endReason = "Pre-review failed: " + (feedback || "no reason given");
        this.ledger({ orderId, type: "deposit_refund", amount: this.deposit(o), from: "escrow", to: o.clientId });
        this.addBreak(o.creatorId);
        this.sys(orderId, `Pre-review failed. Deposit $${this.deposit(o)} refunded to ${this.nameOf(o.clientId)}. Order closed.`);
      }
    } else if (o.status === "revising"){
      if (decision === "approve"){ d.status = "approved"; o.status = "final_due"; this.sys(orderId, `Final cut approved. Pay the remaining $${this.balance(o)} to receive the clean master.`); }
      else if (decision === "revise"){
        if (o.revisionsUsed >= o.terms.revisions) return;
        d.status = "revise"; o.revisionsUsed += 1;
        this.sys(orderId, `Revision ${o.revisionsUsed} of ${o.terms.revisions} requested: “${feedback}”`);
      }
    }
    this.touch(o); this.save();
  },
  payBalance(orderId, pm = { method: "card", ref: "demo", mode: "demo" }){
    const o = this.order(orderId); if (o.status !== "final_due") return;
    const amt = this.balance(o);
    this.payment(o, "balance", amt, pm);
    this.ledger({ orderId, type: "balance_in", amount: amt, from: o.clientId, to: "escrow", method: pm.method });
    this.release(o, amt, "balance_release");
    o.escrow.balance = "released"; o.status = "completed"; o.completedAt = now();
    const c = this.creator(o.creatorId); c.closes.push(o.terms.price); c.done += 1;
    this.sys(orderId, `Balance $${amt} paid. Clean master unlocked for ${this.nameOf(o.clientId)}. Both sides can now leave a review.`);
    this.touch(o); this.save();
  },
  release(o, amt, type){
    const fee = cents(amt * COMMISSION);
    this.ledger({ orderId: o.id, type, amount: cents(amt - fee), from: "escrow", to: o.creatorId });
    this.ledger({ orderId: o.id, type: "commission", amount: fee, from: "escrow", to: "promptflix" });
    if (typeof Payouts !== "undefined") Payouts.onRelease(o, amt, type);   // live: moves the money to the creator's Stripe balance
  },

  /* wallet: what a creator has earned, what's still held for them, what they've taken out */
  wallet(uid){
    const L = this.state.ledger, sum = a => cents(a.reduce((n, t) => n + t.amount, 0));
    const earned = sum(L.filter(t => t.to === uid && t.type.endsWith("_release")));
    const withdrawn = sum(L.filter(t => t.from === uid && t.type === "payout"));
    const pending = this.state.orders.filter(o => o.creatorId === uid && o.escrow.deposit === "held").reduce((n, o) => n + this.deposit(o), 0);
    return { available: cents(earned - withdrawn), pending, earned, withdrawn };
  },
  walletRows(uid){ return this.state.ledger.filter(t => (t.to === uid && t.type.endsWith("_release")) || (t.from === uid && t.type === "payout")).slice().reverse(); },
  setPayoutMethod(uid, m){ const c = this.creator(uid); c.payout = m ? { ...m, at: now() } : null; this.save(); },
  withdraw(uid, amount, instant){
    const c = this.creator(uid), w = this.wallet(uid); amount = cents(amount);
    if (!c.payout) return "Add a payout method first.";
    if (!(amount >= FEES.minPayout)) return "The smallest withdrawal is $" + FEES.minPayout + ".";
    if (amount > w.available) return "That's more than your available balance.";
    if (instant && !c.payout.instant) return "Instant payouts need a debit card.";
    const fee = instant ? cents(amount * FEES.instant) : 0;
    this.ledger({ type: "payout", amount, fee, net: cents(amount - fee), from: uid, to: "bank", speed: instant ? "instant" : "standard", method: c.payout.label + " ···· " + c.payout.last4, status: "paid", mode: "demo" });
    this.save(); return null;
  },

  /* breaks */
  breaksUsed(uid){ const cut = Date.now() - BREAK_WINDOW; return (this.state.breaks[uid] || []).filter(t => new Date(t).getTime() > cut).length; },
  breaksLeft(uid){ return Math.max(0, BREAK_LIMIT - this.breaksUsed(uid)); },
  addBreak(uid){ (this.state.breaks[uid] ||= []).push(now()); },
  breakContract(orderId, by, reason){
    const o = this.order(orderId);
    if (["completed", "cancelled"].includes(o.status) || this.breaksLeft(by) === 0) return false;
    const held = o.escrow.deposit === "held";
    if (held){
      if (by === o.clientId){ o.escrow.deposit = "forfeited"; this.release(o, this.deposit(o), "deposit_release"); } // deposit is non-refundable when the client walks
      else { o.escrow.deposit = "refunded"; this.ledger({ orderId, type: "deposit_refund", amount: this.deposit(o), from: "escrow", to: o.clientId }); }
    }
    o.status = "cancelled"; o.endedBy = by; o.endReason = reason || ""; this.addBreak(by);
    this.sys(orderId, `${this.nameOf(by)} ended the contract${reason ? ": “" + reason + "”" : ""}. ${held ? (by === o.clientId ? "Deposit goes to the creator." : "Deposit refunded to the client.") : ""} ${this.breaksLeft(by)} break${this.breaksLeft(by) === 1 ? "" : "s"} left this month.`);
    this.touch(o); this.save(); return true;
  },

  /* reviews */
  review(orderId, by, stars, text){
    const o = this.order(orderId); if (o.status !== "completed" || o.review[by]) return;
    o.review[by] = { stars, text, at: now() };
    this.state.reviews.push({ id: rid("rv"), orderId, from: by, to: by === o.clientId ? o.creatorId : o.clientId, stars, text, at: now() });
    if (by === o.clientId){ const c = this.creator(o.creatorId); const n = c.done; c.rating = Math.round(((c.rating * (n - 1)) + stars) / n * 10) / 10; }
    this.touch(o); this.save();
  },
  reviewsFor(uid){ return this.state.reviews.filter(r => r.to === uid); },

  /* discovery */
  inviteCreator(id){ const c = this.creator(id); if (c && c.real && !c.claimed && !c.invitedAt){ c.invitedAt = now(); this.save(); return true; } return false; },
  setVerified(uid, on){ const u = this.user(uid); if (u){ u.verified = !!on; u.verifiedBy = on ? "admin" : null; u.verifiedAt = on ? now() : null; this.save(); } },
  ensureAdmin(email){ email = (email || "").toLowerCase(); if (!CONFIG.adminEmails.map(x => x.toLowerCase()).includes(email)) return false;
    if (!this.state.users.some(u => u.email === email && u.role === "admin")) { this.state.users.push({ id: rid("u"), role: "admin", name: "Rolvo team", email }); this.save(); } return true; },
  invite(id){ const d = this.state.discovered.find(x => x.id === id); if (d && d.status === "new"){ d.status = "invited"; d.invitedAt = now(); this.save(); } },
};

/* Files: uploaded preview/final clips live in IndexedDB so an order survives a reload. */
const Files = {
  open(){ return new Promise((res, rej) => { const r = indexedDB.open("pfm-files", 1); r.onupgradeneeded = () => r.result.createObjectStore("f"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async put(blob){ const db = await this.open(); const id = rid("f"); await new Promise((res, rej) => { const t = db.transaction("f", "readwrite"); t.objectStore("f").put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); return id; },
  async get(id){ const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction("f").objectStore("f").get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); },
  async clear(){ const db = await this.open(); await new Promise(res => { const t = db.transaction("f", "readwrite"); t.objectStore("f").clear(); t.oncomplete = res; }); },
};

const STATUS = {
  negotiating: ["Negotiating", "Agree on price, deposit, revisions and timing in chat."],
  agreed: ["Contract ready", "Deposit due to open the order."],
  in_production: ["In production", "Deposit held by Rolvo. First cut in progress."],
  trial_review: ["Pre-review", "Client reviews the first cut. Pass releases the deposit."],
  revising: ["Revisions", "Creator revises; client approves the final cut."],
  final_due: ["Balance due", "Final approved. Balance unlocks the clean master."],
  completed: ["Completed", "Delivered and paid. Reviews open."],
  cancelled: ["Closed", "Contract ended early."],
};
