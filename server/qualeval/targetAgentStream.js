import { WebSocketServer } from "ws";
import { createBridgeSession } from "./bridgeSession.js";
import { mintAssemblyAiToken } from "./assemblyaiToken.js";
import * as demoAgentConfig from "./demoAgentConfig.js";
import * as broker from "./callBridgeBroker.js";

const STREAM_PATH = "/v1/qualeval/target-agent-stream";

// Attaches the ws upgrade handler that receives Twilio's Media Streams
// connection for the TARGET-AGENT side of a call (server/qualeval/
// demoAgentVoice.js's <Connect><Stream>, answering QUALEVAL_AGENT_NUMBER).
// Sibling of server/qualeval/twilioStream.js's attachTwilioStreamServer for
// the outbound/persona side - both listen on the same raw http.Server's
// "upgrade" event, each on its own pathname, since Express has no WebSocket
// support.
//
// Unlike the persona side, this stream is not tied to a run: which system
// prompt to bridge with is a global runtime setting (server/qualeval/
// demoAgentConfig.js's active variant), not something carried on the call
// via a Custom Parameter, so there's no need to wait for the Media Streams
// "start" event before creating the bridge session - createBridgeSession
// itself picks up streamSid/callSid whenever "start" arrives, and buffers
// any reply.audio that AssemblyAI sends before "start" lands (confirmed
// live 2026-09-26: AssemblyAI's session.ready/reply.audio and Twilio's
// "start" arrive over two independent sockets with no ordering guarantee,
// and the greeting's audio was silently dropped when reply.audio won that
// race - see bridgeSession.js's pendingReplyAudio comment).
//
// The bridge session is created immediately regardless of whether this call
// turns out to be a QualEval-placed run or a real external caller, so a real
// caller's greeting is never delayed. Claiming a pending run for cross-wiring
// (server/qualeval/callBridgeBroker.js - see bridgeSession.js's header
// comment for why that's needed at all) happens concurrently and only wires
// in extra audio hand-off if/when it resolves.
export function attachTargetAgentStreamServer(
  httpServer,
  {
    mintToken = mintAssemblyAiToken,
    getActiveVariant = demoAgentConfig.getActiveVariant,
    createSession = createBridgeSession,
    waitForClaimableRun = broker.waitForClaimableRun,
    registerTargetLeg = broker.registerTargetLeg,
    releaseRun = broker.releaseRun,
    forwardToPersona = broker.forwardToPersona,
  } = {},
) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (twilioWs) => {
    let claimedRunId = null;
    let sessionFinished = false;

    function onFinished({ turns, callSid, reason }) {
      sessionFinished = true;
      console.log(
        `QualEval target-agent bridge [${callSid ?? "no-call-sid"}]: call ended (${reason}) with ${turns.length} transcript turns`,
      );
      if (claimedRunId) releaseRun(claimedRunId);
    }
    function onError(message) {
      sessionFinished = true;
      console.error(`QualEval target-agent bridge: ${message}`);
      if (claimedRunId) releaseRun(claimedRunId);
    }

    try {
      const [variant, token] = await Promise.all([getActiveVariant(), mintToken()]);
      console.log(`QualEval target-agent bridge: bridging as variant "${variant.key}" (agent ${variant.agentId})`);
      const session = createSession({
        twilioWs,
        token,
        agentId: variant.agentId,
        // No swap needed on this side - see bridgeSession.js's header
        // comment for why the two directions map roles oppositely.
        transcriptUserRole: "user",
        transcriptAgentRole: "agent",
        onReplyAudio: (audio) => {
          if (claimedRunId) forwardToPersona(claimedRunId, audio);
        },
        onFinished,
        onError,
      });

      const runId = await waitForClaimableRun();
      if (runId && !sessionFinished) {
        claimedRunId = runId;
        registerTargetLeg(runId, session.injectAudio);
        console.log(`QualEval target-agent bridge: cross-wired to persona leg for run ${runId}`);
      } else if (runId) {
        // The session already ended while we were still waiting to claim -
        // release immediately so this run's entry doesn't leak.
        releaseRun(runId);
      }
    } catch (err) {
      console.error(`QualEval target-agent bridge: setup failed: ${err.message}`);
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
