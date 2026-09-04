import { useEffect, useRef, useState } from "react";
import { useVoiceAgent } from "./useVoiceAgent";
import { SAMPLE_SESSIONS, SAMPLE_AUDIO_URLS } from "./sampleSessions";
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

const CHECK_LABEL = {
  consent: "Consent logged (TCPA)",
  ai_disclosure: "AI disclosure timing",
  recording_consent: "Recording-consent disclosure",
  opt_out: "Opt-out honored (TCPA)",
  pii_scan: "PII pattern scan",
};

const SAMPLE_LABEL = {
  "clean-call": "Clean call — everything passes",
  "tcpa-violation": "TCPA violation — no consent, SSN spoken",
  "optout-ignored": "Opt-out request ignored by agent",
  "healthcare-hipaa": "Healthcare call — HIPAA identifiers spoken",
  "late-disclosure": "Late disclosure — AI mentioned after 10s window",
  "clean-call-2": "Clean call — billing reminder, everything passes",
};

async function analyze(session, patternPackIds) {
  const resp = await fetch("/v1/analyze-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, patternPackIds }),
  });
  return resp.json();
}

async function transcribeUpload(file) {
  const resp = await fetch("/v1/transcribe-upload", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error ?? "Transcription failed.");
  return body;
}

const STATUS_CLASS = { flag: "is-flag", pass: "is-pass", "n/a": "is-na" };
const STATUS_TEXT = { flag: "Flag", pass: "Pass", "n/a": "N/A" };

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
      {finding.check === "pii_scan" && (
        <ul className="finding-items">
          {finding.items.map((item, i) => (
            <li key={i}>
              turn {item.turnIndex} ({item.role}) — {item.label}{" "}
              <span className="pack-tag">[{item.packId}]</span>: {item.matchRedacted}{" "}
              <Timestamp tMs={item.tMs} onSeek={onSeek} />
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
        ComplyLine reviews one completed AssemblyAI voice call and reports whether it met three
        compliance checks. Try it two ways:
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
              here shows consent logging, AI-disclosure timing, and a PII pattern scan.
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

function FleetSummary({ results }) {
  const sessionsPassed = results.filter((r) =>
    r.report.findings.every((f) => f.status === "pass")
  ).length;
  const perCheck = {};
  for (const r of results) {
    for (const f of r.report.findings) {
      perCheck[f.check] ??= { pass: 0, flag: 0 };
      perCheck[f.check][f.status] += 1;
    }
  }

  return (
    <div className="fleet-summary">
      <p className="fleet-headline">
        <strong>
          {sessionsPassed} of {results.length}
        </strong>{" "}
        calls passed all checks · {results.length - sessionsPassed} flagged
      </p>
      <ul className="fleet-check-counts">
        {Object.entries(perCheck).map(([check, counts]) => (
          <li key={check}>
            <span className="fleet-check-name">{CHECK_LABEL[check] ?? check}</span>
            <span className="fleet-check-pass">{counts.pass} pass</span>
            <span className="fleet-check-flag">{counts.flag} flag</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FleetView({ results }) {
  return (
    <div>
      <FleetSummary results={results} />
      <ul className="fleet-session-list">
        {results.map(({ key, report }) => {
          const hasFlag = report.findings.some((f) => f.status === "flag");
          return (
            <li key={key} className="fleet-session-item">
              <details>
                <summary className={`fleet-session-summary ${hasFlag ? "is-flag" : "is-pass"}`}>
                  <span className="finding-status">{hasFlag ? "Flag" : "Pass"}</span>
                  <span className="fleet-session-label">{SAMPLE_LABEL[key] ?? key}</span>
                  <span className="fleet-session-id">{report.sessionId}</span>
                </summary>
                <div className="fleet-session-body">
                  <Report report={report} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Report({ report, audioUrl, audioRef, onSeek }) {
  if (!report) {
    return (
      <div className="report-empty">
        <p>
          Run a live call, drop in an audio file, or pick a sample session to generate a
          compliance report — consent logging, AI-disclosure timing, and a PII pattern scan.
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="report-toolbar">
        <p className="report-meta">
          {report.sessionId ?? "no session id"} · generated {report.generatedAt}
        </p>
        <button className="btn btn-outline print-btn" onClick={() => window.print()}>
          Print / export report
        </button>
      </div>
      {audioUrl && (
        <div className="report-audio">
          <audio ref={audioRef} controls src={audioUrl} />
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
        <p>Post-call compliance report</p>
        <p className="report-meta">
          {report.sessionId ?? "no session id"} · generated {report.generatedAt}
        </p>
      </div>
      {report.findings.map((f) => (
        <Finding key={f.check} finding={f} onSeek={audioUrl ? onSeek : null} />
      ))}
      <p className="print-footer">
        Generated by ComplyLine — automated pattern-based screening, not legal advice.
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { status, transcript, lastSession, connect, disconnect } = useVoiceAgent();
  const [consent, setConsent] = useState(false);
  const [hipaaPack, setHipaaPack] = useState(false);
  const [report, setReport] = useState(null);
  const [fleetResults, setFleetResults] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [activeAudioUrl, setActiveAudioUrl] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle | uploading | error
  const [uploadError, setUploadError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const audioRef = useRef(null);

  const patternPackIds = hipaaPack ? ["generic", "hipaa"] : ["generic"];
  const canStart = status === "idle" || status === "error";

  const onSeek = (tMs) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = tMs / 1000;
    audio.play();
  };

  useEffect(() => {
    document.title = report ? `ComplyLine report — ${report.sessionId ?? "session"}` : "ComplyLine";
  }, [report]);

  const runLiveReport = async () => {
    if (!lastSession) return;
    setFleetResults(null);
    setActiveAudioUrl(null); // live calls aren't recorded/stored - no audio to play back
    setReport(await analyze(lastSession, patternPackIds));
  };

  const runSample = async (key) => {
    setFleetResults(null);
    setActiveAudioUrl(SAMPLE_AUDIO_URLS[key]);
    setReport(await analyze(SAMPLE_SESSIONS[key], patternPackIds));
  };

  const runFleet = async () => {
    setFleetLoading(true);
    setReport(null);
    setActiveAudioUrl(null);
    const keys = Object.keys(SAMPLE_SESSIONS);
    const reports = await Promise.all(
      keys.map((key) => analyze(SAMPLE_SESSIONS[key], patternPackIds))
    );
    setFleetResults(keys.map((key, i) => ({ key, report: reports[i] })));
    setFleetLoading(false);
  };

  const runUpload = async (file) => {
    if (!file) return;
    setFleetResults(null);
    setReport(null);
    setUploadError(null);
    setUploadStatus("uploading");
    setActiveAudioUrl(URL.createObjectURL(file));
    try {
      const session = await transcribeUpload(file);
      setReport(await analyze(session, patternPackIds));
      setUploadStatus("idle");
    } catch (err) {
      setUploadStatus("error");
      setUploadError(err.message);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    runUpload(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>ComplyLine</h1>
        </div>
        <p className="tagline">
          Post-call compliance review for AI voice agents. Ingests one completed AssemblyAI Voice
          Agent session and flags TCPA consent logging, AI-disclosure timing, and PII exposure —
          with an industry pattern pack pluggable on top of the generic scan.
        </p>
      </header>

      <main className="layout">
        <section className="panel session-panel">
          <div className="section-block">
            <h2>Session</h2>
            <label className="check-row" style={{ marginTop: 14 }}>
              <input
                type="checkbox"
                checked={hipaaPack}
                onChange={(e) => setHipaaPack(e.target.checked)}
              />
              Include HIPAA identifier pack
            </label>
            <p className="pack-note">Drop-in extension over the generic scan — no core changes.</p>
          </div>

          <div className="section-block">
            <h3>Live call</h3>
            <label className={`check-row ${!canStart ? "disabled" : ""}`}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={!canStart}
              />
              Caller consents to this AI call being recorded and analyzed
            </label>

            <div className="call-row">
              <button
                className={`btn ${canStart ? "btn-primary" : "btn-danger"}`}
                onClick={canStart ? () => connect(consent) : disconnect}
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
              <button className="btn btn-outline generate-btn" onClick={runLiveReport}>
                Generate report for last call
              </button>
            )}
          </div>

          <div className="section-block">
            <h3>Demo: try your own audio</h3>
            <p className="pack-note">
              Not a live call — drop in any recorded audio file and it runs through the same
              compliance pipeline, with playback synced to each finding.
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

          <div className="section-block">
            <h3>Or analyze a sample session</h3>
            <div className="sample-buttons">
              {Object.keys(SAMPLE_SESSIONS).map((key) => (
                <div key={key} className="sample-row">
                  <button className="btn btn-outline" onClick={() => runSample(key)}>
                    {SAMPLE_LABEL[key] ?? key}
                  </button>
                  <audio
                    className="sample-audio"
                    controls
                    preload="none"
                    src={SAMPLE_AUDIO_URLS[key]}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="section-block">
            <h3>Or analyze a fleet</h3>
            <button className="btn btn-outline generate-btn" onClick={runFleet} disabled={fleetLoading}>
              {fleetLoading ? "Analyzing…" : `Analyze all ${Object.keys(SAMPLE_SESSIONS).length} sample sessions`}
            </button>
            <p className="pack-note">
              Aggregates pass/flag counts across every sample session at once.
            </p>
          </div>
        </section>

        <section className="panel report-panel">
          {status === "idle" && !report && !fleetResults ? (
            <IntroSteps />
          ) : fleetResults ? (
            <>
              <h2>Fleet compliance report</h2>
              <FleetView results={fleetResults} />
            </>
          ) : (
            <>
              <h2 className="report-heading">Compliance report</h2>
              <Report report={report} audioUrl={activeAudioUrl} audioRef={audioRef} onSeek={onSeek} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
