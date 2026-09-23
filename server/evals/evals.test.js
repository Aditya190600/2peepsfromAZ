import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { EvalStore } from './store.js';
import { evalRouter, generateDraft } from './router.js';
import { runEval, judgeCheckpoint } from './runner.js';
import { validateEval } from './schema.js';
import { headlineVerdict } from '../../client/src/compliance.js';
const store = new EvalStore();
const clean = await store.get('sess_clean_01');
const noNetwork = () => { throw new Error('Network forbidden'); };
test('fixtures run real analyzer offline with pinned consent and risk outcomes', async () => {
  for (const [id, status, risk] of [['sess_clean_01', 'pass', 'clear'], ['sess_tcpa_04', 'fail', 'critical']]) {
    const run = await runEval(await store.get(id), { completion: noNetwork });
    assert.equal(run.checkpoints[0].status, status);
    assert.equal(run.status, status);
    assert.equal(headlineVerdict(run.report.findings).level, risk);
    assert.deepEqual(run.messages, run.document.messages);
  }
});
test('exact/regex select role/index, fail mismatches, and stop pathological patterns', async () => {
  const messages = [{ role: 'assistant', text: 'Hello AI', tMs: 0 }, { role: 'user', text: 'Yes', tMs: 10 }];
  const judge = (c) => judgeCheckpoint({ id: 'x', ...c }, messages, { findings: [] }, noNetwork);
  assert.equal((await judge({ type: 'exact', role: 'user', expected: 'Yes' })).status, 'pass');
  assert.equal((await judge({ type: 'exact', messageIndex: 0, expected: 'hello AI' })).status, 'fail');
  assert.equal((await judge({ type: 'regex', role: 'assistant', pattern: '^hello', flags: 'i' })).status, 'pass');
  assert.equal((await judge({ type: 'regex', role: 'user', pattern: 'AI' })).status, 'fail');
  const slow = await judgeCheckpoint({ id: 'slow', type: 'regex', pattern: '(a+)+$' }, [{text:'a'.repeat(10000)+'!'}], {});
  assert.equal(slow.status, 'error');
});
test('AI strict pass/fail, substitutions, custom model, and errors', async () => {
  const c = { id: 'ai', type: 'ai', model: 'test-model', systemPrompt: '{{messages}} {{lastMessage}}' };
  for (const output of ['pass', 'fail', 'PASS', 'pass\n', 'yes', '{"status":"pass"}']) {
    const result = await judgeCheckpoint(c, clean.messages, {}, async (messages, options) => {
      assert.equal(options.model, 'test-model');
      assert.ok(messages[0].content.includes(clean.messages.at(-1).text));
      assert.ok(!messages[0].content.includes('{{messages}}'));
      return output;
    });
    assert.equal(result.status, ['pass', 'fail'].includes(output) ? output : 'error');
  }
  assert.equal((await judgeCheckpoint(c, clean.messages, {}, noNetwork)).status, 'error');
  assert.equal((await judgeCheckpoint({id:'missing',type:'check',check:'consent',expected:'pass'}, [], {findings:[]})).status, 'error');
});
test('schema rejects unsafe IDs, dates, selectors and regex', () => {
  for (const patch of [{id:'../escape'}, {startedAt:'bad'}, {messages:[]}, {checkpoints:[{id:'x',type:'regex',pattern:'['}]}, {checkpoints:[{id:'x',type:'exact',expected:'yes',messageIndex:999}]}]) assert.throws(() => validateEval({...clean,...patch}));
});
test('generation needs at least three valid checkpoints', async () => {
  assert.equal((await generateDraft('TCPA + disclosure + PII', async () => JSON.stringify(clean))).checkpoints.length, 3);
  await assert.rejects(generateDraft('TCPA', async () => JSON.stringify({...clean,checkpoints:clean.checkpoints.slice(0,2)})));
  await assert.rejects(generateDraft('TCPA', async () => 'not json'));
});
test('HTTP create/list/run/retrieve persists; drafts never save; fixtures protected', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-test-'));
  const db = new EvalStore(root);
  const app = express(); app.use(express.json()); app.use('/v1/evals', evalRouter({store:db,completion:async()=>JSON.stringify({...clean,id:'draft'})}));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject) => {server.once('listening', resolve);server.once('error', reject);});
  t.after(async () => { await new Promise(resolve=>server.close(resolve)); await rm(root,{recursive:true,force:true}); });
  const request = async (url='', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/evals${url}`, body === undefined ? {} : {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  assert.equal((await request('/generate',{prompt:'TCPA and disclosure'})).body.id,'draft');
  assert.equal(await db.get('draft'),null);
  assert.equal((await request('',clean)).status,409);
  assert.equal((await request('',{...clean,id:'saved'})).status,201);
  const run = await request('/saved/run',{});
  assert.equal(run.status,201); assert.equal(run.body.passRate,1);
  assert.deepEqual((await request(`/saved/runs/${run.body.id}`)).body,run.body);
  assert.equal((await new EvalStore(root).getRun('saved',run.body.id)).status,'pass');
  assert.equal((await request()).body.find(d=>d.id==='saved').lastRun.id,run.body.id);
  assert.equal((await request('/missing/run',{})).status,404);
});
test('default AI judging and authoring share the production Gateway queue', async () => {
  const { callLlmGateway } = await import('../checks/llmGateway.js');
  const original = globalThis.fetch;
  let active = 0, peak = 0, calls = 0;
  globalThis.fetch = async (_url, options) => {
    active++; calls++; peak = Math.max(peak, active);
    const body = JSON.parse(options.body);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    const content = body.max_tokens === 4000 ? JSON.stringify(clean) : 'pass';
    return {ok:true,json:async()=>({choices:[{message:{content}}]})};
  };
  try {
    const [judgment, draft] = await Promise.all([
      judgeCheckpoint({id:'ai',type:'ai',systemPrompt:'Evaluate disclosure'},clean.messages,{}),
      generateDraft('TCPA and disclosure'),
      callLlmGateway([{role:'user',content:'production call'}]),
    ]);
    assert.equal(judgment.status,'pass'); assert.equal(draft.id,clean.id);
    assert.equal(calls,3); assert.equal(peak,1);
  } finally { globalThis.fetch = original; }
});
test('semantic mode uses supplied completion for production analysis', async () => {
  let calls = 0;
  const run = await runEval({...clean,mode:'semantic'}, {completion:async messages => {
    calls++;
    return messages[0].content.includes('disclos') ? JSON.stringify({disclosed:true,turnIndex:0,quote:'AI assistant'}) : '{"items":[]}';
  }});
  assert.equal(calls,2); assert.equal(run.status,'pass');
});
