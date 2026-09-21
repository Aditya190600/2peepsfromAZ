# Product idea: webhook-native ComplyLine

Status: brainstorm, not yet implemented. Captured from a captain discussion on 2026-09-20. Visual workflow review: `.lavish/2peeps-webhook-pivot.html` (open with `lavish-axi`).

## The core idea

Stop requiring a human to open ComplyLine and click "Analyze." Instead, the customer's own backend - the code that already runs their voice agent and already has the transcript in hand when a call ends - POSTs that transcript straight to ComplyLine's ingest endpoint the instant the call ends, authenticated with their ComplyLine API key. This is a push from the customer, not a subscription to the voice platform's webhook: ComplyLine never talks to AssemblyAI (or any other voice platform) at all, and never stores or needs a voice-platform credential.

(Revised 2026-09-20 from the original design below, which had ComplyLine subscribe to AssemblyAI's own webhook and poll AssemblyAI's API for the transcript using a ComplyLine-owned AssemblyAI key. That design only worked for sessions on ComplyLine's own AssemblyAI account - see "Webhook receiver (built)" for why.)

## Current workflow (as shipped today)

A human opens the app, records a live call or uploads audio/a transcript in the Try tab, and manually clicks "Analyze." The compliance checks run, and a report is shown in-browser. This works, but only runs when someone remembers to use it - a missed call never gets checked.

## Proposed workflow

1. A developer builds a voice agent on any platform (AssemblyAI, Vapi, Retell, or others - see "how standard is this" below). They already have code that receives the transcript when a call ends, since that's how they run their own agent.
2. In that same call-ended handler, they add one `POST` to ComplyLine's ingest endpoint, with their ComplyLine API key and the transcript - a few lines of code, not a platform-side subscription.
3. A real call happens. The call ends. The developer's own backend POSTs the transcript to ComplyLine.
4. ComplyLine's receiver verifies the API key, acknowledges immediately, then runs the existing compliance checks asynchronously, off the acknowledgment path.
5. The report is stored and surfaced in the web console. Critical/High findings flag for human review.

## Why push, not a platform webhook subscription

The original design (see git history) had ComplyLine subscribe to AssemblyAI's own `session.completed` webhook and poll `GET /v1/sessions/{id}` for the transcript, authenticated with a ComplyLine-owned AssemblyAI API key. That worked, but two problems: (1) it only worked for sessions on the AssemblyAI account that key belonged to - a real customer's own AssemblyAI account sessions were never readable with it, since AssemblyAI scopes session/artifact access per account, and capturing/storing each customer's own AssemblyAI key was unbuilt follow-up work; and (2) it was AssemblyAI-specific, so a Vapi- or Retell-built agent couldn't use it at all.

The customer already has the full transcript in hand the moment their call ends - they're running their own voice agent, on whichever platform. Having them push it to ComplyLine directly removes both problems at once: no per-customer voice-platform credential to capture or store, and the endpoint works for any platform's transcript shape as long as it's normalized to `{turns: [{role, text, tMs}]}` before it's sent.

## Ingest endpoint (built)

`POST /v1/ingest/:apiKey` (`server/webhooks/ingest.js`, wired into `server/index.js`). The path segment is the customer's ComplyLine API key - the only credential involved. Body: `{session: {sessionId?, startedAt?, consentEvent?, turns: [{role, text, tMs}]}}`, the same shape `analyzeSession` and `/v1/analyze-session` already consume. Flow: verify the API key (`verifyApiKey` from `server/apiKeys.js`) and validate the payload synchronously, ack `2xx` immediately, then dispatch the existing `analyzeSession` pipeline asynchronously, off the response path. A scoped key's packs (or every pack, for the `"all"` sentinel) become that report's `patternPackIds`. Results land in the same `reportCache`/`report_cache` Postgres table the manual `/v1/analyze-session` path uses, under the same key scheme (`requestCacheKey`, shared via `server/warmCache.js`); a failed async run is `console.error`-logged with the session id rather than swallowed - there's no per-account report inbox yet (see "What does the web console become?" below), so this gives it the same visibility the manual path already has.

There is no AssemblyAI SDK call, signature verification, or AssemblyAI credential of any kind in this path.

## How standard is this pattern across the industry?

Checked two other major voice-agent platforms directly rather than relying on general knowledge:

- **Vapi**: confirmed - sends an "End of Call Report" server event with call summary/transcript data to a registered server URL when a call ends. Source: [Vapi Server Events docs](https://docs.vapi.ai/server-url/events).
- **Retell AI**: confirmed - sends `call_ended` and `call_analyzed` webhook events with the full call object (transcript, metadata) to a registered endpoint. 10-second timeout, retries on failure (Retell retries up to 35 times over ~24 hours), and signs payloads with HMAC-SHA256 using the account's API key as the secret - structurally almost identical to AssemblyAI's approach. Source: [Retell AI webhook overview](https://docs.retellai.com/features/webhook-overview), [Retell AI webhooks feature](https://www.retellai.com/blog/retell-ai-webhooks-feature).

**Not verified in this pass** (flagging honestly rather than guessing): Deepgram's newer Voice Agent API's exact webhook contract, LiveKit, and Bland.ai. These are plausible to follow the same pattern based on how converged the field is across the two platforms actually checked, but that claim should not be treated as confirmed until checked directly - worth doing before committing ComplyLine's receiver to a specific multi-platform contract.

**Implication**: since every platform checked already delivers the transcript to the developer's own backend when a call ends, ComplyLine doesn't need a platform-specific webhook integration at all - the developer's own call-ended handler (which they already write, regardless of platform) can POST straight to ComplyLine's vendor-agnostic ingest endpoint. This is what the ingest endpoint below implements.

## How big a pivot is this?

Medium, not a rewrite. The entire analysis engine - consent/disclosure/PII checks, pattern packs, citations, severity ranking, report storage/history - is input-agnostic: it operates on a transcript object and doesn't care whether that transcript arrived via manual upload or a webhook. All of that is 100% reused.

What's genuinely new:
- **Ingest endpoint** - built, see "Ingest endpoint (built)" above. Needed API-key verification, a fast acknowledgment, and async dispatch into the existing analysis pipeline (cannot run the LLM Gateway checks inline before acking - those calls take well over a typical client HTTP timeout).
- **API key issuance/storage** - built (`server/apiKeys.js`, see AGENTS.md). Existing auth (Clerk) is for a human signing into the app, not a machine credential the customer's own backend authenticates with.

What's repurposed, not rebuilt: the Try tab (live mic / upload) stops being the primary path and becomes a setup-testing sandbox - see below.

## What does the web console become?

If the primary flow is headless (platform to webhook to report, no human click), the console's job shifts from "run a check" to "manage and review a stream of checks that already ran":

1. **Onboarding & setup** - issue the API key, show the exact ingest endpoint URL + payload shape to POST from a call-ended handler.
2. **Inbox of auto-ingested calls** - the existing fleet/Home view, repurposed: "every call your backend has sent us," sorted by severity.
3. **Test-before-you-ship sandbox** - Try becomes "send us a sample call so you can confirm your integration actually works," a debugging tool for integration rather than the main event.
4. **Alerting configuration** - who gets notified on a Critical/High finding, and how (email, Slack, a downstream webhook back to the customer).
5. **Audit trail / export** - already exists (report history); becomes more important since it's now the compliance officer's only touchpoint with a process that otherwise runs with no human in the loop.
6. **Usage / API key management** - calls checked this month, rotate/revoke a key, multiple keys for multiple deployed agents.

## Open questions

- For the hackathon demo specifically: demo the real webhook round-trip live, or narrate it while showing the console (lower risk for a taped 4-minute demo)?
- Does the in-progress live-persona-selector design (separate Lavish review) still matter as a customer-facing feature under this pivot, or does it become purely a sandbox tool for testing webhook setup?
- ~~API key security model: one key per account, or one per deployed voice agent?~~ Resolved: multiple pack-scoped keys per account (see `server/apiKeys.js`, AGENTS.md).
- Given the runway left before the deadline, is the webhook receiver + API keys worth building for real now, or does the deck/demo present this as the vision while the actual demo still runs the manual flow?
- Worth a real docs check on Deepgram/LiveKit/Bland.ai before committing to a multi-platform-agnostic receiver design, if that direction is pursued.
