// Vapi-style independent slots: transcriber (STT), model (LLM), voice
// (realtime/TTS). AssemblyAI is the default - and the only
// hackathon-eligible - provider for every slot; every other provider
// requires an operator-supplied BYO key and is never required to reach the
// default demo path. See .claude/prds/provider-swaps.md.
import * as store from "./store.js";
import * as transcriberAssemblyai from "./transcriberAssemblyai.js";
import * as transcriberDeepgram from "./transcriberDeepgram.js";
import * as modelGateway from "./modelGateway.js";
import * as modelOpenaiCompatible from "./modelOpenaiCompatible.js";
import * as voiceAssemblyai from "./voiceAssemblyai.js";
import * as voiceStub from "./voiceStub.js";

export class InvalidProviderError extends Error {}

const CATALOG = {
  transcriber: [
    { id: "assemblyai", label: "AssemblyAI", requiresKey: false, module: transcriberAssemblyai },
    { id: "deepgram", label: "Deepgram", requiresKey: true, module: transcriberDeepgram },
  ],
  model: [
    { id: "assemblyai-gateway", label: "AssemblyAI LLM Gateway", requiresKey: false, module: modelGateway },
    { id: "openai-compatible", label: "OpenAI-compatible", requiresKey: true, module: modelOpenaiCompatible },
  ],
  voice: [
    { id: "assemblyai-voice-agent", label: "AssemblyAI Voice Agent", requiresKey: false, module: voiceAssemblyai },
    { id: "custom-voice", label: "Custom voice (BYO)", requiresKey: true, module: voiceStub },
  ],
};

export const SLOTS = Object.keys(CATALOG);

function findProvider(slot, providerId) {
  return CATALOG[slot]?.find((p) => p.id === providerId);
}

// Catalog for populating client dropdowns - never includes `module`.
export function listCatalog() {
  return Object.fromEntries(
    SLOTS.map((slot) => [
      slot,
      CATALOG[slot].map(({ id, label, requiresKey }) => ({ id, label, requiresKey })),
    ])
  );
}

// Current selection per slot plus whether a required key is on file - never
// the key itself. This is the only shape that reaches GET /v1/providers/config.
export function getConfig() {
  const selection = store.getSelection();
  return Object.fromEntries(
    SLOTS.map((slot) => {
      const providerId = selection[slot];
      const provider = findProvider(slot, providerId);
      return [
        slot,
        {
          providerId,
          requiresKey: provider?.requiresKey ?? false,
          keyConfigured: provider?.requiresKey ? store.hasCredential(providerId) : true,
        },
      ];
    })
  );
}

export function setSelection(slot, providerId) {
  if (!SLOTS.includes(slot)) {
    throw new InvalidProviderError(`Unknown slot "${slot}".`);
  }
  if (!findProvider(slot, providerId)) {
    throw new InvalidProviderError(`Unknown provider "${providerId}" for slot "${slot}".`);
  }
  store.setSelection(slot, providerId);
  return getConfig()[slot];
}

export function setCredential(providerId, credential) {
  if (!credential || typeof credential.apiKey !== "string" || credential.apiKey.trim() === "") {
    throw new InvalidProviderError("A non-empty apiKey is required.");
  }
  const known = SLOTS.some((slot) => findProvider(slot, providerId));
  if (!known) {
    throw new InvalidProviderError(`Unknown provider "${providerId}".`);
  }
  store.setCredential(providerId, credential);
}

function resolve(slot) {
  const providerId = store.getSelection()[slot];
  return findProvider(slot, providerId) ?? CATALOG[slot][0];
}

export function getTranscriber() {
  return resolve("transcriber").module;
}

export function getModel() {
  return resolve("model").module;
}

export function getVoice() {
  return resolve("voice").module;
}
