import { useEffect, useRef, useState } from "react";
import { AppShell } from "./Chrome";
import { Report } from "./Dashboard";
import { RunResult, formatWhen } from "./QualEval";
import { getQualevalConfig, listDemoAgents, listPhoneEvalCalls, rerunPhoneEvalAnalysis } from "./qualevalClient";
import { formatPhoneNumber } from "./settingsView";
import { seekAudio } from "./seek";
import { PhoneEvalsSetupGate } from "./PhoneEvalsSetup";
import {
  callListStatus,
  canRerunAnalysis,
  complianceBadge,
  complianceReportState,
  evaluationNote,
  formatCallDuration,
  pollIntervalMs,
  selectedCall,
} from "./phoneEvalsView";
import "./App.css";

// Calls that dialed an agent number directly (someone's own phone, not a
// QualEval scenario run). Kept entirely apart from Qualitative Evals: these
// are never attributed to an evaluation, and scenario runs never show here.
// Operators see every call; other visitors only see calls to numbers they
// registered in Settings (server/telephony/store.js).

function callerLabel(call) {
  return call.callerName || formatPhoneNumber(call.fromNumber) || "Unknown caller";
}

function ComplianceTab({ call }) {
  const audioRef = useRef(null);
  const state = complianceReportState(call);
  return (
    <Report
      report={state.report ?? null}
      loading={state.loading ?? false}
      error={state.error ?? null}
      idleMessage={state.idleMessage}
      audioUrl={call.audioRef}
      audioRef={audioRef}
      turns={call.transcript?.turns ?? []}
      onSeek={(tMs) => seekAudio(audioRef, tMs)}
    />
  );
}

function EvaluationTab({ call }) {
  if (call.verdict === "pass" || call.verdict === "fail") {
    return (
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
    );
  }
  const note = evaluationNote(call);
  return note ? <p className={call.evaluationStatus === "error" ? "error-banner" : "pack-note"}>{note}</p> : null;
}

function CallListItem({ call, agentName, selected, onSelect }) {
  const status = callListStatus(call);
  const duration = formatCallDuration(call);
  return (
    <li>
      <button
        type="button"
        className={`phone-evals-item ${selected ? "is-selected" : ""}`}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
      >
        <span className="phone-evals-item-top">
          <strong className="phone-evals-item-caller">{callerLabel(call)}</strong>
          <span className="phone-evals-item-when">{formatWhen(call.startedAt)}</span>
        </span>
        {(agentName || duration) && (
          <span className="phone-evals-item-agent">{[agentName, duration].filter(Boolean).join(" · ")}</span>
        )}
        <span className={`phone-evals-item-status is-${status.tone}`}>{status.label}</span>
      </button>
    </li>
  );
}

