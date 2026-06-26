-- Homeowner Garden Companion layout memory
-- Run in Supabase SQL editor after homeowner profile table exists.

alter table if exists public.homeowner_profiles
  add column if not exists garden_layout_image_url text,
  add column if not exists garden_layout_analysis jsonb,
  add column if not exists garden_layout_notes text,
  add column if not exists garden_layout_updated_at timestamptz;
