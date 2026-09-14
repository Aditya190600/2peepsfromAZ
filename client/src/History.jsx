import { useState } from "react";
import { Nav, Footer } from "./Chrome";
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
    <div className="page">
      <Nav path={path} navigate={navigate} />
      <header className="masthead">
        <p className="tagline">
          Every report run in this browser, most recent first. This is a local audit trail, not a
          synced database - it lives in this browser only.
        </p>
      </header>

      <main className="history-panel panel">
        {entries.length === 0 ? (
          <Report
            report={null}
            idleMessage="No reports yet. Run a live call, upload audio, or analyze a sample session from Try to start building history."
          />
        ) : (
          <>
            <div className="history-toolbar">
              <span className="history-count">
                {entries.length} report{entries.length === 1 ? "" : "s"}
              </span>
              <button className="btn btn-outline" onClick={onClear}>
                Clear history
              </button>
            </div>
            <ul className="history-list">
              {entries.map((entry) => (
                <li key={entry.id} className="history-item">
                  <button
                    type="button"
                    className="history-item-link"
                    onClick={() => navigate(`/sessions/${encodeURIComponent(entry.sessionId ?? "")}`)}
                  >
                    <span className={`finding-status ${VERDICT_CLASS[entry.verdictLevel] ?? "is-review"}`}>
                      {SEVERITY_LABEL[entry.verdictLevel] ?? entry.verdictLabel}
                    </span>
                    <span className="history-item-label">{entry.label}</span>
                    <span className="history-item-session">{entry.sessionId ?? "no session id"}</span>
                    <span className="history-item-when">{formatWhen(entry.timestamp)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
