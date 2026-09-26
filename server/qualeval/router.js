import { Router } from "express";
import * as store from "./store.js";
import * as demoAgentConfig from "./demoAgentConfig.js";
import { generateScenarios } from "./generator.js";
import { evaluateTranscript } from "./evaluator.js";
import * as providers from "../providers/registry.js";
import { placeCall, twilioConfigured } from "./callBridge.js";

function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = err.message === store.NOT_CONFIGURED_ERROR ? 503 : err.status ?? 400;
      res.status(status).json({ error: err.message });
    }
  };
}

// Runs the evaluator against a run's transcript and persists the verdict.
// Fire-and-forget, same async-dispatch-after-fast-ack shape as
// server/webhooks/ingest.js's processIngestedSession - not currently reached
// by any route in this task (call-placement is stubbed and never produces a
// real transcript), but ready for the follow-up call-bridge task to invoke
// once a run's transcript is attached via server/qualeval/store.js's
// attachTranscript.
export async function dispatchEvaluation(runId, { llmGateway = providers.getModel().complete } = {}) {
  const run = await store.getRun(runId, null);
  if (!run) throw new Error("Run not found");
  if (!run.transcript) throw new Error("Cannot evaluate a run with no transcript.");
  const scenario = await store.getScenario(run.scenarioId, null);
  if (!scenario) throw new Error("Scenario not found for run");
  try {
    const result = await evaluateTranscript(scenario, run.transcript, { llmGateway });
    return await store.recordVerdict(runId, result);
  } catch (err) {
    console.error(`QualEval evaluation failed for run ${runId}: ${err.message}`);
    throw err;
  }
}

