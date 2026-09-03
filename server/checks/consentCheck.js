// TCPA consent-event-logged check: was a valid consent event logged before the call.
export function consentCheck(session) {
  const event = session.consentEvent;
  if (!event || event.granted !== true) {
    return {
      check: "consent",
      status: "flag",
      detail: "No consent event logged before this call (TCPA).",
    };
  }
  if (session.startedAt && new Date(event.timestamp) > new Date(session.startedAt)) {
    return {
      check: "consent",
      status: "flag",
      detail: "Consent event was logged after the call started, not before.",
    };
  }
  return {
    check: "consent",
    status: "pass",
    detail: `Consent event logged at ${event.timestamp}.`,
  };
}
