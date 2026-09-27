export const DEFAULT_PHONE_STORAGE_KEY = "complyline_default_phone_v1";

export function normalizePhoneNumber(value) {
  return (value ?? "").trim();
}

export function isValidPhoneNumber(value) {
  const normalized = normalizePhoneNumber(value);
  return normalized.length > 0 && /^\+[\d\s().-]{7,}$/.test(normalized);
}

export function getDefaultPhoneNumber(storage = localStorage) {
  try {
    const stored = storage.getItem(DEFAULT_PHONE_STORAGE_KEY);
    return normalizePhoneNumber(stored) || null;
  } catch {
    return null;
  }
}

export function setDefaultPhoneNumber(value, storage = localStorage) {
  const normalized = normalizePhoneNumber(value);
  if (!isValidPhoneNumber(normalized)) {
    throw new Error("Enter a phone number in E.164 format, e.g. +18038245760.");
  }
  storage.setItem(DEFAULT_PHONE_STORAGE_KEY, normalized);
  return normalized;
}

export function clearDefaultPhoneNumber(storage = localStorage) {
  storage.removeItem(DEFAULT_PHONE_STORAGE_KEY);
}
