---
name: pre-submit-qa
status: backlog
created: 2026-09-06T07:31:52Z
updated: 2026-09-06T07:31:52Z
progress: 0%
prd: .claude/prds/pre-submit-qa.md
github: 
---

# Epic: pre-submit-qa

## Overview

Run and record a final QA gate on the production ComplyLine URL before filming and submitting.

## Architecture Decisions

- Checklist-driven manual QA; optional tiny `curl` smokes only.
- Evidence stored in `docs/submission/qa/`.

## Task Breakdown Preview

1. Author checklist
2. Execute against production URL
3. Capture evidence screenshots
4. Write demo-ops rate-limit note
5. Gate final video recording

## Dependencies

- `live-demo-deployment`
- `upload-demo-diarization` for upload row

## Success Criteria (Technical)

- Critical checklist rows pass on live URL

## Estimated Effort

S–M

## Tasks Created
- [ ] 001.md - Author pre-submit QA checklist (parallel: true)
- [ ] 002.md - Execute QA on production URL (parallel: false)
- [ ] 003.md - Capture QA evidence screenshots (parallel: true)
- [ ] 004.md - Write demo-ops rate-limit note (parallel: true)

Total tasks: 4
