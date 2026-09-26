-- Real Twilio calls, inbound and outbound, so a caller can be found later by
-- number or CNAM name. QualEval runs stay the evaluation record; this table is
-- the call itself. qualeval_runs only stores the outbound Call SID, never
-- From/To/CallerName, which is why a production caller could not be looked up.
create table if not exists production_calls (
  id uuid primary key default gen_random_uuid(),
  twilio_call_sid text not null unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_number text,
  to_number text,
  caller_name text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  transcript jsonb,
  variant_key text,
  agent_id text,
  qualeval_run_id uuid references qualeval_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists production_calls_from_number_idx on production_calls (from_number);
create index if not exists production_calls_to_number_idx on production_calls (to_number);
create index if not exists production_calls_caller_name_idx on production_calls (caller_name);
create index if not exists production_calls_qualeval_run_id_idx on production_calls (qualeval_run_id);
