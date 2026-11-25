-- Rolvo Market — database. Run the whole file once in the Supabase SQL editor (safe to run again).
--
-- Part 1 · Accounts. Every sign-up (Google, email code, phone code) gets a row in market_profiles; every sign-in a row in
-- market_logins. The site calls market_enter() right after Supabase Auth succeeds (see auth.js → Cloud).
-- Part 2 · Orders and payments, used by the payments function. The prototype still keeps orders in the browser.
--
-- Make yourself an admin after your first sign-in on the admin site (it will refuse you until you do):
--   update market_profiles set role = 'admin' where email = 'you@example.com';

-- ───────────────────────── Part 1 · Accounts ─────────────────────────
create table if not exists market_profiles (
  id uuid primary key references auth.users on delete cascade,
  role text check (role in ('client','creator','admin')),   -- the side the account joined first (set by market_enter); admin only by hand
  email text,
  phone text,
  name text,
  avatar_url text,
  providers text[] not null default '{}',                   -- google | email | phone, every method this account has used
  org text,                                                 -- client: company
  onboarded boolean not null default false,                 -- client: finished the intake; creator: application filled in
  verified boolean not null default false,                  -- set by an admin (market_set_verified)
  profile jsonb not null default '{}',                      -- client: intake answers; creator: handle, tools, categories, ask…
  local_id text,                                            -- id of this account in the browser store / creators.js
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);
-- Creator payouts (Stripe Connect). Written only by the payments function; the bank and card details themselves live at Stripe.
alter table market_profiles add column if not exists stripe_account text;          -- acct_…
alter table market_profiles add column if not exists payout_country text;
alter table market_profiles add column if not exists payouts_ready boolean not null default false;
-- One login can be on both sides. is_client / is_creator say which sides the account has entered. The client side keeps
-- org / onboarded / profile / local_id; the creator side has its own three columns, so neither overwrites the other.
alter table market_profiles add column if not exists is_client boolean not null default false;
alter table market_profiles add column if not exists is_creator boolean not null default false;
alter table market_profiles add column if not exists creator_onboarded boolean not null default false;   -- application filled in
alter table market_profiles add column if not exists creator_profile jsonb not null default '{}';        -- handle, tools, categories, ask…
alter table market_profiles add column if not exists creator_local_id text;                               -- id in the browser store / creators.js
-- Accounts made while an account was kept to one side. Safe to run again: each row moves once.
update market_profiles set is_client = true where role = 'client' and not is_client;
update market_profiles
   set is_creator = true, creator_onboarded = onboarded, creator_profile = profile, creator_local_id = local_id,
       onboarded = false, profile = '{}', local_id = null
 where role = 'creator' and not is_creator;
create index if not exists market_profiles_email on market_profiles (email);
create index if not exists market_profiles_local on market_profiles (local_id);
create index if not exists market_profiles_role on market_profiles (role);

create table if not exists market_logins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  app text not null check (app in ('merchant','creator','admin')),
  provider text not null,
  at timestamptz not null default now()
);
create index if not exists market_logins_user on market_logins (user_id, at desc);

-- A row for every new auth user, filled from what the provider shared.
create or replace function market_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.market_profiles (id, email, phone, name, avatar_url)
  values (new.id, lower(new.email), new.phone,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists market_new_user on auth.users;
create trigger market_new_user after insert on auth.users for each row execute function market_new_user();

create or replace function market_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists market_touch on market_profiles;
create trigger market_touch before update on market_profiles for each row execute function market_touch();

create or replace function market_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.market_profiles where id = auth.uid() and role = 'admin')
$$;

