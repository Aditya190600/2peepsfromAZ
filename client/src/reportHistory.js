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

export function saveHistoryEntry(entry) {
  try {
    const history = loadHistory();
    history.unshift({ id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...entry });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage unavailable (private mode, quota) - history is a convenience, not load-bearing
  }
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
