// Minimal in-memory localStorage shim - Node's global localStorage needs a
// --localstorage-file flag we don't want to impose on `node --test`.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  saveHistoryEntry,
  buildHistoryEntry,
  loadHistory,
  clearHistory,
  findEntryBySessionId,
  historyEntrySession,
} from "./reportHistory.js";

const FINDINGS = [{ status: "pass", check: "consent" }];

function session(turns, overrides = {}) {
  return { sessionId: "sess_1", startedAt: "2026-09-03T10:00:00.000Z", turns, ...overrides };
}

test("live call entry round-trips turns/findings with no audioKey", () => {
  clearHistory();
  const liveSession = session([{ role: "agent", text: "Hi", tMs: 0 }], { startedAtMs: 1000 });
  const report = { sessionId: "sess_1", findings: FINDINGS };
  saveHistoryEntry(
    buildHistoryEntry({
      label: "Live call",
      report,
      session: liveSession,
      verdict: { level: "clear", label: "Clear" },
      durationMs: 4200,
    })
  );

  const [entry] = loadHistory();
  JSON.stringify(entry); // must be serializable
  assert.deepEqual(entry.turns, [{ role: "agent", text: "Hi", tMs: 0 }]);
  assert.equal(entry.turnCount, 1);
  assert.equal(entry.startedAt, "2026-09-03T10:00:00.000Z");
  assert.equal(entry.durationMs, 4200);
  assert.deepEqual(entry.findings, FINDINGS);
  assert.equal("audioKey" in entry, false);
});

test("sample entry stores audioKey; upload entry never does", () => {
  clearHistory();
  const sampleSession = session([
    { role: "agent", text: "Hi", tMs: 0 },
    { role: "user", text: "Hey", tMs: 3000 },
  ]);
  const report = { sessionId: "sess_1", findings: FINDINGS };
  saveHistoryEntry(
    buildHistoryEntry({
      label: "clean-call",
      report,
      session: sampleSession,
      verdict: { level: "clear", label: "Clear" },
      audioKey: "clean-call",
    })
  );
  saveHistoryEntry(
    buildHistoryEntry({
      label: "Uploaded audio",
      report,
      session: sampleSession,
      verdict: { level: "clear", label: "Clear" },
    })
  );

  const [uploadEntry, sampleEntry] = loadHistory();
  assert.equal(sampleEntry.audioKey, "clean-call");
  assert.equal(sampleEntry.durationMs, 3000); // falls back to last turn's tMs
  assert.equal("audioKey" in uploadEntry, false);
});

test("live-call source tag round-trips for SessionInspector's 'never stored' copy", () => {
  clearHistory();
  const liveSession = session([{ role: "agent", text: "Hi", tMs: 0 }]);
  const report = { sessionId: "sess_1", findings: FINDINGS };
  saveHistoryEntry(
    buildHistoryEntry({
      label: "Live call",
      report,
      session: liveSession,
      verdict: { level: "clear", label: "Clear" },
      source: "live",
    })
  );
  saveHistoryEntry(
    buildHistoryEntry({
      label: "Uploaded audio",
      report,
      session: liveSession,
      verdict: { level: "clear", label: "Clear" },
    })
  );

  const [uploadEntry, liveEntry] = loadHistory();
  assert.equal(liveEntry.source, "live");
  assert.equal("source" in uploadEntry, false);
});

test("persona round-trips onto the history entry from the analyzed session (captain-confirmed requirement)", () => {
  clearHistory();
  const personaSession = session([{ role: "agent", text: "Hi", tMs: 0 }], {
    persona: { id: "bank", label: "Bank teller", scope: "general banking questions only", seedViolation: false },
  });
  const report = { sessionId: "sess_1", findings: FINDINGS };
  saveHistoryEntry(
    buildHistoryEntry({
      label: "Live call",
      report,
      session: personaSession,
      verdict: { level: "clear", label: "Clear" },
      source: "live",
    })
  );
  const nonPersonaSession = session([{ role: "agent", text: "Hi", tMs: 0 }]);
  saveHistoryEntry(
    buildHistoryEntry({
      label: "Live call",
      report,
      session: nonPersonaSession,
      verdict: { level: "clear", label: "Clear" },
      source: "live",
    })
  );

  const [noPersonaEntry, personaEntry] = loadHistory();
  assert.deepEqual(personaEntry.persona, {
    id: "bank",
    label: "Bank teller",
    scope: "general banking questions only",
    seedViolation: false,
  });
  assert.equal("persona" in noPersonaEntry, false);
});

test("findEntryBySessionId returns null for an unknown id, not a throw", () => {
  clearHistory();
  assert.equal(findEntryBySessionId("sess_does_not_exist"), null);
  assert.equal(findEntryBySessionId(undefined), null);
});

test("pending live entry is saved before a report exists, then filled in place with the report", () => {
  clearHistory();
  saveHistoryEntry(buildHistoryEntry({ label: "Sample", report: { sessionId: "sess_old", findings: FINDINGS } }));
  const liveSession = session([{ role: "user", text: "Hi", tMs: 0 }], {
    consentEvent: { granted: true, timestamp: "2026-09-03T09:59:59.000Z" },
  });
  const id = saveHistoryEntry(
    buildHistoryEntry({ label: "Live call", session: liveSession, source: "live", patternPackIds: ["generic", "hipaa"] })
  );

  const pending = findEntryBySessionId("sess_1");
  assert.equal(pending.id, id);
  assert.equal(pending.pending, true);
  assert.equal(pending.verdictLabel, "Report pending");
  assert.equal("report" in pending, false);
  assert.deepEqual(pending.turns, [{ role: "user", text: "Hi", tMs: 0 }]);
  assert.deepEqual(historyEntrySession(pending), {
    sessionId: "sess_1",
    startedAt: "2026-09-03T10:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T09:59:59.000Z" },
    turns: [{ role: "user", text: "Hi", tMs: 0 }],
  });

  const report = { sessionId: "sess_1", findings: FINDINGS };
  for (let i = 0; i < 2; i++) {
    const savedId = saveHistoryEntry({
      ...buildHistoryEntry({
        label: "Live call",
        report,
        session: liveSession,
        verdict: { level: "clear", label: "Clear" },
        source: "live",
      }),
      id,
    });
    assert.equal(savedId, id);
  }

  const history = loadHistory();
  assert.equal(history.length, 2);
  assert.equal(history[0].id, id);
  assert.equal("pending" in history[0], false);
  assert.equal(history[0].verdictLabel, "Clear");
  assert.deepEqual(history[0].findings, FINDINGS);
  assert.equal(history[1].sessionId, "sess_old");
});
