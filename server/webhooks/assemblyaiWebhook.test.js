import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  verifySignature,
  resolvePatternPackIds,
  timelineToTurns,
  handleAssemblyaiWebhook,
  waitForArtifacts,
  buildSessionFromWebhook,
  processWebhookSession,
} from "./assemblyaiWebhook.js";

const SECRET = "cl_live_testkey1234567890";

function sign(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest("hex");
  return `t=${t},v1=${v1}`;
}

function fakeReq({ apiKey = SECRET, body, header }) {
  const raw = Buffer.from(JSON.stringify(body));
  return {
    params: { apiKey },
    body: raw,
    get: (name) => (name === "X-AAI-Signature" ? (header ?? sign(raw, apiKey)) : undefined),
  };
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

test("verifySignature accepts a correctly signed body", () => {
  const raw = Buffer.from('{"event":"session.completed"}');
  assert.equal(verifySignature(raw, sign(raw, SECRET), SECRET), true);
});

test("verifySignature rejects a body signed with the wrong secret", () => {
  const raw = Buffer.from('{"event":"session.completed"}');
  assert.equal(verifySignature(raw, sign(raw, "some-other-secret"), SECRET), false);
});

test("verifySignature rejects a stale timestamp outside the tolerance window", () => {
  const raw = Buffer.from('{"event":"session.completed"}');
  const staleT = Math.floor(Date.now() / 1000) - 3600;
  assert.equal(verifySignature(raw, sign(raw, SECRET, staleT), SECRET), false);
});

test("verifySignature rejects a missing header", () => {
  const raw = Buffer.from("{}");
  assert.equal(verifySignature(raw, undefined, SECRET), false);
});

test("resolvePatternPackIds expands the 'all' sentinel to every pack", () => {
  const ids = resolvePatternPackIds(["all"]);
  assert.ok(ids.includes("generic"));
  assert.ok(ids.includes("hipaa"));
});

test("resolvePatternPackIds intersects explicit scopes with known packs", () => {
  assert.deepEqual(resolvePatternPackIds(["hipaa", "not-a-real-pack"]), ["hipaa"]);
});

test("timelineToTurns pairs user_transcript and agent_text, stamping tMs from agent_reply_started_at_ms", () => {
  const timeline = {
    started_at_unix_ms: 1000,
    turns: [
      { user_transcript: null, agent_text: "Hi, how can I help?", agent_reply_started_at_ms: 1500 },
      { user_transcript: "What's the weather?", agent_text: "Sunny.", agent_reply_started_at_ms: 4000 },
      { user_transcript: null, agent_text: null },
    ],
  };
  assert.deepEqual(timelineToTurns(timeline), [
    { role: "agent", text: "Hi, how can I help?", tMs: 500 },
    { role: "user", text: "What's the weather?", tMs: 3000 },
    { role: "agent", text: "Sunny.", tMs: 3000 },
  ]);
});

test("timelineToTurns handles an empty/missing turns array", () => {
  assert.deepEqual(timelineToTurns({}), []);
  assert.deepEqual(timelineToTurns({ turns: [] }), []);
});

test("valid key + valid signature acks 200 and dispatches analysis async", async () => {
  let dispatchResolved = false;
  const dispatch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    dispatchResolved = true;
  };
  const verifyKey = async (rawKey) => {
    assert.equal(rawKey, SECRET);
    return { valid: true, scopes: ["generic"], clerkUserId: "user_1" };
  };
  const handler = handleAssemblyaiWebhook(new Map(), { verifyKey, dispatch });
  const req = fakeReq({ body: { event: "session.completed", session: { session_id: "sess_1" } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(dispatchResolved, false, "handler must not wait on the async analyze pipeline");
});

test("invalid API key is rejected with 401 before any signature check", async () => {
  const verifyKey = async () => ({ valid: false, reason: "revoked" });
  const dispatch = async () => assert.fail("must not dispatch analysis for an invalid key");
  const handler = handleAssemblyaiWebhook(new Map(), { verifyKey, dispatch });
  const req = fakeReq({ body: { event: "session.completed", session: { session_id: "sess_1" } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("expired key is rejected with 401", async () => {
  const verifyKey = async () => ({ valid: false, reason: "expired" });
  const handler = handleAssemblyaiWebhook(new Map(), { verifyKey, dispatch: async () => {} });
  const req = fakeReq({ body: { event: "session.completed", session: { session_id: "sess_1" } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("Supabase not configured surfaces as 503, not 401", async () => {
  const verifyKey = async () => ({ valid: false, reason: "not_configured" });
  const handler = handleAssemblyaiWebhook(new Map(), { verifyKey, dispatch: async () => {} });
  const req = fakeReq({ body: { event: "session.completed", session: { session_id: "sess_1" } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 503);
});

test("valid key with a bad signature is rejected with 401 and never dispatched", async () => {
  const verifyKey = async () => ({ valid: true, scopes: ["all"], clerkUserId: "user_1" });
  const dispatch = async () => assert.fail("must not dispatch analysis for a bad signature");
  const handler = handleAssemblyaiWebhook(new Map(), { verifyKey, dispatch });
  const req = fakeReq({
    body: { event: "session.completed", session: { session_id: "sess_1" } },
    header: "t=1,v1=deadbeef",
  });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("waitForArtifacts polls until artifacts appear, then returns the session", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const artifacts = calls >= 3 ? [{ type: "timeline", url: "https://s3/timeline.json" }] : [];
    return { ok: true, json: async () => ({ id: "sess_1", artifacts }) };
  };
  const session = await waitForArtifacts("sess_1", { apiKey: "x", fetchImpl, pollIntervalMs: 1 });
  assert.equal(calls, 3);
  assert.equal(session.artifacts.length, 1);
});

test("waitForArtifacts gives up and returns null after the timeout", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ id: "sess_1", artifacts: [] }) });
  const session = await waitForArtifacts("sess_1", {
    apiKey: "x",
    fetchImpl,
    pollIntervalMs: 1,
    timeoutMs: 5,
  });
  assert.equal(session, null);
});

test("buildSessionFromWebhook fetches the timeline artifact and transforms it into session.turns", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/v1/sessions/")) {
      return {
        ok: true,
        json: async () => ({
          id: "sess_1",
          created_at: "2026-09-20T00:00:00Z",
          artifacts: [{ type: "timeline", url: "https://s3/timeline.json" }],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        started_at_unix_ms: 1000,
        turns: [{ user_transcript: "Hi", agent_text: null, agent_reply_started_at_ms: 1200 }],
      }),
    };
  };
  const session = await buildSessionFromWebhook("sess_1", { apiKey: "x", fetchImpl, pollIntervalMs: 1 });
  assert.equal(session.sessionId, "sess_1");
  assert.equal(session.consentEvent, null);
  assert.deepEqual(session.turns, [{ role: "user", text: "Hi", tMs: 200 }]);
});

test("processWebhookSession caches the report and returns the cached copy on a re-delivery", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/v1/sessions/")) {
      return {
        ok: true,
        json: async () => ({
          id: "sess_1",
          artifacts: [{ type: "timeline", url: "https://s3/timeline.json" }],
        }),
      };
    }
    return { ok: true, json: async () => ({ started_at_unix_ms: 0, turns: [] }) };
  };
  const reportCache = new Map();
  let analyzeCalls = 0;
  const analyzeSessionImpl = async (session) => {
    analyzeCalls += 1;
    return { sessionId: session.sessionId, findings: [{ status: "pass", check: "consent" }] };
  };

  const first = await processWebhookSession(
    { sessionId: "sess_1", scopes: ["all"] },
    { apiKey: "x", fetchImpl, reportCache, analyzeSessionImpl, llmGateway: null, modelProviderId: "assemblyai-gateway" },
  );
  const second = await processWebhookSession(
    { sessionId: "sess_1", scopes: ["all"] },
    { apiKey: "x", fetchImpl, reportCache, analyzeSessionImpl, llmGateway: null, modelProviderId: "assemblyai-gateway" },
  );

  assert.equal(analyzeCalls, 1, "second delivery of the same event should hit the cache, not re-run analysis");
  assert.deepEqual(second, first);
});

test("processWebhookSession logs and rethrows when analysis fails, instead of swallowing the error", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/v1/sessions/")) {
      return {
        ok: true,
        json: async () => ({ id: "sess_1", artifacts: [{ type: "timeline", url: "https://s3/timeline.json" }] }),
      };
    }
    return { ok: true, json: async () => ({ started_at_unix_ms: 0, turns: [] }) };
  };
  const analyzeSessionImpl = async () => {
    throw new Error("LLM Gateway rate limited");
  };
  await assert.rejects(
    () =>
      processWebhookSession(
        { sessionId: "sess_1", scopes: ["all"] },
        { apiKey: "x", fetchImpl, reportCache: new Map(), analyzeSessionImpl, llmGateway: null, modelProviderId: "assemblyai-gateway" },
      ),
    /LLM Gateway rate limited/,
  );
});

test("non session.completed events ack without dispatching analysis", async () => {
  const verifyKey = async () => ({ valid: true, scopes: ["all"], clerkUserId: "user_1" });
  const dispatch = async () => assert.fail("must not dispatch analysis for session.started");
  const handler = handleAssemblyaiWebhook(new Map(), { verifyKey, dispatch });
  const req = fakeReq({ body: { event: "session.started", session: { session_id: "sess_1" } } });
  const res = fakeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
});
