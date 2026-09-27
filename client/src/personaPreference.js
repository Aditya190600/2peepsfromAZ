import { PERSONAS, findPersona } from "./personas.js";

export const DEFAULT_PERSONA_STORAGE_KEY = "complyline_default_persona_v1";

export function isValidPersonaId(id) {
  return PERSONAS.some((persona) => persona.id === id);
}

export function getDefaultPersonaId(storage = localStorage) {
  try {
    const stored = storage.getItem(DEFAULT_PERSONA_STORAGE_KEY);
    return isValidPersonaId(stored) ? stored : "neutral";
  } catch {
    return "neutral";
  }
}

export function setDefaultPersonaId(id, storage = localStorage) {
  if (!isValidPersonaId(id)) throw new Error(`Unknown persona id "${id}".`);
  storage.setItem(DEFAULT_PERSONA_STORAGE_KEY, id);
  return findPersona(id);
}
