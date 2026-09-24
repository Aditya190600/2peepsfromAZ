import { genericPack } from "./generic.js";
import { hipaaPack } from "./hipaa.js";
import { financePack } from "./finance.js";
import { ferpaPack } from "./ferpa.js";
import { coppaPack } from "./coppa.js";

export { genericPack, hipaaPack, financePack, ferpaPack, coppaPack };

/** @type {Record<string, object>} */
export const PACKS = {
  generic: genericPack,
  hipaa: hipaaPack,
  finance: financePack,
  ferpa: ferpaPack,
  coppa: coppaPack,
};

export const PACK_IDS = Object.keys(PACKS);
export const INDUSTRY_PACK_IDS = PACK_IDS.filter((id) => !PACKS[id].alwaysOn);

export function requirePack(id) {
  const pack = PACKS[id];
  if (!pack) throw new Error(`Unknown pack id "${id}". Valid: ${PACK_IDS.join(", ")}`);
  return pack;
}

/** Client-safe catalog. No regexes, no specimens, no sessions. */
export function packCatalog() {
  return Object.values(PACKS)
    .filter((pack) => !pack.alwaysOn)
    .map((pack) => ({
      id: pack.id,
      name: pack.name,
      citation: pack.citation,
      asserts: pack.asserts,
      alwaysOn: false,
      patternIds: pack.patterns.map((p) => p.id),
      checkpointCount: countCheckpoints(pack),
    }));
}

function countCheckpoints(pack) {
  let n = 0;
  for (const pattern of pack.patterns) {
    const specimens = pattern.specimens ?? [];
    n += specimens.filter((s) => s.kind === "positive").length * 2; // detects + isolated
    n += specimens.filter((s) => s.kind === "negative").length; // ignores
  }
  n += pack.scenarios?.length ?? 0;
  return n;
}

/**
 * Build-time conscience: every pattern needs a positive and a negative specimen;
 * negatives need a why; scenario expectPatternIds must exist on this pack.
 */
export function auditPackCoverage() {
  const missingPositive = [];
  const missingNegative = [];
  const missingWhy = [];
  const orphanScenarioExpectations = [];

  for (const pack of Object.values(PACKS)) {
    const patternIds = new Set(pack.patterns.map((p) => p.id));
    for (const pattern of pack.patterns) {
      const specimens = pattern.specimens ?? [];
      const key = `${pack.id}/${pattern.id}`;
      if (!specimens.some((s) => s.kind === "positive")) missingPositive.push(key);
      if (!specimens.some((s) => s.kind === "negative")) missingNegative.push(key);
      for (const specimen of specimens) {
        if (specimen.kind === "negative" && !specimen.why) missingWhy.push(key);
      }
    }
    for (const scenario of pack.scenarios ?? []) {
      for (const patternId of scenario.expectPatternIds ?? []) {
        if (!patternIds.has(patternId)) {
          orphanScenarioExpectations.push(`${pack.id}/${scenario.id}/${patternId}`);
        }
      }
    }
  }

  return { missingPositive, missingNegative, missingWhy, orphanScenarioExpectations };
}
