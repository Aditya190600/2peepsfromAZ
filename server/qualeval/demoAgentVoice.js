import twilio from "twilio";
import { twilioConfigured } from "./twilioClient.js";

// POST /v1/qualeval/demo-agent-voice - the TwiML answered by
// QUALEVAL_AGENT_NUMBER (see AGENTS.md's demo target-agent section, and
// docs/qualeval-demo-agent-number.md for why a Voice Configuration is
// required at all - including for the leg created by this repo's own
// placeCall() dialing QUALEVAL_AGENT_NUMBER from QUALEVAL_PERSONA_NUMBER,
// which is what an MVP-verification run does today since there is no real
// customer target agent yet).
//
// Bridges to a real AssemblyAI Voice Agent session playing whichever target-
// agent variant is currently active (server/qualeval/demoAgentConfig.js),
// via the same bidirectional <Connect><Stream> pattern as the outbound/
// persona side's twilioVoice.js - see server/qualeval/targetAgentStream.js
// for the WebSocket half and server/qualeval/bridgeSession.js's header
// comment for why role mapping is opposite on this side.
//
// Not tied to a specific run (unlike twilioVoice.js's per-run webhook, whose
// runId travels as a <Stream> Custom Parameter) - which variant to bridge
// with is a global runtime setting read at connect time by
// targetAgentStream.js, not something this call needs to know - so it needs
// no run lookup, only the same Twilio-signature verification posture as
// every other Twilio-originated webhook in this repo.
export function demoAgentVoiceRoute(req, res, { env = process.env, validate = twilio.validateRequest } = {}) {
  if (!twilioConfigured(env)) return res.status(503).send("Twilio is not configured.");

  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const signature = req.get("X-Twilio-Signature");
  if (!validate(env.TWILIO_AUTH_TOKEN, signature, fullUrl, req.body ?? {})) {
    return res.status(403).send("Invalid Twilio signature.");
  }

  const response = new twilio.twiml.VoiceResponse();
  // The Twilio Media Streams WebSocket to our server takes ~5-6s to connect
  // (observed live, not our own request handling - see AGENTS.md's inbound
  // answer latency note) before any AssemblyAI audio can play. Without this,
  // a real caller hears dead silence right after the call is answered and
  // reasonably hangs up thinking the call went unanswered.
  response.say("One moment please.");
  response.connect().stream({ url: `${wsBaseUrl(req)}/v1/qualeval/target-agent-stream` });
  res.type("text/xml").send(response.toString());
}

function wsBaseUrl(req) {
  const proto = req.protocol === "https" ? "wss" : "ws";
  return `${proto}://${req.get("host")}`;
}
