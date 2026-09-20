import { test } from "node:test";
import assert from "node:assert/strict";
import { genericPack, hipaaPack, financePack, ferpaPack } from "../checks/patternPacks.js";
import { PACKS, packCatalog, auditPackCoverage, INDUSTRY_PACK_IDS } from "./index.js";

test("patternPacks.js still re-exports every shipped pack", () => {
  assert.equal(genericPack.id, "generic");
  assert.equal(hipaaPack.id, "hipaa");
  assert.equal(financePack.id, "finance");
  assert.equal(ferpaPack.id, "ferpa");
  assert.equal(PACKS.hipaa, hipaaPack);
  assert.equal(PACKS.ferpa, ferpaPack);
});

test("every pattern in every pack carries positive and negative specimens", () => {
  const audit = auditPackCoverage();
  assert.deepEqual(audit.missingPositive, []);
  assert.deepEqual(audit.missingNegative, []);
  assert.deepEqual(audit.missingWhy, []);
  assert.deepEqual(audit.orphanScenarioExpectations, []);
});

test("packCatalog lists industry packs only and strips regexes", () => {
  const catalog = packCatalog();
  assert.deepEqual(
    catalog.map((p) => p.id),
    INDUSTRY_PACK_IDS,
  );
  assert.ok(!catalog.some((p) => p.id === "generic"));
  for (const row of catalog) {
    assert.equal(typeof row.asserts, "string");
    assert.ok(row.asserts.length > 0);
    assert.equal(row.patterns, undefined);
    assert.equal(row.specimens, undefined);
    assert.ok(row.checkpointCount > 0);
  }
});

test("HIPAA asserts identifier detection, not Safe Harbor coverage", () => {
  assert.match(PACKS.hipaa.asserts, /3 spoken identifier/);
  assert.doesNotMatch(PACKS.hipaa.asserts, /18 Safe Harbor categories\.$/);
  assert.match(PACKS.hipaa.asserts, /Not HIPAA's 18/);
});

test("FERPA asserts a narrow identifier screen, not compliance coverage", () => {
  assert.match(PACKS.ferpa.asserts, /3 labeled student-record identifier/);
  assert.match(PACKS.ferpa.asserts, /broader and context-dependent/);
  assert.match(PACKS.ferpa.asserts, /not a FERPA compliance determination/i);
});
