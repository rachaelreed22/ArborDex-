-- Homeowner Observations foundation (Wave 1, additive)
-- Purpose: Store structured observations as first-class memory records.
-- Safe rollout: additive table only, no destructive changes.

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

create table if not exists public.homeowner_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Context links (all optional to allow broad capture scenarios)
  property_id uuid references public.homeowner_properties(id) on delete set null,
  space_id uuid references public.homeowner_spaces(id) on delete set null,
  garden_bed_id uuid references public.homeowner_garden_beds(id) on delete set null,
  plant_id uuid references public.homeowner_plants(id) on delete set null,
  journal_entry_id uuid references public.homeowner_plant_journal_entries(id) on delete set null,
  companion_message_id uuid references public.homeowner_garden_companion_messages(id) on delete set null,

  observation_type text not null,
  title text,
  details text not null,
  confidence text,
  source text,
  observed_at timestamptz not null default now(),
  photo_url text,
  tags text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint homeowner_observations_type_len check (char_length(observation_type) <= 80),
  constraint homeowner_observations_title_len check (title is null or char_length(title) <= 160),
  constraint homeowner_observations_details_len check (char_length(details) <= 8000),
  constraint homeowner_observations_confidence_allowed check (
    confidence is null
    or lower(confidence) in ('known', 'likely', 'possible', 'unknown')
  )
);

create index if not exists idx_homeowner_observations_user_id
  on public.homeowner_observations(user_id);

create index if not exists idx_homeowner_observations_observed_at
  on public.homeowner_observations(user_id, observed_at desc);

create index if not exists idx_homeowner_observations_property_id
  on public.homeowner_observations(property_id);

create index if not exists idx_homeowner_observations_space_id
  on public.homeowner_observations(space_id);

create index if not exists idx_homeowner_observations_garden_bed_id
  on public.homeowner_observations(garden_bed_id);

create index if not exists idx_homeowner_observations_plant_id
  on public.homeowner_observations(plant_id);

create index if not exists idx_homeowner_observations_journal_entry_id
  on public.homeowner_observations(journal_entry_id);

create index if not exists idx_homeowner_observations_companion_message_id
  on public.homeowner_observations(companion_message_id);

alter table public.homeowner_observations enable row level security;

drop policy if exists homeowner_observations_select_own on public.homeowner_observations;
create policy homeowner_observations_select_own
on public.homeowner_observations
for select
using (auth.uid() = user_id);

drop policy if exists homeowner_observations_insert_own on public.homeowner_observations;
create policy homeowner_observations_insert_own
on public.homeowner_observations
for insert
with check (auth.uid() = user_id);

drop policy if exists homeowner_observations_update_own on public.homeowner_observations;
create policy homeowner_observations_update_own
on public.homeowner_observations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists homeowner_observations_delete_own on public.homeowner_observations;
create policy homeowner_observations_delete_own
on public.homeowner_observations
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_homeowner_observations_updated_at on public.homeowner_observations;
create trigger trg_homeowner_observations_updated_at
before update on public.homeowner_observations
for each row execute function public.set_updated_at();
