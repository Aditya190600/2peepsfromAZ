create table if not exists public.report_cache (
  cache_key text primary key,
  report jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.report_cache enable row level security;
