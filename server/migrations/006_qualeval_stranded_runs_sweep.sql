-- One-time reconciliation for a fixed, now-patched bug: server/qualeval/router.js's
-- POST /scenarios/:id/runs dispatched call placement via
-- `store.getEvaluation(...).then(placeCall).catch(...)`, and that outer .catch only
-- logged to console instead of calling store.markRunError - so a run could be
-- stranded at verdict 'pending'/'in_progress' forever, with no Twilio call ever
-- placed, if getEvaluation() itself rejected (or anything before placeCall's own
-- try/catch threw). placeCall's own failure path (and the not-found case, which
-- reaches placeCall as a thrown TypeError) already called markRunError correctly,
-- so only the "never reached placeCall" class needed reconciling.
--
-- This uses a fixed cutoff timestamp, not a relative interval, so it only ever
-- affects runs created before this fix shipped - it has zero effect on every
-- future boot (idempotent, matching every other file in this directory) and never
-- touches a run created after the code fix landed, since that class can no longer
-- occur. twilio_call_sid is null in every case: store.markRunInProgress always
-- writes verdict='in_progress' and twilio_call_sid together, so a null
-- twilio_call_sid with a stale verdict of 'pending' or 'in_progress' means the
-- Twilio call-placement API was never actually reached.
update qualeval_runs
set verdict = 'error',
    error = 'Call was never placed - dispatch failed silently before this fix (see server/migrations/006_qualeval_stranded_runs_sweep.sql).'
where verdict in ('pending', 'in_progress')
  and twilio_call_sid is null
  and created_at < '2026-09-25T12:00:00Z';
