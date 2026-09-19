#!/usr/bin/env node
// One-time creation/deletion of the demo Clerk logins used to hand judges a
// working sign-in without a real account. NOT part of any repeatable seed
// pipeline - same pattern as sabhalog's scripts/demo_fixtures.py, adapted to
// Clerk (this app has no user table of its own; Clerk is the entire identity
// store, so `privateMetadata.isDemo` stands in for a DB `is_demo` column and
// the fixed email list stands in for known slugs).
//
// Sign-in is email+OTP only (no passwords). Each demo email uses Clerk's
// built-in "+clerk_test" convention (<local>+clerk_test@<domain> always
// accepts the fixed code 424242, no real email sent) - see the "Demo
// credentials" section in README.md.
//
// --add is idempotent per email (looks up by exact email before creating).
// --clear looks up by that *same* fixed email list AND requires
// privateMetadata.isDemo === true on each match before deleting - never a
// bare metadata sweep, which could one day catch a demo-flagged user this
// script didn't create.
//
// Usage (from repo root):
//   node server/scripts/demo_credentials.js --add
//   node server/scripts/demo_credentials.js -a
//   node server/scripts/demo_credentials.js --clear
//   node server/scripts/demo_credentials.js -c

import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { clerkClient } from "@clerk/express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", "..", ".env");
if (existsSync(envPath)) dotenv.config({ path: envPath });

const DEMO_SCRIPT_ID = "2peepsfromaz-demo-credentials";
const DEMO_EMAILS = [1, 2, 3, 4, 5].map((n) => `judge${n}+clerk_test@2peepsfromaz.dev`);

async function findDemoUser(email) {
  const { data } = await clerkClient.users.getUserList({ emailAddress: [email] });
  return data[0] ?? null;
}

async function add() {
  for (const email of DEMO_EMAILS) {
    const existing = await findDemoUser(email);
    if (existing) {
      console.log(`Already exists, no-op: ${email} (isDemo=${existing.privateMetadata?.isDemo === true})`);
      continue;
    }
    const user = await clerkClient.users.createUser({
      emailAddress: [email],
      skipPasswordRequirement: true,
      privateMetadata: { isDemo: true, demoScriptId: DEMO_SCRIPT_ID },
    });
    console.log(`Created demo user: ${email} (id=${user.id})`);
  }
  console.log("Sign in with the fixed code 424242 (Clerk +clerk_test convention).");
}

async function confirm(users) {
  console.log("About to permanently delete:");
  for (const user of users) console.log(`  user: ${user.primaryEmailAddress?.emailAddress ?? user.id} (id=${user.id})`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Proceed? [y/N]: ")).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

async function clear() {
  const users = [];
  for (const email of DEMO_EMAILS) {
    const user = await findDemoUser(email);
    if (user && user.privateMetadata?.isDemo === true) users.push(user);
  }
  if (users.length === 0) {
    console.log("Nothing to delete - no demo credentials present.");
    return;
  }
  if (!(await confirm(users))) {
    console.log("Aborted; nothing deleted.");
    return;
  }
  for (const user of users) {
    await clerkClient.users.deleteUser(user.id);
    console.log(`Deleted demo user: ${user.primaryEmailAddress?.emailAddress ?? user.id}`);
  }
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
