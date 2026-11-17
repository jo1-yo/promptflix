# Promptflix

A marketplace for AI filmmakers. Clients find the person who made a film they liked, pay into escrow, review watermarked cuts and release payment on approval.

Live: https://imjane.top/promptflix/ · deployed by GitHub Pages from `main`, no build step.

| Path | What it is |
| --- | --- |
| [`market/`](market/) | **The marketplace.** Client site, creator site and admin. Runs fully in the browser today, with live hooks for Google, SMS, email codes, Stripe and PayPal. |
| [`select/`](select/) | Promptflix Select: a curated showcase where every film plays inside the site. |
| [`index.html`](index.html) | The original feed app (swipe through AI videos, send a hire request), backed by Supabase. |

---

## Market

Three sites share one data layer.

| Site | URL (local) | Who it's for |
| --- | --- | --- |
| Client | `/market/` | Startups, brands, agencies and studios hiring AI filmmakers |
| Creator | `/market/creator/` | Filmmakers: claim a crawled profile or apply, then work orders from an inbox |
| Admin | `/market/admin/` | The Promptflix team: money, verification, discovery, disputes |

### Run it

```bash
cd promptflix
python3 -m http.server 8131
# http://localhost:8131/market/        client
# http://localhost:8131/market/creator/ creator
# http://localhost:8131/market/admin/   admin
```

Everything is stored in the browser (`localStorage`, uploaded clips in IndexedDB), with one session per site, so a single browser can play client, creator and admin at once. **Reset demo** in the bottom corner wipes it.

### Demo accounts

In demo mode no email or SMS is sent: the 6-digit code appears on screen.

| Sign in as | How | What you'll see |
| --- | --- | --- |
| New client | Any email, phone number, or Google | Account created, then the 5-step onboarding |
| `dev@northstar.app` | Email code | Verified client, straight to projects |
| `mia@lumen.coffee` | Email code | Client who still has onboarding to do |
| A real creator | Creator site → **Claim profile** → search a name → any login | Their crawled profile becomes an account with an inbox |
| `team@promptflix.demo` | Admin site, email code or Google | The admin backend. Other addresses are refused |

### What a client does

1. **Browse without an account.** Home has a search box, popular categories and selected work. **Creators** has an always-visible filter column for price, time zone, category, style, turnaround and on-platform, plus sorting. Every card is a real video cover, and every film plays in the site.
2. **Sign in or sign up in one step**, with Google, a phone number (SMS code) or email (email code). No passwords.
3. **Onboard in 5 steps:** who you are and your work email, category, product, A/B picks between example films, then budget and timing. The form steps can be answered by voice ("Talk it through"). A proven work email on the company's own domain verifies instantly; everyone else goes to admin review.
4. **Start a project** from a creator's profile. A chat opens with the order card pinned on top. If the creator hasn't joined yet, the chat says an invite went out.
5. **Agree terms in the chat:** price, deposit %, revisions, duration and first-cut date.
6. **Pay the deposit by card (Stripe) or PayPal.** It is held in escrow, not paid to the creator.
7. **Review the first cut** (watermarked with your name, no download, blurred when the window loses focus). Passing it releases the deposit to the creator; failing it refunds you.
8. **Revise up to the agreed count**, approve the final, and **pay the balance by card or PayPal.** The clean master unlocks and both sides leave reviews.

### What a creator does

- **Claim** a profile the crawler built from their public work, or **apply** with a 4-step application.
- Set rates, time zone, styles and tools. Until a creator sets rates, the site shows a category estimate marked `~`, never a made-up quote.
- Accept or counter terms, deliver cuts, and track payouts. Promptflix keeps 10% of each release.

### Admin

| View | Purpose |
| --- | --- |
| Overview | Paid in, held in escrow, commission, paid out; client funnel; sign-ins by method; payments by method; items needing attention; live activity |
| Orders | Every project with status filters and search. Opens the full chat read-only |
| Payments | Each payment with method (Card · Stripe / PayPal), processor reference and live/demo mode, plus the escrow ledger |
| Clients | Login, sign-in method, company, verification status. One-click **Verify** / **Revoke** |
| Creators | On Promptflix, applying, or unclaimed; invite unclaimed ones |
| Discovery | Crawled profiles, invites, creators with a client waiting, and handles found with no public video |
| Trust | Contracts ended early, failed pre-reviews, break limits (10 per account per 30 days) |
| Integrations | Which pieces are live or demo, and what each one needs |

### Creators on the site

The 87 creators are real people from the team's research list, across brand ads, narrative film, experimental/music video, animation and AI UGC. Their covers and players come from their own YouTube uploads (each ID checked with YouTube oEmbed) or their own X posts. None of them has joined Promptflix: profiles say so, and prices are labelled estimates. Handles with no public video (mostly Instagram-only fashion creators) wait in the admin Discovery queue. To rebuild the data, see [`market/tools/README.md`](market/tools/README.md).

### Going live

Every integration is optional and independent. Fill [`market/config.js`](market/config.js) one piece at a time; anything left empty stays in demo mode.

**Google sign-in**

Sign-in uses Google's own "Continue with Google" button. Clicking it opens Google's account chooser on accounts.google.com, which returns an ID token signed by Google.

