# SessionInspector manual test matrix

`client/src/SessionInspector.jsx` (issue #73) has no component-level test
runner in this repo (only `node:test` for plain JS modules). Verify these
cases by hand before merging any change that touches it:

1. **Sample session with audio** - open a history entry backed by
   `SAMPLE_AUDIO_URLS` (or a resolvable `audioKey`). Call tab shows the
   `AudioPlayer`; clicking a transcript turn's timestamp seeks the player to
   that `tMs`. Evaluation tab shows the original findings with severity and
   citations.
2. **Live call without audio** - open a history entry with
   `source === "live"` and no resolvable audio. Call tab shows transcript
   only, with copy stating audio was never stored. No player renders.
3. **Missing/unknown session id** - navigate to `/sessions/<id-not-in-history>`.
   Inspector shows a clear empty/error state, no crash.
4. **Share** - click Share. Clipboard receives `/sessions/:sessionId`
   (verify via paste), not a full analysis re-run.
5. **Download** - click Download. Resulting JSON file parses and contains
   `turns` and `findings` matching the stored entry.

All five must pass with zero `/v1/analyze-session` network calls (check
devtools network tab) since the inspector reads only stored data.
