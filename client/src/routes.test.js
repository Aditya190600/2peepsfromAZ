import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRoute } from "./routes.js";

test("landing is the default", () => {
  assert.deepEqual(matchRoute("/"), { name: "landing" });
  assert.deepEqual(matchRoute("/unknown"), { name: "landing" });
});

test("named product routes", () => {
  assert.deepEqual(matchRoute("/try"), { name: "try" });
  assert.deepEqual(matchRoute("/sessions"), { name: "sessions" });
  assert.deepEqual(matchRoute("/sessions/"), { name: "sessions" });
  assert.deepEqual(matchRoute("/api-keys"), { name: "api-keys" });
  assert.deepEqual(matchRoute("/evals"), { name: "evals" });
  assert.deepEqual(matchRoute("/numbers"), { name: "numbers" });
  assert.deepEqual(matchRoute("/qualeval"), { name: "qualeval" });
  assert.deepEqual(matchRoute("/settings"), { name: "settings" });
  assert.deepEqual(matchRoute("/phone-evals"), { name: "phone-evals" });
  assert.deepEqual(matchRoute("/examples/qualeval"), { name: "qualeval-example" });
});

test("qualeval evaluation id is decoded after the qualeval prefix", () => {
  assert.deepEqual(matchRoute("/qualeval/eval_123"), {
    name: "qualeval-evaluation",
    evaluationId: "eval_123",
  });
});

test("session id is decoded after the sessions prefix", () => {
  assert.deepEqual(matchRoute("/sessions/sess_tcpa_04"), {
    name: "session",
    sessionId: "sess_tcpa_04",
  });
});

test("legacy dashboard lands on try", () => {
  assert.deepEqual(matchRoute("/dashboard"), { name: "try", redirect: "/try" });
});

test("removed home page lands on try", () => {
  assert.deepEqual(matchRoute("/home"), { name: "try", redirect: "/try" });
});

test("legacy history lands on sessions", () => {
  assert.deepEqual(matchRoute("/history"), { name: "sessions", redirect: "/sessions" });
});
