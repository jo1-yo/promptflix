# Promptflix

A marketplace for AI filmmakers. Clients find the person who made a film they liked, pay into escrow, review watermarked cuts and release payment on approval.

- **Live:** https://imjane.top/promptflix/ (GitHub Pages from `main`, no build step; every push to `main` deploys)
- **Market:** https://imjane.top/promptflix/market/ · [creator site](https://imjane.top/promptflix/market/creator/) · [admin](https://imjane.top/promptflix/market/admin/)
- **For coding agents:** read [`AGENTS.md`](AGENTS.md) first. It lists the rules and the traps.

## Status at a glance

The market is a **working prototype**. Every flow runs end to end in one browser, but data lives in that browser and nothing real is charged yet.

| Piece | State | What's missing (details in [What's not done](#whats-not-done)) |
| --- | --- | --- |
| Client, creator and admin sites | ✅ Working (demo data) | Shared backend. Each browser has its own copy of the data |
| Sign-in: email / phone codes | 🟡 Demo (code shown on screen) | Supabase project, SMTP, SMS provider |
| Sign-in: Google | 🟡 Code done, waiting on keys | Client ID in `config.js`, then publish the Google app |
| Payments: Stripe card + PayPal | 🟡 Code done, demo mode | Supabase function deployed, test keys, server-side order amounts |
| Escrow, revisions, contract breaks | ✅ Working (browser ledger) | Real money movement and creator payouts |
| Real creators (87) | ✅ Live, unclaimed | Outreach. Invites are a status flag, no email is sent |
| Privacy policy and terms | ✅ Live (draft) | Legal review |
| Repo checks on every PR | ✅ GitHub Actions | AI PR review (see [Pull requests](#pull-requests)) |
| Select showcase (`select/`) | ✅ Live | — |
| Feed app (`index.html`) | ⛔ Offline | Its Supabase project is gone; schema needs to be run on a new one |

## Repo map

| Path | What it is |
| --- | --- |
| [`market/`](market/) | **The marketplace.** Client site, creator site and admin. |
| [`market/creator/`](market/creator/) · [`market/admin/`](market/admin/) | HTML shells for the other two sites. They load the same scripts as `market/`. |
| [`market/privacy/`](market/privacy/) · [`market/terms/`](market/terms/) | Privacy policy and terms (needed for Google sign-in branding). |
| [`market/server/`](market/server/) | Payments Edge Function (Deno) and SQL for Supabase. Not deployed. |
| [`market/tools/`](market/tools/) | Python pipeline that builds `market/creators.js` from research data. |
| [`select/`](select/) | Promptflix Select: a curated showcase where every film plays inside the site. Creator names hidden on purpose. |
| [`index.html`](index.html) · [`schema.sql`](schema.sql) | The original feed app (swipe through AI videos, send a hire request) and its Supabase schema. |
| [`scripts/check.mjs`](scripts/check.mjs) | Repo checks, run locally and in CI. |
| [`.github/workflows/`](.github/workflows/) | CI. |

## Tech stack

**Front end**
- Plain HTML, CSS and JavaScript. No framework, no bundler, no npm, no build step. Files are served exactly as committed.
- Classic `<script>` tags (not ES modules), loaded in a fixed order. All files share one global scope.
- Rendering: a small `h(tag, attrs, ...children)` DOM helper in `ui.js`. Each site has a `render()` that rebuilds the main view from state.
- Routing: hash router (`#/creators`, `#/chat/:id`, …). `route()` and `go()` in `ui.js`.
- Styling: one stylesheet, [`market/styles.css`](market/styles.css). Dark editorial look: Instrument Serif for headings, Inter for text, one ivory accent. CSS custom properties in `:root`. Mobile-first, works down to 375 px.
- Fonts: Google Fonts. Icons: inline SVG.
- Browser APIs: `localStorage`, IndexedDB (uploaded preview files), Web Speech API (voice answers in onboarding), `crypto.subtle` (sign-in nonce).

**Data (today)**
- [`market/store.js`](market/store.js) is the whole data layer: a `DB` object over one JSON blob in `localStorage` (key `pfm.v3`), plus `Files` over IndexedDB (`pfm-files`) for uploaded cuts.
- Every `DB` method is meant to map onto one Supabase table or RPC later. Keep method names and record shapes stable.
- Seed data: [`seed.js`](market/seed.js) (taxonomy, styles, brief keywords, demo clients) and generated [`creators.js`](market/creators.js).

**Auth** ([`market/auth.js`](market/auth.js))
- One sheet for sign-in and sign-up. Google, phone (SMS code) or email (email code). No passwords.
- Google: Google Identity Services (`accounts.google.com/gsi/client`). Google renders its own button and account chooser and returns a signed ID token bound to a one-time nonce. With Supabase configured, the token is verified server-side with `supabase.auth.signInWithIdToken`.
- Email and phone: Supabase Auth OTP (`signInWithOtp`, `verifyOtp`).
- Demo mode (no keys): codes are generated and shown on screen.
- Sessions are kept per site (`merchant`, `creator`, `admin`), so one browser can play both sides of a deal.

**Payments** ([`market/pay.js`](market/pay.js), [`market/server/functions/payments/index.ts`](market/server/functions/payments/index.ts))
- Stripe Payment Element (cards) and PayPal JS SDK Buttons (PayPal balance only; PayPal's own card option is turned off so all cards go through Stripe).
- Server: one Supabase Edge Function (Deno, no dependencies) that creates Stripe PaymentIntents, creates and captures PayPal orders, verifies the Stripe webhook signature (HMAC SHA-256), and records payments in `market_payments`.
- Card numbers never touch Promptflix.

**Backend (planned):** Supabase. Postgres with row-level security, Auth, Storage, Edge Functions. Schema so far: [`market/server/market.sql`](market/server/market.sql) (orders, payments).

**Media**
- Creator films are embedded from where the creator posted them: YouTube (`youtube-nocookie.com`), Vimeo, or MP4 files from X (`video.twimg.com`).
- Covers: YouTube `maxresdefault`, falling back to `hqdefault` (letterboxed, cropped in CSS).
- X's video CDN refuses requests with a cross-site referrer, so every page sets `<meta name="referrer" content="no-referrer">`. YouTube and Vimeo iframes set their own policy.

**Data pipeline** ([`market/tools/`](market/tools/)): Python 3 standard library plus `curl` and macOS `sips`. YouTube IDs are checked with oEmbed; X posts come from the public fxtwitter API.

**Pinned third-party scripts**

| Script | Version | Loaded by |
| --- | --- | --- |
| `@supabase/supabase-js` (UMD, jsDelivr) | 2.117.3 | `config.js` (only when Supabase keys are set), `index.html` |
| Google Identity Services | Google-hosted, unversioned | `auth.js`, when a Google client ID is set |
| Stripe.js | v3 | `pay.js`, live mode only |
| PayPal JS SDK | PayPal-hosted, unversioned | `pay.js`, live mode only |

**Hosting and CI:** GitHub Pages (`.nojekyll`, custom domain on the parent `jo1-yo.github.io` repo). GitHub Actions runs [`scripts/check.mjs`](scripts/check.mjs) on every pull request.

## How the market works

**Three sites, one data layer**

| Site | Path | Who it's for | Script |
| --- | --- | --- | --- |
| Client | `/market/` | Startups, brands, agencies and studios hiring AI filmmakers | `merchant.js` (`APP = "merchant"`) |
| Creator | `/market/creator/` | Filmmakers: claim a crawled profile or apply, then work orders from an inbox | `creator.js` (`APP = "creator"`) |
| Admin | `/market/admin/` | The Promptflix team: money, verification, discovery, disputes | `admin.js` (`APP = "admin"`) |

Script load order on every site: `seed.js` → `creators.js` → `config.js` → `store.js` → `ui.js` → `auth.js` → `pay.js` → `voice.js` → the site script. The site script defines `APP` and calls `bootShared()`.

**Order lifecycle** (`o.status` in `store.js`)

```
negotiating ──accept terms (both)──▶ agreed ──pay deposit──▶ in_production ──first cut──▶ trial_review
                                                                                         │
                         pass: deposit released to creator ◀─────────────────────────────┤
                         fail: deposit refunded, order cancelled ◀───────────────────────┘
revising ──revision (up to the agreed count)──▶ revising ──approve final──▶ final_due ──pay balance──▶ completed
Either side can end early at any stage: cancelled (counts toward the 10-per-30-days break limit).
```

Escrow per order: `escrow.deposit` is `none | held | released | refunded`; `escrow.balance` is `none | released`. Promptflix keeps 10% (`COMMISSION`) of every release. Each payment is recorded with method (`card` / `paypal`), processor reference and `live` / `demo` mode.

**What a client does**

1. **Browse without an account.** Home has a search box, popular categories and selected work. **Creators** has a filter column (price, time zone, category, style, turnaround, on-platform) and sorting. Every card is a real video cover and every film plays in the site.
2. **Sign in or sign up in one step** with Google, phone or email.
3. **Onboard in 5 steps:** who you are and your work email, category, product, A/B picks between example films, then budget and timing. Form steps can be answered by voice. A work email on the company's own domain verifies instantly; everyone else goes to admin review.
4. **Start a project** from a creator's profile. A chat opens with the order card pinned on top. If the creator hasn't joined, the chat says an invite went out.
5. **Agree terms in the chat:** price, deposit %, revisions, duration and first-cut date.
6. **Pay the deposit by card (Stripe) or PayPal.** It is held in escrow.
7. **Review the first cut** (watermarked with the client's name, no download, blurred when the window loses focus). Passing releases the deposit to the creator; failing refunds it.
8. **Revise up to the agreed count**, approve the final, **pay the balance**, get the clean master, and both sides leave reviews.

**What a creator does:** claims a profile built from their public work, or applies in 4 steps; sets rates, time zone, styles and tools; accepts or counters terms; delivers cuts; tracks payouts. Until a creator sets rates, the site shows a category estimate marked `~`, never a made-up quote.

**Admin views:** Overview (money, funnel, sign-ins and payments by method, needs attention, activity) · Orders · Payments · Clients (one-click Verify / Revoke) · Creators · Discovery (crawled profiles and invites) · Trust (early endings, failed pre-reviews, break limits) · Integrations (which pieces are live or demo).

**Creators on the site:** 87 real people from the team's research list, across brand ads, narrative film, experimental and music video, animation and AI UGC. Covers and players come from their own YouTube uploads (IDs checked with oEmbed) or their own X posts. None has joined Promptflix: profiles say so, and prices are labelled estimates. 33 more handles with no public video (mostly Instagram-only fashion creators) wait in admin Discovery. Rebuild with [`market/tools/README.md`](market/tools/README.md).

## Run it locally

```bash
cd promptflix
python3 -m http.server 8131
# http://localhost:8131/market/          client
# http://localhost:8131/market/creator/  creator
# http://localhost:8131/market/admin/    admin
node scripts/check.mjs                   # repo checks (Node 22+)
```

`python3 -m http.server` lets the browser cache scripts. After editing, hard-reload (Cmd+Shift+R) or you may test old code.

**Reset demo** (bottom corner) wipes the browser's data.

### Demo accounts

In demo mode no email or SMS is sent: the 6-digit code appears on screen.

| Sign in as | How | What you'll see |
| --- | --- | --- |
| New client | Any email, phone number, or Google | Account created, then the 5-step onboarding |
| `dev@northstar.app` | Email code | Verified client, straight to projects |
| `mia@lumen.coffee` | Email code | Client who still has onboarding to do |
| A real creator | Creator site → **Claim profile** → search a name → any login | Their crawled profile becomes an account with an inbox |
| `team@promptflix.demo` | Admin site, email code or Google | The admin backend. Other addresses are refused |

## Configuration

All switches live in [`market/config.js`](market/config.js). Empty values keep that piece in demo mode, independently of the others. **Only public or publishable values go in this file; it is served to every visitor.** Secrets go in Supabase function env (`supabase secrets set`) or in the Supabase / Google dashboards.

| Key | Value | Turns on |
| --- | --- | --- |
| `supabaseUrl`, `supabaseKey` | `https://<ref>.supabase.co`, publishable key | Real email/SMS codes; server-verified Google sign-in |
| `googleClientId` | `….apps.googleusercontent.com` | Google's own sign-in button |
| `stripePk` | `pk_test_…` / `pk_live_…` | Card payments (also needs `paymentsUrl`) |
| `paypalClientId` | PayPal REST app client ID | PayPal payments (also needs `paymentsUrl`) |
| `paymentsUrl` | `https://<ref>.supabase.co/functions/v1/payments` | The payments function |
| `adminEmails` | list | Who may open admin (client-side only for now) |
| `supportEmail` | email | Contact shown on privacy and terms |

## Going live

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

## What's not done

In rough priority order. Each item says where the work goes.

**1. A real backend (blocks almost everything else)**
- [ ] Create a Supabase project (the old one, `wbbzlaeqzfrffooqenvs`, no longer exists). Paid plan once real users depend on it; free projects pause after a week idle.
- [ ] Move `store.js` from `localStorage` to Supabase tables with row-level security: users/profiles, creators, orders, messages, deliveries, payments, ledger, reviews, breaks, discovered. Keep the `DB` method names; swap their bodies for queries/RPCs. Today **each browser has its own data**, so a teammate can't see an order you created.
- [ ] Move uploaded cuts from IndexedDB to Supabase Storage (or Mux / Cloudflare Stream) with signed, expiring URLs.
- [ ] Realtime chat (Supabase Realtime) instead of re-rendering on local changes.
- [ ] Admin rights from a server-side role, not `CONFIG.adminEmails` (anyone can read and edit that list in the browser).

**2. Sign-in**
- [ ] Paste the Google client ID into `googleClientId` and test Google's popup on localhost and imjane.top.
- [ ] Google Cloud: publish the app; add home page, privacy and terms URLs; verify `imjane.top` in Search Console; submit brand verification.
- [ ] Supabase Auth: Google provider (client ID + secret), email OTP template with `{{ .Token }}`, custom SMTP, SMS provider (Twilio or similar).

**3. Payments**
- [ ] Deploy `market/server/functions/payments`, set Stripe and PayPal **test** keys, add the Stripe webhook, run a full test order.
- [ ] Compute amounts on the server from `market_orders` (`ORDERS_IN_DB=true`). Until then the function refuses live keys.
- [ ] Real refunds through Stripe / PayPal (today a refund is a ledger entry).
- [ ] Creator payouts: Stripe Connect (Express accounts, transfers with `transfer_group` = order ID) or PayPal Payouts, plus creator KYC and tax forms.
- [ ] Receipts and invoices; sales tax / VAT.
- [ ] Type-check the Deno function in CI (`deno check`). It's currently only parsed.

**4. Trust and content protection**
- [ ] Server-side watermarking of preview cuts. The current watermark and blur are browser overlays: they discourage casual copying but don't stop a screen recording or a direct file URL.
- [ ] Clean master delivered only after the balance is captured, through a signed URL.
- [ ] Dispute flow (today: end the contract early, and admin can see the chat).
- [ ] Stronger client verification than "work email matches website domain".

**5. Creators and growth**
- [ ] Real outreach to the 87 listed creators and the 33 in Discovery. "Invite" only sets a flag today; no email is sent.
- [ ] Take-down path for creators who don't want a listing (the privacy page promises it by email).
- [ ] Re-host or refresh covers: they hotlink YouTube and X, and links can break.
- [ ] Email / push notifications for new messages, terms, deliveries and payments.

**6. Product**
- [ ] Brief reader and matching use a keyword list (`LEXICON` in `seed.js`, `DB.readBrief` / `DB.match`). Replace with an LLM.
- [ ] Voice onboarding asks scripted questions through the Web Speech API (Chrome / Safari only). Replace with a real voice agent.
- [ ] Analytics, error reporting.
- [ ] Own domain (today under imjane.top/promptflix).
- [ ] Legal review of privacy and terms. They're a first draft.

**7. Feed app (`index.html`)**
- [ ] New Supabase project, run `schema.sql`, update the URL and key in `index.html` (see [Feed app setup](#feed-app-setup-indexhtml)).

## Pull requests

- Branch from `main`, open a PR, and wait for the **check** workflow. Merging to `main` deploys immediately.
- `node scripts/check.mjs` runs the same checks locally:
  - every page's scripts compile **together** (catches a duplicate top-level name across files, which silently breaks the page);
  - the Deno function parses;
  - no secret keys (Stripe, Google client secret, Supabase secret / service role, private keys);
  - no `.DS_Store`, no absolute local paths.
- The checks don't open a browser. For UI changes, run the site locally and click through the flow you touched, at desktop and phone width.

## Code map

| File | Role |
| --- | --- |
| `market/config.js` | Keys and live/demo switches |
| `market/store.js` | Data layer: identities, orders, escrow state machine, ledger, payments, invites |
| `market/auth.js` | Google / email / phone sign-in: Google's own button (ID token, verified by Supabase when set), Supabase codes, or demo |
| `market/pay.js` | Checkout sheet: Stripe Payment Element or PayPal Buttons, or demo |
| `market/ui.js` | Shared UI: `h()`, router, header and footer, sheets, covers, video player, chat and order card, watermarked preview |
| `market/merchant.js` · `creator.js` · `admin.js` | The three sites |
| `market/voice.js` | "Talk it through" voice answers for onboarding (Web Speech API) |
| `market/seed.js` · `creators.js` | Taxonomy, styles and demo clients · generated creator data (don't edit by hand) |
| `market/privacy/` · `terms/` | Legal pages (contact from `supportEmail`) |
| `market/server/` | Payments Edge Function and SQL |
| `market/tools/` | Pipeline that rebuilds `creators.js` |
| `scripts/check.mjs` | Repo checks |

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
