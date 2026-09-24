import twilio from "twilio";
import { twilioConfigured } from "./twilioClient.js";

// POST /v1/qualeval/twilio-voice/:runId - the TwiML webhook Twilio fetches
// once the callee (the target agent's phone number) answers our outbound
// call (see server/qualeval/callBridge.js's placeOutboundCall). Returns a
// bidirectional <Connect><Stream> pointing back at this same server's
// WebSocket upgrade route (server/qualeval/twilioStream.js), which is the
// only way to bridge a phone call's audio to a WebSocket per Twilio's docs
// (https://www.twilio.com/docs/voice/twiml/stream) - Twilio blocks on this
// verb until the stream's WebSocket closes, so the call stays open for the
// whole scenario conversation.
//
// This is a third-party webhook (Twilio's own servers call it, not a
// visitor's browser), so it is mounted outside requireVisitor and instead
// verified with Twilio's own request-signature scheme
// (https://www.twilio.com/docs/usage/webhooks/webhooks-security), same
// verify-before-trust posture as server/webhooks/assemblyaiWebhook.js's
// X-AAI-Signature check.
export function twilioVoiceRoute(req, res, { env = process.env, validate = twilio.validateRequest } = {}) {
  if (!twilioConfigured(env)) return res.status(503).send("Twilio is not configured.");

  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const signature = req.get("X-Twilio-Signature");
  if (!validate(env.TWILIO_AUTH_TOKEN, signature, fullUrl, req.body ?? {})) {
    return res.status(403).send("Invalid Twilio signature.");
  }

  const { runId } = req.params;
  const streamUrl = `${wsBaseUrl(req)}/v1/qualeval/twilio-stream?runId=${encodeURIComponent(runId)}`;

  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  connect.stream({ url: streamUrl });

  res.type("text/xml").send(response.toString());
}

function wsBaseUrl(req) {
  const proto = req.protocol === "https" ? "wss" : "ws";
  return `${proto}://${req.get("host")}`;
}
