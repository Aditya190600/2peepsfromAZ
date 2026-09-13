---
name: demo-spine
description: Ship a judge-ready 12-session Northstar Voice demo that analyzes without LLM error cards and reopens stored reports.
status: backlog
created: 2026-09-13T01:03:09Z
---

# PRD: demo-spine

## Executive Summary

Session A is the must-ship first slice of ComplyLine. Judges must land on a 12-session Northstar Voice program (10 pass / 2 flagged = 83%), click a session, and see a real stored report — not a 57-session lab, not a live mic, and not a burst of LLM Gateway error cards. Implementation happens in `hackathons/2peepsfromAZ`. Paper mocks stop here.

## Problem Statement

The current app still behaves like a lab: `sampleSessions.js` plus generated fixtures produce a large fleet; `llmGateway.js` has retry/backoff but no process-wide mutex, so `analyze.js`'s `Promise.all` (disclosure + NER) plus client fleet concurrency still 429s a cold 12-session run; NER in `piiScan.js` treats organization names such as "Acme Support" as PII flags; `reportHistory.js` stores verdict metadata only, so History cannot reopen the same Report UI. "Get started" currently routes to `/dashboard` (the mic/upload lab), not a program-home summary.

## User Stories

### Judge / demo viewer
- As a hackathon judge, I click **Get started** and land on a 12-session Northstar Voice home (KPIs + flagged queue), not the live-mic lab.
  - Acceptance: `/` Get started does not open the mic; it opens the 12-session summary.
- As a judge, I see 12 sessions, 10 pass, 2 flagged, 83% compliance, with IDs `sess_tcpa_04` (Critical), `sess_late_01` (High), `sess_clean_01` (Clear).
  - Acceptance: the 57-session generated lab is hidden from this home; tenant copy is Northstar Voice / `legal@northstarvoice.com` (display copy only — no auth).
- As a judge, I click a History row or a session and see the same Report UI that was produced when the transcript was analyzed.
  - Acceptance: route `/sessions/:sessionId` (or equivalent until routes split) shows stored findings, not a re-analysis that can 429.

### Operator (team)
- As a developer, I can cold-run the 12-session program and get zero LLM Gateway error cards.
  - Acceptance: tests cover mutex serialization and NER not flagging "Acme Support".

## Functional Requirements

1. **LLM mutex** in `server/checks/llmGateway.js`: at most one in-flight AssemblyAI LLM Gateway HTTP call per process. `analyze.js` may still compose checks in `Promise.all`; the mutex serializes the actual network calls (disclosure + NER).
2. **NER scope** in `server/checks/piiScan.js`: do not flag spoken organization / support-desk names such as "Acme Support" as PII findings. Names of people, emails, phones, and street addresses remain in scope. Tests must pin this.
3. **12-session Northstar Voice program** in `client/src/sampleSessions.js` (and Dashboard home rendering): exactly 12 sessions; 10 pass / 2 flagged / 83%. Required IDs and severities: `sess_tcpa_04` Critical, `sess_late_01` High, `sess_clean_01` Clear. Hide the 57-session generated lab from this demo path.
4. **Tenant copy**: Northstar Voice and `legal@northstarvoice.com` as display tenant — not login, not SSO.
5. **Honest monitoring**: Home KPIs / monitoring counts only if transcripts actually produced those findings. Do not fake widgets.
6. **Reopenable reports**: `reportHistory.js` stores full findings (and enough session metadata to render the Report UI). History/session click opens that UI. Prefer route `/sessions/:sessionId` even if other routes are not split yet (`Dashboard.jsx` / `App.jsx` / `History.jsx`).
7. **Get started** opens this 12-session summary Home, not the mic. May live in `Dashboard.jsx` if routes are not split yet.

## Non-Functional Requirements

- Brand lock: ComplyLine tokens (paper / ink / navy; Source Serif 4 + Inter). Steal Vanta information architecture, not paint. No Vanta purple. No incident.io orange.
- No login / SSO.
- AssemblyAI-only for STT / Voice Agent / LLM Gateway (hackathon eligibility).
- No database: localStorage history remains acceptable.
- Cold 12-session run must be demo-safe on the account's ~2 calls / 30s Gateway limit.

## Success Criteria

- Cold 12-session run: **zero** error cards (`status: error` / "Unable to run" from Gateway 429s).
- NER does not flag `"Acme Support"`; tests fail if it does.
- Demo home shows **12** sessions, **10** pass, **2** flagged, **83%**.
- `sess_tcpa_04` Critical, `sess_late_01` High, `sess_clean_01` Clear.
- Clicking History or a session ID opens the stored report (same findings), via `/sessions/:sessionId` if routing exists or an equivalent in `Dashboard.jsx`.
- Get started does not start the mic.
- 57-session lab is not the default demo path.

## Constraints & Assumptions

- **Lock (do not reopen):** Stop Paper mocks. Implement in `hackathons/2peepsfromAZ`. Steal Vanta IA not paint. ComplyLine tokens. No login. No Vanta purple / incident.io orange.
- Session A **must ship before** Session B (product IA split, paste ingest, deploy).
- Existing `mapWithConcurrency` on the client is not a substitute for a server-side Gateway mutex.
- `analyze.js` currently fires disclosure + PII NER concurrently; mutex belongs in `llmGateway.js`.

## Out of Scope

- Login / SSO
- New pattern packs
- Postgres
- Rust rewrite
- Live coaching
- Further Paper rebrands
- Mobile app
- Landing copy rewrite
- Session B work: route split (`/` `/home` `/sessions` `/try`), review-state polish, paste JSON + upload consent checkbox, Vercel/Replit deploy, sample MP3s, warm-cache on boot

## Dependencies

- Existing report pipeline: `server/checks/analyze.js`, `disclosureCheck.js`, `piiScan.js`, `llmGateway.js`
- Client: `client/src/sampleSessions.js`, `Dashboard.jsx`, `App.jsx`, `History.jsx`, `reportHistory.js`
- Tests: `server/checks/analyze.test.js` (extend; add mutex/NER coverage)
