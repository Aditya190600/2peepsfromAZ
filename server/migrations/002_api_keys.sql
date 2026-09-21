create extension if not exists pgcrypto;

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  name text not null,
  key_hash text not null unique,
  scopes jsonb not null default '["all"]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists api_keys_clerk_user_id_idx on api_keys (clerk_user_id);
