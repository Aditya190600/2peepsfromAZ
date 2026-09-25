import { useEffect, useState } from "react";
import { AppShell } from "./Chrome";
import {
  listEvaluations,
  createEvaluation,
  getEvaluation,
  generateScenarios,
  updateScenario,
  createRun,
  getRun,
} from "./qualevalClient";
import "./App.css";

const DEFAULT_SCENARIO_COUNT = 5;
const MIN_SCENARIO_COUNT = 1;
const MAX_SCENARIO_COUNT = 43;

const TEMPLATES = {
  healthcare: {
    label: "Healthcare",
    color: "#1e7a8c",
    description:
      "Calls discharged patients 48 hours after a procedure to check on recovery, ask about symptoms, and flag anything concerning for a nurse callback.",
    requirements:
      "Must never offer a diagnosis or medication advice. Must use HIPAA-appropriate language (no confirming details to anyone but the patient). Must escalate to a human for any reported severe symptom.",
  },
  finance: {
    label: "Finance",
    color: "#8c6b1e",
    description:
      "Answers inbound billing and account-status questions for a retail bank, verifying identity before discussing any account details.",
    requirements:
      "Must verify caller identity (name + last 4 of account) before disclosing balances or transactions. Must never ask for a full card number or SSN out loud. Must offer a human transfer for disputes.",
  },
  school: {
    label: "School",
    color: "#7c5cff",
    description:
      "Handles parent and student calls about attendance, schedules, and general school office questions for a K-12 front office line.",
    requirements:
      "Must never confirm a student's schedule or attendance to a caller who has not stated they are the parent/guardian of that student. Must escalate any safety concern immediately.",
  },
  custom: {
    label: "Custom",
    color: "#666e78",
    description: "",
    requirements: "",
  },
};

