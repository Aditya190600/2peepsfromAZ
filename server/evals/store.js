import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEval } from './schema.js';
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const defaultRoot = fileURLToPath(new URL('../.eval-data/', import.meta.url));
export class EvalStore {
  constructor(root = process.env.EVAL_DATA_DIR || defaultRoot) { this.root = root; }
  async read(dir, id) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return null;
    try { return JSON.parse(await readFile(path.join(dir, `${id}.json`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async get(id) { return await this.read(fixtures, id) ?? await this.read(path.join(this.root, 'evals'), id); }
  async all(dir) {
    try { return await Promise.all((await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => this.read(dir, f.slice(0, -5)))); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async list() {
    const docs = [...await this.all(fixtures), ...await this.all(path.join(this.root, 'evals'))];
    return Promise.all(docs.map(async (doc) => {
      const runs = await this.all(path.join(this.root, 'runs', doc.id));
      runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const last = runs[0];
      return { ...doc, fixture: Boolean(await this.read(fixtures, doc.id)), lastRun: last ? { id: last.id, createdAt: last.createdAt, status: last.status, passRate: last.passRate } : null };
    }));
  }
  async save(input) {
    const doc = validateEval(input);
    if (await this.get(doc.id)) throw Object.assign(new Error('ID already exists; save an edited copy with a new ID'), { status: 409 });
    const dir = path.join(this.root, 'evals');
    await mkdir(dir, { recursive: true });
    try { await writeFile(path.join(dir, `${doc.id}.json`), JSON.stringify(doc, null, 2), { flag: 'wx' }); }
    catch (error) { if (error.code === 'EEXIST') error.status = 409; throw error; }
    return doc;
  }
  async saveRun(run) {
    const dir = path.join(this.root, 'runs', run.evalId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${run.id}.json`), JSON.stringify(run), { flag: 'wx' });
  }
  async getRun(id, runId) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return null;
    return this.read(path.join(this.root, 'runs', id), runId);
  }
}
