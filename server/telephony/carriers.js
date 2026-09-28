import net from "node:net";

const E164 = /^\+[1-9]\d{6,14}$/;
const GATEWAY = /^[a-zA-Z0-9.-]+$/;

export function assertE164(value) {
  if (typeof value !== "string" || !E164.test(value)) {
    throw Object.assign(new Error("e164 must be a +country number"), { status: 400 });
  }
  return value;
}

export function assertGateways(gateways) {
  if (!Array.isArray(gateways) || gateways.length === 0 || gateways.length > 8) {
    throw Object.assign(new Error("At least one SIP gateway is required"), { status: 400 });
  }
  return gateways.map((host) => {
    if (typeof host !== "string" || !GATEWAY.test(host) || host.length > 253) {
      throw Object.assign(new Error("Each gateway must be a hostname or numeric IP"), { status: 400 });
    }
    return host;
  });
}

function rejectStatus(message, status) {
  throw Object.assign(new Error(message), { status });
}

async function checkResponse(response, { rejected, failed, unreachable }) {
  if (response.status === 401 || response.status === 403) rejectStatus(rejected, 400);
  if (!response.ok) rejectStatus(`${failed} ${response.status}`, 502);
}

// Public URL Twilio should POST when an imported number is called. Same
// route the deployment's own demo number uses (demoAgentProvision.js), which
// is the only inbound writer of production_calls.
export function phoneEvalsVoiceUrl(env = process.env) {
  if (!env.RAILWAY_PUBLIC_DOMAIN) return null;
  return `https://${env.RAILWAY_PUBLIC_DOMAIN}/v1/qualeval/demo-agent-voice`;
}

// Points one number on the caller's own Twilio account at voiceUrl. Without
// this, importing the number only records it locally and inbound calls never
// hit demo-agent-voice, so Phone Evals stays empty.
export async function pointTwilioNumberAtVoiceUrl(
  { accountSid, authToken, e164, voiceUrl },
  { fetchImpl = fetch } = {},
) {
  const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
  const headers = { Authorization: auth };
  let listRes;
  try {
    listRes = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164)}`,
      { headers },
    );
  } catch {
    rejectStatus("Could not reach Twilio to configure the number's voice webhook", 502);
  }
  const listBody = typeof listRes.json === "function" ? await listRes.json().catch(() => ({})) : {};
  if (!listRes.ok) {
    const status = listRes.status === 401 || listRes.status === 403 ? 400 : 502;
    rejectStatus(`Twilio could not list the number (${listRes.status})`, status);
  }
  const number = listBody?.incoming_phone_numbers?.[0];
  if (!number?.sid) rejectStatus("That number was not found on the Twilio account", 400);
  if (number.voice_url === voiceUrl && number.voice_method === "POST") return { configured: true };

  let updateRes;
  try {
    updateRes = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${number.sid}.json`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ VoiceUrl: voiceUrl, VoiceMethod: "POST" }).toString(),
      },
    );
  } catch {
    rejectStatus("Could not reach Twilio to configure the number's voice webhook", 502);
  }
  if (!updateRes.ok) rejectStatus(`Twilio could not set the voice webhook (${updateRes.status})`, 502);
  return { configured: true };
}

export async function validateTwilio({ accountSid, authToken }, { fetchImpl = fetch } = {}) {
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid ?? "")) {
    rejectStatus("Twilio Account SID must look like AC followed by 32 hex characters", 400);
  }
  if (typeof authToken !== "string" || authToken.trim().length < 16) {
    rejectStatus("Twilio Auth Token is required", 400);
  }
  let response;
  try {
    response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
    });
  } catch {
    rejectStatus("Twilio credential check could not reach the API", 502);
  }
  await checkResponse(response, {
    rejected: "Twilio rejected the Account SID or Auth Token",
    failed: "Twilio credential check failed with status",
  });
}

export async function validateTelnyxApiKey(apiKey, { fetchImpl = fetch } = {}) {
  if (typeof apiKey !== "string" || apiKey.trim().length < 16) {
    rejectStatus("Telnyx API key is required", 400);
  }
  let response;
  try {
    response = await fetchImpl("https://api.telnyx.com/v2/balance", {
      headers: { authorization: `Bearer ${apiKey}` },
    });
  } catch {
    rejectStatus("Telnyx credential check could not reach the API", 502);
  }
  await checkResponse(response, {
    rejected: "Telnyx rejected the API key",
    failed: "Telnyx credential check failed with status",
  });
}

export function probeGateway(host, { connect } = {}) {
  const dial = connect ?? defaultConnect;
  return dial(host).catch((err) => {
    throw Object.assign(new Error(`SIP gateway ${host} is unreachable: ${err.message}`), { status: 502 });
  });
}

export async function probeGateways(gateways, options) {
  const hosts = assertGateways(gateways);
  for (const host of hosts) await probeGateway(host, options);
  return hosts;
}

function defaultConnect(host) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: 5060 });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timed out"));
    }, 2000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export const ZADARMA_GATEWAYS = ["sip.zadarma.com", "pbx.zadarma.com"];
