import { useEffect, useRef, useState } from "react";
import { NORTHSTAR_SESSIONS, NORTHSTAR_SESSION_KEYS } from "./sampleSessions";
import { AppShell, OpenTasksRail } from "./Chrome";
import { saveHistoryEntry, buildHistoryEntry } from "./reportHistory";
import { headlineVerdict } from "./compliance";
import { analyze, mapWithConcurrency, fetchBootStatus } from "./analyzeClient";
import { FleetView, Report, sampleLabel } from "./Dashboard";
import { flaggedTaskItems } from "./fleetStats";
import "./App.css";

const GENERIC_PACKS = ["generic"];

export default function Home({ navigate, path }) {
  const [fleetResults, setFleetResults] = useState([]);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetProgress, setFleetProgress] = useState({ done: 0, total: NORTHSTAR_SESSION_KEYS.length });
  const [fleetError, setFleetError] = useState(null);
  const [bootWarning, setBootWarning] = useState(null);
  const [showTasks, setShowTasks] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    document.title = "ComplyLine";
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function runNorthstar() {
      setFleetLoading(true);
      setFleetError(null);
      setFleetResults([]);
      setFleetProgress({ done: 0, total: NORTHSTAR_SESSION_KEYS.length });
      try {
        const boot = await fetchBootStatus();
        if (boot && boot.ok === false) {
          setBootWarning(boot.error ?? "The Northstar program cache is not ready.");
        }
        const reports = await mapWithConcurrency(
          NORTHSTAR_SESSION_KEYS,
          2,
          async (key) => {
            try {
              return { key, report: await analyze(NORTHSTAR_SESSIONS[key], GENERIC_PACKS) };
            } catch (err) {
              return { key, error: err.message ?? "This session could not be analyzed." };
            }
          },
          (done, total) => setFleetProgress({ done, total })
        );
        const results = reports.filter((row) => row.report);
        if (results.length === 0) {
          setFleetError(
            boot?.error ?? "The program could not be analyzed. No session reports were returned."
          );
          setFleetResults(null);
          return;
        }
        if (results.length === NORTHSTAR_SESSION_KEYS.length) {
          setBootWarning(null);
        }
        setFleetResults(results);
        for (const { key, report } of results) {
          const verdict = headlineVerdict(report.findings);
          saveHistoryEntry(
            buildHistoryEntry({ label: sampleLabel(key), report, session: NORTHSTAR_SESSIONS[key], verdict })
          );
        }
      } catch (err) {
        setFleetError(err.message ?? "Something went wrong running the fleet analysis.");
        setFleetResults(null);
      } finally {
        setFleetLoading(false);
        setFleetProgress(null);
      }
    }

    runNorthstar();
  }, []);

  const tasks = Array.isArray(fleetResults) ? flaggedTaskItems(fleetResults, sampleLabel) : [];
  const openSession = (sessionId) => {
    if (!sessionId) return;
    navigate(`/sessions/${encodeURIComponent(sessionId)}`);
  };

  return (
    <AppShell
      path={path}
      navigate={navigate}
      title="Home"
      actions={
        Array.isArray(fleetResults) && fleetResults.length > 0 ? (
          <button type="button" className="btn btn-outline" onClick={() => setShowTasks((open) => !open)}>
            {showTasks ? "Hide tasks" : "Show tasks"}
          </button>
        ) : null
      }
      rail={
        showTasks && Array.isArray(fleetResults) && fleetResults.length > 0 ? (
          <OpenTasksRail items={tasks} onHide={() => setShowTasks(false)} onOpen={openSession} />
        ) : null
      }
    >
      <p className="app-lede">
        Program queue for Northstar Voice. Live calls, uploads, and samples live on Try.
      </p>
      {bootWarning && fleetResults?.length > 0 && <p className="error-banner">{bootWarning}</p>}
      {fleetError ? (
        <Report report={null} error={fleetError} />
      ) : fleetLoading && fleetResults.length === 0 ? (
        <Report report={null} loading />
      ) : fleetResults?.length ? (
        <FleetView results={fleetResults} progress={fleetProgress} navigate={navigate} />
      ) : (
        <Report report={null} idleMessage="The program could not be analyzed." />
      )}
    </AppShell>
  );
}
