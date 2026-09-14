import { useState } from "react";
import { AppShell } from "./Chrome";
import { loadHistory, clearHistory } from "./reportHistory";
import { SEVERITY_LABEL, VERDICT_CLASS } from "./compliance";
import { Report } from "./Dashboard";
import "./App.css";

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function History({ navigate, path }) {
  const [entries, setEntries] = useState(() => loadHistory());

  const onClear = () => {
    clearHistory();
    setEntries([]);
  };

  return (
    <AppShell
      path={path}
      navigate={navigate}
      title="Sessions"
      actions={
        entries.length > 0 ? (
          <button className="btn btn-outline" onClick={onClear}>
            Clear history
          </button>
        ) : null
      }
    >
      {entries.length === 0 ? (
        <Report
          report={null}
          idleMessage="No reports yet. Run a live call, upload audio, or analyze a sample session from Try to start building history."
        />
      ) : (
        <div className="data-table-wrap">
          <p className="app-lede">
            Every report run in this browser, most recent first. Local to this browser, not a synced
            database.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Session ID</th>
                <th>Verdict</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <button
                      type="button"
                      className="table-link"
                      onClick={() => navigate(`/sessions/${encodeURIComponent(entry.sessionId ?? "")}`)}
                    >
                      {entry.label}
                    </button>
                  </td>
                  <td className="mono">{entry.sessionId ?? "no session id"}</td>
                  <td>
                    <span className={`finding-status ${VERDICT_CLASS[entry.verdictLevel] ?? "is-review"}`}>
                      {SEVERITY_LABEL[entry.verdictLevel] ?? entry.verdictLabel}
                    </span>
                  </td>
                  <td className="muted">{formatWhen(entry.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
