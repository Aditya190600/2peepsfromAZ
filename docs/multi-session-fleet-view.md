# Multi-session fleet view

R3-21's report was originally single-session: pick or record one call, get one
report. That doesn't demo the pitch ("any company running a voice agent") well
- a buyer overseeing hundreds of calls needs an aggregate view, not a
click-through of individual reports.

## What it does

"Analyze all N sample sessions" (on the Examples page, `client/src/Examples.jsx`
- relocated there from Try's tabs, see `AGENTS.md`) runs the existing
per-session analysis across every synthetic sample session and renders:

1. **Summary** - how many sessions passed all checks vs. were flagged, plus a
   pass/flag breakdown per check (consent, AI disclosure, PII scan) across the
   whole batch.
2. **Per-session list** - one collapsible row per session (native `<details>`,
   no extra state), each expanding to the same `Report`/`Finding` components
   used by the single-session view.

## How it works

No server changes. The client (`client/src/Examples.jsx`) batches calls to the
existing `POST /v1/analyze-session` endpoint - one request per sample session -
then aggregates the results client-side:

- `runFleet()` calls `analyze()` once per key in `SAMPLE_SESSIONS`
  (`client/src/sampleSessions.js`) and stores `{ key, report }[]` in
  `fleetResults` state.
- `FleetSummary` derives counts from that array: a session "passes" if every
  finding in its report has `status === "pass"`; per-check counts are tallied
  by walking `report.findings` across all sessions.
- `FleetView` renders `FleetSummary` plus the per-session list, reusing
  `Report` unchanged inside each `<details>`.

This mirrors the single-session flow (`runSample`) exactly except for the
batching and aggregation step - the underlying compliance checks
(`server/checks/*.js`) are untouched.

## Sample data

`client/src/sampleSessions.js` now has 5 synthetic sessions (was 3) to give
the fleet view a realistic pass/flag mix for a live demo:

- `clean-call`, `clean-call-2` - pass all checks
- `tcpa-violation` - fails consent + disclosure + PII
- `healthcare-hipaa` - fails PII (HIPAA pack)
- `late-disclosure` - fails AI-disclosure timing only (disclosed at 15s,
  outside the 10s window)

## Explicitly out of scope

This is not a diff/trend view, not session-replay, and not a CI pipeline -
those were scored low-novelty in the original idea evaluation
(`docs/hackathon-ideas.md`). The fleet view only aggregates counts across a
batch of independently-analyzed sessions; it does not compare sessions to each
other or track them over time.
