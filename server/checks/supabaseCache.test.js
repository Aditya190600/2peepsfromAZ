import { test } from "node:test";
import assert from "node:assert/strict";
import { loadReportCache, supabaseConfigured, upsertReportCache } from "../supabaseCache.js";

test("supabaseConfigured is false without env", () => {
  assert.equal(supabaseConfigured({}), false);
  assert.equal(supabaseConfigured({ SUPABASE_URL: "https://x.supabase.co" }), false);
  assert.equal(
    supabaseConfigured({
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    }),
    true,
  );
});

test("loadReportCache is a no-op without env", async () => {
  let called = 0;
  const rows = await loadReportCache({}, async () => {
    called += 1;
    return { ok: true, json: async () => [] };
  });
  assert.equal(called, 0);
  assert.deepEqual(rows, []);
});

test("upsertReportCache posts to rest on_conflict", async () => {
  const calls = [];
  await upsertReportCache(
    "abc",
    { sessionId: "s" },
    { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" },
    async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true };
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes("on_conflict=cache_key"), true);
  assert.equal(calls[0].opts.method, "POST");
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.cache_key, "abc");
  assert.equal(body.report.sessionId, "s");
});
