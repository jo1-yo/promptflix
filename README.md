# Rolvo

A marketplace for AI filmmakers. Clients find the person who made a film they liked, pay into escrow, review watermarked cuts and release payment on approval.

- **Live:** https://rolvo.market/ · [creator site](https://rolvo.market/creator/) · [admin](https://rolvo.market/admin/) (GitHub Pages from `main`, no build step; every push to `main` deploys)
- **Addresses:** the market is the root of this repo and is served at `rolvo.market` (the `CNAME` file; domain and DNS are at Cloudflare). The old `imjane.top/promptflix/` address and the old `/market/…` links forward here. Every path in the code is relative, so the address lives only in DNS, the Pages custom domain and the allowed URLs in Google and Supabase.
- **For coding agents:** read [`AGENTS.md`](AGENTS.md) first. It lists the rules and the traps.

## Status at a glance

The market is a **working prototype**. Every flow runs end to end in one browser, but data lives in that browser and nothing real is charged yet.

| Piece | State | What's missing (details in [What's not done](#whats-not-done)) |
| --- | --- | --- |
| Client, creator and admin sites | ✅ Working (demo data) | Shared backend. Each browser has its own copy of the data |
| Sign-in: email codes | ✅ Live (sent from a Gmail account as "Rolvo Market") | A sender on rolvo.market once the domain is active |
| Sign-in: phone codes | 🟡 Demo (code shown on screen) | SMS provider |
| Sign-in: Google | 🟡 Code done, waiting on keys | Client ID in `config.js`, then publish the Google app |
| Payments in: card through Stripe (order amount + card fee) | 🟡 Code done, demo mode | Supabase function deployed, Stripe test keys, server-side order amounts |
| Creator wallet: balance, payout method, withdrawals (Stripe Connect) | 🟡 Demo works; live code written, never run against Stripe | Stripe account with Connect enabled, function deployed, orders in the database |
| Messages between a client and a creator | 🟡 Code done: stored in Supabase, pushed live to the other side (`chat.js`, `market.sql` Part 3). Tested against a local Postgres, not yet against the live project | Run the new `market.sql` in Supabase. Until then chats stay in the browser and say so. Terms, deliveries and escrow are still browser-only |
| Escrow, revisions, contract breaks | ✅ Working (browser ledger) | Real money movement and creator payouts |
| Match a reference (client `#/match`) | ✅ Live. Reads an uploaded file or a YouTube link in the browser | Other sites' videos can't be read; category guess is rough; phone speed untested |
| Real creators (87) | ✅ Live, unclaimed | Outreach. Invites are a status flag, no email is sent |
| Privacy policy and terms | ✅ Live (draft) | Legal review |
| Repo checks on every PR | ✅ GitHub Actions | — |
| Claude PR review + `@claude` | 🟡 Workflows in place | Repo secret `ANTHROPIC_API_KEY` (see [Pull requests](#pull-requests)) |
| Select showcase (`select/`) | ✅ Live | — |

## Repo map

| Path | What it is |
| --- | --- |
| repo root (`index.html`, `*.js`, `styles.css`) | **The marketplace.** The client site, and the scripts all three sites share. |
| [`creator/`](creator/) · [`admin/`](admin/) | HTML shells for the other two sites. They load the same scripts as the client site. |
| [`market/`](market/) | Forwarding pages only, so links to the old `/market/…` addresses keep working. |
| [`privacy/`](privacy/) · [`terms/`](terms/) | Privacy policy and terms (needed for Google sign-in branding). |
| [`server/`](server/) | Payments Edge Function (Deno) and SQL for Supabase. Not deployed. |
| [`tools/`](tools/) | Python pipeline that builds `creators.js` from research data, and `embed.mjs`, which builds `embeds.js` (film fingerprints for Match a reference). |
| [`select/`](select/) | Rolvo Select: a curated showcase where every film plays inside the site. Creator names hidden on purpose. |
| [`scripts/check.mjs`](scripts/check.mjs) | Repo checks, run locally and in CI. |
| [`.github/workflows/`](.github/workflows/) | CI: `check` (required), `claude-review`, `claude` (`@claude` mentions). |

## Tech stack

**Front end**
- Plain HTML, CSS and JavaScript. No framework, no bundler, no npm, no build step. Files are served exactly as committed.
- Classic `<script>` tags (not ES modules), loaded in a fixed order. All files share one global scope.
- Rendering: a small `h(tag, attrs, ...children)` DOM helper in `ui.js`. Each site has a `render()` that rebuilds the main view from state.
- Routing: hash router (`#/creators`, `#/chat/:id`, …). `route()` and `go()` in `ui.js`.
- Styling: one stylesheet, [`styles.css`](styles.css). Warm light look after the Cursor study in Tasta: off-white canvas, dark ink, white cards, one orange marker. CSS custom properties in `:root`. Mobile-first, works down to 375 px.
- Fonts: Inter (400, 500, 600) from Google Fonts. Icons: inline SVG.
- Match a reference is the one page that loads outside code: [transformers.js](https://github.com/huggingface/transformers.js) 4.3.2 from jsDelivr and the image model `Xenova/mobileclip_s0` (about 45 MB, cached by the browser) from Hugging Face, both fetched only when a visitor gives a reference. The site itself still has no npm and no build step.
- Browser APIs: `localStorage`, IndexedDB (uploaded preview files), Web Speech API (voice answers in onboarding), `crypto.subtle` (sign-in nonce).

**Data (today)**
- [`store.js`](store.js) is the whole data layer: a `DB` object over one JSON blob in `localStorage` (key `pfm.v3`), plus `Files` over IndexedDB (`pfm-files`) for uploaded cuts.
- Every `DB` method is meant to map onto one Supabase table or RPC later. Keep method names and record shapes stable.
- Seed data: [`seed.js`](seed.js) (taxonomy, styles, brief keywords, demo clients) and generated [`creators.js`](creators.js).

**Auth** ([`auth.js`](auth.js))
- One sheet for sign-in and sign-up. Google, phone (SMS code) or email (email code). No passwords.
- Google: Google Identity Services (`accounts.google.com/gsi/client`). Google renders its own button and account chooser and returns a signed ID token bound to a one-time nonce. With Supabase configured, the token is verified server-side with `supabase.auth.signInWithIdToken`.
- Email and phone: Supabase Auth OTP (`signInWithOtp`, `verifyOtp`).
- Demo mode (no keys): codes are generated and shown on screen.
- Sessions are kept per site (`merchant`, `creator`, `admin`), so one browser can play both sides of a deal.

**Payments** ([`pay.js`](pay.js), [`server/functions/payments/index.ts`](server/functions/payments/index.ts))
- Stripe Payment Element (cards) and PayPal JS SDK Buttons (PayPal balance only; PayPal's own card option is turned off so all cards go through Stripe).
- Server: one Supabase Edge Function (Deno, no dependencies) that creates Stripe PaymentIntents, creates and captures PayPal orders, verifies the Stripe webhook signature (HMAC SHA-256), and records payments in `market_payments`.
- Card numbers never touch Rolvo.

**Backend (planned):** Supabase. Postgres with row-level security, Auth, Storage, Edge Functions. Schema so far: [`server/market.sql`](server/market.sql) (accounts, sign-in log, orders, payments).

**Media**
- Creator films are embedded from where the creator posted them: YouTube (`youtube-nocookie.com`), Vimeo, or MP4 files from X (`video.twimg.com`).
- Covers: YouTube `maxresdefault`, falling back to `hqdefault` (letterboxed, cropped in CSS).
- X's video CDN refuses requests with a cross-site referrer, so every page sets `<meta name="referrer" content="no-referrer">`. YouTube and Vimeo iframes set their own policy.

**Data pipeline** ([`tools/`](tools/)): Python 3 standard library plus `curl` and macOS `sips`. YouTube IDs are checked with oEmbed; X posts come from the public fxtwitter API.

**Pinned third-party scripts**

| Script | Version | Loaded by |
| --- | --- | --- |
| `@supabase/supabase-js` (UMD, jsDelivr) | 2.117.3 | `config.js` (only when Supabase keys are set) |
| Google Identity Services | Google-hosted, unversioned | `auth.js`, when a Google client ID is set |
| Stripe.js | v3 | `pay.js`, live mode only |
| PayPal JS SDK | PayPal-hosted, unversioned | `pay.js`, live mode only |

**Hosting and CI:** GitHub Pages (`.nojekyll`, custom domain on the parent `jo1-yo.github.io` repo). GitHub Actions runs [`scripts/check.mjs`](scripts/check.mjs) on every pull request, plus Claude review ([`anthropics/claude-code-action@v1`](https://github.com/anthropics/claude-code-action)) once a key is set.

## How the market works

**Three sites, one data layer**

| Site | Path | Who it's for | Script |
| --- | --- | --- | --- |
| Client | `/` | Startups, brands, agencies and studios hiring AI filmmakers | `merchant.js` (`APP = "merchant"`) |
| Creator | `/creator/` | Filmmakers: claim a crawled profile or apply, then work orders from an inbox | `creator.js` (`APP = "creator"`) |
| Admin | `/admin/` | The Rolvo team: money, verification, discovery, disputes | `admin.js` (`APP = "admin"`) |

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

Escrow per order: `escrow.deposit` is `none | held | released | refunded`; `escrow.balance` is `none | released`. Rolvo keeps 1% (`FEES.commission`) of every release; the client pays the card fee on top (`FEES.card`); creators withdraw free, or instantly for 1% (`FEES.instant`). All money rules are the `FEES` object at the top of `store.js`. Each payment is recorded with method (`card` / `paypal`), processor reference and `live` / `demo` mode.

**What a client does**

1. **Browse without an account.** Home has a search box, popular categories and selected work. **Creators** has a filter column (price, time zone, category, style, turnaround, on-platform) and sorting. Every card is a real video cover and every film plays in the site.
2. **Sign in or sign up in one step** with Google, phone or email.
3. **Onboard in 5 steps:** who you are and your work email, category, product, A/B picks between example films, then budget and timing. Form steps can be answered by voice. A work email on the company's own domain verifies instantly; everyone else goes to admin review.
4. **Start a project** from a creator's profile. A chat opens with the order card pinned on top. If the creator hasn't joined, the chat says an invite went out.
5. **Agree terms in the chat:** price, deposit %, revisions, duration and first-cut date.
6. **Pay the deposit by card (Stripe) or PayPal.** It is held in escrow.
7. **Review the first cut** (watermarked with the client's name, no download, blurred when the window loses focus). Passing releases the deposit to the creator; failing refunds it.
8. **Revise up to the agreed count**, approve the final, **pay the balance**, get the clean master, and both sides leave reviews.

**Match a reference** (`#/match`, button on the home page, no account needed). The client gives a video they like and gets films that look like it.

- **What can be read:** a file from their computer (six frames across its length), a YouTube link (the cover and three mid-film stills), or a direct `.mp4` / `.webm` / `.mov` link. Instagram, TikTok, Vimeo and most other sites don't let a browser read their video; there the client picks the kind and look by hand and films are ranked on those two tags.
- **How it ranks:** the frames go through a small CLIP image model in the visitor's browser and become one fingerprint. [`embeds.js`](embeds.js) holds the same fingerprint for every film in the library. Films are ordered by how close the two are, two per creator at most. Nothing is uploaded.
- **"We read it as":** kind and look are voted by the ten closest films and shown as chips the client can change; changing them nudges the order slightly. The guess leans toward Business & Brand because most of the library is.
- **Then:** opening a matched film and starting a project puts the reference link and tags into the brief.
- **Keep it in step:** run `tools/embed.mjs` after `creators.js` changes (see the comment at the top of that file). A film with no fingerprint is ranked last. The model must stay `fp32` on both sides; its 8-bit version gives unusable vectors.

**What a creator does:** claims a profile built from their public work, or signs up and applies in 4 steps (who you are and tools, what you make, links to work, pricing); accepts or counters terms; delivers cuts; tracks payouts.

- Work links are optional at sign-up and can be added later from Profile. A creator with no film is not listed in the market until one is added.
- Pricing is a starting level (Free, Under $1k, $1k to $3k, $3k to $8k, $8k and up) with sample films beside each, plus an exact number that may be 0. The samples come from category estimates, not prices anyone quoted.
- **Typical delivery time** runs from Same day to A month or more. It means paid deposit to first cut, not how fast they reply.
- **Work** (`#/work`) lets creators and applicants browse other creators' films by category. Until a creator sets rates, the site shows a category estimate marked `~`, never a made-up quote.

**Admin views:** Overview (money, funnel, sign-ins and payments by method, needs attention, activity) · Orders · Payments · Clients (one-click Verify / Revoke) · Creators · Discovery (crawled profiles and invites) · Trust (early endings, failed pre-reviews, break limits) · Integrations (which pieces are live or demo).

**Creators on the site:** 87 real people from the team's research list, across brand ads, narrative film, experimental and music video, animation and AI UGC. Covers and players come from their own YouTube uploads (IDs checked with oEmbed) or their own X posts. None has joined Rolvo: profiles say so, and prices are labelled estimates. 33 more handles with no public video (mostly Instagram-only fashion creators) wait in admin Discovery. Rebuild with [`tools/README.md`](tools/README.md).

## Run it locally

```bash
cd promptflix
python3 -m http.server 8131
# http://localhost:8131/          client
# http://localhost:8131/creator/  creator
# http://localhost:8131/admin/    admin
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
| `team@rolvo.demo` | Admin site, email code or Google | The admin backend. Other addresses are refused |

Live (Supabase keys set in `config.js`, as on rolvo.market) there are no demo accounts and no on-screen codes: codes arrive by email. Admin opens only for an address in `adminEmails`, and any other address is refused before a code is sent.

## Configuration

All switches live in [`config.js`](config.js). Empty values keep that piece in demo mode, independently of the others. **Only public or publishable values go in this file; it is served to every visitor.** Secrets go in Supabase function env (`supabase secrets set`) or in the Supabase / Google dashboards.

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

Every integration is optional and independent. Fill [`config.js`](config.js) one piece at a time; anything left empty stays in demo mode.

**Google sign-in**

Sign-in uses Google's own "Continue with Google" button. Clicking it opens Google's account chooser on accounts.google.com, which returns an ID token signed by Google.

1. Google Cloud Console → **Google Auth Platform** → Clients → Create client → **Web application**.
2. Authorized JavaScript origins: `http://localhost`, `http://localhost:8131` and `https://rolvo.market` and `https://www.rolvo.market`. No redirect URI is needed. Copy the client ID (the secret is only for Supabase, step 5).
3. Paste the client ID into `googleClientId`. The button now works, but the token is only checked in the browser. That's fine for a prototype; it isn't proof of identity for orders or money.
4. **Audience:** while the app is in Testing, only listed test users can sign in. Click **Publish app** to open it to everyone. It only asks for name, email and picture (non-sensitive scopes), so Google doesn't need to review it.
5. **Branding:** set the home page `https://rolvo.market/`, privacy policy `https://rolvo.market/privacy/`, terms `https://rolvo.market/terms/`, and authorized domain `rolvo.market` (verify it in Google Search Console). Brand verification then shows the Rolvo name and logo on Google's screen.
6. **Server-checked sessions:** with `supabaseUrl` and `supabaseKey` also set, each Google token goes to Supabase (`signInWithIdToken`), which checks Google's signature, our client ID and a one-time nonce before opening a session. In Supabase → Authentication → Sign In / Providers → Google, enable it and paste the same client ID and its secret. Google's screen then names rolvo.market, not supabase.co.

Google sign-in is free and doesn't use Google Cloud credits or need billing.

**Email and phone codes (Supabase Auth)**

1. Create a Supabase project. Set `supabaseUrl` and `supabaseKey` (the publishable key). Free projects pause after a week without traffic; use a paid plan once real users depend on it.
2. Email (live now):
   - **SMTP** (Authentication → Emails → SMTP Settings): the built-in sender only reaches your own team at 2 emails an hour, so custom SMTP is required. Today it's Gmail: host `smtp.gmail.com`, port 465, username and sender = the Gmail address, password = a Gmail app password (myaccount.google.com/apppasswords, needs 2-Step Verification), sender name `Rolvo Market`. Gmail allows about 500 emails a day. Supabase then caps auth email at 30 an hour; raise it in Authentication → Rate Limits.
   - **Templates** (Authentication → Emails → Templates): new users get **Confirm sign up**, returning users get **Magic link**. Both show the code with `{{ .Token }}`; no link needed.
   - **Code length**: Authentication → Sign In / Providers → Email → Email OTP Length is set to 6. It must equal `codeLength` in `config.js`; new projects may default to 8.
   - Supabase allows one code per address every 60 seconds, so the sheet's Resend button waits 60 seconds when live.
3. Phone: enable the Phone provider and connect an SMS provider (Twilio, MessageBird or Vonage).
   Live, the email and phone tabs stay hidden until `emailCodes` / `smsCodes` are `true` in `config.js`. Supabase's built-in mailer only delivers to your own team, so email codes also need custom SMTP. Until then the sign-in sheet shows Google only.
4. Add `https://rolvo.market/` to Authentication → URL Configuration → Redirect URLs.

**Accounts in the database**

Run [`server/market.sql`](server/market.sql) once in the Supabase SQL editor. From then on:

- Every sign-up gets a row in `market_profiles` (email, phone, name, avatar, sign-in methods, role, company, onboarding answers, verified flag). Every sign-in adds a row to `market_logins`.
- After Supabase Auth succeeds the site calls the `market_enter` function (`Cloud` in [`auth.js`](auth.js)). The database sets the side on first sign-in (client or creator), refuses an account on the wrong site, and never grants admin.
- Onboarding answers and profile edits are pushed to the signed-in account's row. People can only edit their own descriptive fields; role, verification, email and phone change only through the SQL functions.
- Make yourself an admin by hand after your first sign-in: `update market_profiles set role = 'admin' where email = 'you@example.com';` and add the same address to `adminEmails` in config.js.
- If the SQL hasn't been run, sign-in still works and a console warning says accounts aren't being stored.

**Chats (Supabase tables + Realtime)**

`market.sql` Part 3 adds `market_chats` (one per project) and `market_messages`. Signed in on the live site, starting a project creates the chat in the database and both sides read the same rows; `chat.js` listens through Realtime, with a slow poll behind it.

- Nobody writes the tables directly. Opening a chat, sending and marking read go through SQL functions that check the caller; row-level security lets only the two sides and admins read.
- A chat with a creator who has no account is stored with no creator attached. The client sees "Saved · not delivered yet"; nothing claims an invite was sent.
- Claiming a crawled profile (`r_…`) proves nothing, so its chats reach an account only after an admin presses **Confirm** in Admin → Creators → Creator accounts (`market_confirm_creator`). A creator who applied on the site (`c_…`) is linked without that step.
- If Part 3 hasn't been run, or in demo mode, conversations stay in the browser as before, and live they carry a line saying the other side can't see them.

Orders (terms, deliveries, escrow) and creator approval are still browser-only (see below).

**Payments and payouts (Stripe + Stripe Connect)**

How the money moves:

1. The client pays the deposit or balance **plus the card processing fee** (2.9% + $0.30, grossed up so the order amount arrives whole). It lands in the platform's Stripe balance, tagged with the order id. That balance is the escrow.
2. A release (first cut passed, final approved) is a Stripe **Transfer** to the creator's connected account, minus the 1% commission.
3. Each creator has a Stripe Connect **Express** account. Stripe's hosted page collects their identity and bank account or debit card. Their payout schedule is manual, so the money waits in their Stripe balance until they press Withdraw in the Wallet. Standard payouts are free to the creator; instant payouts cost them 1%.

What Stripe charges the platform, to check against [stripe.com/connect/pricing](https://stripe.com/connect/pricing): $2 per creator per month in which they're paid out, plus 0.25% + $0.25 per payout. At a 1% commission this is covered on orders above roughly $400; below that the platform loses a little on each one. The numbers live in `FEES` (`store.js`) and the function's `COMMISSION_PCT`, `CARD_FEE_PCT`, `CARD_FEE_FIXED` env.

PayPal checkout still exists but only appears when `paypalClientId` is set. Leave it empty: PayPal money can't be paid out through Stripe Connect.

Stripe setup, done by whoever legally owns the account (in the US an individual needs an SSN or ITIN):

- Create the account at stripe.com; test mode needs no verification. Turn on Connect and choose Express accounts.
- In Connect settings, set the instant payout fee creators pay (1%) if you want it collected by Stripe.
- Non-US creators are onboarded as cross-border "recipient" accounts. Which countries Stripe supports changes; Stripe returns an error for the rest, and those creators need another route.

Card numbers never touch Rolvo: Stripe's Payment Element and PayPal's buttons collect them. The server part is one Supabase Edge Function, [`server/functions/payments`](server/functions/payments/index.ts).

1. Run [`server/market.sql`](server/market.sql) in the Supabase SQL editor.
2. Deploy the function:
   ```bash
   supabase functions deploy payments --no-verify-jwt
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... ALLOWED_ORIGIN=https://rolvo.market
   ```
3. In config.js set `stripePk` (`pk_test_...`) and `paymentsUrl` (`https://<ref>.supabase.co/functions/v1/payments`). Supabase sign-in must be live too: payouts identify the creator by their session.
4. In Stripe → Developers → Webhooks, point `payment_intent.succeeded` at the same URL.
5. Test with Stripe card `4242 4242 4242 4242`. For payouts, onboard a test creator with Stripe's test identity values and the test debit card `4000 0566 5566 5556`.

**Before real money**

- The function trusts the amount from the browser only in test/sandbox mode. It refuses `sk_live_` keys and `PAYPAL_ENV=live` until orders are written to `market_orders` and `ORDERS_IN_DB=true`, so amounts come from the server.
- The Stripe Connect code (onboarding, balance, withdraw, release) has been written but **never run against Stripe**; expect fixes on first test. `connect_release` trusts the browser and is test-mode only. Real releases need order state changes to run on the server.
- A client and a creator on two different devices can't share an order yet, because orders live in each browser. This blocks real payments more than anything else.
- Accounts (sign-ups, sign-ins, onboarding answers) are stored in Supabase once it's configured. Orders, chats, deliveries and the ledger still live in the browser. Moving the rest of `store.js` onto Supabase tables is the next step; each method maps onto one table or RPC.

## What's not done

In rough priority order. Each item says where the work goes.

**1. A real backend (blocks almost everything else)**
- [ ] Create a Supabase project (the old one, `wbbzlaeqzfrffooqenvs`, no longer exists). Paid plan once real users depend on it; free projects pause after a week idle.
- [ ] Move `store.js` from `localStorage` to Supabase tables with row-level security: creators, orders, messages, deliveries, payments, ledger, reviews, breaks, discovered. Keep the `DB` method names; swap their bodies for queries/RPCs. Today **each browser has its own data**, so a teammate can't see an order you created.
- [ ] Move uploaded cuts from IndexedDB to Supabase Storage (or Mux / Cloudflare Stream) with signed, expiring URLs.
- [x] Chats in Supabase with Realtime (`chat.js`, `market.sql` Part 3). Left: run it against the live project with two accounts; an admin view of chats waiting on creators who haven't joined; email notice for a new message.
- [x] Order forms inside the chat (`market.sql` Part 4): name, kind, price, payment method; accept, decline, change, withdraw, state kept by the database. The + next to the message box opens a tray of tools. Left: paying an accepted form (wallet, card, PayPal), and deliveries for database chats.
- [x] Rolvo Wallet for clients (`market.sql` Part 5, `Wallet` in `pay.js`): the balance is the sum of ledger rows, the database takes the payment for an accepted order form, and an optional add-funds step closes client onboarding. Runs in **demo mode** (pretend funds, labelled everywhere) until payments are connected.
- [ ] Real money in the wallet. Needs: a Stripe account; `stripePk` (pk_test_… first) and `paymentsUrl` in `config.js`; the payments function deployed with `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and its webhook URL registered at Stripe for `payment_intent.succeeded`; then `update market_settings set value = 'test' where key = 'wallet_mode';`. The `wallet_topup` action and its webhook branch are written but have never run against Stripe, and refuse live keys. Before `live`: money-transmission / stored-value legal review, refunds and withdrawals of unspent balance, and releasing a paid order to the creator (deliveries for database chats don't exist yet).
- [ ] PayPal and card payment of an order form outside demo mode (PayPal needs a client id and secret; both need the amount read from the order form on the server).
- [ ] Admin rights from a server-side role, not `CONFIG.adminEmails` (anyone can read and edit that list in the browser).

**1b. Matching and the creator side of the market**
- [ ] Client briefs that creators can see and answer. Needs a `briefs` table first (data is per browser today), a weekly cap on outreach, and new copy for the creator landing page, which says clients don't post jobs.
- [ ] Better reading of a reference: a server function that sends frames to a vision model and returns kind, look and a one-line description. Today's in-browser model only compares how frames look.
- [ ] Read references from Instagram, TikTok and Vimeo (needs a server to fetch a still).
- [ ] Test Match a reference on phones; the first use downloads about 45 MB.

**2. Sign-in**
- [ ] Paste the Google client ID into `googleClientId` and test Google's popup on localhost and rolvo.market.
- [ ] Google Cloud: publish the app; add home page, privacy and terms URLs; verify `rolvo.market` in Search Console; submit brand verification.
- [ ] Supabase Auth: SMS provider (Twilio or similar). Google, the email code templates and custom SMTP are done.
- [ ] Move email codes off Gmail to a sender on rolvo.market (e.g. Resend, `noreply@rolvo.market`) once the domain is active.

**3. Payments**
- [ ] Deploy `server/functions/payments`, set Stripe and PayPal **test** keys, add the Stripe webhook, run a full test order.
- [ ] Compute amounts on the server from `market_orders` (`ORDERS_IN_DB=true`). Until then the function refuses live keys.
- [ ] Real refunds through Stripe / PayPal (today a refund is a ledger entry).
- [ ] Creator payouts: first test run of the Stripe Connect flow in test mode; server-side releases; refunds through Stripe (today a refund is only a ledger entry); a route for creators in countries Stripe can't pay; tax forms.
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
- [x] Own domain: `rolvo.market`, registered at Cloudflare. DNS points to GitHub Pages and the `CNAME` file is in this repo. The origin also has to be listed in Google Cloud and Supabase.
- [ ] Legal review of privacy and terms. They're a first draft.

## Pull requests

`main` is protected: changes go through a pull request, the **check** workflow must pass, and one approval is needed. Merging deploys immediately. (The repo owner can still push directly in an emergency.)

**Three things run on every PR**

| Workflow | What it does | Needs |
| --- | --- | --- |
| [`check`](.github/workflows/check.yml) | `node scripts/check.mjs`: every page's scripts compile **together** (catches a duplicate top-level name across files, which silently breaks the page); the Deno function parses; no secret keys (Stripe, Google client secret, Supabase secret / service role, private keys); no `.DS_Store` or absolute local paths. **Required to merge.** | Nothing |
| [`claude-review`](.github/workflows/claude-review.yml) | Claude reads `AGENTS.md` and the diff, leaves inline comments on real problems (bugs, escrow/payment logic, secrets, global-name clashes, missing demo paths, mobile breakage) and one summary comment. Re-runs on each push; skips drafts. Advisory, not required. | Repo secret |
| [`claude`](.github/workflows/claude.yml) | Mention `@claude` in a PR or issue comment to ask a question or request a change. Claude works on the PR branch (never `main`) and runs the checks before committing. Only the owner and collaborators can trigger it. | Repo secret |

**Turning on the Claude workflows:** add one repository secret in GitHub → Settings → Secrets and variables → Actions:
- `ANTHROPIC_API_KEY`: an API key from console.anthropic.com (billed per use), **or**
- `CLAUDE_CODE_OAUTH_TOKEN`: run `claude setup-token` locally to use a Claude subscription instead.

Until a secret exists, both Claude jobs skip themselves with a notice, and PRs still merge on **check** alone.

**Before opening a PR**
- Run `node scripts/check.mjs`.
- For UI changes, run the site locally and click through the flow you touched at desktop and phone width (the checks don't open a browser). Say in the PR what you tested.
- To join, ask the repo owner to add you under Settings → Collaborators.

## Code map

| File | Role |
| --- | --- |
| `config.js` | Keys and live/demo switches |
| `store.js` | Data layer: identities, orders, escrow state machine, ledger, payments, invites |
| `auth.js` | Google / email / phone sign-in: Google's own button (ID token, verified by Supabase when set), Supabase codes, or demo |
| `pay.js` | Checkout sheet: Stripe Payment Element or PayPal Buttons, or demo |
| `chat.js` | Chats in the database: sync, send, Realtime, read receipts; falls back to the browser when the tables aren't there |
| `ui.js` | Shared UI: `h()`, router, header and footer, sheets, covers, video player, chat and order card, watermarked preview |
| `merchant.js` · `creator.js` · `admin.js` | The three sites |
| `voice.js` | "Talk it through" voice answers for onboarding (Web Speech API) |
| `seed.js` · `creators.js` | Taxonomy, styles and demo clients · generated creator data (don't edit by hand) |
| `embeds.js` | Generated image fingerprints of every film, loaded only by Match a reference (don't edit by hand) |
| `privacy/` · `terms/` | Legal pages (contact from `supportEmail`) |
| `server/` | Payments Edge Function and SQL |
| `tools/` | Pipeline that rebuilds `creators.js`; `embed.mjs` rebuilds `embeds.js` |
| `scripts/check.mjs` | Repo checks |

