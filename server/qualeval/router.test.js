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

const telephonyStoreWithNumber = {
  listNumbers: async (ownerId) =>
    ownerId === "user_configured" ? [{ e164: "+18038245760", direction: "inbound" }] : [],
};

function resolveRouterAccess(access) {
  if (typeof access === "boolean") {
    return { isOperator: access, isPhoneEvalAdmin: access };
  }
  return {
    isOperator: access?.isOperator ?? false,
    isPhoneEvalAdmin: access?.isPhoneEvalAdmin ?? false,
  };
}

async function withRouter(access, fn, options = {}) {
  const { isOperator, isPhoneEvalAdmin } = resolveRouterAccess(access);
  const { default: express } = await import("express");
  const { qualevalRouter } = await import("./router.js");
  const app = express();
  app.use(express.json());
  app.use(
    qualevalRouter({
      isOperator: async () => isOperator,
      isPhoneEvalAdmin: async () => isPhoneEvalAdmin,
      visitorId: (req) => req.get("x-test-user") ?? "anon",
      telephonyStore: telephonyStoreWithNumber,
      ...options,
    }),
  );
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
      const { demoAgents, ...config } = await (await fetch(`${base}/config`)).json();
      assert.ok(demoAgents.length > 0);
      assert.deepEqual(config, {
        agentPhoneNumber: "+15550000001",
        isOperator: false,
        isPhoneEvalAdmin: false,
        canAccessPhoneEvals: false,
        phoneEvalsConfigured: false,
        ownedPhoneNumbers: [],
      });
    });
    await withRouter({ isOperator: true, isPhoneEvalAdmin: true }, async (base) => {
      const { demoAgents, ...config } = await (await fetch(`${base}/config`)).json();
      assert.ok(demoAgents.length > 0);
      assert.deepEqual(config, {
        agentPhoneNumber: "+15550000001",
        isOperator: true,
        isPhoneEvalAdmin: true,
        canAccessPhoneEvals: true,
        phoneEvalsConfigured: false,
        ownedPhoneNumbers: [],
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

test("Phone Evals requires admin access or a configured number, and evaluations have no inbound-call feed", async () => {
  await withRouter(false, async (base) => {
    assert.equal((await fetch(`${base}/phone-evals`)).status, 403);
    assert.equal((await fetch(`${base}/production-calls/CA0123456789abcdef0123456789abcdef/audio`)).status, 403);
    assert.equal((await fetch(`${base}/evaluations/eval_1/inbound-calls`)).status, 404);
  });
  await withRouter(false, async (base) => {
    const resp = await fetch(`${base}/phone-evals`, { headers: { "x-test-user": "user_configured" } });
    assert.equal(resp.status, 200);
    assert.deepEqual(await resp.json(), { calls: [] });
  });
  // No DATABASE_URL in tests: an admin gets an empty list, not an error.
  await withRouter({ isPhoneEvalAdmin: true }, async (base) => {
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

test("a Phone Evals admin can re-run a finished call's analyses", async () => {
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
  const rerun = (base, callSid, headers = {}) =>
    fetch(`${base}/phone-evals/${callSid}/analyze`, { method: "POST", headers });

  await withRouter(false, async (base) => {
    assert.equal((await rerun(base, sid)).status, 403);
    assert.equal((await rerun(base, sid, { "x-test-user": "user_configured" })).status, 404);
  }, options);
  await withRouter({ isPhoneEvalAdmin: true }, async (base) => {
    assert.equal((await rerun(base, "not-a-sid")).status, 400);
    assert.equal((await rerun(base, "CA00000000000000000000000000000000")).status, 404);
    // A scenario-run leg is not a Phone Evals call.
    assert.equal((await rerun(base, "CAeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).status, 404);
    assert.equal((await rerun(base, "CAffffffffffffffffffffffffffffffff")).status, 409);
    assert.equal((await rerun(base, sid)).status, 202);
  }, options);
  assert.deepEqual(analyzed, [sid]);
});

test("operator and admin allowlists gate deployment controls vs Phone Evals separately", async () => {
  const { createOperatorCheck, parseOperatorEmails } = await import("./operatorAccess.js");
  const emailsByUser = { user_captain: ["Captain@Example.com"], user_stranger: ["stranger@example.com"] };
  const allowlistCheck = (raw) =>
    createOperatorCheck({
      allowlist: parseOperatorEmails(raw),
      clerkEnabled: true,
      userIdOf: (req) => req.get("x-test-user"),
      lookupEmails: async (userId) => emailsByUser[userId] ?? [],
    });
  const sid = "CA0123456789abcdef0123456789abcdef";
  const options = {
    getProductionCall: async () => ({ twilioCallSid: sid, direction: "inbound", endedAt: "2026-09-27T20:00:00Z" }),
    analyzeCall: async () => {},
  };
  const json = { "content-type": "application/json" };
  const operatorOnlyRoutes = [
    ["GET", "/demo-agent/variants"],
    ["PATCH", "/demo-agent/variants/compliant", { systemPrompt: "x" }],
    ["POST", "/demo-agent/active", { variant: "flawed" }],
  ];
  const phoneEvalRoutes = [
    ["GET", "/phone-evals"],
    ["POST", `/phone-evals/${sid}/analyze`],
    ["GET", `/production-calls/${sid}/audio`],
  ];
  const hit = (base, user, [method, path, body]) =>
    fetch(`${base}${path}`, {
      method,
      headers: { ...json, ...(user && { "x-test-user": user }) },
      ...(body && { body: JSON.stringify(body) }),
    });

  const serve = async ({ operatorEmails, adminEmails }, fn) => {
    const { default: express } = await import("express");
    const { qualevalRouter } = await import("./router.js");
    const app = express();
    app.use(express.json());
    app.use(
      qualevalRouter({
        isOperator: allowlistCheck(operatorEmails),
        isPhoneEvalAdmin: allowlistCheck(adminEmails),
        visitorId: (req) => req.get("x-test-user") ?? "anon",
        telephonyStore: telephonyStoreWithNumber,
        ...options,
      }),
    );
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
      server.close();
    }
  };

  await serve({ operatorEmails: "captain@example.com", adminEmails: "captain@example.com" }, async (base) => {
    for (const user of ["user_stranger", undefined]) {
      for (const route of operatorOnlyRoutes) {
        const resp = await hit(base, user, route);
        assert.equal(resp.status, 403, `${user ?? "signed-out"} ${route[0]} ${route[1]}`);
        assert.deepEqual(await resp.json(), { error: "Operator access required." });
      }
      for (const route of phoneEvalRoutes) {
        const resp = await hit(base, user, route);
        assert.equal(resp.status, 403, `${user ?? "signed-out"} ${route[0]} ${route[1]}`);
        assert.match((await resp.json()).error, /Phone Evals requires/);
      }
      const config = await (await hit(base, user, ["GET", "/config"])).json();
      assert.equal(config.isOperator, false);
      assert.equal(config.isPhoneEvalAdmin, false);
      // Anyone creating an evaluation picks which demo agent answers it, so
      // the catalog's labels are public - never the prompts.
      assert.ok(config.demoAgents.some((a) => a.key === "healthcare-compliant" && a.domainLabel === "Healthcare"));
      assert.ok(config.demoAgents.every((a) => Object.keys(a).sort().join() === "domainLabel,key,label"));
    }
    // The listed user passes every gate (no DB/bucket in tests, so later
    // handler steps may 404/500 - but never the access 403).
    for (const route of [...operatorOnlyRoutes, ...phoneEvalRoutes]) {
      const resp = await hit(base, "user_captain", route);
      assert.notEqual(resp.status, 403, `captain ${route[0]} ${route[1]}`);
    }
    assert.equal((await hit(base, "user_captain", ["GET", "/phone-evals"])).status, 200);
    const captainConfig = await (await hit(base, "user_captain", ["GET", "/config"])).json();
    assert.equal(captainConfig.isOperator, true);
    assert.equal(captainConfig.isPhoneEvalAdmin, true);
  });

  await serve({ operatorEmails: "captain@example.com", adminEmails: undefined }, async (base) => {
    assert.notEqual((await hit(base, "user_captain", operatorOnlyRoutes[0])).status, 403);
    assert.equal((await hit(base, "user_captain", ["GET", "/phone-evals"])).status, 403);
  });

  await serve({ operatorEmails: undefined, adminEmails: "captain@example.com" }, async (base) => {
    assert.equal((await hit(base, "user_captain", operatorOnlyRoutes[0])).status, 403);
    assert.equal((await hit(base, "user_captain", ["GET", "/phone-evals"])).status, 200);
  });

  await serve({ operatorEmails: "*", adminEmails: "*" }, async (base) => {
    assert.equal((await hit(base, "user_stranger", ["GET", "/phone-evals"])).status, 200);
    const config = await (await hit(base, "user_stranger", ["GET", "/config"])).json();
    assert.equal(config.isOperator, true);
    assert.equal(config.isPhoneEvalAdmin, true);
  });

  for (const adminEmails of [undefined, "", "captain@example.com,*"]) {
    await serve({ operatorEmails: undefined, adminEmails }, async (base) => {
      assert.equal((await hit(base, "user_stranger", ["GET", "/phone-evals"])).status, 403, String(adminEmails));
    });
  }
});