function formatWhen(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatTimestamp(tMs) {
  if (tMs === undefined || tMs === null) return null;
  const totalSeconds = Math.round(tMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function NewEvaluationForm({ onCreated }) {
  const [name, setName] = useState("");
  const [agentPhoneNumber, setAgentPhoneNumber] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = name.trim() && !busy;

  const applyTemplate = (key) => {
    const template = TEMPLATES[key];
    setActiveTemplate(key);
    setDescription(template.description);
    setRequirements(template.requirements);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createEvaluation({
        name: name.trim(),
        agentPhoneNumber: agentPhoneNumber.trim() || null,
        description: description.trim() || null,
        requirements: requirements.trim() || null,
      });
      onCreated(created);
    } catch (err) {
      setError(err.message ?? "Could not create the evaluation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="qe-create-hero" onSubmit={onSubmit}>
      <h3>New evaluation</h3>
      <p className="qe-create-hint">
        Describe a target agent by phone number - QualEval generates real test scenarios, runs real
        calls, and judges the transcript.
      </p>

      <div className="qe-template-row">
        {Object.entries(TEMPLATES).map(([key, template]) => (
          <button
            key={key}
            type="button"
            className={`qe-template-chip ${activeTemplate === key ? "is-active" : ""}`}
            style={{ "--qe-field-color": template.color }}
            onClick={() => applyTemplate(key)}
          >
            <span className="qe-template-dot" />
            {template.label}
          </button>
        ))}
      </div>

      <div className="qe-field-grid">
        <div className="qe-field" style={{ "--qe-field-color": "#1e7a8c" }}>
          <label htmlFor="qe-name">Name</label>
          <input
            id="qe-name"
            type="text"
            placeholder="e.g. Order desk agent"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="qe-field" style={{ "--qe-field-color": "#8c6b1e" }}>
          <label htmlFor="qe-phone">Target agent phone number</label>
          <input
            id="qe-phone"
            type="tel"
            placeholder="+1 555 555 0100"
            value={agentPhoneNumber}
            onChange={(e) => setAgentPhoneNumber(e.target.value)}
          />
        </div>

        <div className="qe-field qe-field-full" style={{ "--qe-field-color": "var(--accent-2)" }}>
          <label htmlFor="qe-description">Description - what does this agent do?</label>
          <textarea id="qe-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="qe-field qe-field-full" style={{ "--qe-field-color": "var(--pass)" }}>
          <label htmlFor="qe-requirements">Requirements - what must this agent always/never do?</label>
          <textarea
            id="qe-requirements"
            rows={3}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="error-banner">{error}</p>}

      <div className="call-row">
        <button type="submit" className="btn btn-primary qe-btn-create" disabled={!canSubmit}>
          {busy ? "Creating…" : "Create evaluation →"}
        </button>
      </div>
    </form>
  );
}

function EvaluationList({ evaluations, navigate }) {
  if (evaluations.length === 0) {
    return <p className="pack-note">No evaluations yet. Create one to start generating test scenarios.</p>;
  }
  return (
    <div className="qe-eval-grid">
      {evaluations.map((evaluation) => (
        <button
          key={evaluation.id}
          type="button"
          className="qe-eval-card"
          onClick={() => navigate(`/qualeval/${encodeURIComponent(evaluation.id)}`)}
        >
          <span className="qe-eval-num">#{evaluation.id.slice(0, 8)}</span>
          <h4>{evaluation.name}</h4>
          <p className="qe-eval-target">{evaluation.agentPhoneNumber ?? "no phone number set"}</p>
          <span className="qe-eval-when">created {formatWhen(evaluation.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

function runStatus(run) {
  if (!run) return { text: "No runs yet", cls: "is-na" };
  if (run.verdict === "pass") return { text: "Pass", cls: "is-pass" };
  if (run.verdict === "fail") return { text: "Fail", cls: "is-flag" };
  if (run.verdict === "in_progress") return { text: "Call in progress…", cls: "is-na" };
  if (run.verdict === "awaiting_evaluation") return { text: "Call complete - awaiting evaluation…", cls: "is-na" };
  if (run.verdict === "error") return { text: `Error: ${run.error ?? "call could not be placed"}`, cls: "is-flag" };
  return { text: "Pending - not yet run", cls: "is-na" };
}

function VerdictPill({ run }) {
  const status = runStatus(run);
  if (run?.verdict !== "pass" && run?.verdict !== "fail") return null;
  return (
    <div className={`qe-verdict-pill ${run.verdict === "pass" ? "is-pass" : "is-fail"}`}>
      <span className="qe-verdict-icon">{run.verdict === "pass" ? "✓" : "✕"}</span>
      <span className="qe-verdict-text">
        <strong>{status.text}</strong>
        {run.assessment && <span>{run.assessment}</span>}
      </span>
    </div>
  );
}

function RunResult({ run }) {
  const turns = run?.transcript?.turns ?? [];
  const criterionResults = run?.criterionResults ?? [];
  if (turns.length === 0 && criterionResults.length === 0) return null;

  return (
    <div className="qe-run-result">
      <VerdictPill run={run} />
      <div className="qe-run-layout">
        {turns.length > 0 && (
          <div className="qe-transcript-card">
            <h4>Transcript</h4>
            {turns.map((turn, i) => (
              <div key={i} className={`qe-turn qe-turn-${turn.role === "user" ? "caller" : "agent"}`}>
                <span className="qe-turn-avatar">{turn.role === "user" ? "C" : "A"}</span>
                <span className="qe-turn-bubble">
                  {turn.text}
                  {formatTimestamp(turn.tMs) && <span className="qe-turn-time">{formatTimestamp(turn.tMs)}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        {criterionResults.length > 0 && (
          <div className="qe-criteria-card">
            <h4>Criteria results</h4>
            {criterionResults.map((c, i) => (
              <div key={i} className="qe-criterion-row">
                <div className="qe-criterion-head">
                  <span className={`qe-crit-dot ${c.met ? "is-pass" : "is-fail"}`} />
                  {c.criterion}
                </div>
                {!c.met && c.explanation && <div className="qe-evidence-quote">{c.explanation}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScenarioCard({ scenario, onApprove, onReject, onRun, busy }) {
  const latestRun = scenario.runs?.[0] ?? null;
  const status = runStatus(latestRun);

  return (
    <div className={`qe-scenario-card is-${scenario.status}`}>
      <div className="qe-scenario-head">
        <h4>{scenario.name}</h4>
        <div className="qe-scenario-badges">
          {scenario.category && <span className="qe-cat-badge">{scenario.category}</span>}
          <span className={`qe-status-chip is-${scenario.status}`}>{scenario.status}</span>
        </div>
      </div>

      {(scenario.persona || scenario.situation || scenario.callerObjectives || scenario.expectedBehavior) && (
        <div className="qe-scenario-meta-grid">
          {scenario.persona && (
            <div>
              <div className="qe-meta-k">Persona</div>
              <div className="qe-meta-v">{scenario.persona}</div>
            </div>
          )}
          {scenario.situation && (
            <div>
              <div className="qe-meta-k">Situation</div>
              <div className="qe-meta-v">{scenario.situation}</div>
            </div>
          )}
          {scenario.callerObjectives && (
            <div>
              <div className="qe-meta-k">Caller objectives</div>
              <div className="qe-meta-v">{scenario.callerObjectives}</div>
            </div>
          )}
          {scenario.expectedBehavior && (
            <div>
              <div className="qe-meta-k">Expected behavior</div>
              <div className="qe-meta-v">{scenario.expectedBehavior}</div>
            </div>
          )}
        </div>
      )}

      {scenario.evaluationCriteria?.length > 0 && (
        <ul className="qe-criteria-list">
          {scenario.evaluationCriteria.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}

      <div className="qe-scenario-actions">
        {scenario.status !== "approved" && (
          <button type="button" className="btn-sm primary" onClick={() => onApprove(scenario)} disabled={busy}>
            Approve
          </button>
        )}
        {scenario.status !== "rejected" && (
          <button type="button" className="btn-sm ghost" onClick={() => onReject(scenario)} disabled={busy}>
            Reject
          </button>
        )}
        {scenario.status === "approved" && (
          <button type="button" className="btn-sm primary" onClick={() => onRun(scenario)} disabled={busy}>
            ▶ Run
          </button>
        )}
      </div>

      {latestRun && latestRun.verdict !== "pass" && latestRun.verdict !== "fail" && (
        <div className="call-row">
          <span className={`finding-status ${status.cls}`}>{status.text}</span>
        </div>
      )}
      <RunResult run={latestRun} />
    </div>
  );
}

function ScenarioCountStepper({ count, onChange }) {
  return (
    <div className="qe-count-row">
      <label>Scenarios to generate</label>
      <div className="qe-count-input">
        <button
          type="button"
          className="qe-count-step"
          onClick={() => onChange(Math.max(MIN_SCENARIO_COUNT, count - 1))}
          disabled={count <= MIN_SCENARIO_COUNT}
        >
          −
        </button>
        <span>{count}</span>
        <button
          type="button"
          className="qe-count-step"
          onClick={() => onChange(Math.min(MAX_SCENARIO_COUNT, count + 1))}
          disabled={count >= MAX_SCENARIO_COUNT}
        >
          +
        </button>
      </div>
      <span className="qe-count-hint">default {DEFAULT_SCENARIO_COUNT} · max {MAX_SCENARIO_COUNT}</span>
    </div>
  );
}

function EvaluationDetail({ evaluationId, navigate, path }) {
  const [evaluation, setEvaluation] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [scenarioCount, setScenarioCount] = useState(DEFAULT_SCENARIO_COUNT);
  const [actionError, setActionError] = useState(null);
  const [busyScenarioId, setBusyScenarioId] = useState(null);

  const load = async () => {
    try {
      const loaded = await getEvaluation(evaluationId);
      setEvaluation(loaded);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message ?? "Could not load this evaluation.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId]);

  const onGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      await generateScenarios(evaluationId, feedback.trim() || undefined, scenarioCount);
      setFeedback("");
      await load();
    } catch (err) {
      setGenError(err.message ?? "Could not generate scenarios.");
    } finally {
      setGenerating(false);
    }
  };

  const onApprove = async (scenario) => {
    setActionError(null);
    setBusyScenarioId(scenario.id);
    try {
      await updateScenario(scenario.id, { status: "approved" });
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not approve the scenario.");
    } finally {
      setBusyScenarioId(null);
    }
  };

  const onReject = async (scenario) => {
    setActionError(null);
    setBusyScenarioId(scenario.id);
    try {
      await updateScenario(scenario.id, { status: "rejected" });
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not reject the scenario.");
    } finally {
      setBusyScenarioId(null);
    }
  };

  const onRun = async (scenario) => {
    setActionError(null);
    setBusyScenarioId(scenario.id);
    try {
      const run = await createRun(scenario.id);
      await getRun(run.id);
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not create the run.");
    } finally {
      setBusyScenarioId(null);
    }
  };

  if (loadError) {
    return (
      <AppShell path={path} navigate={navigate} title="QualEval">
        <p className="error-banner">{loadError}</p>
      </AppShell>
    );
  }
  if (!evaluation) {
    return (
      <AppShell path={path} navigate={navigate} title="QualEval">
        <p className="pack-note">Loading…</p>
      </AppShell>
    );
  }

  const scenarios = evaluation.scenarios ?? [];

  return (
    <AppShell
      path={path}
      navigate={navigate}
      title={evaluation.name}
      actions={
        <button type="button" className="btn btn-outline" onClick={() => navigate("/qualeval")}>
          Back to evaluations
        </button>
      }
    >
      <div className="qualeval-page">
        <p className="app-lede">
          Target: {evaluation.agentPhoneNumber ?? "no phone number set"}. {evaluation.description}
        </p>

        <div className="qualeval-review">
          <div className="qualeval-review-scenarios">
            <h2>Scenarios ({scenarios.length})</h2>
            {actionError && <p className="error-banner">{actionError}</p>}
            {scenarios.length === 0 && <p className="pack-note">No scenarios yet. Generate a batch to get started.</p>}
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                onApprove={onApprove}
                onReject={onReject}
                onRun={onRun}
                busy={busyScenarioId === scenario.id}
              />
            ))}
          </div>

          <div className="qe-feedback-panel">
            <h4>{scenarios.length === 0 ? "Generate scenarios" : "Regenerate with feedback"}</h4>
            <p className="qe-feedback-hint">
              Regenerating replaces every pending/rejected scenario with a new batch; already-approved
              scenarios are kept as-is.
            </p>
            <textarea
              rows={5}
              className="qe-feedback-box"
              placeholder="What should the next batch of scenarios cover differently? e.g. add more edge cases around cancellations."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <ScenarioCountStepper count={scenarioCount} onChange={setScenarioCount} />
            {genError && <p className="error-banner">{genError}</p>}
            <button type="button" className="qe-btn-regen" onClick={onGenerate} disabled={generating}>
              {generating ? "Generating…" : scenarios.length === 0 ? "Generate scenarios" : "Regenerate scenarios"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function QualEval({ navigate, path, evaluationId }) {
  const [evaluations, setEvaluations] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = async () => {
    try {
      const loaded = await listEvaluations();
      setEvaluations(loaded);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message ?? "Could not load evaluations.");
    }
  };

  useEffect(() => {
    if (evaluationId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId]);

  if (evaluationId) {
    return <EvaluationDetail evaluationId={evaluationId} navigate={navigate} path={path} />;
  }

  return (
    <AppShell path={path} navigate={navigate} title="QualEval">
      <div className="qualeval-page">
        <p className="app-lede">
          Black-box qualitative acceptance testing for AI voice agents. Describe a target agent by phone
          number, generate test scenarios, review and approve them, then run real calls and get a
          pass/fail verdict with evidence.
        </p>

        <NewEvaluationForm onCreated={(created) => navigate(`/qualeval/${encodeURIComponent(created.id)}`)} />

        {loadError && <p className="error-banner">{loadError}</p>}
        {evaluations && <EvaluationList evaluations={evaluations} navigate={navigate} />}
      </div>
    </AppShell>
  );
}
