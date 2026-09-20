import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePatternPackIds,
  validateSessionPayload,
  handleIngest,
  processIngestedSession,
} from "./ingest.js";

const SECRET = "cl_live_testkey1234567890";

function fakeReq({ apiKey = SECRET, body }) {
  return { params: { apiKey }, body };
}

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

test("resolvePatternPackIds expands the 'all' sentinel to every pack", () => {
  const ids = resolvePatternPackIds(["all"]);
  assert.ok(ids.includes("generic"));
  assert.ok(ids.includes("hipaa"));
});

test("resolvePatternPackIds intersects explicit scopes with known packs", () => {
  assert.deepEqual(resolvePatternPackIds(["hipaa", "not-a-real-pack"]), ["hipaa"]);
});

test("validateSessionPayload requires a session with a turns array", () => {
  assert.equal(validateSessionPayload({}).ok, false);
  assert.equal(validateSessionPayload({ session: {} }).ok, false);
  assert.equal(validateSessionPayload({ session: { turns: [] } }).ok, true);
});

test("valid key + valid payload acks 200 and dispatches analysis async", async () => {
  let dispatchResolved = false;
  const dispatch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    dispatchResolved = true;
  };
  const verifyKey = async (rawKey) => {
    assert.equal(rawKey, SECRET);
    return { valid: true, scopes: ["generic"], clerkUserId: "user_1" };
  };
  const handler = handleIngest(new Map(), { verifyKey, dispatch });
  const req = fakeReq({ body: { session: { sessionId: "sess_1", turns: [{ role: "user", text: "hi", tMs: 0 }] } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(dispatchResolved, false, "handler must not wait on the async analyze pipeline");
});

test("invalid API key is rejected with 401 before payload validation", async () => {
  const verifyKey = async () => ({ valid: false, reason: "revoked" });
  const dispatch = async () => assert.fail("must not dispatch analysis for an invalid key");
  const handler = handleIngest(new Map(), { verifyKey, dispatch });
  const req = fakeReq({ body: { session: { turns: [] } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("expired key is rejected with 401", async () => {
  const verifyKey = async () => ({ valid: false, reason: "expired" });
  const handler = handleIngest(new Map(), { verifyKey, dispatch: async () => {} });
  const req = fakeReq({ body: { session: { turns: [] } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("Supabase not configured surfaces as 503, not 401", async () => {
  const verifyKey = async () => ({ valid: false, reason: "not_configured" });
  const handler = handleIngest(new Map(), { verifyKey, dispatch: async () => {} });
  const req = fakeReq({ body: { session: { turns: [] } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 503);
});

test("missing turns array is rejected with 400 and never dispatched", async () => {
  const verifyKey = async () => ({ valid: true, scopes: ["all"], clerkUserId: "user_1" });
  const dispatch = async () => assert.fail("must not dispatch analysis for an invalid payload");
  const handler = handleIngest(new Map(), { verifyKey, dispatch });
  const req = fakeReq({ body: { session: { sessionId: "sess_1" } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

test("processIngestedSession caches the report and returns the cached copy on redelivery", async () => {
  const reportCache = new Map();
  let analyzeCalls = 0;
  const analyzeSessionImpl = async (session) => {
    analyzeCalls += 1;
    return { sessionId: session.sessionId, findings: [{ status: "pass", check: "consent" }] };
  };
  const session = { sessionId: "sess_1", turns: [] };

  const first = await processIngestedSession(
    { session, scopes: ["all"] },
    { reportCache, analyzeSessionImpl, llmGateway: null, modelProviderId: "assemblyai-gateway" },
  );
  const second = await processIngestedSession(
    { session, scopes: ["all"] },
    { reportCache, analyzeSessionImpl, llmGateway: null, modelProviderId: "assemblyai-gateway" },
  );

  assert.equal(analyzeCalls, 1, "second delivery of the same session should hit the cache, not re-run analysis");
  assert.deepEqual(second, first);
});

test("processIngestedSession logs and rethrows when analysis fails, instead of swallowing the error", async () => {
  const analyzeSessionImpl = async () => {
    throw new Error("LLM Gateway rate limited");
  };
  await assert.rejects(
    () =>
      processIngestedSession(
        { session: { sessionId: "sess_1", turns: [] }, scopes: ["all"] },
        { reportCache: new Map(), analyzeSessionImpl, llmGateway: null, modelProviderId: "assemblyai-gateway" },
      ),
    /LLM Gateway rate limited/,
  );
});
