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
