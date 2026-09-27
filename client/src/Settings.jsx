import { useEffect, useState } from "react";
import { AppShell } from "./Chrome";
import { getQualevalConfig, listDemoAgents, setActiveDemoAgent } from "./qualevalClient";
import { formatPhoneNumber, groupByDomain } from "./settingsView";
import "./App.css";

function NumberCard({ title, number, children }) {
  return (
    <div className="settings-number-card">
      <span className="qe-meta-k">{title}</span>
      {number ? (
        <a className="settings-number" href={`tel:${number}`}>
          {formatPhoneNumber(number)}
        </a>
      ) : (
        <span className="settings-number is-missing">Not configured</span>
      )}
      <p className="pack-note">{children}</p>
    </div>
  );
}

function AgentCard({ agent, live, switching, onMakeLive }) {
  const provisioned = Boolean(agent.agentId);
  return (
    <article className={`settings-agent-card ${live ? "is-live" : ""}`}>
      <div className="qe-scenario-head">
        <h4>{agent.name}</h4>
        <div className="qe-scenario-badges">
          <span className={`qe-status-chip ${agent.kind === "flawed" ? "is-rejected" : "is-approved"}`}>
            {agent.kind === "flawed" ? "Seeded gap" : "Compliant"}
          </span>
          {live && <span className="settings-live-chip">Live</span>}
        </div>
      </div>
      {agent.description && <p className="settings-agent-desc">{agent.description}</p>}
      {agent.greeting && (
        <p className="settings-agent-greeting">
          <span className="qe-meta-k">Greeting</span> &ldquo;{agent.greeting}&rdquo;
        </p>
      )}
      {agent.systemPrompt && (
        <details className="settings-agent-prompt">
          <summary>System prompt{agent.voice ? ` · voice ${agent.voice}` : ""}</summary>
          <pre>{agent.systemPrompt}</pre>
        </details>
      )}
      <div className="settings-agent-actions">
        {live ? (
          <span className="pack-note">Answering calls now</span>
        ) : provisioned ? (
          <button type="button" className="btn-sm primary" disabled={switching} onClick={onMakeLive}>
            {switching ? "Switching…" : "Make live"}
          </button>
        ) : (
          <span className="pack-note">Not provisioned yet - created on the next server restart.</span>
        )}
      </div>
    </article>
  );
}

export default function Settings({ path, navigate }) {
  const [config, setConfig] = useState(null);
  const [agents, setAgents] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const [switchingKey, setSwitchingKey] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    getQualevalConfig()
      .then(setConfig)
      .catch((err) => setError(err.message ?? "Could not load phone numbers."));
    listDemoAgents()
      .then((body) => {
        setAgents(body.variants);
        setActiveKey(body.activeKey);
      })
      .catch((err) => setError(err.message ?? "Could not load target agents."));
  }, []);

  const onMakeLive = async (agent) => {
    setSwitchingKey(agent.key);
    setError(null);
    setNotice(null);
    try {
      setActiveKey(await setActiveDemoAgent(agent.key));
      setNotice(`${agent.name} now answers the demo agent number.`);
    } catch (err) {
      setError(err.message ?? "Could not switch the live agent.");
    } finally {
      setSwitchingKey(null);
    }
  };

  const agentNumber = config?.agentPhoneNumber;
  const liveAgent = agents?.find((a) => a.key === activeKey);

  return (
    <AppShell path={path} navigate={navigate} title="Settings">
      <div className="qualeval-page">
        <p className="app-lede">
          Pick which target agent answers the demo agent phone number, then call it to try that agent live.
          The switch applies to the next call - no deploy or code change needed.
        </p>

        <section className="settings-section">
          <h2>Phone numbers</h2>
          <div className="settings-number-grid">
            <NumberCard title="Demo agent number" number={agentNumber}>
              {liveAgent ? (
                <>
                  Answered by <strong>{liveAgent.name}</strong>. Call it from any phone to talk to that agent.
                </>
              ) : (
                "Call it from any phone to talk to the live target agent."
              )}
            </NumberCard>
            <NumberCard title="QualEval caller number" number={config?.personaPhoneNumber}>
              QualEval places its scenario test calls from this number.
            </NumberCard>
          </div>
          <p className="pack-note">
            Both numbers are Twilio numbers set on the deployment (QUALEVAL_AGENT_NUMBER and
            QUALEVAL_PERSONA_NUMBER) and are read-only here.
          </p>
        </section>

        {error && <p className="error-banner">{error}</p>}
        {notice && (
          <p className="settings-notice" role="status">
            {notice}
            {agentNumber && (
              <>
                {" "}
                Call <a href={`tel:${agentNumber}`}>{formatPhoneNumber(agentNumber)}</a> to try it.
              </>
            )}
          </p>
        )}

        <section className="settings-section">
          <h2>Target agents</h2>
          <p className="pack-note">
            Each domain has a compliant agent and a flawed one with a seeded gap, so a QualEval evaluation
            can demo both a pass and a fail. Only one agent answers the number at a time.
          </p>
          {!agents && !error && <p className="pack-note">Loading…</p>}
          {agents &&
            groupByDomain(agents).map((group) => (
              <div key={group.domain} className="settings-domain">
                <h3>{group.label}</h3>
                <div className="settings-agent-grid">
                  {group.agents.map((agent) => (
                    <AgentCard
                      key={agent.key}
                      agent={agent}
                      live={agent.key === activeKey}
                      switching={switchingKey === agent.key}
                      onMakeLive={() => onMakeLive(agent)}
                    />
                  ))}
                </div>
              </div>
            ))}
        </section>
      </div>
    </AppShell>
  );
}
