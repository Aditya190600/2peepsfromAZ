---
name: voice-evals
status: backlog
created: 2026-09-13T01:40:00Z
updated: 2026-09-13T01:40:00Z
progress: 0%
prd: .claude/prds/voice-evals.md
github: https://github.com/Aditya190600/2peepsfromAZ/issues/42
---

# Epic: voice-evals

## Overview

Operator-facing evals: mock conversations, exact/regex/AI judges, and AI-authored draft suites. Inspired by Vapi Evals + Simulations; judge prompt contract is pass/fail. Port ideas from E2EVoice `llm_judge.py`, not the Python runtime.

## Architecture Decisions

- Evals are JSON documents. Runs call `analyze.js` first (compliance), not a full PSTN sim.
- LLM judge uses the same serialized LLM client as production.
- AI authoring is draft-only until the user saves.

## Tasks Created

- [ ] 001.md - Eval schema and run API
- [ ] 002.md - Exact, regex, and check judges
- [ ] 003.md - LLM-as-judge
- [ ] 004.md - AI-generated eval drafts + UI
