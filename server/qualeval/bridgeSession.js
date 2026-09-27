import WS from "ws";
import { peakPcmuAmplitude, SILENCE_AMPLITUDE_THRESHOLD } from "./pcmuAudio.js";

// Shared with server/qualeval/twilioStream.js so its call recorder
// (server/qualeval/callRecorder.js) preallocates to the same cap this bridge
// enforces via maxDurationTimer below.
export const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;
export const DEFAULT_SILENCE_TIMEOUT_MS = 30 * 1000;

// Lets the simulated caller hang up once the conversation is over, instead
// of both agents trading pleasantries until DEFAULT_MAX_DURATION_MS. A
// client-side function tool in AssemblyAI's flat schema
// (docs/voice-agents/voice-agent-api/tools/overview): AssemblyAI emits a
// tool.call and this bridge does the hangup itself - see the "tool.call"
// case below. The description is the model's only cue for when to call it,
// so it names both the trigger and the anti-triggers.
export const END_CALL_TOOL_NAME = "end_call";
export const END_CALL_TOOL = {
  type: "function",
  name: END_CALL_TOOL_NAME,
  description:
    "Hang up the phone call. Call this only once the conversation is over on both sides: you have said goodbye (or clearly said you need nothing more) AND the other party has said goodbye back or confirmed there is nothing more to discuss. Do not call it while the other party is still helping you, is in the middle of speaking, or has just asked you a question.",
  parameters: { type: "object", properties: {} },
};
// Upper bound on how long a requested hangup waits for the caller's final
// reply to finish and for Twilio to play it out (the "mark" echo below)
// before ending anyway, so a lost reply.done/mark can't hold the call open.
export const DEFAULT_HANGUP_TIMEOUT_MS = 15 * 1000;
const END_CALL_MARK = "end_call";

