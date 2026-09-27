---
name: verify-complyline
description: Drives the ComplyLine web app (React+Vite client + Express analyze API) the way a user does — launch, doctor, browser recipes, screenshots. Use when proving a UI change, verifying Get started / History / sample reports, or before claiming a ComplyLine frontend change works.
---

# Verify ComplyLine

ComplyLine is a post-call compliance report. Primary surface is the web UI at `http://127.0.0.1:5173`. The Express API on `:8787` is reached only through Vite's `/v1` proxy. Live-call audio is never stored. There is no database; History lives in `localStorage` key `complyline_report_history_v1`.

Read [features/README.md](features/README.md) before driving. A proof that uses one convenient entry point is incomplete when the map lists others.

## Launch

Isolation is **not** supported. `client/vite.config.js` hard-proxies `/v1` to `http://localhost:8787`. Never start a second pair on other ports and expect the UI to talk to it. If 5173 is already bound (or 8787 for a full launch), refuse and do not drive that shared instance.

From repo root:

```
node .cursor/skills/verify-complyline/scripts/launch.mjs
```

SPA-only recipes (`session-deep-link` missing state, landing chrome) may use:

```
node .cursor/skills/verify-complyline/scripts/launch.mjs --ui-only
```

`--ui-only` starts Vite only. Get started fleet, playable samples, and History-after-analyze need the full launch and a real `ASSEMBLYAI_API_KEY`.

Ready when the script prints `Ready: http://127.0.0.1:5173` and writes `.cursor/skills/verify-complyline/run/instance.json`. Full-mode backend log line is `R3-21 compliance report server listening on :8787`. Frontend is Vite `--strictPort` on `127.0.0.1:5173`.

Preconditions the launcher enforces:

- Full mode: `.env` at repo root with a non-empty `ASSEMBLYAI_API_KEY`, plus `server/node_modules` and `client/node_modules`.
- `--ui-only`: `client/node_modules` only.

Unix humans may still use `./scripts/start.sh`. Agents must use `launch.mjs` so PIDs are recorded for teardown.

## Doctor

```
node .cursor/skills/verify-complyline/scripts/doctor.mjs
node .cursor/skills/verify-complyline/scripts/doctor.mjs --ui-only
```

Pass means: `run/instance.json` PIDs are alive and `GET http://127.0.0.1:5173/` HTML contains `<title>ComplyLine</title>` and `#root`. Full mode also requires `POST http://127.0.0.1:5173/v1/analyze-session` with `{}` to return 400 mentioning `turns array`. `Get started` is client-rendered; confirm it in the browser snapshot, not in the raw HTML. Run doctor first whenever anything looks off.

## Drive

Use the Cursor browser MCP (`cursor-ide-browser`): `browser_navigate` → `browser_lock` → `browser_snapshot` / `browser_click` / `browser_take_screenshot` → `browser_lock` unlock when done. Prefer accessible names from the snapshot (`Get started`, `Voice Compliance`, `Start call`, `Clear history`) over CSS or coordinates. The client is a hand-rolled router (`client/src/App.jsx`): clicks that call `navigate()` use `pushState`, so drive the in-page links, not a full reload, unless you are testing a deep link.

Routes:

| Path | Screen |
|---|---|
| `/` | Landing. `Get started` goes to `/try`. |
| `/home` | Northstar program queue, hidden from the nav rail (direct URL only). Auto-runs the 12 sessions. No mic. |
| `/sessions` | Report list from `localStorage`. |
| `/sessions/:sessionId` | Stored report, or empty copy if missing. |
| `/try` | Lab (live call, upload, playable samples). |
| `/dashboard` | Redirects to `/try` (any query string). |
| `/history` | Redirects to `/sessions`. |

`getUserMedia` is requested only after **Start call**. Get started must not prompt for the mic.

Do not call internal setters. Do not POST `/v1/analyze-session` as a substitute for a UI click except as a side-effect check after a UI-driven analyze. `GET /v1/token` mints a real AssemblyAI Voice Agent token; skip it unless verifying the live-call path.

## Evidence

Put proof under `.cursor/skills/verify-complyline/artifacts/<feature-id>/`. That directory survives teardown.

Proof standards:

- Exercise the real user path (button, nav link, or typed URL), not a test-only endpoint.
- Capture the action and the resulting state: ARIA snapshot plus screenshot with the ComplyLine brand visible, plus the URL.
- Browser MCP screenshots default to a temp dir. Copy them into `artifacts/<feature-id>/` before teardown.
- For mutations (a saved report), reopen from History or `/sessions/:id` and confirm findings without a second `/v1/analyze-session` (Network: no extra analyze POST on reopen).
- Live call audio is never on disk. Do not treat missing recordings as a failure.
- Mocks only at production boundaries already isolated (the sample catalog is the product's canned transcripts). LLM Gateway is real; a cold 12-session run can take minutes because `llmGateway.js` serializes calls.

## Cleanup

```
node .cursor/skills/verify-complyline/scripts/teardown.mjs
```

Kills only the PIDs in `run/instance.json`, then deletes that file. Never `taskkill /IM node.exe`. Logs in `run/*.log` may remain; delete them if they contain nothing needed. Do not delete `artifacts/`.

Clearing `localStorage` is fixture cleanup for History tests, not teardown. Proof screenshots stay.

## Helpers

| Script | Invocation |
|---|---|
| Launch | `node .cursor/skills/verify-complyline/scripts/launch.mjs` (`--ui-only` for SPA-only) |
| Doctor | `node .cursor/skills/verify-complyline/scripts/doctor.mjs` (`--ui-only` skips `/v1`) |
| Teardown | `node .cursor/skills/verify-complyline/scripts/teardown.mjs` |

All three print JSON or a one-line status. Doctor exits `1` on failure.
