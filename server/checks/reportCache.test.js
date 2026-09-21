import { test } from "node:test";
import assert from "node:assert/strict";
import { loadReportCache, dbConfigured, upsertReportCache } from "../reportCache.js";

function fakePool(initialRows = []) {
  const rows = initialRows;
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.startsWith("select")) {
        return { rows };
      }
      if (text.startsWith("insert")) {
        const [cache_key, report] = params;
        const existing = rows.find((r) => r.cache_key === cache_key);
        if (existing) existing.report = report;
        else rows.push({ cache_key, report });
        return { rows: [] };
      }
      throw new Error(`unhandled query: ${text}`);
    },
  };
}

test("dbConfigured is false without env", () => {
  assert.equal(dbConfigured({}), false);
  assert.equal(dbConfigured({ DATABASE_URL: "postgres://localhost/db" }), true);
});

test("loadReportCache is a no-op without a pool", async () => {
  const rows = await loadReportCache({}, null);
  assert.deepEqual(rows, []);
});

test("upsertReportCache inserts with an on-conflict update", async () => {
  const pool = fakePool();
  await upsertReportCache("abc", { sessionId: "s" }, {}, pool);
  assert.equal(pool.calls.length, 1);
  assert.equal(pool.calls[0].text.includes("on conflict (cache_key)"), true);
  assert.deepEqual(pool.calls[0].params, ["abc", { sessionId: "s" }]);
});
