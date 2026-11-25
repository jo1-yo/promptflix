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

create or replace function market_touch() returns trigger language plpgsql as $$
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

-- ───────────────────── Part 3 · Chats (real messages) ─────────────────────
-- A chat is one project between a client and a creator. Both sides read it from here, so a message sent on one device shows
-- up on the other (the site listens through Supabase Realtime). Nobody writes these tables directly: every write goes through
-- the functions below, which check who is calling.
--
-- creator_key is the creator's id on the site (creators.js: r_…; a creator who applied: c_…). A chat opened with a creator who
-- has no account yet keeps creator_id empty: the messages are stored and nobody else can read them. The chat is handed to an
-- account only once market_profiles.creator_key says that account speaks for that profile. For crawled profiles (r_…) only an
-- admin can say so (market_confirm_creator): clicking "claim" on the site proves nothing by itself.
alter table market_profiles add column if not exists creator_key text;
create unique index if not exists market_profiles_creator_key on market_profiles (creator_key) where creator_key is not null;

create table if not exists market_chats (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users on delete cascade,
  creator_key text not null,
  creator_id uuid references auth.users on delete set null,   -- empty until that creator has a confirmed account
  creator_name text,                                           -- as shown on the site when the chat was opened
  title text not null,
  brief text,
  meta jsonb not null default '{}',                            -- category, style, the client's opening offer
  last_text text,
  last_side text,
  last_at timestamptz not null default now(),
  client_read_at timestamptz not null default now(),
  creator_read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists market_chats_client on market_chats (client_id, last_at desc);
create index if not exists market_chats_creator on market_chats (creator_id, last_at desc);
create index if not exists market_chats_waiting on market_chats (creator_key) where creator_id is null;

create table if not exists market_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,                              -- the order messages were written in
  chat_id uuid not null references market_chats on delete cascade,
  side text not null check (side in ('client','creator','system')),   -- who wrote it; one login can be on both sides, so the side is stored, not guessed
  sender uuid references auth.users on delete set null,
  kind text not null default 'text',
  body text not null default '',
  data jsonb,
  created_at timestamptz not null default clock_timestamp()   -- the real moment, so two messages written in one call keep their order
);
create index if not exists market_messages_chat on market_messages (chat_id, seq);

alter table market_chats enable row level security;
alter table market_messages enable row level security;
drop policy if exists "chat parties or admin" on market_chats;
create policy "chat parties or admin" on market_chats for select
  using (client_id = auth.uid() or creator_id = auth.uid() or market_is_admin());
drop policy if exists "messages of my chats or admin" on market_messages;
create policy "messages of my chats or admin" on market_messages for select
  using (exists (select 1 from market_chats c where c.id = chat_id and (c.client_id = auth.uid() or c.creator_id = auth.uid())) or market_is_admin());
revoke all on market_chats, market_messages from anon, authenticated;
grant select on market_chats, market_messages to authenticated;

