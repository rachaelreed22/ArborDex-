-- Homeowner Garden Companion (garden-level ArborAI)
-- Run in Supabase SQL editor after existing homeowner migrations.

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

alter table if exists public.homeowner_profiles
  add column if not exists garden_name text;

create table if not exists public.homeowner_garden_companion_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_homeowner_garden_companion_messages_user_id
  on public.homeowner_garden_companion_messages(user_id);

create index if not exists idx_homeowner_garden_companion_messages_created_at
  on public.homeowner_garden_companion_messages(user_id, created_at);

alter table public.homeowner_garden_companion_messages enable row level security;

drop policy if exists homeowner_garden_companion_messages_select_own on public.homeowner_garden_companion_messages;
create policy homeowner_garden_companion_messages_select_own
on public.homeowner_garden_companion_messages
for select
using (auth.uid() = user_id);

drop policy if exists homeowner_garden_companion_messages_insert_own on public.homeowner_garden_companion_messages;
create policy homeowner_garden_companion_messages_insert_own
on public.homeowner_garden_companion_messages
for insert
with check (auth.uid() = user_id);

drop policy if exists homeowner_garden_companion_messages_update_own on public.homeowner_garden_companion_messages;
create policy homeowner_garden_companion_messages_update_own
on public.homeowner_garden_companion_messages
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists homeowner_garden_companion_messages_delete_own on public.homeowner_garden_companion_messages;
create policy homeowner_garden_companion_messages_delete_own
on public.homeowner_garden_companion_messages
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_homeowner_garden_companion_messages_updated_at on public.homeowner_garden_companion_messages;
create trigger trg_homeowner_garden_companion_messages_updated_at
before update on public.homeowner_garden_companion_messages
for each row execute function public.set_updated_at();
