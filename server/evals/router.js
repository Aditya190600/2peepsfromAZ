import { Router } from 'express';
import { callLlmGateway } from '../checks/llmGateway.js';
import { validateEval } from './schema.js';
import { EvalStore } from './store.js';
import { runEval } from './runner.js';
export async function generateDraft(prompt, completion = callLlmGateway) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw Object.assign(new Error('prompt is required (max 4000 characters)'), { status: 400 });
  const content = await completion([
    { role: 'system', content: `Draft one synthetic compliance eval as JSON only. Never use real personal data. Schema: {id: string (letters/digits/underscore/hyphen), name: string, mode: "offline", startedAt: ISO date, consentEvent: null or {granted: boolean, timestamp: ISO date}, messages: [{role: "assistant"|"user", text: string, tMs: nonnegative number}], checkpoints: [{id: unique string, type: "check", check: "consent"|"ai_disclosure"|"pii_scan"|"recording_consent"|"opt_out", expected: "pass"|"flag"}]}. Include at least 3 meaningful checkpoints and realistic timestamped mock turns. Consent requires a logged event before startedAt. Offline disclosure recognizes AI assistant/system, automated assistant/system, virtual assistant within 10000ms. PII is a pattern scan. Can also use type exact with expected text or regex with pattern; both support role assistant/user and zero-based messageIndex.` },
    { role: 'user', content: prompt },
  ], { maxTokens: 4000, temperature: 0 });
  try {
    const doc = validateEval(JSON.parse(content));
    if (doc.checkpoints.length < 3) throw new Error('Draft needs at least 3 checkpoints');
    return doc;
  } catch (error) { throw Object.assign(new Error(`Invalid generated draft: ${error.message}`), { status: 502 }); }
}
export function evalRouter({ store = new EvalStore(), completion = callLlmGateway } = {}) {
  const router = Router();
  const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.status ?? 500).json({ error: error.status ? error.message : 'Eval operation failed' }); } };
  router.get('/', wrap(async (_req, res) => res.json(await store.list())));
  router.post('/', wrap(async (req, res) => res.status(201).json(await store.save(req.body))));
  router.post('/generate', wrap(async (req, res) => res.json(await generateDraft(req.body?.prompt, completion))));
  router.get('/:id', wrap(async (req, res) => { const doc = await store.get(req.params.id); res.status(doc ? 200 : 404).json(doc ?? { error: 'Eval not found' }); }));
  router.post('/:id/run', wrap(async (req, res) => {
    const doc = await store.get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Eval not found' });
    const run = await runEval(doc, { completion });
    await store.saveRun(run);
    res.status(201).json(run);
  }));
  router.get('/:id/runs/:runId', wrap(async (req, res) => {
    const run = await store.getRun(req.params.id, req.params.runId);
    res.status(run ? 200 : 404).json(run ?? { error: 'Run not found' });
  }));
  return router;
}
