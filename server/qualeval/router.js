import { Router } from "express";
import * as store from "./store.js";
import { generateScenarios } from "./generator.js";
import { evaluateTranscript } from "./evaluator.js";
import * as providers from "../providers/registry.js";

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
  const run = await store.getRun(runId);
  if (!run) throw new Error("Run not found");
  if (!run.transcript) throw new Error("Cannot evaluate a run with no transcript.");
  const scenario = await store.getScenario(run.scenarioId);
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

  router.get(
    "/evaluations/:id",
    wrap(async (req, res) => {
      const evaluation = await store.getEvaluation(req.params.id, visitorId(req));
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });
      const scenarios = await store.listScenarios(evaluation.id);
      const scenariosWithRuns = await Promise.all(
        scenarios.map(async (scenario) => ({ ...scenario, runs: await store.listRuns(scenario.id) })),
      );
      res.json({ ...evaluation, scenarios: scenariosWithRuns });
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
      const { feedback } = req.body ?? {};
      const generated = await generateScenarios(evaluation, {
        feedback,
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
      const scenarios = await store.listScenarios(req.params.id);
      res.json({ scenarios });
    }),
  );

  router.patch(
    "/scenarios/:id",
    wrap(async (req, res) => {
      const updated = await store.updateScenario(req.params.id, req.body ?? {});
      res.json(updated);
    }),
  );

  // Stubbed call-placement step: creates a Run recorded honestly as
  // "pending - not yet run" rather than a fabricated transcript/verdict.
  // Real outbound calling needs Twilio credentials this task doesn't have
  // (see AGENTS.md's QualEval section) - a follow-up task wires this to a
  // real call and then to server/qualeval/store.js's attachTranscript +
  // this module's dispatchEvaluation.
  router.post(
    "/scenarios/:id/runs",
    wrap(async (req, res) => {
      const scenario = await store.getScenario(req.params.id);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });
      if (scenario.status !== "approved") {
        return res.status(400).json({ error: "Only approved scenarios can be run." });
      }
      const run = await store.createRun(scenario.id);
      res.status(201).json(run);
    }),
  );

  router.get(
    "/scenarios/:id/runs",
    wrap(async (req, res) => {
      const runs = await store.listRuns(req.params.id);
      res.json({ runs });
    }),
  );

  router.get(
    "/runs/:id",
    wrap(async (req, res) => {
      const run = await store.getRun(req.params.id);
      if (!run) return res.status(404).json({ error: "Run not found" });
      res.json(run);
    }),
  );

  return router;
}
