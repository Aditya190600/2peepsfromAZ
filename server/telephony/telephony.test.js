import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { TelephonyStore } from "./store.js";
import { requireTelephonyHook, telephonyRouter } from "./router.js";

const TOKEN = "super-secret-auth-token";
const SID = "AC" + "ab".repeat(16);

async function appFor(probe = async () => {}) {
  const root = await mkdtemp(path.join(tmpdir(), "telephony-"));
  const store = new TelephonyStore(path.join(root, "store.json"));
  const fetchImpl = async () => ({ ok: true, status: 200 });
  const app = express();
  app.use(express.json());
  app.use("/v1/telephony", telephonyRouter({ store, fetchImpl, probe, ownerOf }));
  return { app, store };
}

// Stands in for index.js's visitorId(req): the signed-in user is whoever the
// x-test-user header names, "anon" when it's absent.
function ownerOf(req) {
  return req.get("x-test-user") ?? "anon";
}

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return server;
}

async function request(server, url, { method = "GET", body, user, headers: extra = {} } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(user ? { "x-test-user": user } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, text };
}

test("numbers CRUD redacts trunk secrets", async (t) => {
  const { app } = await appFor();
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const trunk = await request(server, "/v1/telephony/trunks", {
    method: "POST",
    body: { provider: "byo-sip-trunk", gateways: ["203.0.113.10"], username: "vonage", password: TOKEN, label: "Vonage" },
  });
  assert.equal(trunk.status, 201);
  assert.equal(trunk.body.hasSecret, true);
  assert.equal(trunk.body.username, "vonage");
  assert.equal(JSON.stringify(trunk.body).includes(TOKEN), false);

  const listed = await request(server, "/v1/telephony/trunks");
  assert.equal(JSON.stringify(listed.body).includes(TOKEN), false);

  const created = await request(server, "/v1/telephony/numbers", {
    method: "POST",
    body: { provider: "byo-phone-number", e164: "+15551212001", label: "Desk", credentialId: trunk.body.id },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.provider, "byo-phone-number");
  assert.equal(created.body.credentialId, trunk.body.id);

  const patched = await request(server, `/v1/telephony/numbers/${created.body.id}`, {
    method: "PATCH",
    body: { label: "Front desk", direction: "both" },
  });
  assert.equal(patched.body.label, "Front desk");
  assert.equal(patched.body.direction, "both");

  assert.equal((await request(server, "/v1/telephony/numbers", {
    method: "POST",
    body: { provider: "byo-phone-number", e164: "+15551212001", credentialId: trunk.body.id },
  })).status, 409);

  assert.equal((await request(server, `/v1/telephony/numbers/${created.body.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await request(server, "/v1/telephony/numbers")).body.length, 0);
});

test("unreachable SIP gateway fails loudly and Twilio rejection hides the token", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "telephony-"));
  const store = new TelephonyStore(path.join(root, "store.json"));
  const fetchImpl = async () => ({ ok: false, status: 401 });
  const app = express();
  app.use(express.json());
  app.use("/v1/telephony", telephonyRouter({
    store,
    fetchImpl,
    probe: async () => { throw new Error("connect ECONNREFUSED"); },
    ownerOf,
  }));
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const down = await request(server, "/v1/telephony/trunks", {
    method: "POST",
    body: { provider: "byo-sip-trunk", gateways: ["198.51.100.8"], password: TOKEN },
  });
  assert.equal(down.status, 502);
  assert.match(down.body.error, /198\.51\.100\.8 is unreachable/);
  assert.equal(down.text.includes(TOKEN), false);

  const twilio = await request(server, "/v1/telephony/imports/twilio", {
    method: "POST",
    body: { accountSid: SID, authToken: TOKEN, e164: "+15557654321" },
  });
  assert.equal(twilio.status, 400);
  assert.match(twilio.body.error, /Twilio rejected/);
  assert.equal(twilio.text.includes(TOKEN), false);
  assert.equal((await request(server, "/v1/telephony/numbers")).body.length, 0);
});

test("Twilio and Telnyx API imports store the number and hide the key", async (t) => {
  const probed = [];
  const { app } = await appFor(async (host) => { probed.push(host); });
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const twilio = await request(server, "/v1/telephony/imports/twilio", {
    method: "POST",
    body: { accountSid: SID, authToken: TOKEN, e164: "+15557650000", label: "Twilio desk" },
  });
  assert.equal(twilio.status, 201);
  assert.equal(twilio.body.number.provider, "twilio");
  assert.equal(twilio.body.trunk.username, SID);
  assert.deepEqual(twilio.body.trunk.gateways, []);
  assert.deepEqual(probed, []);
  assert.equal(twilio.text.includes(TOKEN), false);
  const telnyx = await request(server, "/v1/telephony/imports/telnyx", {
    method: "POST",
    body: { apiKey: TOKEN, e164: "+15557650001" },
  });
  assert.equal(telnyx.status, 201);
  assert.equal(telnyx.body.trunk.hasSecret, true);
  assert.equal(telnyx.text.includes(TOKEN), false);
});

test("Telnyx SIP attach and Zadarma trunk can be stored without returning secrets", async (t) => {
  const { app } = await appFor();
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const telnyx = await request(server, "/v1/telephony/imports/telnyx", {
    method: "POST",
    body: { sipFqdn: "sip.telnyx.com", e164: "+15550001111", label: "Telnyx desk" },
  });
  assert.equal(telnyx.status, 201);
  assert.equal(telnyx.body.number.provider, "telnyx");
  assert.equal(telnyx.body.trunk.hasSecret, false);
  assert.deepEqual(telnyx.body.trunk.gateways, ["sip.telnyx.com"]);

  const zadarma = await request(server, "/v1/telephony/trunks", {
    method: "POST",
    body: { provider: "zadarma", username: "100", password: TOKEN },
  });
  assert.equal(zadarma.status, 201);
  assert.deepEqual(zadarma.body.gateways, ["sip.zadarma.com", "pbx.zadarma.com"]);
  assert.equal(zadarma.body.hasSecret, true);
  assert.equal(JSON.stringify(zadarma.body).includes(TOKEN), false);
});

test("inbound transcript becomes a History session and retries keep one id", async (t) => {
  const { app } = await appFor();
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const payload = {
    provider: "zadarma",
    callId: "call_100",
    e164: "+15551212001",
    startedAt: "2026-09-05T09:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-05T08:59:50.000Z" },
    turns: [
      { role: "agent", text: "Hi, this is an AI assistant. This call may be recorded for quality purposes.", tMs: 500 },
      { role: "user", text: "Sure, go ahead.", tMs: 3200 },
    ],
  };
  const first = await request(server, "/v1/telephony/inbound", { method: "POST", body: payload });
  const second = await request(server, "/v1/telephony/inbound", { method: "POST", body: payload });
  assert.equal(first.status, 201);
  assert.equal(first.body.sessionId, "pstn_call_100");
  assert.equal(second.body.sessionId, first.body.sessionId);
  assert.equal(first.body.source, "pstn");
  assert.equal(first.body.verdictLevel, "clear");
  const list = await request(server, "/v1/telephony/sessions");
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].sessionId, "pstn_call_100");
  const full = await request(server, "/v1/telephony/sessions/pstn_call_100");
  assert.equal(full.body.turns.length, 2);
  assert.equal(full.body.findings.some((f) => f.check === "consent" && f.status === "pass"), true);
});

const INBOUND = {
  provider: "zadarma",
  callId: "call_200",
  e164: "+15551212002",
  turns: [
    { role: "agent", text: "Hi, this is an AI assistant.", tMs: 500 },
    { role: "user", text: "My account number is 12345678.", tMs: 3200 },
  ],
};

test("one user never sees or changes another user's numbers, trunks, or sessions", async (t) => {
  const { app } = await appFor();
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const alice = (url, options = {}) => request(server, url, { ...options, user: "user_alice" });
  const bob = (url, options = {}) => request(server, url, { ...options, user: "user_bob" });

  const trunk = await alice("/v1/telephony/trunks", {
    method: "POST",
    body: { provider: "byo-sip-trunk", gateways: ["203.0.113.10"], password: TOKEN },
  });
  const number = await alice("/v1/telephony/numbers", {
    method: "POST",
    body: { provider: "byo-phone-number", e164: "+15551212002", credentialId: trunk.body.id },
  });
  assert.equal(number.status, 201);
  assert.equal((await alice("/v1/telephony/inbound", { method: "POST", body: INBOUND })).status, 201);

  assert.deepEqual((await bob("/v1/telephony/numbers")).body, []);
  assert.deepEqual((await bob("/v1/telephony/trunks")).body, []);
  assert.deepEqual((await bob("/v1/telephony/sessions")).body, []);
  assert.equal((await bob("/v1/telephony/sessions/pstn_call_200")).status, 404);
  assert.equal((await bob(`/v1/telephony/numbers/${number.body.id}`, {
    method: "PATCH",
    body: { label: "hijacked" },
  })).status, 404);
  assert.equal((await bob(`/v1/telephony/numbers/${number.body.id}`, { method: "DELETE" })).status, 404);
  assert.equal((await bob(`/v1/telephony/trunks/${trunk.body.id}`, { method: "DELETE" })).status, 404);

  // Bob can't hang his own number off Alice's trunk, at create or by PATCH.
  assert.equal((await bob("/v1/telephony/numbers", {
    method: "POST",
    body: { provider: "byo-phone-number", e164: "+15551212003", credentialId: trunk.body.id },
  })).status, 400);
  const bobNumber = await bob("/v1/telephony/numbers", {
    method: "POST",
    body: { provider: "twilio", e164: "+15551212004" },
  });
  assert.equal(bobNumber.status, 201);
  assert.equal((await bob(`/v1/telephony/numbers/${bobNumber.body.id}`, {
    method: "PATCH",
    body: { credentialId: trunk.body.id },
  })).status, 400);

  // Bob posting a call with Alice's callId gets his own session, not hers.
  const bobCall = await bob("/v1/telephony/inbound", {
    method: "POST",
    body: { ...INBOUND, turns: [{ role: "agent", text: "Bob's call.", tMs: 0 }] },
  });
  assert.equal(bobCall.status, 201);
  assert.equal((await bob("/v1/telephony/sessions")).body.length, 1);
  assert.equal((await alice("/v1/telephony/sessions/pstn_call_200")).body.turns.length, 2);

  const aliceNumbers = (await alice("/v1/telephony/numbers")).body;
  assert.deepEqual(aliceNumbers.map((n) => n.label), ["+15551212002"]);
  assert.equal((await alice("/v1/telephony/trunks")).body.length, 1);
  assert.equal((await alice("/v1/telephony/sessions")).body.length, 1);
});

test("a webhook-authenticated inbound call lands with the owner of the dialed number", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "telephony-"));
  const store = new TelephonyStore(path.join(root, "store.json"));
  const router = telephonyRouter({ store, ownerOf });
  const app = express();
  app.use(express.json());
  app.post("/hook/inbound", router.hookInbound);
  app.use("/v1/telephony", router);
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  assert.equal((await request(server, "/v1/telephony/numbers", {
    method: "POST",
    user: "user_alice",
    body: { provider: "twilio", e164: "+15551212002" },
  })).status, 201);

  const unregistered = await request(server, "/hook/inbound", {
    method: "POST",
    body: { ...INBOUND, e164: "+15559990000" },
  });
  assert.equal(unregistered.status, 404);

  assert.equal((await request(server, "/hook/inbound", { method: "POST", body: INBOUND })).status, 201);
  assert.equal((await request(server, "/v1/telephony/sessions", { user: "user_alice" })).body.length, 1);
  assert.deepEqual((await request(server, "/v1/telephony/sessions", { user: "user_bob" })).body, []);
});

test("records saved before per-user scoping stay with the anonymous visitor", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "telephony-"));
  const file = path.join(root, "store.json");
  await writeFile(file, JSON.stringify({
    credentials: [],
    numbers: [{ id: "num_legacy", provider: "twilio", e164: "+15551212009", label: "Legacy", direction: "inbound" }],
    sessions: [],
  }));
  const app = express();
  app.use(express.json());
  app.use("/v1/telephony", telephonyRouter({ store: new TelephonyStore(file), ownerOf }));
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  assert.equal((await request(server, "/v1/telephony/numbers")).body.length, 1);
  assert.deepEqual((await request(server, "/v1/telephony/numbers", { user: "user_alice" })).body, []);
});

test("webhook secret is required only when configured", async () => {
  const previous = process.env.TELEPHONY_WEBHOOK_SECRET;
  process.env.TELEPHONY_WEBHOOK_SECRET = "hook-secret";
  const app = express();
  app.post("/inbound", requireTelephonyHook, (_req, res) => res.json({ ok: true }));
  const server = await listen(app);
  try {
    const denied = await request(server, "/inbound", { method: "POST", body: {} });
    assert.equal(denied.status, 401);
    const allowed = await fetch(`http://127.0.0.1:${server.address().port}/inbound`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-complyline-hook-secret": "hook-secret" },
      body: "{}",
    });
    assert.equal(allowed.status, 200);
  } finally {
    if (previous === undefined) delete process.env.TELEPHONY_WEBHOOK_SECRET;
    else process.env.TELEPHONY_WEBHOOK_SECRET = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("telephony modules do not log", async () => {
  for (const name of ["store.js", "carriers.js", "router.js", "inbound.js"]) {
    const source = await readFile(new URL(`./${name}`, import.meta.url), "utf8");
    assert.equal(source.includes("console."), false, name);
  }
});
