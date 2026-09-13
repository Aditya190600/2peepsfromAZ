import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKey, warmNorthstarCache } from "../warmCache.js";

function twelveSessions() {
  const sessions = {};
  const sessionKeys = [];
  for (let i = 0; i < 12; i++) {
    const key = `sess_${i}`;
    sessionKeys.push(key);
    sessions[key] = { sessionId: key, turns: [{ role: "agent", text: "Hi", tMs: 0 }] };
  }
  return { sessions, sessionKeys };
}

test("warm cache stores 12 reports and does not invent a percent", async () => {
  const reportCache = new Map();
  const { sessions, sessionKeys } = twelveSessions();
  const result = await warmNorthstarCache({
    reportCache,
    analyzeSession: async (session) => ({
      sessionId: session.sessionId,
      findings: [{ status: "pass", check: "consent" }],
    }),
    sessions,
    sessionKeys,
  });
  assert.equal(result.ok, true);
  assert.equal(result.cached, 12);
  assert.equal(result.total, 12);
  assert.equal(reportCache.size, 12);
  assert.equal("percent" in result, false);
  assert.equal(JSON.stringify(result).includes("83"), false);
});

test("a thrown analyze does not write a fake percent and skips that cache set", async () => {
  const reportCache = new Map();
  const { sessions, sessionKeys } = twelveSessions();
  const result = await warmNorthstarCache({
    reportCache,
    analyzeSession: async (session) => {
      if (session.sessionId === "sess_3") throw new Error("gateway 429");
      return { sessionId: session.sessionId, findings: [{ status: "pass", check: "consent" }] };
    },
    sessions,
    sessionKeys,
  });
  assert.equal(result.ok, false);
  assert.equal(result.cached, 11);
  assert.equal(reportCache.size, 11);
  assert.equal(
    reportCache.has(cacheKey(sessions.sess_3, ["generic"])),
    false
  );
  assert.equal("percent" in result, false);
  assert.equal(JSON.stringify(result).includes("83"), false);
});

test("a finding status error skips cache set", async () => {
  const reportCache = new Map();
  const { sessions, sessionKeys } = twelveSessions();
  const result = await warmNorthstarCache({
    reportCache,
    analyzeSession: async () => ({
      sessionId: "x",
      findings: [{ status: "error", check: "ai_disclosure" }],
    }),
    sessions,
    sessionKeys,
  });
  assert.equal(result.ok, false);
  assert.equal(result.cached, 0);
  assert.equal(reportCache.size, 0);
  assert.equal("percent" in result, false);
});
