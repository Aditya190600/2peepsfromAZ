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

test("returns 503 when Twilio isn't configured", () => {
  const ctx = fakeReqRes();
  demoAgentVoiceRoute(ctx.req, ctx.res, { env: {}, validate: () => true });
  assert.equal(ctx.status, 503);
  assert.match(ctx.body, /not configured/);
});

test("returns 403 on an invalid Twilio signature", () => {
  const ctx = fakeReqRes();
  demoAgentVoiceRoute(ctx.req, ctx.res, { env: ENV, validate: () => false });
  assert.equal(ctx.status, 403);
});

test("returns bidirectional Connect/Stream TwiML pointed at the target-agent stream route", () => {
  const ctx = fakeReqRes();
  let validated;
  demoAgentVoiceRoute(ctx.req, ctx.res, {
    env: ENV,
    validate: (...args) => {
      validated = args;
      return true;
    },
  });
  assert.equal(ctx.contentType, "text/xml");
  assert.match(ctx.body, /<Say>One moment please\.<\/Say>/);
  assert.match(
    ctx.body,
    /<Say>.*<\/Say><Connect><Stream url="wss:\/\/app\.example\.com\/v1\/qualeval\/target-agent-stream"\/><\/Connect>/,
  );
  assert.equal(validated[0], ENV.TWILIO_AUTH_TOKEN);
  assert.equal(validated[1], "sig");
  assert.equal(validated[2], "https://app.example.com/v1/qualeval/demo-agent-voice");
});
