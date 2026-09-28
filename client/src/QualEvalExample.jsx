import { AppShell } from "./Chrome";
import { ExampleScorecards } from "./QualEval";

// Public, sign-in-free page for the static examples, linked from the splash
// page. Signed-in users also reach the same content through the Examples tab
// on /qualeval.
export default function QualEvalExample({ navigate, path }) {
  return (
    <AppShell
      path={path}
      navigate={navigate}
      title="QualEval examples"
      actions={
        <button type="button" className="btn btn-outline" onClick={() => navigate("/qualeval")}>
          Run your own evaluation
        </button>
      }
    >
      <div className="qualeval-page">
        <ExampleScorecards showName />
      </div>
    </AppShell>
  );
}
