-- Lifts 005's fixed compliant/flawed pair to an open set of demo target
-- agents. Which keys exist is now owned by code
-- (server/qualeval/demoAgentDefaults.js's DEMO_AGENTS), and
-- server/qualeval/demoAgentAgentsProvision.js inserts a row for any key
-- missing one on boot, so the key column no longer needs a check list that
-- would have to be widened every time a domain is added. 005 still re-runs
-- first on every boot and its `create table if not exists` is a no-op on an
-- existing table, so dropping the constraint here sticks. The auto-generated
-- name is Postgres's default for an inline column check.
alter table qualeval_demo_agent_variants drop constraint if exists qualeval_demo_agent_variants_key_check;
