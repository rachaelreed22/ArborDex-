-- ArborTag Homeowner Edition foundational schema
-- Run in Supabase SQL editor

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.homeowner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'gardener', 'estate')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.homeowner_plants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  species text,
  room_or_bed text,
  photos text[] not null default '{}',
  last_diagnostics jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homeowner_plants_max_5_photos check (cardinality(photos) <= 5)
);

create index if not exists idx_homeowner_profiles_user_id on public.homeowner_profiles(user_id);
create index if not exists idx_homeowner_plants_user_id on public.homeowner_plants(user_id);

alter table public.homeowner_profiles enable row level security;
alter table public.homeowner_plants enable row level security;

-- Profiles: user can only view/update/insert their own row
create policy homeowner_profiles_select_own
on public.homeowner_profiles
for select
using (auth.uid() = user_id);

create policy homeowner_profiles_insert_own
on public.homeowner_profiles
for insert
with check (auth.uid() = user_id);

create policy homeowner_profiles_update_own
on public.homeowner_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy homeowner_profiles_delete_own
on public.homeowner_profiles
for delete
using (auth.uid() = user_id);

-- Plants: user can only manage their own plants
create policy homeowner_plants_select_own
on public.homeowner_plants
for select
using (auth.uid() = user_id);

create policy homeowner_plants_insert_own
on public.homeowner_plants
for insert
with check (auth.uid() = user_id);

create policy homeowner_plants_update_own
on public.homeowner_plants
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy homeowner_plants_delete_own
on public.homeowner_plants
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_homeowner_profiles_updated_at on public.homeowner_profiles;
create trigger trg_homeowner_profiles_updated_at
before update on public.homeowner_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_homeowner_plants_updated_at on public.homeowner_plants;
create trigger trg_homeowner_plants_updated_at
before update on public.homeowner_plants
for each row execute function public.set_updated_at();
