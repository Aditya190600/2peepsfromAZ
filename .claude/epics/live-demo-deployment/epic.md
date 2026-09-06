---
name: live-demo-deployment
status: backlog
created: 2026-09-06T07:31:03Z
updated: 2026-09-06T07:31:03Z
progress: 0%
prd: .claude/prds/live-demo-deployment.md
github: 
---

# Epic: live-demo-deployment

## Overview

Deploy ComplyLine's Vite client + Express server to a public Vercel URL with server-only `ASSEMBLYAI_API_KEY`, preserving existing analyze/upload/token routes and demo-safe LLM Gateway behavior.

## Architecture Decisions

- Prefer a single Vercel project: static client build + Node serverless (or Vercel Express adapter) for `server/`.
- Keep same-origin `/v1/*` via rewrites so the client needs no API host env in the browser.
- Secrets only in Vercel env — never `VITE_` prefixed.

## Technical Approach

### Frontend
- `client` Vite production build as Vercel static output (`dist`).
- Confirm `fetch('/v1/...')` paths work behind rewrites.

### Backend
- Package Express `server/index.js` for Vercel Node runtime (export app or use official Express entry pattern).
- Ensure multipart upload (`/v1/transcribe-upload`) works under serverless body-size limits; document max upload size.

### Infrastructure
- `vercel.json` routes: SPA fallback + `/v1/*` → server.
- Env: `ASSEMBLYAI_API_KEY` (required). Optional knobs only if already supported.

## Implementation Strategy

1. Add deploy config without breaking local `scripts/start.sh`.
2. Deploy preview, smoke token + sample analyze.
3. Document URL + redeploy in README.

## Task Breakdown Preview

1. Vercel project config + build settings
2. Express serverless/entry adapter
3. Rewrite rules for `/v1/*` and SPA
4. Multipart upload size verification
5. Env secrets + README live-demo section
6. Smoke script / checklist against preview URL

## Dependencies

- Working `ASSEMBLYAI_API_KEY`
- Existing server routes and client proxy assumptions

## Success Criteria (Technical)

- Public HTTPS URL serves Landing
- Sample analyze + fleet work on deployed URL
- No API key in client bundles (`grep` dist)
- Upload route either works or is explicitly documented with size limits

## Estimated Effort

M (about one focused day for a two-person team)

## Tasks Created
- [ ] 001.md - Add Vercel build config for client + server (parallel: true)
- [ ] 002.md - Adapt Express server for Vercel Node runtime (parallel: false)
- [ ] 003.md - Configure SPA + API rewrites (parallel: true)
- [ ] 004.md - Verify upload body limits on serverless (parallel: false)
- [ ] 005.md - Set secrets and publish README live demo URL (parallel: true)
- [ ] 006.md - Smoke-test preview/production deploy (parallel: false)

Total tasks: 6
