import { test } from "node:test";
import assert from "node:assert/strict";
import { genericPack, hipaaPack, financePack, ferpaPack } from "../checks/patternPacks.js";
import { PACKS, packCatalog, auditPackCoverage, INDUSTRY_PACK_IDS, caSb1001Pack, caAb489Pack } from "./index.js";

test("patternPacks.js still re-exports every shipped pack", () => {
  assert.equal(genericPack.id, "generic");
  assert.equal(hipaaPack.id, "hipaa");
  assert.equal(financePack.id, "finance");
  assert.equal(ferpaPack.id, "ferpa");
  assert.equal(PACKS.hipaa, hipaaPack);
  assert.equal(PACKS.ferpa, ferpaPack);
});

test("state-law packs are registered and selectable like any other industry pack", () => {
  assert.equal(caSb1001Pack.id, "ca_sb1001");
  assert.equal(caAb489Pack.id, "ca_ab489");
  assert.equal(PACKS.ca_sb1001, caSb1001Pack);
  assert.equal(PACKS.ca_ab489, caAb489Pack);
  assert.ok(INDUSTRY_PACK_IDS.includes("ca_sb1001"));
  assert.ok(INDUSTRY_PACK_IDS.includes("ca_ab489"));
  assert.equal(typeof caSb1001Pack.check, "function");
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
    assert.ok(Array.isArray(row.patterns));
    assert.equal(row.specimens, undefined);
    assert.ok(row.checkpointCount > 0);
    for (const pattern of row.patterns) {
      assert.equal(typeof pattern.id, "string");
      assert.equal(typeof pattern.label, "string");
      assert.equal(pattern.regex, undefined);
    }
    if (row.patterns.length === 0) {
      assert.equal(typeof row.detectionSummary, "string");
      assert.ok(row.detectionSummary.length > 0);
    } else {
      assert.equal(row.detectionSummary, undefined);
    }
  }
});

test("packCatalog includes HIPAA pattern labels for tooltips", () => {
  const hipaa = packCatalog().find((p) => p.id === "hipaa");
  assert.deepEqual(
    hipaa.patterns.map((p) => p.label),
    [
      "Possible Medical Record Number (MRN)",
      "Possible National Provider Identifier (NPI)",
      "Possible patient ID",
    ],
  );
});

test("check-only packs expose detectionSummary for tooltips", () => {
  const catalog = packCatalog();
  assert.equal(catalog.find((p) => p.id === "tcpa").detectionSummary, "Consent event logged before call");
  assert.equal(
    catalog.find((p) => p.id === "recording_consent").detectionSummary,
    "Recording-disclosure language in first 10s",
  );
  assert.equal(
    catalog.find((p) => p.id === "ca_sb1001").detectionSummary,
    "Bot/AI self-identification anywhere in call",
  );
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
