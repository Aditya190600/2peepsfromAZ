import { WebSocketServer } from "ws";
import {
  createBridgeSession,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_SILENCE_TIMEOUT_MS,
} from "./bridgeSession.js";
import { createCallRecorder, productionCallAudioKey } from "./callRecorder.js";
import { mintAssemblyAiToken } from "./assemblyaiToken.js";
import * as demoAgentConfig from "./demoAgentConfig.js";
import * as broker from "./callBridgeBroker.js";
import { finishProductionCall } from "./productionCalls.js";
import { analyzeFinishedCall } from "./postCallAnalysis.js";
import { recordingsConfigured, uploadObject } from "../recordingsStore.js";

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
// any reply.audio that AssemblyAI sends before "start" lands (see
// bridgeSession.js's pendingReplyAudio comment).
//
// Twilio sends "connected" and "start" the instant its socket opens, while
// this handler is still awaiting the variant lookup and token mint below -
// before createBridgeSession has attached its own "message" listener. Every
// message is buffered from the moment the socket connects and replayed once
// the session exists, same as twilioStream.js. Without this (confirmed from
// production logs 2026-09-25: every inbound call's bridge log stayed
// "[no-call-sid]" through hangup and "twilio event start" was never logged),
// "start" was lost, streamSid was never learned, and every reply.audio chunk
// sat in pendingReplyAudio forever - real callers heard only silence even
// though AssemblyAI heard them and replied.
//
// The bridge session is created immediately regardless of whether this call
// turns out to be a QualEval-placed run or a real external caller, so a real
// caller's greeting is never delayed. Claiming a pending QualEval run
// (server/qualeval/callBridgeBroker.js) happens concurrently and only links
// this call's production-call record and evaluation to that run - audio
// always travels over the phone line itself.
export function attachTargetAgentStreamServer(
  httpServer,
  {
    mintToken = mintAssemblyAiToken,
    getActiveVariant = demoAgentConfig.getActiveVariant,
    createSession = createBridgeSession,
    waitForClaimableRun = broker.waitForClaimableRun,
    releaseRun = broker.releaseRun,
    finishCall = finishProductionCall,
    analyzeCall = analyzeFinishedCall,
    createRecorder = () => createCallRecorder(DEFAULT_MAX_DURATION_MS),
    recordingsReady = recordingsConfigured,
    uploadRecording = uploadObject,
  } = {},
) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (twilioWs) => {
    let claimedRunId = null;
    let sessionFinished = false;
    let activeVariant = null;
    const recorder = createRecorder();

    const buffered = [];
    function bufferMessage(raw) {
      buffered.push(raw);
    }
    twilioWs.on("message", bufferMessage);

    function onFinished({ turns, callSid, reason }) {
      sessionFinished = true;
      console.log(
        `QualEval target-agent bridge [${callSid ?? "no-call-sid"}]: call ended (${reason}) with ${turns.length} transcript turns`,
      );
      const pending = saveInboundRecording({ turns, callSid, reason }).catch((err) => {
        console.error(`QualEval target-agent bridge: failed to finish production call: ${err.message}`);
      });
      if (claimedRunId) releaseRun(claimedRunId);
      return pending;
    }

    async function saveInboundRecording({ turns, callSid, reason }) {
      let audioRef = null;
      if (callSid && recordingsReady() && recorder.hasAudio()) {
        try {
          await uploadRecording(productionCallAudioKey(callSid), recorder.toStereoWavBuffer(), "audio/wav");
          audioRef = `/v1/qualeval/production-calls/${encodeURIComponent(callSid)}/audio`;
        } catch (err) {
          console.error(`QualEval target-agent bridge: inbound recording upload failed for ${callSid}: ${err.message}`);
        }
      }
      const finished = await finishCall({
        twilioCallSid: callSid,
        direction: "inbound",
        transcript: turns,
        endReason: reason,
        variantKey: activeVariant?.key ?? null,
        agentId: activeVariant?.agentId ?? null,
        audioRef,
        qualevalRunId: claimedRunId,
      });
      await analyzeCall({
        twilioCallSid: callSid,
        variantKey: activeVariant?.key ?? null,
        transcript: turns,
        qualevalRunId: claimedRunId,
        fromNumber: finished?.fromNumber ?? null,
        startedAt: finished?.startedAt ?? null,
      });
    }
    function onError(message) {
      sessionFinished = true;
      console.error(`QualEval target-agent bridge: ${message}`);
      if (claimedRunId) releaseRun(claimedRunId);
    }

    try {
      const [variant, token] = await Promise.all([getActiveVariant(), mintToken()]);
      activeVariant = variant;
      if (twilioWs.readyState !== twilioWs.OPEN) {
        // Caller hung up during setup - don't open an AssemblyAI session
        // nothing will ever close.
        twilioWs.off("message", bufferMessage);
        console.log("QualEval target-agent bridge: Twilio stream closed before setup finished");
        return;
      }
      twilioWs.off("message", bufferMessage);
      console.log(`QualEval target-agent bridge: bridging as variant "${variant.key}" (agent ${variant.agentId})`);
      createSession({
        twilioWs,
        token,
        agentId: variant.agentId,
        // Same backstops as the outbound persona leg (twilioStream.js): a
        // stored agent can't carry inline end_call tools, so silence and the
        // max-duration cap are what hang up inbound Phone Evals calls.
        maxDurationMs: DEFAULT_MAX_DURATION_MS,
        silenceTimeoutMs: DEFAULT_SILENCE_TIMEOUT_MS,
        // No swap needed on this side - see bridgeSession.js's header
        // comment for why the two directions map roles oppositely.
        transcriptUserRole: "user",
        transcriptAgentRole: "agent",
        onIncomingAudio: (audio, tMs) => recorder.addIncomingFrame(audio, tMs),
        onOutgoingAudio: (audio, tMs) => recorder.addOutgoingFrame(audio, tMs),
        onOutgoingAudioCleared: (tMs) => recorder.clearOutgoingFrom(tMs),
        onFinished,
        onError,
      });
      // Replay "connected"/"start" (so the session learns streamSid/callSid)
      // plus any caller media that arrived during setup.
      for (const raw of buffered) twilioWs.emit("message", raw);
      buffered.length = 0;

      const runId = await waitForClaimableRun();
      if (runId && !sessionFinished) {
        claimedRunId = runId;
        console.log(`QualEval target-agent bridge: linked to QualEval run ${runId}`);
      } else if (runId) {
        // The session already ended while we were still waiting to claim -
        // release immediately so this run's entry doesn't leak.
        releaseRun(runId);
      }
    } catch (err) {
      twilioWs.off("message", bufferMessage);
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
