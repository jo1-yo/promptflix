/* Promptflix Market — sign-in and sign-up in one flow: Google, phone or email.
   Phone and email use a 6-digit code. Live (CONFIG.supabaseUrl set): Supabase Auth sends the code / runs Google OAuth.
   Demo: no code leaves the browser; it's shown on screen so the whole flow can be tested. Either way the result is an
   identity { email | phone, provider, mode } handed to DB.signIn (or to a custom onIdentity, e.g. claiming a profile). */
const COUNTRIES = [["+1", "US / CA"], ["+44", "UK"], ["+86", "China"], ["+852", "Hong Kong"], ["+81", "Japan"], ["+82", "Korea"], ["+65", "Singapore"], ["+91", "India"], ["+61", "Australia"], ["+49", "Germany"], ["+33", "France"], ["+31", "Netherlands"], ["+46", "Sweden"], ["+971", "UAE"], ["+234", "Nigeria"], ["+55", "Brazil"], ["+52", "Mexico"]];
const googleIcon = () => { const s = h("span", { class: "gicon", "aria-hidden": "true" }); s.innerHTML = '<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'; return s; };

const Auth = {
  sb: null, pending: null,
  client(){ if (!this.sb && LIVE.auth && window.supabase) this.sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey); return this.sb; },
  mode(){ return LIVE.auth ? "live" : "demo"; },

  /* Google comes back by redirect; finish the sign-in for the site that started it. */
  async boot(){
    const sb = this.client(); if (!sb || sessionStorage.getItem("pfm.oauth") !== APP) return;
    const { data } = await sb.auth.getSession(); const s = data && data.session; if (!s) return;
    sessionStorage.removeItem("pfm.oauth"); const u = s.user, md = u.user_metadata || {};
    this.finish({ email: u.email, phone: u.phone || null, provider: "google", name: md.full_name || md.name, avatar: md.avatar_url, mode: "live" });
  },
  finish(identity){
    const p = this.pending || {}; this.pending = null;
    if (p.onIdentity) return p.onIdentity(identity);
    const u = DB.signIn(identity);
    if (!u) return toast(APP === "admin" ? "That account isn't on the admin list." : APP === "merchant" ? "That's a creator account. Sign in on the creator site." : "That's a client account. Sign in on the main site.");
    closeSheet(); render(); if (p.then) p.then(u);
  },

  /* opts: { onIdentity, methods: ["google","email","phone"], hint } */
  open(then, copy, opts = {}){
    this.pending = { then, onIdentity: opts.onIdentity };
    const methods = opts.methods || ["google", "email", "phone"];
    let tab = methods.includes("email") ? "email" : "phone";
    const box = h("div", { class: "auth" });
    const draw = () => {
      const email = h("input", { class: "i", type: "email", name: "email", required: true, autocomplete: "email", placeholder: APP === "creator" ? "you@studio.com" : "you@company.com" });
      const cc = h("select", { class: "i cc", name: "cc", "aria-label": "Country code" }, ...COUNTRIES.map(([c, n]) => h("option", { value: c }, c + " " + n)));
      const num = h("input", { class: "i", type: "tel", name: "phone", required: true, autocomplete: "tel-national", inputmode: "tel", placeholder: "Phone number" });
      const f = h("form", { class: "form", onsubmit: e => { e.preventDefault();
        const target = tab === "email" ? { email: email.value.trim().toLowerCase() } : { phone: cc.value + num.value.replace(/\D/g, "").replace(/^0+/, "") };
        if (tab === "phone" && target.phone.length < cc.value.length + 6) return toast("That phone number looks too short.");
        this.sendCode(target, box, draw); } },
        methods.includes("email") && methods.includes("phone") ? h("div", { class: "seg", role: "tablist" }, ...[["email", "Email"], ["phone", "Phone"]].map(([k, l]) => h("button", { type: "button", role: "tab", "aria-selected": String(tab === k), onclick: () => { tab = k; draw(); } }, l))) : null,
        tab === "email" ? field("Email", email) : field("Mobile number", h("div", { class: "tel" }, cc, num)),
        h("button", { class: "btn primary big", type: "submit" }, "Continue"));
      box.replaceChildren(
        methods.includes("google") ? h("button", { class: "btn big gbtn", type: "button", onclick: () => this.google(box, draw) }, googleIcon(), "Continue with Google") : null,
        methods.includes("google") ? h("div", { class: "or" }, h("span", null, "or")) : null,
        f,
        h("p", { class: "hint" }, opts.hint || "New here? The same step creates your account. No password."),
        this.mode() === "demo" ? h("p", { class: "hint demo" }, "Demo mode: no email or SMS is sent" + (LIVE.google ? "" : " and Google isn't connected") + ". Codes appear on screen.") : null);
      setTimeout(() => (tab === "email" ? email : num).focus(), 30);
    };
    draw();
    openSheet([phead(copy && copy.title || "Sign in or create an account", copy && copy.sub || (APP === "merchant" ? "Contacting a creator needs an account. A few questions about you and the job come next." : null)), box]);
  },

  async google(box, back){
    if (LIVE.auth){   // Supabase redirects to Google's own sign-in page and back
      sessionStorage.setItem("pfm.oauth", APP);
      const { error } = await this.client().auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href } });
      if (error) { sessionStorage.removeItem("pfm.oauth"); toast(error.message); }
      return;
    }
    if (CONFIG.googleClientId){   // Google Identity Services: Google's own account-chooser popup, no backend needed
      try {
        await new Promise((ok, fail) => { if (window.google && google.accounts) return ok(); const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.onload = ok; s.onerror = () => fail(new Error("Couldn't reach Google")); document.head.append(s); });
        google.accounts.oauth2.initTokenClient({ client_id: CONFIG.googleClientId, scope: "openid email profile", prompt: "select_account",
          callback: async t => {
            if (t.error) return toast("Google sign-in was cancelled.");
            const p = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: "Bearer " + t.access_token } }).then(r => r.json());
            if (!p.email || p.email_verified === false) return toast("Google didn't share a verified email.");
            this.finish({ email: p.email.toLowerCase(), provider: "google", name: p.name, avatar: p.picture, mode: "live" });
          } }).requestAccessToken();
      } catch (e) { toast(e.message); }
      return;
    }
    // Demo: no Google client configured. Google's real chooser can't be drawn by us; it lives on accounts.google.com.
    const email = h("input", { class: "i", type: "email", required: true, placeholder: "name@gmail.com", autocomplete: "email" });
    box.replaceChildren(h("form", { class: "form", onsubmit: e => { e.preventDefault(); this.finish({ email: email.value.trim().toLowerCase(), provider: "google", mode: "demo", name: "" }); } },
      h("div", { class: "row", style: { gap: "10px" } }, googleIcon(), h("b", { style: { fontWeight: 500 } }, "Google · demo stand-in")),
      h("p", { class: "muted small" }, "With a Google Client ID in config.js this button opens Google's own account chooser. Until then, type the account you'd pick."),
      field("Google account", email), h("button", { class: "btn primary big", type: "submit" }, "Continue"),
      h("button", { class: "link small", type: "button", onclick: back }, "← Other ways to sign in")));
    setTimeout(() => email.focus(), 30);
  },

  async sendCode(target, box, back){
    const kind = target.email ? "email" : "phone"; let demoCode = null;
    if (LIVE.auth){
      const { error } = await this.client().auth.signInWithOtp(target.email ? { email: target.email, options: { shouldCreateUser: true } } : { phone: target.phone, options: { shouldCreateUser: true } });
      if (error) return toast(error.message);
    } else demoCode = String(Math.floor(100000 + Math.random() * 900000));
    let wait = 30, timer;
    const code = h("input", { class: "i code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", pattern: "\\d{6}", required: true, placeholder: "••••••", oninput: e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); if (e.target.value.length === 6) f.requestSubmit(); } });
    const resend = h("button", { class: "link small", type: "button", disabled: true, onclick: () => { clearInterval(timer); this.sendCode(target, box, back); } }, "Resend in 30s");
    const f = h("form", { class: "form", onsubmit: async e => { e.preventDefault(); const v = code.value.trim();
        if (LIVE.auth){
          const { data, error } = await this.client().auth.verifyOtp(target.email ? { email: target.email, token: v, type: "email" } : { phone: target.phone, token: v, type: "sms" });
          if (error) { code.value = ""; return toast("That code didn't work. Check it or resend."); }
          clearInterval(timer); return this.finish({ email: data.user.email || target.email || null, phone: data.user.phone ? "+" + data.user.phone.replace(/^\+/, "") : target.phone || null, provider: kind, mode: "live" });
        }
        if (v !== demoCode) { code.value = ""; return toast("That code didn't work. Check it or resend."); }
        clearInterval(timer); this.finish({ ...target, provider: kind, mode: "demo" }); } },
      h("p", { class: "muted" }, "Enter the 6-digit code we sent to ", h("b", { style: { color: "var(--fg)", fontWeight: 500 } }, target.email || target.phone), "."),
      code, h("button", { class: "btn primary big", type: "submit" }, "Verify"),
      h("div", { class: "row between" }, h("button", { class: "link small", type: "button", onclick: () => { clearInterval(timer); back(); } }, kind === "email" ? "Use a different email" : "Use a different number"), resend),
      demoCode ? h("p", { class: "hint demo" }, "Demo mode: your code is ", h("b", { class: "democode" }, demoCode), ".") : null);
    box.replaceChildren(f); setTimeout(() => code.focus(), 30);
    timer = setInterval(() => { wait -= 1; if (wait <= 0){ clearInterval(timer); resend.disabled = false; resend.textContent = "Resend code"; } else resend.textContent = "Resend in " + wait + "s"; }, 1000);
  },
};
