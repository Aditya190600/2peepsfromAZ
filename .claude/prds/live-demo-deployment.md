---
name: live-demo-deployment
description: Deploy ComplyLine to a public Vercel URL so judges can run the live demo without cloning the repo.
status: backlog
created: 2026-09-06T07:29:09Z
---

# PRD: live-demo-deployment

## Executive Summary

Ship a publicly reachable ComplyLine demo on Vercel (hackathon-allowed target) with server + client wired to a real `ASSEMBLYAI_API_KEY`, so judges and buyers can open a URL and generate a compliance report without local setup.

## Problem Statement

Hackathon rules require a live deployed demo URL on Streamlit, Replit, or Vercel. The app currently runs only via `scripts/start.sh` (Vite + Express on localhost). Without a public URL, the submission is incomplete regardless of product quality.

## User Stories

- As a **hackathon judge**, I can open a public URL, click a sample session, and see a severity-ranked compliance report, so I can evaluate the product without installing anything.
  - Acceptance: URL loads over HTTPS; sample analysis completes with real findings (or honest cached/rate-limit messaging); no API key is exposed in the browser network tab.
- As a **team member**, I can redeploy by pushing to the deploy branch / running the documented deploy path, so last-minute fixes make it to the live demo quickly.
  - Acceptance: Deploy steps are documented in README; env var `ASSEMBLYAI_API_KEY` is set only in the host secret store.
- As a **demo presenter**, I can fall back to sample sessions if a live mic is unavailable on stage, so the demo is not blocked by hardware.
  - Acceptance: Sample + fleet paths work on the deployed URL the same as locally.

## Functional Requirements

1. Frontend (Vite/React) builds to static assets and is served publicly.
2. Backend Express API (`/v1/token`, `/v1/analyze-session`, `/v1/transcribe-upload`) is reachable from that frontend (same origin via rewrite/proxy, or documented CORS).
3. `ASSEMBLYAI_API_KEY` is injected only server-side.
4. Health-friendly cold start: first request may be slow, but UI already shows loading/error states (do not regress #24 polish).
5. README documents the live demo URL and how to redeploy.

## Non-Functional Requirements

- Target platform: **Vercel** (fits React/Node stack better than Streamlit).
- Stay within free/hobby limits where possible; document any required paid tier.
- Do not log full transcripts or API keys to platform logs.
- Preserve no-database constraint (in-memory report cache is fine).

## Success Criteria

- Public HTTPS URL opens the Landing page.
- From Dashboard: at least one sample session and one fleet run produce usable reports.
- `GET`-equivalent smoke: token mint or analyze against a fixture succeeds on the deployed backend.
- Network tab shows no `ASSEMBLYAI_API_KEY` in client requests.
- README "Live demo" section lists the URL.

## Constraints & Assumptions

- Two-person team; prefer the simplest Vercel topology (static client + serverless/Node server) that keeps existing Express routes working.
- AssemblyAI account rate limits remain tight (~2 LLM Gateway calls / 30s) — deployed demo must keep #24 retry/cache/fleet concurrency behavior.
- Replit/Streamlit are allowed alternatives only if Vercel proves intractable for the Express upload path.

## Out of Scope

- Custom domain / branding DNS.
- Multi-region HA, auth, or multi-tenant tenancy.
- CI auto-deploy from every PR (manual or main-branch deploy is enough).
- Migrating away from Express to a new framework.

## Dependencies

- Valid `ASSEMBLYAI_API_KEY` in deploy secrets.
- Existing client/server build scripts (`client` Vite build, `server` Node entry).
- Enterprise polish from PR #24 (loading/error states, cache, concurrency caps) must remain intact on the deployed build.
