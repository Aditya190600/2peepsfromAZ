import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePackEvalRequest } from "./wire.js";
import { evaluatePacks, offlineEvalGateway } from "./runPackEvals.js";
import { diagnoseOwnerMiss } from "./cases.js";
import { PACKS } from "../packs/index.js";

test("parsePackEvalRequest rejects empty, generic, and unknown ids", () => {
  assert.equal(parsePackEvalRequest({ packIds: [] }).ok, false);
  assert.equal(parsePackEvalRequest({ packIds: ["generic"] }).ok, false);
  assert.equal(parsePackEvalRequest({ packIds: ["ferpa"] }).ok, false);
  const ok = parsePackEvalRequest({ packIds: ["finance", "hipaa", "hipaa"] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.packIds, ["hipaa", "finance"]);
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

test("HIPAA+GLBA omitted trial keeps the other pack enabled", async () => {
  const run = await evaluatePacks(["hipaa", "finance"]);
  assert.equal(run.failed, 0);
  const hipaaCase = run.suites.find((s) => s.packId === "hipaa").cases[0];
  assert.deepEqual(hipaaCase.enabled.patternPackIds, ["generic", "hipaa", "finance"]);
  assert.deepEqual(hipaaCase.ownerOmitted.patternPackIds, ["generic", "finance"]);
});

test("evaluatePacks and the pack-evals handler do not touch report cache", async () => {
  const evalSrc = await readFile(new URL("./runPackEvals.js", import.meta.url), "utf8");
  assert.doesNotMatch(evalSrc, /from ["']\.\.\/warmCache\.js["']/);
  assert.doesNotMatch(evalSrc, /from ["']\.\.\/supabaseCache\.js["']/);

  const indexSrc = await readFile(new URL("../index.js", import.meta.url), "utf8");
  const start = indexSrc.indexOf('app.post("/v1/pack-evals"');
  const next = indexSrc.indexOf("app.post(", start + 1);
  assert.ok(start >= 0);
  const handler = indexSrc.slice(start, next === -1 ? undefined : next);
  assert.equal(handler.includes("reportCache"), false);
  assert.equal(handler.includes("warmNorthstarCache"), false);
  assert.equal(handler.includes("upsertReportCache"), false);
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
