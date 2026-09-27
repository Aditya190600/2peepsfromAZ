import { test } from "node:test";
import assert from "node:assert/strict";
import { demoAgentVoiceRoute } from "./demoAgentVoice.js";

const ENV = { TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", TWILIO_AUTH_TOKEN: "token123" };

function fakeReqRes({ body = {}, signature = "sig" } = {}) {
  const req = {
    body,
    protocol: "https",
    originalUrl: "/v1/qualeval/demo-agent-voice",
    get: (name) => (name.toLowerCase() === "x-twilio-signature" ? signature : "app.example.com"),
  };
  let statusCode = 200;
  let sentBody;
  let contentType;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    type(t) {
      contentType = t;
      return this;
    },
    send(body) {
      sentBody = body;
      return this;
    },
  };
  return { req, res, get status() { return statusCode; }, get body() { return sentBody; }, get contentType() { return contentType; } };
}

test("returns 503 when Twilio isn't configured", async () => {
  const ctx = fakeReqRes();
  await demoAgentVoiceRoute(ctx.req, ctx.res, { env: {}, validate: () => true });
  assert.equal(ctx.status, 503);
  assert.match(ctx.body, /not configured/);
});

test("returns 403 on an invalid Twilio signature", async () => {
  const ctx = fakeReqRes();
  await demoAgentVoiceRoute(ctx.req, ctx.res, { env: ENV, validate: () => false });
  assert.equal(ctx.status, 403);
});

test("returns bidirectional Connect/Stream TwiML pointed at the target-agent stream route", async () => {
  const ctx = fakeReqRes();
  let validated;
  await demoAgentVoiceRoute(ctx.req, ctx.res, {
    env: ENV,
    validate: (...args) => {
      validated = args;
      return true;
    },
  });
  assert.equal(ctx.contentType, "text/xml");
  // Connect/Stream is the whole response - no filler <Say> a calling agent
  // could answer over the real greeting.
  assert.match(
    ctx.body,
    /<Response><Connect><Stream url="wss:\/\/app\.example\.com\/v1\/qualeval\/target-agent-stream"\/><\/Connect><\/Response>/,
  );
  assert.doesNotMatch(ctx.body, /<Say>/);
  assert.equal(validated[0], ENV.TWILIO_AUTH_TOKEN);
  assert.equal(validated[1], "sig");
  assert.equal(validated[2], "https://app.example.com/v1/qualeval/demo-agent-voice");
});

test("records the inbound caller before answering, and still answers if recording throws", async () => {
  const ctx = fakeReqRes({
    body: {
      CallSid: "CA123",
      From: "+13128003792",
      To: "+18005550199",
      CallerName: "Rastopopulous",
    },
  });
  let recorded;
  await demoAgentVoiceRoute(ctx.req, ctx.res, {
    env: ENV,
    validate: () => true,
    recordCall: async (fields) => {
      recorded = fields;
    },
  });
  assert.equal(ctx.status, 200);
  assert.deepEqual(recorded, {
    twilioCallSid: "CA123",
    direction: "inbound",
    fromNumber: "+13128003792",
    toNumber: "+18005550199",
    callerName: "Rastopopulous",
  });

  const failing = fakeReqRes({ body: { CallSid: "CA124", From: "+13128003792" } });
  await demoAgentVoiceRoute(failing.req, failing.res, {
    env: ENV,
    validate: () => true,
    recordCall: async () => {
      throw new Error("db down");
    },
  });
  assert.equal(failing.status, 200);
  assert.match(failing.body, /<Connect>/);
});
