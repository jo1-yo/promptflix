/* Rolvo Market — sign-in and sign-up in one flow: Google, phone or email.
   Phone and email use a 6-digit code. Live (CONFIG.supabaseUrl set): Supabase Auth sends the code and checks every sign-in.
   Google (CONFIG.googleClientId set): Google's own "Sign in with Google" button and account chooser hand back a signed ID token;
   with Supabase it's verified server-side (signInWithIdToken), without it the token is only checked in the browser (prototype).
   Demo: no code leaves the browser; it's shown on screen so the whole flow can be tested. Either way the result is an
   identity { email | phone, provider, mode } handed to DB.signIn (or to a custom onIdentity, e.g. claiming a profile). */
const COUNTRIES = [["+1", "US / CA"], ["+44", "UK"], ["+86", "China"], ["+852", "Hong Kong"], ["+81", "Japan"], ["+82", "Korea"], ["+65", "Singapore"], ["+91", "India"], ["+61", "Australia"], ["+49", "Germany"], ["+33", "France"], ["+31", "Netherlands"], ["+46", "Sweden"], ["+971", "UAE"], ["+234", "Nigeria"], ["+55", "Brazil"], ["+52", "Mexico"]];
const googleIcon = () => { const s = h("span", { class: "gicon", "aria-hidden": "true" }); s.innerHTML = '<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'; return s; };

const randomHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
const sha256hex = async t => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))), b => b.toString(16).padStart(2, "0")).join("");
const loadGsi = (src, ready) => new Promise((ok, fail) => {
  if (ready()) return ok();
  let s = document.querySelector(`script[src="${src}"]`);
  if (!s){ s = document.createElement("script"); s.src = src; s.async = true; document.head.append(s); }
  s.addEventListener("load", () => ready() ? ok() : fail(new Error("Couldn't reach Google")));
  s.addEventListener("error", () => fail(new Error("Couldn't reach Google")));
});

/* Cloud — the account record in Supabase (table market_profiles, see server/market.sql). The browser store stays the working
   copy for the prototype; this keeps the signed-in account's row current so sign-ups, sign-ins and onboarding answers are in the
   database. Orders and chats are not synced yet. Does nothing in demo mode.
   One login has one row and can be on both sides: the client side keeps org / onboarded / profile / local_id, the creator side
   keeps creator_onboarded / creator_profile / creator_local_id. A database that hasn't had the newer market.sql run has no
   creator_* columns (`legacy`): there a creator still uses the shared columns, and an account stays on one side. */
