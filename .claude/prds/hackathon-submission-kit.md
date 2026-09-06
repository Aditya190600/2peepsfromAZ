---
name: hackathon-submission-kit
description: Produce the lablab.ai submission package — demo video under 5 minutes, slide PDF, cover image, and copy — keyed to ComplyLine's real shipped behavior.
status: backlog
created: 2026-09-06T07:29:09Z
---

# PRD: hackathon-submission-kit

## Executive Summary

Assemble the non-code submission artifacts required by lablab.ai: a ≤5 minute demo video, slide deck PDF, 16:9 cover image, and short/long project descriptions that accurately reflect ComplyLine (R3-21) as shipped on `main`.

## Problem Statement

A working repo alone does not complete the hackathon submission. Judges score presentation heavily; without a crisp walkthrough of problem → demo → business case, Application of Technology and Business Value scores do not transfer.

## User Stories

- As a **judge watching the video**, I understand the problem, see a live report generate, and hear a concrete buyer story within 5 minutes.
  - Acceptance: Video ≤5 min and ≤300MB; shows Landing → sample report with severity + citation → fleet view → (optional) upload or live call; ends with buyer pitch from `docs/customer-targets-and-elevator-pitch.md`.
- As a **submission author**, I can paste short/long descriptions and tags into lablab without inventing features that are not shipped.
  - Acceptance: Copy only claims checks and UX that exist on `main` (consent, recording consent, AI disclosure, opt-out, PII packs including HIPAA + finance, fleet, history, print).
- As a **teammate recording the video**, I have a shot list and sample-session order so the recording does not depend on improvisation under rate limits.
  - Acceptance: Written shot list names which sample keys to click and in which order; notes to pause between LLM-heavy runs if needed.

## Functional Requirements

1. Demo video script / shot list checked into `docs/` (or `.claude/` adjacent docs).
2. Slide deck PDF (problem, architecture, AssemblyAI surfaces used, demo screenshots, market).
3. Cover image 16:9 PNG or JPG.
4. Short description (≤~280 chars class) and long description for the submission form.
5. Technology/category tags list.
6. Links checklist: GitHub repo, live demo URL (depends on live-demo-deployment), video, slides.

## Non-Functional Requirements

- Video under 5 minutes and under 300MB.
- Claims must match shipped code — no vapor features.
- Prefer quiet, readable UI capture; avoid exposing `.env` or API keys on screen.

## Success Criteria

- All lablab required media files exist and are linked from README or `docs/submission/`.
- Dry-run of the submission form fields is complete in a checklist markdown file.
- Video walkthrough covers all four judging axes at least once (tech, presentation, business value, originality).

## Constraints & Assumptions

- Deadline Sep 30, 2026.
- Live demo URL may land in parallel; video can use localhost only as a fallback, but final submission should prefer the public URL.
- Team of two — keep slide count small (≈6–10 slides).

## Out of Scope

- Paid ads, landing-page marketing site beyond the app itself.
- Re-shooting after every minor UI tweak once the canonical cut is approved.
- Customer discovery interviews (pitch doc already exists).

## Dependencies

- `live-demo-deployment` for the preferred recording target URL.
- Product behavior as of PR #24 (severity, citations, history, finance pack, fleet).
- `docs/customer-targets-and-elevator-pitch.md` for buyer narrative.
- `docs/judging-criteria-and-enterprise-gap-assessment.md` for what to emphasize vs. avoid on camera.
