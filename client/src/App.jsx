import { useState } from "react";
import { useVoiceAgent } from "./useVoiceAgent";
import { SAMPLE_SESSIONS } from "./sampleSessions";

async function analyze(session, patternPackIds) {
  const resp = await fetch("/v1/analyze-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, patternPackIds }),
  });
  return resp.json();
}

function Report({ report }) {
  if (!report) return null;
  return (
    <div style={{ marginTop: 24, border: "1px solid #ccc", padding: 16 }}>
      <h2>Compliance report</h2>
      <p style={{ color: "#666" }}>session {report.sessionId ?? "(none)"} - generated {report.generatedAt}</p>
      {report.findings.map((f) => (
        <div key={f.check} style={{ marginBottom: 12 }}>
          <strong style={{ color: f.status === "flag" ? "#b00020" : "#0a7a2a" }}>
            {f.status === "flag" ? "FLAG" : "PASS"}
          </strong>{" "}
          <code>{f.check}</code>
          {f.detail && <div>{f.detail}</div>}
          {f.check === "pii_scan" && (
            <ul>
              {f.items.map((item, i) => (
                <li key={i}>
                  turn {item.turnIndex} ({item.role}) - {item.label} [{item.packId}]: {item.matchRedacted}
                </li>
              ))}
              {f.items.length === 0 && <li>no matches</li>}
            </ul>
          )}
        </div>
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

  const runLiveReport = async () => {
    if (!lastSession) return;
    setReport(await analyze(lastSession, patternPackIds));
  };

  const runSample = async (key) => {
    setReport(await analyze(SAMPLE_SESSIONS[key], patternPackIds));
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Session Compliance Report</h1>
      <p>
        Ingests one completed AssemblyAI Voice Agent session and flags TCPA consent-logging,
        AI-disclosure-timing, and PII-pattern findings - industry-agnostic core, with a pluggable
        HIPAA pattern pack demoed as a drop-in extension.
      </p>

      <label style={{ display: "block", marginTop: 16 }}>
        <input type="checkbox" checked={hipaaPack} onChange={(e) => setHipaaPack(e.target.checked)} />{" "}
        Enable HIPAA pattern pack (drop-in extension)
      </label>

      <h2 style={{ marginTop: 32 }}>Live session</h2>
      <label style={{ display: "block" }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={status !== "idle" && status !== "error"}
        />{" "}
        Caller consents to this AI call being recorded and analyzed (logs the TCPA consent event)
      </label>
      <button
        style={{ marginTop: 8 }}
        onClick={status === "idle" || status === "error" ? () => connect(consent) : disconnect}
      >
        {status === "idle" || status === "error" ? "Start call" : "End call"}
      </button>
      <span style={{ marginLeft: 12 }}>status: {status}</span>

      <ul style={{ marginTop: 16 }}>
        {transcript.map((t, i) => (
          <li key={i}>
            <strong>{t.role}:</strong> {t.text}
          </li>
        ))}
      </ul>

      {lastSession && (
        <button onClick={runLiveReport}>Generate report for last call</button>
      )}

      <h2 style={{ marginTop: 32 }}>Or analyze a synthetic sample session</h2>
      <div style={{ display: "flex", gap: 8 }}>
        {Object.keys(SAMPLE_SESSIONS).map((key) => (
          <button key={key} onClick={() => runSample(key)}>
            {key}
          </button>
        ))}
      </div>

      <Report report={report} />
    </div>
  );
}
