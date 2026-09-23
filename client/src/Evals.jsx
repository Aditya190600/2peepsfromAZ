import { useEffect, useState } from 'react';
import { AppShell } from './Chrome';
import './Evals.css';
async function api(path = '', body) {
  const res = await fetch(`/v1/evals${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}
export default function Evals({ path, navigate }) {
  const [evals, setEvals] = useState([]);
  const [prompt, setPrompt] = useState('Generate tests for TCPA consent, early AI disclosure, and PII.');
  const [draft, setDraft] = useState('');
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const refresh = async () => setEvals(await api());
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);
  async function action(label, fn) {
    setBusy(label); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  return <AppShell path={path} navigate={navigate} title="Evals">
    <main className="evals-page">
    <p>Test mock conversations against compliance checks and checkpoint judges.</p>
    <p>Offline runs use disclosure phrases and PII patterns. Semantic runs and AI judges use AssemblyAI and may queue for a minute or more.</p>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">{busy}…</p>}
    <section aria-label="Saved evals"><h2>Saved evals</h2>
      <div className="evals-table"><table><thead><tr><th>Name</th><th>Mode</th><th>Last run</th><th>Pass rate</th><th>Actions</th></tr></thead><tbody>
      {evals.map((doc) => <tr key={doc.id}><td>{doc.name}{doc.fixture && ' · fixture'}</td><td>{doc.mode}</td><td>{doc.lastRun ? new Date(doc.lastRun.createdAt).toLocaleString() : 'Never'}</td><td>{doc.lastRun ? `${Math.round(doc.lastRun.passRate * 100)}% · ${doc.lastRun.status}` : 'None'}</td><td>
        <button disabled={!!busy} onClick={() => action('Running eval', async () => { setRun(await api(`/${doc.id}/run`, {})); await refresh(); })}>Run</button>
        <button disabled={!!busy} onClick={() => { const { fixture, lastRun, ...copy } = doc; setDraft(JSON.stringify({ ...copy, id: `${doc.id.slice(0, 60)}_copy` }, null, 2)); }}>Edit copy</button>
        {doc.lastRun && <button disabled={!!busy} onClick={() => action('Loading run', async () => setRun(await api(`/${doc.id}/runs/${doc.lastRun.id}`)))}>Results</button>}
      </td></tr>)}
      </tbody></table></div>
    </section>
    <section><h2>Author an eval</h2><label htmlFor="eval-prompt">Describe the scenarios to cover</label><textarea id="eval-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={4000} />
      <button disabled={!!busy || !prompt.trim()} onClick={() => action('Generating draft', async () => setDraft(JSON.stringify(await api('/generate', { prompt }), null, 2)))}>Generate draft</button>
      <p>Generation does not save. Review and edit the JSON, then confirm below. Use a new ID to save a revised eval; fixtures are protected.</p>
      <label htmlFor="eval-json">Draft JSON</label><textarea id="eval-json" className="evals-json" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Generate a draft or edit a saved eval copy" />
      <button disabled={!!busy || !draft.trim()} onClick={() => action('Saving eval', async () => { await api('', JSON.parse(draft)); await refresh(); setDraft(''); })}>Confirm and save</button>
    </section>
    {run && <section aria-label="Run results"><h2>Run results · {run.status}</h2><p>{Math.round(run.passRate * 100)}% passed · {run.mode} · {new Date(run.createdAt).toLocaleString()}</p>
      <ul>{run.checkpoints.map((c) => <li key={c.id}><strong>{c.id}: {c.status}</strong> ({c.type}){c.detail && <p>{c.detail}</p>}</li>)}</ul>
      <h3>Transcript</h3><ol>{run.messages.map((m, i) => <li key={i}>{(m.tMs / 1000).toFixed(1)}s · {m.role}: {m.text}</li>)}</ol>
      <details><summary>Compliance findings</summary><pre>{JSON.stringify(run.report, null, 2)}</pre></details>
    </section>}
    <p>Saved evals and run transcripts are stored on this server. Use synthetic data. These checks are screening tools, not legal advice.</p>
  </main>
  </AppShell>;
}
