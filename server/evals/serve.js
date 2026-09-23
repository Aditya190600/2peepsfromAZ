// Standalone offline-capable entrypoint; does not warm the production demo cache.
import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { evalRouter } from './router.js';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/v1/evals', evalRouter());
app.listen(process.env.PORT || 8787, () => console.log('Eval API ready'));
