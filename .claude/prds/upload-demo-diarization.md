---
name: upload-demo-diarization
description: Make the audio-upload demo path produce multi-speaker, timestamped turns so click-to-seek findings work during judge demos.
status: backlog
created: 2026-09-06T07:29:09Z
---

# PRD: upload-demo-diarization

## Executive Summary

Fix the upload/transcribe demo path so sample (or bundled) audio yields real agent vs caller turns with non-zero timestamps, making finding click-to-seek and disclosure/opt-out timing checks meaningful on camera.

## Problem Statement

`docs/judging-criteria-and-enterprise-gap-assessment.md` documents that current sample MP3s are single-voice. AssemblyAI diarization then returns one utterance; `turnsFromUtterances` collapses the call into a single `agent` turn at `tMs: 0`. Disclosure timing, opt-out timing, and clickable timestamps become structurally meaningless on the upload path — a visible demo failure even when the code is correct.

## User Stories

- As a **judge using Upload audio**, I see findings with timestamps that seek the player to the right moment, so the "evidence-linked report" claim is believable.
  - Acceptance: After upload of a provided dual-speaker fixture, at least two roles appear in turns and at least one finding has `tMs > 0` that seeks audio.
- As a **presenter**, I have one canonical upload fixture labeled in the UI (or docs) that is guaranteed to demonstrate diarization + seek.
  - Acceptance: Fixture is in-repo under `client/public/` (or documented path); README/demo shot list points to it.
- As a **developer**, synthetic sample-session buttons remain the fast path and do not regress.
  - Acceptance: Existing `sampleSessions` text fixtures still analyze without requiring audio.

## Functional Requirements

1. Add at least one dual-speaker demo audio file (agent + caller) with clear AI-disclosure and optionally an opt-out or PII moment.
2. Verify `POST /v1/transcribe-upload` maps diarized utterances to alternating roles with monotonic `tMs`.
3. Confirm Dashboard click-to-seek uses those timestamps against the blob URL player.
4. Document the fixture in the demo shot list / README.

## Non-Functional Requirements

- Keep file size small enough for repo + Vercel limits (prefer ≤2–3 MB).
- Do not store live-call mic audio; this is a checked-in demo asset only.
- No new vendors — AssemblyAI pre-recorded STT with `speaker_labels` only.

## Success Criteria

- Upload of the dual-speaker fixture produces ≥2 distinct turn roles.
- Disclosure or opt-out finding (as scripted in the fixture) lands at a non-zero `tMs`.
- Clicking that finding seeks the in-UI player to within ~1s of the moment.
- Regression: text sample sessions and fleet analysis still pass `server` tests / manual smoke.

## Constraints & Assumptions

- May generate audio with TTS offline and commit the result; generation tooling need not ship in the app.
- If AssemblyAI diarization remains brittle on a given file, an explicit turn-map sidecar for that demo fixture is acceptable as a documented demo aid — prefer real diarization first.

## Out of Scope

- Building a full audio annotation editor.
- Replacing the Voice Agent live path.
- Guaranteeing diarization quality on arbitrary user uploads (best-effort + honest errors remain OK).

## Dependencies

- Existing `transcribeUpload.js` + Dashboard upload UI.
- AssemblyAI pre-recorded transcription API with speaker labels.
- Demo recording plan from `hackathon-submission-kit`.
