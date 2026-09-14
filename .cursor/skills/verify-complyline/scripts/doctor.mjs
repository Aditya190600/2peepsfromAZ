#!/usr/bin/env node
// Read-only health check: is this verification instance worth driving?
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const instancePath = path.join(skillDir, "run", "instance.json");
const FRONTEND_URL = "http://127.0.0.1:5173";
const uiOnlyArg = process.argv.includes("--ui-only");
const problems = [];

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(instancePath)) {
  problems.push(`No ${instancePath}. Launch with node .cursor/skills/verify-complyline/scripts/launch.mjs`);
} else {
  const instance = JSON.parse(readFileSync(instancePath, "utf8"));
  const uiOnly = uiOnlyArg || instance.mode === "ui-only";
  if (!uiOnly && !pidAlive(instance.serverPid)) problems.push(`serverPid ${instance.serverPid} is not running`);
  if (!pidAlive(instance.clientPid)) problems.push(`clientPid ${instance.clientPid} is not running`);
  if (instance.frontendUrl !== FRONTEND_URL) problems.push(`unexpected frontendUrl ${instance.frontendUrl}`);
  if (!uiOnly && instance.backendPort !== 8787) problems.push(`unexpected backendPort ${instance.backendPort} (Vite proxy is hardcoded to 8787)`);
}

let landing = "";
try {
  const resp = await fetch(FRONTEND_URL);
  landing = await resp.text();
  if (!resp.ok) problems.push(`GET ${FRONTEND_URL} -> ${resp.status}`);
  if (!landing.includes("<title>ComplyLine</title>")) problems.push("Landing HTML does not contain <title>ComplyLine</title>");
  if (!landing.includes("id=\"root\"")) problems.push("Landing HTML does not contain the React root");
} catch (err) {
  problems.push(`GET ${FRONTEND_URL} failed: ${err.message}`);
}

const instance = existsSync(instancePath) ? JSON.parse(readFileSync(instancePath, "utf8")) : null;
const uiOnly = uiOnlyArg || instance?.mode === "ui-only";

if (!uiOnly) {
  try {
    const resp = await fetch(`${FRONTEND_URL}/v1/analyze-session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = await resp.json();
    if (resp.status !== 400) problems.push(`POST /v1/analyze-session {} -> ${resp.status}, expected 400`);
    if (!String(body.error || "").includes("turns array")) {
      problems.push(`POST /v1/analyze-session {} body was ${JSON.stringify(body)}, expected turns-array error`);
    }
  } catch (err) {
    problems.push(`POST /v1/analyze-session failed: ${err.message}`);
  }
}

if (problems.length) {
  console.error(JSON.stringify({ ok: false, problems }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, mode: uiOnly ? "ui-only" : "full", frontendUrl: FRONTEND_URL, backendPort: uiOnly ? null : 8787 }, null, 2));
