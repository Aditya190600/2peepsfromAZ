import { useEffect, useMemo, useRef, useState } from "react";
import RateLimitBanner from "./RateLimitBanner";
import { useVoiceAgent } from "./useVoiceAgent";
import { SAMPLE_SESSIONS, NORTHSTAR_SESSIONS } from "./sampleSessions";
import { AppShell } from "./Chrome";
import { summarizeFleet, monitorTiles } from "./fleetStats";
import AudioPlayer from "./AudioPlayer";
import ProviderSettings from "./ProviderSettings";
import { saveHistoryEntry, buildHistoryEntry, findEntryBySessionId } from "./reportHistory";
import { getLiveAudioBlob, registerLiveAudioBlob } from "./liveAudioBlobs";
import { seekAudio } from "./seek";
import {
  CHECK_LABEL,
  CHECK_CITATION,
  PACK_CITATION,
  sortFindingsBySeverity,
  headlineVerdict,
  reportView,
  VERDICT_CLASS,
} from "./compliance";
import {
  analyze,
  transcribeUpload,
  ingestSession,
  uploadRecording,
  findRateLimitedFinding,
  llmParsePastedSession,
} from "./analyzeClient";
import { listIndustryPacks } from "./evalsClient";
import PackEvals from "./PackEvals";
import PatternPackSelect from "./PatternPackSelect";
import { parseSessionPaste } from "./sessionPaste";
import { PERSONAS, findPersona } from "./personas";
import { getDefaultPersonaId, setDefaultPersonaId } from "./personaPreference";
import { ExamplesPanels } from "./Examples";
import "./App.css";

// Folds one streamed check-progress event (see analyzeClient.js's
// analyze(..., onProgress)) into the running totals shown in the
// "Analyzing…" state - see compliance.js's formatAnalyzingMessage - and
// into the list of findings rendered so far. Each event now carries the
// full finding as soon as its check resolves, so `findings` fills in one
// card at a time instead of the whole list appearing at once when the
// slowest remaining check (usually an LLM Gateway call) finally finishes.
export function accumulateProgress(prev, event) {
  const base =
    prev ?? { checksDone: 0, checksTotal: 0, tokensUsed: 0, costUsd: 0, costKnown: false, violationCount: 0, findings: [] };
  const finding = event.finding;
  return {
    checksDone: base.checksDone + 1,
    checksTotal: event.checksTotal ?? base.checksTotal,
    tokensUsed: base.tokensUsed + (finding?.llmUsage?.totalTokens ?? 0),
    costUsd: base.costUsd + (typeof finding?.llmCostUsd === "number" ? finding.llmCostUsd : 0),
    costKnown: base.costKnown || typeof finding?.llmCostUsd === "number",
    violationCount: base.violationCount + (finding?.status === "flag" ? 1 : 0),
    findings: finding ? [...base.findings, finding] : base.findings,
  };
}

