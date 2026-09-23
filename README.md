# 2peepsfromAZ

Submission for the [AssemblyAI Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai.

## Hackathon requirements

- **Event**: AssemblyAI Voice Agent Hackathon, hosted on lablab.ai. Online, month-long, **Sep 1-30, 2026**.
- **Prize pool**: $10,000 total ($5k cash + $5k AssemblyAI API credits).
- **Registration**: open the whole build window, so joining mid-month is fine as long as you submit by the deadline.
- **Core technical requirement**: every project must build on AssemblyAI's Voice AI platform (Streaming Speech-to-Text API and/or Voice Agent APIs). This is non-negotiable for eligibility, not just a suggestion.
- **Submission deadline**: **Sep 30, 2026** (end of the hackathon window).
- **What a submission needs** (standard lablab.ai submission checklist, applies to this hackathon):
  - Project title + short and long description
  - Technology and category tags
  - Cover image, 16:9 aspect ratio, PNG or JPG
  - Video presentation (under 5 minutes, under 300MB) - judges reward a clear walkthrough of problem, working demo, and business case over production polish
  - Slide deck, PDF
  - Public GitHub repository link (this repo) - if the project spans multiple repos, list them in this README
  - A live demo deployed on Streamlit, Replit, or Vercel, with the application URL included in the submission
- **Judging criteria**: presentation quality, business value, application of technology, originality.

Some of the above (exact prize tracks, a formal rules document, category tags) is not fully published yet on the public hackathon page as of this writing (the page sits behind a Cloudflare bot check that blocks automated fetches - it was confirmed via lablab.ai's own search-indexed content instead of direct scraping). Re-check the [hackathon page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) directly in a browser closer to submission time for any track-specific or AssemblyAI-specific rules beyond the general lablab.ai checklist above.

## Product: Voice-Agent Session Compliance Report (R3-21)

Ingests **one completed** AssemblyAI Voice Agent API session (live or synthetic) and produces a post-hoc compliance report - this is not a live conversational advisor, the flagged-findings report is the actual demo artifact. Core, industry-agnostic checks:

1. **Consent-event-logged (TCPA)**: was a valid consent event logged before the call.
2. **AI-disclosure-timing** (e.g. CA AB 2905): was the AI nature of the call disclosed within the first few seconds - judged semantically via AssemblyAI's LLM Gateway (catches paraphrases, not just a fixed phrase list).
3. **Opt-out-honored (TCPA)**: if a caller asked to stop being called, did the agent acknowledge it soon after, rather than continuing past it unaddressed. See `docs/tcpa-optout-check.md` for the heuristic and its honest limitations.
4. **PII scan**: a deterministic SSN / credit-card / account-number pattern scan, via a pluggable pattern-set architecture (`server/checks/patternPacks.js`), plus a free-form-PII pass (names, emails, addresses) via AssemblyAI's LLM Gateway. See `docs/guardrails-llm-gateway-integration.md` for why LLM Gateway rather than Guardrails' audio-time redaction is the fit for a post-hoc, text-only report.

Optional **HIPAA, GLBA, and FERPA identifier pattern packs** ship as real drop-in extensions on top of the generic scan. The FERPA pack intentionally covers only labeled student-number, student-date-of-birth, and mother's-maiden-name disclosures; FERPA PII is broader and context-dependent, so this is not a FERPA compliance determination. See `server/checks/analyze.test.js` and `server/evals/runPackEvals.test.js` for runnable pack-isolation demonstrations.

**Why this idea:** see `docs/hackathon-ideas.md`'s R3-21 entry for the full novelty/scoring rationale. In short: no scoped, protocol-level, industry-agnostic-first compliance checker for AI voice agents was found built anywhere; the addressable market is any company running a voice agent, not one vertical.

## Phone numbers

Telephony is off the Get started path. The browser mic on Try is unchanged. Outbound dialing is not implemented.

One voice engine: **Twilio Programmable Voice**. Telnyx, Zadarma, Vonage, and Sinch are trunk recipes that deliver a finished transcript to `POST /v1/telephony/inbound`. ComplyLine does not run Asterisk, LiveKit, or a second SIP stack. It stores the number and trunk in gitignored `server/telephony/.telephony-store.json`, checks that the gateway accepts a TCP connection on port 5060, and runs the offline compliance analyzer on the posted transcript. The session then shows up in Sessions and can be reopened. Set `TELEPHONY_WEBHOOK_SECRET` in production and send it as `x-complyline-hook-secret`. US and EU Twilio SIP hosts are different. A US account uses `sip.twilio.com`. An Ireland-region account must use that region's SIP host. A mismatch fails the gateway check.

Open **Numbers** in the app, or call the API:

- `POST /v1/telephony/imports/twilio` with `accountSid`, `authToken`, and `e164`. A rejected token returns an error and the token is not logged or returned.
- `POST /v1/telephony/imports/telnyx` with either `apiKey` or `sipFqdn`, plus `e164`.
- `POST /v1/telephony/trunks` with `provider: "zadarma"`, `username`, and `password`. Gateways default to `sip.zadarma.com` and `pbx.zadarma.com`. In Zadarma, register that SIP user and forward the finished call transcript to `https://<host>/v1/telephony/inbound`.
- `POST /v1/telephony/trunks` with `provider: "byo-sip-trunk"` and `gateways` (prefer the carrier's numeric signaling IP). Then `POST /v1/telephony/numbers` with `provider: "byo-phone-number"`, `e164`, and `credentialId`.

Vonage recipe (untested against a live Vonage account): create the trunk with Vonage's SIP signaling address, attach the DID as `byo-phone-number`, and point Vonage's answer webhook at `/v1/telephony/inbound` with the transcript JSON.

Sinch recipe (untested against a live Sinch account): same BYO SIP steps, using the Sinch SIP endpoint from the Sinch dashboard. Prefer the numeric IP when Sinch publishes one.

`GET /v1/telephony/trunks` returns `hasSecret` and never the password, auth token, or API key.

## Dev setup

**Quick start** (requires Node.js):

```
./scripts/install.sh   # once: npm install (server + client), scaffold .env
# fill in ASSEMBLYAI_API_KEY in .env
./scripts/start.sh      # every time: runs backend + frontend together, Ctrl+C stops both
```

`scripts/install.sh` is idempotent - safe to re-run. `scripts/start.sh` prints the frontend URL once both services are up.

### Manual setup (what the scripts above automate)

1. **AssemblyAI API key**: copy `.env.example` to `.env` at the repo root and set `ASSEMBLYAI_API_KEY`. Never commit `.env` (gitignored) or send the key to the browser - it's read server-side only, by `server/index.js`'s `/v1/token` route and by `server/checks/llmGateway.js` (used from `disclosureCheck.js` and `piiScan.js`).
2. **Run the backend**: `cd server && npm install && npm start` (listens on `:8787`, mints Voice Agent tokens and serves `/v1/analyze-session`). No database - pattern packs and checks are plain code modules.
3. **Run the frontend**: `cd client && npm install && npm run dev` (Vite dev server proxies `/v1/*` to the backend). Open the printed localhost URL. Check the consent box, click Start, allow mic access, talk, then End call - the report generates and saves to history automatically - or skip the mic entirely and click one of the synthetic sample-session buttons.
4. **Run the checks' self-tests**: `cd server && npm test`.

### Regenerating playable sample audio

The six playable MP3s under `client/public/samples/` are tracked in git (see the `!client/public/samples/*.mp3` exception). They are two-speaker recordings (agent = `en-US-GuyNeural`, user = `en-US-JennyNeural`) so the upload demo's AssemblyAI `speaker_labels` diarization returns real multi-turn timestamps. A clone should already have them. Regenerate locally only after editing playable scripts:

```
pip install edge-tts   # once
python3 scripts/generate-sample-audio.py
```

Then sync the `tMs` values in `client/src/sampleSessions.js` to the printed `manifest.json` if the generator had to push turns apart to avoid overlap.

### Deploy (Railway + Railway Postgres)

This app keeps `reportCache` as an in-process `Map` and optionally persists those reports to a Railway Postgres addon so a Railway restart does not re-run 12 LLM Gateway calls. Browser report history is still `localStorage`, not a database. Live-call audio is never stored unless the Try page's "Record this call" checkbox is on, in which case it is uploaded to the Railway bucket - see `server/recordingsStore.js`.

1. New Railway services do not read `railway.toml`. From this repo, with Railway CLI 5.42.1 or newer: `railway login`, then `railway link` (or create a project), then `railway config apply`. That applies `.railway/railway.ts`, which declares both the `complyline` service (`npm run build` / `npm start`) and a linked `postgres` addon whose `DATABASE_URL` is auto-injected into the service. Railway must set `PORT`. Do not add an HTTP healthcheck on `/v1/boot-status`; Express binds `PORT` before the warm.
2. Set the `ASSEMBLYAI_API_KEY` Railway variable. The AssemblyAI key stays on the server. It never goes to the browser.
2a. Optional - per-visitor sign-in for a public demo: set `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` on the server, and `VITE_CLERK_PUBLISHABLE_KEY` (same publishable key) as a client build-time env var. Both unset means no sign-in gate - anyone hitting the URL shares one anonymous trial, exactly as before. Both set gates `/home`, `/try`, `/sessions`, and the analyze/token/transcribe routes behind a Clerk sign-in, so each visitor gets their own trial.
2b. Optional - recording playback storage: create a Railway bucket (`railway bucket create <name>`) and link it to the service with `railway variable set 'RECORDINGS_BUCKET=${{<bucket>.BUCKET}}' 'RECORDINGS_BUCKET_ENDPOINT=${{<bucket>.ENDPOINT}}' 'RECORDINGS_BUCKET_REGION=${{<bucket>.REGION}}' 'RECORDINGS_BUCKET_ACCESS_KEY_ID=${{<bucket>.ACCESS_KEY_ID}}' 'RECORDINGS_BUCKET_SECRET_ACCESS_KEY=${{<bucket>.SECRET_ACCESS_KEY}}'`. All five unset means recordings stay local-only (in-memory blob, dies on reload) - see `server/recordingsStore.js`'s `recordingsConfigured()`.
3. On boot, if `DATABASE_URL` is set, the server runs `server/migrations/*.sql` itself (idempotent `create table if not exists`, see `server/migrate.js`) - no separate migration step needed.
4. Express binds `PORT`, then runs migrations and hydrates the Map from Postgres, then warms any missing Northstar sessions with `patternPackIds` `["generic"]` before `GET /v1/boot-status` flips to `{ ok: true }`. Home never auto-runs the fleet sweep on load - a visitor must click "Run compliance sweep", which then POSTs the 12 sessions if boot is incomplete. It does not invent an 83 percent KPI for a failed cache.
5. Live call audio is written to the Railway bucket only when "Record this call" is checked; otherwise it is never written to disk, the bucket, or Postgres.

Public demo URL: https://2peepsfromaz-production.up.railway.app (Railway project `exemplary-purpose`). Until that host is down, you can still run locally with `./scripts/start.sh`. Local dev does not need `DATABASE_URL`; the in-memory Map is enough.

`GET /v1/boot-status` returns `{ ok, cached, total, error }`.

### Demo credentials (Clerk sign-in)

`server/scripts/demo_credentials.js` creates or removes the 5 demo logins handed to judges when the Clerk sign-in gate is enabled: `judge1+clerk_test@2peepsfromaz.dev` through `judge5+clerk_test@2peepsfromaz.dev`. Sign in with any of these emails and the fixed code **424242** - `+clerk_test` is Clerk's built-in test-email convention, so no real email is sent (verified working against this app's live Clerk instance). Requires `CLERK_SECRET_KEY` set (same as the Railway variable in step 2a above).

```
node server/scripts/demo_credentials.js --add    # or -a
node server/scripts/demo_credentials.js --clear  # or -c
```

`--add` is idempotent per email - a no-op for any that already exist. `--clear` prompts once for confirmation listing all matches and only deletes users that both match one of the 5 fixed demo emails and carry the `isDemo` metadata flag this script sets.

### Architecture

- `server/` - thin Node/Express. `GET /v1/token` mints a short-lived Voice Agent token server-side (the real API key never leaves this process; reused as-is from the earlier build). `POST /v1/analyze-session` runs `server/checks/analyze.js` against a submitted session log and returns a findings report.
- `server/checks/` - the R3-21 mechanisms: `consentCheck.js`, `disclosureCheck.js` (LLM Gateway semantic judgment), `optOutCheck.js` (see `docs/tcpa-optout-check.md`), `piiScan.js` (pattern packs from `patternPacks.js` plus an LLM Gateway free-form-PII pass), `llmGateway.js` (shared LLM Gateway client), and `analyze.js` which composes them - see `docs/guardrails-llm-gateway-integration.md` for how the AssemblyAI calls work. `analyze.test.js` is the self-check, including the HIPAA-pack-as-drop-in-extension demonstration.
- `client/` - React + Vite. `App.jsx` is a minimal hand-rolled router (no dependency): `/` is Landing, `/home` is the Northstar queue, `/sessions` is stored reports, `/sessions/:sessionId` reopens one stored session (`SessionInspector.jsx`, Call/Evaluation tabs, no re-analysis except for a pending live-call entry), `/try` is the lab. `useVoiceAgent.js` connects to `wss://agents.assemblyai.com/v1/ws?token=...` (session-ingestion plumbing: `AudioWorklet` mic capture, PCM16 streaming, gapless `reply.audio` playback scheduling), logs a consent event and a timestamped transcript turn-by-turn, and hands the completed session log to the Try lab when the call ends (`session.ended` or socket close), which saves it to history and analyzes it. `personas.js` offers a neutral default plus 4 selectable domain personas with optional seeded compliance violations - see `AGENTS.md` for details. No live tool-calling.

See `AGENTS.md` for the standing convention on verifying AssemblyAI API docs before writing integration code.

## Submission instructions

1. Build the project in this repo, keeping AssemblyAI's Voice AI APIs as the core of the solution.
2. Deploy a live demo on Railway (long-running Node) with optional Railway Postgres persistence for the server report cache. Do not use Vercel serverless for this process-lifetime cache.
3. Record a demo video (under 5 minutes) and prepare a short slide deck (PDF).
4. Go to the [AssemblyAI Voice Agent Hackathon page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai and submit through the official submission flow before **Sep 30, 2026**, including: title, descriptions, tags, cover image, video link, slides, this GitHub repo link, and the live demo URL.
5. Register with whichever email you prefer - a company email is welcome but not required.
