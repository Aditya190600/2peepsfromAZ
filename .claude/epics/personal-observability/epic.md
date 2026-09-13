---
name: personal-observability
status: backlog
created: 2026-09-13T01:40:00Z
updated: 2026-09-13T01:40:00Z
progress: 0%
prd: .claude/prds/personal-observability.md
github: https://github.com/Aditya190600/2peepsfromAZ/issues/44
---

# Epic: personal-observability

## Overview

Port E2EVoice’s personal observability (jsonl metrics, `GET /metrics`, timings) into the ComplyLine Node server and a small UI strip. Source: https://github.com/Aditya190600/E2EVoice (`src/observability.py`, `server.py` GET `/metrics`, `tests/test_observability.py`).

## Architecture Decisions

- Rewrite in JS; do not run Python in this repo.
- Fail-open: metrics FS errors never fail analyze.
- WER optional; containment stays null until defined.

## Tasks Created

- [ ] 001.md - Port Metrics logger to Node
- [ ] 002.md - Instrument analyze, live, upload
- [ ] 003.md - GET /v1/metrics + tests
- [ ] 004.md - Metrics UI strip
