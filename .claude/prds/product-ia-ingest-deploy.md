---
name: product-ia-ingest-deploy
description: Split ComplyLine into Vanta-like IA, honest review states, paste/upload ingest, and a deployed demo with warm-cached samples.
status: backlog
created: 2026-09-13T01:03:09Z
---

# PRD: product-ia-ingest-deploy

## Executive Summary

Session B turns the working 12-session demo spine into a product-shaped app: Landing vs Home vs Sessions vs Try, honest review states, paste-session JSON with an upload consent checkbox, and a live Vercel/Replit deploy with sample MP3s and a warm cache of the 12 sessions on boot. This epic starts after Session A (`demo-spine`) ships.

## Problem Statement

`App.jsx` currently has `/` (Landing), `/dashboard` (lab + fleet + report), and `/history`. Judges and operators share one crowded Review screen. Nav is Review · History, not Home · Sessions · Try. Review has no first-class idle / loading / error / Critical / High / Clear states. There is no paste-JSON ingest path and no dedicated upload consent checkbox. The hackathon requires a live deployed demo; sample MP3s are gitignored and must be generated for clones; the 12-session program should be warm-cached on boot rather than 429ing the first judge.

## User Stories

### Judge
- As a judge, I understand the product from `/` then enter a Home of KPIs and a flagged queue, not a microphone.
  - Acceptance: nav is Home · Sessions · Try; Get started still leads to Home (`/home`).
- As a judge, I can open `/sessions`, click a row, and land on `/sessions/:id` with the same Report UI and visible review state (Critical / High / Clear, or loading / error).
- As a judge, I can try a live/upload/sample path on `/try` without it being the default landing after Get started.

### Operator
- As an operator, I can paste a session JSON (and/or upload audio) on `/try` after checking an explicit recording/upload consent checkbox.
  - Acceptance: paste and upload are blocked until consent is checked.
- As a teammate cloning the repo, I get sample MP3s or a documented generate path, and a deployed URL exists.

## Functional Requirements

1. **Split IA** in `client/src/App.jsx` (and chrome in `Chrome.jsx`):
   - `/` Landing
   - `/home` KPIs + flagged queue (12-session program from Session A)
   - `/sessions` list
   - `/sessions/:id` report
   - `/try` lab (live / upload / samples)
   - Nav: **Home · Sessions · Try**
2. **Review states** on the report surface: idle, loading, error, Critical, High, Clear. Must be real states driven by stored/analyzed findings — not decorative.
3. **Paste session JSON** on `/try` plus an **upload consent checkbox**. Live/upload/samples stay on `/try`.
4. **Deploy** to Vercel or Replit (hackathon-allowed). Ship sample MP3s for clone (generate script + committed files or a clone-time generate that is documented). Warm-cache the 12 Northstar sessions on server boot so the first judge does not pay a cold Gateway burst.

## Non-Functional Requirements

- Same brand lock as Session A: paper / ink / navy; Source Serif 4 + Inter. Vanta IA, not Vanta purple. No incident.io orange.
- No login.
- Steal Vanta information architecture (home / findings queue / resource detail / test-in-lab), not visual clone.
- Deploy target is Streamlit, Replit, or Vercel per hackathon rules; prefer Vercel/Replit for this React+Express app.
- Monitoring widgets stay honest: counts come from analyzed transcripts.

## Success Criteria

- Routes listed above resolve; old `/dashboard` and `/history` either redirect or are removed from nav.
- Nav labels are Home · Sessions · Try.
- Report UI shows idle, loading, error, Critical, High, Clear as distinct states.
- Paste JSON analyzes the same pipeline as samples (`POST /v1/analyze-session`).
- Upload requires consent checkbox.
- Public demo URL is reachable; boot logs or a health path show the 12 sessions warm-cached.
- Clone can play sample MP3s without a secret generate step undocumented in README.

## Constraints & Assumptions

- **Lock:** implement in `hackathons/2peepsfromAZ`. Session A must ship first (mutex, 12-session program, reopenable reports, Get started → summary).
- Do not rewrite landing marketing copy beyond what IA/nav requires.
- Keep AssemblyAI as the only voice/LLM provider.

## Out of Scope

- Login / SSO
- New pattern packs
- Postgres
- Rust rewrite
- Live coaching
- More Paper rebrands
- Mobile app
- Landing copy rewrite (beyond IA/nav wiring)
- Session A items (mutex, NER, 12-session catalog, history payload) — those belong to `demo-spine`

## Dependencies

- Completes after `demo-spine` (Session A).
- Files: `client/src/App.jsx`, `Dashboard.jsx`, `History.jsx`, `Chrome.jsx`, `Landing.jsx`, `reportHistory.js`, `server/index.js`, `scripts/`, `README.md`
