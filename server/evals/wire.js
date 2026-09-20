import { INDUSTRY_PACK_IDS, PACKS } from "../packs/index.js";

/**
 * Strict parse of untrusted JSON. Unknown / generic / empty picks are 400s,
 * unlike analyzeSession which silently drops unknown ids.
 *
 * @param {unknown} body
 * @returns {{ ok: true, packIds: string[] } | { ok: false, error: string }}
 */
export function parsePackEvalRequest(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object with packIds" };
  }
  const raw = body.packIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "packIds must be a non-empty array of industry pack ids" };
  }
  if (!raw.every((id) => typeof id === "string" && id.length > 0)) {
    return { ok: false, error: "packIds must be an array of strings" };
  }
  const seen = new Set();
  const packIds = [];
  for (const id of raw) {
    if (id === "generic") {
      return { ok: false, error: "generic is always on and is not an eval pick" };
    }
    if (!INDUSTRY_PACK_IDS.includes(id) || !PACKS[id]) {
      return {
        ok: false,
        error: `Unknown pack id "${id}". Valid: ${INDUSTRY_PACK_IDS.join(", ")}`,
      };
    }
    if (seen.has(id)) continue;
    seen.add(id);
    packIds.push(id);
  }
  packIds.sort((a, b) => INDUSTRY_PACK_IDS.indexOf(a) - INDUSTRY_PACK_IDS.indexOf(b));
  return { ok: true, packIds };
}
