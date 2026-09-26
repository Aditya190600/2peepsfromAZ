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
-- Cross-reference: firstmate confirmed via Twilio's own call logs that no Twilio
-- call exists for run 4ab2abc3-09c8-4933-ad75-d1cc55acd29c's timeframe, matching
-- this exact "never reached placeCall" class. The target number +18038245760
-- (QUALEVAL_AGENT_NUMBER) also appears in a separate, unrelated inbound
-- answer-latency investigation on the target-agent leg, already fixed
-- separately - that overlap is coincidental (same shared demo number, different
-- bug paths: this is the outbound run-dispatch path) and is not a shared root
-- cause with this fix.
--
-- Uses a relative age cutoff rather than a fixed timestamp so it reliably sweeps
-- runs stranded by this bug regardless of exact creation time, while never
-- touching a run still within its normal in-flight dispatch window. Idempotent
-- (matching every other file in this directory): once a stranded run is marked
-- 'error' here, it no longer matches this where clause on a later boot, and any
-- future run past 10 minutes with a real placeCall in flight would only be swept
-- if it also has a null twilio_call_sid, which the fixed dispatch code above no
-- longer allows to persist silently. twilio_call_sid is null in every case:
-- store.markRunInProgress always writes verdict='in_progress' and
-- twilio_call_sid together, so a null twilio_call_sid with a stale verdict of
-- 'pending' or 'in_progress' means the Twilio call-placement API was never
-- actually reached.
update qualeval_runs
set verdict = 'error',
    error = 'Call was never placed - dispatch failed silently before this fix (see server/migrations/006_qualeval_stranded_runs_sweep.sql).'
where verdict in ('pending', 'in_progress')
  and twilio_call_sid is null
  and created_at < now() - interval '10 minutes';
