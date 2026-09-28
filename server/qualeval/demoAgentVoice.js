import twilio from "twilio";
import { twilioConfigured } from "./twilioClient.js";
import { productionCallFromTwilioBody, recordProductionCall } from "./productionCalls.js";

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
export async function demoAgentVoiceRoute(
  req,
  res,
  {
    env = process.env,
    validate = twilio.validateRequest,
    recordCall = recordProductionCall,
    // Imported numbers sign webhooks with their own auth token, not the
    // deployment's TWILIO_AUTH_TOKEN. index.js passes a lookup against the
    // telephony store.
    authTokenForTo = null,
  } = {},
) {
  const candidates = [];
  if (twilioConfigured(env)) candidates.push(env.TWILIO_AUTH_TOKEN);
  if (typeof authTokenForTo === "function") {
    try {
      const imported = await authTokenForTo(req.body?.To);
      if (imported && !candidates.includes(imported)) candidates.push(imported);
    } catch (err) {
      console.error(`QualEval demo agent: imported number token lookup failed: ${err.message}`);
    }
  }
  if (candidates.length === 0) return res.status(503).send("Twilio is not configured.");

  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const signature = req.get("X-Twilio-Signature");
  const body = req.body ?? {};
  if (!candidates.some((token) => validate(token, signature, fullUrl, body))) {
    return res.status(403).send("Invalid Twilio signature.");
  }

  // Write the caller before TwiML is returned. The Media Stream "start"
  // event is a later, lossy path (see targetAgentStream.js); CallSid/From/
  // CallerName are already on this webhook. A database failure must not
  // stop the call from being answered.
  try {
    await recordCall(productionCallFromTwilioBody(req.body ?? {}), env);
  } catch (err) {
    console.error(`QualEval demo agent: failed to record production call: ${err.message}`);
  }

  const response = new twilio.twiml.VoiceResponse();
  // No filler <Say> before the stream: a calling voice agent (a QualEval
  // persona, or any other bot) hears it as the agent's opening turn and
  // answers it, talking over the real greeting that follows (reproduced live
  // 2026-09-27). The agent's own greeting is the first thing the caller hears.
  response.connect().stream({ url: `${wsBaseUrl(req)}/v1/qualeval/target-agent-stream` });
  res.type("text/xml").send(response.toString());
}

function wsBaseUrl(req) {
  const proto = req.protocol === "https" ? "wss" : "ws";
  return `${proto}://${req.get("host")}`;
}
