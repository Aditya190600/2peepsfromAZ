import { WebSocketServer } from "ws";
import { createBridgeSession, DEFAULT_MAX_DURATION_MS } from "./bridgeSession.js";
import { createCallRecorder, qualevalCallAudioKey } from "./callRecorder.js";
import { transcribeCallRecording } from "./callTranscription.js";
import { buildCallerSystemPrompt } from "./callerPrompt.js";
import { mintAssemblyAiToken } from "./assemblyaiToken.js";
import * as store from "./store.js";
import { dispatchEvaluation } from "./router.js";
import * as broker from "./callBridgeBroker.js";
import * as liveCallHub from "./liveCallHub.js";
import { finishProductionCall } from "./productionCalls.js";
import { recordingsConfigured, uploadObject } from "../recordingsStore.js";

const STREAM_PATH = "/v1/qualeval/twilio-stream";

// How the simulated caller takes turns (AssemblyAI session.input.
// turn_detection, docs/voice-agents/voice-agent-api/turn-detection-and-
// interruptions). With AssemblyAI's adaptive defaults it ended the target
// agent's turn at the ~0.5-0.9 s pause between two of its sentences - e.g.
// after "You are speaking with an AI assistant." and before "Can I get your
// name to get started?" - and answered straight over the rest. Each such
// collision left both sides with a stale reply in flight, so the call kept
// talking over itself after that (reproduced on real calls 2026-09-27 with
// Twilio dual-channel recordings). min_silence makes the caller wait out a
// pause that long before its turn, and interruption_delay 0 has it stop as
// soon as the agent talks over it, the way a polite caller yields.
export const CALLER_TURN_DETECTION = { min_silence: 1200, interruption_delay: 0 };

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
    finishCall = finishProductionCall,
    transcribeCall = (recorder, roles) =>
      transcribeCallRecording(recorder, { apiKey: process.env.ASSEMBLYAI_API_KEY, ...roles }),
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

    const recorder = createCallRecorder(DEFAULT_MAX_DURATION_MS);

    async function saveRecording() {
      if (!recordingsConfigured() || !recorder.hasAudio()) return;
      try {
        await uploadObject(
          qualevalCallAudioKey(runId),
          recorder.toStereoWavBuffer({ userTrackName: "outgoing", agentTrackName: "incoming" }),
          "audio/wav",
        );
        await store.attachAudioRef(runId, `/v1/qualeval/runs/${encodeURIComponent(runId)}/audio`);
      } catch (err) {
        console.error(`QualEval call bridge: recording upload failed for run ${runId}: ${err.message}`);
      }
    }

    // The run is judged on what the call recording says each side said
    // (server/qualeval/callTranscription.js explains why the live session's
    // own transcript can't be trusted where the two parties overlapped). The
    // live turns stay the fallback if there is no recording or it can't be
    // transcribed.
    async function transcriptOf(liveTurns) {
      if (!recorder.hasAudio()) return liveTurns;
      try {
        return await transcribeCall(recorder, { incomingRole: "agent", outgoingRole: "user" });
      } catch (err) {
        console.error(`QualEval call bridge: transcribing the recording failed for run ${runId}: ${err.message}`);
        return liveTurns;
      }
    }

    async function onFinished({ turns: liveTurns, callSid, reason }) {
      broker.releaseRun(runId);
      liveCallHub.endCall(runId);
      const turns = await transcriptOf(liveTurns);
      await finishCall({
        twilioCallSid: callSid,
        direction: "outbound",
        transcript: turns,
        endReason: reason,
      }).catch((err) => {
        console.error(`QualEval call bridge: failed to finish production call: ${err.message}`);
      });
      if (turns.length === 0) {
        console.error(`QualEval call bridge: run ${runId} ended (${reason}) with no transcript turns`);
        await markRunError(runId, `Call ended (${reason}) before any speech was captured.`).catch(() => {});
        return;
      }
      try {
        await markRunAwaitingEvaluation(runId, { turns });
        await saveRecording();
        try {
          await dispatch(runId);
          console.log(
            `QualEval call bridge: run ${runId} ended (${reason}) with ${turns.length} transcript turns - evaluated`,
          );
        } catch (evalErr) {
          console.error(`QualEval call bridge: evaluation failed for run ${runId}: ${evalErr.message}`);
          await markRunError(runId, `Evaluation failed: ${evalErr.message}`).catch(() => {});
        }
      } catch (err) {
        console.error(`QualEval call bridge: post-call processing failed for run ${runId}: ${err.message}`);
        await markRunError(runId, `Post-call processing failed: ${err.message}`).catch(() => {});
      }
    }

    async function onError(message) {
      broker.releaseRun(runId);
      liveCallHub.endCall(runId);
      console.error(`QualEval call bridge: run ${runId} failed: ${message}`);
      await markRunError(runId, message).catch(() => {});
    }

    if (!runId) {
      twilioWs.off("message", bufferMessage);
      twilioWs.close(1008, "missing runId");
      return;
    }

    // Register immediately so the target-agent leg's waitForClaimableRun finds
    // this run while getRun/scenario/token lookups run below (server/qualeval/
    // callBridgeBroker.js - it links that leg's production-call record to
    // this run; no audio passes through it).
    broker.registerPersonaLeg(runId);

    try {
      const run = await getRun(runId, null);
      if (!run) throw new Error("Run not found");
      const scenario = await getScenario(run.scenarioId, null);
      if (!scenario) throw new Error("Scenario not found for run");
      const token = await mintToken();
      liveCallHub.startCall(runId);
      console.log(`QualEval call bridge: run ${runId} - AssemblyAI token minted, opening bridge session`);

      twilioWs.off("message", bufferMessage);
      createSession({
        twilioWs,
        token,
        systemPrompt: buildCallerSystemPrompt(scenario),
        // Our simulated caller hangs up once both sides have wrapped up,
        // instead of every run holding the line to the max-duration cap.
        endCallTool: true,
        turnDetection: CALLER_TURN_DETECTION,
        // This leg carries both sides of the call: incoming is the target
        // agent over the phone, outgoing is our simulated caller. Each frame
        // goes to the recorder and to any live listener (liveCallHub.js).
        onIncomingAudio: (audio, tMs) => {
          recorder.addIncomingFrame(audio, tMs);
          liveCallHub.publishAudio(runId, "agent", audio, tMs);
        },
        onOutgoingAudio: (audio, tMs) => {
          recorder.addOutgoingFrame(audio, tMs);
          liveCallHub.publishAudio(runId, "caller", audio, tMs);
        },
        onOutgoingAudioCleared: (tMs) => {
          recorder.clearOutgoingFrom(tMs);
          liveCallHub.publishClear(runId, "caller");
        },
        onTurn: (turn) => liveCallHub.publishTurn(runId, turn),
        onFinished,
        onError,
      });
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
