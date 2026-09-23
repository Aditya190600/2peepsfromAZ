import { parentPort, workerData } from 'node:worker_threads';
parentPort.postMessage(new RegExp(workerData.pattern, workerData.flags).test(workerData.text));
