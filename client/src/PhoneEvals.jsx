import { useEffect, useState } from "react";
import { AppShell } from "./Chrome";
import { RunResult, formatWhen } from "./QualEval";
import { getQualevalConfig, listDemoAgents, listPhoneEvalCalls } from "./qualevalClient";
import { formatPhoneNumber } from "./settingsView";
import "./App.css";

// Calls that dialed the agent number directly (someone's own phone, not a
// QualEval scenario run). Kept entirely apart from Qualitative Evals: these
// are never attributed to an evaluation, and scenario runs never show here.
// Each call is scored against the answering agent's own instructions
// (server/qualeval/phoneEvaluation.js). Operator-only, since the number is
// shared and every caller's number and transcript would otherwise be visible
// to every signed-in visitor.

function statusText(call) {
  if (call.evaluationStatus === "no_rubric") return "The answering agent's instructions could not be loaded, so this call was not scored.";
  if (call.evaluationStatus === "no_transcript") return "Call ended before any speech was captured.";
  if (call.evaluationStatus === "error") return call.evaluationError || "Evaluation failed.";
  if (!call.endedAt) return "Call in progress…";
  if (!call.evaluationStatus) return "Evaluation has not finished.";
  return null;
}

function PhoneCallList({ calls, agentNames }) {
  if (calls.length === 0) {
    return <p className="pack-note">No direct calls to the agent number yet.</p>;
  }
  return (
    <div className="phone-evals-list">
      {calls.map((call) => {
        const note = statusText(call);
        const scored = call.verdict === "pass" || call.verdict === "fail";
        const agentName = agentNames[call.variantKey] ?? call.variantKey;
        return (
          <article key={call.id ?? call.twilioCallSid} className="phone-evals-call">
            <header className="phone-evals-call-head">
              <strong>{call.callerName || formatPhoneNumber(call.fromNumber) || "Unknown caller"}</strong>
              {call.callerName && call.fromNumber && <span className="phone-evals-meta">{formatPhoneNumber(call.fromNumber)}</span>}
              {agentName && <span className="phone-evals-meta">Answered by {agentName}</span>}
              <span className="qe-eval-when">{formatWhen(call.startedAt)}</span>
            </header>
            {scored ? (
              <RunResult
                run={{
                  verdict: call.verdict,
                  assessment: call.assessment,
                  audioRef: call.audioRef,
                  transcript: call.transcript,
                  criterionResults: call.criterionResults,
                  evidenceQuotes: call.evidenceQuotes,
                }}
              />
            ) : (
              note && <p className={call.evaluationStatus === "error" ? "error-banner" : "pack-note"}>{note}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export default function PhoneEvals({ path, navigate }) {
  const [config, setConfig] = useState(null);
  const [calls, setCalls] = useState(null);
  const [agentNames, setAgentNames] = useState({});
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadCalls = async () => {
    setRefreshing(true);
    try {
      setCalls(await listPhoneEvalCalls());
      setError(null);
    } catch (err) {
      setError(err.message ?? "Could not load phone calls.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    getQualevalConfig()
      .then((body) => {
        setConfig(body);
        if (!body.isOperator) return;
        loadCalls();
        listDemoAgents()
          .then((agents) => setAgentNames(Object.fromEntries(agents.variants.map((a) => [a.key, a.name]))))
          .catch(() => {
            // Names are optional; the variant key is shown instead.
          });
      })
      .catch((err) => setError(err.message ?? "Could not load Phone Evals."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agentNumber = config?.agentPhoneNumber;

  return (
    <AppShell path={path} navigate={navigate} title="Phone Evals">
      <div className="qualeval-page">
        <p className="app-lede">
          Calls placed straight to the agent phone number
          {agentNumber ? (
            <>
              {" "}
              (<a href={`tel:${agentNumber}`}>{formatPhoneNumber(agentNumber)}</a>)
            </>
          ) : null}{" "}
          from a real phone. Each call is recorded and scored against the answering agent&apos;s own
          instructions. Qualitative Evals scenario runs are tracked on their own page and never appear here.
        </p>

        {error && <p className="error-banner">{error}</p>}
        {config && !config.isOperator && (
          <p className="pack-note">Phone Evals is only available to operators of this deployment.</p>
        )}
        {config?.isOperator && (
          <section className="phone-evals-section">
            <div className="phone-evals-section-head">
              <h2>Direct calls{calls ? ` (${calls.length})` : ""}</h2>
              <button type="button" className="btn-sm" disabled={refreshing} onClick={loadCalls}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {calls && <PhoneCallList calls={calls} agentNames={agentNames} />}
          </section>
        )}
      </div>
    </AppShell>
  );
}
