import crypto from "node:crypto";

export function cacheKey(session, patternPackIds) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ session, patternPackIds: [...patternPackIds].sort() }))
    .digest("hex");
}

export async function warmNorthstarCache({
  reportCache,
  analyzeSession,
  sessions,
  sessionKeys,
  patternPackIds = ["generic"],
}) {
  const errors = [];
  let cached = 0;
  for (const key of sessionKeys) {
    const session = sessions[key];
    try {
      const report = await analyzeSession(session, { patternPackIds });
      const hasErroredCheck = (report.findings ?? []).some((f) => f.status === "error");
      if (hasErroredCheck) {
        errors.push({ key, error: "a check returned status error" });
        continue;
      }
      reportCache.set(cacheKey(session, patternPackIds), report);
      cached += 1;
    } catch (err) {
      errors.push({ key, error: err.message ?? String(err) });
    }
  }
  return {
    ok: errors.length === 0,
    cached,
    total: sessionKeys.length,
    errors,
  };
}
