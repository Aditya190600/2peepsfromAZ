# AGENTS.md

Project context for coding agents working in this repo.

## What this is

Submission repo for the **AssemblyAI Voice Agent Hackathon** (lablab.ai, Sep 1-30 2026, online, month-long, $10k prize pool). Two-person team: repo owner (Aditya190600) + collaborator (sujeevraja). Currently an empty scaffold - no product idea has been chosen yet. See `README.md` for full hackathon requirements.

## Hard constraints (do not violate)

- **AssemblyAI-only voice infrastructure.** Any speech-to-text, voice agent, or real-time transcription functionality must go through AssemblyAI's Streaming API / Voice Agent APIs. Do not swap in another provider (Whisper, Deepgram, Google STT, etc.) for the core voice pipeline - that breaks hackathon eligibility.
- **Deadline: Sep 30, 2026.** This is a fixed submission date, not a soft target.
- **Team size: 2.** Scope decisions accordingly - favor a demoable, judged-well project over an ambitious multi-service build neither person can maintain solo.
- **Submission needs a live deployed demo** on Streamlit, Replit, or Vercel, plus a public GitHub repo (this one) and a <5min demo video. Whatever stack gets picked, make sure it's deployable to one of those three targets.

## Current state

No product idea, architecture, or code exists yet. Once the team picks a direction, update this file with:
- The actual product/idea and target user
- Chosen tech stack and why
- Repo layout
- How to run/test locally

Don't speculate about these ahead of that decision - keep this file accurate to what actually exists, not what might be built.

## Maintaining this file

Keep this file proportionate: durable, project-wide facts only (constraints, architecture, how to run things). Prefer pointing at the authoritative file/command over duplicating details that will drift. Update it when the product direction, stack, or hard constraints change - not for routine feature work.
