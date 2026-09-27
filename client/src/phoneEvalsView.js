// Pure view logic for the Phone Evals page (client/src/PhoneEvals.jsx), kept out
// of the component so node --test can cover it.

// Both post-call analyses (server/qualeval/phoneEvaluation.js and
// phoneCompliance.js) start the moment a call ends. Past this window a
// missing result will never arrive: the process that owned it was restarted,
// or the call predates compliance analysis. Polling stops and the page says so
// instead of showing "running" forever.
export const ANALYSIS_WINDOW_MS = 10 * 60 * 1000;
// A call with no end time after this long lost its bridge (a redeploy mid-call).
export const CALL_WINDOW_MS = 15 * 60 * 1000;

export const POLL_ACTIVE_MS = 3000;
// Slower poll while nothing is running, so a new call shows up on its own.
export const POLL_IDLE_MS = 15000;

function ageMs(value, now) {
  const at = new Date(value ?? 0).getTime();
  return Number.isFinite(at) ? now - at : Infinity;
}

export function callInProgress(call, now = Date.now()) {
  return !call.endedAt && ageMs(call.startedAt, now) < CALL_WINDOW_MS;
}

// Analyses start at hangup, or again when an operator re-runs them.
function analysisPending(status, call, now) {
  return !status && Boolean(call.endedAt) && ageMs(call.analysisStartedAt ?? call.endedAt, now) < ANALYSIS_WINDOW_MS;
}

export function evaluationPending(call, now = Date.now()) {
  return analysisPending(call.evaluationStatus, call, now);
}

export function compliancePending(call, now = Date.now()) {
  return analysisPending(call.complianceStatus, call, now);
}

export function callIsUnfinished(call, now = Date.now()) {
  return callInProgress(call, now) || evaluationPending(call, now) || compliancePending(call, now);
}

export function pollIntervalMs(calls, now = Date.now()) {
  return (calls ?? []).some((call) => callIsUnfinished(call, now)) ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}

// What the Evaluation tab shows when there is no pass/fail verdict to render.
export function evaluationNote(call, now = Date.now()) {
  if (call.evaluationStatus === "no_rubric") {
    return "The answering agent's instructions could not be loaded, so this call was not scored.";
  }
  if (call.evaluationStatus === "no_transcript") return "Call ended before any speech was captured.";
  if (call.evaluationStatus === "error") return call.evaluationError || "Evaluation failed.";
  if (callInProgress(call, now)) return "Call in progress…";
  if (!call.endedAt) return "The call never finished recording, so it was not scored.";
  if (evaluationPending(call, now)) return "Scoring the call against the agent's instructions…";
  if (!call.evaluationStatus) return "This call was not scored.";
  return null;
}

// Props for the shared ComplyLine Report (Dashboard.jsx) on the Compliance tab.
export function complianceReportState(call, now = Date.now()) {
  if (call.complianceStatus === "done" && call.complianceReport) return { report: call.complianceReport };
  if (call.complianceStatus === "error") {
    return { error: call.complianceError || "The compliance analysis could not be completed." };
  }
  if (call.complianceStatus === "no_transcript") {
    return { idleMessage: "Call ended before any speech was captured, so there is nothing to check." };
  }
  if (callInProgress(call, now)) {
    return { idleMessage: "Call in progress. The compliance analysis starts as soon as it ends." };
  }
  if (compliancePending(call, now)) return { loading: true };
  if (!call.endedAt) return { idleMessage: "The call never finished recording, so it was not analyzed." };
  return { idleMessage: "No compliance report for this call. Calls placed before compliance analysis was added have none." };
}

// Tab badge: the headline number the operator scans for.
export function complianceBadge(call) {
  const report = call.complianceStatus === "done" ? call.complianceReport : null;
  if (!report) return null;
  const count = report.violationCount ?? (report.findings ?? []).filter((f) => f.status === "flag").length;
  return count === 0 ? "clear" : `${count} flagged`;
}

// Offered once both analyses have settled (or given up), e.g. after the LLM
// Gateway's rate limit left a check unable to run.
export function canRerunAnalysis(call, now = Date.now()) {
  return Boolean(call.endedAt) && !evaluationPending(call, now) && !compliancePending(call, now);
}

// "3m 10s" for the call list; null while the call is still going.
export function formatCallDuration(call) {
  if (!call.startedAt || !call.endedAt) return null;
  const totalSeconds = Math.round((new Date(call.endedAt) - new Date(call.startedAt)) / 1000);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// One-line status for a call in the left-hand list. tone picks the colour:
// flag (red), pass (green), pending (animated), or muted.
export function callListStatus(call, now = Date.now()) {
  if (callInProgress(call, now)) return { label: "Call in progress", tone: "pending" };
  if (compliancePending(call, now)) return { label: "Analyzing…", tone: "pending" };
  if (call.complianceStatus === "done" && call.complianceReport) {
    const badge = complianceBadge(call);
    return badge === "clear" ? { label: "No compliance flags", tone: "pass" } : { label: `${badge}`, tone: "flag" };
  }
  if (call.complianceStatus === "error") return { label: "Analysis failed", tone: "flag" };
  if (call.complianceStatus === "no_transcript") return { label: "No speech captured", tone: "muted" };
  return { label: "No report", tone: "muted" };
}

// Which call the right-hand pane shows: the one the operator picked, as long
// as it is still listed, else the most recent call.
export function selectedCall(calls, selectedSid) {
  if (!calls?.length) return null;
  return calls.find((call) => call.twilioCallSid === selectedSid) ?? calls[0];
}
