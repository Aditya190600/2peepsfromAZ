// Provider slots (transcriber/model/voice) - Vapi-style BYO-key swapping.
// See .claude/prds/provider-swaps.md. GET routes never return secrets and stay
// open, since the Try page reads the current selection. The selection and the
// stored BYO keys are one process-wide setting that every visitor's calls and
// analyses run through, so changing either takes a signed-in operator
// (QUALEVAL_OPERATOR_EMAILS, server/qualeval/operatorAccess.js).
import { Router } from "express";
import * as providers from "./registry.js";

export function providersRouter({ registry = providers, requireVisitor, isOperator }) {
  const router = Router();

  const requireOperator = async (req, res, next) => {
    try {
      if (!(await isOperator(req))) return res.status(403).json({ error: "Operator access required." });
    } catch (err) {
      return next(err);
    }
    next();
  };

  router.get("/", (_req, res) => {
    res.json(registry.listCatalog());
  });

  // canEdit tells the client whether to show the controls at all.
  router.get("/config", async (req, res, next) => {
    try {
      res.json({ ...registry.getConfig(), canEdit: await isOperator(req) });
    } catch (err) {
      next(err);
    }
  });

  router.put("/config", requireVisitor, requireOperator, (req, res) => {
    const { slot, providerId } = req.body ?? {};
    if (!slot || !providerId) {
      return res.status(400).json({ error: "slot and providerId are required" });
    }
    try {
      const updated = registry.setSelection(slot, providerId);
      res.json({ slot, ...updated });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put("/credentials", requireVisitor, requireOperator, (req, res) => {
    const { providerId, apiKey, baseUrl, model } = req.body ?? {};
    if (!providerId) {
      return res.status(400).json({ error: "providerId is required" });
    }
    try {
      registry.setCredential(providerId, {
        apiKey,
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
