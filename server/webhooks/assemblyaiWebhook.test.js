import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  verifySignature,
  timelineToTurns,
  sessionFromCallEnded,
  processCallEnded,
  handleAssemblyAiWebhook,
} from "./assemblyaiWebhook.js";

const SECRET = "test-signing-secret";

function sign(t, rawBody, secret = SECRET) {
  const v1 = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest("hex");
  return `t=${t},v1=${v1}`;
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

test("verifySignature accepts a correctly signed, fresh payload", () => {
  const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
  const t = Math.floor(Date.now() / 1000);
  const result = verifySignature(rawBody, sign(t, rawBody), SECRET);
  assert.equal(result.valid, true);
});

test("verifySignature rejects a mismatched signature", () => {
  const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
  const t = Math.floor(Date.now() / 1000);
  const badHeader = sign(t, rawBody, "wrong-secret");
  const result = verifySignature(rawBody, badHeader, SECRET);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "signature mismatch");
});

test("verifySignature rejects a signature over different bytes", () => {
  const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
  const t = Math.floor(Date.now() / 1000);
  const header = sign(t, Buffer.from(JSON.stringify({ hello: "tampered" })));
  const result = verifySignature(rawBody, header, SECRET);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "signature mismatch");
});

test("verifySignature rejects a stale timestamp", () => {
  const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
  const t = Math.floor(Date.now() / 1000) - 301;
  const result = verifySignature(rawBody, sign(t, rawBody), SECRET);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "timestamp outside tolerance");
});

test("verifySignature rejects a missing header", () => {
  const result = verifySignature(Buffer.from("{}"), null, SECRET);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "missing signature header");
});

test("verifySignature 503s when no secret is configured", () => {
  const rawBody = Buffer.from("{}");
  const t = Math.floor(Date.now() / 1000);
  const result = verifySignature(rawBody, sign(t, rawBody), undefined);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "not_configured");
});

test("timelineToTurns splits each timeline turn into user/agent entries with relative tMs", () => {
  const timeline = {
    started_at_unix_ms: 1000,
    turns: [
      { user_transcript: null, agent_text: "Hi, how can I help?", agent_reply_started_at_ms: 1500 },
      { user_transcript: "What's the weather?", agent_text: "Sunny.", agent_reply_started_at_ms: 4000 },
      { user_transcript: null, agent_text: null },
    ],
  };
  const turns = timelineToTurns(timeline);
  assert.deepEqual(turns, [
    { role: "agent", text: "Hi, how can I help?", tMs: 500 },
    { role: "user", text: "What's the weather?", tMs: 3000 },
    { role: "agent", text: "Sunny.", tMs: 3000 },
  ]);
});

test("timelineToTurns falls back to fixed spacing without a start anchor", () => {
  const turns = timelineToTurns({ turns: [{ agent_text: "Hi" }, { user_transcript: "Hey" }] });
  assert.deepEqual(turns, [
    { role: "agent", text: "Hi", tMs: 0 },
    { role: "user", text: "Hey", tMs: 2000 },
  ]);
});

test("sessionFromCallEnded normalizes a call payload into the {turns} shape", () => {
  const call = { call_id: "call_1", session_id: "call_1", created_at: "2026-09-16T10:45:45.169858" };
  const session = sessionFromCallEnded(call, { started_at_unix_ms: 0, turns: [{ agent_text: "Hi", agent_reply_started_at_ms: 0 }] });
  assert.equal(session.sessionId, "call_1");
  assert.equal(session.consentEvent, null);
  assert.deepEqual(session.turns, [{ role: "agent", text: "Hi", tMs: 0 }]);
});

test("processCallEnded fetches the transcript and dispatches through the ingest pipeline", async () => {
  let dispatchedWith = null;
  const dispatch = async (payload) => {
    dispatchedWith = payload;
  };
  const fetchTranscriptImpl = async (url) => {
    assert.equal(url, "https://example.com/timeline.json");
    return { started_at_unix_ms: 0, turns: [{ agent_text: "Hi", agent_reply_started_at_ms: 0 }] };
  };
  await processCallEnded(
    { call_id: "call_1", session_id: "call_1", transcript_url: "https://example.com/timeline.json" },
    { dispatch, fetchTranscriptImpl },
  );
  assert.equal(dispatchedWith.scopes[0], "all");
  assert.equal(dispatchedWith.session.sessionId, "call_1");
  assert.equal(dispatchedWith.session.turns.length, 1);
});

test("processCallEnded no-ops without a transcript_url", async () => {
  let called = false;
  await processCallEnded({ call_id: "call_1" }, { dispatch: async () => { called = true; } });
  assert.equal(called, false);
});

test("processCallEnded no-ops when the timeline has no usable turns", async () => {
  let called = false;
  await processCallEnded(
    { call_id: "call_1", transcript_url: "https://example.com/timeline.json" },
    {
      dispatch: async () => { called = true; },
      fetchTranscriptImpl: async () => ({ turns: [{ user_transcript: null, agent_text: null }] }),
    },
  );
  assert.equal(called, false);
});

test("handleAssemblyAiWebhook rejects an invalid signature with 401", () => {
  const handler = handleAssemblyAiWebhook(new Map(), { secret: SECRET, verify: () => ({ valid: false, reason: "signature mismatch" }) });
  const req = { body: Buffer.from("{}"), get: () => null };
  const res = fakeRes();
  handler(req, res);
  assert.equal(res.statusCode, 401);
});

test("handleAssemblyAiWebhook 503s when signature verification reports not_configured", () => {
  const handler = handleAssemblyAiWebhook(new Map(), { secret: undefined, verify: () => ({ valid: false, reason: "not_configured" }) });
  const req = { body: Buffer.from("{}"), get: () => null };
  const res = fakeRes();
  handler(req, res);
  assert.equal(res.statusCode, 503);
});

test("handleAssemblyAiWebhook acks 200 and dispatches call.ended asynchronously", async () => {
  let dispatchedCall = null;
  const event = { event: "call.ended", call: { call_id: "call_1", transcript_url: "https://x" } };
  const rawBody = Buffer.from(JSON.stringify(event));
  const handler = handleAssemblyAiWebhook(new Map(), {
    verify: () => ({ valid: true }),
    dispatch: async (call) => {
      dispatchedCall = call;
    },
  });
  const req = { body: rawBody, get: () => "t=1,v1=x" };
  const res = fakeRes();
  handler(req, res);
  assert.equal(res.statusCode, 200);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(dispatchedCall.call_id, "call_1");
});

test("handleAssemblyAiWebhook acks 200 for call.connected without dispatching analysis", async () => {
  const event = { event: "call.connected", call: { call_id: "call_1" } };
  const rawBody = Buffer.from(JSON.stringify(event));
  let dispatched = false;
  const handler = handleAssemblyAiWebhook(new Map(), {
    verify: () => ({ valid: true }),
    dispatch: async () => {
      dispatched = true;
    },
  });
  const req = { body: rawBody, get: () => "t=1,v1=x" };
  const res = fakeRes();
  handler(req, res);
  assert.equal(res.statusCode, 200);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(dispatched, false);
});
