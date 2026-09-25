import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureDemoAgentNumberConfigured } from "./demoAgentProvision.js";

const ENV = {
  TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  TWILIO_AUTH_TOKEN: "token123",
  QUALEVAL_AGENT_NUMBER: "+18038245760",
  RAILWAY_PUBLIC_DOMAIN: "app.example.com",
};

test("does nothing when Twilio, the agent number, or the public domain aren't configured", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { ok: true, json: async () => ({}) };
  };
  await ensureDemoAgentNumberConfigured({ env: {}, fetchImpl });
  await ensureDemoAgentNumberConfigured({ env: { ...ENV, QUALEVAL_AGENT_NUMBER: undefined }, fetchImpl });
  await ensureDemoAgentNumberConfigured({ env: { ...ENV, RAILWAY_PUBLIC_DOMAIN: undefined }, fetchImpl });
  assert.equal(called, false);
});

test("PATCHes the number's VoiceUrl/VoiceMethod when they don't already match", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes("IncomingPhoneNumbers.json?")) {
      return { ok: true, json: async () => ({ incoming_phone_numbers: [{ sid: "PN1", voice_url: "", voice_method: "GET" }] }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  await ensureDemoAgentNumberConfigured({ env: ENV, fetchImpl });
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/IncomingPhoneNumbers\/PN1\.json$/);
  const params = new URLSearchParams(calls[1].opts.body);
  assert.equal(params.get("VoiceUrl"), "https://app.example.com/v1/qualeval/demo-agent-voice");
  assert.equal(params.get("VoiceMethod"), "POST");
});

test("is a no-op when the number is already configured correctly", async () => {
  let updateCalled = false;
  const fetchImpl = async (url) => {
    if (url.includes("IncomingPhoneNumbers.json?")) {
      return {
        ok: true,
        json: async () => ({
          incoming_phone_numbers: [
            { sid: "PN1", voice_url: "https://app.example.com/v1/qualeval/demo-agent-voice", voice_method: "POST" },
          ],
        }),
      };
    }
    updateCalled = true;
    return { ok: true, json: async () => ({}) };
  };
  await ensureDemoAgentNumberConfigured({ env: ENV, fetchImpl });
  assert.equal(updateCalled, false);
});

test("logs and returns when the phone number isn't found on the account", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ incoming_phone_numbers: [] }) });
  await assert.doesNotReject(ensureDemoAgentNumberConfigured({ env: ENV, fetchImpl }));
});
