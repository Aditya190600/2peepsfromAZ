# History

Sessions is a local audit trail of reports run in this browser. A row reopens the stored report at `/sessions/:sessionId` without calling analyze again.

## Sub-features

- `history-empty` shows the empty copy when `localStorage` has no entries.
- `history-row` lists a saved report after an analyze.
- `history-reopen` opens the stored Report UI from a row click.
- `history-clear` empties the list via **Clear history**.

## How to get to it (user POV)

- Choose **Sessions** in the top nav.
- Type `/sessions`.
- Type `/history` (redirects to `/sessions`).

## Driving it with cursor-ide-browser

Preconditions:

- Doctor is green.
- For `history-empty`, clear origin `localStorage` first or use a profile that has never analyzed.
- For `history-row` / `history-reopen`, a report must already exist (run the playable-sample recipe first).

- **Nav entry.** From `/`, click `Sessions`. URL is `/sessions`.
- **Empty state.** With no entries, the page contains `No reports yet` and a Try link.
- **Row after analyze.** After a sample analyze, return to `/sessions`. A button row shows a verdict, a label, a session id, and a timestamp.
- **Reopen.** Click that row. URL is `/sessions/<sessionId>`. Tagline contains `Stored compliance report`. Findings match the original run. Network has no new `POST /v1/analyze-session` for that click.
- **Clear.** Click `Clear history`. The empty copy returns.
- **Proof.** `artifacts/history/empty.png` for the empty path, `artifacts/history/row.png` and `artifacts/history/reopen.png` for the stored path. Include ARIA snapshots alongside.

## Gotchas

- History is origin `localStorage`, not the server. Reloading the app keeps it; a different port or host is a different store.
- `saveHistoryEntry` stores the full `report` object. A row without `report` is pre-epic data; reopen then shows the empty session copy.
- **Clear history** is destructive for this origin. Do not clear a user's personal History if you refused launch because ports were already taken.
