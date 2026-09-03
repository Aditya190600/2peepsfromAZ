import { useCallback, useRef, useState } from "react";

const SAMPLE_RATE = 24000;

const TOOLS = [
  {
    type: "function",
    name: "check_regulation",
    description:
      "Look up a grounded compliance rule from ComplyLine's ruleset. Always call this instead of answering compliance questions from memory. Only covers California CCPA/CPRA (jurisdiction 'US-CA') in this demo.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "The compliance topic, e.g. 'right to delete', 'right to know', 'opt-out of sale or sharing', 'data breach notification', 'minors data', 'sensitive personal information', 'service provider contracts', 'right to correct'.",
        },
        jurisdiction: {
          type: "string",
          description: "The jurisdiction code, e.g. 'US-CA' for California. This demo only has data for US-CA.",
        },
      },
      required: ["topic", "jurisdiction"],
    },
  },
];

const SYSTEM_PROMPT = `You are ComplyLine, a compliance advisor voice assistant for California's CCPA/CPRA privacy law only.
Always call the check_regulation tool for any question about a specific compliance rule or consumer right - never answer from your own training knowledge, since that risks giving wrong legal information.
If check_regulation returns found: false, tell the user this demo only covers California CCPA/CPRA and that topic/jurisdiction isn't in the ruleset - do not improvise an answer.
Keep answers short and speak naturally, citing the code section check_regulation gives you.`;

const KEYTERMS = ["CCPA", "CPRA", "personal information", "opt-out", "service provider", "consumer rights"];

export function useVoiceAgent() {
  const [status, setStatus] = useState("idle"); // idle | connecting | ready | error
  const [transcript, setTranscript] = useState([]); // {role, text}[]

  const wsRef = useRef(null);
  const audioCtxInRef = useRef(null);
  const audioCtxOutRef = useRef(null);
  const workletNodeRef = useRef(null);
  const micStreamRef = useRef(null);
  const nextPlaybackTimeRef = useRef(0);
  const pendingSourcesRef = useRef([]);

  const appendTranscript = useCallback((role, text) => {
    setTranscript((prev) => [...prev, { role, text }]);
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

  const handleToolCall = useCallback(async (msg) => {
    const ws = wsRef.current;
    if (!ws) return;
    let result;
    try {
      if (msg.name === "check_regulation") {
        const args = JSON.parse(msg.arguments);
        const resp = await fetch("/v1/check-regulation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        result = await resp.json();
      } else {
        result = { found: false, message: `Unknown tool: ${msg.name}` };
      }
    } catch (err) {
      result = { found: false, message: `Tool execution error: ${String(err)}` };
    }
    ws.send(JSON.stringify({ type: "tool.result", call_id: msg.call_id, result: JSON.stringify(result) }));
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setTranscript([]);

    const tokenResp = await fetch("/v1/token");
    const { token } = await tokenResp.json();

    const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${token}`);
    wsRef.current = ws;

    audioCtxOutRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
    nextPlaybackTimeRef.current = 0;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            system_prompt: SYSTEM_PROMPT,
            greeting: "Hi, I'm ComplyLine. Ask me about California CCPA and CPRA consumer privacy rights.",
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
              voice: "anna",
              format: { encoding: "audio/pcm" },
            },
            tools: TOOLS,
          },
        })
      );
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "session.ready":
          setStatus("ready");
          await startMic(ws);
          break;
        case "transcript.user":
          appendTranscript("user", msg.transcript ?? msg.text ?? "");
          break;
        case "transcript.agent":
          appendTranscript("agent", msg.transcript ?? msg.text ?? "");
          break;
        case "reply.audio":
          playReplyAudio(msg.data);
          break;
        case "reply.done":
          if (msg.status === "interrupted") flushPlayback();
          break;
        case "tool.call":
          await handleToolCall(msg);
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
    };
  }, [appendTranscript, flushPlayback, handleToolCall, playReplyAudio]);

  const startMic = useCallback(async (ws) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const bytes = new Uint8Array(int16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      ws.send(JSON.stringify({ type: "input.audio", audio: btoa(binary) }));
    };

    source.connect(worklet);
  }, []);

  const stopMic = useCallback(() => {
    workletNodeRef.current?.port.close();
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioCtxInRef.current?.close();
    audioCtxInRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Clean teardown: session.end stops billing immediately, unlike just closing the socket.
      ws.send(JSON.stringify({ type: "session.end" }));
      ws.close();
    }
    wsRef.current = null;
    stopMic();
    audioCtxOutRef.current?.close();
    audioCtxOutRef.current = null;
    setStatus("idle");
  }, [stopMic]);

  return { status, transcript, connect, disconnect };
}
