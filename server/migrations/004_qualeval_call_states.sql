-- Widens qualeval_runs.verdict to cover the real call-placement state
-- machine (server/qualeval/callBridge.js) instead of only the foundation
-- slice's "pending" stub: 'in_progress' while the Twilio call is live,
-- 'awaiting_evaluation' once a transcript lands but before the evaluator
-- finishes, 'error' when call placement or the bridge itself fails. 'pass'
-- and 'fail' remain evaluator-only writes (server/qualeval/evaluator.js).
alter table qualeval_runs drop constraint if exists qualeval_runs_verdict_check;
alter table qualeval_runs add constraint qualeval_runs_verdict_check
  check (verdict in ('pending', 'in_progress', 'awaiting_evaluation', 'pass', 'fail', 'error'));

-- Twilio's Call SID for the run's outbound leg, and a human-readable error
-- message when call placement or the bridge fails (distinct from a failed
-- evaluator verdict - see error vs. fail above).
alter table qualeval_runs add column if not exists twilio_call_sid text;
alter table qualeval_runs add column if not exists error text;
