import { useState } from "react";
import { formatPhoneNumber } from "./settingsView";

async function importTwilio(body) {
  const res = await fetch("/v1/telephony/imports/twilio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not import the Twilio number.");
  return data;
}

export function PhoneEvalsSetupSection({ ownedNumbers, onConfigured }) {
  const [twilio, setTwilio] = useState({ accountSid: "", authToken: "", e164: "", label: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const imported = await importTwilio(twilio);
      setTwilio({ accountSid: "", authToken: "", e164: "", label: "" });
      setNotice(
        imported.voiceWebhookConfigured
          ? "Twilio number imported. Inbound calls to it are recorded and scored in Phone Evals."
          : "Twilio number imported. This server has no public URL, so its voice webhook was not set and calls will not be scored yet.",
      );
      await onConfigured?.();
    } catch (err) {
      setError(err.message ?? "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <h2>Phone Evals · Twilio setup</h2>
      <p className="pack-note">
        Import the Twilio number you want scored in Phone Evals. Credentials stay on this server only.
        Import points that number&apos;s voice webhook at this server, so calls to it are recorded and
        scored here. You will only see calls placed to numbers you register here.
      </p>
      {ownedNumbers?.length > 0 && (
        <ul className="settings-owned-numbers">
          {ownedNumbers.map((number) => (
            <li key={number}>
              <strong>{formatPhoneNumber(number)}</strong>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error-banner">{error}</p>}
      {notice && (
        <p className="settings-notice" role="status">
          {notice}
        </p>
      )}
      <form className="settings-twilio-form" onSubmit={onSubmit}>
        <label>
          Account SID
          <input
            value={twilio.accountSid}
            onChange={(e) => setTwilio({ ...twilio, accountSid: e.target.value })}
            autoComplete="off"
            required
          />
        </label>
        <label>
          Auth Token
          <input
            type="password"
            value={twilio.authToken}
            onChange={(e) => setTwilio({ ...twilio, authToken: e.target.value })}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          E.164 number
          <input
            value={twilio.e164}
            onChange={(e) => setTwilio({ ...twilio, e164: e.target.value })}
            placeholder="+15551212000"
            required
          />
        </label>
        <label>
          Label
          <input value={twilio.label} onChange={(e) => setTwilio({ ...twilio, label: e.target.value })} />
        </label>
        <button type="submit" className="btn-sm primary" disabled={busy}>
          {busy ? "Importing…" : "Import Twilio number"}
        </button>
      </form>
    </section>
  );
}

export function PhoneEvalsSetupGate({ navigate }) {
  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Phone Evals setup required"
      >
        <h2>Set up Phone Evals first</h2>
        <p>
          Import your Twilio number under Settings before viewing call reports. Operators of this
          deployment can skip this step.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate("/settings")}>
            Go to Settings
          </button>
        </div>
      </div>
    </div>
  );
}
