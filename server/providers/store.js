// Local persistence for provider slot selection + BYO credentials. Plain
// gitignored JSON file, no DB - consistent with the rest of this repo (see
// AGENTS.md "no database"). Never returns raw credentials to callers outside
// this module; registry.js is responsible for redacting before anything
// reaches an HTTP response.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, ".provider-store.json");

const DEFAULT_SELECTION = {
  transcriber: "assemblyai",
  model: "assemblyai-gateway",
  voice: "assemblyai-voice-agent",
};

function readStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      selection: { ...DEFAULT_SELECTION, ...(parsed.selection ?? {}) },
      credentials: parsed.credentials ?? {},
    };
  } catch {
    return { selection: { ...DEFAULT_SELECTION }, credentials: {} };
  }
}

// Disabled by _resetForTests so unit tests never touch the developer's real
// local store file - see the EADDRINUSE debugging session in the
// provider-swaps epic work: a test run once flipped a dev's live model
// selection to a keyless provider on disk.
let persistenceEnabled = true;

function writeStore(next) {
  if (!persistenceEnabled) return;
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2));
  } catch (err) {
    // A read-only filesystem (e.g. some sandboxed deploy targets) shouldn't
    // crash the request - the selection just won't survive a restart there.
    console.error("[providers/store] could not persist provider store:", err.message);
  }
}

let store = readStore();

export function getSelection() {
  return { ...store.selection };
}

export function setSelection(slot, providerId) {
  store = { ...store, selection: { ...store.selection, [slot]: providerId } };
  writeStore(store);
}

export function getCredential(providerId) {
  return store.credentials[providerId];
}

export function hasCredential(providerId) {
  return Boolean(store.credentials[providerId]?.apiKey);
}

export function setCredential(providerId, credential) {
  store = { ...store, credentials: { ...store.credentials, [providerId]: credential } };
  writeStore(store);
}

// Test-only: reset in-memory state and permanently stop writing to the
// on-disk store for the rest of this process.
export function _resetForTests(next = {}) {
  persistenceEnabled = false;
  store = {
    selection: { ...DEFAULT_SELECTION, ...(next.selection ?? {}) },
    credentials: next.credentials ?? {},
  };
}