-- Called by the site after every sign-in. Signing in on the client site adds the client side to the account, on the creator
-- site the creator side; one login can have both. An admin login stays off the public sites, and nobody becomes an admin
-- through this function.
create or replace function market_enter(p_app text, p_via text default 'email') returns market_profiles
language plpgsql security definer set search_path = public as $$
declare
  p public.market_profiles;
  want text;
  via text := case when p_via in ('google','email','phone') then p_via else 'email' end;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_app not in ('merchant','creator','admin') then raise exception 'unknown app'; end if;
  insert into public.market_profiles (id, email, phone, name, avatar_url)   -- accounts created before this file was run
    select u.id, lower(u.email), u.phone,
           coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
           coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
    from auth.users u where u.id = auth.uid()
    on conflict (id) do nothing;
  select * into p from public.market_profiles where id = auth.uid() for update;
  want := case p_app when 'merchant' then 'client' when 'creator' then 'creator' else 'admin' end;
  -- Only the admin console is limited. An admin's own email may also be a client or a creator on the public sites.
  if want = 'admin' and p.role is distinct from 'admin' then raise exception 'wrong_side:%', coalesce(p.role, 'none'); end if;
  if p.role is null then p.role := want; end if;
  update public.market_profiles m
     set role = p.role, last_login_at = now(),
         is_client = m.is_client or p_app = 'merchant',
         is_creator = m.is_creator or p_app = 'creator',
         email = coalesce((select lower(u.email) from auth.users u where u.id = m.id), m.email),
         phone = coalesce((select u.phone from auth.users u where u.id = m.id), m.phone),
         providers = case when via = any (m.providers) then m.providers else m.providers || via end
   where m.id = p.id
   returning m.* into p;
  insert into public.market_logins (user_id, app, provider) values (p.id, p_app, via);
  return p;
end $$;

create or replace function market_set_verified(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.market_is_admin() then raise exception 'admins only'; end if;
  update public.market_profiles set verified = p_on where id = p_user;
end $$;

alter table market_profiles enable row level security;
alter table market_logins enable row level security;
drop policy if exists "own profile or admin" on market_profiles;
create policy "own profile or admin" on market_profiles for select using (id = auth.uid() or market_is_admin());
drop policy if exists "edit own profile" on market_profiles;
create policy "edit own profile" on market_profiles for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "own logins or admin" on market_logins;
create policy "own logins or admin" on market_logins for select using (user_id = auth.uid() or market_is_admin());

-- People edit only their own descriptive fields. Role, verification, email, phone and sign-in history change through the functions above.
revoke all on market_profiles, market_logins from anon, authenticated;
grant select on market_profiles, market_logins to authenticated;
grant update (name, avatar_url, org, onboarded, profile, local_id, creator_onboarded, creator_profile, creator_local_id) on market_profiles to authenticated;
revoke all on function market_enter(text, text), market_set_verified(uuid, boolean), market_is_admin(), market_new_user(), market_touch() from public, anon;
grant execute on function market_enter(text, text), market_set_verified(uuid, boolean), market_is_admin() to authenticated;

-- ───────────────────── Part 2 · Orders and payments ─────────────────────
-- Set ORDERS_IN_DB=true on the payments function only after the app writes orders here.
create table if not exists market_orders (
  id text primary key,
  client_id uuid references auth.users,
  creator_id text not null,
  title text not null,
  price integer not null check (price > 0),
  deposit_pct integer not null default 30 check (deposit_pct between 0 and 100),
  revisions integer not null default 3,
  status text not null default 'negotiating',
  created_at timestamptz not null default now()
);
create table if not exists market_payments (
  id bigint generated always as identity primary key,
  order_id text not null,
  kind text not null check (kind in ('deposit','balance','refund','release')),
  amount numeric(10,2) not null,
  method text not null check (method in ('card','paypal')),
  ref text unique not null,          -- Stripe PaymentIntent id / PayPal capture id
  mode text not null,                -- test | live
  status text not null,
  created_at timestamptz not null default now()
);
alter table market_orders enable row level security;
alter table market_payments enable row level security;
-- Clients read their own orders and payments; writes go through the service role (the payments function).
drop policy if exists "own orders" on market_orders;
create policy "own orders" on market_orders for select using (client_id = auth.uid());
drop policy if exists "own payments" on market_payments;
create policy "own payments" on market_payments for select using (exists (select 1 from market_orders o where o.id = order_id and o.client_id = auth.uid()));