const CREATOR_FIELDS = ["handle", "where", "bg", "tools", "cats", "styles", "fit", "ask", "days", "tz", "region", "works", "source"];
const Cloud = {
  sent: {}, timer: null, legacy: false,
  /* market_enter adds this site's side to the account (never admin), logs the sign-in, returns the row. */
  async enter(identity){
    const { data, error } = await Auth.client().rpc("market_enter", { p_app: APP, p_via: identity.provider || "email" });
    if (!error) return data;
    if (error.code === "PGRST202" || error.code === "42883"){ console.warn("Rolvo: run server/market.sql in Supabase to store accounts."); return null; }   // schema not installed yet: sign-in still works
    throw error;
  },
  /* Link the local user to its row and fill in anything the database already knows (a second device, a returning user). */
  attach(row){
    const u = DB.me(); if (!row || !u) return;
    this.legacy = row.creator_profile === undefined;
    u.cloudId = row.id; const p = (u.cats && !this.legacy ? row.creator_profile : row.profile) || {};
    if (row.name && !u.name) u.name = row.name;
    if (row.avatar_url && !u.avatar) u.avatar = row.avatar_url;
    if (row.verified && !u.verified && !u.cats){ u.verified = true; u.verifiedBy = "admin"; }   // company verification belongs to the client side
    if (u.cats){ for (const k of CREATOR_FIELDS) if (p[k] != null && (u[k] == null || u[k] === "" || (Array.isArray(u[k]) && !u[k].length))) u[k] = p[k]; }
    else { if (row.org && !u.org) u.org = row.org; u.profile = { ...p, ...(u.profile || {}) }; if (row.onboarded) u.onboarded = true; }
    DB.save();
  },
  row(u){
    const base = { name: u.name || null, avatar_url: u.avatar || null };
    if (u.cats){ const done = !!(u.handle && u.cats.length), profile = Object.fromEntries(CREATOR_FIELDS.filter(k => u[k] != null).map(k => [k, u[k]]));
      return this.legacy ? { ...base, local_id: u.id, onboarded: done, profile } : { ...base, creator_local_id: u.id, creator_onboarded: done, creator_profile: profile }; }
    return { ...base, local_id: u.id, org: u.org || null, onboarded: !!u.onboarded, profile: u.profile || {} };
  },
  queue(){ if (!LIVE.auth) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 800); },
  async push(){
    const u = DB.me(), sb = Auth.client(); if (!u || !u.cloudId || !sb) return;
    const { data } = await sb.auth.getSession(); if (!data.session || data.session.user.id !== u.cloudId) return;
    const key = u.cloudId + ":" + APP;   // the same row is written from both sites, each with its own columns
    let row = this.row(u), json = JSON.stringify(row); if (this.sent[key] === json) return;
    let { error } = await sb.from("market_profiles").update(row).eq("id", u.cloudId);
    if (error && !this.legacy && u.cats && (error.code === "42703" || error.code === "PGRST204" || error.code === "42501" || /creator_/.test(error.message || ""))){
      this.legacy = true; row = this.row(u); json = JSON.stringify(row);   // the database has no creator_* columns yet
      ({ error } = await sb.from("market_profiles").update(row).eq("id", u.cloudId));
    }
    if (error) console.warn("Rolvo: account not saved to the database.", error.message); else this.sent[key] = json;
  },
  signOut(){ const sb = LIVE.auth && Auth.client(); if (sb) sb.auth.signOut({ scope: "local" }); },   // local: the same login may be signed in on the other site or in admin; a global sign-out would end those too
};
document.addEventListener("pfm:change", () => Cloud.queue());

