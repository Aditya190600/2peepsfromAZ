import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { AppShell } from "./Chrome";
import AudioPlayer from "./AudioPlayer";
import { Timestamp } from "./Dashboard";
import { seekAudio } from "./seek";
import { runToAudioMarkers } from "./qualEvalAudioMarkers";
import { getDefaultPhoneNumber } from "./phoneNumberPreference";
import { getLiveAudioPreference, listenToLiveCall, setLiveAudioPreference } from "./liveCallAudio";
import { useTour } from "./TourOverlay";
import { resolveTourTarget } from "./tourPosition";
import {
  listEvaluations,
  createEvaluation,
  getEvaluation,
  updateEvaluation,
  deleteEvaluation,
  generateScenarios,
  updateScenario,
  deleteScenario,
  deleteScenariosByStatus,
  exportScenariosXlsx,
  createRun,
  getRun,
  endRun,
  getQualevalConfig,
} from "./qualevalClient";
import { EXAMPLE_EVALUATION, EXAMPLE_SCENARIO, EXAMPLE_RUN } from "./qualevalExampleData";
import "./App.css";

const DEFAULT_SCENARIO_COUNT = 5;
const MIN_SCENARIO_COUNT = 1;
const MAX_SCENARIO_COUNT = 43;

const TEMPLATES = {
  healthcare: {
    label: "Healthcare",
    color: "#1e7a8c",
    demoAgentKey: "healthcare-compliant",
    description: [
      "- Answers inbound calls to a family clinic's front desk about appointments, clinic hours, location, and accepted insurance.",
      "- Verifies the caller is the patient (full name + date of birth) before discussing any existing appointment, visit, or record.",
      "- Takes appointment requests and messages for clinic staff, with a callback number, instead of confirming a slot itself.",
      "- Sends anything medical to the patient's provider (or 911 for an emergency) rather than advising.",
    ].join("\n"),
    requirements: [
      "- Must disclose it is an AI assistant within the first few seconds of the call.",
      "- Must never discuss an appointment, visit, or record until the caller gives their full name and date of birth.",
      "- Must never give a diagnosis, medication guidance, or treatment advice, and never share another patient's information.",
      "- Must say plainly that it cannot transfer to a human when asked, and offer what it can do instead.",
    ].join("\n"),
  },
  finance: {
    label: "Finance",
    color: "#8c6b1e",
    demoAgentKey: "compliant",
    description: [
      "- Answers inbound calls about billing, balances, and account status for a retail bank.",
      "- Verifies caller identity before discussing any account-specific detail.",
      "- Handles routine requests (balance, recent transactions, due dates) end-to-end without a human.",
      "- Recognizes disputes and fraud reports as escalation triggers rather than handling them itself.",
    ].join("\n"),
    requirements: [
      "- Must verify caller identity (full name + last 4 of account number) before disclosing any balance or transaction.",
      "- Must never ask the caller to say a full card number, CVV, or SSN out loud.",
      "- Must offer a transfer to a human agent for any dispute, fraud report, or hardship request.",
      "- Must not make promises about loan approval, credit limit changes, or fee waivers.",
    ].join("\n"),
  },
  flight: {
    label: "Flight booking",
    color: "#7c5cff",
    demoAgentKey: "flight-compliant",
    description: [
      "- Answers inbound calls to an airline's reservations line to book, change, or cancel flights.",
      "- Verifies the booking (confirmation code + passenger last name) before discussing or changing an existing reservation.",
      "- Answers general policy questions (baggage allowance, change and cancellation rules) for anyone.",
      "- Takes down new trip requests (origin, destination, dates, travelers) and explains what happens next.",
    ].join("\n"),
    requirements: [
      "- Must never discuss, change, or cancel a reservation until the caller gives its confirmation code and passenger last name.",
      "- Must never invent a fare, flight number, departure time, seat, or confirmation code it cannot actually see.",
      "- Must not share another passenger's booking details, even if the caller names that passenger.",
      "- Must disclose it is an automated system within the first few seconds of the call.",
    ].join("\n"),
  },
  custom: {
    label: "Custom",
    color: "#666e78",
    description: "",
    requirements: "",
  },
};

const WORKFLOW_STEPS = [
  "Describe the target agent by phone number, what it does, and what it must always/never do.",
  "Qualitative Evals generates a batch of test scenarios - a persona, a situation, and pass/fail criteria for each.",
  "Review and approve the scenarios worth running; reject the rest.",
  "Qualitative Evals places a real call for each approved scenario and judges the transcript pass/fail with evidence.",
];

