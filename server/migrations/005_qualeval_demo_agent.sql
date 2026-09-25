-- Which two AssemblyAI-hosted agents (created via POST /v1/agents - see
-- server/qualeval/demoAgentAgents.js) answer QUALEVAL_AGENT_NUMBER, and
-- which one is currently active. Storing `agent_id` rather than raw prompt
-- text: AssemblyAI's own agent_id is a direct drop-in for a WS session's
-- system_prompt/greeting/voice/format (bind by `{session: {agent_id}}`,
-- mutually exclusive with those inline fields), so the prompt itself lives
-- on AssemblyAI's stored agent record, not duplicated here - see AGENTS.md's
-- demo target-agent section. Written with idempotent alter statements (not
-- just create-if-not-exists) since server/migrate.js re-executes every file
-- on every boot with no per-migration tracking - this also cleanly forward-
-- migrates an earlier draft of this table that stored raw prompt text.
create table if not exists qualeval_demo_agent_variants (
  key text primary key check (key in ('compliant', 'flawed')),
  name text not null,
  updated_at timestamptz not null default now()
);

insert into qualeval_demo_agent_variants (key, name) values
  ('compliant', 'Compliant support agent'),
  ('flawed', 'Flawed support agent (seeded gap)')
on conflict (key) do nothing;

alter table qualeval_demo_agent_variants add column if not exists agent_id text;
alter table qualeval_demo_agent_variants drop column if exists system_prompt;
alter table qualeval_demo_agent_variants drop column if exists greeting;
alter table qualeval_demo_agent_variants drop column if exists voice;

-- Single-row runtime setting: which variant QUALEVAL_AGENT_NUMBER currently
-- answers as. server/qualeval/demoAgentVoice.js reads this at call time via
-- demoAgentConfig.getActiveVariant() - there is only one number, so this is a
-- toggle, not two simultaneous numbers.
create table if not exists qualeval_demo_agent_state (
  id boolean primary key default true check (id),
  active_variant text not null default 'compliant' references qualeval_demo_agent_variants (key),
  updated_at timestamptz not null default now()
);

insert into qualeval_demo_agent_state (id, active_variant) values (true, 'compliant')
on conflict (id) do nothing;
