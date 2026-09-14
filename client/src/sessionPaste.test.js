import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSessionPaste } from "./sessionPaste.js";

test("invalid JSON returns an error object instead of throwing", () => {
  const result = parseSessionPaste("{");
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid JSON/i);
});

test("empty paste returns an error object", () => {
  assert.equal(parseSessionPaste("").ok, false);
  assert.equal(parseSessionPaste("   ").ok, false);
});

test("valid session with turns is accepted", () => {
  const result = parseSessionPaste(
    JSON.stringify({
      sessionId: "sess_clean_01",
      turns: [{ role: "agent", text: "Hi", tMs: 0 }],
    })
  );
  assert.equal(result.ok, true);
  assert.equal(result.session.sessionId, "sess_clean_01");
  assert.equal(result.session.turns.length, 1);
});

test("wrapped { session } body is accepted", () => {
  const result = parseSessionPaste(
    JSON.stringify({
      session: { sessionId: "sess_x", turns: [{ role: "user", text: "ok", tMs: 1 }] },
      patternPackIds: ["generic"],
    })
  );
  assert.equal(result.ok, true);
  assert.equal(result.session.sessionId, "sess_x");
});

test("JSON that omits turns returns a shape error", () => {
  const result = parseSessionPaste(JSON.stringify({ sessionId: "sess_x" }));
  assert.equal(result.ok, false);
  assert.match(result.error, /turns array/i);
});
