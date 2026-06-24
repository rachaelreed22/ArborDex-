-- Homeowner QR + journal enhancements
-- Run in Supabase SQL editor after create_homeowner_tables.sql

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

alter table if exists public.homeowner_plants
  add column if not exists qr_code_token text,
  add column if not exists bed_number integer,
  add column if not exists row_section_id text;

create unique index if not exists idx_homeowner_plants_qr_code_token
  on public.homeowner_plants(qr_code_token)
  where qr_code_token is not null;

update public.homeowner_plants
set qr_code_token = encode(gen_random_bytes(12), 'hex')
where qr_code_token is null;

create table if not exists public.homeowner_plant_journal_entries (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.homeowner_plants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_homeowner_journal_plant_id
  on public.homeowner_plant_journal_entries(plant_id);

create index if not exists idx_homeowner_journal_user_id
  on public.homeowner_plant_journal_entries(user_id);

alter table public.homeowner_plant_journal_entries enable row level security;

drop policy if exists homeowner_journal_select_own on public.homeowner_plant_journal_entries;
create policy homeowner_journal_select_own
on public.homeowner_plant_journal_entries
for select
using (auth.uid() = user_id);

drop policy if exists homeowner_journal_insert_own on public.homeowner_plant_journal_entries;
create policy homeowner_journal_insert_own
on public.homeowner_plant_journal_entries
for insert
with check (auth.uid() = user_id);

drop policy if exists homeowner_journal_update_own on public.homeowner_plant_journal_entries;
create policy homeowner_journal_update_own
on public.homeowner_plant_journal_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists homeowner_journal_delete_own on public.homeowner_plant_journal_entries;
create policy homeowner_journal_delete_own
on public.homeowner_plant_journal_entries
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_homeowner_journal_updated_at on public.homeowner_plant_journal_entries;
create trigger trg_homeowner_journal_updated_at
before update on public.homeowner_plant_journal_entries
for each row execute function public.set_updated_at();
