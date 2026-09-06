---
name: upload-demo-diarization
status: backlog
created: 2026-09-06T07:31:52Z
updated: 2026-09-06T07:31:52Z
progress: 0%
prd: .claude/prds/upload-demo-diarization.md
github: 
---

# Epic: upload-demo-diarization

## Overview

Add a dual-speaker demo audio fixture and verify the upload → diarize → analyze path yields multi-role turns with non-zero timestamps so click-to-seek works on camera.

## Architecture Decisions

- Prefer real AssemblyAI `speaker_labels` over a hand-written sidecar, with sidecar as fallback only if diarization fails the fixture.
- Keep text `sampleSessions` as the fast path; upload fixture is the fidelity path.

## Technical Approach

### Assets
- Commit ≤3MB dual-speaker mp3 under `client/public/samples/`.

### Pipeline
- Exercise `POST /v1/transcribe-upload` and role mapping in `transcribeUpload.js`.
- Validate Dashboard seek behavior.

## Task Breakdown Preview

1. Script/create dual-speaker fixture
2. Verify diarization → turns mapping
3. Wire UI affordance / docs pointer
4. Regression smoke on text samples

## Dependencies

- AssemblyAI pre-recorded STT

## Success Criteria (Technical)

- ≥2 roles, finding `tMs > 0`, seek works

## Estimated Effort

M

## Tasks Created
- [ ] 001.md - Create dual-speaker demo audio fixture (parallel: true)
- [ ] 002.md - Verify diarization maps to timestamped roles (parallel: false)
- [ ] 003.md - Document fixture and confirm click-to-seek (parallel: false)

Total tasks: 3
