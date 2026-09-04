# Recording-consent check

`server/checks/recordingConsentCheck.js`, findings key `recording_consent`.

## What it checks

Scans early agent turns (first 10 seconds, same window as the AI-disclosure
check) for recording-disclosure language such as "this call may be recorded",
"this call is being recorded", or "recorded for quality purposes." If none is
found, the finding is flagged; otherwise it passes.

## Legal basis

Two-party/all-party-consent ("wiretap") statutes - in force in California and
10+ other states - require notice that a call is being recorded before
recording proceeds. This is a distinct legal exposure from the existing
`consent` check, which covers TCPA consent-to-be-called, and from the
`ai_disclosure` check, which covers state AI-disclosure laws (e.g. CA AB
2905). Recording-consent obligations attach to the act of recording itself,
not to any particular industry, so this check applies the same
industry-agnostic framing already used for the other three checks.

## Honest-limitation framing

This check reports whether recording-disclosure *language* was detected in
the transcript, nothing more. It does not determine:

- Whether the call is actually being recorded (that's a system fact outside
  the transcript).
- Whether the specific wording satisfies any given state's wiretap statute
  in full (requirements vary by state - some require explicit consent, not
  just notice).
- Legal compliance in general - this is a signal for a human reviewer, not a
  legal determination.

A `pass` means disclosure language was detected early in the call; a `flag`
means it wasn't found in the scanned window. Treat both as inputs to review,
not as a verdict.
