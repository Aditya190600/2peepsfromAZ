# Live-call history persistence manual test matrix

Regression coverage for the bug where a completed live call on `/try` never
reached Sessions history: unlike the upload/sample/paste paths, which
generate + save a report in the same user action that supplies the session,
ending a live call only set `lastSession` in React state and waited for a
separate, easy-to-miss "Generate report for last call" click before anything
was saved. A page refresh between those two steps lost the call entirely,
with no history entry. Now `client/src/Dashboard.jsx`'s `useEffect` on
`lastSession` writes a pending, transcript-only history entry the moment a
call ends, then auto-runs `runLiveReport()`, which fills in that same entry.
`useVoiceAgent.js` sets `lastSession` when the socket closes too, so a call
whose `session.ended` never arrives still goes through the same path.

This can't be exercised by `node --test` - it needs a real microphone, a real
AssemblyAI Voice Agent connection, and a real browser reload.
`reportHistory.test.js` covers that a "live"-sourced entry round-trips
through `localStorage` correctly once saved; it does not cover *when* that
save happens. Verify these by hand before merging any change that touches
`Dashboard.jsx`'s live-call flow or `useVoiceAgent.js`'s `lastSession`
handoff:

1. **Auto-generate on call end** - start a call, say a few things,
   click "End call." Without clicking anything else, a report should appear
   within a couple seconds (no manual "Generate report" click
   needed).
2. **Saved to history immediately** - right after step 1's report appears,
   open `/sessions` (history) in the same tab. The live call should already
   be listed, most recent first.
3. **Survives a reload** - after step 1, hit a plain browser refresh (not a
   theme toggle - this app has no theme setting) on `/try`. The in-page
   report view resets (expected - same as every other path), but `/sessions`
   still shows the entry from step 2.
4. **Refresh immediately after "End call"** - start a call, end it, and
   refresh the page as fast as possible (before the report visibly renders).
   Once reloaded, `/sessions` should list the call with a "Report pending"
   verdict: the pending, transcript-only entry is written synchronously the
   moment the call ends, before the analyze request starts. Open it - the
   Call tab shows the transcript, and "Generate report" fills in that same
   entry (no duplicate row). Without a refresh, the entry fills in on its own
   once analyze resolves.
5. **Manual retry still works** - if a call's report ever needs
   regenerating (e.g. it came back rate-limited), "Regenerate report for
   last call" is still present under the transcript and re-runs the same
   analyze-and-save path on demand, updating the call's existing history
   entry in place rather than adding a second one.
