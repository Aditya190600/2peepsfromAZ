export function validateEval(value) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  const string = (v, max = 10000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id)) fail('id must contain 1–80 letters, digits, underscores or hyphens');
  if (!string(value.name, 160)) fail('name is required (max 160 characters)');
  if (!['offline', 'semantic'].includes(value.mode ?? 'offline')) fail('mode must be offline or semantic');
  if (!Array.isArray(value.messages) || !value.messages.length || value.messages.length > 100) fail('messages must contain 1–100 turns');
  for (const m of value.messages) {
    if (!m || !['assistant', 'user'].includes(m.role) || !string(m.text) || !Number.isFinite(m.tMs) || m.tMs < 0) fail('each message needs role assistant/user, text, and nonnegative tMs');
  }
  if (!value.startedAt || !Number.isFinite(Date.parse(value.startedAt))) fail('startedAt must be an ISO date');
  if (value.consentEvent != null && (typeof value.consentEvent.granted !== 'boolean' || !Number.isFinite(Date.parse(value.consentEvent.timestamp)))) fail('consentEvent needs granted and a valid timestamp');
  if (!Array.isArray(value.checkpoints) || !value.checkpoints.length || value.checkpoints.length > 40) fail('checkpoints must contain 1–40 entries');
  const ids = new Set();
  for (const c of value.checkpoints) {
    if (!c || !string(c.id, 80) || ids.has(c.id)) fail('checkpoint ids must be unique and nonempty');
    ids.add(c.id);
    if (!['exact', 'regex', 'check', 'ai'].includes(c.type)) fail('unknown checkpoint type');
    if (c.role !== undefined && !['assistant', 'user'].includes(c.role)) fail('role must be assistant or user');
    if (c.messageIndex !== undefined && (!Number.isInteger(c.messageIndex) || c.messageIndex < 0 || c.messageIndex >= value.messages.length)) fail('messageIndex is out of range');
    if (c.type === 'exact' && !string(c.expected)) fail('exact needs expected text');
    if (c.type === 'regex') {
      if (!string(c.pattern, 500) || !/^[imsu]*$/.test(c.flags ?? '')) fail('regex needs pattern and optional i/m/s/u flags');
      try { new RegExp(c.pattern, c.flags); } catch { fail('invalid regex'); }
    }
    if (c.type === 'check' && (!['consent', 'ai_disclosure', 'recording_consent', 'pii_scan', 'opt_out'].includes(c.check) || !['pass', 'flag', 'n/a'].includes(c.expected))) fail('check needs a supported check name and expected pass/flag/n/a');
    if (c.type === 'ai' && (!string(c.systemPrompt) || (c.model !== undefined && !string(c.model, 120)))) fail('ai needs systemPrompt and optional model');
  }
  return JSON.parse(JSON.stringify({ id: value.id, name: value.name, mode: value.mode ?? 'offline', startedAt: value.startedAt, consentEvent: value.consentEvent ?? null, messages: value.messages, checkpoints: value.checkpoints }));
}
