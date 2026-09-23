import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  ingestSession,
  uploadRecording,
  ApiError,
  GATEWAY_RATE_LIMIT_MESSAGE,
  findRateLimitedFinding,
} from "./analyzeClient.js";

function mockJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("GATEWAY_RATE_LIMIT_MESSAGE states the rate limit was hit and gives concrete retry guidance", () => {
  assert.match(GATEWAY_RATE_LIMIT_MESSAGE, /rate limit/i);
  assert.match(GATEWAY_RATE_LIMIT_MESSAGE, /wait a minute or two/i);
  assert.match(GATEWAY_RATE_LIMIT_MESSAGE, /back-to-back/i);
  assert.match(GATEWAY_RATE_LIMIT_MESSAGE, /AssemblyAI dashboard/i);
});

test("findRateLimitedFinding finds a status:error, rateLimited:true finding among others", () => {
  const report = {
    findings: [
      { check: "consent", status: "pass" },
      { check: "ai_disclosure", status: "error", rateLimited: true, llmGatewayError: "429" },
      { check: "pii_scan", status: "pass", items: [] },
    ],
  };
  const finding = findRateLimitedFinding(report);
  assert.equal(finding?.check, "ai_disclosure");
});

test("findRateLimitedFinding returns null for a generic (non-rate-limit) error finding", () => {
  const report = {
    findings: [{ check: "ai_disclosure", status: "error", rateLimited: false, llmGatewayError: "boom" }],
  };
  assert.equal(findRateLimitedFinding(report), null);
});

test("findRateLimitedFinding returns null for a clean report or missing report", () => {
  assert.equal(findRateLimitedFinding({ findings: [{ check: "consent", status: "pass" }] }), null);
  assert.equal(findRateLimitedFinding(null), null);
  assert.equal(findRateLimitedFinding(undefined), null);
});

// This is the actual production shape: the Gateway rate limit is caught
// per-check server-side (disclosureCheck.js/piiScan.js), so /v1/analyze-session
// still responds 200 with a normal report - it never surfaces as an HTTP
// error analyze() would reject on. A caller that only handles rejected
// promises would resolve here and never know a check was skipped.
test("analyze() resolves normally (does not throw/hang) when the gateway rate limit produced an errored finding", async () => {
  const rateLimitedReport = {
    sessionId: "sess_1",
    generatedAt: "2026-09-19T00:00:00.000Z",
    findings: [
      { check: "consent", status: "pass" },
      {
        check: "ai_disclosure",
        status: "error",
        rateLimited: true,
        detail: "AI-disclosure check is temporarily unavailable due to high demand on the semantic model.",
        llmGatewayError: "LLM Gateway rate limited after retries: 429 too many requests for this action",
      },
    ],
  };
  global.fetch = async () => mockJsonResponse(200, rateLimitedReport);

  const report = await analyze({ turns: [] }, ["generic"]);
  assert.deepEqual(report, rateLimitedReport);
  const finding = findRateLimitedFinding(report);
  assert.equal(finding.check, "ai_disclosure");
});

test("analyze() still throws ApiError for a genuine non-ok HTTP response, distinct from an embedded rate-limit finding", async () => {
  global.fetch = async () => mockJsonResponse(502, { error: "boom" });

  await assert.rejects(() => analyze({ turns: [] }, ["generic"]), ApiError);
});

test("ingestSession() POSTs the session to /v1/ingest/:apiKey (the webhook receiver path), not /v1/analyze-session", async () => {
  let capturedUrl;
  let capturedBody;
  global.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedBody = JSON.parse(opts.body);
    return mockJsonResponse(200, { ok: true });
  };

  const session = { sessionId: "sess_1", turns: [{ role: "agent", text: "hi", tMs: 0 }] };
  const result = await ingestSession("cl_live_abc123", session);

  assert.equal(capturedUrl, "/v1/ingest/cl_live_abc123");
  assert.deepEqual(capturedBody, { session });
  assert.deepEqual(result, { ok: true });
});

test("ingestSession() throws ApiError on a non-ok response (e.g. bad API key)", async () => {
  global.fetch = async () => mockJsonResponse(401, { error: "invalid api key" });

  await assert.rejects(() => ingestSession("bad-key", { turns: [] }), ApiError);
});

test("uploadRecording() POSTs the blob to /v1/recordings/:sessionId and returns the server's playback url", async () => {
  let capturedUrl;
  let capturedOpts;
  global.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedOpts = opts;
    return mockJsonResponse(201, { url: "/v1/recordings/sess_1" });
  };

  const blob = { type: "audio/webm" };
  const result = await uploadRecording("sess_1", blob);

  assert.equal(capturedUrl, "/v1/recordings/sess_1");
  assert.equal(capturedOpts.method, "POST");
  assert.equal(capturedOpts.headers["Content-Type"], "audio/webm");
  assert.equal(capturedOpts.body, blob);
  assert.equal(result, "/v1/recordings/sess_1");
});

test("uploadRecording() throws ApiError when the bucket isn't configured (503)", async () => {
  global.fetch = async () => mockJsonResponse(503, { error: "Recordings storage is not configured." });

  await assert.rejects(
    () => uploadRecording("sess_1", { type: "audio/webm" }),
    /Recordings storage is not configured/
  );
});
