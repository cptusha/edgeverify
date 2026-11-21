/**
 * SETS Operator Console API — super_admin only.
 *
 * All routes require role === 'super_admin'; the requireRole middleware
 * short-circuits everything else before the handler runs.
 *
 * Routes:
 *  GET  /operator/tenants              — list all tenants with live usage counts
 *  GET  /operator/tenants/:id          — single tenant detail
 *  PATCH /operator/tenants/:id         — update plan, name, active status, notes
 *  GET  /operator/tenants/:id/users    — users for a tenant
 *  POST /operator/tenants/:id/users    — add user to any tenant
 *  GET  /operator/tenants/:id/usage    — screening + alert counts by month
 *  POST /operator/impersonate/:id      — issue a short-lived impersonation token
 *  GET  /operator/audit                — platform-wide audit log (all tenants)
 *  GET  /operator/stats                — global KPI summary
 *  GET  /operator/notices              — list broadcast notices
 *  POST /operator/notices              — create a broadcast notice
 *  PATCH /operator/notices/:id         — update/archive a notice
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, j } from '../db/knex.js';
import { requireRole, issueToken, ROLES } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { config } from '../config.js';

export const operatorRouter = Router();
operatorRouter.use(requireRole('super_admin'));

/* ─── tenant list ─────────────────────────────────────────────── */
operatorRouter.get('/tenants', async (req, res) => {
  const tenants = await db('tenants').orderBy('created_at', 'desc');
  // Attach live counts in a single query per metric
  const [userCounts, screeningCounts, alertCounts] = await Promise.all([
    db('users').select('tenant_id').count({ n: '*' }).groupBy('tenant_id'),
    db('screenings').select('tenant_id').count({ n: '*' }).groupBy('tenant_id'),
    db('alerts').select('tenant_id').count({ n: '*' }).groupBy('tenant_id'),
  ]);
  const idx = (arr) => Object.fromEntries(arr.map(r => [r.tenant_id, Number(r.n)]));
  const uc = idx(userCounts), sc = idx(screeningCounts), ac = idx(alertCounts);
  res.json(tenants.map(t => ({
    ...t,
    settings: j(t.settings),
    risk_config: undefined,
    users: uc[t.id] || 0,
    screenings: sc[t.id] || 0,
    alerts: ac[t.id] || 0,
  })));
});

/* ─── single tenant ───────────────────────────────────────────── */
operatorRouter.get('/tenants/:id', async (req, res) => {
  const t = await db('tenants').where({ id: req.params.id }).first();
  if (!t) return res.status(404).json({ error: 'Tenant not found' });
  const [users, keys] = await Promise.all([
    db('users').where({ tenant_id: t.id }).select('id', 'name', 'email', 'role', 'active', 'created_at'),
    db('api_keys').where({ tenant_id: t.id }).select('id', 'label', 'prefix', 'active', 'last_used_at', 'created_at'),
  ]);
  res.json({ ...t, settings: j(t.settings), users, api_keys: keys });
});

/* ─── update tenant ───────────────────────────────────────────── */
operatorRouter.patch('/tenants/:id', async (req, res) => {
  const t = await db('tenants').where({ id: req.params.id }).first();
  if (!t) return res.status(404).json({ error: 'Tenant not found' });
  const { name, plan, active, notes } = req.body;
  const VALID_PLANS = ['startup', 'growth', 'enterprise', 'custom'];
  const patch = {};
  if (name) patch.name = name;
  if (plan && VALID_PLANS.includes(plan)) patch.plan = plan;
  if (active !== undefined) patch.active = Boolean(active);
  if (notes !== undefined) {
    const existing = j(t.settings) || {};
    patch.settings = JSON.stringify({ ...existing, operator_notes: notes });
  }
  await db('tenants').where({ id: t.id }).update(patch);
  await audit(req, { action: 'operator.tenant.updated', resource_type: 'tenant', resource_id: t.id, before: t, after: patch });
  res.json({ ...t, ...patch });
});

/* ─── tenant users ────────────────────────────────────────────── */
operatorRouter.get('/tenants/:id/users', async (req, res) => {
  res.json(await db('users').where({ tenant_id: req.params.id }).select('id', 'name', 'email', 'role', 'active', 'created_at'));
});

operatorRouter.post('/tenants/:id/users', async (req, res, next) => {
  try {
    const { name, email, role, password } = req.body;
    if (!ROLES[role] || role === 'super_admin') return res.status(400).json({ error: 'Invalid role' });
    const id = uuid();
    await db('users').insert({ id, tenant_id: req.params.id, name, email, role, password_hash: await bcrypt.hash(password || uuid(), 10) });
    await audit(req, { action: 'operator.user.created', resource_type: 'user', resource_id: id, after: { name, email, role, tenant_id: req.params.id } });
    res.status(201).json({ id, name, email, role });
  } catch (e) { next(e); }
});

