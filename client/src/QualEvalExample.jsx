import { AppShell } from "./Chrome";
import { RunResult } from "./QualEval";
import { EXAMPLE_EVALUATION, EXAMPLE_SCENARIO, EXAMPLE_RUN } from "./qualevalExampleData";

const SCENARIO_FIELDS = [
  ["Persona", EXAMPLE_SCENARIO.persona],
  ["Situation", EXAMPLE_SCENARIO.situation],
  ["Caller objectives", EXAMPLE_SCENARIO.callerObjectives],
  ["Expected behavior", EXAMPLE_SCENARIO.expectedBehavior],
];

// Read-only view of the static example in qualevalExampleData.js, linked from the
// splash page. Public like /examples: no sign-in, no API calls, and no
// edit/delete/run controls, so there is nothing here a visitor can remove.
export default function QualEvalExample({ navigate, path }) {
  return (
    <AppShell
      path={path}
      navigate={navigate}
      title={EXAMPLE_EVALUATION.name}
      actions={
        <button type="button" className="btn btn-outline" onClick={() => navigate("/qualeval")}>
          Run your own evaluation
        </button>
      }
    >
      <div className="qualeval-page">
        <p className="example-notice">
          <span className="example-badge">Example</span>
          A sample evaluation against our seeded-gap demo clinic agent. It illustrates a QualEval result and contains no
          customer data.
        </p>

        <ul className="qe-eval-summary">
          <li>
            <strong>Target agent:</strong> {EXAMPLE_EVALUATION.targetAgent}
          </li>
          <li>
            <strong>Description:</strong>
            <ListText text={EXAMPLE_EVALUATION.description} />
          </li>
          <li>
            <strong>Requirements:</strong>
            <ListText text={EXAMPLE_EVALUATION.requirements} />
          </li>
        </ul>

        <div className="qe-scenario-card is-approved">
          <div className="qe-scenario-head">
            <h4>{EXAMPLE_SCENARIO.name}</h4>
            <div className="qe-scenario-badges">
              <span className="qe-cat-badge">{EXAMPLE_SCENARIO.category}</span>
              <span className="example-badge">Example</span>
            </div>
          </div>
          <div className="qe-scenario-meta-grid">
            {SCENARIO_FIELDS.map(([label, value]) => (
              <div key={label}>
                <div className="qe-meta-k">{label}</div>
                <div className="qe-meta-v">{value}</div>
              </div>
            ))}
          </div>
          <ul className="qe-criteria-list">
            {EXAMPLE_SCENARIO.evaluationCriteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <RunResult run={EXAMPLE_RUN} />
        </div>
      </div>
    </AppShell>
  );
}

// The example's description/requirements are "- " bulleted lines, same as
// QualEval's templates.
function ListText({ text }) {
  return (
    <ul className="example-list">
      {text.split("\n").map((line) => (
        <li key={line}>{line.replace(/^- /, "")}</li>
      ))}
    </ul>
  );
}
