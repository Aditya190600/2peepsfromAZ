import { useEffect, useRef, useState } from "react";
import { NORTHSTAR_SESSIONS, NORTHSTAR_SESSION_KEYS } from "./sampleSessions";
import { AppShell, OpenTasksRail } from "./Chrome";
import { saveHistoryEntry, buildHistoryEntry } from "./reportHistory";
import { headlineVerdict } from "./compliance";
import { analyze, mapWithConcurrency, fetchBootStatus } from "./analyzeClient";
import { FleetView, Report, sampleLabel } from "./Dashboard";
import { flaggedTaskItems } from "./fleetStats";
import tryScreenshot from "./assets/home/try-screenshot.png";
import examplesScreenshot from "./assets/home/examples-screenshot.png";
import qualevalScreenshot from "./assets/home/qualeval-screenshot.png";
import "./App.css";

const GENERIC_PACKS = ["generic"];

const NAV_OVERVIEW = [
  {
    href: "/home",
    label: "Home",
    what: "This page. A map of what ComplyLine does and where each piece of it lives.",
    click:
      "You're already here - it also runs the Northstar Voice compliance sweep below, a canned fleet of 12 sample calls you can analyze in one click.",
  },
  {
    href: "/try",
    label: "Try Compliance",
    what: "The live analysis lab: run a real mic call against the AssemblyAI Voice Agent, send a call through the webhook sandbox, or paste a transcript.",
    click:
      "Pick a persona, consent to analysis, then start a call or paste/upload a transcript. ComplyLine ends the call, runs every checked compliance check, and shows a severity-ranked report with a regulatory citation on each finding.",
    screenshot: tryScreenshot,
  },
  {
    href: "/examples",
    label: "Compliance Examples",
    what: "Playable sample calls and scripted violation demos - no sign-in, API key, or live call needed.",
    click:
      "Pick a sample (a clean call, a TCPA violation, a late AI disclosure, etc.) to see a full compliance report instantly, or auto-split an uploaded recording by speaker to see the same pipeline on your own audio.",
    screenshot: examplesScreenshot,
  },
  {
    href: "/qualeval",
    label: "Qualitative Evals",
    what: "A separate testing tool: it phones your AI voice agent like a real customer would, instead of scanning a transcript you already have.",
    click:
      "Describe your agent (phone number, what it does, what it must always/never do). QualEval writes a batch of test-call scenarios, you approve the ones worth running, then it places real calls and judges each transcript pass/fail with the exact moment that proves it.",
    screenshot: qualevalScreenshot,
  },
];

export default function Home({ navigate, path }) {
  const [fleetResults, setFleetResults] = useState([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetProgress, setFleetProgress] = useState(null);
  const [fleetError, setFleetError] = useState(null);
  const [bootWarning, setBootWarning] = useState(null);
  const [showTasks, setShowTasks] = useState(true);
  const [hasRun, setHasRun] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    document.title = "ComplyLine";
  }, []);

  function runNorthstar() {
    if (started.current) return;
    started.current = true;
    setHasRun(true);

    (async () => {
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
        started.current = false;
      }
    })();
  }

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
        <>
          <button type="button" className="btn btn-primary" onClick={runNorthstar} disabled={fleetLoading}>
            {fleetLoading ? "Running..." : hasRun ? "Run compliance sweep again" : "Run compliance sweep"}
          </button>
          {Array.isArray(fleetResults) && fleetResults.length > 0 ? (
            <button type="button" className="btn btn-outline" onClick={() => setShowTasks((open) => !open)}>
              {showTasks ? "Hide tasks" : "Show tasks"}
            </button>
          ) : null}
        </>
      }
      rail={
        showTasks && Array.isArray(fleetResults) && fleetResults.length > 0 ? (
          <OpenTasksRail items={tasks} onHide={() => setShowTasks(false)} onOpen={openSession} />
        ) : null
      }
    >
      <div className="styled-page">
        <p className="app-lede">
          ComplyLine turns a completed AI voice call into a compliance report - consent, disclosure,
          and PII checks, ranked by severity with a regulatory citation on each finding. QualEval,
          alongside it, tests an AI voice agent by actually calling it, the way a real customer
          would. Here is what each link in the left rail does.
        </p>
        <div className="home-overview-grid">
          {NAV_OVERVIEW.map((item) => (
            <a key={item.href} className="home-overview-card" href={item.href} onClick={(e) => {
              e.preventDefault();
              navigate(item.href);
            }}>
              {item.screenshot ? (
                <img className="home-overview-shot" src={item.screenshot} alt={`${item.label} page`} />
              ) : null}
              <h3>{item.label}</h3>
              <p className="home-overview-what">{item.what}</p>
              <p className="home-overview-click">
                <strong>Click it:</strong> {item.click}
              </p>
            </a>
          ))}
        </div>

        <h2 className="home-section-title">Compliance sweep - Northstar Voice program</h2>
        <p className="app-lede">
          Click "Run compliance sweep" to analyze the Northstar Voice program's fleet of sample
          sessions. What you can do: watch the fleet queue analyze in real time, open any flagged
          task to jump straight to its session, and hide the task rail when you just want the
          scoreboard. To analyze your own call, head to Try Compliance.
        </p>
        {bootWarning && fleetResults?.length > 0 && <p className="error-banner">{bootWarning}</p>}
        {fleetError ? (
          <Report report={null} error={fleetError} />
        ) : fleetLoading && fleetResults.length === 0 ? (
          <Report report={null} loading />
        ) : fleetResults?.length ? (
          <FleetView results={fleetResults} progress={fleetProgress} navigate={navigate} />
        ) : !hasRun ? (
          <Report report={null} idleMessage="No compliance sweep has been run yet. Click 'Run compliance sweep' to start." />
        ) : (
          <Report report={null} idleMessage="The program could not be analyzed." />
        )}
      </div>
    </AppShell>
  );
}
