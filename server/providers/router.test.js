import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { providersRouter } from "./router.js";

// Stands in for Clerk's requireAuth(): a request carrying x-test-user is
// signed in as that user, anything else is rejected the way requireAuth()
// rejects a signed-out request.
function fakeRequireVisitor(req, res, next) {
  if (!req.get("x-test-user")) return res.status(401).json({ error: "Unauthenticated" });
  next();
}

function fakeRegistry() {
  const calls = [];
  return {
    calls,
    listCatalog: () => ({ transcriber: [], model: [], voice: [] }),
    getConfig: () => ({ transcriber: { providerId: "assemblyai" } }),
    setSelection: (slot, providerId) => {
      calls.push(["setSelection", slot, providerId]);
      return { providerId };
    },
    setCredential: (providerId, credential) => {
      calls.push(["setCredential", providerId, credential.apiKey]);
    },
  };
}

async function start(t, registry) {
  const app = express();
  app.use(express.json());
  app.use(
    "/v1/providers",
    providersRouter({
      registry,
      requireVisitor: fakeRequireVisitor,
      isOperator: async (req) => req.get("x-test-user") === "operator",
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return async (method, url, { user, body } = {}) => {
    const headers = { "content-type": "application/json" };
    if (user) headers["x-test-user"] = user;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
}

const WRITES = [
  ["/v1/providers/config", { slot: "model", providerId: "openai-compatible" }],
  ["/v1/providers/credentials", { providerId: "deepgram", apiKey: "dg-key" }],
];

test("provider writes reject a signed-out request before touching the registry", async (t) => {
  const registry = fakeRegistry();
  const request = await start(t, registry);
  for (const [url, body] of WRITES) {
    assert.equal((await request("PUT", url, { body })).status, 401, url);
  }
  assert.deepEqual(registry.calls, []);
});

test("provider writes reject a signed-in non-operator", async (t) => {
  const registry = fakeRegistry();
  const request = await start(t, registry);
  for (const [url, body] of WRITES) {
    const response = await request("PUT", url, { user: "visitor", body });
    assert.equal(response.status, 403, url);
    assert.equal(response.body.error, "Operator access required.");
  }
  assert.deepEqual(registry.calls, []);
});

test("an operator can still change the selection and save a key", async (t) => {
  const registry = fakeRegistry();
  const request = await start(t, registry);
  for (const [url, body] of WRITES) {
    assert.equal((await request("PUT", url, { user: "operator", body })).status, 200, url);
  }
  assert.deepEqual(registry.calls, [
    ["setSelection", "model", "openai-compatible"],
    ["setCredential", "deepgram", "dg-key"],
  ]);
});

test("config reports canEdit only for an operator, and reads stay open", async (t) => {
  const request = await start(t, fakeRegistry());
  assert.equal((await request("GET", "/v1/providers")).status, 200);
  const anonymous = await request("GET", "/v1/providers/config");
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.body.canEdit, false);
  assert.equal(anonymous.body.transcriber.providerId, "assemblyai");
  assert.equal((await request("GET", "/v1/providers/config", { user: "visitor" })).body.canEdit, false);
  assert.equal((await request("GET", "/v1/providers/config", { user: "operator" })).body.canEdit, true);
});
