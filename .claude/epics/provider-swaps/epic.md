---
name: provider-swaps
status: backlog
created: 2026-09-13T01:40:00Z
updated: 2026-09-13T01:40:00Z
progress: 0%
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

- [ ] 001.md - Provider registry and secret store
- [ ] 002.md - Transcriber adapter (AssemblyAI + second vendor)
- [ ] 003.md - Model adapter (Gateway + OpenAI-compatible)
- [ ] 004.md - Voice slot + Try provider UI
