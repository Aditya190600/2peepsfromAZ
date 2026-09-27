import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_AGENTS, DEMO_AGENT_DOMAINS, DEMO_AGENT_KEYS, findDemoAgent } from "./demoAgentDefaults.js";

test("catalog keys are unique and keep the banking pair's original keys", () => {
  assert.equal(new Set(DEMO_AGENT_KEYS).size, DEMO_AGENT_KEYS.length);
  assert.equal(findDemoAgent("compliant").domain, "banking");
  assert.equal(findDemoAgent("flawed").domain, "banking");
  assert.equal(findDemoAgent("nope"), null);
});

test("every domain ships exactly one compliant and one flawed agent", () => {
  for (const domain of Object.keys(DEMO_AGENT_DOMAINS)) {
    const kinds = DEMO_AGENTS.filter((a) => a.domain === domain).map((a) => a.variant).sort();
    assert.deepEqual(kinds, ["compliant", "flawed"], domain);
  }
  assert.ok(DEMO_AGENTS.every((a) => DEMO_AGENT_DOMAINS[a.domain]));
});

test("every agent body is telephony-ready and uses a documented voice", () => {
  const documentedVoices = ["alba", "eve", "george", "jane", "jean", "mary", "michael", "anna", "charles", "paul", "vera"];
  for (const { key, agent } of DEMO_AGENTS) {
    assert.deepEqual(agent.input, { format: { encoding: "audio/pcmu" } }, key);
    assert.deepEqual(agent.output, { format: { encoding: "audio/pcmu" } }, key);
    assert.ok(documentedVoices.includes(agent.voice.voice_id), key);
    assert.ok(agent.system_prompt && agent.greeting && agent.name, key);
    assert.match(agent.system_prompt, /can't transfer/, key);
  }
});

test("every compliant agent discloses AI in its greeting", () => {
  for (const a of DEMO_AGENTS.filter((x) => x.variant === "compliant")) {
    assert.match(a.agent.greeting, /AI assistant/, a.key);
  }
});
