import { test } from "node:test";
import assert from "node:assert/strict";
import { miniMirandaCheck } from "./miniMirandaCheck.js";

test("mini-Miranda check is n/a when the fdcpa pack isn't selected", () => {
  const session = { turns: [{ role: "agent", text: "Hi there.", tMs: 500 }] };
  const result = miniMirandaCheck(session, { patternPackIds: ["generic"] });
  assert.equal(result.check, "mini_miranda");
  assert.equal(result.status, "n/a");
});

test("mini-Miranda check flags a debt-collection call with no disclosure", () => {
  const session = {
    turns: [
      { role: "agent", text: "Hi, this is Meridian Recovery calling about your account.", tMs: 500 },
      { role: "user", text: "What is this about?", tMs: 4000 },
    ],
  };
  const result = miniMirandaCheck(session, { patternPackIds: ["fdcpa"] });
  assert.equal(result.status, "flag");
});

test("mini-Miranda check passes on the canonical disclosure phrase", () => {
  const session = {
    turns: [
      { role: "agent", text: "This is an attempt to collect a debt, and any information will be used for that purpose.", tMs: 500 },
    ],
  };
  const result = miniMirandaCheck(session, { patternPackIds: ["fdcpa"] });
  assert.equal(result.status, "pass");
  assert.equal(result.tMs, 500);
});

test("mini-Miranda check passes on a common real-world phrasing followed by punctuation", () => {
  const session = {
    turns: [{ role: "agent", text: "This is Meridian Recovery. We are a debt collector.", tMs: 500 }],
  };
  const result = miniMirandaCheck(session, { patternPackIds: ["fdcpa"] });
  assert.equal(result.status, "pass");
});

test("mini-Miranda check ignores a disclosure that arrives after the early window", () => {
  const session = {
    turns: [
      { role: "agent", text: "Hi, this is Meridian Recovery calling about your account.", tMs: 500 },
      { role: "agent", text: "This is an attempt to collect a debt.", tMs: 15_000 },
    ],
  };
  const result = miniMirandaCheck(session, { patternPackIds: ["fdcpa"] });
  assert.equal(result.status, "flag");
});
