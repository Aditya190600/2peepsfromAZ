import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSession } from "./analyze.js";
import { hipaaPack, financePack } from "./patternPacks.js";
import { SAMPLE_SESSIONS, SCRIPTED_VIOLATION_DEMO_KEYS } from "../../client/src/sampleSessions.js";
import { headlineVerdict } from "../../client/src/compliance.js";

// LLM Gateway would report the caller's real name/clinic as free-form PII
// too; fake it out so these tests pin only the deterministic pattern-pack
// hit that HIPAA/GLBA framing is supposed to trigger.
const fakeLlmGateway = async () => JSON.stringify({ items: [] });

test("scripted HIPAA demo is flagged critical via the hipaa pattern pack", async () => {
  const session = SAMPLE_SESSIONS["hipaa-diagnosis-readback"];
  const report = await analyzeSession(session, {
    patternPackIds: ["generic", "hipaa"],
    llmGateway: fakeLlmGateway,
  });
  const pii = report.findings.find((f) => f.check === "pii_scan");
  assert.equal(pii.status, "flag");
  assert.ok(pii.items.some((i) => i.packId === hipaaPack.id));
  assert.equal(headlineVerdict(report.findings).level, "critical");
});

test("scripted GLBA demo is flagged critical via the finance pattern pack", async () => {
  const session = SAMPLE_SESSIONS["glba-account-disclosure"];
  const report = await analyzeSession(session, {
    patternPackIds: ["generic", "finance"],
    llmGateway: fakeLlmGateway,
  });
  const pii = report.findings.find((f) => f.check === "pii_scan");
  assert.equal(pii.status, "flag");
  assert.ok(pii.items.some((i) => i.packId === financePack.id));
  assert.equal(headlineVerdict(report.findings).level, "critical");
});

test("scripted violation demo catalog has exactly the two scripted keys", () => {
  assert.deepEqual(SCRIPTED_VIOLATION_DEMO_KEYS, ["hipaa-diagnosis-readback", "glba-account-disclosure"]);
});