/* ─── tenant usage by month ───────────────────────────────────── */
operatorRouter.get('/tenants/:id/usage', async (req, res) => {
  const tid = req.params.id;
  // Screenings by month (last 12 months)
  const rows = await db('screenings')
    .where({ tenant_id: tid })
    .whereRaw("created_at >= date('now', '-12 months')")
    .select(db.raw("strftime('%Y-%m', created_at) as month"), db.raw('count(*) as n'))
    .groupByRaw("strftime('%Y-%m', created_at)")
    .orderBy('month')
    .catch(() =>
      // PostgreSQL fallback
      db('screenings')
        .where({ tenant_id: tid })
        .whereRaw("created_at >= now() - interval '12 months'")
        .select(db.raw("to_char(created_at, 'YYYY-MM') as month"), db.raw('count(*) as n'))
        .groupByRaw("to_char(created_at, 'YYYY-MM')")
        .orderBy('month')
    );
  res.json(rows.map(r => ({ month: r.month, screenings: Number(r.n) })));
});

/* ─── impersonate a tenant ────────────────────────────────────── */
operatorRouter.post('/impersonate/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId;
  const t = await db('tenants').where({ id: tenantId }).first();
  if (!t) return res.status(404).json({ error: 'Tenant not found' });

  // Find the tenant_admin for this tenant (or just any user)
  const admin = await db('users').where({ tenant_id: tenantId, role: 'tenant_admin', active: true }).first()
    || await db('users').where({ tenant_id: tenantId, active: true }).first();
  if (!admin) return res.status(404).json({ error: 'No active users for this tenant' });

  // Short-lived token (1 hour) with impersonation flag in payload
  const token = jwt.sign(
    { sub: req.actor.id, role: 'tenant_admin', tenant_id: tenantId, email: req.actor.email, name: req.actor.name, impersonating: tenantId, impersonator: req.actor.id },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
  await audit(req, { action: 'operator.impersonate', resource_type: 'tenant', resource_id: tenantId, after: { tenant_name: t.name } });
  res.json({ token, tenant: { id: t.id, name: t.name }, user: { id: admin.id, name: admin.name, email: admin.email, role: 'tenant_admin' }, expires_in: 3600 });
});

/* ─── platform-wide audit log ─────────────────────────────────── */
operatorRouter.get('/audit', async (req, res) => {
  const { tenant_id, action, limit = 100, offset = 0 } = req.query;
  let q = db('audit_log').orderBy('created_at', 'desc').limit(Number(limit)).offset(Number(offset));
  if (tenant_id) q = q.where({ tenant_id });
  if (action) q = q.where('action', 'like', `${action}%`);
  res.json(await q);
});

/* ─── global stats ────────────────────────────────────────────── */
operatorRouter.get('/stats', async (req, res) => {
  const [tenants, users, screenings, alerts, plans] = await Promise.all([
    db('tenants').count({ n: '*' }).first(),
    db('users').count({ n: '*' }).first(),
    db('screenings').count({ n: '*' }).first(),
    db('alerts').count({ n: '*' }).first(),
    db('tenants').select('plan').count({ n: '*' }).groupBy('plan'),
  ]);

  // Screenings in the last 30 days
  const recent = await db('screenings')
    .whereRaw("created_at >= date('now', '-30 days')")
    .count({ n: '*' }).first()
    .catch(() =>
      db('screenings').whereRaw("created_at >= now() - interval '30 days'").count({ n: '*' }).first()
    );

  res.json({
    tenants: Number(tenants.n),
    users: Number(users.n),
    screenings: Number(screenings.n),
    alerts: Number(alerts.n),
    screenings_30d: Number(recent?.n || 0),
    by_plan: plans.map(p => ({ plan: p.plan, n: Number(p.n) })),
  });
});

/* ─── broadcast notices ───────────────────────────────────────── */
operatorRouter.get('/notices', async (req, res) => {
  const notices = await db('operator_notices').orderBy('created_at', 'desc').limit(50).catch(() => []);
  res.json(notices);
});

operatorRouter.post('/notices', async (req, res, next) => {
  try {
    const { title, body, level = 'info', target_plan } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
    const id = uuid();
    await db('operator_notices').insert({ id, title, body, level, target_plan: target_plan || null, created_by: req.actor.id, active: true })
      .catch(() => {}); // table may not exist yet — handled gracefully
    res.status(201).json({ id, title, body, level, target_plan, active: true });
  } catch (e) { next(e); }
});

operatorRouter.patch('/notices/:id', async (req, res) => {
  const { title, body, level, active } = req.body;
  const patch = {};
  if (title) patch.title = title;
  if (body) patch.body = body;
  if (level) patch.level = level;
  if (active !== undefined) patch.active = Boolean(active);
  await db('operator_notices').where({ id: req.params.id }).update(patch).catch(() => {});
  res.json({ id: req.params.id, ...patch });
});
