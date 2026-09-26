import { useCallback, useRef, useState } from "react";
import { PERSONAS, resolvePersonaCallConfig } from "./personas";

const SAMPLE_RATE = 24000;

// Below this peak amplitude (int16 scale) a chunk is treated as silence for the
// mic-liveness check - not a VAD, just "is the input device producing any signal at all".
const SILENCE_AMPLITUDE_THRESHOLD = 200;
// How long the mic can stay silent before we warn the user their input device may be
// muted/misconfigured. Well above normal conversational gaps (agent reply playback +
// the caller's think time before responding) so it doesn't fire during a real call -
// only when the input device is truly producing nothing.
const SILENCE_WARNING_MS = 15000;

const KEYTERMS = [];

export function useVoiceAgent() {
  const [status, setStatus] = useState("idle"); // idle | connecting | ready | error
  const [transcript, setTranscript] = useState([]); // {role, text}[]
  const [lastSession, setLastSession] = useState(null); // completed session log, ready to analyze
  const [micSilent, setMicSilent] = useState(false);
  // Server-provided reason for a connect failure - e.g. a misconfigured
  // voice provider (server/providers/voiceStub.js). Falls back to the
  // generic "check your API key" copy when unset.
  const [connectError, setConnectError] = useState(null);
  // Recorded copy of the call (mic + agent reply), opt-in via the record
  // checkbox - null unless recordCall was true for the last connect().
  const [recordedBlob, setRecordedBlob] = useState(null);

  const wsRef = useRef(null);
  const audioCtxInRef = useRef(null);
  const audioCtxOutRef = useRef(null);
  const workletNodeRef = useRef(null);
  const micStreamRef = useRef(null);
  const nextPlaybackTimeRef = useRef(0);
  const pendingSourcesRef = useRef([]);
  const sessionRef = useRef(null); // {sessionId, startedAt, consentEvent, turns}
  const lastAudibleAtRef = useRef(0);
  const silenceCheckIntervalRef = useRef(null);
  const recordCallRef = useRef(false);
  // Single MediaStreamAudioDestinationNode, in the output AudioContext, that both
  // the mic and the agent-reply audio are mixed into - see startRecorder's comment
  // for why this can't be two destination nodes combined at the MediaRecorder level.
  const recordDestRef = useRef(null);
  const recordMicSourceRef = useRef(null); // mic stream re-tapped into the output context for mixing
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const appendTranscript = useCallback((role, text) => {
    setTranscript((prev) => [...prev, { role, text }]);
    const session = sessionRef.current;
    if (session) {
      session.turns.push({ role, text, tMs: Date.now() - session.startedAtMs });
    }
  }, []);

  const flushPlayback = useCallback(() => {
    for (const src of pendingSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    pendingSourcesRef.current = [];
    nextPlaybackTimeRef.current = audioCtxOutRef.current?.currentTime ?? 0;
  }, []);

  const playReplyAudio = useCallback((base64Pcm16) => {
    const ctx = audioCtxOutRef.current;
    if (!ctx) return;

    const raw = atob(base64Pcm16);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    if (recordDestRef.current) source.connect(recordDestRef.current);

    // Schedule back-to-back against context time (no sleep-based timing) so the
    // browser's own audio buffer absorbs network jitter between chunks.
    const startAt = Math.max(nextPlaybackTimeRef.current, ctx.currentTime);
    source.start(startAt);
    nextPlaybackTimeRef.current = startAt + buffer.duration;

    pendingSourcesRef.current.push(source);
    source.onended = () => {
      pendingSourcesRef.current = pendingSourcesRef.current.filter((s) => s !== source);
    };
  }, []);

  const connect = useCallback(
    async (persona = PERSONAS[0], seedViolation = false, recordCall = false) => {
      setStatus("connecting");
      setTranscript([]);
      setLastSession(null);
      setConnectError(null);
      setRecordedBlob(null);
      recordCallRef.current = recordCall;
      recordedChunksRef.current = [];

      const startedAtMs = Date.now();
      const session = {
        sessionId: null,
        startedAt: new Date(startedAtMs).toISOString(),
        startedAtMs,
        // The visitor clicking "Start call" is itself the consent to this
        // user-initiated call, so it's logged just before the call starts.
        consentEvent: { granted: true, timestamp: new Date(startedAtMs - 1000).toISOString() },
        turns: [],
        persona: { id: persona.id, label: persona.label, scope: persona.scope, seedViolation },
      };
      sessionRef.current = session;
      // Hands the completed session to `lastSession` exactly once, whether the
      // call ends cleanly (session.ended) or the socket just closes.
      const finishSession = () => {
        if (sessionRef.current !== session) return;
        sessionRef.current = null;
        setLastSession({ ...session, endedAtMs: Date.now() });
      };

      const tokenResp = await fetch("/v1/token");
      const tokenBody = await tokenResp.json();
      if (!tokenResp.ok || !tokenBody.token) {
        setConnectError(tokenBody.error ?? "Could not start the call.");
        setStatus("error");
        return;
      }

      const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${tokenBody.token}`);
      wsRef.current = ws;

      audioCtxOutRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      nextPlaybackTimeRef.current = 0;
      if (recordCall) {
        recordDestRef.current = audioCtxOutRef.current.createMediaStreamDestination();
      }

      ws.onopen = () => {
        const callConfig = resolvePersonaCallConfig(persona, seedViolation);
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              system_prompt: callConfig.systemPrompt,
              greeting: callConfig.greeting,
              input: {
                format: { encoding: "audio/pcm" },
                keyterms: KEYTERMS,
                turn_detection: {
                  vad_threshold: 0.5,
                  min_silence: 200,
                  max_silence: 1000,
                  interrupt_response: true,
                },
              },
              output: {
                voice: callConfig.voice,
                format: { encoding: "audio/pcm" },
              },
            },
          })
        );
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "session.ready":
            setStatus("ready");
            if (sessionRef.current) sessionRef.current.sessionId = msg.session_id;
            await startMic(ws);
            break;
          case "transcript.user":
            appendTranscript("user", msg.text ?? "");
            break;
          case "transcript.agent":
            appendTranscript("agent", msg.text ?? "");
            break;
          case "reply.audio":
            playReplyAudio(msg.data);
            break;
          case "reply.done":
            if (msg.status === "interrupted") flushPlayback();
            break;
          case "session.ended":
            finishSession();
            ws.close();
            break;
          case "session.error":
            console.error("session.error", msg);
            setStatus("error");
            break;
          default:
            break;
        }
      };

      ws.onerror = () => setStatus("error");
      ws.onclose = (event) => {
        // Documented Voice Agent close codes: 1008 unauthorized, 3005 server error,
        // 3006 invalid message, 3007 bad chunk size/rate, 3008 session expired, 3009 too many sessions.
        console.log("ws closed", event.code, event.reason);
        setStatus((s) => (s === "error" ? s : "idle"));
        stopMic();
        if (session.turns.length > 0) finishSession();
      };
    },
    [appendTranscript, flushPlayback, playReplyAudio]
  );

  const startMic = useCallback(async (ws) => {
    // Explicit (not relying on browser defaults): without echo cancellation, the
    // agent's own reply audio leaking back into the mic (real speaker + mic, no
    // headphones) reads to AssemblyAI's VAD as the user talking over every reply,
    // so it keeps barging in on itself and no turn after the first ever finishes
    // cleanly - see AssemblyAI docs' "TTS bleed-through" barge-in gotcha.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micStreamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    audioCtxInRef.current = ctx;
    await ctx.audioWorklet.addModule("/worklets/pcm-capture-processor.js");

    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "pcm-capture-processor");
    workletNodeRef.current = worklet;

    worklet.port.onmessage = (event) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const float32 = event.data;
      const int16 = new Int16Array(float32.length);
      let peak = 0;
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        const abs = Math.abs(int16[i]);
        if (abs > peak) peak = abs;
      }
      if (peak >= SILENCE_AMPLITUDE_THRESHOLD) {
        lastAudibleAtRef.current = Date.now();
        setMicSilent(false);
      }
      const bytes = new Uint8Array(int16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      ws.send(JSON.stringify({ type: "input.audio", audio: btoa(binary) }));
    };

    source.connect(worklet);

    if (recordCallRef.current && audioCtxOutRef.current) {
      // Re-tap the mic MediaStream as a source node inside the OUTPUT AudioContext
      // (where recordDestRef lives) so both sides land as one mixed track. AudioNodes
      // can't cross contexts, but a raw MediaStream (from getUserMedia) can be wrapped
      // in a MediaStreamAudioSourceNode in any context - it isn't tied to the context
      // that captured it.
      recordMicSourceRef.current = audioCtxOutRef.current.createMediaStreamSource(stream);
      if (recordDestRef.current) recordMicSourceRef.current.connect(recordDestRef.current);
      startRecorder();
    }

    lastAudibleAtRef.current = Date.now();
    setMicSilent(false);
    silenceCheckIntervalRef.current = setInterval(() => {
      setMicSilent(Date.now() - lastAudibleAtRef.current > SILENCE_WARNING_MS);
    }, 1000);
  }, []);

  // Records recordDestRef's single mixed track (mic + agent reply, both routed
  // into it above and in connect()) - a copy of what's already flowing through
  // the live call, not a second capture path. This has to be ONE audio track:
  // MediaRecorder only encodes the first audio track of a MediaStream, silently
  // dropping the rest, so combining two separate destination-node streams into
  // one MediaStream at record time (the previous approach) recorded mic-only.
  const startRecorder = useCallback(() => {
    const tracks = recordDestRef.current?.stream.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    const combined = new MediaStream(tracks);
    const recorder = new MediaRecorder(combined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (recordedChunksRef.current.length > 0) {
        setRecordedBlob(new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    if (sessionRef.current) sessionRef.current.recordingOffsetMs = Date.now() - sessionRef.current.startedAtMs;
  }, []);

  const stopMic = useCallback(() => {
    clearInterval(silenceCheckIntervalRef.current);
    silenceCheckIntervalRef.current = null;
    setMicSilent(false);
    workletNodeRef.current?.port.close();
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioCtxInRef.current?.close();
    audioCtxInRef.current = null;
    recordMicSourceRef.current?.disconnect();
    recordMicSourceRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Clean teardown: send session.end and wait for the session.ended reply
      // (closed there) before closing the socket - closing immediately races
      // the reply and drops lastSession. Fall back to a timed close in case
      // session.ended never arrives.
      ws.send(JSON.stringify({ type: "session.end" }));
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.close();
      }, 3000);
    }
    wsRef.current = null;
    stopMic();
    audioCtxOutRef.current?.close();
    audioCtxOutRef.current = null;
    recordDestRef.current = null;
    setStatus("idle");
  }, [stopMic]);

  return {
    status,
    transcript,
    lastSession,
    micSilent,
    connectError,
    recordedBlob,
    connect,
    disconnect,
  };
}
