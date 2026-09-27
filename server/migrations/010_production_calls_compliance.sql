-- Phone Evals (client/src/PhoneEvals.jsx): a direct call to the agent number also
-- gets a ComplyLine compliance report the moment it ends
-- (server/qualeval/phoneCompliance.js), stored beside the pass/fail
-- evaluation. compliance_status is null while the analysis is still running.
-- analysis_started_at marks when the post-call analyses last began (at hangup,
-- or on an operator re-run), so the page knows a null status is still pending.
alter table production_calls add column if not exists compliance_status text;
alter table production_calls add column if not exists compliance_report jsonb;
alter table production_calls add column if not exists compliance_error text;
alter table production_calls add column if not exists analysis_started_at timestamptz;
