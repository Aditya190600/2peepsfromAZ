# Session deep link

`/sessions/:sessionId` reopens a stored report from History. A missing id shows a clear empty state instead of crashing.

## Sub-features

- `session-missing` shows empty copy for an unknown id.
- `session-stored` renders the stored Report UI when History has that session.
- `session-back` returns to Sessions via the empty-state link.

## How to get to it (user POV)

- Click a Sessions row (sets `/sessions/<id>`).
- Type `/sessions/<id>` (refresh / deep link).

## Driving it with cursor-ide-browser

Preconditions:

- Doctor is green (`--ui-only` is enough for `session-missing`).
- For `session-missing`, use an id that is not in History, e.g. `sess_does_not_exist`.
- For `session-stored`, full launch plus a prior playable-sample run; copy the session id from the report meta line.

- **Missing id.** Navigate to `http://127.0.0.1:5173/sessions/sess_does_not_exist`. Copy includes `No stored report found for session` and `sess_does_not_exist`. The page does not throw.
- **Back to sessions.** Click `Back to sessions`. URL is `/sessions`.
- **Stored id.** Navigate to `http://127.0.0.1:5173/sessions/<realSessionId>`. Tagline is `Stored compliance report - reopened from history, no re-analysis.` Report findings are visible.
- **Proof.** `artifacts/session-deep-link/missing.png` and `artifacts/session-deep-link/stored.png` plus ARIA snapshots. Empty path must include the requested id in the snapshot text.

## Gotchas

- `App.jsx` decodes the path after `/sessions/`. An empty `/sessions/` still shows the empty copy with `(none)`.
- This route does not analyze. If you expected a report and see empty copy, History never saved that id in this origin.
- Hand-rolled router only watches `pathname`. Extra query strings are ignored here.
