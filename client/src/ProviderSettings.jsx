import { useEffect, useState } from "react";
import {
  fetchProviderCatalog,
  fetchProviderConfig,
  setProviderSelection,
  setProviderCredential,
} from "./providers.js";

const SLOT_LABEL = { transcriber: "Transcriber (STT)", model: "Model (LLM)", voice: "Voice" };
const SLOT_ORDER = ["transcriber", "model", "voice"];

// Vapi-style Integrations analog: three independent slots, each defaulting
// to AssemblyAI with no key required. Swapping a slot asks for a BYO key
// inline, stored only on the server - this panel never displays a saved key
// back, only whether one is on file. See .claude/epics/provider-swaps/52.md.
export default function ProviderSettings() {
  const [catalog, setCatalog] = useState(null);
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectError, setSelectError] = useState(null);
  const [keyError, setKeyError] = useState(null);
  const [pendingKey, setPendingKey] = useState({});
  const [savingKeyFor, setSavingKeyFor] = useState(null);

  const load = async () => {
    try {
      const [nextCatalog, nextConfig] = await Promise.all([
        fetchProviderCatalog(),
        fetchProviderConfig(),
      ]);
      setCatalog(nextCatalog);
      setConfig(nextConfig);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message ?? "Could not load provider settings.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSelect = async (slot, providerId) => {
    setSelectError(null);
    try {
      await setProviderSelection(slot, providerId);
      await load();
    } catch (err) {
      setSelectError(err.message ?? "Could not update the provider selection.");
    }
  };

  const onSaveKey = async (providerId) => {
    const apiKey = (pendingKey[providerId] ?? "").trim();
    if (!apiKey) return;
    setKeyError(null);
    setSavingKeyFor(providerId);
    try {
      await setProviderCredential(providerId, apiKey);
      setPendingKey((prev) => ({ ...prev, [providerId]: "" }));
      await load();
    } catch (err) {
      setKeyError(err.message ?? "Could not save the API key.");
    } finally {
      setSavingKeyFor(null);
    }
  };

  if (loadError) {
    return (
      <div className="section-block provider-settings">
        <h3>Providers</h3>
        <p className="error-banner">{loadError}</p>
      </div>
    );
  }
  if (!catalog || !config) return null;

  return (
    <div className="section-block provider-settings">
      <h3>Providers</h3>
      <p className="pack-note">
        AssemblyAI is the default for every slot and needs no extra key. Swapping a slot to
        another vendor asks for a BYO key, stored only on the server - never in your browser.
      </p>
      {SLOT_ORDER.map((slot) => {
        const providersForSlot = catalog[slot] ?? [];
        const current = config[slot];
        if (!current) return null;
        return (
          <div className="provider-row" key={slot}>
            <label className="panel-label" htmlFor={`provider-${slot}`}>
              {SLOT_LABEL[slot] ?? slot}
            </label>
            <div className="provider-row-controls">
              <select
                id={`provider-${slot}`}
                value={current.providerId}
                onChange={(e) => onSelect(slot, e.target.value)}
              >
                {providersForSlot.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className={`key-badge ${current.keyConfigured ? "is-ok" : "is-missing"}`}>
                {!current.requiresKey
                  ? "No key needed"
                  : current.keyConfigured
                    ? "Key configured"
                    : "Key required"}
              </span>
            </div>
            {current.requiresKey && !current.keyConfigured && (
              <div className="provider-key-form">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="API key"
                  value={pendingKey[current.providerId] ?? ""}
                  onChange={(e) =>
                    setPendingKey((prev) => ({ ...prev, [current.providerId]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={
                    savingKeyFor === current.providerId || !(pendingKey[current.providerId] ?? "").trim()
                  }
                  onClick={() => onSaveKey(current.providerId)}
                >
                  {savingKeyFor === current.providerId ? "Saving…" : "Save key"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {selectError && <p className="error-banner">{selectError}</p>}
      {keyError && <p className="error-banner">{keyError}</p>}
    </div>
  );
}
