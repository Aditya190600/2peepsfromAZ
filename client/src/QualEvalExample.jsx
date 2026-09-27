import { AppShell } from "./Chrome";
import { ExampleScorecard } from "./QualEval";
import { EXAMPLE_EVALUATION } from "./qualevalExampleData";

// Public, sign-in-free page for the static example, linked from the splash
// page. Signed-in users also reach the same content through the Examples tab
// on /qualeval.
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
        <ExampleScorecard />
      </div>
    </AppShell>
  );
}