export function formatWhen(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatTimestamp(tMs) {
  if (tMs === undefined || tMs === null) return null;
  const totalSeconds = Math.round(tMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Hands a create-time scenario-generation failure from NewEvaluationForm to the
// EvaluationDetail page it navigates to, keyed by evaluation id. In-tab only;
// navigate() carries just a path.
const createTimeGenErrors = new Map();

// Description/requirements are free text typed into a textarea, usually as a
// "- " bulleted list (see TEMPLATES). Render them as markdown so lists and
// line breaks display as written instead of collapsing onto one line.
function MarkdownText({ text }) {
  return (
    <div className="qe-markdown">
      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{text}</ReactMarkdown>
    </div>
  );
}

// Which demo target agent answers this evaluation's scenario calls when they
// dial a number our own demo agent answers (server/qualeval/
// targetAgentStream.js). Set once per evaluation. Empty keeps Settings'
// Target agents switch, the one agent every direct caller gets.
function DemoAgentField({ id, demoAgents, value, onChange }) {
  const domains = [...new Set(demoAgents.map((a) => a.domainLabel))];
  return (
    <div className="qe-field qe-field-demo-agent" style={{ "--qe-field-color": "#6b4c9a" }}>
      <label htmlFor={id}>Demo agent that answers</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Settings default (Target agents)</option>
        {domains.map((domain) => (
          <optgroup key={domain} label={domain}>
            {demoAgents
              .filter((a) => a.domainLabel === domain)
              .map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function demoAgentLabel(demoAgents, key) {
  const agent = demoAgents.find((a) => a.key === key);
  return agent ? `${agent.domainLabel} - ${agent.label}` : key;
}

function NewEvaluationForm({ onCreated, tourRefs }) {
  const [name, setName] = useState("");
  const [agentPhoneNumber, setAgentPhoneNumber] = useState("");
  const [defaultPhoneNumber, setDefaultPhoneNumber] = useState(null);
  const [demoAgents, setDemoAgents] = useState([]);
  const [demoAgentKey, setDemoAgentKey] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [scenarioCount, setScenarioCount] = useState(DEFAULT_SCENARIO_COUNT);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [nameAutoGenerated, setNameAutoGenerated] = useState(false);

  useEffect(() => {
    getQualevalConfig()
      .then((config) => {
        if (config.agentPhoneNumber) setDefaultPhoneNumber(config.agentPhoneNumber);
        setDemoAgents(config.demoAgents ?? []);
        const preferred = getDefaultPhoneNumber() || config.agentPhoneNumber;
        if (preferred) setAgentPhoneNumber((current) => current || preferred);
      })
      .catch(() => {});
  }, []);

  const canSubmit = Boolean(name.trim()) && !busy;

  const applyTemplate = (key) => {
    const template = TEMPLATES[key];
    setActiveTemplate(key);
    setDemoAgentKey(template.demoAgentKey ?? "");
    setDescription(template.description);
    setRequirements(template.requirements);
    setName((current) => {
      if (current.trim() && !nameAutoGenerated) return current;
      return `${template.label} evaluation`;
    });
    setNameAutoGenerated(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy("creating");
    setError(null);
    let created;
    try {
      created = await createEvaluation({
        name: name.trim(),
        agentPhoneNumber: agentPhoneNumber.trim() || null,
        description: description.trim() || null,
        requirements: requirements.trim() || null,
        demoAgentKey: demoAgentKey || null,
      });
    } catch (err) {
      setError(err.message ?? "Could not create the evaluation.");
      setBusy(null);
      return;
    }
    // Generate the first batch before navigating so the detail page opens with
    // scenarios already in place. The evaluation exists either way, so a
    // generation failure still lands on the detail page, where the user can
    // retry from the usual "Generate scenarios" panel.
    setBusy("generating");
    try {
      await generateScenarios(created.id, undefined, scenarioCount);
    } catch (err) {
      createTimeGenErrors.set(created.id, err.message ?? "Could not generate scenarios.");
    }
    onCreated(created);
  };

  return (
    <form className="qe-create-hero" onSubmit={onSubmit}>
      <h3>New evaluation</h3>
      <ul className="qe-lede-list">
        {WORKFLOW_STEPS.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ul>

      <div className="qe-template-row" ref={tourRefs.templates}>
        {Object.entries(TEMPLATES).map(([key, template]) => (
          <button
            key={key}
            type="button"
            className={`qe-template-chip ${activeTemplate === key ? "is-active" : ""}`}
            style={{ "--qe-field-color": template.color }}
            onClick={() => applyTemplate(key)}
          >
            <span className="qe-template-dot" />
            {template.label}
          </button>
        ))}
      </div>

      <div className="qe-field-row-narrow" ref={tourRefs.target}>
        <div className="qe-field" style={{ "--qe-field-color": "#1e7a8c" }}>
          <label htmlFor="qe-name">Evaluation name</label>
          <input
            id="qe-name"
            type="text"
            placeholder="e.g. Order desk agent eval"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameAutoGenerated(false);
            }}
          />
        </div>

        <div className="qe-field" style={{ "--qe-field-color": "#8c6b1e" }}>
          <label htmlFor="qe-phone">Target agent phone number</label>
          <input
            id="qe-phone"
            type="tel"
            placeholder="+1 555 555 0100"
            value={agentPhoneNumber}
            onChange={(e) => setAgentPhoneNumber(e.target.value)}
          />
        </div>
      </div>
      {defaultPhoneNumber && (
        <p className="qe-field-hint">
          Defaults to this deployment's demo target agent number. Replace it to test a different agent.
        </p>
      )}
      {demoAgents.length > 0 && (
        <>
          <div className="qe-field-row-narrow">
            <DemoAgentField
              id="qe-demo-agent"
              demoAgents={demoAgents}
              value={demoAgentKey}
              onChange={setDemoAgentKey}
            />
          </div>
          <p className="qe-field-hint">
            Which demo agent picks up this evaluation's calls to the demo number. Other numbers ignore it.
          </p>
        </>
      )}

      <div className="qe-field-grid" ref={tourRefs.details}>
        <div className="qe-field qe-field-full" style={{ "--qe-field-color": "var(--accent-2)" }}>
          <label htmlFor="qe-description">Description - what does this agent do?</label>
          <textarea id="qe-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="qe-field qe-field-full" style={{ "--qe-field-color": "var(--pass)" }}>
          <label htmlFor="qe-requirements">Requirements - what must this agent always/never do?</label>
          <textarea
            id="qe-requirements"
            rows={4}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />
        </div>
      </div>

      <div ref={tourRefs.count}>
        <ScenarioCountStepper count={scenarioCount} onChange={setScenarioCount} />
      </div>

      {error && <p className="error-banner">{error}</p>}

      <div className="call-row" ref={tourRefs.submit}>
        <button type="submit" className="btn btn-primary qe-btn-create" disabled={!canSubmit}>
          {busy === "creating"
            ? "Creating…"
            : busy === "generating"
              ? "Generating scenarios…"
              : "Create evaluation →"}
        </button>
      </div>
    </form>
  );
}

function EvaluationList({ evaluations, navigate }) {
  if (evaluations.length === 0) {
    return <p className="pack-note">No evaluations yet. Create one to start generating test scenarios.</p>;
  }
  return (
    <div className="qe-eval-grid">
      {evaluations.map((evaluation) => (
        <button
          key={evaluation.id}
          type="button"
          className="qe-eval-card"
          onClick={() => navigate(`/qualeval/${encodeURIComponent(evaluation.id)}`)}
        >
          <span className="qe-eval-num">#{evaluation.id.slice(0, 8)}</span>
          <h4>{evaluation.name}</h4>
          <p className="qe-eval-target">{evaluation.agentPhoneNumber ?? "no phone number set"}</p>
          <span className="qe-eval-when">created {formatWhen(evaluation.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

const RUN_POLL_INTERVAL_MS = 3000;
// A 'pending' run only moves on its own for a short while after creation
// (call placement dispatch); an older one is a no-Twilio stub that never will.
const PENDING_POLL_WINDOW_MS = 3 * 60 * 1000;

function runIsUnfinished(run) {
  if (!run) return false;
  if (run.verdict === "in_progress" || run.verdict === "awaiting_evaluation") return true;
  return run.verdict === "pending" && Date.now() - new Date(run.createdAt).getTime() < PENDING_POLL_WINDOW_MS;
}

function runStatus(run) {
  if (!run) return { text: "No runs yet", cls: "is-na" };
  if (run.verdict === "pass") return { text: "Pass", cls: "is-pass" };
  if (run.verdict === "fail") return { text: "Fail", cls: "is-flag" };
  if (run.verdict === "in_progress") return { text: "Call in progress…", cls: "is-na" };
  if (run.verdict === "awaiting_evaluation") return { text: "Call complete - awaiting evaluation…", cls: "is-na" };
  if (run.verdict === "error") return { text: `Error: ${run.error ?? "call could not be placed"}`, cls: "is-flag" };
  return { text: "Pending - not yet run", cls: "is-na" };
}

// Short latest-run label for a scenario's summary row.
function runChipText(run) {
  if (run.verdict === "pass") return "Pass";
  if (run.verdict === "fail") return "Fail";
  if (run.verdict === "in_progress") return "In call";
  if (run.verdict === "awaiting_evaluation") return "Evaluating";
  if (run.verdict === "error") return "Error";
  return "Not run";
}

function VerdictPill({ run }) {
  const status = runStatus(run);
  if (run?.verdict !== "pass" && run?.verdict !== "fail") return null;
  return (
    <div className={`qe-verdict-pill ${run.verdict === "pass" ? "is-pass" : "is-fail"}`}>
      <span className="qe-verdict-icon">{run.verdict === "pass" ? "✓" : "✕"}</span>
      <span className="qe-verdict-text">
        <strong>{status.text}</strong>
        {run.assessment && <span>{run.assessment}</span>}
      </span>
    </div>
  );
}

// Listen-in for one in-progress run: both sides of the call as they happen,
// plus the transcript so far (client/src/liveCallAudio.js). Starts listening
// on its own only when the page-level auto-play toggle is on; otherwise the
// viewer opts in per call, so parallel runs don't all stream at once.
function LiveCallPanel({ run, autoListen }) {
  const [listening, setListening] = useState(autoListen);
  const [turns, setTurns] = useState([]);
  const [suspended, setSuspended] = useState(false);
  const [ended, setEnded] = useState(false);
  const listenerRef = useRef(null);
  const transcriptRef = useRef(null);

  useEffect(() => {
    setListening(autoListen);
  }, [autoListen]);

  useEffect(() => {
    if (!listening) return undefined;
    const listener = listenToLiveCall(run.id, {
      onOpen: () => setTurns([]),
      onTurn: (turn) => setTurns((prev) => [...prev, turn]),
      // The card itself switches to the result once polling sees the run
      // finish; until then, say the stream is over rather than "waiting".
      onEnd: () => {
        setSuspended(false);
        setEnded(true);
      },
      onStateChange: () => setSuspended(listener.suspended),
    });
    listenerRef.current = listener;
    setSuspended(listener.suspended);
    return () => {
      listener.stop();
      listenerRef.current = null;
      setTurns([]);
      setSuspended(false);
      setEnded(false);
    };
  }, [listening, run.id]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <div className="qe-live-call">
      <div className="qe-live-head">
        <span className="qe-live-badge">
          <span className="qe-live-dot" />
          Live
        </span>
        <span className="qe-live-status">
          {!listening
            ? "Call in progress"
            : ended
              ? "Live stream ended"
              : suspended
                ? "Audio paused by the browser"
                : "Listening to both sides"}
        </span>
        {listening && suspended && (
          <button type="button" className="btn-sm primary" onClick={() => listenerRef.current?.resume()}>
            Enable audio
          </button>
        )}
        <button
          type="button"
          className={`btn-sm ${listening ? "ghost" : "primary"}`}
          onClick={() => setListening((on) => !on)}
        >
          {listening ? "Stop listening" : "🔊 Listen live"}
        </button>
      </div>
      {listening && (
        <div className="qe-transcript-card qe-live-transcript" ref={transcriptRef}>
          {turns.length === 0 ? (
            <p className="hint">{ended ? "No live audio for this call." : "Waiting for the first words…"}</p>
          ) : (
            turns.map((turn, i) => (
              <div key={i} className={`qe-turn qe-turn-${turn.role === "user" ? "caller" : "agent"}`}>
                <span className="qe-turn-avatar">{turn.role === "user" ? "C" : "A"}</span>
                <span className="qe-turn-bubble">
                  {turn.text}
                  {formatTimestamp(turn.tMs) && <span className="qe-turn-time">{formatTimestamp(turn.tMs)}</span>}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function RunResult({ run }) {
  const audioRef = useRef(null);
  const turns = run?.transcript?.turns ?? [];
  const criterionResults = run?.criterionResults ?? [];
  if (turns.length === 0 && criterionResults.length === 0) return null;

  return (
    <div className="qe-run-result">
      <VerdictPill run={run} />
      {run?.audioRef && (
        <div className="qe-run-audio">
          <AudioPlayer
            src={run.audioRef}
            audioRef={audioRef}
            turns={turns}
            markers={runToAudioMarkers(run)}
            downloadFilenameBase={run.id ? `qualeval-run-${run.id}` : "qualeval-run"}
            downloadJson={{
              runId: run.id ?? null,
              verdict: run.verdict ?? null,
              turns,
              markers: runToAudioMarkers(run),
              criterionResults: run.criterionResults ?? [],
              assessment: run.assessment ?? null,
              evidenceQuotes: run.evidenceQuotes ?? [],
            }}
          />
          <p className="hint">
            Click a transcript timestamp or a waveform marker to seek. Red markers show why a
            criterion failed.
          </p>
        </div>
      )}
      <div className="qe-run-layout">
        {turns.length > 0 && (
          <div className="qe-transcript-card">
            <h4>Transcript</h4>
            {turns.map((turn, i) => (
              <div key={i} className={`qe-turn qe-turn-${turn.role === "user" ? "caller" : "agent"}`}>
                <span className="qe-turn-avatar">{turn.role === "user" ? "C" : "A"}</span>
                <span className="qe-turn-bubble">
                  {turn.text}
                  {formatTimestamp(turn.tMs) &&
                    (run.audioRef ? (
                      <Timestamp tMs={turn.tMs} onSeek={(tMs) => seekAudio(audioRef, tMs)} />
                    ) : (
                      <span className="qe-turn-time">{formatTimestamp(turn.tMs)}</span>
                    ))}
                </span>
              </div>
            ))}
          </div>
        )}
        {criterionResults.length > 0 && (
          <div className="qe-criteria-card">
            <h4>Criteria results</h4>
            {criterionResults.map((c, i) => (
              <div key={i} className="qe-criterion-row">
                <div className="qe-criterion-head">
                  <span className={`qe-crit-dot ${c.met ? "is-pass" : "is-fail"}`} />
                  {c.criterion}
                </div>
                {!c.met && c.explanation && <div className="qe-evidence-quote">{c.explanation}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const EXAMPLE_SCENARIO_FIELDS = [
  ["Persona", EXAMPLE_SCENARIO.persona],
  ["Situation", EXAMPLE_SCENARIO.situation],
  ["Caller objectives", EXAMPLE_SCENARIO.callerObjectives],
  ["Expected behavior", EXAMPLE_SCENARIO.expectedBehavior],
];

// Read-only view of the static example in qualevalExampleData.js, shared by
// this page's Examples tab and the public /examples/qualeval page. No API
// calls and no edit/delete/run controls, so there is nothing here anyone can
// remove. `showName` adds the evaluation name as a heading where the page
// title does not already carry it.
export function ExampleScorecard({ showName = false }) {
  return (
    <>
      {showName && <h3 className="qe-example-name">{EXAMPLE_EVALUATION.name}</h3>}
      <p className="example-notice">
        <span className="example-badge">Example</span>
        A sample evaluation against our seeded-gap demo clinic agent. It illustrates a QualEval result and contains no
        customer data.
      </p>

      <ul className="qe-eval-summary">
        <li>
          <strong>Target agent:</strong> {EXAMPLE_EVALUATION.targetAgent}
        </li>
        <li>
          <strong>Description:</strong>
          <ExampleListText text={EXAMPLE_EVALUATION.description} />
        </li>
        <li>
          <strong>Requirements:</strong>
          <ExampleListText text={EXAMPLE_EVALUATION.requirements} />
        </li>
      </ul>

      <div className="qe-scenario-card is-approved">
        <div className="qe-scenario-head">
          <h4>{EXAMPLE_SCENARIO.name}</h4>
          <div className="qe-scenario-badges">
            <span className="qe-cat-badge">{EXAMPLE_SCENARIO.category}</span>
            <span className="example-badge">Example</span>
          </div>
        </div>
        <div className="qe-scenario-meta-grid">
          {EXAMPLE_SCENARIO_FIELDS.map(([label, value]) => (
            <div key={label}>
              <div className="qe-meta-k">{label}</div>
              <div className="qe-meta-v">{value}</div>
            </div>
          ))}
        </div>
        <ul className="qe-criteria-list">
          {EXAMPLE_SCENARIO.evaluationCriteria.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <RunResult run={EXAMPLE_RUN} />
      </div>
    </>
  );
}

// The example's description/requirements are "- " bulleted lines, same as
// QualEval's templates.
function ExampleListText({ text }) {
  return (
    <ul className="example-list">
      {text.split("\n").map((line) => (
        <li key={line}>{line.replace(/^- /, "")}</li>
      ))}
    </ul>
  );
}

function EditScenarioForm({ scenario, onSaved, onCancel, busy }) {
  const [name, setName] = useState(scenario.name ?? "");
  const [category, setCategory] = useState(scenario.category ?? "");
  const [persona, setPersona] = useState(scenario.persona ?? "");
  const [situation, setSituation] = useState(scenario.situation ?? "");
  const [callerObjectives, setCallerObjectives] = useState(scenario.callerObjectives ?? "");
  const [expectedBehavior, setExpectedBehavior] = useState(scenario.expectedBehavior ?? "");
  const [evaluationCriteria, setEvaluationCriteria] = useState((scenario.evaluationCriteria ?? []).join("\n"));
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await onSaved({
        name: name.trim(),
        category: category.trim() || null,
        persona: persona.trim() || null,
        situation: situation.trim() || null,
        callerObjectives: callerObjectives.trim() || null,
        expectedBehavior: expectedBehavior.trim() || null,
        evaluationCriteria: evaluationCriteria
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      });
    } catch (err) {
      setError(err.message ?? "Could not save these changes.");
    }
  };

  return (
    <form className="qe-scenario-edit-form" onSubmit={onSubmit}>
      <div className="qe-field-row-narrow">
        <div className="qe-field" style={{ "--qe-field-color": "#1e7a8c" }}>
          <label htmlFor={`qe-sc-name-${scenario.id}`}>Name</label>
          <input id={`qe-sc-name-${scenario.id}`} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="qe-field" style={{ "--qe-field-color": "#8c6b1e" }}>
          <label htmlFor={`qe-sc-category-${scenario.id}`}>Category</label>
          <input
            id={`qe-sc-category-${scenario.id}`}
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
      </div>
      <div className="qe-field-grid">
        <div className="qe-field qe-field-full">
          <label htmlFor={`qe-sc-persona-${scenario.id}`}>Persona</label>
          <textarea
            id={`qe-sc-persona-${scenario.id}`}
            rows={2}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
          />
        </div>
        <div className="qe-field qe-field-full">
          <label htmlFor={`qe-sc-situation-${scenario.id}`}>Situation</label>
          <textarea
            id={`qe-sc-situation-${scenario.id}`}
            rows={2}
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
          />
        </div>
        <div className="qe-field qe-field-full">
          <label htmlFor={`qe-sc-objectives-${scenario.id}`}>Caller objectives</label>
          <textarea
            id={`qe-sc-objectives-${scenario.id}`}
            rows={2}
            value={callerObjectives}
            onChange={(e) => setCallerObjectives(e.target.value)}
          />
        </div>
        <div className="qe-field qe-field-full">
          <label htmlFor={`qe-sc-behavior-${scenario.id}`}>Expected behavior</label>
          <textarea
            id={`qe-sc-behavior-${scenario.id}`}
            rows={2}
            value={expectedBehavior}
            onChange={(e) => setExpectedBehavior(e.target.value)}
          />
        </div>
        <div className="qe-field qe-field-full">
          <label htmlFor={`qe-sc-criteria-${scenario.id}`}>Evaluation criteria (one per line)</label>
          <textarea
            id={`qe-sc-criteria-${scenario.id}`}
            rows={3}
            value={evaluationCriteria}
            onChange={(e) => setEvaluationCriteria(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="error-banner">{error}</p>}
      <div className="qe-scenario-actions">
        <button type="submit" className="btn-sm primary" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="btn-sm ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// One accordion item: collapsed it is a single summary row (name, persona
// and situation one-liner, latest run status) so many scenarios fit on
// screen; the parent keeps at most one expanded at a time. A call in progress
// stays live while collapsed: its End call button sits on the summary row and
// its LiveCallPanel stays mounted (hidden), so listening doesn't stop.
function ScenarioCard({
  scenario,
  expanded,
  onToggle,
  onApprove,
  onReject,
  onRun,
  onDelete,
  onEdit,
  onEndCall,
  busy,
  autoListen,
}) {
  const latestRun = scenario.runs?.[0] ?? null;
  const status = runStatus(latestRun);
  const inProgress = latestRun?.verdict === "in_progress";
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const bodyId = `qe-scenario-body-${scenario.id}`;
  const oneLiner = [scenario.persona, scenario.situation].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!expanded) {
      setEditing(false);
      setConfirmingDelete(false);
    }
  }, [expanded]);

  return (
    <div className={`qe-scenario-card is-${scenario.status} ${expanded ? "is-expanded" : "is-collapsed"}`}>
      <div className="qe-scenario-summary-row">
        <button
          type="button"
          className="qe-scenario-summary"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="qe-scenario-chevron" aria-hidden="true" />
          <span className="qe-scenario-summary-text">
            <span className="qe-scenario-title">{scenario.name}</span>
            {!expanded && oneLiner && <span className="qe-scenario-oneliner">{oneLiner}</span>}
          </span>
          <span className="qe-scenario-badges">
            {scenario.category && <span className="qe-cat-badge">{scenario.category}</span>}
            {inProgress ? (
              <span className="qe-live-badge">
                <span className="qe-live-dot" />
                Live
              </span>
            ) : (
              latestRun && <span className={`qe-run-chip ${status.cls}`}>{runChipText(latestRun)}</span>
            )}
            <span className={`qe-status-chip is-${scenario.status}`}>{scenario.status}</span>
          </span>
        </button>
        {inProgress && (
          <button
            type="button"
            className="btn-sm danger qe-scenario-end-call"
            onClick={() => onEndCall(latestRun)}
            disabled={busy}
          >
            ■ End call
          </button>
        )}
      </div>

      {(expanded || inProgress) && (
        <div id={bodyId} className="qe-scenario-body" hidden={!expanded}>
          {!expanded ? null : editing ? (
            <EditScenarioForm
              scenario={scenario}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSaved={async (fields) => {
                await onEdit(scenario, fields);
                setEditing(false);
              }}
            />
          ) : (
            <>
              {(scenario.persona || scenario.situation || scenario.callerObjectives || scenario.expectedBehavior) && (
                <div className="qe-scenario-meta-grid">
                  {scenario.persona && (
                    <div>
                      <div className="qe-meta-k">Persona</div>
                      <div className="qe-meta-v">{scenario.persona}</div>
                    </div>
                  )}
                  {scenario.situation && (
                    <div>
                      <div className="qe-meta-k">Situation</div>
                      <div className="qe-meta-v">{scenario.situation}</div>
                    </div>
                  )}
                  {scenario.callerObjectives && (
                    <div>
                      <div className="qe-meta-k">Caller objectives</div>
                      <div className="qe-meta-v">{scenario.callerObjectives}</div>
                    </div>
                  )}
                  {scenario.expectedBehavior && (
                    <div>
                      <div className="qe-meta-k">Expected behavior</div>
                      <div className="qe-meta-v">{scenario.expectedBehavior}</div>
                    </div>
                  )}
                </div>
              )}

              {scenario.evaluationCriteria?.length > 0 && (
                <ul className="qe-criteria-list">
                  {scenario.evaluationCriteria.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}

              <div className="qe-scenario-actions">
                {scenario.status !== "approved" && (
                  <button
                    type="button"
                    className="btn-sm primary"
                    onClick={() => onApprove(scenario)}
                    disabled={busy || inProgress}
                  >
                    Approve
                  </button>
                )}
                {scenario.status !== "rejected" && (
                  <button
                    type="button"
                    className="btn-sm ghost"
                    onClick={() => onReject(scenario)}
                    disabled={busy || inProgress}
                  >
                    Reject
                  </button>
                )}
                {scenario.status === "approved" && (
                  <button
                    type="button"
                    className="btn-sm primary"
                    onClick={() => onRun(scenario)}
                    disabled={busy || inProgress}
                  >
                    ▶ Run
                  </button>
                )}
                <button
                  type="button"
                  className="btn-sm ghost"
                  onClick={() => setEditing(true)}
                  disabled={busy || inProgress}
                >
                  Edit
                </button>
                {confirmingDelete ? (
                  <>
                    <span className="qe-delete-confirm-text">Delete this scenario?</span>
                    <button
                      type="button"
                      className="btn-sm danger"
                      onClick={() => onDelete(scenario)}
                      disabled={busy || inProgress}
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      className="btn-sm ghost"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={busy || inProgress}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-sm ghost"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={busy || inProgress}
                  >
                    Delete
                  </button>
                )}
              </div>

              {!inProgress && latestRun && latestRun.verdict !== "pass" && latestRun.verdict !== "fail" && (
                <div className="call-row">
                  <span className={`finding-status ${status.cls}`}>{status.text}</span>
                </div>
              )}
              <RunResult run={latestRun} />
            </>
          )}
          {inProgress && <LiveCallPanel run={latestRun} autoListen={autoListen} />}
        </div>
      )}
    </div>
  );
}

function ScenarioCountStepper({ count, onChange }) {
  return (
    <div className="qe-count-row">
      <label>Scenarios to generate</label>
      <div className="qe-count-input">
        <button
          type="button"
          className="qe-count-step"
          onClick={() => onChange(Math.max(MIN_SCENARIO_COUNT, count - 1))}
          disabled={count <= MIN_SCENARIO_COUNT}
        >
          −
        </button>
        <span>{count}</span>
        <button
          type="button"
          className="qe-count-step"
          onClick={() => onChange(Math.min(MAX_SCENARIO_COUNT, count + 1))}
          disabled={count >= MAX_SCENARIO_COUNT}
        >
          +
        </button>
      </div>
      <span className="qe-count-hint">default {DEFAULT_SCENARIO_COUNT} · max {MAX_SCENARIO_COUNT}</span>
    </div>
  );
}

const STATUS_TABS = [
  { key: "pending", label: "Generated" },
  { key: "approved", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
];

function EditEvaluationForm({ evaluation, demoAgents, onSaved, onCancel }) {
  const [name, setName] = useState(evaluation.name ?? "");
  const [agentPhoneNumber, setAgentPhoneNumber] = useState(evaluation.agentPhoneNumber ?? "");
  const [demoAgentKey, setDemoAgentKey] = useState(evaluation.demoAgentKey ?? "");
  const [description, setDescription] = useState(evaluation.description ?? "");
  const [requirements, setRequirements] = useState(evaluation.requirements ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateEvaluation(evaluation.id, {
        name: name.trim(),
        agentPhoneNumber: agentPhoneNumber.trim() || null,
        description: description.trim() || null,
        requirements: requirements.trim() || null,
        demoAgentKey: demoAgentKey || null,
      });
      onSaved(updated);
    } catch (err) {
      setError(err.message ?? "Could not save these changes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="qe-eval-edit-form" onSubmit={onSubmit}>
      <h4>Edit evaluation</h4>
      <div className="qe-field-row-narrow">
        <div className="qe-field" style={{ "--qe-field-color": "#1e7a8c" }}>
          <label htmlFor="qe-edit-name">Evaluation name</label>
          <input id="qe-edit-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="qe-field" style={{ "--qe-field-color": "#8c6b1e" }}>
          <label htmlFor="qe-edit-phone">Target agent phone number</label>
          <input
            id="qe-edit-phone"
            type="tel"
            value={agentPhoneNumber}
            onChange={(e) => setAgentPhoneNumber(e.target.value)}
          />
        </div>
      </div>
      {demoAgents.length > 0 && (
        <div className="qe-field-row-narrow">
          <DemoAgentField
            id="qe-edit-demo-agent"
            demoAgents={demoAgents}
            value={demoAgentKey}
            onChange={setDemoAgentKey}
          />
        </div>
      )}
      <div className="qe-field-grid">
        <div className="qe-field qe-field-full" style={{ "--qe-field-color": "var(--accent-2)" }}>
          <label htmlFor="qe-edit-description">Description - what does this agent do?</label>
          <textarea
            id="qe-edit-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="qe-field qe-field-full" style={{ "--qe-field-color": "var(--pass)" }}>
          <label htmlFor="qe-edit-requirements">Requirements - what must this agent always/never do?</label>
          <textarea
            id="qe-edit-requirements"
            rows={4}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="error-banner">{error}</p>}
      <div className="call-row">
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EvaluationDetail({ evaluationId, navigate, path }) {
  const [evaluation, setEvaluation] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(() => createTimeGenErrors.get(evaluationId) ?? null);
  const [feedback, setFeedback] = useState("");
  const [scenarioCount, setScenarioCount] = useState(DEFAULT_SCENARIO_COUNT);
  const [actionError, setActionError] = useState(null);
  const [busyScenarioId, setBusyScenarioId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [confirmingDeleteAllTab, setConfirmingDeleteAllTab] = useState(false);
  const [deletingAllTab, setDeletingAllTab] = useState(false);
  const [approvingAllTab, setApprovingAllTab] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedScenarioId, setExpandedScenarioId] = useState(null);
  const [autoListen, setAutoListen] = useState(() => getLiveAudioPreference());
  const tour = useTour();
  const summaryRef = useRef(null);
  const tabBarRef = useRef(null);
  const scenarioListRef = useRef(null);
  const generatePanelRef = useRef(null);

  useEffect(() => {
    createTimeGenErrors.delete(evaluationId);
  }, [evaluationId]);

  const [demoAgents, setDemoAgents] = useState([]);
  useEffect(() => {
    getQualevalConfig()
      .then((config) => setDemoAgents(config.demoAgents ?? []))
      .catch(() => {});
  }, []);

  const load = async () => {
    try {
      const loaded = await getEvaluation(evaluationId);
      setEvaluation(loaded);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message ?? "Could not load this evaluation.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId]);

  // A run advances server-side (call placed, call ended, verdict recorded)
  // with no push to this page, so keep re-fetching while any scenario's
  // latest run is still unfinished - otherwise the page keeps showing
  // "Call in progress…" long after the call ended. The server also retires
  // runs stranded by a restart (store.expireStaleRuns), so this always ends.
  const hasUnfinishedRun = (evaluation?.scenarios ?? []).some((s) => runIsUnfinished(s.runs?.[0]));
  useEffect(() => {
    if (!hasUnfinishedRun) return undefined;
    load();
    const timer = setInterval(load, RUN_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnfinishedRun, evaluationId]);

  const onGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      await generateScenarios(evaluationId, feedback.trim() || undefined, scenarioCount);
      setFeedback("");
      await load();
    } catch (err) {
      setGenError(err.message ?? "Could not generate scenarios.");
    } finally {
      setGenerating(false);
    }
  };

  const onApprove = async (scenario) => {
    setActionError(null);
    setBusyScenarioId(scenario.id);
    try {
      await updateScenario(scenario.id, { status: "approved" });
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not approve the scenario.");
    } finally {
      setBusyScenarioId(null);
    }
  };

  const onReject = async (scenario) => {
    setActionError(null);
    setBusyScenarioId(scenario.id);
    try {
      await updateScenario(scenario.id, { status: "rejected" });
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not reject the scenario.");
    } finally {
      setBusyScenarioId(null);
    }
  };

  const onRun = async (scenario) => {
    setActionError(null);
    setBusyScenarioId(scenario.id);
    setExpandedScenarioId(scenario.id);
    try {
      const run = await createRun(scenario.id);
      await getRun(run.id);
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not create the run.");
    } finally {
      setBusyScenarioId(null);
    }
  };

  const onEndCall = async (run) => {
    setActionError(null);
    setBusyScenarioId(run.scenarioId);
    try {
      await endRun(run.id);
    } catch (err) {
      if (err.status !== 409) setActionError(err.message ?? "Could not end the call.");
    } finally {
      // Refresh either way: a failed end usually means the call already
      // finished and this page was showing an outdated state.
      await load();
      setBusyScenarioId(null);
    }
  };

  const onEditScenario = async (scenario, fields) => {
    setBusyScenarioId(scenario.id);
    try {
      await updateScenario(scenario.id, fields);
      await load();
    } finally {
      setBusyScenarioId(null);
    }
  };

  const onDeleteScenario = async (scenario) => {
    setActionError(null);
    setBusyScenarioId(scenario.id);
    try {
      await deleteScenario(scenario.id);
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not delete the scenario.");
    } finally {
      setBusyScenarioId(null);
    }
  };

  const onExport = async () => {
    setActionError(null);
    setExporting(true);
    try {
      await exportScenariosXlsx(evaluationId, "approved");
    } catch (err) {
      setActionError(err.message ?? "Could not export these scenarios.");
    } finally {
      setExporting(false);
    }
  };

  const onApproveAllInTab = async () => {
    setActionError(null);
    setApprovingAllTab(true);
    try {
      const pending = (evaluation.scenarios ?? []).filter((s) => s.status === "pending");
      for (const scenario of pending) {
        await updateScenario(scenario.id, { status: "approved" });
      }
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not approve all scenarios.");
    } finally {
      setApprovingAllTab(false);
    }
  };

  const onDeleteAllInTab = async () => {
    setActionError(null);
    setDeletingAllTab(true);
    try {
      await deleteScenariosByStatus(evaluationId, activeTab);
      setConfirmingDeleteAllTab(false);
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not delete these scenarios.");
    } finally {
      setDeletingAllTab(false);
    }
  };

  const onDeleteEvaluation = async () => {
    setDeleteError(null);
    try {
      await deleteEvaluation(evaluationId);
      navigate("/qualeval");
    } catch (err) {
      setDeleteError(err.message ?? "Could not delete this evaluation.");
    }
  };

  if (loadError) {
    return (
      <AppShell path={path} navigate={navigate} title="Qualitative Evals">
        <p className="error-banner">{loadError}</p>
      </AppShell>
    );
  }
  if (!evaluation) {
    return (
      <AppShell path={path} navigate={navigate} title="Qualitative Evals">
        <p className="pack-note">Loading…</p>
      </AppShell>
    );
  }

  const scenarios = evaluation.scenarios ?? [];
  const anyCallInProgress = scenarios.some((s) => s.runs?.[0]?.verdict === "in_progress");
  const tabCounts = Object.fromEntries(STATUS_TABS.map((t) => [t.key, scenarios.filter((s) => s.status === t.key).length]));
  const visibleScenarios = scenarios.filter((s) => s.status === activeTab);

  // Take-a-tour: review -> approve -> run -> results -> regenerate. Scenario
  // card and result steps target the first one in the open tab, so they are
  // skipped when that tab has none.
  const startTour = () => {
    // The actions and verdict steps point inside a scenario card, so open one
    // first - preferably one that already has a verdict to show.
    if (!visibleScenarios.some((s) => s.id === expandedScenarioId) && visibleScenarios.length > 0) {
      const judged = visibleScenarios.find((s) => ["pass", "fail"].includes(s.runs?.[0]?.verdict));
      flushSync(() => setExpandedScenarioId((judged ?? visibleScenarios[0]).id));
    }
    tour.start(
      [
        {
          ref: summaryRef,
          title: "The agent under test",
          body: "The phone number QualEval calls, plus the description and requirements every scenario is generated from and judged against. Edit evaluation changes them.",
        },
        {
          ref: tabBarRef,
          title: "Review scenarios",
          body: "New scenarios land in Generated. Approve the ones worth running (they move to Accepted) and reject the rest - Approve all does a whole batch at once.",
        },
        {
          find: () => scenarioListRef.current?.querySelector(".qe-scenario-actions"),
          title: "Approve, then run",
          body: "Each card is one test call: a caller persona, a situation, and pass/fail criteria. Approve it, then Run places a real phone call to the agent.",
        },
        {
          find: () => scenarioListRef.current?.querySelector(".qe-run-result"),
          title: "Read the verdict",
          body: "When the call ends, the transcript is judged pass/fail per criterion, with the evidence for every failure. Play the recording and click a timestamp to jump to that moment.",
        },
        {
          ref: generatePanelRef,
          title: "Generate more",
          body: "Ask for a new batch here, optionally with feedback on what to cover. Accepted scenarios are kept; generated and rejected ones are replaced.",
        },
      ].filter(resolveTourTarget),
    );
  };

  return (
    <AppShell
      path={path}
      navigate={navigate}
      title={evaluation.name}
      actions={
        <div className="qe-pagehead-actions">
          <button type="button" className="btn btn-outline" onClick={startTour}>
            Take a tour
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigate("/qualeval")}>
            Back to evaluations
          </button>
        </div>
      }
    >
      <div className="qualeval-page">
        <div className="qe-eval-header-actions">
          {!editing && (
            <button type="button" className="btn-sm ghost" onClick={() => setEditing(true)}>
              Edit evaluation
            </button>
          )}
          {!editing &&
            (confirmingDelete ? (
              <>
                <span className="qe-delete-confirm-text">
                  Delete this evaluation and all its scenarios and runs?
                </span>
                <button type="button" className="btn-sm danger" onClick={onDeleteEvaluation}>
                  Confirm delete
                </button>
                <button type="button" className="btn-sm ghost" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn-sm ghost" onClick={() => setConfirmingDelete(true)}>
                Delete evaluation
              </button>
            ))}
        </div>
        {deleteError && <p className="error-banner">{deleteError}</p>}

        {editing ? (
          <EditEvaluationForm
            evaluation={evaluation}
            demoAgents={demoAgents}
            onSaved={(updated) => {
              setEvaluation((prev) => ({ ...prev, ...updated }));
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <ul className="qe-eval-summary" ref={summaryRef}>
            <li>
              <strong>Target agent:</strong> {evaluation.agentPhoneNumber ?? "no phone number set"}
            </li>
            {evaluation.demoAgentKey && (
              <li>
                <strong>Demo agent that answers:</strong> {demoAgentLabel(demoAgents, evaluation.demoAgentKey)}
              </li>
            )}
            {evaluation.description && (
              <li>
                <strong>Description:</strong>
                <MarkdownText text={evaluation.description} />
              </li>
            )}
            {evaluation.requirements && (
              <li>
                <strong>Requirements:</strong>
                <MarkdownText text={evaluation.requirements} />
              </li>
            )}
          </ul>
        )}

        <div className="qualeval-review">
          <div className="qualeval-review-scenarios" ref={scenarioListRef}>
            <div className="qe-scenarios-heading">
              <h2>Scenarios ({scenarios.length})</h2>
              <div className="qe-scenarios-heading-actions">
                <label
                  className="check-row qe-live-toggle"
                  title="Off by default, so running many scenarios at once doesn't stream every call's audio. You can still listen to a single call from its card."
                >
                  <input
                    type="checkbox"
                    checked={autoListen}
                    onChange={(e) => {
                      setAutoListen(e.target.checked);
                      setLiveAudioPreference(e.target.checked);
                    }}
                  />
                  Auto-play live call audio
                </label>
              </div>
            </div>
            <div className="qe-tab-bar" ref={tabBarRef}>
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`qe-tab ${activeTab === tab.key ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveTab(tab.key);
                    setConfirmingDeleteAllTab(false);
                  }}
                >
                  {tab.label}
                  <span className="qe-tab-count">({tabCounts[tab.key]})</span>
                </button>
              ))}
            </div>
            {tabCounts[activeTab] > 0 && (
              <div className="qe-tab-actions">
                {activeTab === "pending" && !confirmingDeleteAllTab && (
                  <button
                    type="button"
                    className="btn-sm primary"
                    onClick={onApproveAllInTab}
                    disabled={approvingAllTab}
                  >
                    {approvingAllTab ? "Approving…" : "Approve all"}
                  </button>
                )}
                {confirmingDeleteAllTab ? (
                  <>
                    <span className="qe-delete-confirm-text">
                      Delete all {tabCounts[activeTab]} scenario{tabCounts[activeTab] === 1 ? "" : "s"} in this tab?
                    </span>
                    <button
                      type="button"
                      className="btn-sm danger"
                      onClick={onDeleteAllInTab}
                      disabled={deletingAllTab}
                    >
                      {deletingAllTab ? "Deleting…" : "Confirm delete all"}
                    </button>
                    <button
                      type="button"
                      className="btn-sm ghost"
                      onClick={() => setConfirmingDeleteAllTab(false)}
                      disabled={deletingAllTab}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-sm ghost"
                    onClick={() => setConfirmingDeleteAllTab(true)}
                  >
                    Delete all in this tab
                  </button>
                )}
                {activeTab === "approved" && !confirmingDeleteAllTab && (
                  <button type="button" className="btn-sm ghost" onClick={onExport} disabled={exporting}>
                    {exporting ? "Exporting…" : "Export to Excel"}
                  </button>
                )}
              </div>
            )}
            {actionError && <p className="error-banner">{actionError}</p>}
            {scenarios.length === 0 && <p className="pack-note">No scenarios yet. Generate a batch to get started.</p>}
            {scenarios.length > 0 && visibleScenarios.length === 0 && (
              <p className="pack-note">No scenarios in this tab.</p>
            )}
            {visibleScenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                expanded={expandedScenarioId === scenario.id}
                onToggle={() => setExpandedScenarioId((id) => (id === scenario.id ? null : scenario.id))}
                onApprove={onApprove}
                onReject={onReject}
                onRun={onRun}
                onDelete={onDeleteScenario}
                onEdit={onEditScenario}
                onEndCall={onEndCall}
                busy={busyScenarioId === scenario.id}
                autoListen={autoListen}
              />
            ))}
          </div>

          <div className="qe-feedback-panel" ref={generatePanelRef}>
            <h4>{scenarios.length === 0 ? "Generate scenarios" : "Regenerate with feedback"}</h4>
            <p className="qe-feedback-hint">
              Regenerating replaces every pending/rejected scenario with a new batch; already-approved
              scenarios are kept as-is.
            </p>
            <textarea
              rows={5}
              className="qe-feedback-box"
              placeholder="What should the next batch of scenarios cover differently? e.g. add more edge cases around cancellations."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <ScenarioCountStepper count={scenarioCount} onChange={setScenarioCount} />
            {genError && <p className="error-banner">{genError}</p>}
            <button type="button" className="qe-btn-regen" onClick={onGenerate} disabled={generating || anyCallInProgress}>
              {generating ? "Generating…" : scenarios.length === 0 ? "Generate scenarios" : "Regenerate scenarios"}
            </button>
          </div>
        </div>
      </div>
      {tour.overlay}
    </AppShell>
  );
}

const LIST_TABS = [
  { key: "evaluations", label: "Your evaluations" },
  { key: "examples", label: "Examples" },
];

export default function QualEval({ navigate, path, evaluationId }) {
  const [evaluations, setEvaluations] = useState(null);
  const [listTab, setListTab] = useState("evaluations");
  const [loadError, setLoadError] = useState(null);

  const load = async () => {
    try {
      const loaded = await listEvaluations();
      setEvaluations(loaded);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message ?? "Could not load evaluations.");
    }
  };

  useEffect(() => {
    if (evaluationId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId]);

  const tour = useTour();
  const tourRefs = {
    templates: useRef(null),
    target: useRef(null),
    details: useRef(null),
    count: useRef(null),
    submit: useRef(null),
    evaluations: useRef(null),
    examplesTab: useRef(null),
  };

  if (evaluationId) {
    return <EvaluationDetail evaluationId={evaluationId} navigate={navigate} path={path} />;
  }

  // Take-a-tour: walks the create-an-evaluation form top to bottom, then the
  // existing evaluations (skipped when there are none yet).
  const startTour = () =>
    tour.start(
      [
        {
          ref: tourRefs.templates,
          title: "Start from a template",
          body: "Pick a sample agent to prefill the form, or skip this and describe your own agent from scratch.",
        },
        {
          ref: tourRefs.target,
          title: "Name it and set the target",
          body: "Give the evaluation a name and enter the phone number of the voice agent under test - QualEval reaches it only by calling that number.",
        },
        {
          ref: tourRefs.details,
          title: "Describe the agent",
          body: "Say what the agent does and what it must always or never do. Scenarios are generated from this, and every call is judged against it.",
        },
        {
          ref: tourRefs.count,
          title: "Choose how many scenarios",
          body: "Each scenario is one test call - a caller persona, a situation, and pass/fail criteria. You can generate more later.",
        },
        {
          ref: tourRefs.submit,
          title: "Create the evaluation",
          body: "Creates the evaluation, generates the first batch of scenarios, and opens it so you can review, approve, and run them.",
        },
        {
          ref: tourRefs.evaluations,
          title: "Open an evaluation",
          body: "Your evaluations live here. Open one to review its scenarios, place calls, and read each pass/fail verdict with evidence.",
        },
        {
          ref: tourRefs.examplesTab,
          title: "See a finished example",
          body: "The Examples tab always has a complete sample scorecard - a real transcript judged against its criteria - so you can see what a result looks like before running your own.",
        },
      ].filter(resolveTourTarget),
    );

  return (
    <AppShell
      path={path}
      navigate={navigate}
      title="Qualitative Evals"
      actions={
        <button type="button" className="btn btn-outline" onClick={startTour}>
          Take a tour
        </button>
      }
    >
      <div className="qualeval-page">
        <p className="app-lede">
          QualEval tests your AI voice agent the way a real customer would: by calling it and checking what
          it actually says, not by reading its code. Describe how your agent should behave, and QualEval
          takes care of the rest - like hiring someone to secretly call your own business and report back.
        </p>
        <ul className="qe-lede-list">
          <li>
            A <strong>scenario</strong> is one realistic test call: a caller with a specific situation and
            goal, plus the rules your agent needs to follow during that call.
          </li>
          <li>
            QualEval automatically writes a batch of scenarios for you, each with a different{" "}
            <strong>persona</strong> - the type of caller it plays, such as a confused first-time customer
            or someone pushing to get information they shouldn't have.
          </li>
          <li>
            For every scenario you approve, QualEval places a real phone call to your agent, listens to
            the conversation, and returns an <strong>evaluation</strong>: a pass or fail verdict backed by
            the exact moment in the call that proves it.
          </li>
        </ul>

        <div className="qe-tab-bar">
          {LIST_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              ref={tab.key === "examples" ? tourRefs.examplesTab : null}
              className={`qe-tab ${listTab === tab.key ? "is-active" : ""}`}
              onClick={() => setListTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {listTab === "examples" ? (
          <ExampleScorecard showName />
        ) : (
          <>
            <NewEvaluationForm
              tourRefs={tourRefs}
              onCreated={(created) => navigate(`/qualeval/${encodeURIComponent(created.id)}`)}
            />

            {loadError && <p className="error-banner">{loadError}</p>}
            {evaluations && (
              <div ref={evaluations.length > 0 ? tourRefs.evaluations : null}>
                <EvaluationList evaluations={evaluations} navigate={navigate} />
              </div>
            )}
          </>
        )}
      </div>
      {tour.overlay}
    </AppShell>
  );
}
