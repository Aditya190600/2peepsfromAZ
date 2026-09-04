# TCPA opt-out check

`server/checks/optOutCheck.js` is the second half of TCPA coverage in this
report. `consentCheck.js` already verifies consent was obtained before the
call started. This check looks at the other TCPA obligation: once a caller
asks to stop being called, was that request actually acted on during the
call, not just logged and ignored.

## What it does

1. Scans caller (`role: "user"`) turns for an opt-out phrase - "stop calling
   me," "remove me from your list," "take me off the list," "unsubscribe me,"
   "revoke my consent," and close variants.
2. If no such phrase appears anywhere in the transcript, the check reports
   `status: "n/a"` - there was nothing to honor, so it does not count as a
   pass or a flag.
3. If a phrase is found, it looks at the next two agent turns for
   acknowledgment language ("removed you from our list," "won't call you
   again," "honoring your request," and similar).
   - Acknowledgment found within that window: `status: "pass"`.
   - No acknowledgment within that window: `status: "flag"`.

## Heuristic, not proof of compliance

This is transcript-language matching, not verification that the caller's
number was actually removed from a calling list. Two honest limitations,
matching the framing already used for the HIPAA pattern pack:

- **False negatives on phrasing.** An agent could comply (stop the current
  line of conversation, note the account, hang up) without using any of the
  matched acknowledgment phrases, and this would still flag it.
- **False positives on words alone.** A `pass` here means the transcript
  shows acknowledgment language soon after the opt-out request - not that a
  do-not-call list was actually updated afterward. Off-transcript compliance
  (or non-compliance) can't be observed from a session transcript alone.

The `AGENT_TURN_GRACE` window (2 agent turns) and the phrase lists in
`optOutCheck.js` are the tunable surface if real transcripts need a wider
window or additional phrasing.

## Where it plugs in

Registered in `server/checks/analyze.js` alongside `consentCheck`,
`disclosureCheck`, and `piiScan`, so every `analyzeSession()` call includes it
in `findings` under `check: "opt_out"`. The demo UI (`client/src/App.jsx`)
renders `n/a` findings with a neutral badge, distinct from pass (green) and
flag (red), and ships a sample session (`optout-ignored`) that demonstrates
the flag case.
