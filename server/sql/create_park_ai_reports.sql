-- Stores generated park impact/readiness reports for trend-mode memory and municipal reporting history.
create table if not exists public.park_ai_reports (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  park_id text null,
  park_name text null,
  report_scope text not null default 'park' check (report_scope in ('park', 'system-wide')),
  report_type text not null default 'pilot-impact' check (report_type in ('pilot-impact', 'pre-pilot-readiness')),
  admin_user_id text null,
  include_prior_reports boolean not null default false,
  input_filters jsonb not null default '{}'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  report_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_park_ai_reports_generated_at
  on public.park_ai_reports (generated_at desc);

create index if not exists idx_park_ai_reports_scope_park
  on public.park_ai_reports (report_scope, park_id, park_name, generated_at desc);

create index if not exists idx_park_ai_reports_type
  on public.park_ai_reports (report_type, generated_at desc);
