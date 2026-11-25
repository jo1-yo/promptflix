-- Rolvo — Connect to your AI. Run the whole file once in the Supabase SQL editor, after market.sql (safe to run again).
--
-- A signed-in client makes one personal key on rolvo.market/#/connect. Their agent sends it with every call to the
-- Worker (server/mcp/worker.js), which asks market_agent_use() whose key it is. Only a hash of the key is stored, so
-- the address is shown once; making a new key turns the old one off. Every tool call is kept in market_agent_calls.

create table if not exists market_agent_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  key_hash text not null unique,                 -- sha256 of the key, hex
  hint text not null,                            -- last 4 characters, to tell keys apart on screen
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists market_agent_keys_user on market_agent_keys (user_id) where revoked_at is null;

create table if not exists market_agent_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  key_id uuid references market_agent_keys on delete set null,
  tool text not null,                            -- search_creators | get_creator | list_categories
  args jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists market_agent_calls_user on market_agent_calls (user_id, at desc);

-- Make (or replace) the caller's key. Returns the key itself, once.
create or replace function market_agent_key_create() returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update market_agent_keys set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
  k := 'rolvo_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into market_agent_keys (user_id, key_hash, hint) values (auth.uid(), encode(sha256(convert_to(k, 'UTF8')), 'hex'), right(k, 4));
  return k;
end $$;

-- Turn the caller's key off.
create or replace function market_agent_key_revoke() returns void
language sql security definer set search_path = public as $$
  update market_agent_keys set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
$$;

-- Called by the Worker with the publishable key. Returns the account the key belongs to, or null.
-- With p_tool set, the call is recorded. Guessing is not practical: a key carries 244 random bits.
create or replace function market_agent_use(p_key text, p_tool text default null, p_args jsonb default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare r market_agent_keys;
begin
  select * into r from market_agent_keys where key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex') and revoked_at is null;
  if not found then return null; end if;
  update market_agent_keys set last_used_at = now() where id = r.id;
  if p_tool is not null then
    insert into market_agent_calls (user_id, key_id, tool, args) values (r.user_id, r.id, left(p_tool, 40), coalesce(p_args, '{}'));
  end if;
  return r.user_id;
end $$;

alter table market_agent_keys enable row level security;
alter table market_agent_calls enable row level security;
drop policy if exists "own agent keys or admin" on market_agent_keys;
create policy "own agent keys or admin" on market_agent_keys for select using (user_id = auth.uid() or market_is_admin());
drop policy if exists "own agent calls or admin" on market_agent_calls;
create policy "own agent calls or admin" on market_agent_calls for select using (user_id = auth.uid() or market_is_admin());

revoke all on market_agent_keys, market_agent_calls from anon, authenticated;
grant select (id, user_id, hint, created_at, last_used_at, revoked_at) on market_agent_keys to authenticated;   -- never the hash
grant select on market_agent_calls to authenticated;
revoke all on function market_agent_key_create(), market_agent_key_revoke(), market_agent_use(text, text, jsonb) from public;
grant execute on function market_agent_key_create(), market_agent_key_revoke() to authenticated;
grant execute on function market_agent_use(text, text, jsonb) to anon, authenticated;
