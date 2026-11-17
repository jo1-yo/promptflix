-- Promptflix Market — tables the payments function reads and writes. Run in the Supabase SQL editor.
-- The prototype keeps orders in the browser; set ORDERS_IN_DB=true only after the app writes orders here.
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
create policy "own orders" on market_orders for select using (client_id = auth.uid());
create policy "own payments" on market_payments for select using (exists (select 1 from market_orders o where o.id = order_id and o.client_id = auth.uid()));
