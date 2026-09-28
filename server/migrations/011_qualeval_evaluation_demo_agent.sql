-- Which demo target agent answers this evaluation's scenario calls when they
-- dial a number bridged by server/qualeval/targetAgentStream.js (the demo
-- agent number, or an imported number pointed at demo-agent-voice). Set once
-- per evaluation (eval set), not per scenario. Null keeps the old behavior:
-- Settings' single Target agents switch (qualeval_demo_agent_state) answers.
-- Without this, every scenario run answered as whichever agent that global
-- switch last pointed at, so a healthcare evaluation could be answered by
-- the banking agent. on delete set null: a key dropped from the catalog
-- falls back to the Settings default rather than blocking the delete.
alter table qualeval_evaluations
  add column if not exists demo_agent_key text references qualeval_demo_agent_variants (key) on delete set null;
