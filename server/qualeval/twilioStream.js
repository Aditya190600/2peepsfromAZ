import { WebSocketServer } from "ws";
import { createBridgeSession } from "./bridgeSession.js";
import { buildCallerSystemPrompt } from "./callerPrompt.js";
import { mintAssemblyAiToken } from "./assemblyaiToken.js";
import * as store from "./store.js";
import { dispatchEvaluation } from "./router.js";

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
  } = {},
) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (twilioWs, req) => {
    const url = new URL(req.url, "http://localhost");
    const runId = url.searchParams.get("runId");

    async function onFinished({ turns, reason }) {
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
      console.error(`QualEval call bridge: run ${runId} failed: ${message}`);
      await markRunError(runId, message).catch(() => {});
    }

    if (!runId) {
      twilioWs.close(1008, "missing runId");
      return;
    }

    try {
      const run = await getRun(runId, null);
      if (!run) throw new Error("Run not found");
      const scenario = await getScenario(run.scenarioId, null);
      if (!scenario) throw new Error("Scenario not found for run");
      const token = await mintToken();

      createBridgeSession({
        twilioWs,
        token,
        systemPrompt: buildCallerSystemPrompt(scenario),
        onFinished,
        onError,
      });
    } catch (err) {
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
