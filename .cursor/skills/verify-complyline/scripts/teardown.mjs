#!/usr/bin/env node
// Kill only the PIDs recorded in run/instance.json. Leaves artifacts/ in place.
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const instancePath = path.join(skillDir, "run", "instance.json");

if (!existsSync(instancePath)) {
  console.log("Nothing to tear down (no run/instance.json).");
  process.exit(0);
}

const instance = JSON.parse(readFileSync(instancePath, "utf8"));
for (const pid of [instance.clientPid, instance.serverPid]) {
  if (!pid) continue;
  try {
    process.kill(pid);
    console.log(`killed ${pid}`);
  } catch (err) {
    console.log(`pid ${pid} already gone (${err.message})`);
  }
}

unlinkSync(instancePath);
console.log("removed run/instance.json; artifacts/ kept");
