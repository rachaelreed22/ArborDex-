create table if not exists public.tree_diagnostics_logs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  run_at timestamptz not null default now(),
  source text not null default 'manual',
  diagnostics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tree_diagnostics_logs_listing_id
  on public.tree_diagnostics_logs (listing_id);

create index if not exists idx_tree_diagnostics_logs_run_at
  on public.tree_diagnostics_logs (run_at desc);
