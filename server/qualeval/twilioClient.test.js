import { test } from "node:test";
import assert from "node:assert/strict";
import { twilioConfigured, placeOutboundCall, endCall } from "./twilioClient.js";

const ENV = { TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", TWILIO_AUTH_TOKEN: "token123" };

test("twilioConfigured requires both the account SID and auth token", () => {
  assert.equal(twilioConfigured({}), false);
  assert.equal(twilioConfigured({ TWILIO_ACCOUNT_SID: "AC1" }), false);
  assert.equal(twilioConfigured(ENV), true);
});

test("placeOutboundCall posts To/From/Url with Basic auth and returns the call sid", async () => {
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ sid: "CA123", status: "queued" }) };
  };
  const result = await placeOutboundCall(
    { to: "+15551234567", from: "+15557654321", twimlUrl: "https://example.com/voice" },
    ENV,
    fetchImpl,
  );
  assert.equal(result.sid, "CA123");
  assert.equal(result.status, "queued");
  assert.match(captured.url, /\/Accounts\/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\/Calls\.json$/);
  assert.match(captured.opts.headers.Authorization, /^Basic /);
  const params = new URLSearchParams(captured.opts.body);
  assert.equal(params.get("To"), "+15551234567");
  assert.equal(params.get("From"), "+15557654321");
  assert.equal(params.get("Url"), "https://example.com/voice");
});

test("placeOutboundCall throws when Twilio is not configured", async () => {
  await assert.rejects(() => placeOutboundCall({ to: "x", from: "y", twimlUrl: "z" }, {}, async () => ({})));
});

test("placeOutboundCall surfaces Twilio's error message on a non-2xx response", async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ message: "Invalid number" }) });
  await assert.rejects(
    () => placeOutboundCall({ to: "x", from: "y", twimlUrl: "z" }, ENV, fetchImpl),
    /Invalid number/,
  );
});

test("endCall posts Status=completed for the given call sid", async () => {
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ sid: "CA123", status: "completed" }) };
  };
  await endCall("CA123", ENV, fetchImpl);
  assert.match(captured.url, /\/Calls\/CA123\.json$/);
  const params = new URLSearchParams(captured.opts.body);
  assert.equal(params.get("Status"), "completed");
});
