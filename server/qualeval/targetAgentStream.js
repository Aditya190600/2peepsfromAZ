import { WebSocketServer } from "ws";
import { createBridgeSession } from "./bridgeSession.js";
import { mintAssemblyAiToken } from "./assemblyaiToken.js";
import * as demoAgentConfig from "./demoAgentConfig.js";

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
// itself picks up streamSid/callSid whenever "start" arrives.
export function attachTargetAgentStreamServer(
  httpServer,
  {
    mintToken = mintAssemblyAiToken,
    getActiveVariant = demoAgentConfig.getActiveVariant,
    createSession = createBridgeSession,
  } = {},
) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (twilioWs) => {
    function onFinished({ turns, callSid, reason }) {
      console.log(
        `QualEval target-agent bridge [${callSid ?? "no-call-sid"}]: call ended (${reason}) with ${turns.length} transcript turns`,
      );
    }
    function onError(message) {
      console.error(`QualEval target-agent bridge: ${message}`);
    }

    try {
      const [variant, token] = await Promise.all([getActiveVariant(), mintToken()]);
      console.log(`QualEval target-agent bridge: bridging as variant "${variant.key}" (agent ${variant.agentId})`);
      createSession({
        twilioWs,
        token,
        agentId: variant.agentId,
        // No swap needed on this side - see bridgeSession.js's header
        // comment for why the two directions map roles oppositely.
        transcriptUserRole: "user",
        transcriptAgentRole: "agent",
        onFinished,
        onError,
      });
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
