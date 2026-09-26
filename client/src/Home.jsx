import { useEffect } from "react";
import { AppShell } from "./Chrome";
import "./App.css";

const NAV_OVERVIEW = [
  {
    href: "/home",
    label: "Home",
    what: "This page. A map of what ComplyLine does and where each piece of it lives.",
    click: "You're already here.",
  },
  {
    href: "/try",
    label: "Try Compliance",
    what: "The live analysis lab: run a real mic call against the AssemblyAI Voice Agent, send a call through the webhook sandbox, or paste a transcript.",
    click:
      "Pick a persona, consent to analysis, then start a call or paste/upload a transcript. ComplyLine ends the call, runs every checked compliance check, and shows a severity-ranked report with a regulatory citation on each finding.",
  },
  {
    href: "/examples",
    label: "Compliance Examples",
    what: "Playable sample calls and scripted violation demos - no sign-in, API key, or live call needed.",
    click:
      "Pick a sample (a clean call, a TCPA violation, a late AI disclosure, etc.) to see a full compliance report instantly, or auto-split an uploaded recording by speaker to see the same pipeline on your own audio.",
  },
  {
    href: "/qualeval",
    label: "Qualitative Evals",
    what: "A separate testing tool: it phones your AI voice agent like a real customer would, instead of scanning a transcript you already have.",
    click:
      "Describe your agent (phone number, what it does, what it must always/never do). QualEval writes a batch of test-call scenarios, you approve the ones worth running, then it places real calls and judges each transcript pass/fail with the exact moment that proves it.",
  },
];

export default function Home({ navigate, path }) {
  useEffect(() => {
    document.title = "ComplyLine";
  }, []);

  return (
    <AppShell path={path} navigate={navigate} title="Home">
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
              <h3>{item.label}</h3>
              <p className="home-overview-what">{item.what}</p>
              <p className="home-overview-click">
                <strong>Click it:</strong> {item.click}
              </p>
            </a>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
