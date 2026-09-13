---
name: personal-observability
description: Import the E2EVoice personal observability stack (jsonl metrics, GET /metrics, latency/WER) into ComplyLine.
status: backlog
created: 2026-09-13T01:40:00Z
---

# PRD: personal-observability

## Executive Summary

Port the **personal observability platform** from the old local-first voice project **E2EVoice** (`Aditya190600/E2EVoice`) into ComplyLine: per-request structured metrics, jsonl on disk, aggregate `GET /metrics`, and a small operator view. This is not Datadog/Langfuse. It is the existing `Metrics` / `MetricsLogger` / `/metrics` design, rewritten for this Node server.

## Problem Statement

ComplyLine has almost no runtime telemetry. LLM 429s, check latency, and live-call duration are invisible except as UI error copy. E2EVoice already solved a personal, file-based loop:

- `src/observability.py` — `Metrics` (session_id, asr/llm/tts timings, transcript, WER, fallback flags) and `MetricsLogger` appending `logs/metrics.jsonl`
- `GET /metrics` in `server.py` — last 50 lines → `{ latency_ms, wer, containment_rate, turn_count }`
- Frontend drawer polling metrics every 5s (spec: `docs/superpowers/specs/2026-05-31-frontend-voice-chat-design.md`)
- Tests: `tests/test_observability.py`

ComplyLine should get the same loop for **analyze-session**, **live Voice Agent**, and **upload STT**, plus compliance-check timings.

## User Stories

### Operator / developer
- As a developer, every analyze and live turn writes one jsonl record I can `tail`.
  - Acceptance: `logs/metrics.jsonl` (or configured path) grows; gitignored.
- As an operator, a Metrics panel shows rolling latency and error rate for Gateway/checks.
  - Acceptance: `GET /v1/metrics` returns aggregates; UI polls; empty file → zeros/`—`.

## Functional Requirements

1. **Port the data model** to JS: `sessionId`, `path` (`analyze` | `live` | `upload` | `s2s`), `transcriber`, `model`, timings (`sttMs`, `llmMs`, `checkMs`, `totalMs`), `checks[]` statuses, `gatewayStatus`, `fallbackTriggered`, `timestamp`.
2. **Logger:** append-only jsonl; never throw into the request path (swallow FS errors, log once).
3. **`GET /v1/metrics`:** last N (default 50) → averages + counts of Gateway errors. Corrupt lines skipped (E2EVoice already does this).
4. **Instrument:** `analyze.js` / `llmGateway.js` / live `session.end` / upload.
5. **UI:** a collapsible Metrics strip on Try or Home footer — WER optional (only if a reference phrase exists; ComplyLine may leave WER null). Prefer latency + check error rate over fake containment.

## Non-Functional Requirements

- Default metrics file gitignored (`logs/metrics.jsonl`).
- No extra hosted SaaS required.
- Must not add Python runtime; port to Node.

## Success Criteria

- Cold 12-session run produces 12 jsonl analyze records.
- `GET /v1/metrics` matches file contents (tested).
- UI shows latency after at least one analyze.
- Mapping document in the epic lists E2EVoice files → ComplyLine files.

## Constraints & Assumptions

- Source tree: `C:\Users\sai95\Desktop\Projects\E2EVoice` / https://github.com/Aditya190600/E2EVoice
- Containment rate in E2EVoice is still `null` — do not fake it here either unless we define handoff.

## Out of Scope

- OpenTelemetry exporters, Grafana, paid APM.
- Copying E2EVoice ASR/TTS/RAG into ComplyLine (providers epic covers swaps).

## Dependencies

- E2EVoice `src/observability.py`, `server.py` `GET /metrics`, `tests/test_observability.py`.
- ComplyLine `server/index.js`, `analyze.js`, `llmGateway.js`.
