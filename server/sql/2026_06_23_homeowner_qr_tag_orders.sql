-- Homeowner QR tag order requests (pre-launch)
-- Run in Supabase SQL editor after create_homeowner_tables.sql

create extension if not exists "pgcrypto";

create table if not exists public.homeowner_qr_tag_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quantity integer not null default 1,
  tag_material text,
  notes text,
  status text not null default 'coming_soon',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_homeowner_qr_tag_orders_user_id
  on public.homeowner_qr_tag_orders(user_id);

alter table public.homeowner_qr_tag_orders enable row level security;

create policy homeowner_qr_tag_orders_select_own
on public.homeowner_qr_tag_orders
for select
using (auth.uid() = user_id);

create policy homeowner_qr_tag_orders_insert_own
on public.homeowner_qr_tag_orders
for insert
with check (auth.uid() = user_id);

create policy homeowner_qr_tag_orders_update_own
on public.homeowner_qr_tag_orders
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy homeowner_qr_tag_orders_delete_own
on public.homeowner_qr_tag_orders
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_homeowner_qr_tag_orders_updated_at on public.homeowner_qr_tag_orders;
create trigger trg_homeowner_qr_tag_orders_updated_at
before update on public.homeowner_qr_tag_orders
for each row execute function public.set_updated_at();
