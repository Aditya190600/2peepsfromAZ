# AssemblyAI-native webhook ingest (phone calls)

Status: built. `server/webhooks/assemblyaiWebhook.js`, wired into `server/index.js` as `POST /v1/webhooks/assemblyai`. Sibling to `docs/webhook-pivot-idea.md`'s customer-push ingest, not a replacement for it.

## Two ingestion paths, side by side

ComplyLine now has two ways a completed call's transcript reaches the analysis pipeline automatically, with no human clicking "Analyze":

| | `POST /v1/ingest/:apiKey` | `POST /v1/webhooks/assemblyai` |
| --- | --- | --- |
| Who calls it | The customer's own backend (already running their voice agent, on any platform) | AssemblyAI itself |
| Auth | ComplyLine API key in the path (`server/apiKeys.js`) | `X-AAI-Signature` HMAC over the raw body, per subscription secret |
| Customer-side code | Yes - one `POST` from their call-ended handler | None - AssemblyAI delivers it |
| Works with | Any voice platform, once normalized to `{turns: [...]}` | AssemblyAI phone calls only (this account's Voice Agent API) |
| Pack scoping | The API key's scoped packs (or all, for the `"all"` sentinel) | Every pattern pack, always (see below) |

Use `/v1/ingest/:apiKey` when the customer runs their own voice agent and can add a line of code to their own call-ended handler. Use `/v1/webhooks/assemblyai` when the phone call itself runs on AssemblyAI's Voice Agent API and ComplyLine should react without the customer integrating anything - AssemblyAI's own webhook delivery is the integration.

## How it works

1. A webhook subscription is registered on the AssemblyAI account (`POST /v1/webhook-subscriptions`) for `call.connected`, `call.ended`, and `call.failed`, pointed at this server's `/v1/webhooks/assemblyai`.
2. On `call.ended`, AssemblyAI POSTs a signed payload with `call.transcript_url` - a presigned S3 URL to a `timeline.json` artifact, valid for **one hour**.
3. `handleAssemblyAiWebhook` (`server/webhooks/assemblyaiWebhook.js`) verifies `X-AAI-Signature` against the raw request bytes, acks `2xx` immediately, then asynchronously fetches `transcript_url`, normalizes the timeline into the `{turns: [{role, text, tMs}]}` shape `analyzeSession` already consumes, and runs it through `processIngestedSession` (the same dispatch/cache logic `/v1/ingest/:apiKey` uses - not duplicated here).
4. `call.connected` and `call.failed` carry no transcript (`call.connected` has `recording_url`/`transcript_url` both `null`) and are just logged for visibility; nothing is analyzed for them.

There is no ComplyLine API key on this path - authentication is the webhook signature itself, not a customer credential, so the per-key pack-scoping model in `server/apiKeys.js` doesn't apply here. Every call ingested this way runs **every** pattern pack (`ALL_SCOPES_SENTINEL`), since there's no operator present at call time to pick packs and under-scanning a real phone call is the worse failure mode.

## Signature verification

Per [AssemblyAI's webhook docs](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/webhooks) (verified live 2026-09-23, matches this repo's standing AssemblyAI-docs-verification convention):

- Header: `X-AAI-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>`.
- `v1` = `HMAC-SHA256(secret, "{t}." + raw request body bytes)`, hex-encoded.
- Compare in constant time (`crypto.timingSafeEqual`); reject if `t` is more than 300 seconds from the server clock.
- Must be computed over the **raw bytes**, before any JSON parsing - `server/index.js` mounts this route with its own `express.raw({ type: "application/json" })` *ahead of* the app-wide `express.json()` middleware so the exact signed bytes are still available.

The signing secret is read from `process.env.AAI_WEBHOOK_SIGNING_SECRET` - a Railway env var, same pattern as every other secret in this repo (never committed, never sent to the client). Missing secret surfaces as `503`, not `401` (matches the `/v1/ingest/:apiKey` convention of distinguishing "not configured" from "auth failed").

## Transcript normalization

`transcript_url` resolves to a `timeline.json` artifact shaped `{session_id, started_at_unix_ms, turns: [{user_transcript, agent_text, agent_reply_started_at_ms, ...}]}` - each timeline turn pairs one user utterance with one agent reply. `timelineToTurns` splits that into the `{role, text, tMs}` entries `analyzeSession` expects. Neither the timeline payload nor AssemblyAI's docs carry a separate timestamp for the user's half of a turn, so both halves of one timeline turn share its `agent_reply_started_at_ms` anchor (relative to `started_at_unix_ms`); a turn with neither anchor falls back to fixed spacing, the same fallback `server/telephony/inbound.js` uses for inputs with no real per-turn timestamps. The webhook payload carries no consent signal, so `consentEvent` is left `null` - same as any other session where consent wasn't explicitly declared.

## Testing this for real (a phone call, not the manual Try tab)

This is the path a real phone call takes; there is no "paste the transcript" step to test it, and the Try tab's manual/upload flows are unrelated to this trigger. To generate a real event:

1. **Get an AssemblyAI Voice Agent published and reachable by phone.** AssemblyAI's own quickstart (the `voice-agent-starter-python`/`voice-agent-starter-js` repos) covers this end to end: publish an agent, then run its telephony step to attach a phone number. Concretely, with a Twilio account: set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, and an invented `TWILIO_TRUNK_DOMAIN` in `.env`, then run `python deployment/telephony/connect.py` (or `npm run phone` for the JS starter) - it creates the SIP trunk, routes it to AssemblyAI, and binds the published agent to the number. Twilio passes calls to AssemblyAI over SIP directly; no separate media server or webhook is needed for the call itself. `server/telephony/inbound.js` in this repo is a different, already-shipped feature (a BYO-SIP-trunk/manual-transcript inbound path for non-AssemblyAI telephony providers) - it's not part of this AssemblyAI-native flow and doesn't need touching to test this.
2. **Register (or confirm) the webhook subscription** on that same AssemblyAI account: `POST https://agents.assemblyai.com/v1/webhook-subscriptions` with `{url: "https://<this-deployment>/v1/webhooks/assemblyai", events: ["call.connected", "call.ended", "call.failed"], secret: "<the signing secret>"}`. Optionally scope it to one `agent_id`.
3. **Set `AAI_WEBHOOK_SIGNING_SECRET`** on the deployed server (Railway) to that same secret.
4. **Call the phone number.** Say something, hang up. Within a few seconds, `call.ended` should hit `/v1/webhooks/assemblyai`, and the ComplyLine report should appear via the same `reportCache`/`report_cache` path `/v1/analyze-session` and `/v1/ingest/:apiKey` already populate.
5. **If nothing arrives**, check delivery history: `GET https://agents.assemblyai.com/v1/sessions/{session_id}/webhook-deliveries` (the session id is the call's `call_id`). A `failed` delivery with `"error": "HTTP 401: invalid signature"` almost always means a secret mismatch or a proxy/middleware re-serializing the body before it reaches this route.
