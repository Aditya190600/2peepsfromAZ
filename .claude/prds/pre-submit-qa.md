---
name: pre-submit-qa
description: Final pre-submission QA gate — smoke the deployed app against judging criteria and freeze a known-good demo path.
status: backlog
created: 2026-09-06T07:29:09Z
---

# PRD: pre-submit-qa

## Executive Summary

Run a structured pre-submit QA pass on the deployed ComplyLine demo so the team freezes a known-good click path for the video and judges, with explicit pass/fail evidence against the four judging axes and the enterprise-gap checklist.

## Problem Statement

Enterprise polish (#24) fixed the worst live failures, but submission still needs a human-verified freeze: rate-limit behavior under real keys, sample/fleet arithmetic, print/PDF, history, finance pack toggle, and mic/upload paths. Without a written QA gate, last-minute regressions can reintroduce "Unable to run" JSON on the flagship clean sample.

## User Stories

- As a **teammate about to record the video**, I have a checked QA checklist with pass/fail for each critical path, so I only record after green.
  - Acceptance: Checklist markdown exists; every item marked pass/fail with date and who ran it.
- As a **judge**, I never hit a silent dead-end or raw 429 JSON on the happy-path samples during evaluation week.
  - Acceptance: Clean sample + one violation sample + fleet summary verified on the live URL within 48h of submission.
- As a **repo owner**, I know which env secrets and AssemblyAI quotas the demo depends on.
  - Acceptance: Short "demo ops" note lists required secret names, approximate Gateway budget, and what to do if 429s return.

## Functional Requirements

1. QA checklist covering: Landing, Dashboard samples, fleet, history, finance+HIPAA pack toggles, print stylesheet, upload fixture, live call (if hardware available), backend-down error copy.
2. Execute checklist against the **deployed** URL (not only localhost).
3. Capture at least three screenshots or short clips as evidence (clean report, flagged report, fleet).
4. File bugs as CCPM tasks / GitHub issues only for fails that block submission; defer niceties.

## Non-Functional Requirements

- QA pass should be re-runnable in <60 minutes.
- Do not require a database or new tooling beyond browser + `curl`.

## Success Criteria

- Checklist all-critical items = pass on live URL.
- No raw Gateway JSON visible in report cards on cached/happy paths.
- Fleet summary counts match visible row statuses.
- README live-demo link matches the URL that was QA'd.

## Constraints & Assumptions

- Depends on `live-demo-deployment` being up.
- AssemblyAI rate limits may still force pacing between LLM-heavy runs — checklist must include pacing guidance.
- Mic live-call verification may be blocked in CI; allow "manual optional" for that row.

## Out of Scope

- Full automated e2e browser suite (Playwright) unless a single smoke test is free to add.
- Redesign or new features discovered during QA (park in backlog PRDs).

## Dependencies

- `live-demo-deployment`
- `upload-demo-diarization` (for upload row)
- `hackathon-submission-kit` (consumes QA evidence / shot list)
