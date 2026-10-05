# QualEval scenario runs

What happens after **Run** on an approved scenario: a real outbound call,
a verdict, and (when the bucket is configured) a recording. Direct-dial
calls are covered in `docs/phone-evals.md`. The Twilio bridge itself is
`docs/qualeval-demo-target-agent.md`.

## What has to be configured

| Missing | What the run does |
| --- | --- |
| `DATABASE_URL` | Every `/v1/qualeval` route returns 503 (`store.NOT_CONFIGURED_ERROR`). There is no in-memory fallback. |
| `TWILIO_ACCOUNT_SID` or `TWILIO_AUTH_TOKEN` | `twilioConfigured()` is false, so placement is not dispatched. The new row stays `pending`. That is the stub, not a failed call. |
| `QUALEVAL_PERSONA_NUMBER` while Twilio's SID and token are set | Placement runs and `placeCall` (`server/qualeval/callBridge.js`) marks the run `error`. The same happens when the evaluation has no `agentPhoneNumber`. |
| Recordings bucket (`recordingsConfigured()`) | Transcript and verdict still save. `audioRef` stays empty, so `GET /v1/qualeval/runs/:id/audio` is 404. |

`from` is always `QUALEVAL_PERSONA_NUMBER`. `to` is the evaluation's
`agentPhoneNumber`. Neither is hardcoded.

## State machine

`qualeval_runs.verdict` (`server/qualeval/store.js`, widened by
`server/migrations/004_qualeval_call_states.sql`):

| Verdict | Meaning |
| --- | --- |
| `pending` | Created, not placed. Also the resting state when Twilio is unset. |
| `in_progress` | Twilio accepted the call (`twilioCallSid` is set). |
| `awaiting_evaluation` | A transcript landed (`markRunAwaitingEvaluation`). The evaluator has not written pass/fail yet. |
| `pass` / `fail` | `dispatchEvaluation` (`server/qualeval/router.js`) judged the transcript. An evaluator `fail` is not an `error`. |
| `error` | Placement, the bridge, an empty transcript, or the evaluator threw. The message is on `error`. Never a fabricated verdict. |

The detail page polls every 3 seconds (`RUN_POLL_INTERVAL_MS`) while any
latest run is `in_progress`, `awaiting_evaluation`, or `pending` and
younger than 3 minutes (`PENDING_POLL_WINDOW_MS`). There is no push
channel.

`POST /v1/qualeval/runs/:id/end` hangs up an `in_progress` call through
Twilio (`Status=completed`) so it still finishes on the real `stop` path.
It 409s once the call has already left `in_progress`. Only an approved
scenario can be run.

## Who answers

Picking Healthcare, Finance, or Flight on the create form
(`TEMPLATES` in `client/src/QualEval.jsx`) fills description and
requirements and sets `demoAgentKey` to that domain's **compliant**
agent (`healthcare-compliant`, `compliant`, `flight-compliant`). Custom
leaves the key empty, which means Settings' Target agents switch.

That key is what answers this evaluation's scenario calls, not the
global toggle. `placeCall` registers it with `callBridgeBroker.js` only
when the dialed number is one our demo-agent route answers. One QualEval
call is expected in flight against the single demo number.

Every catalog agent (`DEMO_AGENTS` in `server/qualeval/demoAgentDefaults.js`)
includes `NO_TRANSFER`: asked for a human, a live agent, or an operator,
it says it cannot transfer and offers what it can still do. A requirement
that the agent offer a transfer fails that compliant agent. Healthcare
and Finance state the refusal in the template. Finance used to require a
transfer for disputes, fraud, or hardship; that line now requires the
refusal instead.

## After hangup

The persona leg (`server/qualeval/twilioStream.js`) owns the run:

1. The simulated caller hangs up itself once the conversation is over
   (`END_CALL_TOOL` / `end_call` in `bridgeSession.js`). Silence (30s)
   and the 5-minute cap stay as backstops.
