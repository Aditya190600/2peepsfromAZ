import { useState } from "react";
import { useVoiceAgent } from "./useVoiceAgent";
import { SAMPLE_SESSIONS } from "./sampleSessions";
import "./App.css";

const STATUS_LABEL = {
  idle: "Idle",
  connecting: "Connecting…",
  ready: "Live",
  error: "Connection error",
};

const CHECK_LABEL = {
  consent: "Consent logged (TCPA)",
  ai_disclosure: "AI disclosure timing",
  pii_scan: "PII pattern scan",
};

const SAMPLE_LABEL = {
  "clean-call": "Clean call — everything passes",
  "tcpa-violation": "TCPA violation — no consent, SSN spoken",
  "healthcare-hipaa": "Healthcare call — HIPAA identifiers spoken",
};

async function analyze(session, patternPackIds) {
  const resp = await fetch("/v1/analyze-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, patternPackIds }),
  });
  return resp.json();
}

function Finding({ finding }) {
  const isFlag = finding.status === "flag";
  return (
    <div className={`finding ${isFlag ? "is-flag" : "is-pass"}`}>
      <div className="finding-head">
        <span className="finding-status">{isFlag ? "Flag" : "Pass"}</span>
        <span className="finding-name">{CHECK_LABEL[finding.check] ?? finding.check}</span>
      </div>
      {finding.detail && <p className="finding-detail">{finding.detail}</p>}
      {finding.check === "pii_scan" && (
        <ul className="finding-items">
          {finding.items.map((item, i) => (
            <li key={i}>
              turn {item.turnIndex} ({item.role}) — {item.label}{" "}
              <span className="pack-tag">[{item.packId}]</span>: {item.matchRedacted}
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

function Report({ report }) {
  if (!report) {
    return (
      <div className="report-empty">
        <p>
          Run a live call or pick a sample session to generate a compliance report — consent
          logging, AI-disclosure timing, and a PII pattern scan.
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="report-meta">
        {report.sessionId ?? "no session id"} · generated {report.generatedAt}
      </p>
      {report.findings.map((f) => (
        <Finding key={f.check} finding={f} />
      ))}
    </div>
  );
}

export default function App() {
  const { status, transcript, lastSession, connect, disconnect } = useVoiceAgent();
  const [consent, setConsent] = useState(false);
  const [hipaaPack, setHipaaPack] = useState(false);
  const [report, setReport] = useState(null);

  const patternPackIds = hipaaPack ? ["generic", "hipaa"] : ["generic"];
  const canStart = status === "idle" || status === "error";

  const runLiveReport = async () => {
    if (!lastSession) return;
    setReport(await analyze(lastSession, patternPackIds));
  };

  const runSample = async (key) => {
    setReport(await analyze(SAMPLE_SESSIONS[key], patternPackIds));
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
            <h3>Or analyze a sample session</h3>
            <div className="sample-buttons">
              {Object.keys(SAMPLE_SESSIONS).map((key) => (
                <button key={key} className="btn btn-outline" onClick={() => runSample(key)}>
                  {SAMPLE_LABEL[key] ?? key}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel report-panel">
          {status === "idle" && !report ? (
            <IntroSteps />
          ) : (
            <>
              <h2>Compliance report</h2>
              <Report report={report} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
