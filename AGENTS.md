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

Product (R3-21, selected idea - see `docs/hackathon-ideas.md`): a **post-hoc session compliance report**. It ingests one completed AssemblyAI Voice Agent API session and flags: (1) whether a TCPA consent event was logged before the call, (2) whether the AI nature of the call was disclosed in the first few seconds (state disclosure laws, e.g. CA AB 2905), (3) a generic PII-pattern scan (SSN/credit-card/account-number shapes) via a pluggable pattern-set architecture (`server/checks/patternPacks.js`), with a HIPAA identifier pack shipped as a real drop-in extension. This is **not** a live conversational advisor - the report is the deliverable, not a spoken conversation. Stack: React+Vite frontend, Node/Express backend, no database (pattern packs and checks are plain code modules, not stored rules). Uses AssemblyAI's managed Voice Agent API (`wss://agents.assemblyai.com/v1/ws`) purely for session-ingestion plumbing (token mint, mic capture, transcript log). See `README.md` for architecture and run/test instructions.

An earlier build drifted into a live CCPA/CPRA Q&A voice advisor that was never the selected idea; that direction was reverted in favor of the above.

**Live-call audio is never stored - only the checked-in fact, so don't assume otherwise.** `client/src/useVoiceAgent.js` streams mic PCM to AssemblyAI and plays reply PCM back through the Web Audio API in real time; neither is written to disk, blob storage, or a DB - only the text transcript (with per-turn `tMs`) is kept, in React state, lost on reload. `recordingConsentCheck.js`/`consentCheck.js` verify that recording/consent language was *declared* (spoken, or a `consentEvent` flag), not that audio was actually captured. The demo-upload path (`POST /v1/transcribe-upload`, via AssemblyAI's pre-recorded STT - a different product from the Voice Agent API) is the only path with real audio available for playback, since the client keeps the uploaded `File` as a local blob URL; every finding (from every check except `consent`, which has no audio position) carries a `tMs` so the UI can seek that player to it.

## Standing convention: verify AssemblyAI docs before writing integration code

**Before writing or modifying any AssemblyAI integration code**, fetch `https://www.assemblyai.com/docs/llms-full.txt` live (it's ~95k lines; grep it, don't try to read it whole) and check the relevant `/docs/voice-agents/...` pages as needed. Do not rely on memorized/training-data parameter names or event shapes - this API has changed since most models' training cutoffs, and the docs disagree with common LLM assumptions in specific, easy-to-miss ways (verified live 2026-09-03):

- The session-config field for domain vocabulary is `session.input.keyterms` (a plain array), **not** `keyterms_prompt` - that name is used by the separate Streaming STT product, not the Voice Agent API.
- To cleanly end a Voice Agent session, send `{"type": "session.end"}` and wait for `session.ended`, **not** `{"type": "Terminate"}` - `Terminate` is the Streaming STT product's close message. Closing the socket without `session.end` leaves the session resumable (and billable) for 30 seconds.
- Tool definitions in `session.tools` use AssemblyAI's own flat schema (`{type: "function", name, description, parameters}`), not OpenAI's nested `{type: "function", function: {...}}` form.
- `reply.audio` carries its payload in the `data` field; `input.audio` carries it in the `audio` field - easy to conflate.
- The `GET /v1/voices` endpoint mentioned in prose docs is not a working REST endpoint in practice (returns a 426 WebSocket-upgrade response) - trust the documented voice catalog instead (e.g. `anna` is the spec-documented default).

When something you need isn't obviously in the docs dump, don't guess - grep harder or ask.

## Dependency hygiene

`server/package-lock.json` and `client/package-lock.json` are committed - do not gitignore them. `server/package.json` pins `qs` via an `overrides` entry (body-parser hard-pins a vulnerable `qs` version transitively; the override is the fix, not a workaround to remove later). `client/package.json` is on Vite 7.x deliberately, not the audit-suggested Vite 8 - v8 ships the experimental rolldown-vite engine and `@vitejs/plugin-react` doesn't officially peer-support it yet. On a fresh macOS install `npm install` warns that `fsevents`'s install script isn't in `allowScripts`; that's expected and safe to leave unapproved (fsevents is an optional macOS-only file-watcher acceleration, not required for `vite`/`npm test`/`npm run build` to work).

## Maintaining this file

Keep this file proportionate: durable, project-wide facts only (constraints, architecture, how to run things). Prefer pointing at the authoritative file/command over duplicating details that will drift. Update it when the product direction, stack, or hard constraints change - not for routine feature work.
