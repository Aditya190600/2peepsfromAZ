import { phoneDigits } from "./productionCalls.js";

// Phone Evals visibility:
// - QUALEVAL_ADMIN_EMAILS (isPhoneEvalAdmin): every call + page access without Twilio setup.
// - Everyone else with an inbound number in server/telephony/store.js: page access and only
//   calls whose to_number matches a number they registered.

export async function listOwnedInboundNumbers(telephonyStore, ownerId) {
  if (!telephonyStore || !ownerId) return [];
  const numbers = await telephonyStore.listNumbers(ownerId);
  return numbers
    .filter((n) => n.direction === "inbound" || n.direction === "both")
    .map((n) => n.e164);
}

export function ownedNumberDigits(numbers) {
  return new Set(numbers.map(phoneDigits).filter(Boolean));
}

export async function phoneEvalsConfigured(telephonyStore, ownerId) {
  return (await listOwnedInboundNumbers(telephonyStore, ownerId)).length > 0;
}

export async function canAccessPhoneEvals({ isPhoneEvalAdmin, telephonyStore, ownerId }) {
  const admin = typeof isPhoneEvalAdmin === "function" ? await isPhoneEvalAdmin() : Boolean(isPhoneEvalAdmin);
  if (admin) return true;
  return phoneEvalsConfigured(telephonyStore, ownerId);
}

export function canViewPhoneEvalCall({ isPhoneEvalAdmin, ownedDigits, call }) {
  if (isPhoneEvalAdmin) return true;
  const toDigits = phoneDigits(call?.toNumber);
  return Boolean(toDigits && ownedDigits.has(toDigits));
}
