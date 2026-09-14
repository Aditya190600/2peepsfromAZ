import { AppShell } from "./Chrome";
import { findEntryBySessionId } from "./reportHistory";
import { Report } from "./Dashboard";
import "./App.css";

export default function SessionView({ navigate, path, sessionId }) {
  const entry = findEntryBySessionId(sessionId);

  return (
    <AppShell
      path={path}
      navigate={navigate}
      title="Report"
      actions={
        <a
          className="btn btn-outline"
          href="/sessions"
          onClick={(e) => {
            e.preventDefault();
            navigate("/sessions");
          }}
        >
          Back to sessions
        </a>
      }
    >
      <p className="app-lede">Stored compliance report. Reopened from history, no re-analysis.</p>
      {entry?.report ? (
        <section className="panel report-panel">
          <h2 className="report-heading">Compliance report</h2>
          <Report report={entry.report} />
        </section>
      ) : (
        <section className="panel report-panel">
          <h2 className="report-heading">Compliance report</h2>
          <Report
            report={null}
            idleMessage={`No stored report found for session ${sessionId || "(none)"}. It may have been cleared from history, or never analyzed in this browser.`}
          />
        </section>
      )}
    </AppShell>
  );
}
