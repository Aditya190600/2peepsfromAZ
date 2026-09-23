import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultFile = fileURLToPath(new URL("./.telephony-store.json", import.meta.url));

function empty() {
  return { credentials: [], numbers: [], sessions: [] };
}

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

  async listNumbers() {
    return (await this.read()).numbers;
  }

  async saveNumber(input) {
    const data = await this.read();
    if (data.numbers.some((n) => n.e164 === input.e164)) {
      throw Object.assign(new Error("A number with that e164 already exists"), { status: 409 });
    }
    const number = { id: `num_${randomUUID()}`, direction: "inbound", ...input };
    data.numbers.push(number);
    await this.write(data);
    return number;
  }

  async updateNumber(id, patch) {
    const data = await this.read();
    const number = data.numbers.find((n) => n.id === id);
    if (!number) return null;
    if (patch.label !== undefined) number.label = patch.label;
    if (patch.direction !== undefined) number.direction = patch.direction;
    if (patch.credentialId !== undefined) number.credentialId = patch.credentialId;
    await this.write(data);
    return number;
  }

  async deleteNumber(id) {
    const data = await this.read();
    const next = data.numbers.filter((n) => n.id !== id);
    if (next.length === data.numbers.length) return false;
    data.numbers = next;
    await this.write(data);
    return true;
  }

  async listCredentials() {
    return (await this.read()).credentials;
  }

  async getCredential(id) {
    return (await this.read()).credentials.find((c) => c.id === id) ?? null;
  }

  async saveCredential(input) {
    const data = await this.read();
    const credential = { id: `cred_${randomUUID()}`, ...input };
    data.credentials.push(credential);
    await this.write(data);
    return credential;
  }

  async deleteCredential(id) {
    const data = await this.read();
    const next = data.credentials.filter((c) => c.id !== id);
    if (next.length === data.credentials.length) return false;
    data.credentials = next;
    data.numbers = data.numbers.map((n) => (n.credentialId === id ? { ...n, credentialId: null } : n));
    await this.write(data);
    return true;
  }

  async saveSession(entry) {
    const data = await this.read();
    const existing = data.sessions.findIndex((s) => s.sessionId === entry.sessionId);
    if (existing >= 0) data.sessions[existing] = entry;
    else data.sessions.unshift(entry);
    await this.write(data);
    return entry;
  }

  async listSessions() {
    return (await this.read()).sessions;
  }

  async getSession(sessionId) {
    return (await this.read()).sessions.find((s) => s.sessionId === sessionId) ?? null;
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
