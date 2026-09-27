# QualEval demo target agent

`QUALEVAL_AGENT_NUMBER` now answers with a real, bridged AssemblyAI Voice
Agent session instead of the static `<Say>`+`<Pause>` placeholder described in
`docs/qualeval-demo-agent-number.md` (that doc still explains why the number
needs a Voice Configuration at all - unchanged). This is the "target agent"
side of QualEval's evaluation loop: a real, conversational stand-in for a
customer's voice agent, so a scenario run against `QUALEVAL_AGENT_NUMBER`
exercises the full real pipeline (real outbound call -> real two-sided
conversation -> real transcript -> real evaluator verdict) rather than
against a scripted line that can only ever fail.

## A catalog of agents, one number, backed by AssemblyAI's own stored agents

Each target agent is an AssemblyAI **stored agent** (`POST`/`PUT /v1/agents` -
`server/qualeval/demoAgentAgents.js`), not prompt text we store ourselves:
`agent_id` is a direct drop-in for a WS session's `system_prompt`/`greeting`/
`voice`/`input`/`output` (bind with `{session: {agent_id}}`, mutually
exclusive with those inline fields - see `docs/voice-agents/voice-agent-api/deploy`).
`qualeval_demo_agent_variants` (`server/migrations/005_qualeval_demo_agent.sql`,
key check lifted by `008_qualeval_demo_agent_catalog.sql`) just maps each
agent key to its `agent_id`.

`server/qualeval/demoAgentDefaults.js`'s `DEMO_AGENTS` is the catalog and the
single source of truth for which keys exist. Every domain ships a
compliant/flawed pair, so an evaluation against the number can demo both a
pass and a fail in that domain:

| Domain | `compliant` variant | `flawed` variant (seeded gap) |
| --- | --- | --- |
| Banking (Northwind Bank) - keys `compliant`/`flawed` | Discloses AI, verifies name + last four of the account before any account talk | Never admits it's an AI; shares account info with no verification |
| Healthcare (Lakeside Family Clinic) - `healthcare-*` | Discloses AI, verifies name + date of birth, never gives medical advice | Skips identity verification (even for a relative) and recommends medication doses |
| Flight booking (Skyline Air) - `flight-*` | Discloses AI, asks for confirmation code + last name before changes, never invents fares or flight numbers | Never admits it's an AI; invents flight numbers, fares, confirmation codes, and refund promises |

The banking pair keeps its original un-prefixed keys because deployed rows
already map those to live agent_ids. The newer prompts follow
`client/src/personas.js`'s CAN/CANNOT persona style. Every agent carries the
same phone-only fallbacks so a call never stalls: asked for a human, it says
it can't transfer right now (none has a transfer tool); compliant agents
asked for real record/account data say they don't have access on this call.