export function qualevalRouter({ visitorId = () => "anon" } = {}) {
  const router = Router();

  router.post(
    "/evaluations",
    wrap(async (req, res) => {
      const { name, agentPhoneNumber, description, requirements } = req.body ?? {};
      const evaluation = await store.createEvaluation({
        clerkUserId: visitorId(req),
        name,
        agentPhoneNumber,
        description,
        requirements,
      });
      res.status(201).json(evaluation);
    }),
  );

  router.get(
    "/evaluations",
    wrap(async (req, res) => {
      const evaluations = await store.listEvaluations(visitorId(req));
      res.json({ evaluations });
    }),
  );

  // Read-only surface for the client to prefill the target-agent phone
  // number field with the deployment's demo agent number, instead of the
  // client bundle hardcoding QUALEVAL_AGENT_NUMBER's value.
  router.get(
    "/config",
    wrap(async (req, res) => {
      res.json({ agentPhoneNumber: process.env.QUALEVAL_AGENT_NUMBER || null });
    }),
  );

  router.get(
    "/evaluations/:id",
    wrap(async (req, res) => {
      const evaluation = await store.getEvaluation(req.params.id, visitorId(req));
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });
      const scenarios = await store.listScenarios(evaluation.id, visitorId(req));
      const scenariosWithRuns = await Promise.all(
        scenarios.map(async (scenario) => ({ ...scenario, runs: await store.listRuns(scenario.id) })),
      );
      res.json({ ...evaluation, scenarios: scenariosWithRuns });
    }),
  );

  // Edits the evaluation's own fields (name, target phone, description,
  // requirements) after creation - not a scenario or run.
  router.patch(
    "/evaluations/:id",
    wrap(async (req, res) => {
      const updated = await store.updateEvaluation(req.params.id, visitorId(req), req.body ?? {});
      res.json(updated);
    }),
  );

  // Deletes the evaluation and, via on-delete-cascade, every scenario/run
  // under it.
  router.delete(
    "/evaluations/:id",
    wrap(async (req, res) => {
      await store.deleteEvaluation(req.params.id, visitorId(req));
      res.status(204).end();
    }),
  );

  // Generates (or regenerates, with typed feedback folded into the prompt) a
  // batch of scenarios for an evaluation. Regeneration replaces every
  // pending/rejected scenario but leaves already-approved ones untouched.
  router.post(
    "/evaluations/:id/scenarios/generate",
    wrap(async (req, res) => {
      const evaluation = await store.getEvaluation(req.params.id, visitorId(req));
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });
      const { feedback, count } = req.body ?? {};
      const generated = await generateScenarios(evaluation, {
        feedback,
        count,
        llmGateway: providers.getModel().complete,
      });
      await store.deleteUnapprovedScenarios(evaluation.id);
      const scenarios = await store.insertScenarios(evaluation.id, generated);
      res.status(201).json({ scenarios });
    }),
  );

  router.get(
    "/evaluations/:id/scenarios",
    wrap(async (req, res) => {
      const scenarios = await store.listScenarios(req.params.id, visitorId(req));
      res.json({ scenarios });
    }),
  );

  router.patch(
    "/scenarios/:id",
    wrap(async (req, res) => {
      const updated = await store.updateScenario(req.params.id, visitorId(req), req.body ?? {});
      res.json(updated);
    }),
  );

  // Deletes a single scenario from any tab (generated/accepted/rejected),
  // regardless of status.
  router.delete(
    "/scenarios/:id",
    wrap(async (req, res) => {
      await store.deleteScenario(req.params.id, visitorId(req));
      res.status(204).end();
    }),
  );

  // Creates a Run for an approved scenario and, when Twilio is configured
  // (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN + QUALEVAL_PERSONA_NUMBER - see
  // AGENTS.md), places a real outbound call instead of leaving the run
  // stubbed. The run row is created and returned first, fast, exactly like
  // every other create endpoint in this router; call placement is
  // dispatched async off the response path (same fast-ack shape as
  // server/webhooks/ingest.js's processIngestedSession) since Twilio's
  // create-call API can take a moment and the run id is all the client
  // needs to start polling. Without Twilio configured, the run stays the
  // original honest "pending - not yet run" stub.
  router.post(
    "/scenarios/:id/runs",
    wrap(async (req, res) => {
      const scenario = await store.getScenario(req.params.id, visitorId(req));
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });
      if (scenario.status !== "approved") {
        return res.status(400).json({ error: "Only approved scenarios can be run." });
      }
      const run = await store.createRun(scenario.id);
      res.status(201).json(run);

      if (twilioConfigured()) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        store
          .getEvaluation(scenario.evaluationId, visitorId(req))
          .then((evaluation) => placeCall(run, scenario, evaluation, { baseUrl }))
          .catch((err) => {
            console.error(`QualEval run ${run.id}: call placement dispatch failed: ${err.message}`);
          });
      }
    }),
  );

  router.get(
    "/scenarios/:id/runs",
    wrap(async (req, res) => {
      const scenario = await store.getScenario(req.params.id, visitorId(req));
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });
      const runs = await store.listRuns(scenario.id);
      res.json({ runs });
    }),
  );

  router.get(
    "/runs/:id",
    wrap(async (req, res) => {
      const run = await store.getRun(req.params.id, visitorId(req));
      if (!run) return res.status(404).json({ error: "Run not found" });
      res.json(run);
    }),
  );

  // Minimal operator surface for QUALEVAL_AGENT_NUMBER's two target-agent
  // variants (server/qualeval/demoAgentConfig.js) - list/edit both prompts
  // and switch which one is currently active. There's only one number, so
  // "active" is a runtime toggle rather than two simultaneous numbers.
  router.get(
    "/demo-agent/variants",
    wrap(async (req, res) => {
      const [keys, activeKey] = await Promise.all([demoAgentConfig.listVariants(), demoAgentConfig.getActiveVariantKey()]);
      // Reads each variant's live prompt/greeting/voice straight off its
      // AssemblyAI agent record (getVariantWithAgent), not a local copy that
      // could drift once PATCH starts writing to AssemblyAI directly.
      const variants = await Promise.all(keys.map((v) => demoAgentConfig.getVariantWithAgent(v.key)));
      res.json({ variants, activeKey });
    }),
  );

  router.patch(
    "/demo-agent/variants/:key",
    wrap(async (req, res) => {
      const { name, systemPrompt, greeting, voice } = req.body ?? {};
      const variant = await demoAgentConfig.updateVariant(req.params.key, { name, systemPrompt, greeting, voice });
      res.json(variant);
    }),
  );

  router.post(
    "/demo-agent/active",
    wrap(async (req, res) => {
      const { variant } = req.body ?? {};
      const activeKey = await demoAgentConfig.setActiveVariant(variant);
      res.json({ activeKey });
    }),
  );

  return router;
}
