import { WebSocketServer } from "ws";
import { createBridgeSession } from "./bridgeSession.js";
import { buildCallerSystemPrompt } from "./callerPrompt.js";
import { mintAssemblyAiToken } from "./assemblyaiToken.js";
import * as store from "./store.js";
import { dispatchEvaluation } from "./router.js";
import * as broker from "./callBridgeBroker.js";

const STREAM_PATH = "/v1/qualeval/twilio-stream";

// Attaches the ws upgrade handler that receives Twilio's Media Streams
// connection (server/qualeval/twilioVoice.js's <Connect><Stream> target) to
// an existing http.Server. Express itself has no WebSocket support, so this
// listens on the raw server's "upgrade" event alongside Express - the same
// approach Twilio's own Node Media Streams examples use.
export function attachTwilioStreamServer(
  httpServer,
  {
    mintToken = mintAssemblyAiToken,
    getRun = store.getRun,
    getScenario = store.getScenario,
    markRunAwaitingEvaluation = store.markRunAwaitingEvaluation,
    markRunError = store.markRunError,
    dispatch = dispatchEvaluation,
    createSession = createBridgeSession,
  } = {},
) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (twilioWs, req) => {
    // Twilio's <Stream url> never carries a query string (confirmed live
    // 2026-09-24: Twilio strips it before connecting, and Twilio's own docs
    // say as much - https://www.twilio.com/docs/voice/twiml/stream#custom-parameters
    // says the `url` "does not support query string parameters"). The runId
    // is only knowable once the Media Streams "start" event arrives, via
    // start.customParameters.runId (set by server/qualeval/twilioVoice.js's
    // <Parameter>) - so every message before that is buffered here and
    // replayed once createBridgeSession's own listener takes over, instead
    // of being lost during the async run/scenario/token lookup below.
    const buffered = [];
    function bufferMessage(raw) {
      buffered.push(raw);
    }
    twilioWs.on("message", bufferMessage);

    function waitForStart() {
      return new Promise((resolve, reject) => {
        function onClose() {
          twilioWs.off("message", onMessage);
          reject(new Error("Twilio closed the stream before a start event arrived"));
        }
        function onMessage(raw) {
          let msg;
          try {
            msg = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (msg.event === "start") {
            twilioWs.off("message", onMessage);
            twilioWs.off("close", onClose);
            resolve(msg);
          }
        }
        twilioWs.on("message", onMessage);
        twilioWs.once("close", onClose);
      });
    }

    let startMsg;
    try {
      startMsg = await waitForStart();
    } catch (err) {
      twilioWs.off("message", bufferMessage);
      console.error(`QualEval call bridge: ${err.message}`);
      return;
    }

    const runId = startMsg.start?.customParameters?.runId ?? null;
    console.log(`QualEval call bridge: twilio-stream start event received for run ${runId}`);

    async function onFinished({ turns, reason }) {
      broker.releaseRun(runId);
      if (turns.length === 0) {
        console.error(`QualEval call bridge: run ${runId} ended (${reason}) with no transcript turns`);
        await markRunError(runId, `Call ended (${reason}) before any speech was captured.`).catch(() => {});
        return;
      }
      try {
        await markRunAwaitingEvaluation(runId, { turns });
        await dispatch(runId);
      } catch (err) {
        console.error(`QualEval call bridge: post-call processing failed for run ${runId}: ${err.message}`);
      }
    }

    async function onError(message) {
      broker.releaseRun(runId);
      console.error(`QualEval call bridge: run ${runId} failed: ${message}`);
      await markRunError(runId, message).catch(() => {});
    }

    if (!runId) {
      twilioWs.off("message", bufferMessage);
      twilioWs.close(1008, "missing runId");
      return;
    }

    try {
      const run = await getRun(runId, null);
      if (!run) throw new Error("Run not found");
      const scenario = await getScenario(run.scenarioId, null);
      if (!scenario) throw new Error("Scenario not found for run");
      const token = await mintToken();
      console.log(`QualEval call bridge: run ${runId} - AssemblyAI token minted, opening bridge session`);

      twilioWs.off("message", bufferMessage);
      const session = createSession({
        twilioWs,
        token,
        systemPrompt: buildCallerSystemPrompt(scenario),
        onReplyAudio: (audio) => broker.forwardToTarget(runId, audio),
        onFinished,
        onError,
      });
      // Registered as soon as the bridge session exists (not waiting on
      // session.ready) so the target-agent side's claim (server/qualeval/
      // callBridgeBroker.js's waitForClaimableRun, polling for up to ~2.5s)
      // finds this run as early as possible - see bridgeSession.js's header
      // comment for why this cross-wiring exists at all.
      broker.registerPersonaLeg(runId, session.injectAudio);
      // Replay the start event (so createBridgeSession learns streamSid/
      // callSid) plus any media that arrived during the lookups above.
      for (const raw of buffered) twilioWs.emit("message", raw);
    } catch (err) {
      twilioWs.off("message", bufferMessage);
      await onError(err.message);
      try {
        twilioWs.close();
      } catch {
        // already closed
      }
    }
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname !== STREAM_PATH) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  return wss;
}
