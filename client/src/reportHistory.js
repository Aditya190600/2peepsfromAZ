// Persisted "recent reports" audit trail. localStorage keeps this true to the
// project's no-database architecture (see AGENTS.md) while still giving a
// compliance tool the record of what it checked that an auditor expects.
const STORAGE_KEY = "complyline_report_history_v1";
const MAX_ENTRIES = 200;

export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Builds the conversation-record fields (issue #72) shared by every
// saveHistoryEntry call site, from the session that was analyzed and the
// report it produced. `audioKey` must be a SAMPLE_AUDIO_URLS key - never a
// blob URL, which isn't valid across a reload/localStorage round-trip.
// With no `report`, builds a pending, transcript-only entry (`pending: true`)
// that keeps enough of the session (`consentEvent`, `patternPackIds`) for
// `historyEntrySession` to re-analyze it later.
// `recordingUrl` is different from `audioKey`: it's a durable server path
// (e.g. `/v1/recordings/<sessionId>`, see server/recordingsStore.js) for a
// live call recording persisted to the Railway bucket - safe to store since
// it survives reload, unlike a blob: URL.
export function buildHistoryEntry({
  label,
  session,
  report,
  audioKey,
  recordingUrl,
  durationMs,
  verdict,
  source,
  patternPackIds,
}) {
  const turns = (session?.turns ?? []).map(({ role, text, tMs }) => ({ role, text, tMs }));
  const lastTurnMs = turns.length ? turns[turns.length - 1].tMs : 0;
  return {
    timestamp: new Date().toISOString(),
    label,
    sessionId: report ? report.sessionId : (session?.sessionId ?? null),
    ...(report
      ? { verdictLevel: verdict?.level, verdictLabel: verdict?.label, report, findings: report.findings }
      : { pending: true, verdictLabel: "Report pending" }),
    turns,
    startedAt: session?.startedAt ?? null,
    durationMs: durationMs ?? lastTurnMs,
    turnCount: turns.length,
    ...(audioKey ? { audioKey } : {}),
    ...(recordingUrl ? { recordingUrl } : {}),
    ...(source ? { source } : {}),
    ...(session?.persona ? { persona: session.persona } : {}),
    ...(session?.consentEvent ? { consentEvent: session.consentEvent } : {}),
    ...(patternPackIds ? { patternPackIds } : {}),
  };
}

// The analyzable session a stored entry was built from, for re-running a
// pending entry's report.
export function historyEntrySession(entry) {
  return {
    sessionId: entry.sessionId,
    startedAt: entry.startedAt,
    consentEvent: entry.consentEvent ?? null,
    turns: entry.turns ?? [],
    ...(entry.persona ? { persona: entry.persona } : {}),
  };
}

// Saves `entry` and returns its id. An entry carrying the `id` of one already
// in history replaces it in place; anything else is added to the front.
export function saveHistoryEntry(entry) {
  const id = entry.id ?? `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const history = loadHistory();
    const index = entry.id ? history.findIndex((e) => e.id === entry.id) : -1;
    if (index >= 0) history[index] = { ...entry, id };
    else history.unshift({ ...entry, id });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage unavailable (private mode, quota) - history is a convenience, not load-bearing
  }
  return id;
}

export function findEntryBySessionId(sessionId) {
  if (!sessionId) return null;
  return loadHistory().find((entry) => entry.sessionId === sessionId) ?? null;
}

export function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
