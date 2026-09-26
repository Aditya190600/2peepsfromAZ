import WS from "ws";

// Shared with server/qualeval/twilioStream.js so its call recorder
// (server/qualeval/callRecorder.js) preallocates to the same cap this bridge
// enforces via maxDurationTimer below.
export const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;

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
// `onReplyAudio`/`injectAudio` exist because Twilio does NOT bridge real
// audio between the persona leg and the target-agent leg of a QualEval-
// placed call: each leg's own standalone `<Connect><Stream>` (twilioVoice.js
// and demoAgentVoice.js respectively) hijacks THAT leg's own audio path into
// its own AssemblyAI session, so the two real phone legs never actually
// carry each other's voice (verified live 2026-09-25 - steady real media
// flow on both legs, zero cross-talk ever transcribed). server/qualeval/
// callBridgeBroker.js cross-wires the two bridgeSession instances for one
// call server-side instead: each side's `onReplyAudio` callback hands its
// own synthesized speech to the broker, which calls the OTHER side's
// `injectAudio` to feed it in as if it arrived over the phone. Both legs are
// still real Twilio calls carrying real Media Streams - only the "who hears
// whom" wiring moved from Twilio's native call bridge (which doesn't apply
// here) to our own server code.
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
  // Called with each base64 audio/pcmu chunk this session's AssemblyAI
  // agent speaks, in addition to the existing relay to this session's own
  // Twilio leg - see the header comment above.
  onReplyAudio,
  // Called with each raw base64 audio/pcmu chunk this bridge relays, plus
  // its tMs offset since call start (same clock as the transcript turns
  // above) - server/qualeval/twilioStream.js feeds both into a
  // server/qualeval/callRecorder.js instance to build the run's playable
  // call recording, since audio capture has to happen server-side here
  // (unlike the Try page's browser MediaRecorder).
  onIncomingAudio,
  onOutgoingAudio,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
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

  const aaiWs = new WebSocketImpl(wsUrl);

  // Diagnostic-only tracing added while debugging real duration-0 outbound
  // calls (see AGENTS.md's Twilio call-bridge notes) - these lines are
  // intentionally kept since Twilio's own side reports failures via generic
  // error codes (e.g. 31921) with no payload, so this is the only visibility
  // into which leg closed first and why.
  function log(...args) {
    console.log(`QualEval bridge [${callSid ?? "no-call-sid"}]:`, ...args);
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
    closeSockets();
    onFinished?.({ turns: [...turns], callSid, reason });
  }

  function fail(message) {
    if (finished) return;
    finished = true;
    clearTimeout(maxDurationTimer);
    clearTimeout(stopGraceTimer);
    closeSockets();
    onError?.(message);
  }

  aaiWs.on("open", () => {
    log("aai socket open");
    const session = agentId
      ? { agent_id: agentId }
      : {
          system_prompt: systemPrompt,
          ...(greeting ? { greeting } : {}),
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
        maxDurationTimer = setTimeout(() => {
          aaiWs.send(JSON.stringify({ type: "session.end" }));
        }, maxDurationMs);
        break;
      case "transcript.user":
        turns.push({ role: transcriptUserRole, text: msg.text ?? "", tMs: startedAtMs ? Date.now() - startedAtMs : 0 });
        break;
      case "transcript.agent":
        turns.push({ role: transcriptAgentRole, text: msg.text ?? "", tMs: startedAtMs ? Date.now() - startedAtMs : 0 });
        break;
      case "reply.audio":
        if (streamSid) {
          if (twilioWs.readyState === twilioWs.OPEN) {
            twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: msg.data } }));
          }
        } else {
          pendingReplyAudio.push(msg.data);
        }
        onReplyAudio?.(msg.data);
        onOutgoingAudio?.(msg.data, startedAtMs ? Date.now() - startedAtMs : 0);
        break;
      case "session.ended":
        finish("session.ended");
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
        if (streamSid && twilioWs.readyState === twilioWs.OPEN) {
          for (const payload of pendingReplyAudio) {
            twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload } }));
          }
        }
        pendingReplyAudio.length = 0;
        break;
      case "media":
        // Bidirectional streams only forward the "inbound" track (the far
        // end's voice) to us - our own outbound audio never echoes back.
        if (aaiReady && aaiWs.readyState === aaiWs.OPEN) {
          aaiWs.send(JSON.stringify({ type: "input.audio", audio: msg.media?.payload }));
        }
        onIncomingAudio?.(msg.media?.payload, startedAtMs ? Date.now() - startedAtMs : 0);
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
    // Feeds a base64 audio/pcmu chunk into THIS session's AssemblyAI agent
    // as if it arrived over the phone - the cross-wiring half of
    // onReplyAudio, called by server/qualeval/callBridgeBroker.js with the
    // OTHER leg's synthesized speech. Silently dropped before session.ready,
    // same gating as real Twilio media (see the "media" case above).
    injectAudio: (audio) => {
      if (aaiReady && aaiWs.readyState === aaiWs.OPEN) {
        aaiWs.send(JSON.stringify({ type: "input.audio", audio }));
      }
    },
  };
}
