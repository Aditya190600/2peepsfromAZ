import { phoneDigits } from "./productionCalls.js";

// Phone Evals visibility: operators see every call; everyone else sees only
// calls to numbers they registered via server/telephony/store.js.

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

export async function canAccessPhoneEvals({ isOperator, telephonyStore, ownerId }) {
  const operator = typeof isOperator === "function" ? await isOperator() : Boolean(isOperator);
  if (operator) return true;
  return phoneEvalsConfigured(telephonyStore, ownerId);
}

export function canViewPhoneEvalCall({ isOperator, ownedDigits, call }) {
  if (isOperator) return true;
  const toDigits = phoneDigits(call?.toNumber);
  return Boolean(toDigits && ownedDigits.has(toDigits));
}
