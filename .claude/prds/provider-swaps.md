---
name: provider-swaps
description: Vapi-style swappable transcriber, model, and voice providers with BYO keys — ComplyLine stays AssemblyAI-default.
status: backlog
created: 2026-09-13T01:40:00Z
---

# PRD: provider-swaps

## Executive Summary

ComplyLine’s live path is AssemblyAI-only (Voice Agent WS, upload STT, LLM Gateway). Buyers of a voice stack expect **Vapi-like** independent slots: **transcriber (STT)**, **model (LLM)**, **voice (TTS / realtime)**. This epic adds a provider registry, server-side credentials, and an assistant config so operators can plug in other vendors without rewriting checks.

Inspired by [Vapi Provider Keys](https://docs.vapi.ai/customization/provider-keys.mdx): BYO keys in an Integrations/credentials surface; once validated, calls go to that vendor.

## Problem Statement

Today `useVoiceAgent.js`, `POST /v1/transcribe-upload`, and `llmGateway.js` hard-code AssemblyAI. There is no way to swap Deepgram/AssemblyAI STT, another LLM for disclosure/NER, or a different voice stack. That is the opposite of Vapi’s `model` / `voice` / `transcriber` objects.

This is **post-hackathon product work**. Session A/B and AssemblyAI eligibility stay first. Default remains AssemblyAI.

## User Stories

### Operator
- As an operator, I pick transcriber / model / voice independently and save.
  - Acceptance: config persists server-side (or env-backed store); client never sees raw provider secrets.
- As an operator, I add a BYO API key for a listed provider and it is validated before use.
  - Acceptance: invalid keys fail with a human error; AssemblyAI remains the default if unset.

### Developer
- As a developer, I implement a new STT vendor by conforming to one transcriber interface.
  - Acceptance: one adapter file + registry entry; analyze-session still receives `{ turns[], startedAt, consentEvent }`.

## Functional Requirements

1. **Three slots** (Vapi shape, ComplyLine names):
   - `transcriber`: STT for upload + live captions. Start: AssemblyAI (current). Interface for Deepgram (and optionally others).
   - `model`: LLM for disclosure + NER (and later agent text). Start: AssemblyAI LLM Gateway. Interface for OpenAI-compatible endpoints.
   - `voice`: realtime or TTS. Start: AssemblyAI Voice Agent. Interface stub for a second provider (do not require ElevenLabs in v1 if keys/eligibility conflict).
2. **Credentials:** store provider keys **only on the server**. Never ship in `client`. Mirror Vapi “Integrations tab” as a **Try / Settings** panel, not a fake SSO product.
3. **Normalize to session JSON** so `analyze.js` does not care which STT produced turns.
4. **Fallback:** if a non-default provider errors, show an honest error; do not silently bill a second vendor.

## Non-Functional Requirements

- Secrets in env or a local credential file gitignored; never commit keys.
- Adapter timeouts and error copy consistent with `llmGateway.js` human errors.
- Do not break the 12-session fixture path (fixtures skip live STT).

## Success Criteria

- Operator can set transcriber/model/voice in UI; round-trip survives refresh.
- One non-AssemblyAI transcriber adapter is implemented **or** documented as a stub with a failing test that defines the interface.
- `POST /v1/analyze-session` unchanged for callers.
- Default path for the hackathon demo remains AssemblyAI with zero extra keys required.

## Constraints & Assumptions

- Hackathon video / eligibility: AssemblyAI. Do not make another vendor required to click Get started.
- No-DB: in-memory + env + gitignored JSON is acceptable until a later store.

## Out of Scope

- Phone numbers / SIP (epic `telephony-sip`).
- Evals (epic `voice-evals`).
- Cloud recording buckets (Vapi S3/GCS/R2).
- Custom LLM marketplace UI.

## Dependencies

- Existing: `useVoiceAgent.js`, `transcribeUpload.js`, `llmGateway.js`, `analyze.js`.
- Vapi docs: provider keys; assistant `model` / `voice` / `transcriber`.
