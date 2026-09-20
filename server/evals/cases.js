const EVAL_EPOCH = "2026-09-14T00:00:00.000Z";
const EVAL_CONSENT = "2026-09-13T23:59:55.000Z";
const PREAMBLE = "Hi, this is an AI assistant. This call may be recorded.";

function specimenSession(packId, patternId, kind, n, utterance) {
  return {
    sessionId: `eval_${packId}_${patternId}_${kind}_${n}`,
    startedAt: EVAL_EPOCH,
    consentEvent: { granted: true, timestamp: EVAL_CONSENT },
    turns: [
      { role: "agent", text: PREAMBLE, tMs: 500 },
      { role: "user", text: utterance, tMs: 3000 },
    ],
  };
}

/**
 * Project a pack's specimens + scenarios into cases. Pure. No analyze.
 * @param {object} pack
 * @returns {object[]}
 */
export function casesForPack(pack) {
  const cases = [];
  for (const pattern of pack.patterns) {
    const specimens = pattern.specimens ?? [];
    let pos = 0;
    let neg = 0;
    for (const specimen of specimens) {
      if (specimen.kind === "positive") {
        pos += 1;
        cases.push({
          id: `${pack.id}/${pattern.id}/detects/${pos}`,
          ownerPackId: pack.id,
          patternId: pattern.id,
          kind: "detects",
          title: `detects ${pattern.id}`,
          claim: `${pattern.label} spoken is flagged as ${pattern.id}`,
          session: specimenSession(pack.id, pattern.id, "positive", pos, specimen.utterance),
          expectedPatternIds: [pattern.id],
        });
      } else if (specimen.kind === "negative") {
        neg += 1;
        cases.push({
          id: `${pack.id}/${pattern.id}/ignores/${neg}`,
          ownerPackId: pack.id,
          patternId: pattern.id,
          kind: "ignores",
          title: `ignores near-miss for ${pattern.id}`,
          claim: specimen.why
            ? `${pattern.id} stays quiet (${specimen.why})`
            : `${pattern.id} does not fire on this near-miss`,
          session: specimenSession(pack.id, pattern.id, "negative", neg, specimen.utterance),
          expectedPatternIds: [],
        });
      }
    }
  }
  for (const scenario of pack.scenarios ?? []) {
    cases.push({
      id: `${pack.id}/scenario/${scenario.id}`,
      ownerPackId: pack.id,
      patternId: null,
      kind: "scenario",
      title: scenario.title,
      claim: `scenario flags ${scenario.expectPatternIds.join(", ")}`,
      session: scenario.session,
      expectedPatternIds: [...scenario.expectPatternIds],
    });
  }
  return cases;
}

export function ownerItems(piiFinding, ownerPackId) {
  return (piiFinding?.items ?? []).filter((item) => item.packId === ownerPackId);
}

export function diagnoseOwnerMiss(pattern, session, items) {
  if (!pattern) return "pattern missing from pack";
  if (items.some((item) => item.patternId === pattern.id)) return null;
  const text = (session.turns ?? []).map((t) => t.text).join("\n");
  const re = new RegExp(pattern.regex.source, pattern.regex.flags);
  const matches = [...text.matchAll(re)].map((m) => m[0]);
  if (matches.length === 0) return "regex never matched";
  if (pattern.validate && matches.every((m) => !pattern.validate(m))) {
    return "matched but validate() rejected it";
  }
  return "regex matched but pii_scan did not emit this patternId";
}
