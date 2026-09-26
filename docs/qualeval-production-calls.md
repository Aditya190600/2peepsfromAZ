# QualEval production calls

A call that hits `QUALEVAL_AGENT_NUMBER` is stored, recorded, and (when it is a real caller) scored against the QualEval evaluation whose target phone number matches. Scenario runs still get their verdict from the outbound leg. This is the call record itself (`production_calls`). It is not the "target agent calls QualEval" direction, which is still unbuilt.

## What gets stored

`server/migrations/007_production_calls.sql` creates `production_calls`, replayed on boot with the other migrations (`server/migrate.js`). One row per Twilio Call SID.

| Column | When it is set |
| --- | --- |
| `twilio_call_sid`, `direction`, `from_number`, `to_number`, `caller_name` | Voice webhook, before the Media Stream exists |
| `transcript`, `ended_at`, `end_reason`, `variant_key`, `agent_id`, `audio_ref` | Bridge `onFinished` |
| `evaluation_id`, `evaluation_status`, `verdict`, `assessment`, `criterion_results`, `evidence_quotes`, `evaluation_error` | Inbound scoring, after the transcript is attached |
| `qualeval_run_id` | Outbound insert from `placeCall`, or inbound scoring when the leg was a scenario run |

`direction` is `inbound` or `outbound` and is not overwritten on a later upsert of the same Call SID. Later writes fill null caller fields with `coalesce`, so a finish step cannot wipe From/To/CallerName.

Caller name comes from Twilio's `CallerName`. If that is empty, a quoted SIP display name on `Caller` (`"Rastopopulous" <sip:+1...@twilio.com>`) is used. A bare E.164 `Caller` stores `null`.

Missing `DATABASE_URL` makes every write a no-op. The call is still answered. A missing Call SID is also a no-op. A database error on the voice webhook is logged and does not block TwiML (`server/qualeval/demoAgentVoice.js`).

## Lifecycle

```
Twilio  --POST /v1/qualeval/demo-agent-voice-->  recordProductionCall (From/To/CallerName)
        --WSS  /v1/qualeval/target-agent-stream->  bridge + mix both audio legs
        --hangup-------------------------------->  finishProductionCall (transcript, WAV)
                                                   evaluateInboundCall (score or skip)
```

1. **Answer.** `demoAgentVoice.js` verifies `X-Twilio-Signature`, writes the inbound row from the webhook body (`productionCallFromTwilioBody`), says "One moment please.", then `<Connect><Stream>` to `/v1/qualeval/target-agent-stream`. Identity is saved even if the caller hangs up during the stream connect. This route is mounted in `server/index.js` ahead of the Clerk-gated `/v1/qualeval` router and uses `express.urlencoded`, same posture as `twilio-voice/:runId`.

2. **Bridge.** `targetAgentStream.js` buffers Twilio `connected`/`start` until the AssemblyAI session exists (those events arrive before the variant lookup finishes). It records both PCMU legs with `createCallRecorder`. If `callBridgeBroker.js` claims a pending scenario run, that run id is kept for scoring.

3. **Finish.** On bridge end, a WAV is uploaded to `production-calls/<CallSid>.wav` when the recordings bucket is configured and the recorder has audio. `finishProductionCall` attaches the transcript, end reason, active variant key, agent id, and `audio_ref`. Upload failure is logged; the transcript is still saved. `finishProductionCall` leaves `qualeval_run_id` alone. That column is set on the outbound insert, or later by scoring.

4. **Score.** `evaluateInboundCall` (`server/qualeval/inboundEvaluation.js`) runs on the same finish path. It does not throw into the bridge: a model error is stored as `evaluation_status = "error"` and `evaluation_error`.

Outbound QualEval calls are stored the same way, from the other leg: `callBridge.js`'s `placeCall` inserts `direction: "outbound"` with the run id as soon as Twilio returns a Call SID, and `twilioStream.js` attaches that leg's transcript on finish. The outbound WAV stays on the run (`qualeval-calls/<runId>.wav`, `GET /v1/qualeval/runs/:id/audio`). Only the inbound/target leg uses the production-call audio key.

## How a real caller is scored

`findEvaluationByPhone` compares the **last 10 digits** of the dialed `To` with `qualeval_evaluations.agent_phone_number`. `+1 (803) 824-5760` matches `+18038245760`. Fewer than 10 digits never matches. If several evaluations share those digits, the newest `created_at` wins.

The rubric is the evaluation's `requirements`, one criterion per non-empty line. If `requirements` is blank, `description` is the rubric. The same `evaluateTranscript` path scenario runs use judges the transcript. No matching evaluation, or a match with neither requirements nor description, stores `no_rubric` and does not call the model.

| `evaluation_status` | Meaning |
| --- | --- |
| `pass` / `fail` | Judge ran. `verdict` matches. |
| `skipped_run` | This inbound leg was cross-wired to a scenario run (`qualevalRunId` set). The outbound run is the score. The model is not called again. |
| `no_transcript` | The bridge ended with zero turns. |
| `no_rubric` | No evaluation matched the dialed number, or the match has no requirements and no description. |
| `error` | The judge threw. `evaluation_error` holds `err.message`. |

`no_rubric` with a null `evaluation_id` means the row exists in Postgres but does not show on any evaluation page. The list query is `where evaluation_id = $1`.

## How to read a result

On `/qualeval`, open the evaluation whose target number is the number that was dialed. The **Inbound calls** section (`QualEval.jsx`, `GET /v1/qualeval/evaluations/:id/inbound-calls`) lists up to 50 calls, newest `started_at` first. The list is scoped by the same visitor check as the evaluation itself. A list failure leaves the rest of the page up; refresh to retry.

A `pass` or `fail` row renders the same result block as a scenario run (assessment, criteria, transcript, player). Other statuses render a short note: scenario runs say they were scored on the run, an empty rubric says to add requirements, a silent call says speech was not captured, and a model failure shows `evaluation_error`.

Playback is `GET /v1/qualeval/production-calls/:callSid/audio` (Range-aware, same proxy as run audio). The Call SID must match `CA` plus 32 hex characters. The S3 key has no per-visitor owner because the number is shared, so the route relies on the unguessable SID plus the `requireVisitor` gate on `/v1/qualeval`. No `audio_ref`, or no object in the bucket, is a 404. The transcript and verdict do not depend on the recording.

## Pitfalls

- **Postgres is optional for answering, required for lookup.** Unset `DATABASE_URL` and the phone still picks up, with nothing to query afterward.
- **A row with no `ended_at` never reaches the page.** The voice webhook writes identity immediately. Transcript, audio, and `evaluation_id` wait for the Media Stream to finish. A hangup during the ~5-6s stream connect, or a stream that never upgrades, leaves a caller row that the Inbound calls list will not show.
- **The evaluation phone number has to be the number Twilio delivered as `To`.** Last-10-digit match only. A formatting difference is fine; a different number is a `no_rubric` row with no `evaluation_id`.
- **Requirements are the rubric.** A description-only evaluation is scored (the description becomes the single block of criteria, split on newlines). An evaluation with both fields blank is stored and not judged.
- **Do not expect a second verdict on a scenario run.** The target-agent leg of a QualEval-placed call is `skipped_run`. Read the scenario run for pass/fail. That leg's recording, when the bucket is configured, is still on the production-call audio route; the run player uses the persona-leg WAV.
- **Local dev without the recordings bucket** keeps the transcript and score and skips the WAV (`recordingsConfigured()` is false). Same best-effort rule as QualEval run recordings.
