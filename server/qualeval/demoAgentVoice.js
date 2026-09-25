import twilio from "twilio";
import { twilioConfigured } from "./twilioClient.js";

// POST /v1/qualeval/demo-agent-voice - static TwiML answered by
// QUALEVAL_AGENT_NUMBER (see AGENTS.md's call-bridge section). Twilio
// requires *some* Voice Configuration on a Twilio-owned number before it
// treats an inbound leg to it as answered - including the leg created by
// this repo's own placeCall() dialing QUALEVAL_AGENT_NUMBER from
// QUALEVAL_PERSONA_NUMBER, which is exactly what an MVP-verification run
// does today since there is no real customer target agent yet. A number
// left unconfigured fails every such call at duration 0 with no
// Events/Alerts (confirmed live 2026-09-25 while diagnosing the
// "call fails at duration 0" regression) - this route plus
// demoAgentProvision.js's boot-time wiring is what keeps that from
// silently regressing again. See docs/qualeval-demo-agent-number.md.
//
// Not tied to a specific run (unlike twilioVoice.js's per-run webhook), so
// it needs no run lookup - only the same Twilio-signature verification
// posture as every other Twilio-originated webhook in this repo.
export function demoAgentVoiceRoute(req, res, { env = process.env, validate = twilio.validateRequest } = {}) {
  if (!twilioConfigured(env)) return res.status(503).send("Twilio is not configured.");

  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const signature = req.get("X-Twilio-Signature");
  if (!validate(env.TWILIO_AUTH_TOKEN, signature, fullUrl, req.body ?? {})) {
    return res.status(403).send("Invalid Twilio signature.");
  }

  const response = new twilio.twiml.VoiceResponse();
  response.say("Hello, thank you for calling. My name is Alex. How can I help you today?");
  response.pause({ length: 45 });
  res.type("text/xml").send(response.toString());
}
