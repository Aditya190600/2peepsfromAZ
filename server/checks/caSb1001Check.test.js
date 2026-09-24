import { test } from "node:test";
import assert from "node:assert/strict";
import { caSb1001BotDisclosureCheck } from "./caSb1001Check.js";

function session(turns) {
  return {
    sessionId: "test_ca_sb1001",
    startedAt: "2026-09-24T00:00:00.000Z",
    turns,
  };
}

test("flags when the agent never discloses it is a bot/AI", () => {
  const result = caSb1001BotDisclosureCheck(
    session([
      { role: "agent", text: "Hi there, thanks for calling Riverside Clinic.", tMs: 500 },
      { role: "user", text: "I'd like to book an appointment.", tMs: 6000 },
      { role: "agent", text: "Sure, let's find a time that works for you.", tMs: 9200 },
    ]),
  );
  assert.equal(result.check, "ca_sb1001_bot_disclosure");
  assert.equal(result.status, "flag");
});

test("passes when bot disclosure appears late in the call, outside the generic 10s window", () => {
  const result = caSb1001BotDisclosureCheck(
    session([
      { role: "agent", text: "Hi there, thanks for calling Riverside Clinic.", tMs: 500 },
      { role: "user", text: "I'd like to book an appointment.", tMs: 6000 },
      { role: "agent", text: "By the way, I'm an AI assistant helping out today.", tMs: 42000 },
    ]),
  );
  assert.equal(result.status, "pass");
  assert.equal(result.tMs, 42000);
});

test("passes on an early disclosure too", () => {
  const result = caSb1001BotDisclosureCheck(
    session([{ role: "agent", text: "Hi, you're speaking with an AI assistant today.", tMs: 500 }]),
  );
  assert.equal(result.status, "pass");
});
