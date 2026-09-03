function redact(match) {
  if (match.length <= 4) return "*".repeat(match.length);
  return match.slice(0, 2) + "*".repeat(match.length - 4) + match.slice(-2);
}

// Scans every transcript turn against every pattern in every supplied pack.
// Packs are pluggable: pass [genericPack] for the core scan, or
// [genericPack, hipaaPack] to drop in an industry pack alongside it.
export function piiScan(session, patternPacks) {
  const items = [];
  const turns = session.turns ?? [];

  turns.forEach((turn, turnIndex) => {
    for (const pack of patternPacks) {
      for (const pattern of pack.patterns) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        for (const match of turn.text.matchAll(regex)) {
          if (pattern.validate && !pattern.validate(match[0])) continue;
          items.push({
            turnIndex,
            role: turn.role,
            packId: pack.id,
            patternId: pattern.id,
            label: pattern.label,
            matchRedacted: redact(match[0]),
          });
        }
      }
    }
  });

  return {
    check: "pii_scan",
    status: items.length > 0 ? "flag" : "pass",
    patternPacksUsed: patternPacks.map((p) => p.id),
    items,
  };
}
