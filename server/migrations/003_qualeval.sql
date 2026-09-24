create extension if not exists pgcrypto;

-- QualEval: black-box qualitative acceptance testing for AI voice agents.
-- See docs/qualeval-foundation.md for the data-model rationale.

create table if not exists qualeval_evaluations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agent_phone_number text,
  description text,
  requirements text,
  clerk_user_id text not null default 'anon',
  created_at timestamptz not null default now()
);

create index if not exists qualeval_evaluations_clerk_user_id_idx on qualeval_evaluations (clerk_user_id);

create table if not exists qualeval_scenarios (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references qualeval_evaluations (id) on delete cascade,
  name text not null,
  persona text,
  situation text,
  caller_objectives text,
  expected_behavior text,
  evaluation_criteria jsonb not null default '[]'::jsonb,
  category text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists qualeval_scenarios_evaluation_id_idx on qualeval_scenarios (evaluation_id);

create table if not exists qualeval_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references qualeval_scenarios (id) on delete cascade,
  call_timestamp timestamptz,
  transcript jsonb,
  audio_ref text,
  verdict text not null default 'pending' check (verdict in ('pending', 'pass', 'fail')),
  assessment text,
  criterion_results jsonb,
  evidence_quotes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qualeval_runs_scenario_id_idx on qualeval_runs (scenario_id);
