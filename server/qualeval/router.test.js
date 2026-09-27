import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchCallPlacement, reconcileStaleRuns } from "./router.js";

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

async function withRouter(isOperator, fn, options = {}) {
  const { default: express } = await import("express");
  const { qualevalRouter } = await import("./router.js");
  const app = express();
  app.use(express.json());
  app.use(qualevalRouter({ isOperator: async () => isOperator, ...options }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test("non-operators get 403 from every demo-agent route and no persona number from /config", async () => {
  const saved = { agent: process.env.QUALEVAL_AGENT_NUMBER, persona: process.env.QUALEVAL_PERSONA_NUMBER };
  process.env.QUALEVAL_AGENT_NUMBER = "+15550000001";
  process.env.QUALEVAL_PERSONA_NUMBER = "+15550000002";
  try {
    await withRouter(false, async (base) => {
      const variants = await fetch(`${base}/demo-agent/variants`);
      assert.equal(variants.status, 403);
      const patch = await fetch(`${base}/demo-agent/variants/compliant`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ systemPrompt: "x" }),
      });
      assert.equal(patch.status, 403);
      const active = await fetch(`${base}/demo-agent/active`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant: "flawed" }),
      });
      assert.equal(active.status, 403);
      assert.deepEqual(await (await fetch(`${base}/config`)).json(), {
        agentPhoneNumber: "+15550000001",
        isOperator: false,
      });
    });
    await withRouter(true, async (base) => {
      assert.deepEqual(await (await fetch(`${base}/config`)).json(), {
        agentPhoneNumber: "+15550000001",
        isOperator: true,
        personaPhoneNumber: "+15550000002",
      });
    });
  } finally {
    for (const [key, value] of [["QUALEVAL_AGENT_NUMBER", saved.agent], ["QUALEVAL_PERSONA_NUMBER", saved.persona]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Phone Evals calls and their recordings are operator-only, and evaluations have no inbound-call feed", async () => {
  await withRouter(false, async (base) => {
    assert.equal((await fetch(`${base}/phone-evals`)).status, 403);
    assert.equal((await fetch(`${base}/production-calls/CA0123456789abcdef0123456789abcdef/audio`)).status, 403);
    assert.equal((await fetch(`${base}/evaluations/eval_1/inbound-calls`)).status, 404);
  });
  // No DATABASE_URL in tests: an operator gets an empty list, not an error.
  await withRouter(true, async (base) => {
    const resp = await fetch(`${base}/phone-evals`);
    assert.equal(resp.status, 200);
    assert.deepEqual(await resp.json(), { calls: [] });
  });
});

test("reconcileStaleRuns passes includePending through to expireStaleRuns", async () => {
  let options;
  await reconcileStaleRuns({
    includePending: false,
    expireStaleRuns: async (opts) => {
      options = opts;
      return [];
    },
  });
  assert.deepEqual(options, { includePending: false });
});

test("reconcileStaleRuns never throws, so a reconciliation failure can't fail the read it precedes", async () => {
  await reconcileStaleRuns({
    includePending: true,
    expireStaleRuns: async () => {
      throw new Error("connection terminated unexpectedly");
    },
  });
});

test("an operator can re-run a finished Phone Evals call's analyses", async () => {
  const sid = "CA0123456789abcdef0123456789abcdef";
  const calls = {
    [sid]: { twilioCallSid: sid, direction: "inbound", fromNumber: "+13128003792", endedAt: "2026-09-27T20:00:00Z" },
    CAffffffffffffffffffffffffffffffff: { twilioCallSid: "CAffffffffffffffffffffffffffffffff", direction: "inbound" },
    CAeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee: {
      twilioCallSid: "CAeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      direction: "inbound",
      qualevalRunId: "run_1",
      endedAt: "2026-09-27T20:00:00Z",
    },
  };
  const analyzed = [];
  const options = {
    getProductionCall: async (callSid) => calls[callSid] ?? null,
    analyzeCall: async (call) => analyzed.push(call.twilioCallSid),
  };
  const rerun = (base, callSid) => fetch(`${base}/phone-evals/${callSid}/analyze`, { method: "POST" });

  await withRouter(false, async (base) => {
    assert.equal((await rerun(base, sid)).status, 403);
  }, options);
  await withRouter(true, async (base) => {
    assert.equal((await rerun(base, "not-a-sid")).status, 400);
    assert.equal((await rerun(base, "CA00000000000000000000000000000000")).status, 404);
    // A scenario-run leg is not a Phone Evals call.
    assert.equal((await rerun(base, "CAeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).status, 404);
    assert.equal((await rerun(base, "CAffffffffffffffffffffffffffffffff")).status, 409);
    assert.equal((await rerun(base, sid)).status, 202);
  }, options);
  assert.deepEqual(analyzed, [sid]);
});
