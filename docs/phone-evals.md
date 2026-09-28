# Phone Evals

Phone Evals is the report for a call someone places to an agent number
directly. The page is `/phone-evals` (`client/src/PhoneEvals.jsx`): newest
calls on the left, the selected call's report on the right. It is separate
from Qualitative Evals. A scenario run that QualEval places from
`QUALEVAL_PERSONA_NUMBER` is judged on its own run and never listed here.

## Who can open it

Two allowlists, both parsed by `server/qualeval/operatorAccess.js`
(`parseOperatorEmails` / `createOperatorCheck`) and wired in `server/index.js`:

| Env | Effect |
| --- | --- |
| `QUALEVAL_ADMIN_EMAILS` | Phone Evals admins. Every call, no Twilio import. Also counted as operators, so Settings' target-agent controls stay available without duplicating the email on `QUALEVAL_OPERATOR_EMAILS`. |
| `QUALEVAL_OPERATOR_EMAILS` | Deployment operators only (Settings' target agents, deployment numbers, provider registry). Does not by itself grant Phone Evals. |

Matching is case-insensitive against the signed-in Clerk user's verified
emails. Unset or empty fails closed. The value `*` on its own opens that
list to every visitor (the only way in when Clerk is off). A `*` inside an
email list is ignored.

Everyone else self-serves. Import an inbound Twilio number under Settings
(`client/src/PhoneEvalsSetup.jsx`, `POST /v1/telephony/imports/twilio`).
`canAccessPhoneEvals` (`server/qualeval/phoneEvalAccess.js`) is true once
that account has at least one inbound number. The list and the recording
route then keep only calls whose `to_number` matches a number they
registered (last 10 digits, so `+1 (312) 800-3792` matches `+13128003792`).
A call they cannot see returns 404.

`GET /v1/qualeval/config` reports `isPhoneEvalAdmin`, `canAccessPhoneEvals`,
`phoneEvalsConfigured`, and `ownedPhoneNumbers`. The nav rail hides Phone
Evals until `canAccessPhoneEvals` (`client/src/chromeNav.js`). Opening
`/phone-evals` without access shows the setup gate, which sends the visitor
to Settings. Admins do not see the import form.

## What a call has to hit

Scoring only runs for calls that reach `POST /v1/qualeval/demo-agent-voice`
and its Media Stream (`server/qualeval/targetAgentStream.js`).

- The deployment number `QUALEVAL_AGENT_NUMBER` is pointed at that route on
  every boot (`server/qualeval/demoAgentProvision.js`). Direct callers are
  answered by Settings' live target agent. A QualEval evaluation's own
  `demo_agent_key` does not apply here; that key is only for scenario calls.
- An imported number is pointed at the same route during import, using
  `https://${RAILWAY_PUBLIC_DOMAIN}/v1/qualeval/demo-agent-voice`
  (`server/telephony/carriers.js`). `RAILWAY_PUBLIC_DOMAIN` unset means the
  import still saves the number (`voiceWebhookConfigured: false`) and inbound
  calls never arrive, so Phone Evals stays empty. Local dev has no public
  URL, so this path needs the deployed host.

The answering agent is an AssemblyAI stored agent, so it cannot carry the
persona leg's `end_call` tool. Inbound calls hang up on 30 seconds of
silence or at the 5-minute cap (`DEFAULT_SILENCE_TIMEOUT_MS` /
`DEFAULT_MAX_DURATION_MS` in `server/qualeval/bridgeSession.js`).

## After hangup

`targetAgentStream.js` finishes the `production_calls` row, then
`analyzeFinishedCall` (`server/qualeval/postCallAnalysis.js`) runs two
analyses one after the other. They share the LLM Gateway's tight rate limit,
so they are not started together. One failing does not stop the other.

1. **Compliance** (`server/qualeval/phoneCompliance.js`) runs
   `analyzeSession` and stores the report on `compliance_*`. The caller
   placing the call counts as consent (`consentEvent.granted: true`), the
   same stance as a Try-page live call. Packs follow the answering agent's
   domain (`packIdsForVariant`): banking `generic` + `finance`, healthcare
   `generic` + `hipaa`, flight and anything else `generic` only.
2. **Agent instructions** (`server/qualeval/phoneEvaluation.js`) scores the
   transcript against that agent's live AssemblyAI system prompt. Pass/fail
   land on `verdict`. No prompt means `evaluation_status: no_rubric` and no
   invented verdict.

The transcript that both use is the recording's, not the live Voice Agent
session's. `callTranscription.js` transcribes the recorder's two legs as one
stereo file (incoming = caller / `user`, outgoing = agent). Live turns are
the fallback when there is no audio, transcription returns nothing, or it
throws. A leg claimed by a QualEval run skips that transcription; the persona
leg already transcribes the same call, and Phone Evals drops the leg anyway.

The recording uploads to `production-calls/<CallSid>.wav` when the bucket is
configured (`recordingsConfigured()`). Playback is
`GET /v1/qualeval/production-calls/:callSid/audio` (Range-aware, same
visibility as the list). Without a bucket the transcript and verdict still
save; there is just no audio.

## What the page shows

`GET /v1/qualeval/phone-evals` returns the newest 50 inbound rows with no
`qualeval_run_id`, then drops anything that came from
`QUALEVAL_PERSONA_NUMBER`. The tenant filter runs in SQL before that limit,
so a busy shared number cannot crowd out another account's calls. The page
polls every 3 seconds while a call or either analysis is still unfinished,
and every 15 seconds otherwise (`client/src/phoneEvalsView.js`). There is no
push channel.

| Status | Meaning |
| --- | --- |
| `compliance_status: done` | Report is ready. The list badge is `clear` or `N flagged`. |
| `compliance_status: no_transcript` / `evaluation_status: no_transcript` | The call ended before any speech was captured. |
| `compliance_status: error` / `evaluation_status: error` | That step threw. The message is on `compliance_error` / `evaluation_error`. |
| `evaluation_status: no_rubric` | The stored agent's system prompt could not be loaded. |
| `pass` / `fail` | Instruction score. Compliance can still flag a passing call. |
| missing, call still inside 10 minutes of hangup | Still running. The page says so. |
| missing, and the call has no `ended_at` after 15 minutes | The bridge was lost (a redeploy mid-call). It will not be scored. |

`POST /v1/qualeval/phone-evals/:callSid/analyze` re-runs both steps. It
answers 202 immediately, clears the previous results, and the poll picks up
the new ones. Use it when a rate-limited Gateway call left a check blank.
It 409s while the call has no `ended_at`, and 404s for an unknown sid, a
scenario-run leg, or a call outside the caller's numbers.

## Pitfalls

- A scenario run dialing `QUALEVAL_AGENT_NUMBER` writes a `production_calls`
  row and is marked `skipped_run`. It does not appear on this page. Look at
  the run on `/qualeval`.
- Switching the live agent (Settings → Target agents) changes the next
  direct call. It does not rewrite a call that already ended, and it does
  not override an evaluation's own demo agent.
- Empty Phone Evals after a successful import usually means Twilio never
  POSTed here. The import response's `voiceWebhookConfigured` is false when
  `RAILWAY_PUBLIC_DOMAIN` was unset, and the number is only stored locally.
  Import again once that host exists. A repeat import leaves Twilio's voice
  URL alone only when it already points at the current
  `demo-agent-voice` route.
- Both analyses call the Gateway. A burst of hangups will 429. The re-run
  route is the recovery; do not start the two analyses concurrently.
- The live session transcript is the wrong source of truth wherever the
  parties overlapped. Judge and debug from the recording transcript. See
  the header comment in `server/qualeval/callTranscription.js`.
