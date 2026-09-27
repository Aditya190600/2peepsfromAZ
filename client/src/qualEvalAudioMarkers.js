export function runToAudioMarkers(run) {
  const turns = run?.transcript?.turns ?? [];
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

  for (const eq of run?.evidenceQuotes ?? []) {
    const turn = turns[eq.turnIndex];
    if (!turn || turn.tMs == null) continue;
    const quote = (eq.quote ?? "").trim();
    markers.push({
      tMs: turn.tMs,
      kind: "flag",
      label: quote ? `"${quote.slice(0, 80)}"` : "Evidence",
    });
  }

  return markers;
}
