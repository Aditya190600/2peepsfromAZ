create table if not exists report_cache (
  cache_key text primary key,
  report jsonb not null,
  updated_at timestamptz not null default now()
);
