import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePackEvalRequest } from "./wire.js";
import { evaluatePacks, offlineEvalGateway } from "./runPackEvals.js";
import { diagnoseOwnerMiss } from "./cases.js";
import { PACKS } from "../packs/index.js";
import { analyzeSession } from "../checks/analyze.js";

test("parsePackEvalRequest rejects empty, generic, and unknown ids", () => {
  assert.equal(parsePackEvalRequest({ packIds: [] }).ok, false);
  assert.equal(parsePackEvalRequest({ packIds: ["generic"] }).ok, false);
  assert.equal(parsePackEvalRequest({ packIds: ["pci"] }).ok, false);
  const ok = parsePackEvalRequest({ packIds: ["ferpa", "finance", "hipaa", "hipaa"] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.packIds, ["hipaa", "finance", "ferpa"]);
});

test("HIPAA suite passes with the offline gateway", async () => {
  let liveCalls = 0;
  const gw = async (messages) => {
    liveCalls += 1;
    return offlineEvalGateway(messages);
  };
  const run = await evaluatePacks(["hipaa"], { llmGateway: gw });
  assert.equal(run.judge, "synthetic-offline");
  assert.equal(
    run.failed,
    0,
    JSON.stringify(
      run.suites.flatMap((s) => s.cases.filter((c) => !c.passed)),
      null,
      2,
    ),
  );
  assert.ok(run.passed > 0);
  assert.match(run.suites[0].asserts, /Not HIPAA's 18/);
  const omitted = run.suites[0].cases[0].ownerOmitted;
  assert.deepEqual(omitted.patternPackIds, ["generic"]);
  assert.equal(omitted.passed, true);
  assert.ok(liveCalls > 0);
});

test("finance suite passes with the offline gateway", async () => {
  const run = await evaluatePacks(["finance"]);
  assert.equal(run.failed, 0);
  assert.ok(run.passed > 0);
  assert.equal(run.suites.length, 1);
  assert.equal(run.suites[0].packId, "finance");
});

test("FERPA suite passes with the offline gateway", async () => {
  const run = await evaluatePacks(["ferpa"]);
  assert.equal(run.failed, 0);
  assert.ok(run.passed > 0);
  assert.equal(run.suites.length, 1);
  assert.equal(run.suites[0].packId, "ferpa");
  assert.match(run.suites[0].asserts, /not a FERPA compliance determination/i);
});

test("GDPR suite passes with the offline gateway", async () => {
  const run = await evaluatePacks(["gdpr"]);
  assert.equal(
    run.failed,
    0,
    JSON.stringify(
      run.suites.flatMap((s) => s.cases.filter((c) => !c.passed)),
      null,
      2,
    ),
  );
  assert.ok(run.passed > 0);
  assert.equal(run.suites.length, 1);
  assert.equal(run.suites[0].packId, "gdpr");
});

test("FCRA suite passes with the offline gateway", async () => {
  const run = await evaluatePacks(["fcra"]);
  assert.equal(run.failed, 0);
  assert.ok(run.passed > 0);
  assert.equal(run.suites.length, 1);
  assert.equal(run.suites[0].packId, "fcra");
});

test("FCRA whole-session checks do not false-positive when the disclosure is spoken in a later turn", async () => {
  const report = await analyzeSession(PACKS.fcra.scenarios[1].session, {
    patternPackIds: ["generic", "fcra"],
    llmGateway: offlineEvalGateway,
  });
  const adverseAction = report.findings.find((f) => f.check === "fcra_adverse_action_disclosure");
  const creditPull = report.findings.find((f) => f.check === "fcra_credit_pull_permissible_purpose");
  assert.equal(adverseAction.status, "pass");
  assert.equal(creditPull.status, "pass");
});

test("FCRA whole-session checks flag when the disclosure never appears in the call", async () => {
  const report = await analyzeSession(PACKS.fcra.scenarios[0].session, {
    patternPackIds: ["generic", "fcra"],
    llmGateway: offlineEvalGateway,
  });
  const adverseAction = report.findings.find((f) => f.check === "fcra_adverse_action_disclosure");
  const creditPull = report.findings.find((f) => f.check === "fcra_credit_pull_permissible_purpose");
  assert.equal(adverseAction.status, "flag");
  assert.equal(creditPull.status, "flag");
});

test("HIPAA+GLBA omitted trial keeps the other pack enabled", async () => {
  const run = await evaluatePacks(["hipaa", "finance"]);
  assert.equal(run.failed, 0);
  const hipaaCase = run.suites.find((s) => s.packId === "hipaa").cases[0];
  assert.deepEqual(hipaaCase.enabled.patternPackIds, ["generic", "hipaa", "finance"]);
  assert.deepEqual(hipaaCase.ownerOmitted.patternPackIds, ["generic", "finance"]);
});

test("FERPA omitted trial keeps the other selected packs enabled", async () => {
  const run = await evaluatePacks(["hipaa", "finance", "ferpa"]);
  assert.equal(run.failed, 0);
  const ferpaCase = run.suites.find((s) => s.packId === "ferpa").cases[0];
  assert.deepEqual(ferpaCase.enabled.patternPackIds, ["generic", "hipaa", "finance", "ferpa"]);
  assert.deepEqual(ferpaCase.ownerOmitted.patternPackIds, ["generic", "hipaa", "finance"]);
});

test("diagnoseOwnerMiss distinguishes regex miss from Luhn reject", () => {
  const card = PACKS.generic.patterns.find((p) => p.id === "credit_card");
  const miss = {
    turns: [{ role: "user", text: "please call 555-0100", tMs: 0 }],
  };
  const luhnFail = {
    turns: [{ role: "user", text: "The card on file is 4111111111111112.", tMs: 0 }],
  };
  assert.equal(diagnoseOwnerMiss(card, miss, []), "regex never matched");
  assert.equal(diagnoseOwnerMiss(card, luhnFail, []), "matched but validate() rejected it");
});
