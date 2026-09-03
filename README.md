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

## Product: ComplyLine

A voice compliance advisor. Talk to it about **California CCPA/CPRA** consumer privacy rights (the only jurisdiction/regulation the demo grounds answers in - see `server/seed.js` for the full ruleset). Uses AssemblyAI's managed Voice Agent API (STT + LLM + TTS + turn detection in one WebSocket) with a `check_regulation` tool that queries a real Postgres table instead of letting the LLM improvise legal advice.

**Why this idea:** nothing else offers a free, narrow, real-time compliance advisor scoped to a single regulatory domain - existing compliance tooling is bundled into big paid platforms aimed at enterprises, not a lightweight voice interface a consumer or small business can just talk to. The addressable market extends past CCPA/CPRA to any regulatory domain worth grounding this way. It scores well across the hackathon's four judging criteria: Application of Technology (the Voice Agent API, tool-call grounding, and a real Postgres ruleset are all doing central work, not decoration), Presentation (a live back-and-forth voice conversation demos more compellingly than a static report), Business Value (compliance guidance is a real recurring need, not a novelty), and Originality (a grounded, narrow-domain voice advisor rather than a generic chatbot wrapper).

## Dev setup

1. **AssemblyAI API key**: copy `.env.example` to `.env` at the repo root and set `ASSEMBLYAI_API_KEY`. Never commit `.env` (gitignored) or send the key to the browser - only `server/index.js`'s `/v1/token` route reads it.
2. **Postgres**: `createdb complyline`, then `cd server && node seed.js` to create and seed the `regulations` table (set `DATABASE_URL` in `.env` if not using the default `postgres://localhost:5432/complyline`).
3. **Run the backend**: `cd server && npm install && npm start` (listens on `:8787`, mints Voice Agent tokens and serves `/v1/check-regulation`).
4. **Run the frontend**: `cd client && npm install && npm run dev` (Vite dev server proxies `/v1/*` to the backend). Open the printed localhost URL, click Start, allow mic access.

### Architecture

- `server/` - thin Node/Express. `GET /v1/token` mints a short-lived Voice Agent token server-side (the real API key never leaves this process). `POST /v1/check-regulation` looks up a topic/jurisdiction in Postgres for tool-call grounding.
- `client/` - React + Vite. Connects directly to `wss://agents.assemblyai.com/v1/ws?token=...`, captures mic audio via an `AudioWorklet` (browser `MediaRecorder` can't emit raw PCM16), streams `input.audio` (PCM16 mono 24kHz, base64), and schedules `reply.audio` PCM chunks back-to-back against `AudioContext.currentTime` (no sleep-based timing) for gapless playback.
- Tool grounding: `session.update` registers a flat-schema `check_regulation(topic, jurisdiction)` tool. When the agent emits `tool.call`, the browser calls the backend's `/v1/check-regulation`, then sends `tool.result` back over the same WebSocket.

See `AGENTS.md` for the standing convention on verifying AssemblyAI API docs before writing integration code.

## Submission instructions

1. Build the project in this repo, keeping AssemblyAI's Voice AI APIs as the core of the solution.
2. Deploy a live demo on Streamlit, Replit, or Vercel.
3. Record a demo video (under 5 minutes) and prepare a short slide deck (PDF).
4. Go to the [AssemblyAI Voice Agent Hackathon page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai and submit through the official submission flow before **Sep 30, 2026**, including: title, descriptions, tags, cover image, video link, slides, this GitHub repo link, and the live demo URL.
5. Register with whichever email you prefer - a company email is welcome but not required.
