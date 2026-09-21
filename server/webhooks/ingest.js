import { verifyApiKey, ALL_SCOPES_SENTINEL } from "../apiKeys.js";
import { PACK_IDS } from "../packs/index.js";
import { analyzeSession } from "../checks/analyze.js";
import { requestCacheKey } from "../warmCache.js";
import { dbConfigured, upsertReportCache } from "../reportCache.js";
import * as providers from "../providers/registry.js";

export function resolvePatternPackIds(scopes) {
  if (scopes.includes(ALL_SCOPES_SENTINEL)) return PACK_IDS;
  return PACK_IDS.filter((id) => scopes.includes(id));
}

export function validateSessionPayload(body) {
  const session = body?.session;
  if (!session || !Array.isArray(session.turns)) {
    return { ok: false, error: "session with a turns array is required" };
  }
  return { ok: true, session };
}

// Fire-and-forget async pipeline, dispatched off the fast-ack response path
// (see handleIngest below). Any failure is logged with the session id so
// it's discoverable rather than silently swallowed.
export async function processIngestedSession(
  { session, scopes },
  {
    reportCache,
    analyzeSessionImpl = analyzeSession,
    llmGateway = providers.getModel().complete,
    modelProviderId = providers.getConfig().model.providerId,
  } = {},
) {
  try {
    const patternPackIds = resolvePatternPackIds(scopes);
    const key = requestCacheKey(session, patternPackIds, modelProviderId);
    const cached = reportCache?.get(key);
    if (cached) return cached;

    const report = await analyzeSessionImpl(session, { patternPackIds, llmGateway });
    const hasErroredCheck = report.findings.some((f) => f.status === "error");
    if (!hasErroredCheck) {
      reportCache?.set(key, report);
      if (dbConfigured()) {
        await upsertReportCache(key, report).catch((err) => {
          console.error(`Ingest report persist failed for session ${session.sessionId}: ${err.message}`);
        });
      }
    }
    return report;
  } catch (err) {
    console.error(`Ingest analysis failed for session ${session.sessionId}: ${err.message}`);
    throw err;
  }
}

// POST /v1/ingest/:apiKey - see docs/webhook-pivot-idea.md.
// The customer's own backend (running their own voice agent, on any
// platform) POSTs the transcript here directly after a call ends, in the
// same {turns: [{role, text, tMs}]} shape analyzeSession already consumes.
// The path segment is the customer's ComplyLine API key - it's the only
// credential involved; there is no AssemblyAI credential or SDK call in this
// path at all.
//
// Auth happens synchronously so we can ack fast; analysis (which needs the
// LLM Gateway and can take well over a typical client timeout) is
// dispatched async, off the response path.
export function handleIngest(reportCache, { verifyKey = verifyApiKey, dispatch = processIngestedSession } = {}) {
  return async (req, res) => {
    const rawKey = req.params.apiKey;
    const verification = await verifyKey(rawKey);
    if (!verification.valid) {
      const status = verification.reason === "not_configured" ? 503 : 401;
      return res.status(status).json({ error: `Invalid API key: ${verification.reason}` });
    }

    const parsed = validateSessionPayload(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    res.status(200).json({ ok: true });

    dispatch({ session: parsed.session, scopes: verification.scopes }, { reportCache }).catch(() => {
      // already logged inside processIngestedSession
    });
  };
}
