import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultFile = fileURLToPath(new URL("./.telephony-store.json", import.meta.url));

function empty() {
  return { credentials: [], numbers: [], sessions: [] };
}

// Records written before per-user scoping carry no ownerId. They belong to the
// "anon" visitor - the one shared account index.js's visitorId(req) returns
// when Clerk is off - so local dev keeps its data, and with Clerk on no
// signed-in user inherits them.
const LEGACY_OWNER = "anon";

function ownedBy(ownerId) {
  return (record) => (record.ownerId ?? LEGACY_OWNER) === ownerId;
}

function last10Digits(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
}

// Every read and write is scoped to one owner (a Clerk user id, or "anon").
// The one cross-owner lookup is findNumberOwner, which routes a
// webhook-delivered call to whoever registered the dialed number.
export class TelephonyStore {
  constructor(file = process.env.TELEPHONY_STORE_PATH || defaultFile) {
    this.file = file;
  }

  async read() {
    try {
      return { ...empty(), ...JSON.parse(await readFile(this.file, "utf8")) };
    } catch (err) {
      if (err.code === "ENOENT") return empty();
      throw err;
    }
  }

  async write(data) {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(data, null, 2));
  }

  async listNumbers(ownerId) {
    return (await this.read()).numbers.filter(ownedBy(ownerId));
  }

  // A number routes inbound calls to exactly one account, so e164 stays
  // unique across owners.
  async saveNumber(ownerId, input) {
    const data = await this.read();
    if (data.numbers.some((n) => n.e164 === input.e164)) {
      throw Object.assign(new Error("A number with that e164 already exists"), { status: 409 });
    }
    const number = { id: `num_${randomUUID()}`, direction: "inbound", ...input, ownerId };
    data.numbers.push(number);
    await this.write(data);
    return number;
  }

  async findNumberOwner(e164) {
    const number = (await this.read()).numbers.find((n) => n.e164 === e164);
    return number ? (number.ownerId ?? LEGACY_OWNER) : null;
  }

  // Auth token Twilio will sign with when this imported number is called.
  // demo-agent-voice needs it: the deployment token does not validate a
  // webhook from the caller's own account.
  async twilioAuthTokenForE164(e164) {
    const key = last10Digits(e164);
    if (!key) return null;
    const data = await this.read();
    const number = data.numbers.find((n) => n.provider === "twilio" && last10Digits(n.e164) === key);
    if (!number?.credentialId) return null;
    const credential = data.credentials.find((c) => c.id === number.credentialId);
    return credential?.secret || null;
  }

  async updateNumber(ownerId, id, patch) {
    const data = await this.read();
    const number = data.numbers.find((n) => n.id === id && ownedBy(ownerId)(n));
    if (!number) return null;
    if (patch.label !== undefined) number.label = patch.label;
    if (patch.direction !== undefined) number.direction = patch.direction;
    if (patch.credentialId !== undefined) number.credentialId = patch.credentialId;
    await this.write(data);
    return number;
  }

  async deleteNumber(ownerId, id) {
    const data = await this.read();
    const next = data.numbers.filter((n) => !(n.id === id && ownedBy(ownerId)(n)));
    if (next.length === data.numbers.length) return false;
    data.numbers = next;
    await this.write(data);
    return true;
  }

  async listCredentials(ownerId) {
    return (await this.read()).credentials.filter(ownedBy(ownerId));
  }

  async getCredential(ownerId, id) {
    return (await this.listCredentials(ownerId)).find((c) => c.id === id) ?? null;
  }

  async saveCredential(ownerId, input) {
    const data = await this.read();
    const credential = { id: `cred_${randomUUID()}`, ...input, ownerId };
    data.credentials.push(credential);
    await this.write(data);
    return credential;
  }

  async deleteCredential(ownerId, id) {
    const data = await this.read();
    const next = data.credentials.filter((c) => !(c.id === id && ownedBy(ownerId)(c)));
    if (next.length === data.credentials.length) return false;
    data.credentials = next;
    data.numbers = data.numbers.map((n) => (n.credentialId === id ? { ...n, credentialId: null } : n));
    await this.write(data);
    return true;
  }

  // Two owners can post the same carrier callId, so a session is keyed by
  // owner and sessionId together.
  async saveSession(ownerId, entry) {
    const data = await this.read();
    const owned = { ...entry, ownerId };
    const existing = data.sessions.findIndex((s) => s.sessionId === entry.sessionId && ownedBy(ownerId)(s));
    if (existing >= 0) data.sessions[existing] = owned;
    else data.sessions.unshift(owned);
    await this.write(data);
    return owned;
  }

  async listSessions(ownerId) {
    return (await this.read()).sessions.filter(ownedBy(ownerId));
  }

  async getSession(ownerId, sessionId) {
    return (await this.listSessions(ownerId)).find((s) => s.sessionId === sessionId) ?? null;
  }
}

export function redactCredential(credential) {
  return {
    id: credential.id,
    provider: credential.provider,
    label: credential.label ?? "",
    gateways: credential.gateways ?? [],
    username: credential.username ?? null,
    hasSecret: Boolean(credential.secret),
  };
}
