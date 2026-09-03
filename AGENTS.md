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

Product: **ComplyLine**, a voice compliance advisor for California CCPA/CPRA (only jurisdiction covered - see `server/seed.js`). Stack: React+Vite frontend, Node/Express backend, Postgres for the compliance ruleset. Uses AssemblyAI's managed Voice Agent API (`wss://agents.assemblyai.com/v1/ws`). See `README.md` for architecture and run/test instructions.

## Standing convention: verify AssemblyAI docs before writing integration code

**Before writing or modifying any AssemblyAI integration code**, fetch `https://www.assemblyai.com/docs/llms-full.txt` live (it's ~95k lines; grep it, don't try to read it whole) and check the relevant `/docs/voice-agents/...` pages as needed. Do not rely on memorized/training-data parameter names or event shapes - this API has changed since most models' training cutoffs, and the docs disagree with common LLM assumptions in specific, easy-to-miss ways (verified live 2026-09-03):

- The session-config field for domain vocabulary is `session.input.keyterms` (a plain array), **not** `keyterms_prompt` - that name is used by the separate Streaming STT product, not the Voice Agent API.
- To cleanly end a Voice Agent session, send `{"type": "session.end"}` and wait for `session.ended`, **not** `{"type": "Terminate"}` - `Terminate` is the Streaming STT product's close message. Closing the socket without `session.end` leaves the session resumable (and billable) for 30 seconds.
- Tool definitions in `session.tools` use AssemblyAI's own flat schema (`{type: "function", name, description, parameters}`), not OpenAI's nested `{type: "function", function: {...}}` form.
- `reply.audio` carries its payload in the `data` field; `input.audio` carries it in the `audio` field - easy to conflate.
- The `GET /v1/voices` endpoint mentioned in prose docs is not a working REST endpoint in practice (returns a 426 WebSocket-upgrade response) - trust the documented voice catalog instead (e.g. `anna` is the spec-documented default).

When something you need isn't obviously in the docs dump, don't guess - grep harder or ask.

## Maintaining this file

Keep this file proportionate: durable, project-wide facts only (constraints, architecture, how to run things). Prefer pointing at the authoritative file/command over duplicating details that will drift. Update it when the product direction, stack, or hard constraints change - not for routine feature work.
