import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchCallPlacement } from "./router.js";

const run = { id: "run_1" };
const scenario = { id: "scenario_1", evaluationId: "eval_1" };

test("dispatchCallPlacement marks the run errored when getEvaluation() itself rejects", async () => {
  let markedError;
  await dispatchCallPlacement(run, scenario, "visitor_1", {
    baseUrl: "https://app.example.com",
    getEvaluation: async () => {
      throw new Error("connection terminated unexpectedly");
    },
    placeCall: async () => assert.fail("placeCall must not be reached when getEvaluation rejects"),
    markRunError: async (id, message) => {
      markedError = { id, message };
    },
  });

  assert.deepEqual(markedError, { id: "run_1", message: "connection terminated unexpectedly" });
});

test("dispatchCallPlacement marks the run errored when placeCall itself throws unexpectedly", async () => {
  let markedError;
  await dispatchCallPlacement(run, scenario, "visitor_1", {
    baseUrl: "https://app.example.com",
    getEvaluation: async () => null,
    placeCall: async () => {
      throw new Error("boom");
    },
    markRunError: async (id, message) => {
      markedError = { id, message };
    },
  });

  assert.deepEqual(markedError, { id: "run_1", message: "boom" });
});

test("dispatchCallPlacement does not call markRunError when placeCall resolves normally", async () => {
  await dispatchCallPlacement(run, scenario, "visitor_1", {
    baseUrl: "https://app.example.com",
    getEvaluation: async () => ({ id: "eval_1", agentPhoneNumber: "+15551234567" }),
    placeCall: async () => ({ id: "run_1", verdict: "in_progress" }),
    markRunError: async () => assert.fail("must not error on success"),
  });
});

test("dispatchCallPlacement swallows a markRunError failure instead of rejecting", async () => {
  await assert.doesNotReject(
    dispatchCallPlacement(run, scenario, "visitor_1", {
      baseUrl: "https://app.example.com",
      getEvaluation: async () => {
        throw new Error("db down");
      },
      placeCall: async () => assert.fail("should not be reached"),
      markRunError: async () => {
        throw new Error("db still down");
      },
    }),
  );
});
