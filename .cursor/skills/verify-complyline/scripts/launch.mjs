#!/usr/bin/env node
// Starts a disposable ComplyLine pair (Express :8787 + Vite :5173), writes run/instance.json, then exits.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(skillDir, "..", "..", "..");
const runDir = path.join(skillDir, "run");
const instancePath = path.join(runDir, "instance.json");
const FRONTEND_URL = "http://127.0.0.1:5173";
const BACKEND_PORT = 8787;
const FRONTEND_PORT = 5173;

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(400, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port, label, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${label} did not listen on ${port} within ${timeoutMs}ms`);
}

if (existsSync(instancePath)) {
  const previous = JSON.parse(readFileSync(instancePath, "utf8"));
  console.error(`Refusing to launch: ${instancePath} already exists (pids ${previous.serverPid}, ${previous.clientPid}). Run node .cursor/skills/verify-complyline/scripts/teardown.mjs first.`);
  process.exit(1);
}

const uiOnly = process.argv.includes("--ui-only");

if (!uiOnly && (await portOpen(BACKEND_PORT))) {
  console.error(`Refusing to launch: port ${BACKEND_PORT} is already in use. Vite proxies /v1 to that port; do not drive a shared instance.`);
  process.exit(1);
}
if (await portOpen(FRONTEND_PORT)) {
  console.error(`Refusing to launch: port ${FRONTEND_PORT} is already in use. Do not drive a shared instance.`);
  process.exit(1);
}

const envPath = path.join(repoRoot, ".env");
const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const hasKey = /ASSEMBLYAI_API_KEY=\S+/.test(envText);
if (!uiOnly && !hasKey) {
  console.error("Missing ASSEMBLYAI_API_KEY in .env. Copy .env.example and set the key, or pass --ui-only for SPA routes that do not call /v1.");
  process.exit(1);
}

const viteBin = path.join(repoRoot, "client", "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteBin)) {
  console.error("Client dependencies missing. From repo root: cd client && npm install");
  process.exit(1);
}
if (!uiOnly && !existsSync(path.join(repoRoot, "server", "node_modules"))) {
  console.error("Server dependencies missing. From repo root: cd server && npm install");
  process.exit(1);
}

mkdirSync(runDir, { recursive: true });
const serverLog = path.join(runDir, "server.log");
const clientLog = path.join(runDir, "client.log");
const serverFd = openSync(serverLog, "w");
const clientFd = openSync(clientLog, "w");

function spawnDetached(command, args, cwd, fd) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env },
    windowsHide: true,
  });
  child.unref();
  return child;
}

let server = { pid: null };
if (!uiOnly) {
  server = spawnDetached(process.execPath, ["index.js"], path.join(repoRoot, "server"), serverFd);
}
const client = spawnDetached(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(FRONTEND_PORT), "--strictPort"], path.join(repoRoot, "client"), clientFd);

try {
  if (!uiOnly) await waitForPort(BACKEND_PORT, "backend");
  await waitForPort(FRONTEND_PORT, "frontend");
} catch (err) {
  try {
    if (server.pid) process.kill(server.pid);
  } catch {}
  try {
    if (client.pid) process.kill(client.pid);
  } catch {}
  console.error(err.message);
  console.error(`See ${serverLog} and ${clientLog}`);
  process.exit(1);
}

const instance = {
  mode: uiOnly ? "ui-only" : "full",
  serverPid: server.pid,
  clientPid: client.pid,
  frontendUrl: FRONTEND_URL,
  backendPort: uiOnly ? null : BACKEND_PORT,
  frontendPort: FRONTEND_PORT,
  startedAt: new Date().toISOString(),
  repoRoot,
};
writeFileSync(instancePath, JSON.stringify(instance, null, 2));
console.log(JSON.stringify(instance, null, 2));
console.log(`Ready: ${FRONTEND_URL}`);
