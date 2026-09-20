import { useEffect, useState } from "react";
import { AppShell } from "./Chrome";
import { listIndustryPacks } from "./evalsClient";
import { fetchApiKeys, createApiKey, revokeApiKey, updateApiKeyExpiry } from "./apiKeysClient";
import "./App.css";

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const FALLBACK_INDUSTRY_PACKS = [
  { id: "hipaa", name: "HIPAA identifiers (healthcare)" },
  { id: "finance", name: "GLBA finance identifiers (banking)" },
  { id: "ferpa", name: "FERPA identifiers (education)" },
];

const ALL_SCOPES = "all";

function formatWhen(iso) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function scopeLabel(scopes, packsById) {
  if (scopes.includes(ALL_SCOPES)) return "All packs";
  return scopes.map((id) => packsById[id]?.name ?? id).join(", ") || "No packs";
}

function keyStatus(key) {
  if (key.revokedAt) return { text: "Revoked", cls: "is-flag" };
  if (new Date(key.expiresAt).getTime() <= Date.now()) return { text: "Expired", cls: "is-flag" };
  return { text: "Active", cls: "is-pass" };
}

function NewKeyForm({ industryPacks, defaultExpiryDays, onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [scopeMode, setScopeMode] = useState(ALL_SCOPES);
  const [selectedPacks, setSelectedPacks] = useState([]);
  const [expiresInDays, setExpiresInDays] = useState(defaultExpiryDays);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const togglePack = (id) => {
    setSelectedPacks((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const canSubmit = name.trim() && (scopeMode === ALL_SCOPES || selectedPacks.length > 0) && !busy;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const scopes = scopeMode === ALL_SCOPES ? [ALL_SCOPES] : selectedPacks;
      const created = await createApiKey({ name: name.trim(), scopes, expiresInDays: Number(expiresInDays) });
      onCreated(created);
    } catch (err) {
      setError(err.message ?? "Could not create the API key.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="section-block" onSubmit={onSubmit}>
      <h3>New API key</h3>
      <p className="panel-label" htmlFor="key-name">
        Name
      </p>
      <input
        id="key-name"
        type="text"
        placeholder="e.g. Production webhook"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <p className="panel-label">Scopes — which packs this key's calls can run</p>
      <label className="check-row">
        <input
          type="radio"
          name="scope-mode"
          checked={scopeMode === ALL_SCOPES}
          onChange={() => setScopeMode(ALL_SCOPES)}
        />
        All packs
      </label>
      <label className="check-row">
        <input
          type="radio"
          name="scope-mode"
          checked={scopeMode === "specific"}
          onChange={() => setScopeMode("specific")}
        />
        Specific packs
      </label>
      {scopeMode === "specific" && (
        <div className="pack-select">
          {industryPacks.map((pack) => (
            <label className="check-row" key={pack.id}>
              <input
                type="checkbox"
                checked={selectedPacks.includes(pack.id)}
                onChange={() => togglePack(pack.id)}
              />
              {pack.name}
            </label>
          ))}
        </div>
      )}

      <p className="panel-label" htmlFor="key-expiry">
        Expires in (days)
      </p>
      <input
        id="key-expiry"
        type="number"
        min="1"
        max="3650"
        value={expiresInDays}
        onChange={(e) => setExpiresInDays(e.target.value)}
      />

      {error && <p className="error-banner">{error}</p>}

      <div className="call-row">
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {busy ? "Creating…" : "Generate key"}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RevealKey({ created, onDone }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(created.rawKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="section-block">
      <h3>Key created: {created.name}</h3>
      <p className="error-banner">
        Copy this key now — you won't be able to see it again. If you lose it, revoke this key and
        create a new one.
      </p>
      <p className="key-reveal-value">{created.rawKey}</p>
      <div className="call-row">
        <button type="button" className="btn btn-outline" onClick={onCopy}>
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>

      <h4>Webhook setup</h4>
      <p className="key-reveal-value">
        {window.location.origin}/v1/webhooks/assemblyai/{created.rawKey}
      </p>
      <p className="pack-note">
        On your AssemblyAI account, register a webhook subscription (
        <code>POST /v1/webhook-subscriptions</code>) with this URL, subscribed to{" "}
        <code>session.completed</code>, and set its <code>secret</code> to this same key.
      </p>
      <p className="error-banner">
        Demo/single-account build: this receiver reads the completed session with ComplyLine's own
        AssemblyAI key, so it only works for sessions run on ComplyLine's own AssemblyAI account
        (e.g. the Try tab). To check calls from your own AssemblyAI account in production, ComplyLine
        needs to store your AssemblyAI API key too - that isn't wired up yet.
      </p>
    </div>
  );
}

function EditExpiry({ apiKey, defaultExpiryDays, onSaved, onCancel }) {
  const [expiresInDays, setExpiresInDays] = useState(defaultExpiryDays);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateApiKeyExpiry(apiKey.id, Number(expiresInDays));
      onSaved();
    } catch (err) {
      setError(err.message ?? "Could not update expiry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="call-row">
      <input
        type="number"
        min="1"
        max="3650"
        value={expiresInDays}
        onChange={(e) => setExpiresInDays(e.target.value)}
        style={{ width: "5rem" }}
      />
      <span>days from now</span>
      <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
        Save
      </button>
      <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error && <p className="error-banner">{error}</p>}
    </div>
  );
}

function SignInRequired({ navigate, path }) {
  return (
    <AppShell path={path} navigate={navigate} title="API Keys">
      <p className="app-lede">
        API key management requires sign-in to be configured for this deployment - pooling real
        customer credentials under one shared anonymous visitor isn't acceptable. Set
        `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY` (server) and `VITE_CLERK_PUBLISHABLE_KEY`
        (client) to enable this page.
      </p>
    </AppShell>
  );
}

export default function ApiKeys({ navigate, path }) {
  const [keys, setKeys] = useState(null);
  const [defaultExpiryDays, setDefaultExpiryDays] = useState(90);
  const [industryPacks, setIndustryPacks] = useState(FALLBACK_INDUSTRY_PACKS);
  const [loadError, setLoadError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    try {
      const { keys: loaded, defaultExpiryDays: expiry } = await fetchApiKeys();
      setKeys(loaded);
      setDefaultExpiryDays(expiry ?? 90);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message ?? "Could not load API keys.");
    }
  };

  useEffect(() => {
    if (!CLERK_ENABLED) return;
    load();
    listIndustryPacks()
      .then((packs) => {
        if (packs.length > 0) setIndustryPacks(packs);
      })
      .catch(() => {});
  }, []);

  const onCreated = (created) => {
    setCreating(false);
    setRevealed(created);
    load();
  };

  const onRevoke = async (id) => {
    setActionError(null);
    try {
      await revokeApiKey(id);
      await load();
    } catch (err) {
      setActionError(err.message ?? "Could not revoke the key.");
    }
  };

  if (!CLERK_ENABLED) {
    return <SignInRequired navigate={navigate} path={path} />;
  }

  const packsById = Object.fromEntries(industryPacks.map((p) => [p.id, p]));

  return (
    <AppShell
      path={path}
      navigate={navigate}
      title="API Keys"
      actions={
        !creating && !revealed ? (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            New key
          </button>
        ) : null
      }
    >
      <p className="app-lede">
        API keys authenticate machine callers (e.g. a voice agent platform's webhook) - not your own
        sign-in. Each key can be scoped to specific compliance packs, expires on a schedule you set,
        and can be revoked at any time.
      </p>

      {loadError && <p className="error-banner">{loadError}</p>}

      {revealed && <RevealKey created={revealed} onDone={() => setRevealed(null)} />}

      {creating && !revealed && (
        <NewKeyForm
          industryPacks={industryPacks}
          defaultExpiryDays={defaultExpiryDays}
          onCreated={onCreated}
          onCancel={() => setCreating(false)}
        />
      )}

      {actionError && <p className="error-banner">{actionError}</p>}

      {keys && keys.length === 0 && !creating && (
        <p className="pack-note">No API keys yet. Create one to let a voice agent platform call in.</p>
      )}

      {keys && keys.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Scopes</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const status = keyStatus(key);
                return (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td>{scopeLabel(key.scopes, packsById)}</td>
                    <td>
                      <span className={`finding-status ${status.cls}`}>{status.text}</span>
                    </td>
                    <td className="muted">
                      {editingId === key.id ? (
                        <EditExpiry
                          apiKey={key}
                          defaultExpiryDays={defaultExpiryDays}
                          onSaved={() => {
                            setEditingId(null);
                            load();
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        formatWhen(key.expiresAt)
                      )}
                    </td>
                    <td className="muted">{formatWhen(key.lastUsedAt)}</td>
                    <td>
                      {!key.revokedAt && editingId !== key.id && (
                        <>
                          <button type="button" className="btn btn-outline" onClick={() => setEditingId(key.id)}>
                            Edit expiry
                          </button>
                          <button type="button" className="btn btn-danger" onClick={() => onRevoke(key.id)}>
                            Revoke
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
