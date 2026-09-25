# QualEval demo-agent number

`QUALEVAL_AGENT_NUMBER` is a Twilio number on this account reserved for the
future inbound direction (target-agent-calls-QualEval), per AGENTS.md. Until
that's built, it doubles as the only available call target for MVP
verification of the outbound call bridge (`server/qualeval/callBridge.js`),
since there is no real customer voice agent to dial yet.

## The bug this fixes

Twilio requires a Voice Configuration (a `VoiceUrl`) on a Twilio-owned number
before it will treat *any* inbound leg to that number as answered - including
the leg created by this repo's own outbound `Calls.create` dialing
`QUALEVAL_AGENT_NUMBER` from `QUALEVAL_PERSONA_NUMBER`. A number left
unconfigured fails every such call instantly: Twilio reports `status: failed`,
`duration: 0`, with no `Events` beyond the initial `queued` entry and no
`Alert` at all - there's nothing to debug from the Twilio side, since Twilio
never even attempts to fetch our `twilio-voice` webhook.

This is easy to miss because `VoiceUrl` reads, in Twilio's docs and in this
repo's own earlier assumption, as "config for when someone calls this number
from outside" - irrelevant to an outbound call *we* place. It is not: it's
required the moment `QUALEVAL_AGENT_NUMBER` is the callee of any call, no
matter who places it.

Because this configuration lived only in the Twilio Console (never in code or
an IaC file), it silently reverted at least once, reproducing the exact
"call fails at duration 0" symptom without any application code changing -
looking exactly like a regression from an unrelated PR.

## The fix

`server/qualeval/demoAgentProvision.js`'s `ensureDemoAgentNumberConfigured()`
runs once on every server boot (`server/index.js`) and idempotently points
`QUALEVAL_AGENT_NUMBER`'s `VoiceUrl` at `POST /v1/qualeval/demo-agent-voice`
(built from Railway's auto-injected `RAILWAY_PUBLIC_DOMAIN`), so the Console
configuration can never drift out of sync with what's deployed - it self-heals
on every restart instead of relying on a one-time manual step.

`demoAgentVoice.js` no longer serves a static scripted greeting: it now
bridges the call to a real AssemblyAI target agent - see
`docs/qualeval-demo-target-agent.md` for that side.