-- Hands waiting chats to an account whose creator_key matches, and says so in each chat. Internal: not callable from the site.
create or replace function market_chat_bind(p_user uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare k text; nm text; n integer := 0; r record;
begin
  select creator_key, coalesce(nullif(name, ''), 'The creator') into k, nm from public.market_profiles where id = p_user;
  if k is null then return 0; end if;
  for r in update public.market_chats set creator_id = p_user where creator_id is null and creator_key = k returning id loop
    insert into public.market_messages (chat_id, side, kind, body) values (r.id, 'system', 'system', nm || ' joined Rolvo and can reply now.');
    update public.market_chats set last_at = clock_timestamp() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Called by the creator site after sign-in. A creator who applied on the site (id c_…, made in their own browser) speaks for
-- that id straight away. A crawled profile (r_…) waits for an admin. Returns the confirmed key and how many chats arrived.
create or replace function market_chat_link() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.market_profiles; n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into p from public.market_profiles where id = auth.uid() for update;
  if p.id is null then raise exception 'no account'; end if;
  if p.creator_key is null and p.is_creator and p.creator_local_id is not null and p.creator_local_id !~ '^r_'
     and not exists (select 1 from public.market_profiles o where o.id <> p.id and (o.creator_key = p.creator_local_id or o.creator_local_id = p.creator_local_id)) then
    update public.market_profiles set creator_key = p.creator_local_id where id = p.id;
    p.creator_key := p.creator_local_id;
  end if;
  n := public.market_chat_bind(p.id);
  return jsonb_build_object('key', p.creator_key, 'claimed', p.creator_local_id, 'linked', n);
end $$;

-- Admin: this account really is that creator profile (p_key), or p_key null to take it back. Chats already handed over stay.
create or replace function market_confirm_creator(p_user uuid, p_key text) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.market_is_admin() then raise exception 'admins only'; end if;
  if p_key is not null and exists (select 1 from public.market_profiles where creator_key = p_key and id <> p_user) then
    raise exception 'another account is already confirmed for this profile';
  end if;
  update public.market_profiles set creator_key = nullif(trim(p_key), '') where id = p_user;
  return public.market_chat_bind(p_user);
end $$;

-- A client opens a project with a creator.
create or replace function market_chat_open(p_creator_key text, p_creator_name text, p_title text, p_brief text, p_meta jsonb default '{}')
returns market_chats
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.market_chats; who uuid; mine text; cname text := left(coalesce(nullif(trim(p_creator_name), ''), 'the creator'), 80);
begin
  if me is null then raise exception 'not signed in'; end if;
  select coalesce(nullif(org, ''), nullif(name, ''), 'A client') into mine from public.market_profiles where id = me and is_client;
  if mine is null then raise exception 'client accounts only'; end if;
  if p_creator_key is null or length(p_creator_key) not between 2 and 80 then raise exception 'unknown creator'; end if;
  if length(trim(coalesce(p_title, ''))) not between 3 and 80 then raise exception 'the project needs a name'; end if;
  if (select count(*) from public.market_chats where client_id = me and created_at > now() - interval '1 day') >= 40 then
    raise exception 'too many new projects today';
  end if;
  select id into who from public.market_profiles where creator_key = p_creator_key;
  insert into public.market_chats (client_id, creator_key, creator_id, creator_name, title, brief, meta, last_text, last_side, creator_read_at)
    values (me, p_creator_key, who, cname, trim(p_title), left(p_brief, 4000), coalesce(p_meta, '{}'), left(p_brief, 200), 'client', null)
    returning * into c;
  insert into public.market_messages (chat_id, side, kind, body) values (c.id, 'system', 'system', mine || ' opened a project with ' || cname || '.');
  if who is null then
    insert into public.market_messages (chat_id, side, kind, body)
      values (c.id, 'system', 'system', cname || ' hasn''t joined Rolvo yet. Messages are saved here and delivered when they join.');
  end if;
  update public.market_chats set client_read_at = clock_timestamp(), last_at = clock_timestamp() where id = c.id returning * into c;
  return c;
end $$;

-- Send a message as one side of a chat.
create or replace function market_chat_send(p_chat uuid, p_side text, p_body text) returns market_messages
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.market_messages; t text := trim(coalesce(p_body, ''));
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_side not in ('client','creator') then raise exception 'unknown side'; end if;
  if not exists (select 1 from public.market_chats where id = p_chat and ((p_side = 'client' and client_id = me) or (p_side = 'creator' and creator_id = me))) then
    raise exception 'not your chat';
  end if;
  if length(t) not between 1 and 4000 then raise exception 'a message is 1 to 4000 characters'; end if;
  if (select count(*) from public.market_messages where sender = me and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'slow down a little';
  end if;
  insert into public.market_messages (chat_id, side, sender, kind, body) values (p_chat, p_side, me, 'text', t) returning * into m;
  update public.market_chats
     set last_text = left(t, 200), last_side = p_side, last_at = m.created_at,
         client_read_at = case when p_side = 'client' then m.created_at else client_read_at end,
         creator_read_at = case when p_side = 'creator' then m.created_at else creator_read_at end
   where id = p_chat;
  return m;
end $$;

-- "I've seen everything in this chat up to now."
create or replace function market_chat_read(p_chat uuid, p_side text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_side = 'client' then update public.market_chats set client_read_at = clock_timestamp() where id = p_chat and client_id = auth.uid();
  elsif p_side = 'creator' then update public.market_chats set creator_read_at = clock_timestamp() where id = p_chat and creator_id = auth.uid();
  end if;
end $$;

-- My chats on one side, newest first, each with the other person's public card and my unread count. 'admin' lists every chat.
create or replace function market_chats_mine(p_side text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); res jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_side not in ('client','creator','admin') then raise exception 'unknown side'; end if;
  if p_side = 'admin' and not public.market_is_admin() then raise exception 'admins only'; end if;
  select coalesce(jsonb_agg(x.j order by x.last_at desc), '[]'::jsonb) into res from (
    select c.last_at, jsonb_build_object(
      'id', c.id, 'creator_key', c.creator_key, 'creator_joined', c.creator_id is not null, 'title', c.title, 'brief', c.brief, 'meta', c.meta,
      'last_text', c.last_text, 'last_side', c.last_side, 'last_at', c.last_at, 'created_at', c.created_at,
      'client_read_at', c.client_read_at, 'creator_read_at', c.creator_read_at,
      'client', jsonb_build_object('id', c.client_id, 'name', cl.name, 'org', cl.org, 'avatar', cl.avatar_url, 'verified', cl.verified, 'website', cl.profile->>'website'),
      'creator', jsonb_build_object('name', coalesce(nullif(cr.name, ''), c.creator_name), 'avatar', cr.avatar_url),
      'unread', (select count(*) from public.market_messages m where m.chat_id = c.id and m.side <> p_side
                   and m.created_at > coalesce(case p_side when 'client' then c.client_read_at when 'creator' then c.creator_read_at end, '-infinity'::timestamptz))
    ) as j
    from public.market_chats c
    left join public.market_profiles cl on cl.id = c.client_id
    left join public.market_profiles cr on cr.id = c.creator_id
    where (p_side = 'client' and c.client_id = me) or (p_side = 'creator' and c.creator_id = me) or p_side = 'admin'
    order by c.last_at desc limit 300) x;
  return res;
end $$;

revoke all on function market_chat_bind(uuid), market_chat_link(), market_confirm_creator(uuid, text), market_chat_open(text, text, text, text, jsonb),
  market_chat_send(uuid, text, text), market_chat_read(uuid, text), market_chats_mine(text) from public, anon;
grant execute on function market_chat_link(), market_confirm_creator(uuid, text), market_chat_open(text, text, text, text, jsonb),
  market_chat_send(uuid, text, text), market_chat_read(uuid, text), market_chats_mine(text) to authenticated;

-- Realtime: the site hears about new messages and chat changes without reloading. Row-level security still decides who hears what.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'market_messages') then
      alter publication supabase_realtime add table public.market_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'market_chats') then
      alter publication supabase_realtime add table public.market_chats;
    end if;
  end if;
end $$;

-- ───────────────────── Part 4 · Order forms in chat ─────────────────────
-- An order form is a message (kind 'offer') either side can send: what is being made, its kind, the agreed price, and how the
-- client will pay (wallet | card | paypal). Its state lives in the message's data: pending → accepted | declined | withdrawn,
-- or superseded when a newer form replaces it. Only the other side can accept or decline; only the sender can withdraw.
create or replace function market_offer_send(p_chat uuid, p_side text, p_title text, p_kind text, p_price integer, p_method text)
returns market_messages
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.market_messages; t text := trim(coalesce(p_title, ''));
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_side not in ('client','creator') then raise exception 'unknown side'; end if;
  if not exists (select 1 from public.market_chats where id = p_chat and ((p_side = 'client' and client_id = me) or (p_side = 'creator' and creator_id = me))) then
    raise exception 'not your chat';
  end if;
  if length(t) not between 2 and 80 then raise exception 'the order needs a name'; end if;
  if p_price is null or p_price < 1 or p_price > 1000000 then raise exception 'the price is 1 to 1,000,000 dollars'; end if;
  if p_method not in ('wallet','card','paypal') then raise exception 'unknown payment method'; end if;
  if exists (select 1 from public.market_messages where chat_id = p_chat and kind = 'offer' and data->>'status' = 'accepted' and data->>'paid_at' is null) then
    raise exception 'an order form is already accepted in this chat';
  end if;
  update public.market_messages set data = data || '{"status":"superseded"}'::jsonb
   where chat_id = p_chat and kind = 'offer' and data->>'status' = 'pending';
  insert into public.market_messages (chat_id, side, sender, kind, body, data)
    values (p_chat, p_side, me, 'offer', 'Order form · ' || t || ' · $' || p_price,
            jsonb_build_object('title', t, 'kind', left(coalesce(p_kind, ''), 60), 'price', p_price, 'method', p_method, 'status', 'pending'))
    returning * into m;
  update public.market_chats
     set last_text = m.body, last_side = p_side, last_at = m.created_at,
         client_read_at = case when p_side = 'client' then m.created_at else client_read_at end,
         creator_read_at = case when p_side = 'creator' then m.created_at else creator_read_at end
   where id = p_chat;
  return m;
end $$;

-- p_answer: 'accept' or 'decline' (the side that received it), 'withdraw' (the side that sent it).
create or replace function market_offer_answer(p_msg uuid, p_side text, p_answer text) returns market_messages
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.market_messages; st text; who text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_side not in ('client','creator') then raise exception 'unknown side'; end if;
  select * into m from public.market_messages where id = p_msg and kind = 'offer' for update;
  if m.id is null then raise exception 'no such order form'; end if;
  if not exists (select 1 from public.market_chats where id = m.chat_id and ((p_side = 'client' and client_id = me) or (p_side = 'creator' and creator_id = me))) then
    raise exception 'not your chat';
  end if;
  if m.data->>'status' <> 'pending' then raise exception 'this order form is no longer open'; end if;
  if p_answer in ('accept','decline') and m.side = p_side then raise exception 'the other side answers an order form'; end if;
  if p_answer = 'withdraw' and m.side <> p_side then raise exception 'only the sender can withdraw'; end if;
  st := case p_answer when 'accept' then 'accepted' when 'decline' then 'declined' when 'withdraw' then 'withdrawn' else null end;
  if st is null then raise exception 'unknown answer'; end if;
  update public.market_messages set data = data || jsonb_build_object('status', st, 'answered_at', clock_timestamp()) where id = p_msg returning * into m;
  who := case p_side when 'client' then 'The client' else 'The creator' end;
  insert into public.market_messages (chat_id, side, kind, body)
    values (m.chat_id, 'system', 'system', who || ' ' || st || ' the order form: ' || (m.data->>'title') || ' · $' || (m.data->>'price') || '.');
  update public.market_chats set last_text = 'Order form ' || st, last_side = p_side, last_at = clock_timestamp() where id = m.chat_id;
  return m;
end $$;

revoke all on function market_offer_send(uuid, text, text, text, integer, text), market_offer_answer(uuid, text, text) from public, anon;
grant execute on function market_offer_send(uuid, text, text, text, integer, text), market_offer_answer(uuid, text, text) to authenticated;
