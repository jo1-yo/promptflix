-- Promptflix database setup.
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run once on a new project.

-- Admins (the Promptflix team) can read hire requests and creator emails.
create table public.admins (user_id uuid primary key references auth.users on delete cascade);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create policy "admins see themselves" on public.admins for select using (user_id = auth.uid());

-- Public creator profiles.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 300),
  rate integer check (rate is null or rate >= 0),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles are public" on public.profiles for select using (true);
create policy "own profile insert" on public.profiles for insert with check (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

-- Creator emails: private, only the owner and admins can read.
create table public.contacts (
  id uuid primary key references auth.users on delete cascade,
  email text not null
);
alter table public.contacts enable row level security;
create policy "own or admin read contact" on public.contacts for select using (id = auth.uid() or public.is_admin());
create policy "own contact insert" on public.contacts for insert with check (id = auth.uid());
create policy "own contact update" on public.contacts for update using (id = auth.uid());

-- Videos (files live in the "videos" storage bucket).
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 60),
  tool text not null default 'Other' check (char_length(tool) <= 20),
  duration real not null default 0,
  path text not null,
  created_at timestamptz not null default now()
);
alter table public.videos enable row level security;
create policy "videos are public" on public.videos for select using (true);
create policy "own video insert" on public.videos for insert with check (owner = auth.uid());
create policy "own video delete" on public.videos for delete using (owner = auth.uid() or public.is_admin());

-- Hire requests: anyone can send one (no sign-up needed), only admins can read.
create table public.hire_requests (
  id uuid primary key default gen_random_uuid(),
  creator uuid references auth.users on delete set null,
  what text not null check (char_length(what) between 1 and 1500),
  budget integer check (budget is null or budget >= 0),
  email text not null check (char_length(email) between 3 and 120),
  created_at timestamptz not null default now()
);
alter table public.hire_requests enable row level security;
create policy "anyone can send a request" on public.hire_requests for insert to anon, authenticated with check (true);
create policy "admins read requests" on public.hire_requests for select using (public.is_admin());

-- Storage bucket for video files: public to watch, each user uploads only into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4','video/quicktime','video/webm']);
create policy "upload into own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own files" on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
