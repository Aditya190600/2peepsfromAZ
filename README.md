# 2peepsfromAZ - ComplyLine

Submission for the [AssemblyAI Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai.

**ComplyLine** is a voice-agent compliance/legal-risk checker built on AssemblyAI's Voice Agent API. It ingests one voice-agent session and produces a scoped compliance report against a core, industry-agnostic check set that applies to any company running an AI voice agent:

1. Was a valid consent event logged before the call (TCPA).
2. Was the AI nature of the call disclosed at the start (state disclosure laws, e.g. California AB 2905).
3. A general PII-pattern scan (SSN, credit-card numbers, account-number shapes) over the transcript.

Industry-specific pattern packs (HIPAA identifiers for healthcare, finance/insurance account formats, etc.) ship as optional drop-in extensions on top of the core checks, not a hard requirement to be useful out of the box. See `docs/hackathon-ideas.md` for the full research and scoring behind this pick.

**Why this idea:** nothing found does a free, narrow, single-session compliance checker for voice agents - the closest existing tools (Hamming/LiveKit compliance features) are bundled into big paid observability platforms. The addressable market is any company running a voice agent, not one vertical. It scores High across all four hackathon judging criteria: Application of Technology (session log, Guardrails, and LLM Gateway all doing real, central work), Presentation (a report of concrete flagged findings demos cleanly), Business Value (broad buyer-side need, not a niche dev tool), and Originality.

**Target outcomes:** a working session-ingestion pipeline that flags consent-event-logged, AI-disclosure-timing, and PII-pattern findings against a real or synthetic Voice Agent API session, plus at least one industry-specific pattern pack (e.g. HIPAA) demoed as a real drop-in extension rather than just described.

**Status:** product direction is decided; the voice pipeline is under active development (see the `voice-pipeline` work).

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

## Dev setup

1. **AssemblyAI API key**: sign up at [assemblyai.com](https://www.assemblyai.com/) and grab an API key from the dashboard. Do not commit it - it's read from an environment variable (e.g. `ASSEMBLYAI_API_KEY`) via a local `.env` file, gitignored.
2. **Tech stack**: a thin backend that mints short-lived Voice Agent tokens and grounds compliance checks against a seeded ruleset, plus a frontend that talks to the Voice Agent API session directly.
3. **Running/testing**: exact run/test commands land in `AGENTS.md` alongside the pipeline work.

## Submission instructions

1. Build the project in this repo, keeping AssemblyAI's Voice AI APIs as the core of the solution.
2. Deploy a live demo on Streamlit, Replit, or Vercel.
3. Record a demo video (under 5 minutes) and prepare a short slide deck (PDF).
4. Go to the [AssemblyAI Voice Agent Hackathon page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai and submit through the official submission flow before **Sep 30, 2026**, including: title, descriptions, tags, cover image, video link, slides, this GitHub repo link, and the live demo URL.
5. Register with whichever email you prefer - a company email is welcome but not required.