Each body has `input`/`output.format` fixed to `audio/pcmu`, since that has
to live on the stored agent (it can't be set inline once `agent_id` is used).
On every boot `server/qualeval/demoAgentAgentsProvision.js` inserts a row for
any catalog key that doesn't have one yet, then creates the AssemblyAI agent
for any row with no `agent_id` and persists the id - it never recreates an
already-provisioned agent. So adding a `DEMO_AGENTS` entry makes a new agent
appear after the next deploy, but changing an existing entry's prompt does
not reach its live agent - push the new text with `PATCH
/v1/qualeval/demo-agent/variants/:key` (or `PUT /v1/agents/{agent_id}`
directly) too.

`qualeval_demo_agent_state` is a single-row runtime toggle (`active_variant`)
read by `server/qualeval/targetAgentStream.js` at connect time - there's only
one number, so switching agents is a toggle, not several simultaneous numbers.
The operator surface is the **Settings** page (`/settings`,
`client/src/Settings.jsx`): it lists every agent grouped by domain with its
live greeting/prompt/voice, marks the live one, switches it with "Make live",
and shows `QUALEVAL_AGENT_NUMBER` and `QUALEVAL_PERSONA_NUMBER` read-only.
It is backed by `server/qualeval/router.js`:

- `GET /v1/qualeval/config` - `agentPhoneNumber` for every visitor, plus
  `isOperator` and (operators only) `personaPhoneNumber`.
- `GET /v1/qualeval/demo-agent/variants` - every catalog agent (with its live
  `systemPrompt`/`greeting`/`voice` read straight off AssemblyAI via
  `demoAgentConfig.getVariantWithAgent`, plus catalog `domain`/`kind`/
  `description`) and the active key.
- `PATCH /v1/qualeval/demo-agent/variants/:key` - `name`/`agentId` update the
  local row directly; `systemPrompt`/`greeting`/`voice` instead forward to
  `PUT /v1/agents/{agentId}`, editing the live AssemblyAI record.
- `POST /v1/qualeval/demo-agent/active` with `{"variant": "<key>"}` -
  switches which agent answers the next call. Refuses an agent that has no
  `agent_id` yet, since that would leave the number unable to answer.

### Operator-only access

The live agent is shared by every caller of the number, and the demo is a
public link, so Settings is restricted to an operator allowlist
(`server/qualeval/operatorAccess.js`). Set `QUALEVAL_OPERATOR_EMAILS` to a
comma-separated, case-insensitive list of emails; it is matched against the
signed-in Clerk user's verified email addresses. Every
`/v1/qualeval/demo-agent/*` route returns 403 to anyone else, `/config` omits
`personaPhoneNumber` for them, and the client hides the Settings nav entry and
shows no agents or controls on `/settings` (the server check is the real gate).
Unset or empty means nobody is an operator. When Clerk isn't configured there
is no identity to check, so access stays closed unless the value is exactly
`*`, which allows every visitor - use that only for local dev or a deliberately
open demo. A `*` mixed into an email list is ignored. The same gate covers the
Phone Evals routes (`/v1/qualeval/phone-evals`, its `/:callSid/analyze` re-run,
and `/v1/qualeval/production-calls/:callSid/audio`).

## The bridge

`server/qualeval/demoAgentVoice.js` (`POST /v1/qualeval/demo-agent-voice`)
returns `<Connect><Stream url="wss://.../v1/qualeval/target-agent-stream"/>`,
the same bidirectional-Media-Streams pattern the outbound/persona side uses
(`twilioVoice.js` -> `twilioStream.js`). `server/qualeval/targetAgentStream.js`
accepts that WebSocket, resolves the currently active variant's `agentId`
(`demoAgentConfig.getActiveVariant()`), mints an AssemblyAI token, and binds
via `server/qualeval/bridgeSession.js`'s `createBridgeSession` - the same
generic primitive the caller side uses, but with `agentId` instead of
`systemPrompt` (mutually exclusive per AssemblyAI's own rule; `bridgeSession.js`
sends `{session: {agent_id}}` alone when `agentId` is set).

Unlike the caller side, this stream isn't tied to a run: which prompt to
bridge with is a global setting, not something carried on the call, so
`targetAgentStream.js` doesn't wait for the Media Streams `start` event before
creating the bridge session (`createBridgeSession` itself picks up
`streamSid`/`callSid` whenever `start` arrives).

## The two legs hear each other over the phone line

A QualEval-placed call from `QUALEVAL_PERSONA_NUMBER` to
`QUALEVAL_AGENT_NUMBER` is an ordinary phone call: each leg's
`<Connect><Stream>` sends its own AssemblyAI session's speech out on that
leg, and Twilio carries it to the other leg, whose Media Stream delivers it
as inbound `media`. No server-side audio relay is involved.

An earlier version believed Twilio did not carry audio between the legs
(2026-09-25) and added a server-side "broker" that also fed each session's
synthesized speech straight into the other session. That observation was an
artifact of the target side dropping every `reply.audio` chunk before
Twilio's `start` event (fixed since - see `bridgeSession.js`'s
`pendingReplyAudio`). Once audio reached the wire, each AssemblyAI session
heard the other party twice - once early, as fast as it was synthesized, and
once in real time over the phone - and the two agents talked over each other
from the first seconds of every call (reproduced live 2026-09-27 with
Twilio dual-channel recordings). The audio relay was removed.
`server/qualeval/callBridgeBroker.js` now only links the target-agent leg to
the QualEval run that placed the call, so its production-call record and
inbound evaluation carry `qualevalRunId`: the persona side registers its
`runId` up front, and the target side (which also answers real external
callers, who have no run) claims it via `waitForClaimableRun()` after its
bridge session already exists, so a real caller's greeting is never delayed.

When the far end barges in, AssemblyAI cancels the reply (`reply.done` with
`status: "interrupted"`) but Twilio keeps playing whatever `reply.audio` it
has already buffered. `bridgeSession.js` sends Twilio a `clear` message on an
interrupted reply so the cancelled speech actually stops.

## Role mapping is reversed from the caller side

`bridgeSession.js`'s `transcriptUserRole`/`transcriptAgentRole` options make
role mapping configurable because the two sides need opposite mappings for
the same AssemblyAI event names:

- Caller side: AssemblyAI's `transcript.user` is the transcription of what we
  fed it (the target agent's voice), so it swaps to `"agent"`; `transcript.agent`
  is our own AssemblyAI LLM (the simulated caller), so it swaps to `"user"`.
- Target-agent side: the audio we feed AssemblyAI here is the far end's voice
  (the simulated caller phoning in), so `transcript.user` maps straight to
  `"user"` - no swap; `transcript.agent` (AssemblyAI's own LLM, playing the
  target agent) maps straight to `"agent"` - also no swap.

See `bridgeSession.js`'s header comment before changing either mapping.
