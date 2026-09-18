#!/usr/bin/env node
// One-time creation/deletion of the demo Clerk login used to hand judges a
// working sign-in without a real account. NOT part of any repeatable seed
// pipeline - same pattern as sabhalog's scripts/demo_fixtures.py, adapted to
// Clerk (this app has no user table of its own; Clerk is the entire identity
// store, so `privateMetadata.isDemo` stands in for a DB `is_demo` column and
// the fixed email list stands in for known slugs).
//
// --add is idempotent (looks up by exact email before creating). --clear
// looks up by that *same* fixed email list AND requires privateMetadata.isDemo
// === true on the match before deleting - never a bare metadata sweep, which
// could one day catch a demo-flagged user this script didn't create.
//
// Usage (from repo root):
//   node server/scripts/demo_credentials.js --add
//   node server/scripts/demo_credentials.js -a
//   node server/scripts/demo_credentials.js --clear
//   node server/scripts/demo_credentials.js -c

import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { clerkClient } from "@clerk/express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", "..", ".env");
if (existsSync(envPath)) dotenv.config({ path: envPath });

const DEMO_SCRIPT_ID = "2peepsfromaz-demo-credentials";
const DEMO_EMAIL = "demo-judge@2peepsfromaz.dev";

async function findDemoUser() {
  const { data } = await clerkClient.users.getUserList({ emailAddress: [DEMO_EMAIL] });
  return data[0] ?? null;
}

async function add() {
  const existing = await findDemoUser();
  if (existing) {
    console.log(`Already exists, no-op: ${DEMO_EMAIL} (isDemo=${existing.privateMetadata?.isDemo === true})`);
    return;
  }
  const password = randomBytes(18).toString("base64url");
  const user = await clerkClient.users.createUser({
    emailAddress: [DEMO_EMAIL],
    password,
    privateMetadata: { isDemo: true, demoScriptId: DEMO_SCRIPT_ID },
  });
  console.log(`Created demo user: ${DEMO_EMAIL} (id=${user.id})`);
  console.log(`Password (shown once, not stored anywhere else): ${password}`);
}

async function confirm(user) {
  console.log("About to permanently delete:");
  console.log(`  user: ${DEMO_EMAIL} (id=${user.id})`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Proceed? [y/N]: ")).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

async function clear() {
  const user = await findDemoUser();
  if (!user || user.privateMetadata?.isDemo !== true) {
    console.log("Nothing to delete - demo credential not present.");
    return;
  }
  if (!(await confirm(user))) {
    console.log("Aborted; nothing deleted.");
    return;
  }
  await clerkClient.users.deleteUser(user.id);
  console.log(`Deleted demo user: ${DEMO_EMAIL}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      add: { type: "boolean", short: "a", default: false },
      clear: { type: "boolean", short: "c", default: false },
    },
  });

  if (values.add === values.clear) {
    console.error("Error: pass exactly one of --add/-a or --clear/-c.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.CLERK_SECRET_KEY) {
    console.error("Error: CLERK_SECRET_KEY is not set.");
    process.exitCode = 1;
    return;
  }

  if (values.add) await add();
  else await clear();
}

main();
