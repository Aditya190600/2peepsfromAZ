// Two-party/all-party-consent (wiretap) statute check: was recording disclosure
// language detected early in the call. CA and 10+ other states require notice
// that a call is being recorded, distinct from TCPA consent-to-be-called.
const RECORDING_DISCLOSURE_WINDOW_MS = 10_000;
const RECORDING_DISCLOSURE_PHRASES =
  /\b(this call (is being |may be )?record(ed|ing)|call(s)? (is|are) record(ed|ing)|record(ed|ing) for quality|record(ed|ing) for training)\b/i;

export function recordingConsentCheck(session) {
  const turns = session.turns ?? [];
  const earlyAgentTurns = turns.filter(
    (t) => t.role === "agent" && (t.tMs ?? 0) <= RECORDING_DISCLOSURE_WINDOW_MS
  );

  const match = earlyAgentTurns.find((t) => RECORDING_DISCLOSURE_PHRASES.test(t.text));

  if (!match) {
    return {
      check: "recording_consent",
      status: "flag",
      detail: `No recording-disclosure language detected in agent turns within the first ${
        RECORDING_DISCLOSURE_WINDOW_MS / 1000
      }s.`,
    };
  }
  return {
    check: "recording_consent",
    status: "pass",
    detail: `Recording-disclosure language detected at ${match.tMs}ms: "${match.text}"`,
    tMs: match.tMs,
  };
}
