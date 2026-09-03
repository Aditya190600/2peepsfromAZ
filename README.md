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
2. **AI-disclosure-timing** (e.g. CA AB 2905): was the AI nature of the call disclosed within the first few seconds.
3. **Generic PII-pattern scan**: SSN / credit-card / account-number shapes, via a pluggable pattern-set architecture (`server/checks/patternPacks.js`).

A **HIPAA identifier pattern pack** (`server/checks/patternPacks.js`'s `hipaaPack`) ships as a real drop-in extension on top of the generic scan - see `server/checks/analyze.test.js` for a runnable demonstration that the generic scan alone misses HIPAA identifiers while enabling the HIPAA pack catches them, with no core-code changes.

**Why this idea:** see `docs/hackathon-ideas.md`'s R3-21 entry for the full novelty/scoring rationale. In short: no scoped, protocol-level, industry-agnostic-first compliance checker for AI voice agents was found built anywhere; the addressable market is any company running a voice agent, not one vertical.

## Dev setup

**Quick start** (requires Node.js and a local PostgreSQL install with `createdb`/`psql` on PATH):

```
./scripts/install.sh   # once: npm install (server + client), create + seed the DB, scaffold .env
# fill in ASSEMBLYAI_API_KEY in .env
./scripts/start.sh      # every time: runs backend + frontend together, Ctrl+C stops both
```

`scripts/install.sh` is idempotent - safe to re-run. `scripts/start.sh` prints the frontend URL once both services are up.

### Manual setup (what the scripts above automate)

1. **AssemblyAI API key**: copy `.env.example` to `.env` at the repo root and set `ASSEMBLYAI_API_KEY`. Never commit `.env` (gitignored) or send the key to the browser - only `server/index.js`'s `/v1/token` route reads it.
2. **Run the backend**: `cd server && npm install && npm start` (listens on `:8787`, mints Voice Agent tokens and serves `/v1/analyze-session`). No database - pattern packs and checks are plain code modules.
3. **Run the frontend**: `cd client && npm install && npm run dev` (Vite dev server proxies `/v1/*` to the backend). Open the printed localhost URL. Check the consent box, click Start, allow mic access, talk, then End call and Generate report - or skip the mic entirely and click one of the synthetic sample-session buttons.
4. **Run the checks' self-tests**: `cd server && npm test`.

### Architecture

- `server/` - thin Node/Express. `GET /v1/token` mints a short-lived Voice Agent token server-side (the real API key never leaves this process; reused as-is from the earlier build). `POST /v1/analyze-session` runs `server/checks/analyze.js` against a submitted session log and returns a findings report.
- `server/checks/` - the R3-21 mechanisms: `consentCheck.js`, `disclosureCheck.js`, `piiScan.js` (runs a list of pluggable pattern packs from `patternPacks.js` against every transcript turn), and `analyze.js` which composes them. `analyze.test.js` is the self-check, including the HIPAA-pack-as-drop-in-extension demonstration.
- `client/` - React + Vite. `useVoiceAgent.js` connects to `wss://agents.assemblyai.com/v1/ws?token=...` (session-ingestion plumbing reused from the earlier build: `AudioWorklet` mic capture, PCM16 streaming, gapless `reply.audio` playback scheduling), logs a consent event and a timestamped transcript turn-by-turn, and hands the completed session log to `App.jsx` on `session.ended` for analysis. No live tool-calling and no domain persona - the agent config is neutral.

See `AGENTS.md` for the standing convention on verifying AssemblyAI API docs before writing integration code.

## Submission instructions

1. Build the project in this repo, keeping AssemblyAI's Voice AI APIs as the core of the solution.
2. Deploy a live demo on Streamlit, Replit, or Vercel.
3. Record a demo video (under 5 minutes) and prepare a short slide deck (PDF).
4. Go to the [AssemblyAI Voice Agent Hackathon page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai and submit through the official submission flow before **Sep 30, 2026**, including: title, descriptions, tags, cover image, video link, slides, this GitHub repo link, and the live demo URL.
5. Register with whichever email you prefer - a company email is welcome but not required.
