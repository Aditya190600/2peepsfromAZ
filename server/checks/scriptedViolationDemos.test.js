import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSession } from "./analyze.js";
import { hipaaPack, financePack } from "./patternPacks.js";
import {
  SAMPLE_SESSIONS,
  SCRIPTED_VIOLATION_DEMO_KEYS,
  samplePatternPackIds,
} from "../../client/src/sampleSessions.js";
import { headlineVerdict } from "../../client/src/compliance.js";

// LLM Gateway would report the caller's real name/clinic as free-form PII
// too; fake it out so these tests pin only the deterministic pattern-pack
// hit that HIPAA/GLBA framing is supposed to trigger.
const fakeLlmGateway = async () => JSON.stringify({ items: [] });

test("scripted HIPAA demo is flagged critical via the hipaa pattern pack", async () => {
  const session = SAMPLE_SESSIONS["hipaa-diagnosis-readback"];
  const report = await analyzeSession(session, {
    patternPackIds: samplePatternPackIds("hipaa-diagnosis-readback"),
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
    patternPackIds: samplePatternPackIds("glba-account-disclosure"),
    llmGateway: fakeLlmGateway,
  });
  const pii = report.findings.find((f) => f.check === "pii_scan");
  assert.equal(pii.status, "flag");
  assert.ok(pii.items.some((i) => i.packId === financePack.id));
  assert.equal(headlineVerdict(report.findings).level, "critical");
});

// Regression: the Examples tab used to run these with whatever the visitor
// had ticked (by default nothing, i.e. generic only), so every scripted demo
// came back pass/N/A. The pack set must come from the demo itself.
test("each scripted demo's pack set comes from the demo, not the visitor's selection", () => {
  assert.deepEqual(samplePatternPackIds("hipaa-diagnosis-readback"), ["generic", "hipaa"]);
  assert.deepEqual(samplePatternPackIds("glba-account-disclosure"), ["generic", "finance"]);
  assert.deepEqual(samplePatternPackIds("glba-account-disclosure", ["hipaa", "finance"]), [
    "generic",
    "hipaa",
    "finance",
  ]);
  assert.deepEqual(samplePatternPackIds("clean-call", ["ferpa"]), ["generic", "ferpa"]);
});

test("scripted violation demo catalog has exactly the two scripted keys", () => {
  assert.deepEqual(SCRIPTED_VIOLATION_DEMO_KEYS, ["hipaa-diagnosis-readback", "glba-account-disclosure"]);
});
