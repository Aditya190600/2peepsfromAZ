import { useEffect, useState } from "react";
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

function mergeSessions(remote) {
  const local = loadHistory();
  const seen = new Set(local.map((entry) => entry.sessionId));
  return [...remote.filter((entry) => !seen.has(entry.sessionId)), ...local].sort((a, b) =>
    (b.timestamp || "").localeCompare(a.timestamp || ""),
  );
}

export default function History({ navigate, path }) {
  const [remote, setRemote] = useState([]);
  const [entries, setEntries] = useState(() => loadHistory());

  useEffect(() => {
    let cancelled = false;
    fetch("/v1/telephony/sessions")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setRemote(list);
        setEntries(mergeSessions(list));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const onClear = () => {
    clearHistory();
    setEntries(remote);
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
        Reports you run in this browser stay in localStorage. Phone calls ingested on this server
        stay in the list after Clear history, and their links reopen from the server. Click a row
        to open the report.
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
