import WS from "ws";

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
// Role mapping is intentionally swapped from AssemblyAI's own naming:
// AssemblyAI's `transcript.user` is the transcription of the audio we fed it
// (the target agent's voice coming over the phone), and `transcript.agent`
// is what AssemblyAI's own LLM said (our simulated caller). QualEval's
// transcript shape reads naturally the opposite way round - "agent" is
// always the thing under test - so this module swaps them when building
// `turns`.
export function createBridgeSession({
  twilioWs,
  token,
  WebSocketImpl = WS,
  wsUrl = `wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`,
  systemPrompt,
  onReady,
  onFinished,
  onError,
  maxDurationMs = 5 * 60 * 1000,
}) {
  let startedAtMs = null;
  let streamSid = null;
  let callSid = null;
  let finished = false;
  let aaiReady = false;
  const turns = [];
  let maxDurationTimer = null;

  const aaiWs = new WebSocketImpl(wsUrl);

  function finish(reason) {
    if (finished) return;
    finished = true;
    clearTimeout(maxDurationTimer);
    try {
      aaiWs.close();
    } catch {
      // already closed
    }
    onFinished?.({ turns: [...turns], callSid, reason });
  }

  function fail(message) {
    if (finished) return;
    finished = true;
    clearTimeout(maxDurationTimer);
    try {
      aaiWs.close();
    } catch {
      // already closed
    }
    onError?.(message);
  }

  aaiWs.on("open", () => {
    aaiWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          system_prompt: systemPrompt,
          input: { format: { encoding: "audio/pcmu" } },
          output: { format: { encoding: "audio/pcmu" } },
        },
      }),
    );
  });

  aaiWs.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case "session.ready":
        aaiReady = true;
        onReady?.();
        maxDurationTimer = setTimeout(() => {
          aaiWs.send(JSON.stringify({ type: "session.end" }));
        }, maxDurationMs);
        break;
      case "transcript.user":
        // The far end (target agent under test) - see role-swap note above.
        turns.push({ role: "agent", text: msg.text ?? "", tMs: startedAtMs ? Date.now() - startedAtMs : 0 });
        break;
      case "transcript.agent":
        // Our simulated caller - see role-swap note above.
        turns.push({ role: "user", text: msg.text ?? "", tMs: startedAtMs ? Date.now() - startedAtMs : 0 });
        break;
      case "reply.audio":
        if (streamSid && twilioWs.readyState === twilioWs.OPEN) {
          twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: msg.data } }));
        }
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

  aaiWs.on("error", (err) => fail(`AssemblyAI connection error: ${err.message}`));
  aaiWs.on("close", () => {
    if (!finished) finish("aai_closed");
  });

  twilioWs.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (msg.event) {
      case "start":
        streamSid = msg.start?.streamSid ?? msg.streamSid;
        callSid = msg.start?.callSid ?? null;
        startedAtMs = Date.now();
        break;
      case "media":
        // Bidirectional streams only forward the "inbound" track (the far
        // end's voice) to us - our own outbound audio never echoes back.
        if (aaiReady && aaiWs.readyState === aaiWs.OPEN) {
          aaiWs.send(JSON.stringify({ type: "input.audio", audio: msg.media?.payload }));
        }
        break;
      case "stop":
        if (aaiWs.readyState === aaiWs.OPEN) {
          aaiWs.send(JSON.stringify({ type: "session.end" }));
        } else {
          finish("twilio_stop");
        }
        break;
      default:
        break;
    }
  });

  twilioWs.on("close", () => {
    if (!finished) finish("twilio_closed");
  });
  twilioWs.on("error", (err) => fail(`Twilio stream error: ${err.message}`));

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