const Auth = {
  sb: null, pending: null,
  // One Supabase session per site (client / creator / admin), like the local sessions, so one browser can hold both sides of a deal.
  client(){ if (!this.sb && LIVE.auth && window.supabase) this.sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, { auth: { storageKey: "pfm.sb." + APP } }); return this.sb; },
  mode(){ return LIVE.auth ? "live" : "demo"; },

  /* Google comes back by redirect; finish the sign-in for the site that started it. */
  async boot(){
    const sb = this.client(); if (!sb || sessionStorage.getItem("pfm.oauth") !== APP) return;
    const { data } = await sb.auth.getSession(); const s = data && data.session; if (!s) return;
    sessionStorage.removeItem("pfm.oauth"); const u = s.user, md = u.user_metadata || {};
    this.finish({ email: u.email, phone: u.phone || null, provider: "google", name: md.full_name || md.name, avatar: md.avatar_url, mode: "live" });
  },
  async finish(identity){
    // Any email or phone can sign in on the public sites; only the admin console checks a list. The "admin login" and "other side" messages are only reached on a database running an older market.sql.
    const wrongSide = (was) => APP === "admin" ? "That account isn't on the admin list." : was === "admin" ? "That's the admin login. Use another email or phone here."
      : APP === "merchant" ? "That's a creator account. Sign in on the creator site." : "That's a client account. Sign in on the main site.";
    let account = null;
    if (LIVE.auth && identity.mode === "live"){   // the database decides which side this account is on and records the sign-in
      try { account = await Cloud.enter(identity); }
      catch (e) { await this.client().auth.signOut({ scope: "local" }); const m = /wrong_side:(\w+)/.exec(e.message || ""); return toast(m ? wrongSide(m[1]) : "Couldn't open your account. " + (e.message || "")); }
    }
    const p = this.pending || {}; this.pending = null;
    if (p.onIdentity){ p.onIdentity(identity); return Cloud.attach(account); }
    const u = DB.signIn(identity);
    if (!u) return toast(wrongSide("admin"));
    Cloud.attach(account); closeSheet(); render(); if (p.then) p.then(u);
  },

  /* opts: { onIdentity, methods: ["google","email","phone"], hint, signup }
     Laid out like the big marketplaces: one field (email, or phone when it looks like a number) → Continue, then "or" Google,
     and a Log in / Sign up switch at the bottom. Both run the same passwordless step: a new address gets an account. */
  open(then, copy, opts = {}){
    track("sign_in_opened", { reason: (copy && copy.title) || null });
    this.pending = { then, onIdentity: opts.onIdentity };
    // Live, a method shows only once it's switched on in config.js: email codes need Supabase's code template and our own SMTP,
    // phone codes need an SMS provider. Google needs nothing more.
    let methods = (opts.methods || ["google", "email", "phone"]).filter(m => !LIVE.auth || m === "google" || (m === "email" ? CONFIG.emailCodes : CONFIG.smsCodes));
    if (!methods.length) methods = ["google"];
    const canEmail = methods.includes("email"), canPhone = methods.includes("phone"), codes = canEmail || canPhone;
    const custom = !!(copy && copy.title);
    let signup = !!opts.signup, typed = "";
    const box = h("div", { class: "auth" });
    const head = h("div");
    const looksPhone = v => canPhone && !/[a-z@]/i.test(v) && (v.match(/\d/g) || []).length >= 3;
    const draw = () => {
      head.replaceChildren(phead(custom ? copy.title : signup ? "Create your Rolvo account" : "Log in to Rolvo",
        custom ? copy.sub : signup ? "Hire AI filmmakers, or get hired. No password needed." : (APP === "merchant" ? "Contacting a creator needs an account." : null)));
      const label = canEmail && canPhone ? "Email or phone number" : canEmail ? "Email" : "Phone number";
      const who = h("input", { class: "i", type: canEmail && !canPhone ? "email" : "text", name: "username", required: true, value: typed,
        autocomplete: canEmail ? "username email" : "tel", inputmode: canEmail ? "email" : "tel", autocapitalize: "off", spellcheck: "false",
        placeholder: canEmail ? (APP === "creator" ? "you@studio.com" : "you@company.com") : "Phone number", "aria-label": label,
        oninput: () => { typed = who.value; const p = looksPhone(who.value) && !who.value.trim().startsWith("+"); if (p !== !cc.hidden){ cc.hidden = !p; row.classList.toggle("withcc", p); } } });
      const cc = h("select", { class: "i cc", name: "cc", "aria-label": "Country code" }, ...COUNTRIES.map(([c, n]) => h("option", { value: c }, c + " " + n)));
      cc.hidden = !(canPhone && (!canEmail || (looksPhone(typed) && !typed.trim().startsWith("+"))));
      const row = h("div", { class: "who" + (cc.hidden ? "" : " withcc") }, cc, who);
      const f = h("form", { class: "form", novalidate: true, onsubmit: e => { e.preventDefault();
        const v = who.value.trim();
        if (canEmail && /@/.test(v)){
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return toast("That email doesn't look right.");
          const ok = opts.allow ? opts.allow(v.toLowerCase()) : true; if (ok !== true) return toast(ok);
          return this.sendCode({ email: v.toLowerCase() }, box, draw);
        }
        if (canPhone && looksPhone(v)){
          const digits = v.replace(/\D/g, "");
          const phone = v.startsWith("+") ? "+" + digits : cc.value + digits.replace(/^0+/, "");
          if (phone.replace(/\D/g, "").length < 8) return toast("That phone number looks too short.");
          return this.sendCode({ phone }, box, draw);
        }
        toast(canEmail && canPhone ? "Enter an email or a phone number." : canEmail ? "Enter your email." : "Enter your phone number."); } },
        field(label, row), h("button", { class: "btn primary big", type: "submit" }, "Continue"));
      const toggle = custom ? null : h("p", { class: "switch" }, signup ? "Already have an account? " : "Don't have a Rolvo account? ",
        h("button", { class: "link", type: "button", onclick: () => { signup = !signup; draw(); } }, signup ? "Log in" : "Sign up"));
      // Two sites, two kinds of account: say which one this is, and give the way to the other. A filmmaker who signs in here becomes a client.
      const side = APP === "merchant" ? h("p", { class: "switch" }, "Are you a filmmaker? ", h("a", { class: "link", href: assetBase() + "creator/#/apply" }, "Join as a creator"))
        : APP === "creator" ? h("p", { class: "switch" }, "Looking to hire? ", h("a", { class: "link", href: assetBase() }, "Rolvo for clients")) : null;
      box.replaceChildren(...[   // filter: replaceChildren would print "null" for the parts left out
        codes ? f : null,
        methods.includes("google") && codes ? h("div", { class: "or" }, h("span", null, "or")) : null,
        methods.includes("google") ? (CONFIG.googleClientId ? this.gsiButton(box, draw) : h("button", { class: "btn big gbtn", type: "button", onclick: () => this.google(box, draw) }, googleIcon(), "Continue with Google")) : null,
        opts.hint ? h("p", { class: "hint" }, opts.hint) : null,
        toggle,
        side,
        h("p", { class: "hint legal" }, "By continuing you agree to the ", h("a", { href: legalBase() + "terms/", target: "_blank", class: "link" }, "Terms"), " and ", h("a", { href: legalBase() + "privacy/", target: "_blank", class: "link" }, "Privacy Policy"), "."),
        this.mode() === "demo" ? h("p", { class: "hint demo" }, "Demo mode: no email or SMS is sent" + (LIVE.google ? "" : " and Google isn't connected") + ". Codes appear on screen.") : null].filter(Boolean));
      if (codes) setTimeout(() => who.focus(), 30);
    };
    draw();
    openSheet([head, box]);
  },

  async google(box, back){
    if (LIVE.auth){   // Supabase redirects to Google's own sign-in page and back
      sessionStorage.setItem("pfm.oauth", APP);
      const { error } = await this.client().auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href } });
      if (error) { sessionStorage.removeItem("pfm.oauth"); toast(error.message); }
      return;
    }
    if (CONFIG.googleClientId) return toast("Couldn't reach Google. Check your connection and try again.");
    // Demo: no Google client configured. Google's real chooser can't be drawn by us; it lives on accounts.google.com.
    const email = h("input", { class: "i", type: "email", required: true, placeholder: "name@gmail.com", autocomplete: "email" });
    box.replaceChildren(h("form", { class: "form", onsubmit: e => { e.preventDefault(); this.finish({ email: email.value.trim().toLowerCase(), provider: "google", mode: "demo", name: "" }); } },
      h("div", { class: "row", style: { gap: "10px" } }, googleIcon(), h("b", { style: { fontWeight: 500 } }, "Google · demo stand-in")),
      h("p", { class: "muted small" }, "With a Google Client ID in config.js this button opens Google's own account chooser. Until then, type the account you'd pick."),
      field("Google account", email), h("button", { class: "btn primary big", type: "submit" }, "Continue"),
      h("button", { class: "link small", type: "button", onclick: back }, "← Other ways to sign in")));
    setTimeout(() => email.focus(), 30);
  },

  /* Google Identity Services: Google renders its own button; clicking it opens Google's account chooser (accounts.google.com).
     It returns an ID token signed by Google, bound to our client ID and to a one-time nonce. */
  gsiButton(box, back){
    const slot = h("div", { class: "gsi", "aria-label": "Sign in with Google" });
    setTimeout(async () => {
      try {
        this.referrer("strict-origin-when-cross-origin");   // Google checks the page origin; restored when the sheet closes
        await loadGsi("https://accounts.google.com/gsi/client", () => window.google && google.accounts && google.accounts.id);
        const raw = randomHex(16), hashed = await sha256hex(raw);
        google.accounts.id.initialize({ client_id: CONFIG.googleClientId, nonce: hashed, ux_mode: "popup", auto_select: false, itp_support: true,
          callback: r => this.fromGoogle(r.credential, raw, hashed) });
        if (!slot.isConnected) return;
        google.accounts.id.renderButton(slot, { type: "standard", theme: "outline", size: "large", shape: "pill", text: "continue_with", logo_alignment: "center", width: Math.max(220, Math.min(400, slot.clientWidth || 360)) });
      } catch (e) {
        slot.replaceWith(h("button", { class: "btn big gbtn", type: "button", onclick: () => this.google(box, back) }, googleIcon(), "Continue with Google"));
      }
    }, 0);
    return slot;
  },
  async fromGoogle(token, nonce, hashed){
    if (LIVE.auth){   // server-checked: Supabase verifies Google's signature, audience and nonce, then opens a session
      const { data, error } = await this.client().auth.signInWithIdToken({ provider: "google", token, nonce });
      if (error) return toast(error.message);
      const u = data.user, md = u.user_metadata || {};
      return this.finish({ email: (u.email || "").toLowerCase(), provider: "google", name: md.full_name || md.name, avatar: md.avatar_url || md.picture, mode: "live" });
    }
    // Prototype without a backend: read the token in the browser. Fine for a demo, not proof of identity for money.
    let p; try { p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)))); } catch { return toast("Google sign-in didn't come back right. Try again."); }
    if (p.aud !== CONFIG.googleClientId || !/^(https:\/\/)?accounts\.google\.com$/.test(p.iss) || p.exp * 1000 < Date.now() || p.nonce !== hashed) return toast("Google sign-in couldn't be checked. Try again.");
    if (!p.email || !p.email_verified) return toast("Google didn't share a verified email.");
    this.finish({ email: p.email.toLowerCase(), provider: "google", name: p.name, avatar: p.picture, mode: "live" });
  },
  referrer(policy){
    const m = document.querySelector('meta[name="referrer"]'); if (!m) return;
    if (this._ref == null) this._ref = m.content;
    m.content = policy || this._ref;
  },

  async sendCode(target, box, back){
    const kind = target.email ? "email" : "phone"; let demoCode = null;
    const LEN = LIVE.auth ? (CONFIG.codeLength || 6) : 6;   // must match Supabase → Authentication → OTP length
    if (LIVE.auth){
      const { error } = await this.client().auth.signInWithOtp(target.email ? { email: target.email, options: { shouldCreateUser: true } } : { phone: target.phone, options: { shouldCreateUser: true } });
      if (error) return toast(/signups? not allowed|disabled/i.test(error.message) ? "Sign-ups are closed right now." : /rate|too many|seconds/i.test(error.message) ? "Too many codes. Wait a minute and try again." : error.message);
    } else demoCode = String(Math.floor(100000 + Math.random() * 900000));
    let wait = LIVE.auth ? 60 : 30, timer;   // live: Supabase refuses a new code within 60s per user
    const code = h("input", { class: "i code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: String(LEN), pattern: "\\d{" + LEN + "}", required: true, placeholder: "•".repeat(LEN), oninput: e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, LEN); if (e.target.value.length === LEN) f.requestSubmit(); } });
    const resend = h("button", { class: "link small", type: "button", disabled: true, onclick: () => { clearInterval(timer); this.sendCode(target, box, back); } }, "Resend in " + wait + "s");
    const f = h("form", { class: "form", onsubmit: async e => { e.preventDefault(); const v = code.value.trim();
        if (LIVE.auth){
          const { data, error } = await this.client().auth.verifyOtp(target.email ? { email: target.email, token: v, type: "email" } : { phone: target.phone, token: v, type: "sms" });
          if (error) { code.value = ""; return toast("That code didn't work. Check it or resend."); }
          clearInterval(timer); return this.finish({ email: data.user.email || target.email || null, phone: data.user.phone ? "+" + data.user.phone.replace(/^\+/, "") : target.phone || null, provider: kind, mode: "live" });
        }
        if (v !== demoCode) { code.value = ""; return toast("That code didn't work. Check it or resend."); }
        clearInterval(timer); this.finish({ ...target, provider: kind, mode: "demo" }); } },
      h("p", { class: "muted" }, "Enter the " + LEN + "-digit code we sent to ", h("b", { style: { color: "var(--fg)", fontWeight: 500 } }, target.email || target.phone), "."),
      code, h("button", { class: "btn primary big", type: "submit" }, "Verify"),
      h("div", { class: "row between" }, h("button", { class: "link small", type: "button", onclick: () => { clearInterval(timer); back(); } }, kind === "email" ? "Use a different email" : "Use a different number"), resend),
      demoCode ? h("p", { class: "hint demo" }, "Demo mode: your code is ", h("b", { class: "democode" }, demoCode), ".") : null);
    box.replaceChildren(f); setTimeout(() => code.focus(), 30);
    timer = setInterval(() => { wait -= 1; if (wait <= 0){ clearInterval(timer); resend.disabled = false; resend.textContent = "Resend code"; } else resend.textContent = "Resend in " + wait + "s"; }, 1000);
  },
};
