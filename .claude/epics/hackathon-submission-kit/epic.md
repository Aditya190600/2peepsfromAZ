---
name: hackathon-submission-kit
status: backlog
created: 2026-09-06T07:31:52Z
updated: 2026-09-06T07:31:52Z
progress: 0%
prd: .claude/prds/hackathon-submission-kit.md
github: 
---

# Epic: hackathon-submission-kit

## Overview

Produce lablab.ai submission artifacts for ComplyLine: shot list, ≤5min demo video, slide PDF, 16:9 cover, and form copy that only claims shipped behavior.

## Architecture Decisions

- Store artifacts under `docs/submission/` (scripts + copy in git; large binary video may be linked, not committed if >100MB).
- Narrative order: problem → single report → severity/citations → fleet → AssemblyAI surfaces → buyer pitch (debt collection / telehealth).

## Technical Approach

### Content
- Shot list references real sample session keys from `client/src/sampleSessions.js`.
- Slides: 6–10 pages, PDF export.
- Cover: 16:9 PNG/JPG.

### Recording
- Prefer production URL from `live-demo-deployment`; localhost fallback allowed for draft cut.

## Implementation Strategy

1. Write shot list + submission copy first (unblocks recording).
2. Build slides + cover.
3. Record/edit video last once QA is green.

## Task Breakdown Preview

1. Shot list + pacing notes
2. Short/long descriptions + tags
3. Slide deck PDF
4. Cover image
5. Record and encode demo video
6. Submission checklist linking all assets

## Dependencies

- `live-demo-deployment` (preferred)
- `pre-submit-qa` before final take

## Success Criteria (Technical)

- All lablab fields answerable from `docs/submission/`
- Video ≤5min ≤300MB
- No unshipped feature claims

## Estimated Effort

M

## Tasks Created
- [ ] 001.md - Write demo shot list and pacing guide (parallel: true)
- [ ] 002.md - Draft lablab short/long descriptions and tags (parallel: true)
- [ ] 003.md - Produce slide deck PDF (parallel: true)
- [ ] 004.md - Create 16:9 cover image (parallel: true)
- [ ] 005.md - Record and encode demo video (parallel: false)
- [ ] 006.md - Complete submission checklist document (parallel: false)

Total tasks: 6
