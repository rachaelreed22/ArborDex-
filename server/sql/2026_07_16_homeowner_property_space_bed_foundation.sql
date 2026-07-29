-- Homeowner Property + Space + Garden Bed foundation (Wave 1, non-breaking)
-- Purpose: Add first-class context entities while preserving existing behavior.
-- Safe rollout: additive tables/columns only, no destructive changes.

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

-- ------------------------------------------------------------
-- Properties
-- ------------------------------------------------------------
create table if not exists public.homeowner_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  usda_zone text,
  climate_notes text,
  elevation_meters numeric,
  soil_notes text,
  irrigation_notes text,
  wildlife_notes text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homeowner_properties_name_len check (char_length(name) <= 120)
);

create index if not exists idx_homeowner_properties_user_id
  on public.homeowner_properties(user_id);

create unique index if not exists idx_homeowner_properties_primary_per_user
  on public.homeowner_properties(user_id)
  where is_primary = true;

alter table public.homeowner_properties enable row level security;

drop policy if exists homeowner_properties_select_own on public.homeowner_properties;
create policy homeowner_properties_select_own
on public.homeowner_properties
for select
using (auth.uid() = user_id);

drop policy if exists homeowner_properties_insert_own on public.homeowner_properties;
create policy homeowner_properties_insert_own
on public.homeowner_properties
for insert
with check (auth.uid() = user_id);

drop policy if exists homeowner_properties_update_own on public.homeowner_properties;
create policy homeowner_properties_update_own
on public.homeowner_properties
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists homeowner_properties_delete_own on public.homeowner_properties;
create policy homeowner_properties_delete_own
on public.homeowner_properties
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_homeowner_properties_updated_at on public.homeowner_properties;
create trigger trg_homeowner_properties_updated_at
before update on public.homeowner_properties
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Spaces (property-level zones)
-- ------------------------------------------------------------
create table if not exists public.homeowner_spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.homeowner_properties(id) on delete cascade,
  name text not null,
  space_type text,
  description text,
  sun_exposure text,
  irrigation_access text,
  soil_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homeowner_spaces_name_len check (char_length(name) <= 120)
);

create index if not exists idx_homeowner_spaces_user_id
  on public.homeowner_spaces(user_id);

create index if not exists idx_homeowner_spaces_property_id
  on public.homeowner_spaces(property_id);

alter table public.homeowner_spaces enable row level security;

drop policy if exists homeowner_spaces_select_own on public.homeowner_spaces;
create policy homeowner_spaces_select_own
on public.homeowner_spaces
for select
using (auth.uid() = user_id);

drop policy if exists homeowner_spaces_insert_own on public.homeowner_spaces;
create policy homeowner_spaces_insert_own
on public.homeowner_spaces
for insert
with check (auth.uid() = user_id);

drop policy if exists homeowner_spaces_update_own on public.homeowner_spaces;
create policy homeowner_spaces_update_own
on public.homeowner_spaces
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists homeowner_spaces_delete_own on public.homeowner_spaces;
create policy homeowner_spaces_delete_own
on public.homeowner_spaces
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_homeowner_spaces_updated_at on public.homeowner_spaces;
create trigger trg_homeowner_spaces_updated_at
before update on public.homeowner_spaces
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Garden Beds (space-level groupings)
-- ------------------------------------------------------------
create table if not exists public.homeowner_garden_beds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.homeowner_properties(id) on delete cascade,
  space_id uuid references public.homeowner_spaces(id) on delete set null,
  bed_label text not null,
  shape text,
  width_meters numeric,
  length_meters numeric,
  area_sq_meters numeric,
  soil_notes text,
  sun_exposure text,
  drainage_notes text,
  population_estimate integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homeowner_garden_beds_label_len check (char_length(bed_label) <= 120),
  constraint homeowner_garden_beds_population_nonnegative check (population_estimate is null or population_estimate >= 0)
);

create index if not exists idx_homeowner_garden_beds_user_id
  on public.homeowner_garden_beds(user_id);

create index if not exists idx_homeowner_garden_beds_property_id
  on public.homeowner_garden_beds(property_id);

create index if not exists idx_homeowner_garden_beds_space_id
  on public.homeowner_garden_beds(space_id);

alter table public.homeowner_garden_beds enable row level security;

drop policy if exists homeowner_garden_beds_select_own on public.homeowner_garden_beds;
create policy homeowner_garden_beds_select_own
on public.homeowner_garden_beds
for select
using (auth.uid() = user_id);

drop policy if exists homeowner_garden_beds_insert_own on public.homeowner_garden_beds;
create policy homeowner_garden_beds_insert_own
on public.homeowner_garden_beds
for insert
with check (auth.uid() = user_id);

drop policy if exists homeowner_garden_beds_update_own on public.homeowner_garden_beds;
create policy homeowner_garden_beds_update_own
on public.homeowner_garden_beds
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists homeowner_garden_beds_delete_own on public.homeowner_garden_beds;
create policy homeowner_garden_beds_delete_own
on public.homeowner_garden_beds
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_homeowner_garden_beds_updated_at on public.homeowner_garden_beds;
create trigger trg_homeowner_garden_beds_updated_at
before update on public.homeowner_garden_beds
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Link existing plant records to new context entities (nullable, additive)
-- ------------------------------------------------------------
alter table if exists public.homeowner_plants
  add column if not exists property_id uuid references public.homeowner_properties(id) on delete set null,
  add column if not exists space_id uuid references public.homeowner_spaces(id) on delete set null,
  add column if not exists garden_bed_id uuid references public.homeowner_garden_beds(id) on delete set null;

create index if not exists idx_homeowner_plants_property_id
  on public.homeowner_plants(property_id);

create index if not exists idx_homeowner_plants_space_id
  on public.homeowner_plants(space_id);

create index if not exists idx_homeowner_plants_garden_bed_id
  on public.homeowner_plants(garden_bed_id);