1. Google Cloud Console → **Google Auth Platform** → Clients → Create client → **Web application**.
2. Authorized JavaScript origins: `http://localhost`, `http://localhost:8131` and `https://imjane.top`. No redirect URI is needed. Copy the client ID (the secret is only for Supabase, step 5).
3. Paste the client ID into `googleClientId`. The button now works, but the token is only checked in the browser. That's fine for a prototype; it isn't proof of identity for orders or money.
4. **Audience:** while the app is in Testing, only listed test users can sign in. Click **Publish app** to open it to everyone. It only asks for name, email and picture (non-sensitive scopes), so Google doesn't need to review it.
5. **Branding:** set the home page `https://imjane.top/promptflix/market/`, privacy policy `https://imjane.top/promptflix/market/privacy/`, terms `https://imjane.top/promptflix/market/terms/`, and authorized domain `imjane.top` (verify it in Google Search Console). Brand verification then shows the Promptflix name and logo on Google's screen.
6. **Server-checked sessions:** with `supabaseUrl` and `supabaseKey` also set, each Google token goes to Supabase (`signInWithIdToken`), which checks Google's signature, our client ID and a one-time nonce before opening a session. In Supabase → Authentication → Sign In / Providers → Google, enable it and paste the same client ID and its secret. Google's screen then names imjane.top, not supabase.co.

Google sign-in is free and doesn't use Google Cloud credits or need billing.

**Email and phone codes (Supabase Auth)**

1. Create a Supabase project. Set `supabaseUrl` and `supabaseKey` (the publishable key). Free projects pause after a week without traffic; use a paid plan once real users depend on it.
2. Email: in Authentication → Email Templates, put `{{ .Token }}` in the magic-link template so users get a 6-digit code. Add custom SMTP before launch, because the built-in sender is rate-limited.
3. Phone: enable the Phone provider and connect an SMS provider (Twilio, MessageBird or Vonage).
4. Add `https://imjane.top/promptflix/market/` to Authentication → URL Configuration → Redirect URLs.

**Payments (Stripe card + PayPal)**

Card numbers never touch Promptflix: Stripe's Payment Element and PayPal's buttons collect them. The server part is one Supabase Edge Function, [`market/server/functions/payments`](market/server/functions/payments/index.ts).

1. Run [`market/server/market.sql`](market/server/market.sql) in the Supabase SQL editor.
2. Deploy the function:
   ```bash
   supabase functions deploy payments --no-verify-jwt
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... \
     PAYPAL_CLIENT_ID=... PAYPAL_SECRET=... PAYPAL_ENV=sandbox ALLOWED_ORIGIN=https://imjane.top
   ```
3. In config.js set `stripePk` (`pk_test_...`), `paypalClientId` and `paymentsUrl` (`https://<ref>.supabase.co/functions/v1/payments`).
4. In Stripe → Developers → Webhooks, point `payment_intent.succeeded` at the same URL.
5. Test with Stripe card `4242 4242 4242 4242` and a PayPal sandbox buyer account.

**Before real money**

- The function trusts the amount from the browser only in test/sandbox mode. It refuses `sk_live_` keys and `PAYPAL_ENV=live` until orders are written to `market_orders` and `ORDERS_IN_DB=true`, so amounts come from the server.
- Payouts to creators are ledger entries today. Real payouts need Stripe Connect (transfers with `transfer_group` = order id) or PayPal Payouts.
- Orders, chats and profiles still live in the browser. Moving `store.js` onto Supabase tables is the next step; each method maps onto one table or RPC.

### Code map

| File | Role |
| --- | --- |
| `market/config.js` | Keys and live/demo switches |
| `market/store.js` | Data layer: identities, orders, escrow state machine, ledger, payments, invites |
| `market/auth.js` | Google / email / phone sign-in: Google's own button (ID token, verified by Supabase when set), Supabase codes, or demo |
| `market/privacy/` · `terms/` | Privacy policy and terms (contact address from `supportEmail` in config.js) |
| `market/pay.js` | Checkout sheet: Stripe Payment Element or PayPal Buttons, or demo |
| `market/ui.js` | Shared UI: header, sheets, covers, video player, the chat and order card, watermarked preview |
| `market/merchant.js` · `creator.js` · `admin.js` | The three sites |
| `market/voice.js` | "Talk it through" voice answers for onboarding (Web Speech API) |
| `market/seed.js` · `creators.js` | Taxonomy, styles and demo clients · generated creator data |
| `market/server/` | Payments Edge Function and SQL |
| `market/tools/` | Pipeline that rebuilds `creators.js` |

---

## Feed app setup (`index.html`)

1. Create a Supabase project, then open **SQL Editor** and run [`schema.sql`](schema.sql).
2. In **Authentication → URL Configuration**, set Site URL to `https://imjane.top/promptflix/` and add it to Redirect URLs.
3. Copy **Project URL** and **anon public key** (Project Settings → API) into `SUPABASE_URL` / `SUPABASE_ANON_KEY` at the top of the script in `index.html`.
4. Sign in on the site once, then make yourself an admin so you can see hire requests:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = '<your email>';
   ```

The feed is a vertical list of every posted video. **Hire** opens a short request form, with no sign-up needed. Creators sign in with an email link, set their name, rate and bio, and post videos (up to 50 MB). Hire requests and creator emails are readable only by admins.
