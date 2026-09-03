// CA AB 2905-style AI-disclosure-timing check: was the AI nature of the call
// disclosed within the first few seconds.
const DISCLOSURE_WINDOW_MS = 10_000;
const DISCLOSURE_PHRASES =
  /\b(AI|artificial intelligence|automated|virtual assistant|not a human|synthetic voice|generated voice)\b/i;

export function disclosureCheck(session) {
  const turns = session.turns ?? [];
  const earlyAgentTurns = turns.filter(
    (t) => t.role === "agent" && (t.tMs ?? 0) <= DISCLOSURE_WINDOW_MS
  );

  const match = earlyAgentTurns.find((t) => DISCLOSURE_PHRASES.test(t.text));

  if (!match) {
    return {
      check: "ai_disclosure",
      status: "flag",
      detail: `No AI-disclosure language detected in agent turns within the first ${
        DISCLOSURE_WINDOW_MS / 1000
      }s.`,
    };
  }
  return {
    check: "ai_disclosure",
    status: "pass",
    detail: `AI disclosure detected at ${match.tMs}ms: "${match.text}"`,
  };
}
