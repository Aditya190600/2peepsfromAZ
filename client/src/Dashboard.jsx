import { useEffect, useRef, useState } from "react";
import RateLimitBanner from "./RateLimitBanner";
import { useVoiceAgent } from "./useVoiceAgent";
import {
  SAMPLE_SESSIONS,
  SAMPLE_AUDIO_URLS,
  NORTHSTAR_SESSIONS,
  SCRIPTED_VIOLATION_DEMO_KEYS,
} from "./sampleSessions";
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
  mapWithConcurrency,
  findRateLimitedFinding,
} from "./analyzeClient";
import { listIndustryPacks } from "./evalsClient";
import PackEvals from "./PackEvals";
import { parseSessionPaste } from "./sessionPaste";
import { PERSONAS, findPersona } from "./personas";
import "./App.css";

export function formatTMs(tMs) {
  const totalSeconds = Math.floor(tMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const STATUS_LABEL = {
  idle: "Idle",
  connecting: "Connecting…",
  ready: "Live",
  error: "Connection error",
};

const PLAYABLE_SAMPLE_LABEL = {
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

const INDUSTRY_PACKS = [
  { id: "hipaa", name: "HIPAA identifiers (healthcare)" },
  { id: "finance", name: "GLBA finance identifiers (banking)" },
  { id: "ferpa", name: "FERPA identifiers (education)" },
];

function sessionByKey(key) {
  return SAMPLE_SESSIONS[key] ?? NORTHSTAR_SESSIONS[key];
}

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
        compliance checks, ranked by severity. Try it two ways:
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
      <p className="intro-alt">
        Prefer not to use your mic right now? Skip straight to a <strong>sample session</strong>{" "}
        above - same report, no live call needed.
      </p>
    </div>
  );
}

function FleetSummary({ results, progress }) {
  const { total, passed, flagged, erroredOnly, complianceRate, perCheck } = summarizeFleet(results);
  const tiles = monitorTiles(perCheck);

  return (
    <div className="fleet-board">
      {progress && progress.done < progress.total && (
        <p className="fleet-progress">
          Analyzing… {progress.done} of {progress.total} sessions complete.
        </p>
      )}
      <section className="monitor-card fleet-progress-card">
        <p className="monitor-kicker">Voice agent fleet</p>
        <p className="fleet-rate">
          <span className="fleet-rate-number">{complianceRate}%</span>
        </p>
        <div className="app-progress-track" aria-hidden="true">
          <div className="app-progress-fill" style={{ width: `${complianceRate}%` }} />
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
        {tiles.map((tile) => (
          <li key={tile.check} className="monitor-card">
            <p className="monitor-kicker">{tile.label}</p>
            <p className="monitor-attention">{tile.flag > 0 ? "Needs attention" : "Clear"}</p>
            <p className="monitor-count">{tile.flag}</p>
            <div className="app-progress-track" aria-hidden="true">
              <div
                className="app-progress-fill"
                style={{
                  width: tile.total
                    ? `${Math.round(((tile.total - tile.flag) / tile.total) * 100)}%`
                    : "0%",
                }}
              />
            </div>
            <p className="monitor-meta">
              {tile.pass} pass
              {tile.na > 0 ? ` · ${tile.na} n/a` : ""}
              {tile.error > 0 ? ` · ${tile.error} unable to run` : ""}
              {` · ${tile.total} total`}
            </p>
          </li>
        ))}
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

export function Report({
  report,
  audioUrl,
  audioRef,
  onSeek,
  loading = false,
  error = null,
  idleMessage,
  showStorageNote = false,
  navigate,
}) {
  const [rateLimitDismissed, setRateLimitDismissed] = useState(false);
  useEffect(() => setRateLimitDismissed(false), [report]);

  const view = reportView({ report, loading, error });
  if (view.kind !== "ready") {
    return (
      <div className={`report-state ${view.className}`}>
        <span className={`report-verdict finding-status ${view.className}`}>{view.label}</span>
        <p>{view.kind === "idle" && idleMessage ? idleMessage : view.message}</p>
      </div>
    );
  }
  const sortedFindings = sortFindingsBySeverity(report.findings);
  const verdict = headlineVerdict(report.findings);
  const rateLimitedFinding = findRateLimitedFinding(report);
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
          <span className={`report-verdict finding-status ${view.className}`}>
            {verdict.label}
          </span>
        </div>
        <button className="btn btn-outline print-btn" onClick={() => window.print()}>
          Print / export report
        </button>
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
          <AudioPlayer src={audioUrl} audioRef={audioRef} />
          <p className="hint">
            Findings with a ▶ timestamp are clickable — click one to jump the player there.
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
  const [consent, setConsent] = useState(false);
  const [selectedPacks, setSelectedPacks] = useState([]);
  const [personaId, setPersonaId] = useState("neutral");
  const [seedViolation, setSeedViolation] = useState(false);
  const [recordCall, setRecordCall] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState(null);
  const [webhookApiKey, setWebhookApiKey] = useState("");
  const [webhookStatus, setWebhookStatus] = useState("idle"); // idle | sending | sent | error
  const [webhookError, setWebhookError] = useState(null);
  const [report, setReport] = useState(null);
  const [fleetResults, setFleetResults] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetProgress, setFleetProgress] = useState(null);
  const [fleetError, setFleetError] = useState(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState(null);
  const [activeAudioOffsetMs, setActiveAudioOffsetMs] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle | uploading | error
  const [uploadError, setUploadError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [sampleLoadingKey, setSampleLoadingKey] = useState(null);
  const [sampleError, setSampleError] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteError, setPasteError] = useState(null);
  const [industryPacks, setIndustryPacks] = useState(INDUSTRY_PACKS);
  const [packCatalogStale, setPackCatalogStale] = useState(false);
  const audioRef = useRef(null);
  const reportHeadingRef = useRef(null);
  const liveHistoryIdRef = useRef(null);
  const liveSessionRef = useRef(null);
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
    setSampleError(null);
    setUploadError(null);
    setUploadStatus("idle");
    setFleetError(null);
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
    setFleetResults(null);
    clearLabErrors();
    setLiveLoading(true);
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
      if (isCurrent()) showAudio(bucketUrl ?? getLiveAudioBlob(sessionId), recordingOffsetMs, sessionId);
      const nextReport = await analyze(lastSession, patternPackIds);
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

  const runSample = async (key) => {
    setFleetResults(null);
    clearLabErrors();
    setSampleLoadingKey(key);
    showAudio(SAMPLE_AUDIO_URLS[key] && PLAYABLE_SAMPLE_LABEL[key] ? SAMPLE_AUDIO_URLS[key] : null);
    try {
      const session = sessionByKey(key);
      const nextReport = await analyze(session, patternPackIds);
      setReport(nextReport);
      recordHistory(sampleLabel(key), nextReport, session, {
        audioKey: PLAYABLE_SAMPLE_LABEL[key] ? key : undefined,
      });
    } catch (err) {
      setSampleError(err.message ?? "Something went wrong generating this report.");
      setReport(null);
    } finally {
      setSampleLoadingKey(null);
    }
  };

  const runFleetOn = async (keys) => {
    setFleetLoading(true);
    clearLabErrors();
    setReport(null);
    showAudio(null);
    setFleetResults([]);
    setFleetProgress({ done: 0, total: keys.length });
    try {
      const reports = await mapWithConcurrency(
        keys,
        2,
        (key) => analyze(sessionByKey(key), patternPackIds),
        (done, total) => setFleetProgress({ done, total })
      );
      const results = keys.map((key, i) => ({ key, report: reports[i] }));
      setFleetResults(results);
      for (const { key, report: r } of results) {
        recordHistory(sampleLabel(key), r, sessionByKey(key), {
          audioKey: PLAYABLE_SAMPLE_LABEL[key] ? key : undefined,
        });
      }
    } catch (err) {
      setFleetError(err.message ?? "Something went wrong running the fleet analysis.");
      setFleetResults(null);
    } finally {
      setFleetLoading(false);
      setFleetProgress(null);
    }
  };

  const runPaste = async () => {
    if (!consent) return;
    const parsed = parseSessionPaste(pasteText);
    setFleetResults(null);
    showAudio(null);
    clearLabErrors();
    if (!parsed.ok) {
      setPasteError(parsed.error);
      setReport(null);
      return;
    }
    setPasteLoading(true);
    try {
      const nextReport = await analyze(parsed.session, patternPackIds);
      setReport(nextReport);
      recordHistory(
        `Pasted session (${parsed.session.sessionId ?? "no session id"})`,
        nextReport,
        parsed.session
      );
    } catch (err) {
      setPasteError(err.message ?? "Something went wrong analyzing this paste.");
      setReport(null);
    } finally {
      setPasteLoading(false);
    }
  };

  const runUpload = async (file, { label = "Uploaded audio", consentEvent } = {}) => {
    if (!consent || !file) return;
    setFleetResults(null);
    setReport(null);
    clearLabErrors();
    setUploadStatus("uploading");
    const blobUrl = URL.createObjectURL(file);
    showAudio(blobUrl);
    try {
      const session = await transcribeUpload(file);
      // Optional consentEvent lets the "diarize this sample" path keep the
      // fixture's TCPA consent flag while still going through real STT +
      // speaker_labels. Raw drag-and-drop uploads leave it undefined → null.
      const analyzedSession =
        consentEvent !== undefined ? { ...session, consentEvent } : session;
      const nextReport = await analyze(analyzedSession, patternPackIds);
      setReport(nextReport);
      registerLiveAudioBlob(analyzedSession.sessionId, blobUrl);
      recordHistory(label, nextReport, analyzedSession);
      setUploadStatus("idle");
    } catch (err) {
      setUploadStatus("error");
      setUploadError(err.message ?? "Something went wrong processing this file.");
    }
  };

  // Fetches a playable sample MP3 and runs it through the real upload /
  // diarization pipeline (not the canned SAMPLE_SESSIONS text path), so the
  // demo can prove speaker_labels produces multi-turn timestamps.
  const runDiarizedSample = async (key) => {
    if (!consent) return;
    const url = SAMPLE_AUDIO_URLS[key];
    if (!url) return;
    setSampleLoadingKey(key);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Could not load sample audio (${resp.status}).`);
      const blob = await resp.blob();
      const file = new File([blob], `${key}.mp3`, { type: blob.type || "audio/mpeg" });
      await runUpload(file, {
        label: `${sampleLabel(key)} (diarized upload)`,
        consentEvent: sessionByKey(key)?.consentEvent ?? null,
      });
    } catch (err) {
      setUploadStatus("error");
      setUploadError(err.message ?? "Something went wrong loading this sample.");
    } finally {
      setSampleLoadingKey(null);
    }
  };

  const openStoredOrRunSample = (key) => {
    const entry = findEntryBySessionId(SAMPLE_SESSIONS[key]?.sessionId);
    if (!entry?.report) {
      runSample(key);
      return;
    }
    setFleetResults(null);
    clearLabErrors();
    showAudio(entry.audioKey ? SAMPLE_AUDIO_URLS[entry.audioKey] ?? null : null);
    setReport(entry.report);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (!consent) return;
    runUpload(e.dataTransfer.files?.[0]);
  };

  const playableKeys = Object.keys(PLAYABLE_SAMPLE_LABEL);
  const reportLoading =
    liveLoading ||
    pasteLoading ||
    sampleLoadingKey != null ||
    uploadStatus === "uploading" ||
    (fleetLoading && (!fleetResults || fleetResults.length === 0));
  const reportError =
    liveError ||
    pasteError ||
    sampleError ||
    (uploadStatus === "error" ? uploadError : null) ||
    fleetError;
  const fleetReady = Array.isArray(fleetResults) && fleetResults.length > 0;

  useEffect(() => {
    if (!reportLoading && !report && !fleetReady) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    reportHeadingRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [reportLoading, report, fleetReady]);

  return (
    <AppShell path={path} navigate={navigate} title="Try">
      <main className="layout">
        <section className="panel session-panel">
          <p className="app-lede">
            Try is the analysis lab: run a live mic call against the AssemblyAI Voice Agent, upload a
            recorded call, or pick a sample session - then check the industry pattern packs you want
            layered on top of the generic scan before generating a report.
          </p>

          <div className="section-block">
            <h2>Persona</h2>
            <p className="pack-note">
              Pick who the AI agent plays for this call - each persona has an explicit CAN/CANNOT
              scope and its own failure-mode boundary. Picking a persona auto-selects its matching
              pattern pack(s) below (uncheck any you don't want).
            </p>
            <div className="persona-grid">
              {PERSONAS.map((persona) => {
                const packLabels = [
                  "PII scan",
                  ...persona.packIds.map(
                    (id) => industryPacks.find((pack) => pack.id === id)?.name ?? id,
                  ),
                ];
                return (
                  <label
                    className={`persona-card ${personaId === persona.id ? "selected" : ""} ${
                      !canStart ? "disabled" : ""
                    }`}
                    key={persona.id}
                  >
                    <input
                      type="radio"
                      name="persona"
                      checked={personaId === persona.id}
                      onChange={() => selectPersona(persona.id)}
                      disabled={!canStart}
                    />
                    <span className="persona-card-name">{persona.label}</span>
                    <span className="persona-card-description">{persona.description}</span>
                    <span className="persona-card-packs">Checks: {packLabels.join(", ")}</span>
                  </label>
                );
              })}
            </div>
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
            <div className="pack-select">
              {industryPacks.map((pack) => (
                <label className="check-row" key={pack.id}>
                  <input
                    type="checkbox"
                    checked={selectedPacks.includes(pack.id)}
                    onChange={() => togglePack(pack.id)}
                  />
                  {pack.name}
                </label>
              ))}
            </div>
            <p className="pack-note">Drop-in extensions over the generic scan — no core changes.</p>
            {packCatalogStale && (
              <p className="pack-note">
                Pack catalog did not load. Checkboxes still work. Eval coverage copy may be stale.
              </p>
            )}
            <PackEvals selectedPacks={selectedPacks} catalog={industryPacks} />
            <label className={`check-row ${!canStart ? "disabled" : ""}`}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={!canStart}
              />
              I consent to this session being analyzed, whether a live call, an upload, or a pasted
              transcript.
            </label>
          </div>

          <ProviderSettings />
        </section>

        <section className="panel report-panel">
          <div className="try-actions">
            <div className="section-block">
              <h3>Live call</h3>
              <label className={`check-row ${!canStart ? "disabled" : ""}`}>
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
                  className={`btn ${canStart ? "btn-primary" : "btn-danger"}`}
                  onClick={canStart ? () => connect(consent, selectedPersona, seedViolation, recordCall) : disconnect}
                  disabled={canStart && !consent}
                >
                  {canStart ? "Start call" : "End call"}
                </button>
                <span className={`status is-${status}`}>
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

              {lastSession && personaId !== "neutral" && (
                <div className="section-block webhook-sandbox-block">
                  <h4>Try as webhook sandbox</h4>
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
                </div>
              )}

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
                      disabled={!consent || uploadStatus === "uploading"}
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

            <div className="section-block">
              <h3>Demo: try your own audio</h3>
              <p className="pack-note upload-note">
                Not a live call — drop in any recorded audio file and AssemblyAI&apos;s pre-recorded
                STT + speaker diarization turns it into the same multi-turn session shape a live call
                produces, with playback synced to each finding. Samples below are two-speaker
                recordings so diarization returns real agent/user turns (not one collapsed utterance).
              </p>
              <label
                className={`dropzone ${dragActive ? "is-active" : ""} ${!consent ? "is-disabled" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!consent) return;
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
              >
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  disabled={!consent}
                  onChange={(e) => runUpload(e.target.files?.[0])}
                />
                {uploadStatus === "uploading"
                  ? "Transcribing and analyzing…"
                  : consent
                    ? "Drop an audio file here, or click to choose one"
                    : "Check the analysis consent box to upload recorded audio"}
              </label>
              {uploadStatus === "error" && <p className="error-banner">{uploadError}</p>}
            </div>

            <div className="section-block">
              <h3>Paste session JSON</h3>
              <p className="pack-note">
                Paste a completed AssemblyAI session object with a <code>turns</code> array. Same
                shape as the samples. This is recorded-content ingest, not a live call.
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
                disabled={!consent || pasteLoading}
              >
                {pasteLoading ? "Analyzing…" : "Analyze pasted session"}
              </button>
              {pasteError && <p className="error-banner">{pasteError}</p>}
            </div>

            <div className="section-block">
              <h3>Playable samples</h3>
              <p className="pack-note">
                Analyze uses the canned transcript. Diarize re-uploads the MP3 through AssemblyAI
                speaker labels — use that to demo the upload path without bringing your own file.
              </p>
              <div className="sample-buttons">
                {playableKeys.map((key) => (
                  <div key={key} className="sample-row">
                    <div className="sample-actions">
                      <button
                        className="btn btn-outline"
                        onClick={() => openStoredOrRunSample(key)}
                        disabled={sampleLoadingKey === key || uploadStatus === "uploading"}
                      >
                        {sampleLoadingKey === key && uploadStatus !== "uploading"
                          ? "Analyzing…"
                          : sampleLabel(key)}
                      </button>
                      <button
                        className="btn btn-outline sample-diarize-btn"
                        onClick={() => runDiarizedSample(key)}
                        disabled={!consent || sampleLoadingKey === key || uploadStatus === "uploading"}
                      >
                        {sampleLoadingKey === key && uploadStatus === "uploading"
                          ? "Diarizing…"
                          : "Diarize upload"}
                      </button>
                    </div>
                    <AudioPlayer src={SAMPLE_AUDIO_URLS[key]} compact />
                  </div>
                ))}
              </div>
              {sampleError && <p className="error-banner">{sampleError}</p>}
            </div>

            <div className="section-block">
              <h3>Scripted violation demos</h3>
              <p className="pack-note">
                Two concrete, scripted scenarios built to trip the HIPAA and GLBA pattern packs.
                Check the matching industry pack above, then Analyze.
              </p>
              <div className="sample-buttons">
                {SCRIPTED_VIOLATION_DEMO_KEYS.map((key) => (
                  <div key={key} className="sample-row">
                    <div className="sample-actions">
                      <button
                        className="btn btn-outline"
                        onClick={() => openStoredOrRunSample(key)}
                        disabled={sampleLoadingKey === key || uploadStatus === "uploading"}
                      >
                        {sampleLoadingKey === key ? "Analyzing…" : sampleLabel(key)}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-block">
              <h3>Or analyze a fleet</h3>
              <button
                className="btn btn-outline generate-btn"
                onClick={() => runFleetOn(playableKeys)}
                disabled={fleetLoading}
              >
                {fleetLoading ? "Analyzing…" : `Analyze ${playableKeys.length} sample sessions`}
              </button>
              <p className="pack-note">
                Aggregates pass/flag counts and compliance rate across every playable sample. The
                Northstar Voice program lives on Home.
              </p>
              {fleetError && <p className="error-banner">{fleetError}</p>}
            </div>
          </div>

          {fleetReady ? (
            <>
              <h2 ref={reportHeadingRef}>Fleet compliance report</h2>
              <FleetView results={fleetResults} progress={fleetProgress} navigate={navigate} />
            </>
          ) : reportLoading || reportError || report ? (
            <>
              <h2 className="report-heading" ref={reportHeadingRef}>
                Compliance report
              </h2>
              <Report
                report={report}
                loading={reportLoading}
                error={reportError}
                audioUrl={activeAudioUrl}
                audioRef={audioRef}
                onSeek={onSeek}
                showStorageNote={Boolean(report) && !reportLoading && !reportError}
                navigate={navigate}
              />
            </>
          ) : (
            <>
              <h2 className="report-heading">Compliance report</h2>
              <Report report={null} />
              <IntroSteps />
            </>
          )}
        </section>
      </main>
    </AppShell>
  );
}
