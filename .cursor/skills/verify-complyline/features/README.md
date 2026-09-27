# ComplyLine verification map

This directory is the maintained source for verifying user-facing ComplyLine behavior. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-complyline/scripts/launch.mjs`.
- App is at `http://127.0.0.1:5173` with API proxied to `:8787`.
- `node .cursor/skills/verify-complyline/scripts/doctor.mjs` exits 0.
- Never drive an instance that was not started by this verification run.
- Default browser profile is fine. History is `localStorage` in that origin; treat it as dirty unless the recipe says to clear it.

## Driving conventions

- Start every recipe from `/` unless its preconditions say otherwise.
- Prefer accessible names (`Get started`, `Voice Compliance`, `Start call`, `Clean call — everything passes`) over CSS selectors.
- Use in-page `navigate()` clicks for SPA routes. Use `browser_navigate` for typed deep links (`/sessions/...`, `/home`).
- Restore History after a mutation if the recipe created entries. Keep proof artifacts.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with the ComplyLine brand visible.
- Record the feature ID and URL with every artifact.
- Report an unreachable path with the attempted control and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with cursor-ide-browser`
4. `Gotchas`

## Features

- [Get started](./get-started.md) covers Landing CTA to `/try` with no mic prompt until Start call.
- [History](./history.md) covers empty Sessions, a stored row, and reopen without re-analysis.
- [Playable sample](./playable-sample.md) covers Analyze on a canned sample and the resulting report.
- [Session deep link](./session-deep-link.md) covers `/sessions/:sessionId` empty state and a stored-report reopen.
