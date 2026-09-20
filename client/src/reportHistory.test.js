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

test("findEntryBySessionId returns null for an unknown id, not a throw", () => {
  clearHistory();
  assert.equal(findEntryBySessionId("sess_does_not_exist"), null);
  assert.equal(findEntryBySessionId(undefined), null);
});
