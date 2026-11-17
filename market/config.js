/* Promptflix Market — integrations. Empty values = demo mode: every flow still runs, nothing leaves the browser.
   Fill these to go live (see README → "Going live"). Only publishable / public keys belong here; secrets go in the server function's env. */
const CONFIG = {
  supabaseUrl: "",          // https://<ref>.supabase.co — Auth for Google, phone (SMS) and email codes
  supabaseKey: "",          // publishable (anon) key
  googleClientId: "",       // …apps.googleusercontent.com — Google's own button + account chooser (Google Identity Services).
                            // With Supabase set too, the Google token is verified server-side; alone it's a browser-only prototype.
  stripePk: "",             // pk_test_… — card payments through the Stripe Payment Element
  paypalClientId: "",       // PayPal REST app client id (sandbox first)
  paymentsUrl: "",          // https://<ref>.supabase.co/functions/v1/payments — creates PaymentIntents and PayPal orders server-side
  adminEmails: ["team@promptflix.demo"],
  supportEmail: "",         // shown on the privacy and terms pages; also the support email on Google's consent screen
};
const LIVE = {
  auth: !!(CONFIG.supabaseUrl && CONFIG.supabaseKey),
  google: !!((CONFIG.supabaseUrl && CONFIG.supabaseKey) || CONFIG.googleClientId),
  stripe: !!(CONFIG.stripePk && CONFIG.paymentsUrl),
  paypal: !!(CONFIG.paypalClientId && CONFIG.paymentsUrl),
};
// Supabase's client library is only needed live; loaded here so it's ready before auth.js runs.
if (LIVE.auth) document.write('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js"><\/script>');
