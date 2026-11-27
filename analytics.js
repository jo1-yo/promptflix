/* Rolvo — product analytics (PostHog). Loaded on all three sites, right after config.js.
   Off until CONFIG.posthogKey is set: with no key nothing is loaded, nothing is sent, and track() does nothing.
   - Pageviews are sent by hand, once on load and once per route: the sites route on the hash, which PostHog does not watch.
   - A visitor is anonymous until they sign in with a real account; then events carry the account id (never the email or name).
     Demo accounts are never identified: their ids are the same in every browser.
   - The id is kept in local storage, not a cookie. Session recording runs only when CONFIG.posthogReplay is true, and never
     on admin; all page text is masked, and anything inside .ph-no-capture (the conversations) is left out altogether.
   - PostHog does not send the hash, so each pageview carries `route` (the hash path, e.g. "search", "creator/<id>"), never
     its query: search words and reference links (#/search?q=…) stay in the browser.
   The stub below is PostHog's own install snippet with the library pinned to 1.455.2; bump the version on purpose, not silently. */
const TRACKING = !!CONFIG.posthogKey;
let trackedUser = null;
function track(name, props){ if (TRACKING) posthog.capture(name, { site: APP, ...(props || {}) }); }
function trackUser(){
  if (!TRACKING || typeof DB === "undefined" || !DB.state) return;
  const u = DB.me(); const id = u && u.cloudId ? u.cloudId : null; if (id === trackedUser) return;
  if (id) posthog.identify(id, { site: APP, role: u.role || null }); else if (trackedUser) posthog.reset();
  trackedUser = id;
}
if (TRACKING){
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/1.455.2/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init(CONFIG.posthogKey, { api_host: CONFIG.posthogHost || "https://us.i.posthog.com", defaults: "2026-08-30",
    capture_pageview: false, persistence: "localStorage",
    // replays: never on admin (it lists people's emails), and every piece of page text is masked, not only what is typed
    disable_session_recording: !CONFIG.posthogReplay || /\/admin\//.test(location.pathname), session_recording: { maskAllInputs: true, maskTextSelector: "*" },
    // PostHog leaves the hash out of the URL it sends, so `route` (below) is what tells pages apart. Should that ever change:
    // what follows "?" in the hash is what the visitor typed (a search, a reference link), and it is cut from every event here
    before_send: e => { const cut = o => { for (const k of ["$current_url", "$initial_current_url"]) if (o && typeof o[k] === "string") o[k] = o[k].replace(/(#[^?]*)\?.*$/, "$1"); };
      if (e){ cut(e.properties); cut(e.$set); cut(e.$set_once); } return e; } });
  const page = () => { trackUser(); posthog.capture("$pageview", { site: APP, route: location.hash.replace(/^#\/?/, "").split("?")[0] || "home" }); };
  addEventListener("DOMContentLoaded", () => setTimeout(page, 0)); addEventListener("hashchange", page);
  document.addEventListener("pfm:change", trackUser);
}
