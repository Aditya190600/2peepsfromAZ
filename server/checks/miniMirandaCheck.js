// FDCPA mini-Miranda disclosure check: was "this is an attempt to collect a
// debt" (or clearly equivalent language) stated early in the call, per
// 15 U.S.C. §1692e(11). n/a when the fdcpa pack isn't selected for this
// session - this check only applies to debt-collection calls, same pattern
// scopeAdherenceCheck.js uses for persona-gated checks.
const MINI_MIRANDA_WINDOW_MS = 10_000;
const MINI_MIRANDA_PHRASES =
  /\b(this is an attempt to collect a debt|attempting to collect a debt|this call is (?:an attempt|from a debt collector) to collect a debt|we are (?:a debt collector|attempting to collect) )\b/i;

export function miniMirandaCheck(session, { patternPackIds = [] } = {}) {
  if (!patternPackIds.includes("fdcpa")) {
    return { check: "mini_miranda", status: "n/a", detail: "fdcpa pack not selected for this session." };
  }

  const turns = session.turns ?? [];
  const earlyAgentTurns = turns.filter(
    (t) => t.role === "agent" && (t.tMs ?? 0) <= MINI_MIRANDA_WINDOW_MS,
  );

  const match = earlyAgentTurns.find((t) => MINI_MIRANDA_PHRASES.test(t.text));

  if (!match) {
    return {
      check: "mini_miranda",
      status: "flag",
      detail: `No mini-Miranda debt-collection disclosure detected in agent turns within the first ${
        MINI_MIRANDA_WINDOW_MS / 1000
      }s (15 U.S.C. §1692e(11)).`,
    };
  }
  return {
    check: "mini_miranda",
    status: "pass",
    detail: `Mini-Miranda disclosure detected at ${match.tMs}ms: "${match.text}"`,
    tMs: match.tMs,
  };
}
