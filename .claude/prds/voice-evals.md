---
name: voice-evals
description: Vapi-style automated evals for ComplyLine — mock conversations, exact/regex/LLM judges, and AI-generated test suites.
status: backlog
created: 2026-09-13T01:40:00Z
---

# PRD: voice-evals

## Executive Summary

Add an **evals** product: reusable test suites that run mock (or fixture) conversations against ComplyLine’s compliance checks and/or a voice assistant, with pass/fail from exact match, regex, or an **LLM-as-judge**. Operators can also **ask AI to draft evals** from a prompt (Vapi Simulations / “AI makes the tests”).

Source: [Vapi Evals quickstart](https://docs.vapi.ai/observability/evals-quickstart) (mock conversations, checkpoints, tool-call checks, AI judge `pass`/`fail`) and [Simulations](https://docs.vapi.ai/observability/simulations-quickstart.mdx). Reuse patterns from E2EVoice `scripts/annotation/llm_judge.py` (validate / preference / faithfulness, Grok or other OpenAI-compatible judge).

## Problem Statement

ComplyLine’s “tests” today are `server` unit tests plus a 12-session demo catalog. There is no operator-facing way to define “this greeting must disclose AI” or generate a suite from “cover TCPA consent and late disclosure.” Vapi’s evals + AI-generated simulations are the missing loop for a voice platform.

## User Stories

### Compliance / QA
- As a QA owner, I save an eval: mock turns + expected checkpoints (consent spoken, disclosure in first 10s, no SSN).
  - Acceptance: running the eval returns per-checkpoint pass/fail and a transcript.
- As a QA owner, I use an **AI judge** when exact match is too brittle (paraphrased disclosure).
  - Acceptance: judge prompt must answer only `pass` or `fail` (Vapi contract).
- As a QA owner, I type “generate tests for TCPA + disclosure + PII” and get a draft suite I can edit.
  - Acceptance: generated evals are stored as JSON I can edit; never auto-overwrite fixtures.

## Functional Requirements

1. **Eval document:** `{ id, name, messages[], checkpoints[] }` stored in repo or gitignored local store (no Postgres required).
2. **Run:** `POST /v1/evals/:id/run` executes against `analyze.js` on the mock turns (primary) and optionally against a live agent later.
3. **Judges per checkpoint:**
   - `exact` / `regex` on assistant or user text
   - `ai` judge with model + system prompt; output strictly pass/fail
   - Reuse compliance check results as a checkpoint type (`check: consent` must be `pass`)
4. **AI authoring:** prompt → draft eval JSON (LLM). Human confirms before save.
5. **UI:** Try or a later `/evals` list: name, last run, pass rate. Not a Vanta Reports clone unless IA already has a place.

## Non-Functional Requirements

- Judge calls go through the same Gateway mutex / queue as production LLM (`llmGateway.js` or a dedicated judge client with the same serialization).
- Deterministic fixtures must not require a live judge (exact/regex + existing checks).

## Success Criteria

- One canned eval covers `sess_tcpa_04` (Critical / consent) and `sess_clean_01` (Clear).
- AI-generated draft produces at least 3 checkpoints from a prompt; saved only after confirm.
- Unit tests for exact/regex judges; LLM judge tested with a stubbed model.

## Constraints & Assumptions

- Does not replace `analyze.test.js`.
- Default judge model can be AssemblyAI Gateway or the E2EVoice-style OpenAI-compatible judge — pick one and document.

## Out of Scope

- Full Vapi Simulations personalities / multi-iteration suites in v1 (follow-up task if authoring works).
- CI GitHub Action (nice follow-up; not required to close the epic).

## Dependencies

- `server/checks/analyze.js`
- E2EVoice `scripts/annotation/llm_judge.py` as reference, not a Python runtime in this Node app.
- Vapi evals API shape as documentation, not a required Vapi account.
