# Guardrails / LLM Gateway integration

## The gap this closes

`docs/hackathon-ideas.md` (lines 93, 97) scores R3-21's Application-of-Technology
as High partly because it claims PII detection uses "AssemblyAI's own
Guardrails PII-redaction product directly" and disclosure checks use "the LLM
Gateway." Until this change, neither was true: `piiScan.js` was hand-rolled
regex (SSN/credit-card/account-number patterns plus a Luhn check) and
`disclosureCheck.js` was a hardcoded phrase-list regex
(`/AI|artificial intelligence|automated|.../i`). The only real AssemblyAI API
call anywhere in the product was session-ingestion token minting. A judge who
read the code would have found the "High Application of Technology" claim
aspirational, not actual.

Both checks now make real calls to AssemblyAI. `server/checks/analyze.js:15`
already composed them as independent function calls behind stable signatures,
so this was a drop-in swap, not a redesign.

## Why LLM Gateway, not the audio-time Guardrails `redact_pii` param

The idea doc (and the captain's brief) named Guardrails specifically for PII.
Per the live docs (`https://www.assemblyai.com/docs/llms-full.txt`,
`/docs/guardrails/redact-pii-from-transcripts`), Guardrails' PII redaction is
a parameter (`redact_pii`, `redact_pii_policies`) on `POST /v2/transcript` -
it redacts PII **while transcribing audio**, not text you already have. This
product's whole architecture is post-hoc: it ingests an already-completed
Voice Agent session (`turns: [{role, text, tMs}]`), never raw audio. There is
no `/v2/transcript` call to attach `redact_pii` to.

The docs' own guide for exactly this situation - redacting PII from text you
already have, not audio you're about to transcribe - is
[Redact PII from Text Using LLM Gateway](https://www.assemblyai.com/docs/guides/llm-gateway-pii-redaction):
prompt an LLM Gateway model to extract named entities (person names, orgs,
emails, phone numbers, addresses) as JSON, then redact the matched spans. That
guide's exact pattern is what `piiScan.js` now implements. So both checks call
`https://llm-gateway.assemblyai.com/v1/chat/completions` - this is a
considered fit to the documented API surface, not a shortcut around a harder
integration.

**Decision:** the deterministic pattern-pack scan (`patternPacks.js`, the
HIPAA pack) is kept as-is and runs first - it's fast, has zero LLM cost/token
variance, and is what the pluggable-pack architecture (and its HIPAA
drop-in-extension story) depends on. The LLM Gateway NER pass runs alongside
it as a second, complementary source of `pii_scan` items for free-form PII
(names, emails, addresses) that regex can't reliably express. Both feed the
same `items` array on the same `pii_scan` finding; LLM Gateway-sourced items
are tagged `packId: "llm_gateway_ner"` so they're distinguishable from
pattern-pack matches.

## What changed

- **`server/checks/llmGateway.js`** (new): thin client for
  `POST https://llm-gateway.assemblyai.com/v1/chat/completions`. Two docs
  facts that are easy to get wrong: the auth header is the raw API key with
  **no** `Bearer` prefix (unlike the Voice Agent token endpoint, which does
  require `Bearer`), and the model ID must be an exact versioned string
  (`claude-sonnet-4-6`, not `claude-sonnet-4`).
- **`server/checks/disclosureCheck.js`**: replaced the regex phrase list with
  one LLM Gateway call per session, sent only the agent turns inside the
  existing 10-second disclosure window. The model returns
  `{"disclosed": bool, "turnIndex": number|null, "quote": string|null}`. This
  catches paraphrases the old regex missed, e.g. "I'm a computer program
  helping you today" - see the "paraphrase" test in `analyze.test.js`.
- **`server/checks/piiScan.js`**: unchanged pattern-pack scan, plus one LLM
  Gateway call per session that extracts free-form PII per turn as JSON and
  merges it into the same `items` array.
- **`server/checks/analyze.js`**: `analyzeSession` is now `async` (both checks
  make network calls) and accepts an optional `llmGateway` override, which it
  forwards to both checks - this is how tests inject a fake client instead of
  hitting the real API.
- **`server/index.js`**: the `/v1/analyze-session` route awaits
  `analyzeSession` and returns `502` with the error message if the LLM
  Gateway call fails outright.

## Failure handling

An LLM Gateway call is a real external-network boundary, unlike the rest of
this codebase's internal logic. If it throws or returns unparseable JSON:

- `disclosureCheck` returns `status: "flag"` with an `llmGatewayError` field
  and a detail message - a fail-closed default, consistent with "no
  disclosure detected" being the safe assumption when the check can't run.
- `piiScan` still returns whatever the pattern-pack scan found, and adds an
  `llmGatewayError` field to the finding so the gap is visible in the report
  rather than silently dropped.

Both paths are covered in `server/checks/analyze.test.js`.

## Testing

`analyze.test.js` injects a fake `llmGateway(messages) => Promise<string>`
function via `analyzeSession(session, { llmGateway })`, so the test suite
never makes a real network call or needs `ASSEMBLYAI_API_KEY`. The fake
distinguishes the disclosure-check call from the PII-NER call by checking
whether the system prompt contains `"disclos"` (present only in
`disclosureCheck.js`'s prompt), then returns the matching canned JSON shape.
