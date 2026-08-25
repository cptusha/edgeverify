import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, j } from '../db/knex.js';
import { requireRole, ROLES, hashKey, issueToken } from '../middleware/auth.js';
import { audit, verifyChain } from '../middleware/audit.js';
import { expandBuiltins } from '../engine/rules.js';
import { DEFAULT_RISK_CONFIG } from '../engine/risk.js';

export const authRouter = Router();
authRouter.post('/login', async (req, res) => {
  const { email, password, tenant_id } = req.body;
  const u = await db('users').where({ email }).modify(q => { if (tenant_id) q.where({ tenant_id }); }).first();
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
  await audit({ actor: { id: u.id, type: 'user', tenant_id: u.tenant_id }, ip: req.ip, get: (h) => req.get(h) }, { action: 'auth.login', resource_type: 'user', resource_id: u.id });
  res.json({ token: issueToken(u), user: { id: u.id, name: u.name, email: u.email, role: u.role, tenant_id: u.tenant_id } });
});
authRouter.get('/me', (req, res) => res.json(req.actor));
authRouter.get('/roles', (req, res) => res.json(ROLES));

export const adminRouter = Router();
// Users
adminRouter.get('/users', requireRole('tenant_admin', 'auditor'), async (req, res) => res.json(await db('users').where({ tenant_id: req.actor.tenant_id }).select('id', 'email', 'name', 'role', 'active', 'created_at')));
adminRouter.post('/users', requireRole('tenant_admin'), async (req, res, next) => {
  try {
    const { email, name, role, password } = req.body; if (!ROLES[role] || role === 'super_admin') return res.status(400).json({ error: 'Invalid role' });
    const row = { id: uuid(), tenant_id: req.actor.tenant_id, email, name, role, password_hash: await bcrypt.hash(password, 10) };
    await db('users').insert(row); res.status(201).json({ id: row.id, email, name, role });
  } catch (e) { next(e); }
});
adminRouter.patch('/users/:id', requireRole('tenant_admin'), async (req, res) => {
  const { role, active, name } = req.body; const patch = {}; if (role && ROLES[role] && role !== 'super_admin') patch.role = role; if (active !== undefined) patch.active = active; if (name) patch.name = name;
  await db('users').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).update(patch); res.json({ id: req.params.id, ...patch });
});
// API keys (shown once)
adminRouter.get('/api-keys', requireRole('tenant_admin', 'auditor'), async (req, res) => res.json(await db('api_keys').where({ tenant_id: req.actor.tenant_id }).select('id', 'label', 'prefix', 'scopes', 'last_used_at', 'active', 'created_at')));
adminRouter.post('/api-keys', requireRole('tenant_admin'), async (req, res) => {
  const key = 'ev_live_' + crypto.randomBytes(24).toString('base64url');
  const row = { id: uuid(), tenant_id: req.actor.tenant_id, label: req.body.label || 'Core banking', key_hash: hashKey(key), prefix: key.slice(0, 12), scopes: JSON.stringify(req.body.scopes || ['screen', 'transactions', 'customers']) };
  await db('api_keys').insert(row); res.status(201).json({ id: row.id, label: row.label, key, note: 'Store this key now; it will not be shown again.' });
});
adminRouter.delete('/api-keys/:id', requireRole('tenant_admin'), async (req, res) => { await db('api_keys').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).update({ active: false }); res.json({ revoked: true }); });
// Rules (custom risky-transaction set-up)
adminRouter.get('/rules', async (req, res) => res.json((await db('rules').where({ tenant_id: req.actor.tenant_id }).orderBy('code')).map(r => ({ ...r, definition: j(r.definition) }))));
adminRouter.get('/rules/library', (req, res) => res.json(expandBuiltins()));
adminRouter.post('/rules', requireRole('tenant_admin', 'compliance_officer'), async (req, res, next) => {
  try {
    const { code, name, description, category = 'custom', severity = 'medium', action = 'alert', definition, enabled = true } = req.body;
    if (!code || !definition) return res.status(400).json({ error: 'code and definition are required' });
    const row = { id: uuid(), tenant_id: req.actor.tenant_id, code: code.toUpperCase(), name, description, category, severity, action, definition: JSON.stringify(definition), enabled, created_by: req.actor.id };
    await db('rules').insert(row); res.status(201).json({ ...row, definition });
  } catch (e) { next(e); }
});
adminRouter.patch('/rules/:id', requireRole('tenant_admin', 'compliance_officer'), async (req, res) => {
  const before = await db('rules').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first(); if (!before) return res.status(404).json({ error: 'Not found' });
  const patch = {}; for (const k of ['name', 'description', 'severity', 'action', 'enabled', 'category']) if (req.body[k] !== undefined) patch[k] = req.body[k];
  if (req.body.definition) patch.definition = JSON.stringify(req.body.definition);
  await db('rules').where({ id: before.id }).update(patch); req.skipAutoAudit = true;
  await audit(req, { action: 'rule.update', resource_type: 'rule', resource_id: before.code, before: { ...before, definition: j(before.definition) }, after: req.body });
  res.json({ ...before, ...patch, definition: req.body.definition || j(before.definition) });
});
adminRouter.post('/rules/test', requireRole('tenant_admin', 'compliance_officer', 'analyst'), async (req, res, next) => {
  // Dry-run a rule definition against recent transactions to estimate alert volume before enabling it.
  try {
    const { evaluateRule } = await import('../engine/rules.js'); const { countryRiskMap } = await import('./customers.js');
    const rule = { ...req.body, enabled: true }; const countryRisk = await countryRiskMap();
    const txns = await db('transactions').where({ tenant_id: req.actor.tenant_id }).orderBy('occurred_at', 'desc').limit(2000);
    let hits = 0; const sample = [];
    for (const tx of txns) {
      const customer = tx.customer_id ? await db('customers').where({ id: tx.customer_id }).first() : {};
      const history = txns.filter(h => h.customer_id === tx.customer_id && h.id !== tx.id && new Date(h.occurred_at) < new Date(tx.occurred_at));
      const h = evaluateRule(rule, tx, { customer: customer || {}, history, countryRisk }); if (h) { hits++; if (sample.length < 5) sample.push({ tx: tx.external_ref || tx.id, ...h }); }
    }
    res.json({ evaluated: txns.length, would_alert: hits, hit_rate_pct: txns.length ? Math.round(1000 * hits / txns.length) / 10 : 0, sample });
  } catch (e) { next(e); }
});
// Risk model
adminRouter.get('/risk-config', async (req, res) => { const t = await db('tenants').where({ id: req.actor.tenant_id }).first(); res.json({ ...DEFAULT_RISK_CONFIG, ...(j(t.risk_config) || {}) }); });
adminRouter.put('/risk-config', requireRole('tenant_admin', 'compliance_officer'), async (req, res) => {
  const before = await db('tenants').where({ id: req.actor.tenant_id }).first();
  await db('tenants').where({ id: req.actor.tenant_id }).update({ risk_config: JSON.stringify(req.body) }); req.skipAutoAudit = true;
  await audit(req, { action: 'risk_model.update', resource_type: 'tenant', resource_id: req.actor.tenant_id, before: j(before.risk_config), after: req.body }); res.json(req.body);
});
adminRouter.get('/country-risk', async (req, res) => res.json(await db('country_risk').orderBy('score', 'desc')));
adminRouter.put('/country-risk/:iso2', requireRole('tenant_admin', 'compliance_officer'), async (req, res) => { await db('country_risk').where({ iso2: req.params.iso2 }).update(req.body); res.json({ iso2: req.params.iso2, ...req.body }); });
// Webhooks
adminRouter.get('/webhooks', requireRole('tenant_admin'), async (req, res) => res.json((await db('webhooks').where({ tenant_id: req.actor.tenant_id })).map(w => ({ ...w, events: j(w.events), secret: undefined }))));
adminRouter.post('/webhooks', requireRole('tenant_admin'), async (req, res) => {
  const row = { id: uuid(), tenant_id: req.actor.tenant_id, url: req.body.url, events: JSON.stringify(req.body.events || ['*']), secret: crypto.randomBytes(16).toString('hex') };
  await db('webhooks').insert(row); res.status(201).json({ ...row, events: req.body.events || ['*'] });
});
// Audit log (auditor + admin)
adminRouter.get('/audit', requireRole('tenant_admin', 'auditor', 'compliance_officer'), async (req, res) => {
  const { action, actor_id, resource_type, limit = 200 } = req.query;
  const rows = await db('audit_log').where({ tenant_id: req.actor.tenant_id }).modify(q => { if (action) q.where('action', 'like', `%${action}%`); if (actor_id) q.where({ actor_id }); if (resource_type) q.where({ resource_type }); }).orderBy('seq', 'desc').limit(Number(limit));
  res.json(rows.map(r => ({ ...r, before: j(r.before), after: j(r.after) })));
});
adminRouter.get('/audit/verify', requireRole('tenant_admin', 'auditor'), async (req, res) => res.json(await verifyChain(req.actor.tenant_id)));
adminRouter.get('/tenant', async (req, res) => { const t = await db('tenants').where({ id: req.actor.tenant_id }).first(); res.json({ ...t, settings: j(t.settings), risk_config: j(t.risk_config) }); });
adminRouter.put('/tenant/settings', requireRole('tenant_admin'), async (req, res) => { await db('tenants').where({ id: req.actor.tenant_id }).update({ settings: JSON.stringify(req.body) }); res.json(req.body); });
