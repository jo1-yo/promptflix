/* Voice agent: asks a form's questions aloud, listens, fills the fields. Web Speech API (Chrome/Safari); graceful text fallback. */
function micIcon(){ const w = h("span", { class: "ic", "aria-hidden": "true" }); w.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'; return w; }
const Voice = {
  supported(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition) && "speechSynthesis" in window; },
  lang(){ return (navigator.language || "en-US"); },
  speak(text){ return new Promise(res => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = this.lang(); u.rate = 1.02; u.onend = res; u.onerror = res; speechSynthesis.speak(u); } catch { res(); } }); },
  listen(){ return new Promise((res, rej) => { const R = window.SpeechRecognition || window.webkitSpeechRecognition; const r = new R(); r.lang = this.lang(); r.interimResults = false; r.maxAlternatives = 1;
    let done = false; r.onresult = e => { done = true; res(e.results[0][0].transcript); }; r.onerror = e => { done = true; rej(e.error); }; r.onend = () => { if (!done) res(""); }; r.start(); this.current = r; }); },
  stop(){ if (this.session) this.session.stopped = true; try { speechSynthesis.cancel(); this.current && this.current.abort(); } catch {} },
  pick(answer, options){ const a = answer.toLowerCase(); let best = null, score = 0;
    for (const o of options){ const words = o.label.toLowerCase().split(/[^a-z0-9+]+/).filter(w => w.length > 2); const n = words.filter(w => a.includes(w)).length; if (n > score){ score = n; best = o; } }
    return best; },

  /* fields: [{name, question, type:'text'|'select', options:[{value,label}]}]. onDone(answers) */
  run(fields, onDone, intro){
    if (!this.supported()) return toast("Voice needs Chrome or Safari with microphone access. You can keep typing.");
    const answers = {}; let i = 0; const S = this.session = { stopped: false };
    const log = h("div", { class: "vlog" });
    const status = h("div", { class: "vstatus" }, "Starting");
    const line = (who, text) => { log.append(h("div", { class: "vline " + who }, h("span", null, text))); log.scrollTop = log.scrollHeight; };
    const finish = () => { S.stopped = true; this.stop(); closeSheet(); onDone(answers); };
    const panel = [h("div", { class: "phead" }, h("div", null, h("h2", null, "Talk it through"), h("div", { class: "sub" }, "I'll ask each question. Answer out loud; say “skip” to leave one blank.")), h("button", { class: "close", onclick: () => { this.stop(); closeSheet(); }, "aria-label": "Close" }, "×")),
      log, status,
      h("div", { class: "row" }, h("button", { class: "btn small", onclick: () => finish() }, "Use what I have so far"), h("button", { class: "btn quiet small", onclick: () => { try { speechSynthesis.cancel(); this.current && this.current.abort(); } catch {} } }, "Repeat question"))];
    openSheet(panel);
    const ask = async () => {
      if (S.stopped) return;
      if (i >= fields.length){ status.textContent = "Done"; await this.speak("That's everything. Check the answers and continue."); if (!S.stopped) finish(); return; }
      const f = fields[i]; const q = f.question + (f.type === "select" ? " Options are: " + f.options.map(o => o.label).join(", ") + "." : "");
      line("agent", f.question); status.textContent = "Speaking"; await this.speak(q); if (S.stopped) return;
      status.textContent = "Listening"; let said = "";
      try { said = await this.listen(); } catch (e) { if (e === "not-allowed"){ status.textContent = "Microphone blocked"; line("agent", "I can't use the microphone. Allow it in the address bar, or keep typing."); return; } }
      if (S.stopped) return;
      if (!said){ line("agent", "I didn't catch that."); return ask(); }
      line("you", said);
      if (/^(skip|next|pass)\b/i.test(said)){ i++; return ask(); }
      if (f.type === "select"){ const o = this.pick(said, f.options); if (o){ answers[f.name] = o.value; line("agent", "Got it: " + o.label + "."); } else { line("agent", "I'll leave that for you to pick."); } }
      else answers[f.name] = said.replace(/[.。]$/, "");
      i++; ask();
    };
    (async () => { if (intro) await this.speak(intro); ask(); })();
  },
  /* Build field specs from a form's labelled controls. */
  fieldsFromForm(form, questions){
    return [...form.querySelectorAll("input[name], select[name], textarea[name]")].filter(el => el.type !== "file" && el.type !== "date" && questions[el.name]).map(el => ({
      name: el.name, question: questions[el.name], type: el.tagName === "SELECT" ? "select" : "text",
      options: el.tagName === "SELECT" ? [...el.options].filter(o => o.value).map(o => ({ value: o.value, label: o.textContent })) : null }));
  },
  fill(form, answers){ for (const [k, v] of Object.entries(answers)){ const el = form.querySelector(`[name="${k}"]`); if (!el) continue; el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); } toast("Filled in from the conversation. Check and continue."); },
  button(form, questions, intro){ return h("button", { class: "btn quiet small vbtn", type: "button", onclick: () => this.run(this.fieldsFromForm(form, questions), a => this.fill(form, a), intro) },
    micIcon(), "Talk it through instead"); },
};
