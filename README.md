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

## Dev setup

**Placeholder - this repo is an empty scaffold.** No product idea, tech stack, or codebase exists yet. This section will be rewritten once a direction is picked. For now:

1. **AssemblyAI API key**: sign up at [assemblyai.com](https://www.assemblyai.com/) and grab an API key from the dashboard. Do not commit it - once code exists, it will be read from an environment variable (e.g. `ASSEMBLYAI_API_KEY`) via a local `.env` file, gitignored.
2. **Tech stack**: TBD. Likely candidates given the AssemblyAI Voice Agent focus: a backend/orchestration layer calling AssemblyAI's Streaming STT or Voice Agent API, plus a frontend or voice interface. This will be filled in once the team picks a concrete idea.
3. **Running/testing**: TBD - will document exact run/test commands once there's code to run.

## Submission instructions

1. Build the project in this repo, keeping AssemblyAI's Voice AI APIs as the core of the solution.
2. Deploy a live demo on Streamlit, Replit, or Vercel.
3. Record a demo video (under 5 minutes) and prepare a short slide deck (PDF).
4. Go to the [AssemblyAI Voice Agent Hackathon page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai and submit through the official submission flow before **Sep 30, 2026**, including: title, descriptions, tags, cover image, video link, slides, this GitHub repo link, and the live demo URL.
5. Register with whichever email you prefer - a company email is welcome but not required.