export function formatTMs(tMs) {
  const totalSeconds = Math.floor(tMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const STATUS_LABEL = {
  idle: "Not on a call",
  connecting: "Connecting…",
  ready: "Live",
  error: "Connection error",
};

export const PLAYABLE_SAMPLE_LABEL = {
  "clean-call": "Clean call — everything passes",
  "tcpa-violation": "TCPA violation — no consent, SSN spoken",
  "optout-ignored": "Opt-out request ignored by agent",
  "healthcare-hipaa": "Healthcare call — HIPAA identifiers spoken",
  "late-disclosure": "Late disclosure — AI mentioned after 10s window",
  "clean-call-2": "Clean call — billing reminder, everything passes",
};

const NORTHSTAR_LABEL = {
  sess_tcpa_04: "TCPA violation — no consent logged",
  sess_late_01: "Late AI disclosure — outside the 10s window",
};

const SCRIPTED_VIOLATION_DEMO_LABEL = {
  "hipaa-diagnosis-readback": "HIPAA — agent reads back diagnosis and MRN",
  "glba-account-disclosure": "GLBA — agent discloses routing and loan number",
};

export function sampleLabel(key) {
  if (PLAYABLE_SAMPLE_LABEL[key]) return PLAYABLE_SAMPLE_LABEL[key];
  if (NORTHSTAR_LABEL[key]) return NORTHSTAR_LABEL[key];
  if (SCRIPTED_VIOLATION_DEMO_LABEL[key]) return SCRIPTED_VIOLATION_DEMO_LABEL[key];
  if (key.startsWith("sess_clean_")) return "Clean call — everything passes";
  return key;
}

// Packs whose "Verify" self-test is hidden from the Try page (not part of the
// demo). The pack itself still runs in reports; only its verify entry is hidden.
const PACK_EVALS_HIDDEN = new Set(["hipaa"]);

export const INDUSTRY_PACKS = [
  {
    id: "hipaa",
    name: "HIPAA identifiers (healthcare)",
    patterns: [
      { id: "mrn", label: "Possible Medical Record Number (MRN)" },
      { id: "npi", label: "Possible National Provider Identifier (NPI)" },
      { id: "patient_id", label: "Possible patient ID" },
    ],
  },
  {
    id: "finance",
    name: "GLBA finance identifiers (banking)",
    patterns: [
      { id: "routing_number", label: "Possible ABA routing number" },
      { id: "iban", label: "Possible IBAN" },
      { id: "loan_number", label: "Possible loan or brokerage number" },
    ],
  },
  {
    id: "ferpa",
    name: "FERPA identifiers (education)",
    patterns: [
      { id: "student_number", label: "Possible student number" },
      { id: "student_dob", label: "Possible student date of birth" },
      { id: "mothers_maiden_name", label: "Possible student's mother's maiden name" },
    ],
  },
  {
    id: "tcpa",
    name: "TCPA consent (robocall / marketing calls)",
    patterns: [],
    detectionSummary: "Consent event logged before call",
  },
  {
    id: "recording_consent",
    name: "Call-recording consent (two-party-consent states)",
    patterns: [],
    detectionSummary: "Recording-disclosure language in first 10s",
  },
];

export function sessionByKey(key) {
  return SAMPLE_SESSIONS[key] ?? NORTHSTAR_SESSIONS[key];
}

// Hidden, not deleted - same hidden-but-reachable pattern as PRODUCT_NAV_ALL in chromeNav.js.
// Flip to true to bring the "Demo: try your own audio" upload section back onto the Try page.
const SHOW_AUDIO_UPLOAD_DEMO = false;

const STATUS_CLASS = { flag: "is-flag", pass: "is-pass", "n/a": "is-na", error: "is-na" };
const STATUS_TEXT = { flag: "Flag", pass: "Pass", "n/a": "N/A", error: "Unable to run" };

export function Timestamp({ tMs, onSeek }) {
  if (tMs == null) return null;
  if (!onSeek) {
    return <span className="finding-timestamp">{formatTMs(tMs)}</span>;
  }
  return (
    <button
      type="button"
      className="finding-timestamp finding-timestamp-clickable"
      onClick={() => onSeek(tMs)}
      title="Jump to this point in the audio"
    >
      ▶ {formatTMs(tMs)}
    </button>
  );
}

function Finding({ finding, onSeek }) {
  return (
    <div className={`finding ${STATUS_CLASS[finding.status] ?? "is-pass"}`}>
      <div className="finding-head">
        <span className="finding-status">{STATUS_TEXT[finding.status] ?? finding.status}</span>
        <span className="finding-name">{CHECK_LABEL[finding.check] ?? finding.check}</span>
        <Timestamp tMs={finding.tMs} onSeek={onSeek} />
      </div>
      {finding.detail && <p className="finding-detail">{finding.detail}</p>}
      <p className="finding-citation">{CHECK_CITATION[finding.check]}</p>
      {finding.check === "pii_scan" && (
        <ul className="finding-items">
          {finding.items.map((item, i) => (
            <li key={i}>
              <div>
                turn {item.turnIndex} ({item.role}) — {item.label}{" "}
                <span className="pack-tag">[{item.packId}]</span>: {item.matchRedacted}{" "}
                <Timestamp tMs={item.tMs} onSeek={onSeek} />
              </div>
              {PACK_CITATION[item.packId] && (
                <div className="finding-item-citation">{PACK_CITATION[item.packId]}</div>
              )}
            </li>
          ))}
          {finding.items.length === 0 && <li>No matches.</li>}
        </ul>
      )}
    </div>
  );
}

function IntroSteps() {
  return (
    <div className="intro-steps">
      <h2>How this works</h2>
      <p className="intro-lede">
        ComplyLine reviews one completed AssemblyAI voice call and reports whether it met a set of
        compliance checks, ranked by severity. Try it with a live call:
      </p>
      <ol className="intro-list">
        <li>
          <span className="intro-num">1</span>
          <div>
            <strong>Start a live call</strong>
            <p>
              Click <em>Start call</em> above. Your browser will ask for microphone access — allow
              it so your voice can reach the AssemblyAI agent.
            </p>
          </div>
        </li>
        <li>
          <span className="intro-num">2</span>
          <div>
            <strong>Talk to the agent</strong>
            <p>
              It's a real voice conversation — say hello, ask a question, anything. The agent
              discloses up front that it's AI, and the transcript fills in live as you speak.
            </p>
          </div>
        </li>
        <li>
          <span className="intro-num">3</span>
          <div>
            <strong>End the call for your report</strong>
            <p>
              Click <em>End call</em> - the report generates automatically and saves to your
              Sessions history. It ranks findings by severity, with a regulatory citation on each.
            </p>
          </div>
        </li>
      </ol>
    </div>
  );
}

function progressFillClass(percent) {
  return percent < 50 ? "app-progress-fill is-low" : "app-progress-fill";
}

function FleetSummary({ results, progress }) {
  const { total, passed, flagged, erroredOnly, complianceRate, perCheck } = summarizeFleet(results);
  const tiles = monitorTiles(perCheck);

  return (
    <div className="fleet-board">
      {progress && progress.done < progress.total && (
        <p className="fleet-progress">
          Analyzing… {progress.done} of {progress.total} sessions complete
          {progress.tokensUsed > 0 && ` · ${progress.tokensUsed.toLocaleString()} tokens used`}
          {progress.costKnown && ` · ~$${progress.costUsd.toFixed(4)} estimated`}
          {progress.violationCount != null &&
            ` · ${progress.violationCount} violation${progress.violationCount === 1 ? "" : "s"} found so far`}
        </p>
      )}
      <section className="monitor-card fleet-progress-card">
        <p className="monitor-kicker">Voice agent fleet</p>
        <p className="fleet-rate">
          <span className="fleet-rate-number">{complianceRate}%</span>
        </p>
        <div className="app-progress-track" aria-hidden="true">
          <div className={progressFillClass(complianceRate)} style={{ width: `${complianceRate}%` }} />
        </div>
        <p className="fleet-headline">
          <strong>{passed}</strong> of <strong>{total}</strong> calls passed every check ·{" "}
          <strong>{flagged}</strong> flagged
          {erroredOnly > 0 && (
            <>
              {" "}
              · <strong>{erroredOnly}</strong> could not be fully checked
            </>
          )}
        </p>
      </section>
      <h3 className="monitor-heading">Monitoring</h3>
      <ul className="monitor-grid">
        {tiles.map((tile) => {
          const passRate = tile.total
            ? Math.round(((tile.total - tile.flag) / tile.total) * 100)
            : 0;
          return (
            <li key={tile.check} className="monitor-card">
              <p className="monitor-kicker">{tile.label}</p>
              <p className="monitor-attention">{tile.flag > 0 ? "Needs attention" : "Clear"}</p>
              <p className="monitor-count">{tile.flag}</p>
              <div className="app-progress-track" aria-hidden="true">
                <div className={progressFillClass(passRate)} style={{ width: `${passRate}%` }} />
              </div>
              <p className="monitor-meta">
                {tile.pass} pass
                {tile.na > 0 ? ` · ${tile.na} n/a` : ""}
                {tile.error > 0 ? ` · ${tile.error} unable to run` : ""}
                {` · ${tile.total} total`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FleetView({ results, progress, navigate }) {
  const [rateLimitDismissed, setRateLimitDismissed] = useState(false);
  useEffect(() => setRateLimitDismissed(false), [results]);

  const openReport = (sessionId) => {
    if (!navigate || !sessionId) return;
    navigate(`/sessions/${encodeURIComponent(sessionId)}`);
  };

  const anyRateLimited = results.some((r) => findRateLimitedFinding(r.report));

  return (
    <div>
      {anyRateLimited && !rateLimitDismissed && (
        <RateLimitBanner onDismiss={() => setRateLimitDismissed(true)} />
      )}
      <FleetSummary results={results} progress={progress} />
      <h3 className="monitor-heading">Sessions</h3>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Verdict</th>
              <th>Session ID</th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ key, report }) => {
              const verdict = headlineVerdict(report.findings);
              const clickable = Boolean(navigate && report.sessionId);
              return (
                <tr
                  key={key}
                  className={clickable ? "is-clickable" : undefined}
                  onClick={clickable ? () => openReport(report.sessionId) : undefined}
                >
                  <td>{sampleLabel(key)}</td>
                  <td>
                    <span className={`finding-status ${VERDICT_CLASS[verdict.level] ?? "is-review"}`}>
                      {verdict.label}
                    </span>
                  </td>
                  <td className="mono">{report.sessionId}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function downloadReportJson(report, verdict) {
  const payload = {
    sessionId: report.sessionId ?? null,
    generatedAt: report.generatedAt,
    verdict: verdict.label,
    findings: sortFindingsBySeverity(report.findings),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compliance-report-${report.sessionId ?? "session"}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Flattens a report's findings into AudioPlayer markers: one per finding with
// a tMs (kind "flag" when the finding itself is flagged), plus one per
// pii_scan item (which carries its own tMs distinct from the finding's).
function findingsToMarkers(findings) {
  const markers = [];
  for (const f of findings ?? []) {
    if (f.tMs != null) {
      markers.push({ tMs: f.tMs, kind: f.status === "flag" ? "flag" : "turn", label: CHECK_LABEL[f.check] ?? f.check });
    }
    if (f.check === "pii_scan") {
      for (const item of f.items ?? []) {
        if (item.tMs != null) {
          markers.push({ tMs: item.tMs, kind: "flag", label: `${item.label} [${item.packId}]` });
        }
      }
    }
  }
  return markers;
}

export function Report({
  report,
  audioUrl,
  audioRef,
  audioOffsetMs = 0,
  turns = null,
  onSeek,
  loading = false,
  error = null,
  progress = null,
  idleMessage,
  showStorageNote = false,
  navigate,
}) {
  const [rateLimitDismissed, setRateLimitDismissed] = useState(false);
  useEffect(() => setRateLimitDismissed(false), [report]);

  const view = reportView({ report, loading, error, progress });
  if (view.kind !== "ready") {
    // While loading, each streamed check's finding is already sitting in
    // progress.findings the moment its check resolves - render those cards
    // immediately instead of leaving the screen on just the counter text
    // until every check (including the slowest one) finishes.
    const partialFindings = view.kind === "loading" ? sortFindingsBySeverity(progress?.findings ?? []) : [];
    return (
      <div className={`report-state ${view.className}`}>
        <span className={`report-verdict finding-status ${view.className}`}>{view.label}</span>
        <p>{view.kind === "idle" && idleMessage ? idleMessage : view.message}</p>
        {partialFindings.map((f) => (
          <Finding key={f.check} finding={f} onSeek={audioUrl ? onSeek : null} />
        ))}
      </div>
    );
  }
  const sortedFindings = sortFindingsBySeverity(report.findings);
  const verdict = headlineVerdict(report.findings);
  const rateLimitedFinding = findRateLimitedFinding(report);
  const audioMarkers = findingsToMarkers(report.findings);
  return (
    <div>
      {rateLimitedFinding && !rateLimitDismissed && (
        <RateLimitBanner onDismiss={() => setRateLimitDismissed(true)} />
      )}
      <div className="report-toolbar">
        <div>
          <p className="report-meta">
            {report.sessionId ?? "no session id"} · generated {report.generatedAt}
          </p>
          {/* The headline verdict is a status, not an action - the label
              keeps a bare "Clear" from reading as a dead Clear button. */}
          <p className="report-verdict-line">
            Overall verdict:{" "}
            <span className={`report-verdict finding-status ${view.className}`}>
              {verdict.label}
            </span>
          </p>
        </div>
        <div className="report-toolbar-actions">
          <button className="btn btn-outline print-btn" onClick={() => window.print()}>
            Print report
          </button>
          <button
            className="btn btn-outline export-json-btn"
            onClick={() => downloadReportJson(report, verdict)}
          >
            Export as JSON
          </button>
        </div>
      </div>
      {showStorageNote && (
        <p className="pack-note report-storage-note">
          This report and transcript are saved to your browser's local history - find it anytime
          on the{" "}
          {navigate ? (
            <a
              href="/sessions"
              onClick={(e) => {
                e.preventDefault();
                navigate("/sessions");
              }}
            >
              Sessions
            </a>
          ) : (
            "Sessions"
          )}{" "}
          page. Live call audio is stored only when "Record this call" is checked.
        </p>
      )}
      {audioUrl && (
        <div className="report-audio">
          <AudioPlayer
            src={audioUrl}
            audioRef={audioRef}
            offsetMs={audioOffsetMs}
            turns={turns}
            markers={audioMarkers}
          />
          <p className="hint">
            Findings with a ▶ timestamp are clickable - click one to jump the player there, or
            click a marker on the waveform (red marks a flagged finding).
          </p>
        </div>
      )}
      <div className="print-letterhead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>ComplyLine</h1>
        </div>
        <p>Post-call compliance report — {verdict.label}</p>
        <p className="report-meta">
          {report.sessionId ?? "no session id"} · generated {report.generatedAt}
        </p>
      </div>
      {sortedFindings.map((f) => (
        <Finding key={f.check} finding={f} onSeek={audioUrl ? onSeek : null} />
      ))}
      <p className="print-footer">
        Generated by ComplyLine — automated pattern-based screening, not legal advice.
      </p>
    </div>
  );
}

// Lightweight step-through walkthrough: no target measurement library, just
// getBoundingClientRect on the step's own ref plus scrollIntoView. Steps are
// {ref, title, body} tuples supplied by the caller; the caller also owns
// switching tabs so a step's target actually exists in the DOM before this
// renders it.
function TourOverlay({ steps, stepIndex, onNext, onPrev, onClose }) {
  const [rect, setRect] = useState(null);
  const step = steps[stepIndex];

  useEffect(() => {
    const node = step?.ref?.current;
    if (!node) {
      setRect(null);
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const measure = () => setRect(node.getBoundingClientRect());
    const t = setTimeout(measure, 260); // let the smooth scroll settle
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  if (!step) return null;

  const tooltipTop = rect ? Math.min(rect.bottom + 12, window.innerHeight - 160) : window.innerHeight / 2;
  const tooltipLeft = rect ? Math.min(Math.max(rect.left, 16), window.innerWidth - 316) : 16;

  return (
    <div className="tour-overlay" role="dialog" aria-label="Guided walkthrough">
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div className="tour-tooltip" style={{ top: tooltipTop, left: tooltipLeft }}>
        <p className="tour-step-count">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-tooltip-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Skip tour
          </button>
          <div className="tour-tooltip-nav">
            {stepIndex > 0 && (
              <button type="button" className="btn btn-outline" onClick={onPrev}>
                Back
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onNext}>
              {stepIndex === steps.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ navigate, path }) {
  const {
    status,
    transcript,
    lastSession,
    micSilent,
    connectError,
    recordedBlob,
    connect,
    disconnect,
  } = useVoiceAgent();
  const [personaId, setPersonaId] = useState(() => getDefaultPersonaId());
  const [selectedPacks, setSelectedPacks] = useState(() => findPersona(getDefaultPersonaId()).packIds);
  const [seedViolation, setSeedViolation] = useState(false);
  const [recordCall, setRecordCall] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState(null);
  const [webhookApiKey, setWebhookApiKey] = useState("");
  const [webhookStatus, setWebhookStatus] = useState("idle"); // idle | sending | sent | error
  const [webhookError, setWebhookError] = useState(null);
  const [report, setReport] = useState(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState(null);
  const [activeAudioOffsetMs, setActiveAudioOffsetMs] = useState(0);
  const [activeTurns, setActiveTurns] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle | uploading | error
  const [uploadError, setUploadError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteError, setPasteError] = useState(null);
  const [industryPacks, setIndustryPacks] = useState(INDUSTRY_PACKS);
  const [packCatalogStale, setPackCatalogStale] = useState(false);
  const [sessionTab, setSessionTab] = useState("live"); // live | webhook | paste
  const [tourStep, setTourStep] = useState(-1); // -1 = not running
  const audioRef = useRef(null);
  const reportHeadingRef = useRef(null);
  const liveHistoryIdRef = useRef(null);
  const liveSessionRef = useRef(null);
  const personaSectionRef = useRef(null);
  const startCallRef = useRef(null);
  const callStatusRef = useRef(null);
  // { sessionId, promise<bucketUrl|null> } for the in-flight/completed bucket
  // upload of the current recording - null promise result means the bucket
  // isn't configured (local dev) or the upload failed, so callers fall back
  // to the in-memory blob URL (recordingUrl below).
  const recordingUploadRef = useRef({ sessionId: null, promise: null });
  // sessionId of the live call whose recording the report player is showing,
  // or null when it's showing anything else (sample, upload, nothing).
  const audioOwnerRef = useRef(null);

  const patternPackIds = ["generic", ...selectedPacks];
  const canStart = status === "idle" || status === "error";
  const selectedPersona = findPersona(personaId);

  const togglePack = (id) => {
    setSelectedPacks((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  // Persona choice auto-selects (opt-out, not opt-in) the industry pattern
  // pack(s) that match its domain - the user can still uncheck any above.
  const selectPersona = (id) => {
    setPersonaId(id);
    setDefaultPersonaId(id);
    setSeedViolation(false);
    setSelectedPacks(findPersona(id).packIds);
  };

  // Attaches a recording's durable bucket URL to its live-call history entry
  // after the fact - covers the race where the recorder's own async
  // stop+upload finishes after runLiveReport already saved the entry without
  // it. A no-op if the call has since moved on, or the entry already has one.
  const attachRecordingToHistory = (sessionId, url) => {
    if (!url || liveSessionRef.current?.sessionId !== sessionId) return;
    const id = liveHistoryIdRef.current;
    if (!id) return;
    const existing = findEntryBySessionId(sessionId);
    if (!existing || existing.id !== id || existing.recordingUrl) return;
    const offsetMs = liveSessionRef.current.recordingOffsetMs;
    saveHistoryEntry({ ...existing, recordingUrl: url, ...(offsetMs ? { recordingOffsetMs: offsetMs } : {}) });
    if (audioOwnerRef.current === sessionId) showAudio(url, offsetMs, sessionId);
  };

  useEffect(() => {
    if (!recordedBlob) {
      setRecordingUrl(null);
      return;
    }
    const url = URL.createObjectURL(recordedBlob);
    setRecordingUrl(url);
    const sessionId = lastSession?.sessionId;
    if (sessionId) {
      registerLiveAudioBlob(sessionId, url); // in-tab fallback if the bucket upload below fails or isn't configured
      if (audioOwnerRef.current === sessionId) showAudio(url, lastSession.recordingOffsetMs, sessionId);
      recordingUploadRef.current = {
        sessionId,
        promise: uploadRecording(sessionId, recordedBlob)
          .then((bucketUrl) => {
            attachRecordingToHistory(sessionId, bucketUrl);
            return bucketUrl;
          })
          .catch((err) => {
            console.log(`Recording not persisted to bucket, using local blob only: ${err.message}`);
            return null;
          }),
      };
    }
    // A registered URL stays alive for history reopen (liveAudioBlobs.js).
    if (!sessionId) return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordedBlob, lastSession]);

  const showAudio = (url, offsetMs = 0, ownerSessionId = null) => {
    audioOwnerRef.current = ownerSessionId;
    setActiveAudioUrl(url);
    setActiveAudioOffsetMs(offsetMs);
  };

  const onSeek = (tMs) => seekAudio(audioRef, tMs, activeAudioOffsetMs);

  useEffect(() => {
    document.title = report ? `ComplyLine report — ${report.sessionId ?? "session"}` : "ComplyLine";
  }, [report]);

  useEffect(() => {
    let cancelled = false;
    listIndustryPacks()
      .then((packs) => {
        if (!cancelled && packs.length > 0) setIndustryPacks(packs);
      })
      .catch(() => {
        if (!cancelled) setPackCatalogStale(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recordHistory = (label, report, session, opts = {}) => {
    const verdict = headlineVerdict(report.findings);
    saveHistoryEntry(buildHistoryEntry({ label, report, session, verdict, ...opts }));
  };

  const clearLabErrors = () => {
    setLiveError(null);
    setUploadError(null);
    setUploadStatus("idle");
    setPasteError(null);
  };

  // Writes the live call's history entry (replacing entry `id` in place when
  // given) and returns its id - pending and transcript-only when `report` is
  // null. `recordingUrl` must be a durable server path, never a blob: URL -
  // see buildHistoryEntry.
  const saveLiveHistory = (report, id, recordingUrl, recordingOffsetMs) =>
    saveHistoryEntry({
      ...buildHistoryEntry({
        label: "Live call",
        report,
        session: lastSession,
        verdict: report ? headlineVerdict(report.findings) : undefined,
        durationMs: lastSession.endedAtMs - lastSession.startedAtMs,
        source: "live",
        patternPackIds,
        recordingUrl,
        recordingOffsetMs,
      }),
      ...(id ? { id } : {}),
    });

  const runLiveReport = async () => {
    if (!lastSession) return;
    clearLabErrors();
    setLiveLoading(true);
    setAnalysisProgress(null);
    const historyId = liveHistoryIdRef.current;
    const isCurrent = () => liveHistoryIdRef.current === historyId;
    try {
      // Not recorded (recordCall was off) -> no audio, same as before.
      // Recorded -> the in-memory blob plays immediately; if the bucket
      // upload for this same session has resolved, prefer its durable URL
      // so the report (and history entry below) survive a reload. If the
      // upload is still in flight, attachRecordingToHistory fills it in once
      // it resolves.
      const { sessionId, recordingOffsetMs } = lastSession;
      const bucketUrl =
        recordingUploadRef.current.sessionId === sessionId ? await recordingUploadRef.current.promise : null;
      if (isCurrent()) {
        showAudio(bucketUrl ?? getLiveAudioBlob(sessionId), recordingOffsetMs, sessionId);
        setActiveTurns(lastSession.turns ?? null);
      }
      const nextReport = await analyze(lastSession, patternPackIds, (event) => {
        if (isCurrent()) setAnalysisProgress((prev) => accumulateProgress(prev, event));
      });
      const attached = findEntryBySessionId(sessionId);
      saveLiveHistory(
        nextReport,
        historyId,
        bucketUrl ?? (attached?.id === historyId ? attached.recordingUrl : undefined),
        recordingOffsetMs
      );
      if (isCurrent()) setReport(nextReport);
    } catch (err) {
      if (isCurrent()) setLiveError(err.message ?? "Something went wrong generating this report.");
    } finally {
      if (isCurrent()) setLiveLoading(false);
    }
  };

  // A completed live call exists only in `lastSession` React state, so save a
  // pending, transcript-only history entry the moment the call ends - before
  // the slow analyze round-trip - so a refresh or a failed analyze can't lose
  // it. The report then fills in that same entry; a pending entry left behind
  // can be regenerated from its /sessions page.
  useEffect(() => {
    if (lastSession === liveSessionRef.current) return;
    liveSessionRef.current = lastSession;
    setLiveLoading(false);
    setLiveError(null);
    liveHistoryIdRef.current = lastSession ? saveLiveHistory(null) : null;
    if (lastSession) runLiveReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSession]);

  // Try-as-webhook-sandbox: the persona picker's own action for sending the
  // persona call's transcript through the same /v1/ingest/:apiKey path a
  // real customer integration would use, instead of the direct
  // /v1/analyze-session path above. Ingest acks immediately and analyzes
  // async server-side, so there is no report to show inline here - this
  // genuinely exercises the webhook receiver, not a synchronous report.
  const runWebhookSandbox = async () => {
    if (!lastSession || !webhookApiKey.trim()) return;
    setWebhookStatus("sending");
    setWebhookError(null);
    try {
      await ingestSession(webhookApiKey.trim(), lastSession);
      setWebhookStatus("sent");
    } catch (err) {
      setWebhookStatus("error");
      setWebhookError(err.message ?? "Something went wrong sending this call to the webhook receiver.");
    }
  };

  // Strict session JSON parses locally, for free (parseSessionPaste). Any
  // other text - a raw transcript, a dictation, a rough call log - falls
  // back to the LLM Gateway (server-side, via llmParsePastedSession) to
  // extract a session out of it instead of rejecting the paste outright.
  const runPaste = async () => {
    showAudio(null);
    clearLabErrors();
    setPasteLoading(true);
    try {
      const strict = parseSessionPaste(pasteText);
      const session = strict.ok ? strict.session : await llmParsePastedSession(pasteText);
      setActiveTurns(session.turns ?? null);
      const nextReport = await analyze(session, patternPackIds);
      setReport(nextReport);
      recordHistory(`Pasted session (${session.sessionId ?? "no session id"})`, nextReport, session);
    } catch (err) {
      setPasteError(err.message ?? "Something went wrong analyzing this paste.");
      setReport(null);
    } finally {
      setPasteLoading(false);
    }
  };

  const runUpload = async (file, { label = "Uploaded audio" } = {}) => {
    if (!file) return;
    setReport(null);
    clearLabErrors();
    setUploadStatus("uploading");
    const blobUrl = URL.createObjectURL(file);
    showAudio(blobUrl);
    try {
      const session = await transcribeUpload(file);
      setActiveTurns(session.turns ?? null);
      const nextReport = await analyze(session, patternPackIds);
      setReport(nextReport);
      registerLiveAudioBlob(session.sessionId, blobUrl);
      recordHistory(label, nextReport, session);
      setUploadStatus("idle");
    } catch (err) {
      setUploadStatus("error");
      setUploadError(err.message ?? "Something went wrong processing this file.");
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    runUpload(e.dataTransfer.files?.[0]);
  };

  // Take-a-tour: highlights the live-call flow in order. Targets live in two
  // different panels (persona on the left, call controls + report on
  // the right), so starting the tour also forces the Live call tab active.
  const tourSteps = useMemo(
    () => [
      {
        ref: personaSectionRef,
        title: "1. Pick a persona",
        body: "Choose who the AI agent plays on this call. Each persona has its own scope and voice - picking one also auto-selects the matching pattern packs below.",
      },
      {
        ref: startCallRef,
        title: "2. Start the call",
        body: "Click Start call, then allow microphone access when your browser asks for it.",
      },
      {
        ref: callStatusRef,
        title: "3. Watch the live status",
        body: "This shows the call's connection state - Connecting, then Live once the agent is on the line and your transcript is filling in.",
      },
      {
        ref: reportHeadingRef,
        title: "4. Get your report",
        body: "Click End call and a compliance report generates automatically here, ranked by severity with a citation on every finding.",
      },
    ],
    [],
  );

  const startTour = () => {
    setSessionTab("live");
    setTourStep(0);
  };
  const closeTour = () => setTourStep(-1);
  const nextTourStep = () => {
    if (tourStep >= tourSteps.length - 1) {
      closeTour();
      return;
    }
    setTourStep((s) => s + 1);
  };
  const prevTourStep = () => setTourStep((s) => Math.max(0, s - 1));

  const reportLoading = liveLoading || pasteLoading || uploadStatus === "uploading";
  const reportError = liveError || pasteError || (uploadStatus === "error" ? uploadError : null);

  useEffect(() => {
    if (!reportLoading && !report) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    reportHeadingRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [reportLoading, report]);

  // Shared top-level tab bar: "Live call" covers the live/webhook/paste
  // sub-flows (webhook and paste stay hidden sub-tabs, same pattern as
  // before), "Compliance Examples" is the embedded Examples.jsx content
  // (ExamplesPanels) - folded in from its own nav-rail page.
  const topTabBar = (
    <div className="tab-bar-row">
      <div className="tab-bar">
        <button
          type="button"
          className={`tab-btn ${
            sessionTab === "live" || sessionTab === "webhook" || sessionTab === "paste" ? "is-active" : ""
          }`}
          onClick={() => setSessionTab("live")}
        >
          Live call
        </button>
        <button
          type="button"
          className={`tab-btn ${sessionTab === "examples" ? "is-active" : ""}`}
          onClick={() => setSessionTab("examples")}
        >
          Compliance Examples
        </button>
      </div>
      {sessionTab !== "examples" && (
        <button type="button" className="btn btn-outline tour-start-btn" onClick={startTour}>
          Take a tour
        </button>
      )}
    </div>
  );

  return (
    <AppShell path={path} navigate={navigate} title="Compliance Lab">
      <main className="layout styled-page try-page">
        {sessionTab === "examples" ? (
          <ExamplesPanels
            navigate={navigate}
            topTabBar={topTabBar}
            onShowLiveCall={() => setSessionTab("live")}
          />
        ) : (
          <>
        <section className="panel session-panel">
          <div className="section-block" ref={personaSectionRef}>
            <h2>Persona</h2>
            <p className="pack-note">
              Pick who the AI agent plays for this call - each persona has an explicit CAN/CANNOT
              scope and its own failure-mode boundary. Picking a persona auto-selects its matching
              pattern pack(s) below (uncheck any you don't want).
            </p>
            <select
              className="persona-select"
              aria-label="Persona"
              value={personaId}
              onChange={(e) => selectPersona(e.target.value)}
              disabled={!canStart}
            >
              {PERSONAS.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.label}
                </option>
              ))}
            </select>
            <p className="pack-note persona-checks">
              {selectedPersona.description} Checks:{" "}
              {[
                "PII scan",
                ...selectedPersona.packIds.map(
                  (id) => industryPacks.find((pack) => pack.id === id)?.name ?? id,
                ),
              ].join(", ")}
            </p>
            {selectedPersona.violation && (
              <label className={`check-row ${!canStart ? "disabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={seedViolation}
                  onChange={(e) => setSeedViolation(e.target.checked)}
                  disabled={!canStart}
                />
                Seed a compliance violation on this call ({selectedPersona.violation.label}) — demos
                the report catching a failure instead of a clean pass.
              </label>
            )}
          </div>

          <div className="section-block">
            <h2>Session</h2>
            <p className="panel-label">Industry pattern packs (in addition to the generic scan)</p>
            <PatternPackSelect
              packs={industryPacks}
              selectedPacks={selectedPacks}
              onToggle={togglePack}
            />
            <p className="pack-note">Drop-in extensions over the generic scan — no core changes.</p>
            {packCatalogStale && (
              <p className="pack-note">
                Pack catalog did not load. Checkboxes still work. Eval coverage copy may be stale.
              </p>
            )}
            <PackEvals
              selectedPacks={selectedPacks}
              catalog={industryPacks.filter((pack) => !PACK_EVALS_HIDDEN.has(pack.id))}
            />
          </div>

          <ProviderSettings />
        </section>

        <section className="panel report-panel">
          {topTabBar}
          <div className="try-actions">
            {/* Webhook sandbox and paste-transcript tabs are hidden sub-tabs of
                "Live call" (not deleted - same hidden-but-reachable pattern as
                PRODUCT_NAV_ALL in chromeNav.js); setSessionTab("webhook" | "paste")
                still renders their panels below. */}

            {sessionTab === "live" && (
              <div className="section-block tab-panel">
                <p className="app-lede live-call-lede">
                  Run a live mic call against the AssemblyAI Voice Agent, then check the industry
                  pattern packs you want layered on top of the generic scan before generating a
                  report.
                </p>
                <label className={`check-row record-call-row ${!canStart ? "disabled" : ""}`}>
                  <input
                    type="checkbox"
                    checked={recordCall}
                    onChange={(e) => setRecordCall(e.target.checked)}
                    disabled={!canStart}
                  />
                  Record this call. Off by default — live call audio is never stored unless you check
                  this. A recording is saved to persistent storage (falls back to this browser only if
                  storage isn't configured) so the report's audio player can play it back later.
                </label>
                <div className="call-row">
                  <button
                    ref={startCallRef}
                    className={`btn ${canStart ? "btn-primary" : "btn-danger"}`}
                    onClick={canStart ? () => connect(selectedPersona, seedViolation, recordCall) : disconnect}
                  >
                    {canStart ? "Start call" : "End call"}
                  </button>
                  <span className={`status is-${status}`} ref={callStatusRef}>
                    <span className="status-dot" />
                    {STATUS_LABEL[status]}
                  </span>
                </div>

                {canStart && (
                  <p className="hint">Your browser will ask for microphone access.</p>
                )}
                {status === "connecting" && (
                  <p className="hint">Connecting to the AssemblyAI voice agent…</p>
                )}
                {status === "ready" && (
                  <p className="hint">
                    Live — say hello or ask anything. Click <em>End call</em> when you're done - your
                    report generates automatically.
                  </p>
                )}

                {status === "error" && (
                  <p className="error-banner">
                    {connectError ??
                      "The call could not connect. Check the AssemblyAI API key on the server and try again."}
                  </p>
                )}

                {status === "ready" && micSilent && (
                  <p className="error-banner">
                    No signal from your microphone - it may be muted or the wrong input device is
                    selected. Check your system sound settings.
                  </p>
                )}

                <ul className="transcript">
                  {transcript.map((t, i) => (
                    <li key={i}>
                      <span className="transcript-role">{t.role}</span>
                      {t.text}
                    </li>
                  ))}
                </ul>
                {status !== "idle" && transcript.length === 0 && (
                  <p className="transcript-empty">Listening for the first turn…</p>
                )}

                {lastSession && (
                  <button
                    className="btn btn-outline generate-btn"
                    onClick={runLiveReport}
                    disabled={liveLoading}
                  >
                    {liveLoading ? "Generating report…" : "Regenerate report for last call"}
                  </button>
                )}
                {liveError && <p className="error-banner">{liveError}</p>}

                {recordingUrl && (
                  <div className="section-block recording-block">
                    <h4>Recording</h4>
                    <AudioPlayer src={recordingUrl} compact />
                    <div className="call-row">
                      <a className="btn btn-outline" href={recordingUrl} download={`complyline-call-${Date.now()}.webm`}>
                        Download recording
                      </a>
                      <button
                        className="btn btn-outline"
                        disabled={uploadStatus === "uploading"}
                        onClick={() =>
                          runUpload(new File([recordedBlob], "recording.webm", { type: recordedBlob.type }), {
                            label: `${selectedPersona.label} — recorded call`,
                          })
                        }
                      >
                        {uploadStatus === "uploading" ? "Analyzing…" : "Analyze this recording"}
                      </button>
                    </div>
                    <p className="pack-note">
                      Download stays separate from analyze — analyzing sends the recording to the same
                      upload pipeline as the sample audio below; download never does.
                    </p>
                  </div>
                )}
              </div>
            )}

            {sessionTab === "webhook" && (
              <div className="section-block tab-panel">
                {lastSession && personaId !== "neutral" ? (
                  <>
                    <p className="pack-note">
                      Send this persona call's transcript through{" "}
                      <code>POST /v1/ingest/:apiKey</code> - the same webhook receiver a real
                      customer integration posts to, instead of analyzing it directly here. Needs a
                      ComplyLine API key with the right pack scopes;{" "}
                      <a href="#" onClick={(e) => { e.preventDefault(); navigate("/api-keys"); }}>
                        create one
                      </a>
                      .
                    </p>
                    <input
                      type="password"
                      placeholder="ComplyLine API key"
                      value={webhookApiKey}
                      onChange={(e) => setWebhookApiKey(e.target.value)}
                    />
                    <button
                      className="btn btn-outline"
                      onClick={runWebhookSandbox}
                      disabled={!webhookApiKey.trim() || webhookStatus === "sending"}
                    >
                      {webhookStatus === "sending" ? "Sending…" : "Send to webhook receiver"}
                    </button>
                    {webhookStatus === "sent" && (
                      <p className="pack-note">
                        Sent - the ingest endpoint acked and is analyzing asynchronously, same as a
                        real customer's inbound webhook. No inline report here by design.
                      </p>
                    )}
                    {webhookStatus === "error" && webhookError && (
                      <p className="error-banner">{webhookError}</p>
                    )}
                  </>
                ) : (
                  <p className="pack-note">
                    Start a live call with a persona other than Neutral (Live call tab) to try the
                    webhook sandbox - it sends that call's transcript through the same{" "}
                    <code>POST /v1/ingest/:apiKey</code> receiver a real customer integration posts
                    to.
                  </p>
                )}
              </div>
            )}

            {sessionTab === "paste" && (
              <div className="section-block tab-panel">
                <p className="pack-note">
                  Paste doesn't have to be strict JSON - it can be anything: a completed AssemblyAI
                  session object, a raw transcript, a dictation, or a rough call log. Valid session
                  JSON parses instantly; anything else is sent to the LLM Gateway to figure out the
                  turns and turn them into a session automatically. This is recorded-content ingest,
                  not a live call.
                </p>
                <textarea
                  className="session-paste"
                  rows={8}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  spellCheck={false}
                  placeholder='{"sessionId":"sess_clean_01","turns":[{"role":"agent","text":"Hi","tMs":0}]}'
                />
                <button
                  className="btn btn-outline generate-btn"
                  type="button"
                  onClick={runPaste}
                  disabled={pasteLoading}
                >
                  {pasteLoading ? "Analyzing…" : "Analyze pasted session"}
                </button>
                {pasteError && <p className="error-banner">{pasteError}</p>}
              </div>
            )}

            {SHOW_AUDIO_UPLOAD_DEMO && (
            <div className="section-block">
              <h3>Demo: try your own audio</h3>
              <p className="pack-note upload-note">
                Not a live call — drop in any recorded audio file and AssemblyAI&apos;s pre-recorded
                STT automatically splits it by speaker, turning it into the same multi-turn session
                shape a live call produces, with playback synced to each finding. Samples below are
                two-speaker recordings so the split returns real agent/user turns (not one collapsed
                utterance).
              </p>
              <label
                className={`dropzone ${dragActive ? "is-active" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
              >
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(e) => runUpload(e.target.files?.[0])}
                />
                {uploadStatus === "uploading"
                  ? "Transcribing and analyzing…"
                  : "Drop an audio file here, or click to choose one"}
              </label>
              {uploadStatus === "error" && <p className="error-banner">{uploadError}</p>}
            </div>
            )}
          </div>

          {tourStep >= 0 && (
            <TourOverlay
              steps={tourSteps}
              stepIndex={tourStep}
              onNext={nextTourStep}
              onPrev={prevTourStep}
              onClose={closeTour}
            />
          )}

          {reportLoading || reportError || report ? (
            <>
              <h2 className="report-heading" ref={reportHeadingRef}>
                Compliance report
              </h2>
              <Report
                report={report}
                loading={reportLoading}
                error={reportError}
                progress={analysisProgress}
                audioUrl={activeAudioUrl}
                audioRef={audioRef}
                audioOffsetMs={activeAudioOffsetMs}
                turns={activeTurns}
                onSeek={onSeek}
                showStorageNote={Boolean(report) && !reportLoading && !reportError}
                navigate={navigate}
              />
            </>
          ) : (
            <>
              <IntroSteps />
              <h2 className="report-heading">Compliance report</h2>
              <Report report={null} />
            </>
          )}
        </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
