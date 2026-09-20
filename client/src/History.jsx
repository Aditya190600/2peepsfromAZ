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
      <p className="app-lede">
        Sessions is a history list, stored in this browser's localStorage, not a shared database - it
        won't follow you to another device or browser. Every report you've run lands here, most
        recent first. Click any row to reopen that session's full report, or copy a session's URL to
        deep-link straight to it later.
      </p>
      {entries.length === 0 ? (
        <Report
          report={null}
          idleMessage="No reports yet. Run a live call, upload audio, or analyze a sample session from Try to start building history."
        />
      ) : (
        <div className="data-table-wrap">
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
