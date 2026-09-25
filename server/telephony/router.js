import { Router } from "express";
import {
  assertE164,
  probeGateways,
  validateTelnyxApiKey,
  validateTwilio,
  ZADARMA_GATEWAYS,
} from "./carriers.js";
import { ingestInbound } from "./inbound.js";
import { redactCredential, TelephonyStore } from "./store.js";

const NUMBER_PROVIDERS = new Set(["twilio", "telnyx", "zadarma", "byo-phone-number"]);
const TRUNK_PROVIDERS = new Set(["twilio", "telnyx", "zadarma", "byo-sip-trunk"]);
const DIRECTIONS = new Set(["inbound", "outbound", "both"]);

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function labelOf(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !value.trim() || value.length > 160) fail("label must be 1-160 characters");
  return value.trim();
}

export function requireTelephonyHook(req, res, next) {
  const expected = process.env.TELEPHONY_WEBHOOK_SECRET;
  if (!expected) return next();
  if (req.get("x-complyline-hook-secret") !== expected) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }
  next();
}

export function telephonyRouter({ store = new TelephonyStore(), fetchImpl = fetch, probe } = {}) {
  const router = Router();
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = err.status ?? 500;
      res.status(status).json({ error: status === 500 ? "Telephony request failed" : err.message });
    }
  };

  async function saveTrunk({ provider, label, gateways, username, secret }) {
    if (!TRUNK_PROVIDERS.has(provider)) fail("Unknown trunk provider");
    // Twilio has no shared SIP host. sip.twilio.com has no A/AAAA record, so a
    // default probe always fails with ENOTFOUND. The Accounts API check is the
    // validation. Probe only a SIP domain the operator actually supplies.
    const hosts = provider === "twilio" && (!gateways || gateways.length === 0)
      ? []
      : await probeGateways(gateways, { connect: probe });
    const saved = await store.saveCredential({
      provider,
      label: labelOf(label, provider),
      gateways: hosts,
      username: username ?? null,
      secret: secret ?? null,
    });
    return redactCredential(saved);
  }

  router.get("/numbers", wrap(async (_req, res) => {
    res.json(await store.listNumbers());
  }));

  router.post("/numbers", wrap(async (req, res) => {
    const body = req.body ?? {};
    if (!NUMBER_PROVIDERS.has(body.provider)) fail("Unknown number provider");
    const e164 = assertE164(body.e164);
    const direction = body.direction ?? "inbound";
    if (!DIRECTIONS.has(direction)) fail("direction must be inbound, outbound, or both");
    if (body.provider === "byo-phone-number") {
      if (!body.credentialId) fail("byo-phone-number requires credentialId");
      const trunk = await store.getCredential(body.credentialId);
      if (!trunk || (trunk.provider !== "byo-sip-trunk" && trunk.provider !== "zadarma")) {
        fail("credentialId must point at a BYO SIP or Zadarma trunk");
      }
    }
    const number = await store.saveNumber({
      provider: body.provider,
      e164,
      label: labelOf(body.label, e164),
      credentialId: body.credentialId ?? null,
      direction,
    });
    res.status(201).json(number);
  }));

  router.patch("/numbers/:id", wrap(async (req, res) => {
    const body = req.body ?? {};
    const patch = {};
    if (body.label !== undefined) patch.label = labelOf(body.label);
    if (body.direction !== undefined) {
      if (!DIRECTIONS.has(body.direction)) fail("direction must be inbound, outbound, or both");
      patch.direction = body.direction;
    }
    if (body.credentialId !== undefined) patch.credentialId = body.credentialId;
    const number = await store.updateNumber(req.params.id, patch);
    if (!number) return res.status(404).json({ error: "Number not found" });
    res.json(number);
  }));

  router.delete("/numbers/:id", wrap(async (req, res) => {
    const ok = await store.deleteNumber(req.params.id);
    if (!ok) return res.status(404).json({ error: "Number not found" });
    res.status(204).end();
  }));

  router.get("/trunks", wrap(async (_req, res) => {
    const credentials = await store.listCredentials();
    res.json(credentials.map(redactCredential));
  }));

  router.post("/trunks", wrap(async (req, res) => {
    const body = req.body ?? {};
    const gateways = body.provider === "zadarma" ? (body.gateways ?? ZADARMA_GATEWAYS) : body.gateways;
    const saved = await saveTrunk({
      provider: body.provider,
      label: body.label,
      gateways,
      username: body.username ?? null,
      secret: body.password ?? body.secret ?? null,
    });
    res.status(201).json(saved);
  }));

  router.delete("/trunks/:id", wrap(async (req, res) => {
    const ok = await store.deleteCredential(req.params.id);
    if (!ok) return res.status(404).json({ error: "Trunk not found" });
    res.status(204).end();
  }));

  router.post("/imports/twilio", wrap(async (req, res) => {
    const body = req.body ?? {};
    const e164 = assertE164(body.e164);
    await validateTwilio({ accountSid: body.accountSid, authToken: body.authToken }, { fetchImpl });
    const trunk = await saveTrunk({
      provider: "twilio",
      label: body.label ?? "Twilio",
      gateways: body.gateways,
      username: body.accountSid,
      secret: body.authToken,
    });
    const number = await store.saveNumber({
      provider: "twilio",
      e164,
      label: labelOf(body.label, e164),
      credentialId: trunk.id,
      direction: "inbound",
    });
    res.status(201).json({ trunk, number });
  }));

  router.post("/imports/telnyx", wrap(async (req, res) => {
    const body = req.body ?? {};
    const e164 = assertE164(body.e164);
    let gateways = body.gateways;
    let secret = null;
    if (body.apiKey) {
      await validateTelnyxApiKey(body.apiKey, { fetchImpl });
      secret = body.apiKey;
      gateways = gateways ?? ["sip.telnyx.com"];
    } else if (body.sipFqdn || gateways) {
      gateways = gateways ?? [body.sipFqdn];
    } else {
      fail("Telnyx import needs an API key or a SIP FQDN");
    }
    const trunk = await saveTrunk({
      provider: "telnyx",
      label: body.label ?? "Telnyx",
      gateways,
      username: null,
      secret,
    });
    const number = await store.saveNumber({
      provider: "telnyx",
      e164,
      label: labelOf(body.label, e164),
      credentialId: trunk.id,
      direction: "inbound",
    });
    res.status(201).json({ trunk, number });
  }));

  const inbound = wrap(async (req, res) => {
    const entry = await ingestInbound(req.body, { store });
    res.status(201).json(entry);
  });
  router.post("/inbound", inbound);
  router.inbound = inbound;

  router.get("/sessions", wrap(async (_req, res) => {
    const sessions = await store.listSessions();
    res.json(sessions.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      label: s.label,
      timestamp: s.timestamp,
      verdictLevel: s.verdictLevel,
      verdictLabel: s.verdictLabel,
      source: s.source,
      e164: s.e164,
      provider: s.provider,
    })));
  }));

  router.get("/sessions/:sessionId", wrap(async (req, res) => {
    const entry = await store.getSession(req.params.sessionId);
    if (!entry) return res.status(404).json({ error: "Session not found" });
    res.json(entry);
  }));

  return router;
}
