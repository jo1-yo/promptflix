# Promptflix

Swipe through AI-made videos. See one you love? Hire the creator.

Live: https://imjane.top/promptflix/

A single static `index.html` with no build step, deployed by GitHub Pages from `main`. The backend is Supabase (auth, database, video storage).

## Setup (one time)

1. Create a Supabase project, then open **SQL Editor** and run [`schema.sql`](schema.sql).
2. In **Authentication → URL Configuration**, set Site URL to `https://imjane.top/promptflix/` and add it to Redirect URLs.
3. Copy **Project URL** and **anon public key** (Project Settings → API) into `SUPABASE_URL` / `SUPABASE_ANON_KEY` at the top of the script in `index.html`.
4. Sign in on the site once, then make yourself an admin so you can see hire requests:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = '<your email>';
   ```

## How it works

- **Watch:** a vertical feed of every posted video. **Hire** opens a short request form, with no sign-up needed.
- **Me:** creators sign in with an email link, set their name, rate and bio, and post videos (up to 50 MB).
- Hire requests and creator emails are readable only by admins, who make the intro by email.
