import { Router } from "express";
import * as store from "./store.js";
import * as demoAgentConfig from "./demoAgentConfig.js";
import { findDemoAgent, DEMO_AGENT_DOMAINS } from "./demoAgentDefaults.js";
import { generateScenarios } from "./generator.js";
import { evaluateTranscript } from "./evaluator.js";
import * as providers from "../providers/registry.js";
import { placeCall, twilioConfigured } from "./callBridge.js";
import { endCall } from "./twilioClient.js";
import { getObjectByKey, sendRecording } from "../recordingsStore.js";
import { qualevalCallAudioKey, productionCallAudioKey } from "./callRecorder.js";
import { getProductionCallBySid, listProductionCallsForEvaluation } from "./productionCalls.js";
import { buildScenariosWorkbook, scenariosExportFilename } from "./scenarioExport.js";

const TWILIO_CALL_SID = /^CA[0-9a-f]{32}$/i;

function wrap(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
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
// Dispatches call placement for a freshly-created run, off the fast-ack
// response path (see the POST /scenarios/:id/runs handler below). Extracted
// into its own injectable function so the failure path - what happens when
// getEvaluation() itself rejects, or anything else here throws before
// placeCall's own try/catch takes over - is unit-testable without a real DB:
// this must ALWAYS resolve to markRunError on failure, never a silent
// console.error-only path, or the run is stranded at 'pending'/'in_progress'
// forever with no Twilio call ever placed. Confirmed via Twilio call logs as
// the root cause of run 4ab2abc3-09c8-4933-ad75-d1cc55acd29c getting stuck in
// 'Call in progress...'; the shared QUALEVAL_AGENT_NUMBER (+18038245760)
// overlap with the separate inbound target-agent answer-latency issue is
// coincidental, not a shared root cause (see
// server/migrations/006_qualeval_stranded_runs_sweep.sql).
export function dispatchCallPlacement(
  run,
  scenario,
  visitorId,
  { baseUrl, getEvaluation = store.getEvaluation, placeCall: place = placeCall, markRunError = store.markRunError } = {},
) {
  return getEvaluation(scenario.evaluationId, visitorId)
    .then((evaluation) => place(run, scenario, evaluation, { baseUrl }))
    .catch((err) => {
      console.error(`QualEval run ${run.id}: call placement dispatch failed: ${err.message}`);
      return markRunError(run.id, err.message).catch(() => {});
    });
}

// Retires runs stranded by a restart or a never-connected Media Stream (see
// store.expireStaleRuns) before any read that shows run state, so a stuck
// "Call in progress..." always resolves to an honest error on the next load.
// Best-effort: a reconciliation failure must never fail the read itself.
export async function reconcileStaleRuns({
  expireStaleRuns = store.expireStaleRuns,
  includePending = twilioConfigured(),
} = {}) {
  try {
    const expired = await expireStaleRuns({ includePending });
    for (const run of expired) {
      console.error(`QualEval run ${run.id}: expired stale run - ${run.error}`);
    }
  } catch (err) {
    console.error(`QualEval: stale-run reconciliation failed: ${err.message}`);
  }
}

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

async function listScenariosWithRuns(evaluationId, visitor) {
  const scenarios = await store.listScenarios(evaluationId, visitor);
  return Promise.all(scenarios.map(async (scenario) => ({ ...scenario, runs: await store.listRuns(scenario.id) })));
}

export function qualevalRouter({ visitorId = () => "anon", isOperator = async () => false } = {}) {
  const router = Router();

  const requireOperator = wrap(async (req, res, next) => {
    if (!(await isOperator(req))) return res.status(403).json({ error: "Operator access required." });
    next();
  });

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

  // Read-only surface for the deployment's two Twilio numbers, instead of
  // the client bundle hardcoding them: QualEval prefills the target-agent
  // phone number field with QUALEVAL_AGENT_NUMBER for everyone. Only
  // operators (operatorAccess.js) also get QUALEVAL_PERSONA_NUMBER, the caller
  // ID QualEval dials out from, which the Settings page shows.
  router.get(
    "/config",
    wrap(async (req, res) => {
      const operator = await isOperator(req);
      res.json({
        agentPhoneNumber: process.env.QUALEVAL_AGENT_NUMBER || null,
        isOperator: operator,
        ...(operator && { personaPhoneNumber: process.env.QUALEVAL_PERSONA_NUMBER || null }),
      });
    }),
  );

  router.get(
    "/evaluations/:id/inbound-calls",
    wrap(async (req, res) => {
      const evaluation = await store.getEvaluation(req.params.id, visitorId(req));
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });
      const calls = await listProductionCallsForEvaluation(evaluation.id);
      res.json({ calls });
    }),
  );

  router.get(
    "/evaluations/:id",
    wrap(async (req, res) => {
      const evaluation = await store.getEvaluation(req.params.id, visitorId(req));
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });
      await reconcileStaleRuns();
      res.json({ ...evaluation, scenarios: await listScenariosWithRuns(evaluation.id, visitorId(req)) });
    }),
  );

  // Downloads the evaluation's whole scenario set (every status tab) as an
  // .xlsx workbook - see scenarioExport.js for the columns.
  router.get(
    "/evaluations/:id/scenarios.xlsx",
    wrap(async (req, res) => {
      const evaluation = await store.getEvaluation(req.params.id, visitorId(req));
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });
      await reconcileStaleRuns();
      const scenarios = await listScenariosWithRuns(evaluation.id, visitorId(req));
      const workbook = await buildScenariosWorkbook(evaluation, scenarios);
      res.attachment(scenariosExportFilename(evaluation));
      res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(workbook);
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

  // Bulk-deletes every scenario in one tab (?status=pending|approved|rejected)
  // for this evaluation - the "delete all" button per tab. Scoped to this
  // evaluation and that status only, so it never touches another tab or
  // another evaluation.
  router.delete(
    "/evaluations/:id/scenarios",
    wrap(async (req, res) => {
      const evaluation = await store.getEvaluation(req.params.id, visitorId(req));
      if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });
      const { status } = req.query;
      if (!status) return res.status(400).json({ error: "status query parameter is required" });
      await store.deleteScenariosByStatus(evaluation.id, visitorId(req), status);
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
        dispatchCallPlacement(run, scenario, visitorId(req), { baseUrl });
      }
    }),
  );

  router.get(
    "/scenarios/:id/runs",
    wrap(async (req, res) => {
      const scenario = await store.getScenario(req.params.id, visitorId(req));
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });
      await reconcileStaleRuns();
      const runs = await store.listRuns(scenario.id);
      res.json({ runs });
    }),
  );

  router.get(
    "/runs/:id",
    wrap(async (req, res) => {
      await reconcileStaleRuns();
      const run = await store.getRun(req.params.id, visitorId(req));
      if (!run) return res.status(404).json({ error: "Run not found" });
      res.json(run);
    }),
  );

  // Gracefully ends a live Twilio call for an in-progress run - the exact
  // same hangup (POST Status=completed) that a normally-ended call would
  // trigger via Twilio's own completion, so this run finishes through the
  // real stream `stop` -> onFinished -> transcript/verdict path rather than
  // being marked errored or given a fabricated verdict here.
  router.post(
    "/runs/:id/end",
    wrap(async (req, res) => {
      await reconcileStaleRuns();
      const run = await store.getRun(req.params.id, visitorId(req));
      if (!run) return res.status(404).json({ error: "Run not found" });
      // A client showing an outdated "Call in progress..." lands here after
      // the call already finished on its own - say so, so it can refresh.
      if (run.verdict !== "in_progress") {
        return res.status(409).json({ error: "This call has already ended.", run });
      }
      if (!run.twilioCallSid) return res.status(400).json({ error: "Run has no live call to end." });
      await endCall(run.twilioCallSid);
      res.status(202).json({ ok: true });
    }),
  );

  // Streams a run's recorded call (server/qualeval/twilioStream.js uploads
  // it once the call ends - see server/qualeval/callRecorder.js), the same
  // Range-aware proxy shape as server/recordingsStore.js's `/v1/recordings/
  // :sessionId` for the Try page, but scoped by ownership through
  // store.getRun's clerk_user_id join instead of an owner-prefixed S3 key.
  router.get(
    "/runs/:id/audio",
    wrap(async (req, res) => {
      const run = await store.getRun(req.params.id, visitorId(req));
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (!run.audioRef) return res.status(404).json({ error: "No recording for this run" });
      const recording = await getObjectByKey(qualevalCallAudioKey(run.id), req.headers.range);
      if (!recording) return res.status(404).json({ error: "Recording not found" });
      sendRecording(res, recording);
    }),
  );

  // Inbound call to QUALEVAL_AGENT_NUMBER. There is no per-visitor owner:
  // the number is shared. The Call SID is unguessable, and this route sits
  // behind the same requireVisitor gate as the rest of /v1/qualeval.
  router.get(
    "/production-calls/:callSid/audio",
    wrap(async (req, res) => {
      if (!TWILIO_CALL_SID.test(req.params.callSid)) {
        return res.status(400).json({ error: "invalid call sid" });
      }
      const call = await getProductionCallBySid(req.params.callSid);
      if (!call?.audioRef) return res.status(404).json({ error: "No recording for this call" });
      const recording = await getObjectByKey(productionCallAudioKey(req.params.callSid), req.headers.range);
      if (!recording) return res.status(404).json({ error: "Recording not found" });
      sendRecording(res, recording);
    }),
  );

  // Operator surface for QUALEVAL_AGENT_NUMBER's target agents
  // (server/qualeval/demoAgentConfig.js, catalog in demoAgentDefaults.js) -
  // list/edit their prompts and switch which one is currently active, backing
  // client/src/Settings.jsx. There's only one number, so "active" is a
  // runtime toggle rather than several simultaneous numbers. Operator-only:
  // switching affects every caller of the shared number.
  router.use("/demo-agent", requireOperator);
  router.get(
    "/demo-agent/variants",
    wrap(async (req, res) => {
      const [keys, activeKey] = await Promise.all([demoAgentConfig.listVariants(), demoAgentConfig.getActiveVariantKey()]);
      // Reads each variant's live prompt/greeting/voice straight off its
      // AssemblyAI agent record (getVariantWithAgent), not a local copy that
      // could drift once PATCH starts writing to AssemblyAI directly.
      const variants = await Promise.all(
        keys.map(async (v) => {
          const variant = await demoAgentConfig.getVariantWithAgent(v.key);
          const { domain, variant: kind, description } = findDemoAgent(v.key);
          return { ...variant, domain, domainLabel: DEMO_AGENT_DOMAINS[domain], kind, description };
        }),
      );
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
