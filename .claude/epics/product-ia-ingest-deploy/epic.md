---
name: product-ia-ingest-deploy
status: backlog
created: 2026-09-13T01:03:09Z
updated: 2026-09-13T01:15:00Z
progress: 0%
prd: .claude/prds/product-ia-ingest-deploy.md
github: https://github.com/Aditya190600/2peepsfromAZ/issues/35
---

# Epic: product-ia-ingest-deploy

## Overview

Session B — product information architecture, ingest, and deploy. Split the current Landing / Dashboard / History app into `/`, `/home`, `/sessions`, `/sessions/:id`, `/try` with nav Home · Sessions · Try. Add honest review states, paste-session JSON + upload consent, then deploy (Vercel/Replit) with sample MP3s and a boot-time warm cache of the 12 Northstar sessions. Starts after `demo-spine`.

## Architecture Decisions

- **Steal Vanta IA, not paint.** Keep ComplyLine tokens (paper/ink/navy, Source Serif 4 + Inter).
- **Hand-rolled router in `App.jsx` stays** — no new router library unless it is already there.
- **Home is not Try.** Get started → `/home`. Mic/upload/samples/paste live on `/try`.
- **Warm-cache on boot** in `server/index.js` (or a small module it calls): analyze the 12 program sessions once at startup, store in memory, serve Home/KPIs without a cold Gateway burst. Do not fake counts if cache fails — show error/loading honestly.
- **Sample MP3s**: generated via `scripts/generate-sample-audio.py`; document clone steps; commit or provide a reliable generate-on-clone path despite `*.mp3` gitignore (prefer committing demo MP3s or changing gitignore for `client/public/samples/` demo set).

## Technical Approach

### Frontend Components

- `client/src/App.jsx` — route table
- `client/src/Chrome.jsx` — nav Home · Sessions · Try
- `client/src/Dashboard.jsx` — split into Home / Sessions list / Report / Try as needed (extract rather than duplicate report UI)
- `client/src/History.jsx` — becomes `/sessions` list or redirects
- `client/src/Landing.jsx` — stays `/`; Get started → `/home`
- Review state styling in existing CSS (`App.css`)

### Backend Services

- `server/index.js` — boot warm-cache of 12 sessions; optional cache GET
- `server/checks/analyze.js` — reuse; no new checks
- Upload path already at `POST /v1/transcribe-upload`; paste uses `POST /v1/analyze-session`

### Infrastructure

- Vercel or Replit deploy (Express + Vite static)
- Sample audio generation script already exists

## Implementation Strategy

1. Split routes/nav (foundation).
2. Review states on the report view.
3. Paste JSON + consent checkbox on `/try`.
4. Deploy + MP3s + warm-cache last (needs A + B UI to be worth hosting).

## Task Breakdown Preview

1. Split IA routes and nav
2. Review states (idle/loading/error/Critical/High/Clear)
3. Paste session JSON + upload consent checkbox
4. Deploy, sample MP3s, warm-cache 12 on boot

## Dependencies

- Epic `demo-spine` must be done (12-session catalog, stored findings, mutex).
- Hackathon deploy targets: Streamlit, Replit, or Vercel.

## Success Criteria (Technical)

- Routes and nav match the spec.
- Review states are distinct and data-driven.
- Paste JSON + consent gate work.
- Deployed URL + boot cache + cloneable sample audio.

## Estimated Effort

~14–20 hours across 4 tasks. Deploy is the long pole if hosting Express on Vercel needs an adapter.

## Tasks Created

- [ ] 36.md - Split IA routes and nav (parallel: false) https://github.com/Aditya190600/2peepsfromAZ/issues/36
- [ ] 37.md - Review states idle loading error severities (parallel: true) https://github.com/Aditya190600/2peepsfromAZ/issues/37
- [ ] 38.md - Paste session JSON and upload consent (parallel: true) https://github.com/Aditya190600/2peepsfromAZ/issues/38
- [ ] 39.md - Deploy sample MP3s and warm-cache (parallel: false) https://github.com/Aditya190600/2peepsfromAZ/issues/39

Total tasks: 4
Parallel tasks: 2
Sequential tasks: 2
Estimated total effort: 17 hours
