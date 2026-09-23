import { useEffect, useState } from "react";
import { AppShell } from "./Chrome";
import "./App.css";

async function api(path, body, method) {
  const res = await fetch(`/v1/telephony${path}`, body === undefined ? {} : {
    method: method ?? "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function parseTurns(script) {
  return script.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const match = /^(agent|assistant|user)\s*:\s*(.+)$/i.exec(line);
    if (!match) throw new Error("Each line needs a role prefix, like agent: or user:");
    return { role: match[1].toLowerCase() === "user" ? "user" : "agent", text: match[2], tMs: index * 2000 };
  });
}

export default function PhoneNumbers({ path, navigate }) {
  const [numbers, setNumbers] = useState([]);
  const [trunks, setTrunks] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [twilio, setTwilio] = useState({ accountSid: "", authToken: "", e164: "", label: "" });
  const [telnyx, setTelnyx] = useState({ apiKey: "", sipFqdn: "", e164: "", label: "" });
  const [trunk, setTrunk] = useState({ provider: "byo-sip-trunk", gateway: "", username: "", password: "", label: "" });
  const [did, setDid] = useState({ e164: "", label: "", credentialId: "" });
  const [script, setScript] = useState("agent: Hi, this is an AI assistant. This call may be recorded for quality purposes.\nuser: Sure, go ahead.");
  const [ingestE164, setIngestE164] = useState("+15551212001");

  const refresh = async () => {
    const [nextNumbers, nextTrunks] = await Promise.all([api("/numbers"), api("/trunks")]);
    setNumbers(nextNumbers);
    setTrunks(nextTrunks);
  };

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  async function run(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell path={path} navigate={navigate} title="Numbers">
      <p className="app-lede">
        Import a carrier number or attach a SIP trunk. Credentials stay on this server. Get started
        still uses the browser mic. Outbound dialing is not built. A finished inbound transcript
        shows up in Sessions.
      </p>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      <section className="panel numbers-panel">
        <h2>Phone numbers</h2>
        {numbers.length === 0 ? <p className="hint">No numbers yet.</p> : (
          <table className="data-table">
            <thead>
              <tr><th>Number</th><th>Provider</th><th>Label</th><th>Direction</th><th></th></tr>
            </thead>
            <tbody>
              {numbers.map((number) => (
                <tr key={number.id}>
                  <td className="mono">{number.e164}</td>
                  <td>{number.provider}</td>
                  <td>{number.label}</td>
                  <td>{number.direction}</td>
                  <td>
                    <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => api(`/numbers/${number.id}`, {}, "DELETE"))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel numbers-panel">
        <h2>Import Twilio</h2>
        <form onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api("/imports/twilio", twilio);
            setTwilio({ accountSid: "", authToken: "", e164: "", label: "" });
            setNotice("Twilio number imported.");
          });
        }}>
          <label>Account SID<input value={twilio.accountSid} onChange={(e) => setTwilio({ ...twilio, accountSid: e.target.value })} autoComplete="off" /></label>
          <label>Auth Token<input type="password" value={twilio.authToken} onChange={(e) => setTwilio({ ...twilio, authToken: e.target.value })} autoComplete="new-password" /></label>
          <label>E.164<input value={twilio.e164} onChange={(e) => setTwilio({ ...twilio, e164: e.target.value })} placeholder="+15551212000" /></label>
          <label>Label<input value={twilio.label} onChange={(e) => setTwilio({ ...twilio, label: e.target.value })} /></label>
          <button type="submit" className="btn btn-primary" disabled={busy}>Import Twilio number</button>
        </form>
      </section>

      <section className="panel numbers-panel">
        <h2>Import Telnyx</h2>
        <form onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api("/imports/telnyx", {
              apiKey: telnyx.apiKey || undefined,
              sipFqdn: telnyx.sipFqdn || undefined,
              e164: telnyx.e164,
              label: telnyx.label,
            });
            setTelnyx({ apiKey: "", sipFqdn: "", e164: "", label: "" });
            setNotice("Telnyx number imported.");
          });
        }}>
          <label>API key<input type="password" value={telnyx.apiKey} onChange={(e) => setTelnyx({ ...telnyx, apiKey: e.target.value })} autoComplete="new-password" /></label>
          <label>Or SIP FQDN<input value={telnyx.sipFqdn} onChange={(e) => setTelnyx({ ...telnyx, sipFqdn: e.target.value })} placeholder="sip.telnyx.com" /></label>
          <label>E.164<input value={telnyx.e164} onChange={(e) => setTelnyx({ ...telnyx, e164: e.target.value })} placeholder="+15551212000" /></label>
          <label>Label<input value={telnyx.label} onChange={(e) => setTelnyx({ ...telnyx, label: e.target.value })} /></label>
          <button type="submit" className="btn btn-primary" disabled={busy}>Import Telnyx number</button>
        </form>
      </section>

      <section className="panel numbers-panel">
        <h2>SIP trunk</h2>
        <p className="hint">Zadarma uses sip.zadarma.com. Vonage and Sinch use BYO SIP. The gateway must accept a connection on port 5060 or the save fails.</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const body = trunk.provider === "zadarma"
              ? { provider: "zadarma", username: trunk.username, password: trunk.password, label: trunk.label }
              : { provider: "byo-sip-trunk", gateways: [trunk.gateway], username: trunk.username, password: trunk.password, label: trunk.label };
            await api("/trunks", body);
            setTrunk({ ...trunk, gateway: "", username: "", password: "", label: "" });
            setNotice("Trunk saved. The password is not shown again.");
          });
        }}>
          <label>Provider
            <select value={trunk.provider} onChange={(e) => setTrunk({ ...trunk, provider: e.target.value })}>
              <option value="byo-sip-trunk">BYO SIP (Vonage, Sinch, generic)</option>
              <option value="zadarma">Zadarma</option>
            </select>
          </label>
          {trunk.provider === "byo-sip-trunk" && (
            <label>Gateway<input value={trunk.gateway} onChange={(e) => setTrunk({ ...trunk, gateway: e.target.value })} placeholder="203.0.113.10" /></label>
          )}
          <label>Username<input value={trunk.username} onChange={(e) => setTrunk({ ...trunk, username: e.target.value })} autoComplete="off" /></label>
          <label>Password<input type="password" value={trunk.password} onChange={(e) => setTrunk({ ...trunk, password: e.target.value })} autoComplete="new-password" /></label>
          <label>Label<input value={trunk.label} onChange={(e) => setTrunk({ ...trunk, label: e.target.value })} /></label>
          <button type="submit" className="btn btn-primary" disabled={busy}>Save trunk</button>
        </form>
        {trunks.length > 0 && (
          <ul>
            {trunks.map((item) => (
              <li key={item.id}>{item.label} · {item.provider} · {(item.gateways ?? []).join(", ")} · {item.hasSecret ? "secret stored" : "no secret"}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel numbers-panel">
        <h2>Attach a DID</h2>
        <form onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api("/numbers", { provider: "byo-phone-number", e164: did.e164, label: did.label, credentialId: did.credentialId });
            setDid({ e164: "", label: "", credentialId: did.credentialId });
            setNotice("DID attached.");
          });
        }}>
          <label>Trunk
            <select value={did.credentialId} onChange={(e) => setDid({ ...did, credentialId: e.target.value })}>
              <option value="">Choose a trunk</option>
              {trunks.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.provider})</option>)}
            </select>
          </label>
          <label>E.164<input value={did.e164} onChange={(e) => setDid({ ...did, e164: e.target.value })} placeholder="+15551212000" /></label>
          <label>Label<input value={did.label} onChange={(e) => setDid({ ...did, label: e.target.value })} /></label>
          <button type="submit" className="btn btn-primary" disabled={busy || !did.credentialId}>Attach DID</button>
        </form>
      </section>

      <section className="panel numbers-panel">
        <h2>Ingest a completed call</h2>
        <p className="hint">Carriers POST the same JSON to /v1/telephony/inbound. This form is the manual check. The session opens from Sessions.</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const entry = await api("/inbound", {
              provider: "byo-sip-trunk",
              e164: ingestE164,
              label: `${ingestE164} inbound`,
              turns: parseTurns(script),
            });
            setNotice(`Saved ${entry.sessionId}.`);
            navigate(`/sessions/${encodeURIComponent(entry.sessionId)}`);
          });
        }}>
          <label>E.164<input value={ingestE164} onChange={(e) => setIngestE164(e.target.value)} /></label>
          <label>Transcript<textarea value={script} onChange={(e) => setScript(e.target.value)} rows={5} /></label>
          <button type="submit" className="btn btn-primary" disabled={busy}>Save inbound session</button>
        </form>
      </section>
    </AppShell>
  );
}
