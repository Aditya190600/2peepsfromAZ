import crypto from "node:crypto";

export function cacheKey(session, patternPackIds) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ session, patternPackIds: [...patternPackIds].sort() }))
    .digest("hex");
}

// Suffixes the base cacheKey with the model provider, except for the default
// AssemblyAI path, so a non-default provider selection can't collide with
// (or serve stale results from) the shared Northstar boot-warm cache. Shared
// by the manual /v1/analyze-session route and the webhook receiver so both
// land reports in the same reportCache under the same key.
export function requestCacheKey(session, patternPackIds, modelProviderId) {
  const base = cacheKey(session, patternPackIds);
  return modelProviderId === "assemblyai-gateway" ? base : `${base}:${modelProviderId}`;
}

export async function warmNorthstarCache({
  reportCache,
  analyzeSession,
  sessions,
  sessionKeys,
  patternPackIds = ["generic"],
  persist,
}) {
  const errors = [];
  let cached = 0;
  for (const key of sessionKeys) {
    const session = sessions[key];
    const hash = cacheKey(session, patternPackIds);
    if (reportCache.has(hash)) {
      cached += 1;
      console.log(`Northstar cache: ${key} hydrated (${cached} of ${sessionKeys.length}).`);
      continue;
    }
    try {
      const report = await analyzeSession(session, { patternPackIds });
      const hasErroredCheck = (report.findings ?? []).some((f) => f.status === "error");
      if (hasErroredCheck) {
        errors.push({ key, error: "a check returned status error" });
        console.error(`Northstar cache: ${key} skipped (a check returned status error).`);
        continue;
      }
      reportCache.set(hash, report);
      if (persist) {
        try {
          await persist(hash, report);
        } catch (persistErr) {
          console.error(
            `Northstar cache: ${key} persist skipped (${persistErr.message ?? persistErr}).`
          );
        }
      }
      cached += 1;
      console.log(`Northstar cache: ${key} cached (${cached} of ${sessionKeys.length}).`);
    } catch (err) {
      errors.push({ key, error: err.message ?? String(err) });
      console.error(`Northstar cache: ${key} failed (${err.message ?? String(err)}).`);
    }
  }
  return {
    ok: errors.length === 0,
    cached,
    total: sessionKeys.length,
    errors,
  };
}
