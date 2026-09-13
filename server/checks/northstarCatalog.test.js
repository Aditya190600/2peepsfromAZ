import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSession } from "./analyze.js";
import { NORTHSTAR_SESSIONS, NORTHSTAR_SESSION_KEYS } from "../../client/src/sampleSessions.js";
import { headlineVerdict } from "../../client/src/compliance.js";

// Fakes the LLM Gateway deterministically from the transcript text instead of
// hitting the network, matching the fake used in analyze.test.js. Disclosure
// is "detected" whenever the prompt's transcript mentions being an AI -
// exactly what the Northstar fixtures do or deliberately don't say.
function fakeLlmGateway(messages) {
  const systemPrompt = messages[0].content;
  const userContent = messages[1].content;
  if (systemPrompt.includes("disclos")) {
    const disclosed = /\bAI (assistant|system)\b/i.test(userContent);
    return Promise.resolve(JSON.stringify({ disclosed, turnIndex: disclosed ? 0 : null, quote: null }));
  }
  return Promise.resolve(JSON.stringify({ items: [] }));
}

test("Northstar Voice catalog is exactly 12 sessions with the pinned IDs", () => {
  assert.equal(NORTHSTAR_SESSION_KEYS.length, 12);
  assert.equal(new Set(NORTHSTAR_SESSION_KEYS).size, 12);
  for (const id of ["sess_clean_01", "sess_tcpa_04", "sess_late_01"]) {
    assert.ok(NORTHSTAR_SESSION_KEYS.includes(id), `missing ${id}`);
    assert.ok(NORTHSTAR_SESSIONS[id], `no session data for ${id}`);
  }
});

test("Northstar Voice catalog analyzes to 10 pass / 2 flagged / 83% with pinned severities", async () => {
  const reports = await Promise.all(
    NORTHSTAR_SESSION_KEYS.map((key) => analyzeSession(NORTHSTAR_SESSIONS[key], { llmGateway: fakeLlmGateway }))
  );
  const verdictByKey = Object.fromEntries(
    NORTHSTAR_SESSION_KEYS.map((key, i) => [key, headlineVerdict(reports[i].findings)])
  );

  const flagged = Object.values(verdictByKey).filter((v) => v.flaggedCount > 0);
  const passed = NORTHSTAR_SESSION_KEYS.length - flagged.length;

  assert.equal(passed, 10);
  assert.equal(flagged.length, 2);
  assert.equal(Math.round((passed / NORTHSTAR_SESSION_KEYS.length) * 100), 83);

  assert.equal(verdictByKey.sess_tcpa_04.level, "critical");
  assert.equal(verdictByKey.sess_late_01.level, "high");
  assert.equal(verdictByKey.sess_clean_01.level, "clear");
});
