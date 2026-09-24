// Thin Twilio REST wrapper, same injectable-fetchImpl style as
// server/telephony/carriers.js's validateTwilio (raw fetch + Basic auth,
// not the Twilio Node SDK) so this stays trivially testable without a real
// account. TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are read from process.env,
// same pattern as ASSEMBLYAI_API_KEY - see AGENTS.md.
const API_BASE = "https://api.twilio.com/2010-04-01";

export function twilioConfigured(env = process.env) {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
}

function authHeader(env) {
  return `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;
}

async function asJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || `Twilio API request failed with HTTP ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body;
}

// Places a real outbound call. `twimlUrl` must be a webhook Twilio can reach
// (it's fetched once the callee answers) - see server/qualeval/twilioVoice.js.
export async function placeOutboundCall({ to, from, twimlUrl, statusCallbackUrl }, env = process.env, fetchImpl = fetch) {
  if (!twilioConfigured(env)) throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN).");
  const params = new URLSearchParams({ To: to, From: from, Url: twimlUrl });
  if (statusCallbackUrl) {
    params.set("StatusCallback", statusCallbackUrl);
    params.set("StatusCallbackEvent", "completed");
  }
  const response = await fetchImpl(`${API_BASE}/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: authHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const body = await asJson(response);
  return { sid: body.sid, status: body.status };
}

// Ends a live call - used once the bridge decides the conversation is over
// (AssemblyAI session.ended) rather than leaving the PSTN leg open.
export async function endCall(callSid, env = process.env, fetchImpl = fetch) {
  if (!twilioConfigured(env)) throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN).");
  const response = await fetchImpl(`${API_BASE}/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`, {
    method: "POST",
    headers: {
      Authorization: authHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ Status: "completed" }).toString(),
  });
  await asJson(response);
}
