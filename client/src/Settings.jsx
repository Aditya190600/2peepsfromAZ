import { useEffect, useState } from "react";
import { AppShell } from "./Chrome";
import { getQualevalConfig, listDemoAgents, setActiveDemoAgent } from "./qualevalClient";
import {
  buildPhoneNumberOptions,
  CUSTOM_PHONE_OPTION,
  formatPhoneNumber,
  groupByDomain,
  resolvePhoneMenuSelection,
} from "./settingsView";
import PersonaPicker from "./PersonaPicker";
import PhoneNumberMenu from "./PhoneNumberMenu";
import { findPersona } from "./personas";
import { getDefaultPersonaId, setDefaultPersonaId } from "./personaPreference";
import {
  getDefaultPhoneNumber,
  isValidPhoneNumber,
  setDefaultPhoneNumber,
} from "./phoneNumberPreference";
import { PhoneEvalsSetupSection } from "./PhoneEvalsSetup";
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
  const [personaId, setPersonaId] = useState(() => getDefaultPersonaId());
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [personaNotice, setPersonaNotice] = useState(null);
  const [phoneOptions, setPhoneOptions] = useState([]);
  const [phoneSelectedId, setPhoneSelectedId] = useState(CUSTOM_PHONE_OPTION);
  const [phoneCustomValue, setPhoneCustomValue] = useState("");
  const [phoneNotice, setPhoneNotice] = useState(null);
  const [phoneError, setPhoneError] = useState(null);

  useEffect(() => {
    getQualevalConfig()
      .then(async (body) => {
        setConfig(body);
        let numbers = [];
        if (body.isOperator) {
          try {
            const resp = await fetch("/v1/telephony/numbers");
            if (resp.ok) numbers = await resp.json();
          } catch {
            // optional enrichment for the phone menu
          }
        }
        const options = buildPhoneNumberOptions({
          agentPhoneNumber: body.agentPhoneNumber,
          personaPhoneNumber: body.personaPhoneNumber,
          importedNumbers: numbers,
        });
        setPhoneOptions(options);
        const selection = resolvePhoneMenuSelection(options, getDefaultPhoneNumber());
        setPhoneSelectedId(selection.selectedId);
        setPhoneCustomValue(selection.customValue);
        if (!body.isOperator) return;
        return listDemoAgents().then((agentsBody) => {
          setAgents(agentsBody.variants);
          setActiveKey(agentsBody.activeKey);
        });
      })
      .catch((err) => setError(err.message ?? "Could not load settings."));
  }, []);

  const onSelectPersona = (id) => {
    setPersonaId(id);
    setDefaultPersonaId(id);
    setPersonaNotice(`${findPersona(id).label} is now your default call persona on Voice Compliance.`);
  };

  const persistPhoneSelection = (selectedId, customValue) => {
    setPhoneError(null);
    const option = phoneOptions.find((entry) => entry.id === selectedId);
    const nextNumber = selectedId === CUSTOM_PHONE_OPTION ? customValue : option?.number;
    if (!isValidPhoneNumber(nextNumber)) {
      setPhoneError("Enter a phone number in E.164 format, e.g. +18038245760.");
      return;
    }
    setDefaultPhoneNumber(nextNumber);
    setPhoneNotice(
      `${formatPhoneNumber(nextNumber)} is now your default target number for new Qualitative Evals.`,
    );
  };

  const onSelectPhone = (selectedId) => {
    setPhoneSelectedId(selectedId);
    if (selectedId === CUSTOM_PHONE_OPTION) return;
    const option = phoneOptions.find((entry) => entry.id === selectedId);
    if (option?.number) {
      setPhoneCustomValue(option.number);
      persistPhoneSelection(selectedId, option.number);
    }
  };

  const onCustomPhoneChange = (value) => {
    setPhoneCustomValue(value);
    if (phoneSelectedId !== CUSTOM_PHONE_OPTION) return;
    if (!value.trim()) {
      setPhoneNotice(null);
      setPhoneError(null);
      return;
    }
    if (isValidPhoneNumber(value)) persistPhoneSelection(CUSTOM_PHONE_OPTION, value);
  };

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

  const isOperator = Boolean(config?.isOperator);

  const reloadConfig = () =>
    getQualevalConfig()
      .then(setConfig)
      .catch((err) => setError(err.message ?? "Could not reload settings."));

  return (
    <AppShell path={path} navigate={navigate} title="Settings">
      <div className="qualeval-page settings-page">
        <p className="app-lede">
          Choose your default Voice Compliance call persona and Qualitative Evals target phone number here.
          Operators can also switch which target agent answers the demo phone number.
        </p>

        <section className="settings-section">
          <h2>Call persona</h2>
          <p className="pack-note">
            This is the role the AI agent plays on live calls in Voice Compliance. Your choice is saved in
            this browser and pre-selected on the Try page.
          </p>
          {personaNotice && (
            <p className="settings-notice" role="status">
              {personaNotice}
            </p>
          )}
          <PersonaPicker selectedId={personaId} onSelect={onSelectPersona} />
        </section>

        <section className="settings-section">
          <h2>Target phone number</h2>
          <p className="pack-note">
            Pre-fills the target agent phone number when you create a new Qualitative Evals evaluation.
            Saved in this browser only.
          </p>
          {phoneOptions.length > 0 ? (
            <PhoneNumberMenu
              options={phoneOptions}
              selectedId={phoneSelectedId}
              customValue={phoneCustomValue}
              onSelect={onSelectPhone}
              onCustomChange={onCustomPhoneChange}
            />
          ) : (
            <p className="pack-note">Loading phone number options…</p>
          )}
          {phoneError && <p className="error-banner">{phoneError}</p>}
          {phoneNotice && (
            <p className="settings-notice" role="status">
              {phoneNotice}
            </p>
          )}
        </section>

        {!isOperator && (
          <PhoneEvalsSetupSection ownedNumbers={config?.ownedPhoneNumbers} onConfigured={reloadConfig} />
        )}

        {isOperator && (
          <>
            <section className="settings-section">
              <h2>Deployment phone numbers</h2>
              <div className="settings-number-grid">
                <NumberCard title="Demo agent number" number={agentNumber}>
                  {liveAgent ? (
                    <>
                      Answered by <strong>{liveAgent.name}</strong>. Call it from any phone to talk to that
                      agent.
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
                Each domain has a compliant agent and a flawed one with a seeded gap, so a QualEval
                evaluation can demo both a pass and a fail. Only one agent answers the number at a time.
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
          </>
        )}
      </div>
    </AppShell>
  );
}
