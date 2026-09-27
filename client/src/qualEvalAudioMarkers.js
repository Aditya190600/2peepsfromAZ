function turnIndexForCriterion(criterion, evidenceQuotes) {
  const explanation = criterion.explanation ?? "";
  const byQuote = evidenceQuotes.find((eq) => {
    const quote = (eq.quote ?? "").trim();
    return quote && explanation.includes(quote);
  });
  if (byQuote) return byQuote.turnIndex;
  const turnMatch = explanation.match(/\bTurn\s+(\d+)\b/i);
  if (turnMatch) return Number(turnMatch[1]);
  const byTurnRef = evidenceQuotes.find((eq) =>
    new RegExp(`\\bTurn\\s+${eq.turnIndex}\\b`, "i").test(explanation),
  );
  return byTurnRef?.turnIndex ?? null;
}

export function runToAudioMarkers(run) {
  const turns = run?.transcript?.turns ?? [];
  const evidenceQuotes = run?.evidenceQuotes ?? [];
  const markers = [];

  for (const turn of turns) {
    if (turn.tMs == null) continue;
    const roleLabel = turn.role === "user" ? "Caller" : "Agent";
    markers.push({
      tMs: turn.tMs,
      kind: "turn",
      label: `${roleLabel}: ${(turn.text ?? "").slice(0, 60)}`,
    });
  }

  for (const criterion of run?.criterionResults ?? []) {
    if (criterion.met || !criterion.explanation?.trim()) continue;
    const turnIndex = turnIndexForCriterion(criterion, evidenceQuotes);
    if (turnIndex == null) continue;
    const turn = turns[turnIndex];
    if (!turn || turn.tMs == null) continue;
    markers.push({
      tMs: turn.tMs,
      kind: "flag",
      label: criterion.explanation.trim(),
    });
  }

  return markers;
}
