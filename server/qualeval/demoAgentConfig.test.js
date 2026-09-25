import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listVariants,
  getVariant,
  updateVariant,
  getActiveVariantKey,
  setActiveVariant,
  getActiveVariant,
  NOT_CONFIGURED_ERROR,
} from "./demoAgentConfig.js";

function fakePool() {
  const variants = [
    { key: "compliant", name: "Compliant support agent", system_prompt: "be compliant", greeting: "hi compliant", voice: "anna", updated_at: "t0" },
    { key: "flawed", name: "Flawed support agent", system_prompt: "be flawed", greeting: "hi flawed", voice: "george", updated_at: "t0" },
  ];
  let activeVariant = "compliant";

  return {
    async query(text, params = []) {
      const sql = text.trim().toLowerCase();

      if (sql.startsWith("select") && sql.includes("from qualeval_demo_agent_variants") && sql.includes("where key")) {
        const [key] = params;
        return { rows: variants.filter((v) => v.key === key) };
      }
      if (sql.startsWith("select") && sql.includes("from qualeval_demo_agent_variants")) {
        return { rows: [...variants].sort((a, b) => a.key.localeCompare(b.key)) };
      }
      if (sql.startsWith("update qualeval_demo_agent_variants")) {
        const [key, ...values] = params;
        const row = variants.find((v) => v.key === key);
        if (!row) return { rows: [] };
        const setClause = text.match(/set ([\s\S]+?)\s*,\s*updated_at = now\(\)/i)[1];
        const cols = setClause.split(",").map((c) => c.trim().split("=")[0].trim());
        cols.forEach((col, i) => {
          row[col] = values[i];
        });
        row.updated_at = "t1";
        return { rows: [row] };
      }
      if (sql.startsWith("select active_variant from qualeval_demo_agent_state")) {
        return { rows: [{ active_variant: activeVariant }] };
      }
      if (sql.startsWith("update qualeval_demo_agent_state")) {
        const [key] = params;
        if (!variants.some((v) => v.key === key)) return { rows: [] };
        activeVariant = key;
        return { rows: [{ active_variant: activeVariant }] };
      }
      if (sql.includes("from qualeval_demo_agent_state s") && sql.includes("join qualeval_demo_agent_variants")) {
        const row = variants.find((v) => v.key === activeVariant);
        return { rows: row ? [row] : [] };
      }
      throw new Error(`unhandled query: ${text}`);
    },
  };
}

test("listVariants returns both variants sorted by key", async () => {
  const rows = await listVariants({}, fakePool());
  assert.deepEqual(
    rows.map((r) => r.key),
    ["compliant", "flawed"],
  );
  assert.equal(rows[0].systemPrompt, "be compliant");
});

test("getVariant rejects an invalid key", async () => {
  await assert.rejects(getVariant("bogus", {}, fakePool()), /must be one of/);
});

test("updateVariant persists edited fields, leaving others untouched", async () => {
  const pool = fakePool();
  const updated = await updateVariant("flawed", { systemPrompt: "be even more flawed" }, {}, pool);
  assert.equal(updated.systemPrompt, "be even more flawed");
  assert.equal(updated.greeting, "hi flawed");

  const refetched = await getVariant("flawed", {}, pool);
  assert.equal(refetched.systemPrompt, "be even more flawed");
});

test("getActiveVariantKey and setActiveVariant round-trip", async () => {
  const pool = fakePool();
  assert.equal(await getActiveVariantKey({}, pool), "compliant");
  await setActiveVariant("flawed", {}, pool);
  assert.equal(await getActiveVariantKey({}, pool), "flawed");
});

test("getActiveVariant resolves the full active variant row via the join", async () => {
  const pool = fakePool();
  await setActiveVariant("flawed", {}, pool);
  const active = await getActiveVariant({}, pool);
  assert.equal(active.key, "flawed");
  assert.equal(active.voice, "george");
});

test("every call throws NOT_CONFIGURED_ERROR without a pool", async () => {
  await assert.rejects(listVariants({}, null), { message: NOT_CONFIGURED_ERROR });
  await assert.rejects(getActiveVariant({}, null), { message: NOT_CONFIGURED_ERROR });
});
