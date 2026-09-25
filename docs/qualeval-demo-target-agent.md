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

## Two variants, one number, backed by AssemblyAI's own stored agents

Each variant is an AssemblyAI **stored agent** (`POST`/`PUT /v1/agents` -
`server/qualeval/demoAgentAgents.js`), not prompt text we store ourselves:
`agent_id` is a direct drop-in for a WS session's `system_prompt`/`greeting`/
`voice`/`input`/`output` (bind with `{session: {agent_id}}`, mutually
exclusive with those inline fields - see `docs/voice-agents/voice-agent-api/deploy`).
`qualeval_demo_agent_variants` (`server/migrations/005_qualeval_demo_agent.sql`)
just maps our two variant keys to their `agent_id`:

- `compliant` - discloses it's an AI in its first sentence and verifies the
  caller's identity (name + last four of the account number) before
  discussing any account-specific information.
- `flawed` - a seeded compliance gap for demo purposes: never discloses it's
  an AI, and answers account questions as soon as a name or account number is
  stated, with no identity verification at all.

`server/qualeval/demoAgentDefaults.js` holds the two agents' default bodies
(prompt/greeting/voice, with `input`/`output.format` fixed to `audio/pcmu`
since that has to live on the stored agent - it can't be set inline once
`agent_id` is used). `server/qualeval/demoAgentAgentsProvision.js` creates
each agent once on boot, the first time its variant row has no `agent_id`
yet, and persists the id - it never recreates an already-provisioned agent.

`qualeval_demo_agent_state` is a single-row runtime toggle (`active_variant`)
read by `server/qualeval/targetAgentStream.js` at connect time - there's only
one number, so switching variants is a toggle, not two simultaneous numbers.
Manage both through `server/qualeval/router.js`:

- `GET /v1/qualeval/demo-agent/variants` - both variants (with their live
  `systemPrompt`/`greeting`/`voice` read straight off AssemblyAI via
  `demoAgentConfig.getVariantWithAgent`) plus the active key.
- `PATCH /v1/qualeval/demo-agent/variants/:key` - `name`/`agentId` update the
  local row directly; `systemPrompt`/`greeting`/`voice` instead forward to
  `PUT /v1/agents/{agentId}`, editing the live AssemblyAI record.
- `POST /v1/qualeval/demo-agent/active` with `{"variant": "compliant"|"flawed"}`
  - switches which variant answers the next call.

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

## Twilio doesn't bridge the two legs - we do it ourselves

Verified live 2026-09-25: placing a real outbound call from
`QUALEVAL_PERSONA_NUMBER` to `QUALEVAL_AGENT_NUMBER` does NOT give the two
legs each other's real audio, even though both sides' `<Connect><Stream>`
correctly reach `session.ready` and carry real, continuous Media Stream
frames. Each standalone `<Connect><Stream>` hijacks only *its own* leg's
audio path into its own AssemblyAI session - Twilio's normal caller/callee
audio bridge never forms, because both sides redirected their own audio
elsewhere. (Twilio Call resource evidence: both legs show
`parent_call_sid: null` - they're not linked as parent/child at all.)

`server/qualeval/callBridgeBroker.js` is the fix: an in-process registry that
cross-wires the two `bridgeSession` instances for one call server-side.
`createBridgeSession` gained two hooks for this:

- `onReplyAudio(audioBase64)` - called with every chunk of this session's own
  synthesized speech, in addition to the existing relay to its own Twilio leg.
- `injectAudio(audioBase64)` (on the returned control object) - feeds a chunk
  into this session's AssemblyAI agent as if it arrived over the phone.

The persona side (`twilioStream.js`) always knows its `runId` up front and
registers immediately via `registerPersonaLeg`. The target-agent side has no
run context (it also answers real external callers) and instead calls
`waitForClaimableRun()`, which polls briefly for a run whose persona leg has
registered but has no target leg yet, then claims it. The bridge session
itself is created before that poll starts, so a real external caller's
greeting is never delayed by it - a caller with nothing to claim just gets
the standalone bridge, unaffected. Both legs are still real Twilio calls
carrying real Media Streams; only the "who hears whom" wiring moved from
Twilio's (nonexistent, for this call shape) native bridge to this broker.

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
