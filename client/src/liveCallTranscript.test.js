import { test } from "node:test";
import assert from "node:assert/strict";
import { agentTurnStartMs, shouldDropEchoUserTurn } from "./liveCallTranscript.js";

test("shouldDropEchoUserTurn drops user turns during agent playback", () => {
  assert.equal(shouldDropEchoUserTurn("hello", 5000, 8000, ""), true);
  assert.equal(shouldDropEchoUserTurn("hello", 9000, 8000, ""), false);
});

test("shouldDropEchoUserTurn drops user text that matches recent agent speech", () => {
  const agent = "Thanks for calling Northwind Bank, you are speaking with an AI assistant.";
  assert.equal(shouldDropEchoUserTurn(agent, 12000, 8000, agent), true);
  assert.equal(
    shouldDropEchoUserTurn("Thanks for calling Northwind Bank", 12000, 8000, agent),
    true,
  );
  assert.equal(shouldDropEchoUserTurn("My name is Francis Drake", 12000, 8000, agent), false);
});

test("agentTurnStartMs prefers reply audio start time", () => {
  assert.equal(agentTurnStartMs(1200, 5000), 1200);
  assert.equal(agentTurnStartMs(null, 5000), 5000);
});
