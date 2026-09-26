# Try-tab persona selector manual test matrix

The persona-driven live call (`client/src/personas.js`, wired into
`client/src/useVoiceAgent.js`) and the recording capture path can't be
exercised by `node --test` — both need a real microphone, a real AssemblyAI
Voice Agent connection, and real browser MediaRecorder/AudioContext support.
`personas.test.js` covers the pure selection/config-resolution logic;
`scopeAdherenceCheck.test.js` covers the new server-side check with a fake
LLM Gateway. Verify these cases by hand before merging any change that
touches `Dashboard.jsx`'s persona/record UI or `useVoiceAgent.js`'s call
setup.

1. **Default persona** - load `/try` fresh. "Neutral assistant" is selected,
   no industry pack pre-checked, no violation toggle visible (neutral has no
   seeded violation). Start a call - agent discloses AI status up front,
   voice is `anna`.
2. **Persona auto-selects its pack** - pick "Healthcare receptionist" in the
   persona dropdown. The HIPAA pack checkbox under "Industry pattern packs" checks itself
   automatically. Uncheck it by hand - it stays unchecked (opt-out, not
   locked). Switch to "Bank teller" - GLBA/finance checks itself instead,
   HIPAA is no longer checked.
3. **Persona system prompt reaches the call** - start a call as "Flight
   booking agent". Ask about your bank balance - the agent should decline
   and say that's outside what it can help with, per its CAN/CANNOT scope,
   not invent an answer.
4. **Boundary-testing scenario (Faculty)** - start a call as "Faculty
   records member". Ask for your own GPA (agent answers), then ask for a
   named friend's GPA. Agent should refuse the second request even though it
   was cooperative on the first - this is the specific scenario the design
   review flagged.
5. **Seed a violation toggle** - select "Bank teller", check "Seed a
   compliance violation on this call", start a call, read an account number
   to the agent and ask it to confirm. Agent should read it back (the
   seeded failure). End the call with the GLBA/finance pack checked - the
   report generates automatically and the PII scan should flag the account
   number as spoken. Uncheck the toggle and repeat - the agent should refuse
   instead.
6. **Persona on history** - after any persona call ends (report generates
   automatically, no click needed), open `/sessions` (history). The entry
   should already be there and attributable to the persona used (verify via
   `client/src/reportHistory.js`'s `persona` field - not yet surfaced in the
   History table UI, only round-tripped in storage).
7. **Record checkbox off by default** - start a call without checking
   "Record this call". End the call. No "Recording" section appears under
   Live call - confirms the audio-never-stored default still holds.
8. **Record, download** - check "Record this call", start a call, say a few
   things, end the call. A "Recording" section appears with an inline
   player, "Download recording" (saves a real, playable `.webm` locally),
   and "Analyze this recording". The recording is also uploaded to the
   recordings bucket (`POST /v1/recordings/:sessionId`) as soon as the call
   ends; with the bucket unset that POST 503s, nothing is stored, and the
   recording stays a local blob only.
9. **Record, analyze** - same as above, click "Analyze this recording"
   instead. It should reuse the existing `/v1/transcribe-upload` pipeline
   (same network call as "Auto-split speakers" on a sample) and produce a report
   with a working inline audio player.
10. **Mic-silent banner still works with a persona selected** - mute the
    input device at the OS level, start a call with any persona. The
    existing `micSilent` banner should still fire after ~15s regardless of
    which persona is active - persona wiring must not have broken the
    existing silence-detection plumbing.
11. **Multi-pack persona (School nurse)** - pick "School nurse" in the dropdown. The
    HIPAA, FERPA, and COPPA pack checkboxes all check themselves automatically
    (not just one). Uncheck HIPAA only - FERPA and COPPA stay checked (opt-out
    is per pack, not all-or-nothing). Start a call, ask about your own child's
    visit (agent answers), then ask for another student's health visit or
    grades - agent should refuse both, per its CAN/CANNOT scope. Switch to
    "Bank teller" - HIPAA/FERPA/COPPA all uncheck, GLBA/finance checks itself
    instead.
12. **Try as webhook sandbox** - this tab is currently hidden from the
    Compliance Lab tab bar (`client/src/Dashboard.jsx`); exercise it by
    calling `setSessionTab("webhook")` (e.g. via devtools) to reach the panel
    below, before any persona call ends (or with "Neutral assistant" selected) -
    it shows placeholder guidance to start a non-neutral persona call on the
    Live call tab first, no API key field. Start and end a call with any
    non-neutral persona, then switch back to this tab - the API key field
    and "Send to webhook receiver" now appear. Paste a real ComplyLine API
    key (mint one at `/api-keys`) and click it - status should flip to
    "Sent" with no inline report (the ingest endpoint acks immediately and
    analyzes asynchronously). Retry with a bad/expired key - status should
    flip to "error" with the server's rejection message shown.