2. The run is judged on the recording's transcript, not the live Voice
   Agent session. `callTranscription.js` transcribes the recorder's two
   legs as one stereo file. On this leg, incoming audio is the target
   agent (`incomingRole: "agent"`) and outgoing audio is the simulated
   caller (`outgoingRole: "user"`). Live turns are the fallback when
   there is no audio, the transcript is empty, or transcription throws
   (`CALL_TRANSCRIPTION_TIMEOUT_MS`, 90s, while the run is still
   `in_progress`).
3. Zero turns → `error` ("before any speech was captured"). Otherwise
   the run moves to `awaiting_evaluation`.
4. The WAV uploads to `qualeval-calls/<runId>.wav` (best-effort, before
   the evaluator). Playback is `GET /v1/qualeval/runs/:id/audio`, scoped
   by `store.getRun`'s `clerk_user_id` join.
5. `dispatchEvaluation` writes `pass` or `fail`. An evaluator throw
   marks the run `error` and leaves the transcript in place.

The live session drops or mishears the far end wherever the two parties
overlap, and it reports replies Twilio discarded on a barge-in. Debug
a "the agent never asked" failure from the recording transcript.

## Live listen-in

While a run is `in_progress`, the persona bridge publishes both sides to
`server/qualeval/liveCallHub.js` (in-process, read-only).
`GET /v1/qualeval/runs/:id/live` streams that as Server-Sent Events:
raw base64 `audio/pcmu` at 8 kHz, plus transcript turns.
`client/src/liveCallAudio.js` decodes mu-law and plays it in one 8 kHz
`AudioContext`.

- Auto-play is on unless `localStorage` key `qualeval_live_audio_v1` is
  `"off"`. The page checkbox and a card's "Stop listening" are the two
  opt-outs. A collapsed card keeps listening.
- Audio is not buffered for late joiners; turns from earlier in the call
  are. The hub is in-memory and per process. On the process that owns
  the call, a listener that opens while it is still ringing waits
  (`waitForStart`) up to `startWaitMs` (2 minutes). A listener on
  another process, or one that connects after the run has left
  `in_progress`, gets a single `end` event.
- Nothing published here is fed back into a call leg. An earlier
  server-side cross-feed made each agent hear the other party twice.

A proxy that releases the SSE stream in a burst (seen at ~6s through a
Cloudflare tunnel) used to leave playback stuck behind the call. The
scheduler drops a queue more than `maxBacklogSec` (1.5s) behind and
resumes at the live edge.

## Stuck runs

Placement, the bridge, and the evaluator all live in the app process. A
redeploy mid-call, or a Media Stream that never connects, leaves the row
unfinished with nobody left to advance it. `expireStaleRuns` marks those
`error` at read time (`reconcileStaleRuns` in `router.js`), so the next
poll clears "Call in progress…". `includePending` is false when Twilio
is not configured, so a stub `pending` run is left alone.

| State | Retired after | Longer than |
| --- | --- | --- |
| `pending` | 2 min | Dispatch reaching Twilio. |
| `in_progress` | 10 min | Ring, the 5-minute call cap, upload, and the 90s transcription timeout. |
| `awaiting_evaluation` | 20 min | The Gateway evaluator, including the process-wide queue and 429 backoff. |

## Example scorecards

The fail and pass cards on the splash page, `/examples/qualeval`, and the
Examples tab of `/qualeval` are static client data
(`client/src/qualevalExampleData.js`). They are not `qualeval_*` rows, so
delete and stale-run cleanup cannot remove them.

Regenerate their audio only after editing the scripted turns:

```
pip install edge-tts   # once; ffmpeg must be on PATH
python3 scripts/generate-qualeval-example-audio.py
```

The script writes `client/public/qualeval-examples/{fail,pass}.mp3` and
`manifest.json`. Copy each turn's `tMs` from the manifest into
`qualevalExampleData.js` when the script warns that a turn moved. The
MP3s are gitignored by default and re-included by
`!client/public/qualeval-examples/*.mp3`.
