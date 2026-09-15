import { useEffect, useRef, useState } from "react";
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
import { saveHistoryEntry, findEntryBySessionId } from "./reportHistory";
import {
  CHECK_LABEL,
  CHECK_CITATION,
  PACK_CITATION,
  sortFindingsBySeverity,
  headlineVerdict,
  reportView,
  VERDICT_CLASS,
} from "./compliance";
import { analyze, transcribeUpload, mapWithConcurrency } from "./analyzeClient";
import { listIndustryPacks } from "./evalsClient";
import PackEvals from "./PackEvals";
import { parseSessionPaste } from "./sessionPaste";
import "./App.css";

function formatTMs(tMs) {
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
];

function sessionByKey(key) {
  return SAMPLE_SESSIONS[key] ?? NORTHSTAR_SESSIONS[key];
}

const STATUS_CLASS = { flag: "is-flag", pass: "is-pass", "n/a": "is-na", error: "is-na" };
const STATUS_TEXT = { flag: "Flag", pass: "Pass", "n/a": "N/A", error: "Unable to run" };

function Timestamp({ tMs, onSeek }) {
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
              Click <em>Start call</em> in the panel on the left. Your browser will ask for
              microphone access — allow it so your voice can reach the AssemblyAI agent.
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
              Click <em>End call</em>, then <em>Generate report for last call</em>. The report
              here ranks findings by severity, with a regulatory citation on each.
            </p>
          </div>
        </li>
      </ol>
      <p className="intro-alt">
        Prefer not to use your mic right now? Skip straight to a <strong>sample session</strong>{" "}
        below the call controls — same report, no live call needed.
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
  const openReport = (sessionId) => {
    if (!navigate || !sessionId) return;
    navigate(`/sessions/${encodeURIComponent(sessionId)}`);
  };

  return (
    <div>
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

export function Report({ report, audioUrl, audioRef, onSeek, loading = false, error = null, idleMessage }) {
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
  return (
    <div>
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

function DataHandlingPanel() {
  return (
    <div className="section-block data-handling-panel">
      <h3>Data handling</h3>
      <ul className="data-handling-list">
        <li>Live call audio is never written to disk.</li>
        <li>Transcripts exist only in your browser's memory and are discarded on reload.</li>
        <li>Your AssemblyAI API key never leaves the server.</li>
      </ul>
    </div>
  );
}

export default function Dashboard({ navigate, path }) {
  const { status, transcript, lastSession, micSilent, connect, disconnect } = useVoiceAgent();
  const [consent, setConsent] = useState(false);
  const [selectedPacks, setSelectedPacks] = useState([]);
  const [report, setReport] = useState(null);
  const [fleetResults, setFleetResults] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetProgress, setFleetProgress] = useState(null);
  const [fleetError, setFleetError] = useState(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState(null);
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

  const patternPackIds = ["generic", ...selectedPacks];
  const canStart = status === "idle" || status === "error";

  const togglePack = (id) => {
    setSelectedPacks((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const onSeek = (tMs) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = tMs / 1000;
    audio.play();
  };

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

  const recordHistory = (label, report) => {
    const verdict = headlineVerdict(report.findings);
    saveHistoryEntry({
      timestamp: new Date().toISOString(),
      label,
      sessionId: report.sessionId,
      verdictLevel: verdict.level,
      verdictLabel: verdict.label,
      report,
    });
  };

  const clearLabErrors = () => {
    setLiveError(null);
    setSampleError(null);
    setUploadError(null);
    setUploadStatus("idle");
    setFleetError(null);
    setPasteError(null);
  };

  const runLiveReport = async () => {
    if (!lastSession) return;
    setFleetResults(null);
    setActiveAudioUrl(null); // live calls aren't recorded/stored - no audio to play back
    clearLabErrors();
    setLiveLoading(true);
    try {
      const nextReport = await analyze(lastSession, patternPackIds);
      setReport(nextReport);
      recordHistory("Live call", nextReport);
    } catch (err) {
      setLiveError(err.message ?? "Something went wrong generating this report.");
    } finally {
      setLiveLoading(false);
    }
  };

  const runSample = async (key) => {
    setFleetResults(null);
    clearLabErrors();
    setSampleLoadingKey(key);
    setActiveAudioUrl(SAMPLE_AUDIO_URLS[key] && PLAYABLE_SAMPLE_LABEL[key] ? SAMPLE_AUDIO_URLS[key] : null);
    try {
      const nextReport = await analyze(sessionByKey(key), patternPackIds);
      setReport(nextReport);
      recordHistory(sampleLabel(key), nextReport);
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
    setActiveAudioUrl(null);
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
        recordHistory(sampleLabel(key), r);
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
    setActiveAudioUrl(null);
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
      recordHistory(`Pasted session (${parsed.session.sessionId ?? "no session id"})`, nextReport);
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
    setActiveAudioUrl(URL.createObjectURL(file));
    try {
      const session = await transcribeUpload(file);
      // Optional consentEvent lets the "diarize this sample" path keep the
      // fixture's TCPA consent flag while still going through real STT +
      // speaker_labels. Raw drag-and-drop uploads leave it undefined → null.
      const nextReport = await analyze(
        consentEvent !== undefined ? { ...session, consentEvent } : session,
        patternPackIds
      );
      setReport(nextReport);
      recordHistory(label, nextReport);
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
    setActiveAudioUrl(null);
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

  return (
    <AppShell path={path} navigate={navigate} title="Try">
      <main className="layout">
        <section className="panel session-panel">
          <DataHandlingPanel />

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
              I am uploading or pasting recorded content for analysis. Live call audio is not stored.
            </label>
          </div>

          <div className="section-block">
            <h3>Live call</h3>
            <div className="call-row">
              <button
                className={`btn ${canStart ? "btn-primary" : "btn-danger"}`}
                onClick={canStart ? () => connect(consent) : disconnect}
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
                Live — say hello or ask anything. Click <em>End call</em> when you're done to
                generate the report.
              </p>
            )}

            {status === "error" && (
              <p className="error-banner">
                The call could not connect. Check the AssemblyAI API key on the server and try
                again.
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
                {liveLoading ? "Generating report…" : "Generate report for last call"}
              </button>
            )}
            {liveError && <p className="error-banner">{liveError}</p>}
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
        </section>

        <section className="panel report-panel">
          {fleetReady ? (
            <>
              <h2>Fleet compliance report</h2>
              <FleetView results={fleetResults} progress={fleetProgress} navigate={navigate} />
            </>
          ) : reportLoading || reportError || report ? (
            <>
              <h2 className="report-heading">Compliance report</h2>
              <Report
                report={report}
                loading={reportLoading}
                error={reportError}
                audioUrl={activeAudioUrl}
                audioRef={audioRef}
                onSeek={onSeek}
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
