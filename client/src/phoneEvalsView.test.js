import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYSIS_WINDOW_MS,
  CALL_WINDOW_MS,
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
  callIsUnfinished,
  callListStatus,
  canRerunAnalysis,
  complianceBadge,
  complianceReportState,
  evaluationNote,
  formatCallDuration,
  pollIntervalMs,
  selectedCall,
} from "./phoneEvalsView.js";

const now = Date.parse("2026-09-27T20:30:00.000Z");
const ago = (ms) => new Date(now - ms).toISOString();
const report = { findings: [{ check: "pii_scan", status: "flag" }], violationCount: 1 };

test("a live call, or a just-ended one still being analyzed, keeps the fast poll", () => {
  const live = { startedAt: ago(60_000) };
  const analyzing = { startedAt: ago(120_000), endedAt: ago(5_000), evaluationStatus: "pass" };
  const settled = {
    startedAt: ago(120_000),
    endedAt: ago(5_000),
    evaluationStatus: "pass",
    complianceStatus: "done",
  };
  assert.equal(callIsUnfinished(live, now), true);
  assert.equal(callIsUnfinished(analyzing, now), true);
  assert.equal(callIsUnfinished(settled, now), false);
  assert.equal(pollIntervalMs([settled, analyzing], now), POLL_ACTIVE_MS);
  assert.equal(pollIntervalMs([settled], now), POLL_IDLE_MS);
  assert.equal(pollIntervalMs([], now), POLL_IDLE_MS);
});

test("a result that never arrives stops the fast poll instead of spinning forever", () => {
  const orphanedCall = { startedAt: ago(CALL_WINDOW_MS + 1) };
  const oldCall = { startedAt: ago(ANALYSIS_WINDOW_MS * 3), endedAt: ago(ANALYSIS_WINDOW_MS + 1) };
  assert.equal(callIsUnfinished(orphanedCall, now), false);
  assert.equal(callIsUnfinished(oldCall, now), false);
  assert.match(complianceReportState(oldCall, now).idleMessage, /No compliance report for this call/);
  assert.match(complianceReportState(orphanedCall, now).idleMessage, /never finished recording/);
  assert.equal(evaluationNote(oldCall, now), "This call was not scored.");
});

test("the compliance tab maps each analysis state onto the shared Report", () => {
  const ended = { startedAt: ago(60_000), endedAt: ago(1_000) };
  assert.deepEqual(complianceReportState({ ...ended, complianceStatus: "done", complianceReport: report }, now), {
    report,
  });
  assert.deepEqual(complianceReportState(ended, now), { loading: true });
  assert.deepEqual(complianceReportState({ ...ended, complianceStatus: "error", complianceError: "gateway 500" }, now), {
    error: "gateway 500",
  });
  assert.match(complianceReportState({ ...ended, complianceStatus: "no_transcript" }, now).idleMessage, /no speech|before any speech/);
  assert.match(complianceReportState({ startedAt: ago(1_000) }, now).idleMessage, /starts as soon as it ends/);
});

test("the agent-instructions tab explains every non-verdict state", () => {
  const ended = { startedAt: ago(60_000), endedAt: ago(1_000) };
  assert.equal(evaluationNote({ startedAt: ago(1_000) }, now), "Call in progress…");
  assert.match(evaluationNote(ended, now), /Scoring the call/);
  assert.match(evaluationNote({ ...ended, evaluationStatus: "no_rubric" }, now), /instructions could not be loaded/);
  assert.equal(evaluationNote({ ...ended, evaluationStatus: "error", evaluationError: "boom" }, now), "boom");
  assert.equal(evaluationNote({ ...ended, evaluationStatus: "pass", verdict: "pass" }, now), null);
});

test("the compliance badge shows the flagged count once a report exists", () => {
  assert.equal(complianceBadge({ complianceStatus: "done", complianceReport: report }), "1 flagged");
  assert.equal(complianceBadge({ complianceStatus: "done", complianceReport: { findings: [], violationCount: 0 } }), "clear");
  assert.equal(complianceBadge({ complianceStatus: "done", complianceReport: { findings: [{ status: "flag" }, { status: "pass" }] } }), "1 flagged");
  assert.equal(complianceBadge({}), null);
});

test("a re-run is pending from when it started, and offered only once analysis settles", () => {
  const rerun = {
    startedAt: ago(ANALYSIS_WINDOW_MS * 3),
    endedAt: ago(ANALYSIS_WINDOW_MS * 2),
    analysisStartedAt: ago(1_000),
  };
  assert.equal(callIsUnfinished(rerun, now), true);
  assert.deepEqual(complianceReportState(rerun, now), { loading: true });
  assert.equal(canRerunAnalysis(rerun, now), false);
  assert.equal(canRerunAnalysis({ ...rerun, evaluationStatus: "error", complianceStatus: "done" }, now), true);
  assert.equal(canRerunAnalysis({ startedAt: ago(1_000) }, now), false);
});

test("call durations read as minutes and seconds", () => {
  assert.equal(formatCallDuration({ startedAt: ago(190_000), endedAt: ago(0) }), "3m 10s");
  assert.equal(formatCallDuration({ startedAt: ago(42_000), endedAt: ago(0) }), "42s");
  assert.equal(formatCallDuration({ startedAt: ago(1_000) }), null);
});

test("each call in the list shows where its analysis stands", () => {
  const ended = { startedAt: ago(60_000), endedAt: ago(1_000) };
  assert.deepEqual(callListStatus({ startedAt: ago(1_000) }, now), { label: "Call in progress", tone: "pending" });
  assert.deepEqual(callListStatus(ended, now), { label: "Analyzing…", tone: "pending" });
  assert.deepEqual(callListStatus({ ...ended, complianceStatus: "done", complianceReport: report }, now), {
    label: "1 flagged",
    tone: "flag",
  });
  assert.deepEqual(
    callListStatus({ ...ended, complianceStatus: "done", complianceReport: { findings: [], violationCount: 0 } }, now),
    { label: "No compliance flags", tone: "pass" },
  );
  assert.equal(callListStatus({ ...ended, complianceStatus: "error" }, now).label, "Analysis failed");
  assert.equal(callListStatus({ ...ended, complianceStatus: "no_transcript" }, now).label, "No speech captured");
  assert.equal(callListStatus({ startedAt: ago(ANALYSIS_WINDOW_MS * 3), endedAt: ago(ANALYSIS_WINDOW_MS * 2) }, now).label, "No report");
});

test("the report pane follows the picked call, else the most recent one", () => {
  const calls = [{ twilioCallSid: "CA2" }, { twilioCallSid: "CA1" }];
  assert.equal(selectedCall(calls, "CA1"), calls[1]);
  assert.equal(selectedCall(calls, null), calls[0]);
  assert.equal(selectedCall(calls, "CA_gone"), calls[0]);
  assert.equal(selectedCall([], "CA1"), null);
  assert.equal(selectedCall(null, null), null);
});
