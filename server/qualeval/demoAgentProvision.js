import { twilioConfigured } from "./twilioClient.js";

const API_BASE = "https://api.twilio.com/2010-04-01";

function authHeader(env) {
  return `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;
}

// Idempotently points QUALEVAL_AGENT_NUMBER's Twilio Voice Configuration at
// this server's own demo-agent-voice TwiML (server/qualeval/demoAgentVoice.js)
// on every boot. Twilio requires a Voice Configuration on a Twilio-owned
// number before it treats any inbound leg to it as answered - including the
// leg created by this repo's own callBridge.js dialing QUALEVAL_AGENT_NUMBER
// from QUALEVAL_PERSONA_NUMBER, which is exactly what an MVP-verification
// run does today (there is no real customer target agent yet). A number
// left unconfigured - e.g. because someone changed it by hand in the Twilio
// Console, which leaves no trace in this repo - fails every such call at
// duration 0 with no Events/Alerts at all, which reproduced the "call fails
// at duration 0" regression this function exists to make impossible to
// reintroduce. See docs/qualeval-demo-agent-number.md.
export async function ensureDemoAgentNumberConfigured({ env = process.env, fetchImpl = fetch } = {}) {
  if (!twilioConfigured(env) || !env.QUALEVAL_AGENT_NUMBER || !env.RAILWAY_PUBLIC_DOMAIN) return;

  const voiceUrl = `https://${env.RAILWAY_PUBLIC_DOMAIN}/v1/qualeval/demo-agent-voice`;

  const listRes = await fetchImpl(
    `${API_BASE}/Accounts/${env.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(env.QUALEVAL_AGENT_NUMBER)}`,
    { headers: { Authorization: authHeader(env) } },
  );
  const listBody = await listRes.json().catch(() => ({}));
  const number = listBody?.incoming_phone_numbers?.[0];
  if (!number) {
    console.error(`QualEval: QUALEVAL_AGENT_NUMBER ${env.QUALEVAL_AGENT_NUMBER} was not found on this Twilio account.`);
    return;
  }

  if (number.voice_url === voiceUrl && number.voice_method === "POST") return;

  const updateRes = await fetchImpl(
    `${API_BASE}/Accounts/${env.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${number.sid}.json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(env),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ VoiceUrl: voiceUrl, VoiceMethod: "POST" }).toString(),
    },
  );
  if (!updateRes.ok) {
    console.error(`QualEval: failed to configure the demo-agent number's Voice Configuration (HTTP ${updateRes.status}).`);
    return;
  }
  console.log(`QualEval: configured demo-agent number ${env.QUALEVAL_AGENT_NUMBER}'s VoiceUrl -> ${voiceUrl}`);
}