function CallDetail({ call, agentName, onChanged }) {
  const [tab, setTab] = useState("compliance");
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState(null);
  const badge = complianceBadge(call);
  const duration = formatCallDuration(call);

  const onRerun = async () => {
    setRerunning(true);
    setRerunError(null);
    try {
      await rerunPhoneEvalAnalysis(call.twilioCallSid);
      await onChanged();
    } catch (err) {
      setRerunError(err.message ?? "Could not re-run the analysis.");
    } finally {
      setRerunning(false);
    }
  };

  return (
    <article className="phone-evals-detail" aria-label={`Call from ${callerLabel(call)}`}>
      <header className="phone-evals-detail-head">
        <div>
          <h2>{callerLabel(call)}</h2>
          <p className="phone-evals-meta">
            {[
              call.callerName && call.fromNumber ? formatPhoneNumber(call.fromNumber) : null,
              agentName ? `Answered by ${agentName}` : null,
              formatWhen(call.startedAt),
              duration,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {canRerunAnalysis(call) && (
          <button type="button" className="btn-sm" disabled={rerunning} onClick={onRerun}>
            {rerunning ? "Starting…" : "Re-run analysis"}
          </button>
        )}
      </header>
      {rerunError && <p className="error-banner">{rerunError}</p>}
      <div className="tab-bar phone-evals-tabs">
        <button
          type="button"
          className={`tab-btn ${tab === "compliance" ? "is-active" : ""}`}
          onClick={() => setTab("compliance")}
        >
          Compliance{badge && <span className="phone-evals-tab-badge">{badge}</span>}
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "evaluation" ? "is-active" : ""}`}
          onClick={() => setTab("evaluation")}
        >
          Agent instructions
          {(call.verdict === "pass" || call.verdict === "fail") && (
            <span className="phone-evals-tab-badge">{call.verdict}</span>
          )}
        </button>
      </div>
      {tab === "compliance" ? <ComplianceTab call={call} /> : <EvaluationTab call={call} />}
    </article>
  );
}

function CallHistory({ calls, agentNames, onChanged }) {
  const [selectedSid, setSelectedSid] = useState(null);
  if (calls.length === 0) {
    return <p className="pack-note">No calls yet. Dial one of your registered numbers to see a report here.</p>;
  }
  const current = selectedCall(calls, selectedSid);
  const nameOf = (call) => agentNames[call.variantKey] ?? call.variantKey;
  return (
    <div className="phone-evals-layout">
      <ol className="phone-evals-list" aria-label="Calls, most recent first">
        {calls.map((call) => (
          <CallListItem
            key={call.twilioCallSid}
            call={call}
            agentName={nameOf(call)}
            selected={call.twilioCallSid === current.twilioCallSid}
            onSelect={() => setSelectedSid(call.twilioCallSid)}
          />
        ))}
      </ol>
      <CallDetail key={current.twilioCallSid} call={current} agentName={nameOf(current)} onChanged={onChanged} />
    </div>
  );
}

export default function PhoneEvals({ path, navigate }) {
  const [config, setConfig] = useState(null);
  const [calls, setCalls] = useState(null);
  const [agentNames, setAgentNames] = useState({});
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const canAccess = Boolean(config?.canAccessPhoneEvals);
  const isOperator = Boolean(config?.isOperator);
  const ownedNumbers = config?.ownedPhoneNumbers ?? [];
  const demoAgentNumber = config?.agentPhoneNumber;

  const loadCalls = async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    try {
      setCalls(await listPhoneEvalCalls());
      setError(null);
    } catch (err) {
      setError(err.message ?? "Could not load phone calls.");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  };

  useEffect(() => {
    getQualevalConfig()
      .then((body) => {
        setConfig(body);
        if (!body.canAccessPhoneEvals) return;
        loadCalls();
        if (!body.isOperator) return;
        listDemoAgents()
          .then((agents) => setAgentNames(Object.fromEntries(agents.variants.map((a) => [a.key, a.name]))))
          .catch(() => {});
      })
      .catch((err) => setError(err.message ?? "Could not load Phone Evals."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interval = canAccess && calls ? pollIntervalMs(calls) : null;
  useEffect(() => {
    if (!interval) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadCalls({ quiet: true });
    }, interval);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  const dialTarget =
    isOperator && demoAgentNumber
      ? demoAgentNumber
      : ownedNumbers[0] ?? null;

  return (
    <AppShell path={path} navigate={navigate} title="Phone Evals">
      <div className="qualeval-page phone-evals-page">
        {config && !canAccess && <PhoneEvalsSetupGate navigate={navigate} />}

        <p className="app-lede">
          Call your agent number
          {dialTarget ? (
            <>
              {" "}
              at <a href={`tel:${dialTarget}`}>{formatPhoneNumber(dialTarget)}</a>
            </>
          ) : null}{" "}
          from any phone. When you hang up, the call is recorded and transcribed, and a compliance
          analysis runs immediately. The report shows up here on its own, usually within a minute.
        </p>
        <ul className="phone-evals-steps">
          <li>
            <strong>Compliance</strong>: the same checks as Voice Compliance (AI disclosure, consent, opt-out,
            PII exposure, and the industry pack for the agent&apos;s domain), each with a severity, a regulatory
            citation, and the moment in the call it happened.
          </li>
          <li>
            <strong>Agent instructions</strong>: a pass/fail score for whether the agent followed its own
            system prompt, with quoted evidence.
          </li>
          {isOperator && (
            <li>
              <strong>Which agent answers</strong>: pick the agent type (banking, healthcare, or flight booking,
              each in a compliant and a flawed version) under{" "}
              <a
                href="/settings"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/settings");
                }}
              >
                Settings → Target agents
              </a>
              . The switch applies to the next call.
            </li>
          )}
        </ul>
        <p className="pack-note">
          Qualitative Evals scenario calls are tracked on their own page and never appear here.
          {!isOperator && " You only see calls to numbers you imported under Settings."}
        </p>

        {error && <p className="error-banner">{error}</p>}
        {canAccess && (
          <section className="phone-evals-section">
            <div className="phone-evals-section-head">
              <h2>Calls{calls ? ` (${calls.length})` : ""}</h2>
              <button type="button" className="btn-sm" disabled={refreshing} onClick={() => loadCalls()}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {calls && <CallHistory calls={calls} agentNames={agentNames} onChanged={() => loadCalls({ quiet: true })} />}
          </section>
        )}
      </div>
    </AppShell>
  );
}
