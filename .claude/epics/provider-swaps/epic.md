---
name: provider-swaps
status: in-progress
created: 2026-09-13T01:40:00Z
updated: 2026-09-14T08:00:00Z
progress: 90%
prd: .claude/prds/provider-swaps.md
github: https://github.com/Aditya190600/2peepsfromAZ/issues/41
---

# Epic: provider-swaps

## Overview

Vapi-style independent **transcriber / model / voice** slots with server-side BYO keys. AssemblyAI remains the default and the hackathon path.

## Architecture Decisions

- Adapters behind a small registry; `analyze.js` only sees normalized session JSON.
- Secrets never in the client.
- Share a credentials module with `telephony-sip`.

## Technical Approach

- `server/providers/` registry + env/gitignored store
- Client settings panel on Try

## Tasks Created

- [x] 001.md - Provider registry and secret store (#49) - in PR, pending review
- [x] 002.md - Transcriber adapter (AssemblyAI + second vendor) (#50) - in PR, pending review
- [x] 003.md - Model adapter (Gateway + OpenAI-compatible) (#51) - in PR, pending review
- [x] 004.md - Voice slot + Try provider UI (#52) - in PR, pending review

All four tasks implemented in `server/providers/` + `client/src/ProviderSettings.jsx`.
Deepgram transcriber adapter is unverified against a live account (no key
available) but its interface is locked by `transcriberDeepgram.test.js`, per
002's acceptance criteria. Progress held at 90% (not 100%) until the PR is
reviewed and merged.
