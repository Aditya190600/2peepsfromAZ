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

## Two variants, one number

`qualeval_demo_agent_variants` (`server/migrations/005_qualeval_demo_agent.sql`)
holds two operator-editable rows:

- `compliant` - discloses it's an AI in its first sentence and verifies the
  caller's identity (name + last four of the account number) before
  discussing any account-specific information.
- `flawed` - a seeded compliance gap for demo purposes: never discloses it's
  an AI, and answers account questions as soon as a name or account number is
  stated, with no identity verification at all.

`qualeval_demo_agent_state` is a single-row runtime toggle (`active_variant`)
read by `server/qualeval/targetAgentStream.js` at connect time - there's only
one number, so switching variants is a toggle, not two simultaneous numbers.
Manage both through `server/qualeval/router.js`:

- `GET /v1/qualeval/demo-agent/variants` - both variants plus the active key.
- `PATCH /v1/qualeval/demo-agent/variants/:key` - edit `name`/`systemPrompt`/
  `greeting`/`voice` for `compliant` or `flawed`.
- `POST /v1/qualeval/demo-agent/active` with `{"variant": "compliant"|"flawed"}`
  - switches which variant answers the next call.

## The bridge

`server/qualeval/demoAgentVoice.js` (`POST /v1/qualeval/demo-agent-voice`)
returns `<Connect><Stream url="wss://.../v1/qualeval/target-agent-stream"/>`,
the same bidirectional-Media-Streams pattern the outbound/persona side uses
(`twilioVoice.js` -> `twilioStream.js`). `server/qualeval/targetAgentStream.js`
accepts that WebSocket, resolves the currently active variant
(`demoAgentConfig.getActiveVariant()`), mints an AssemblyAI token, and bridges
via `server/qualeval/bridgeSession.js`'s `createBridgeSession` - the same
generic primitive the caller side uses, parameterized with the active
variant's `systemPrompt`/`greeting`/`voice`.

Unlike the caller side, this stream isn't tied to a run: which prompt to
bridge with is a global setting, not something carried on the call, so
`targetAgentStream.js` doesn't wait for the Media Streams `start` event before
creating the bridge session (`createBridgeSession` itself picks up
`streamSid`/`callSid` whenever `start` arrives).

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
