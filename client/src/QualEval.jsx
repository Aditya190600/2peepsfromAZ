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

function formatWhen(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function NewEvaluationForm({ onCreated }) {
  const [name, setName] = useState("");
  const [agentPhoneNumber, setAgentPhoneNumber] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = name.trim() && !busy;

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
    <form className="section-block" onSubmit={onSubmit}>
      <h3>New evaluation</h3>
      <p className="panel-label" htmlFor="qe-name">
        Name
      </p>
      <input id="qe-name" type="text" placeholder="e.g. Order desk agent" value={name} onChange={(e) => setName(e.target.value)} />

      <p className="panel-label" htmlFor="qe-phone">
        Target agent phone number
      </p>
      <input
        id="qe-phone"
        type="tel"
        placeholder="+1 555 555 0100"
        value={agentPhoneNumber}
        onChange={(e) => setAgentPhoneNumber(e.target.value)}
      />

      <p className="panel-label" htmlFor="qe-description">
        Description - what does this agent do?
      </p>
      <textarea
        id="qe-description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <p className="panel-label" htmlFor="qe-requirements">
        Requirements - what must this agent always/never do?
      </p>
      <textarea
        id="qe-requirements"
        rows={3}
        value={requirements}
        onChange={(e) => setRequirements(e.target.value)}
      />

      {error && <p className="error-banner">{error}</p>}

      <div className="call-row">
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {busy ? "Creating…" : "Create evaluation"}
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
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Target number</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {evaluations.map((evaluation) => (
            <tr key={evaluation.id}>
              <td>{evaluation.name}</td>
              <td className="muted">{evaluation.agentPhoneNumber ?? "-"}</td>
              <td className="muted">{formatWhen(evaluation.createdAt)}</td>
              <td>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => navigate(`/qualeval/${encodeURIComponent(evaluation.id)}`)}
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function runStatus(run) {
  if (!run) return { text: "No runs yet", cls: "is-na" };
  if (run.verdict === "pass") return { text: "Pass", cls: "is-pass" };
  if (run.verdict === "fail") return { text: "Fail", cls: "is-flag" };
  return { text: "Pending - not yet run", cls: "is-na" };
}

function ScenarioCard({ scenario, onApprove, onReject, onRun, busy }) {
  const latestRun = scenario.runs?.[0] ?? null;
  const status = runStatus(latestRun);
  return (
    <div className={`section-block qualeval-scenario is-${scenario.status}`}>
      <div className="call-row">
        <h3>{scenario.name}</h3>
        <span className={`finding-status ${scenario.status === "approved" ? "is-pass" : scenario.status === "rejected" ? "is-flag" : "is-na"}`}>
          {scenario.status}
        </span>
        {scenario.category && <span className="pack-note">{scenario.category}</span>}
      </div>
      {scenario.persona && (
        <p>
          <strong>Persona:</strong> {scenario.persona}
        </p>
      )}
      {scenario.situation && (
        <p>
          <strong>Situation:</strong> {scenario.situation}
        </p>
      )}
      {scenario.callerObjectives && (
        <p>
          <strong>Caller objectives:</strong> {scenario.callerObjectives}
        </p>
      )}
      {scenario.expectedBehavior && (
        <p>
          <strong>Expected behavior:</strong> {scenario.expectedBehavior}
        </p>
      )}
      {scenario.evaluationCriteria?.length > 0 && (
        <ul>
          {scenario.evaluationCriteria.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}

      <div className="call-row">
        {scenario.status !== "approved" && (
          <button type="button" className="btn btn-primary" onClick={() => onApprove(scenario)} disabled={busy}>
            Approve
          </button>
        )}
        {scenario.status !== "rejected" && (
          <button type="button" className="btn btn-outline" onClick={() => onReject(scenario)} disabled={busy}>
            Reject
          </button>
        )}
        {scenario.status === "approved" && (
          <button type="button" className="btn btn-outline" onClick={() => onRun(scenario)} disabled={busy}>
            Run (stub - real call placement pending Twilio credentials)
          </button>
        )}
      </div>

      <div className="call-row">
        <span className={`finding-status ${status.cls}`}>{status.text}</span>
        {latestRun?.assessment && <span className="pack-note">{latestRun.assessment}</span>}
      </div>
    </div>
  );
}

function EvaluationDetail({ evaluationId, navigate, path }) {
  const [evaluation, setEvaluation] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [feedback, setFeedback] = useState("");
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
      await generateScenarios(evaluationId, feedback.trim() || undefined);
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

        <div className="qualeval-review-feedback section-block">
          <h2>{scenarios.length === 0 ? "Generate scenarios" : "Regenerate with feedback"}</h2>
          <p className="pack-note">
            Regenerating replaces every pending/rejected scenario with a new batch; already-approved
            scenarios are kept as-is.
          </p>
          <textarea
            rows={6}
            placeholder="What should the next batch of scenarios cover differently? e.g. add more edge cases around cancellations."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          {genError && <p className="error-banner">{genError}</p>}
          <div className="call-row">
            <button type="button" className="btn btn-primary" onClick={onGenerate} disabled={generating}>
              {generating ? "Generating…" : scenarios.length === 0 ? "Generate scenarios" : "Regenerate"}
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
      <p className="app-lede">
        Black-box qualitative acceptance testing for AI voice agents. Describe a target agent by phone
        number, generate test scenarios, review and approve them, then run real calls and get a
        pass/fail verdict with evidence.
      </p>

      <NewEvaluationForm onCreated={(created) => navigate(`/qualeval/${encodeURIComponent(created.id)}`)} />

      {loadError && <p className="error-banner">{loadError}</p>}
      {evaluations && <EvaluationList evaluations={evaluations} navigate={navigate} />}
    </AppShell>
  );
}
