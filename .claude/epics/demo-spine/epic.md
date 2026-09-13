---
name: demo-spine
status: backlog
created: 2026-09-13T01:03:09Z
updated: 2026-09-13T01:15:00Z
progress: 0%
prd: .claude/prds/demo-spine.md
github: https://github.com/Aditya190600/2peepsfromAZ/issues/30
---

# Epic: demo-spine

## Overview

Session A — the demo spine that must ship first. Make a cold 12-session Northstar Voice run judge-safe (one in-flight LLM Gateway call, NER that does not flag "Acme Support"), replace the 57-session lab as the default path with a 12-session program (10 pass / 2 flagged / 83%), persist full findings so History/session click reopens the Report UI, and send Get started to that summary instead of the mic.

## Architecture Decisions

- **Mutex lives in `llmGateway.js`**, not in each check and not only in the client's `mapWithConcurrency`. `analyze.js` keeps `Promise.all` composition; serialized `fetch` is the Gateway contract.
- **NER is a prompt + test contract** in `piiScan.js`: organization/support-desk names in greetings are out of scope; person names / emails / phones / street addresses stay in.
- **No database.** `reportHistory.js` localStorage grows to store findings + session id so reopen does not re-call Gateway.
- **Routes may still be folded into `Dashboard.jsx`** for this epic. Prefer `/sessions/:sessionId` if cheap; do not block Session A on the full IA split (that is Session B).
- **Hide, don't delete** the 57-session generator until Session B's `/try` lab needs samples — default demo path must not show it.

## Technical Approach

### Frontend Components

- `client/src/sampleSessions.js` — replace/limit default catalog to 12 Northstar Voice sessions with required IDs.
- `client/src/Dashboard.jsx` — Home/summary for 12 sessions; Get started target; hide 57-session lab; honest KPI counts from real reports.
- `client/src/App.jsx` — Get started → summary; optional `/sessions/:sessionId`.
- `client/src/History.jsx` — click row → reopen stored report.
- `client/src/reportHistory.js` — persist findings (and label, sessionId, verdict, timestamp).

### Backend Services

- `server/checks/llmGateway.js` — process-wide mutex (queue) around the Gateway `fetch`.
- `server/checks/piiScan.js` — NER scope; tests that "Acme Support" is not an org PII hit.
- `server/checks/analyze.js` — no API change required if mutex is inside the gateway client; `Promise.all` may stay.
- Tests in `server/checks/analyze.test.js` and/or a new `llmGateway` / `piiScan` test file.

### Infrastructure

- None. No Postgres. No new hosts in this epic.

## Implementation Strategy

Ship in this order: mutex + NER tests first (unblocks any 12-run), then the 12-session catalog + tenant copy, then history reopen, then Get started wiring (can land in Dashboard if App routes wait for Session B).

## Task Breakdown Preview

1. LLM mutex + NER scope + tests (backend, parallel)
2. 12-session Northstar Voice program + hide 57-session lab (frontend catalog)
3. Reopenable reports via stored findings + `/sessions/:sessionId`
4. Get started → 12-session summary (depends on catalog)

## Dependencies

- AssemblyAI LLM Gateway account limit (~2 calls / 30s) — mutex is the mitigation.
- Existing checks: consent, disclosure, recording consent, opt-out, PII.

## Success Criteria (Technical)

- Unit/integration tests: mutex allows only one in-flight Gateway call; NER ignores "Acme Support".
- Cold 12-session run: zero error cards.
- Catalog: 12 / 10 / 2 / 83% with specified session IDs and severities.
- `saveHistoryEntry` includes findings; History click renders them.
- Get started does not open the mic.

## Estimated Effort

~12–16 hours across 4 tasks (S/M). Session A is the critical path for the hackathon demo.

## Tasks Created

- [ ] 31.md - LLM mutex and NER scope (parallel: true) https://github.com/Aditya190600/2peepsfromAZ/issues/31
- [ ] 32.md - 12-session Northstar Voice program (parallel: true) https://github.com/Aditya190600/2peepsfromAZ/issues/32
- [ ] 33.md - Reopenable reports from history (parallel: true) https://github.com/Aditya190600/2peepsfromAZ/issues/33
- [ ] 34.md - Get started opens 12-session summary (parallel: false) https://github.com/Aditya190600/2peepsfromAZ/issues/34

Total tasks: 4
Parallel tasks: 3
Sequential tasks: 1
Estimated total effort: 13 hours