// Bridges one Twilio Media Streams WebSocket connection (already accepted -
// see server/qualeval/twilioStream.js) with a new server-side AssemblyAI
// Voice Agent session configured as the scenario's simulated caller.
// Conceptually the server-side twin of client/src/useVoiceAgent.js's
// connection setup, but for an outbound PSTN leg instead of browser mic
// capture, and audio flows both ways over raw WebSocket relays rather than
// Web Audio APIs.
//
// Both `input.format`/`output.format` are set to `audio/pcmu` (G.711 mu-law,
// 8 kHz) - Twilio Media Streams' native codec (see
// https://www.twilio.com/docs/voice/media-streams/websocket-messages) - so
// every media payload is relayed byte-for-byte between the two sockets with
// no resampling, per AssemblyAI's own telephony-encoding guidance (verified
// live 2026-09-24, docs/voice-agents/voice-agent-api/audio-format).
//
// Role mapping is configurable because this bridge is used on BOTH sides of
// a call now, and AssemblyAI's own user/agent naming means opposite things
// on each side:
//
// - Outbound/persona side (server/qualeval/twilioStream.js): this AssemblyAI
//   session plays the SIMULATED CALLER. AssemblyAI's `transcript.user` is the
//   transcription of the audio we fed it - the target agent's voice coming
//   over the phone - and `transcript.agent` is what AssemblyAI's own LLM said
//   (our simulated caller). QualEval's transcript shape reads the opposite
//   way round - "agent" is always the thing under test - so this side swaps:
//   transcriptUserRole="agent", transcriptAgentRole="user" (the defaults
//   below, unchanged from before this file supported both directions).
// - Inbound/target-agent side (server/qualeval/targetAgentStream.js): this
//   AssemblyAI session plays the TARGET AGENT under test. The audio we feed
//   it is the far end's voice (the simulated caller, coming over the phone),
//   so `transcript.user` (what we fed it) IS the caller and needs no swap;
//   `transcript.agent` (AssemblyAI's own LLM) IS the target agent and also
//   needs no swap. That side passes transcriptUserRole="user",
//   transcriptAgentRole="agent".
//
// Each leg of a QualEval-placed call hears the other leg over the real phone
// line: this session's reply.audio goes out on its own Twilio leg, Twilio
// carries it across the call, and the other leg's Media Stream delivers it
// as that leg's inbound "media". An earlier design ALSO cross-fed each
// session's synthesized speech straight into the other session's AssemblyAI
// input (a server-side "broker"), on the belief that Twilio did not carry
// audio between the two legs - that belief came from calls made while this
// file dropped every reply.audio chunk before Twilio's "start" event (the
// pendingReplyAudio bug below), so nothing ever reached the wire. Once that
// was fixed, both paths were live and each AssemblyAI session heard the
// other party twice - once early (as fast as it was synthesized) and once
// in real time over the phone - which, reproduced live 2026-09-27 against
// real calls, made the two agents talk over each other from the first
// seconds of every call and garbled every turn after. The phone line is
// the only audio path now, the same one a real external caller uses.
export function createBridgeSession({
  twilioWs,
  token,
  WebSocketImpl = WS,
  wsUrl = `wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`,
  systemPrompt,
  greeting,
  voice,
  // Binds a pre-configured AssemblyAI stored agent (server/qualeval/
  // demoAgentAgents.js) instead of inline session fields. Mutually
  // exclusive with systemPrompt/greeting/voice/input/output on the WS
  // session.update payload - AssemblyAI rejects a session.update carrying
  // both (docs/voice-agents/voice-agent-api/deploy) - so when agentId is
  // set, this bridge sends only `{agent_id}` and nothing else; the bound
  // agent's own stored input/output.format (set at creation time, see
  // server/qualeval/demoAgentDefaults.js) must already be audio/pcmu for a
  // Twilio bridge, since it can't be overridden per-connection this way.
  agentId,
  transcriptUserRole = "agent",
  transcriptAgentRole = "user",
  onReady,
  onFinished,
  onError,
  // Called with each raw base64 audio/pcmu chunk this bridge relays, plus
  // its tMs position on the call timeline (see callClockMs below - the same
  // clock as the transcript turns) - server/qualeval/twilioStream.js feeds
  // both into a server/qualeval/callRecorder.js instance to build the run's playable
  // call recording, since audio capture has to happen server-side here
  // (unlike the Try page's browser MediaRecorder).
  onIncomingAudio,
  onOutgoingAudio,
  // Live-listening taps (server/qualeval/liveCallHub.js): each transcript
  // turn as soon as it lands, and a barge-in "clear" of this session's own
  // outgoing audio (with the call-timeline tMs it took effect at). Observers
  // only - neither feeds anything back into a leg.
  onTurn,
  onOutgoingAudioCleared,
  // Registers END_CALL_TOOL on the session so this side's AssemblyAI agent
  // can hang up. Only the simulated-caller side (server/qualeval/
  // twilioStream.js) sets it; the target-agent side binds a stored agent
  // (agentId), which can't carry inline tools anyway.
  endCallTool = false,
  hangupTimeoutMs = DEFAULT_HANGUP_TIMEOUT_MS,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  silenceTimeoutMs = DEFAULT_SILENCE_TIMEOUT_MS,
  // Bounded grace window given to AssemblyAI to flush a final transcript/
  // session.ended after we've sent it session.end - see the "stop" case
  // below for why this exists at all.
  stopGraceMs = 2000,
}) {
  let startedAtMs = null;
  let streamSid = null;
  let callSid = null;
  let finished = false;
  let aaiReady = false;
  const turns = [];
  let maxDurationTimer = null;
  let stopGraceTimer = null;
  let silenceTimer = null;
  // End-of-conversation hangup (endCallTool): null, then "requested" once
  // the caller's agent calls END_CALL_TOOL, "playing" once that reply has
  // finished generating and we're waiting for Twilio to finish playing it
  // (the END_CALL_MARK echo), then "ending" once session.end is sent.
  let hangup = null;
  let hangupTimer = null;
  // AssemblyAI's session.ready/reply.audio and Twilio's Media Streams "start"
  // event arrive over two independent sockets with no ordering guarantee -
  // confirmed live 2026-09-26 against a real inbound call (Twilio Voice
  // Insights showed clean audio/zero packet loss on the wire but
  // "Silence Detected: true", while our own server logs for the same call
  // showed real transcript.agent content generated) - the greeting's
  // reply.audio chunks landed before Twilio's "start" set streamSid and were
  // silently dropped by the `if (streamSid && ...)` guard below. Buffer any
  // reply.audio payload that arrives before streamSid is known and flush it
  // once "start" sets it, mirroring the early-message buffering
  // server/qualeval/twilioStream.js already does for its own async lookups.
  const pendingReplyAudio = [];

  // Call timeline shared by the recorder/live-listening taps and the
  // transcript turns: milliseconds on Twilio's own Media Stream clock
  // (media.timestamp, 0 at stream start). Positioning audio by when a frame
  // happened to reach this process instead made a played-back recording
  // choppy - Twilio's 20 ms frames arrive with ~0.5 s of network jitter
  // (measured on a real call 2026-09-27), and frames replayed after the
  // twilioStream.js/targetAgentStream.js setup buffering all shared one
  // arrival time. The offset keeps the smallest arrival-minus-timestamp
  // seen, i.e. the least-delayed frame, so jitter and replays never drag
  // the clock backwards.
  let clockOffsetMs = null;
  function callClockMs() {
    if (clockOffsetMs !== null) return Math.max(0, Date.now() - clockOffsetMs);
    return startedAtMs ? Date.now() - startedAtMs : 0;
  }
  // Twilio sends media.timestamp as a string of milliseconds.
  function incomingFrameTimeMs(media) {
    const timestampMs = media?.timestamp == null ? NaN : Number(media.timestamp);
    if (!Number.isFinite(timestampMs)) return callClockMs();
    const offsetMs = Date.now() - timestampMs;
    if (clockOffsetMs === null || offsetMs < clockOffsetMs) clockOffsetMs = offsetMs;
    return timestampMs;
  }
  // Where Twilio will finish playing the outgoing audio sent so far. Twilio
  // plays our media frames back to back from its own buffer, and
  // AssemblyAI delivers reply.audio slightly faster than real time, so each
  // chunk is heard at max(now, end of the previous chunk), not when it
  // arrived here. A barge-in "clear" drops Twilio's unplayed buffer.
  let outgoingPlayoutEndMs = 0;

  const aaiWs = new WebSocketImpl(wsUrl);

  // Diagnostic-only tracing added while debugging real duration-0 outbound
  // calls (see AGENTS.md's Twilio call-bridge notes) - these lines are
  // intentionally kept since Twilio's own side reports failures via generic
  // error codes (e.g. 31921) with no payload, so this is the only visibility
  // into which leg closed first and why.
  function log(...args) {
    console.log(`QualEval bridge [${callSid ?? "no-call-sid"}]:`, ...args);
  }

  function addTurn(role, text) {
    const turn = { role, text: text ?? "", tMs: callClockMs() };
    turns.push(turn);
    onTurn?.({ ...turn });
  }

  function closeSockets() {
    try {
      aaiWs.close();
    } catch {
      // already closed
    }
    try {
      if (twilioWs.readyState === twilioWs.OPEN || twilioWs.readyState === twilioWs.CONNECTING) {
        twilioWs.close();
      }
    } catch {
      // already closed
    }
  }

  function finish(reason) {
    if (finished) return;
    finished = true;
    clearTimeout(maxDurationTimer);
    clearTimeout(stopGraceTimer);
    clearTimeout(silenceTimer);
    clearTimeout(hangupTimer);
    silenceTimer = null;
    closeSockets();
    onFinished?.({ turns: [...turns], callSid, reason });
  }

  function fail(message) {
    if (finished) return;
    finished = true;
    clearTimeout(maxDurationTimer);
    clearTimeout(stopGraceTimer);
    clearTimeout(silenceTimer);
    clearTimeout(hangupTimer);
    silenceTimer = null;
    closeSockets();
    onError?.(message);
  }

  function endForSilenceTimeout() {
    if (aaiReady && aaiWs.readyState === aaiWs.OPEN) {
      aaiWs.send(JSON.stringify({ type: "session.end" }));
      clearTimeout(stopGraceTimer);
      stopGraceTimer = setTimeout(() => finish("silence_timeout_grace"), stopGraceMs);
    } else {
      finish("silence_timeout");
    }
  }

  function resetSilenceTimer() {
    clearTimeout(silenceTimer);
    if (!silenceTimeoutMs || finished) return;
    silenceTimer = setTimeout(() => {
      silenceTimer = null;
      endForSilenceTimeout();
    }, silenceTimeoutMs);
  }

  function noteAudioActivity(base64Payload) {
    if (!base64Payload) return;
    if (peakPcmuAmplitude(base64Payload) >= SILENCE_AMPLITUDE_THRESHOLD) {
      resetSilenceTimer();
    }
  }

  function armSilenceWatchdog() {
    if (silenceTimer || !silenceTimeoutMs) return;
    resetSilenceTimer();
  }

  // Ends the call because the caller's agent decided the conversation is
  // over. Closing the Twilio Media Stream socket (finish -> closeSockets)
  // is what actually hangs up the phone: <Connect><Stream> returns once its
  // WebSocket closes and twilioVoice.js's TwiML has no further verbs, so
  // Twilio completes the call - and the far leg gets a normal "stop".
  function endCallNow() {
    if (finished || hangup === "ending") return;
    hangup = "ending";
    clearTimeout(hangupTimer);
    log("hanging up (end_call)");
    if (aaiReady && aaiWs.readyState === aaiWs.OPEN) {
      aaiWs.send(JSON.stringify({ type: "session.end" }));
      clearTimeout(stopGraceTimer);
      stopGraceTimer = setTimeout(() => finish("end_call"), stopGraceMs);
    } else {
      finish("end_call");
    }
  }

  function requestHangup() {
    if (finished || hangup) return;
    hangup = "requested";
    clearTimeout(hangupTimer);
    hangupTimer = setTimeout(endCallNow, hangupTimeoutMs);
  }

  // The reply that carried the end_call tool call finished generating. Its
  // goodbye audio may still be queued at Twilio (AssemblyAI streams replies
  // faster than real time), so ask Twilio to echo a mark once playback
  // reaches this point and hang up then, not now - otherwise the far end
  // hears the goodbye cut off mid-word.
  function hangUpAfterPlayout() {
    hangup = "playing";
    if (streamSid && twilioWs.readyState === twilioWs.OPEN) {
      twilioWs.send(JSON.stringify({ event: "mark", streamSid, mark: { name: END_CALL_MARK } }));
    } else {
      endCallNow();
    }
  }

  function armMaxDurationCap() {
    if (maxDurationTimer) return;
    maxDurationTimer = setTimeout(() => {
      if (aaiReady && aaiWs.readyState === aaiWs.OPEN) {
        aaiWs.send(JSON.stringify({ type: "session.end" }));
        clearTimeout(stopGraceTimer);
        stopGraceTimer = setTimeout(() => finish("max_duration_grace"), stopGraceMs);
      } else {
        finish("max_duration");
      }
    }, maxDurationMs);
  }

  aaiWs.on("open", () => {
    log("aai socket open");
    const session = agentId
      ? { agent_id: agentId }
      : {
          system_prompt: systemPrompt,
          ...(greeting ? { greeting } : {}),
          ...(endCallTool ? { tools: [END_CALL_TOOL] } : {}),
          input: { format: { encoding: "audio/pcmu" } },
          // `voice` is a plain string nested under `output` on the WS
          // session.update payload - NOT the top-level `{voice: {voice_id}}`
          // shape used by the separate REST /v1/agents "create agent"
          // endpoint. Verified live 2026-09-25 after `session.error: Invalid
          // message format for type 'session.update'` from using the wrong
          // shape here.
          output: { ...(voice ? { voice } : {}), format: { encoding: "audio/pcmu" } },
        };
    aaiWs.send(JSON.stringify({ type: "session.update", session }));
  });

  aaiWs.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type !== "reply.audio") log("aai message", msg.type);
    switch (msg.type) {
      case "session.ready":
        aaiReady = true;
        onReady?.();
        armMaxDurationCap();
        break;
      case "transcript.user":
        addTurn(transcriptUserRole, msg.text);
        break;
      case "transcript.agent":
        addTurn(transcriptAgentRole, msg.text);
        break;
      case "reply.audio":
        noteAudioActivity(msg.data);
        if (streamSid) {
          if (twilioWs.readyState === twilioWs.OPEN) {
            twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: msg.data } }));
          }
        } else {
          pendingReplyAudio.push(msg.data);
        }
        if (msg.data) {
          const playAtMs = Math.max(callClockMs(), outgoingPlayoutEndMs);
          // audio/pcmu: one byte per sample at 8 kHz.
          outgoingPlayoutEndMs = playAtMs + Buffer.from(msg.data, "base64").length / 8;
          onOutgoingAudio?.(msg.data, playAtMs);
        }
        break;
      case "tool.call":
        if (endCallTool && msg.name === END_CALL_TOOL_NAME) {
          log("aai requested end_call");
          requestHangup();
        }
        break;
      case "reply.done":
        log("aai reply.done status", msg.status);
        if (hangup === "requested") {
          // Interrupted means the far end started talking over the
          // goodbye, so the conversation isn't over after all - drop the
          // hangup (AssemblyAI's guidance is to discard a pending tool
          // result on an interrupted reply) and let the call continue.
          if (msg.status === "interrupted") {
            log("end_call cancelled - reply interrupted");
            hangup = null;
            clearTimeout(hangupTimer);
          } else {
            hangUpAfterPlayout();
          }
        }
        // Barge-in: the far end started talking over this agent, so
        // AssemblyAI cancelled the reply. Twilio has already buffered every
        // reply.audio chunk sent so far and keeps playing them unless told
        // otherwise, so without "clear" the caller keeps hearing the
        // cancelled reply over their own speech and the next one - per
        // AssemblyAI's own guidance to flush playback on an interrupted
        // reply (docs/voice-agents/voice-agent-api, "reply.done") and
        // Twilio's Media Streams "clear" message
        // (https://www.twilio.com/docs/voice/media-streams/websocket-messages).
        if (msg.status === "interrupted") {
          pendingReplyAudio.length = 0;
          if (streamSid && twilioWs.readyState === twilioWs.OPEN) {
            twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
          }
          const clearedAtMs = callClockMs();
          outgoingPlayoutEndMs = clearedAtMs;
          onOutgoingAudioCleared?.(clearedAtMs);
        }
        break;
      case "session.ended":
        finish(hangup === "ending" ? "end_call" : "session.ended");
        break;
      case "session.error":
        fail(`AssemblyAI session error: ${msg.error ?? msg.message ?? "unknown"}`);
        break;
      default:
        break;
    }
  });

  aaiWs.on("error", (err) => {
    log("aai socket error", err.message);
    fail(`AssemblyAI connection error: ${err.message}`);
  });
  aaiWs.on("close", (code, reason) => {
    log("aai socket close", code, reason?.toString());
    if (!finished) finish("aai_closed");
  });

  twilioWs.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.event !== "media") log("twilio event", msg.event);
    switch (msg.event) {
      case "start":
        streamSid = msg.start?.streamSid ?? msg.streamSid;
        callSid = msg.start?.callSid ?? null;
        startedAtMs = Date.now();
        armMaxDurationCap();
        armSilenceWatchdog();
        if (streamSid && twilioWs.readyState === twilioWs.OPEN) {
          for (const payload of pendingReplyAudio) {
            twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload } }));
          }
        }
        pendingReplyAudio.length = 0;
        break;
      case "mark":
        if (hangup === "playing" && msg.mark?.name === END_CALL_MARK) endCallNow();
        break;
      case "media":
        noteAudioActivity(msg.media?.payload);
        // Bidirectional streams only forward the "inbound" track (the far
        // end's voice) to us - our own outbound audio never echoes back.
        if (aaiReady && aaiWs.readyState === aaiWs.OPEN) {
          aaiWs.send(JSON.stringify({ type: "input.audio", audio: msg.media?.payload }));
        }
        onIncomingAudio?.(msg.media?.payload, incomingFrameTimeMs(msg.media));
        break;
      case "stop":
        if (aaiWs.readyState === aaiWs.OPEN) {
          aaiWs.send(JSON.stringify({ type: "session.end" }));
          // "stop" is a Media Stream *message*, delivered reliably like every
          // other message on this socket - unlike the raw "close"/"error"
          // socket events, it isn't subject to abnormal-closure races. Real
          // outbound calls showed Twilio tearing down its side of the stream
          // (often an abrupt 1005 close) immediately after "stop", before our
          // own session.end round-trip with AssemblyAI completes - sometimes
          // before AssemblyAI's session.ended is ever processed at all
          // (reproduced live 2026-09-25: a full multi-turn conversation whose
          // "stop" fired, then twilio closed at 1005, with AssemblyAI's own
          // session.ended arriving too late to matter). Previously this
          // handler did nothing further and relied entirely on one of the two
          // sockets' own close event to notice and call finish() - so a
          // missed/delayed close on either side left the run hung forever.
          // Treat "stop" itself as the authoritative end-of-call signal:
          // give AssemblyAI a short bounded window to flush anything final,
          // then finish regardless of what either socket does afterward.
          clearTimeout(stopGraceTimer);
          stopGraceTimer = setTimeout(() => finish("twilio_stop_grace"), stopGraceMs);
        } else {
          finish("twilio_stop");
        }
        break;
      default:
        break;
    }
  });

  twilioWs.on("close", (code, reason) => {
    log("twilio socket close", code, reason?.toString());
    if (!finished) finish("twilio_closed");
  });
  twilioWs.on("error", (err) => {
    log("twilio socket error", err.message);
    fail(`Twilio stream error: ${err.message}`);
  });

  return {
    stop: () => {
      if (twilioWs.readyState === twilioWs.OPEN) {
        try {
          twilioWs.send(JSON.stringify({ event: "stop" }));
        } catch {
          // ignore
        }
      }
      finish("manual_stop");
    },
  };
}
