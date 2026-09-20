# Product idea: webhook-native ComplyLine

Status: brainstorm, not yet implemented. Captured from a captain discussion on 2026-09-20. Visual workflow review: `.lavish/2peeps-webhook-pivot.html` (open with `lavish-axi`).

## The core idea

Stop requiring a human to open ComplyLine and click "Analyze." Instead, the voice agent platform itself notifies ComplyLine automatically the instant a call ends, via a webhook the platform already supports natively. An enterprise developer plugs in a ComplyLine API key and a webhook URL when they configure their voice agent session - that's the entire integration cost. No custom hook code, no SDK, no manual step.

## Current workflow (as shipped today)

A human opens the app, records a live call or uploads audio/a transcript in the Try tab, and manually clicks "Analyze." The compliance checks run, and a report is shown in-browser. This works, but only runs when someone remembers to use it - a missed call never gets checked.

## Proposed workflow

1. A developer builds a voice agent on a platform (AssemblyAI, or others - see "how standard is this" below).
2. They add one config field when creating the session: a webhook URL pointing at ComplyLine, plus an auth header carrying their ComplyLine API key.
3. A real call happens.
4. The call ends. The platform itself POSTs the transcript to ComplyLine's webhook receiver - no code the developer has to write beyond that one config field.
5. ComplyLine's receiver acknowledges within the platform's timeout window (verified for AssemblyAI: 10 seconds, retried on failure - see below), then runs the existing compliance checks asynchronously, off the acknowledgment path.
6. The report is stored and surfaced in the web console. Critical/High findings flag for human review.

## Confirmed: AssemblyAI's Voice Agent API supports this natively

Verified directly against AssemblyAI's docs (2026-09-20): the Voice Agent API lets you register a webhook URL plus custom `webhook_auth_header_name`/`webhook_auth_header_value` params when creating a session. AssemblyAI POSTs the full transcript as JSON when the session ends (also exposed as a `session.completed` WebSocket event), signed, and retries up to 10 times if a 2xx isn't received within 10 seconds. Source: [AssemblyAI Voice Agent API webhooks](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/webhooks), [AssemblyAI streaming webhooks](https://www.assemblyai.com/docs/streaming/webhooks).

## How standard is this pattern across the industry?

Checked two other major voice-agent platforms directly rather than relying on general knowledge:

- **Vapi**: confirmed - sends an "End of Call Report" server event with call summary/transcript data to a registered server URL when a call ends. Source: [Vapi Server Events docs](https://docs.vapi.ai/server-url/events).
- **Retell AI**: confirmed - sends `call_ended` and `call_analyzed` webhook events with the full call object (transcript, metadata) to a registered endpoint. 10-second timeout, retries on failure (Retell retries up to 35 times over ~24 hours), and signs payloads with HMAC-SHA256 using the account's API key as the secret - structurally almost identical to AssemblyAI's approach. Source: [Retell AI webhook overview](https://docs.retellai.com/features/webhook-overview), [Retell AI webhooks feature](https://www.retellai.com/blog/retell-ai-webhooks-feature).

**Not verified in this pass** (flagging honestly rather than guessing): Deepgram's newer Voice Agent API's exact webhook contract, LiveKit, and Bland.ai. These are plausible to follow the same pattern based on how converged the field is across the two platforms actually checked, but that claim should not be treated as confirmed until checked directly - worth doing before committing ComplyLine's receiver to a specific multi-platform contract.

**Implication**: this makes a case for ComplyLine's webhook receiver being built as a genuinely platform-agnostic endpoint (accept a JSON payload with a transcript + session metadata, normalize per-vendor field names at the edge) rather than an AssemblyAI-only integration - the broad shape (register URL, get signed POST with transcript on call end, ack fast) is shared across at least the three platforms checked or partially checked so far.

## How big a pivot is this?

Medium, not a rewrite. The entire analysis engine - consent/disclosure/PII checks, pattern packs, citations, severity ranking, report storage/history - is input-agnostic: it operates on a transcript object and doesn't care whether that transcript arrived via manual upload or a webhook. All of that is 100% reused.

What's genuinely new:
- **Webhook receiver endpoint** - doesn't exist today. Needs signature/auth verification, a fast acknowledgment, and async dispatch into the existing analysis pipeline (cannot run the LLM Gateway checks inline before acking, given the 10-second window).
- **API key issuance/storage** - doesn't exist today. Current auth (Clerk) is for a human signing into the app, not a machine credential a voice platform authenticates with.

What's repurposed, not rebuilt: the Try tab (live mic / upload) stops being the primary path and becomes a setup-testing sandbox - see below.

## What does the web console become?

If the primary flow is headless (platform to webhook to report, no human click), the console's job shifts from "run a check" to "manage and review a stream of checks that already ran":

1. **Onboarding & setup** - issue the API key, show the exact webhook URL + auth header config to paste into a voice agent session.
2. **Inbox of auto-ingested calls** - the existing fleet/Home view, repurposed: "every call your webhook has sent us," sorted by severity.
3. **Test-before-you-ship sandbox** - Try becomes "send us a sample call so you can confirm your webhook config actually works," a debugging tool for integration rather than the main event.
4. **Alerting configuration** - who gets notified on a Critical/High finding, and how (email, Slack, a downstream webhook back to the customer).
5. **Audit trail / export** - already exists (report history); becomes more important since it's now the compliance officer's only touchpoint with a process that otherwise runs with no human in the loop.
6. **Usage / API key management** - calls checked this month, rotate/revoke a key, multiple keys for multiple deployed agents.

## Open questions

- For the hackathon demo specifically: demo the real webhook round-trip live, or narrate it while showing the console (lower risk for a taped 4-minute demo)?
- Does the in-progress live-persona-selector design (separate Lavish review) still matter as a customer-facing feature under this pivot, or does it become purely a sandbox tool for testing webhook setup?
- ~~API key security model: one key per account, or one per deployed voice agent?~~ Resolved: multiple pack-scoped keys per account (see `server/apiKeys.js`, AGENTS.md).
- Given the runway left before the deadline, is the webhook receiver + API keys worth building for real now, or does the deck/demo present this as the vision while the actual demo still runs the manual flow?
- Worth a real docs check on Deepgram/LiveKit/Bland.ai before committing to a multi-platform-agnostic receiver design, if that direction is pursued.
