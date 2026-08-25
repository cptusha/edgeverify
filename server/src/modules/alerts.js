import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, j } from '../db/knex.js';
import { audit } from '../middleware/audit.js';
import { requireRole } from '../middleware/auth.js';
import { dispatchWebhook } from './webhooks.js';

const SLA_HOURS = { critical: 4, high: 24, medium: 72, low: 168 };

export async function emitAlert(tenant_id, a) {
  const row = { id: uuid(), tenant_id, status: 'open', sla_due_at: new Date(Date.now() + (SLA_HOURS[a.severity] || 72) * 3600e3).toISOString(), ...a, evidence: JSON.stringify(a.evidence || {}) };
  await db('alerts').insert(row);
  dispatchWebhook(tenant_id, 'alert.created', { ...row, evidence: a.evidence }).catch(() => {});
  return row;
}

export const alertsRouter = Router();
alertsRouter.get('/', async (req, res) => {
  const { status, severity, alert_type, customer_id, assigned_to, limit = 100 } = req.query;
  const rows = await db('alerts').where({ tenant_id: req.actor.tenant_id })
    .modify(q => { if (status) q.whereIn('status', String(status).split(',')); if (severity) q.where({ severity }); if (alert_type) q.where({ alert_type }); if (customer_id) q.where({ customer_id }); if (assigned_to) q.where({ assigned_to }); })
    .orderBy('created_at', 'desc').limit(Number(limit));
  res.json(rows.map(r => ({ ...r, evidence: j(r.evidence) })));
});
alertsRouter.get('/:id', async (req, res) => {
  const r = await db('alerts').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first();
  if (!r) return res.status(404).json({ error: 'Not found' });
  const customer = r.customer_id ? await db('customers').where({ id: r.customer_id }).first() : null;
  const transaction = r.transaction_id ? await db('transactions').where({ id: r.transaction_id }).first() : null;
  res.json({ ...r, evidence: j(r.evidence), customer, transaction: transaction ? { ...transaction, rule_hits: j(transaction.rule_hits) } : null });
});

// Workflow transitions with role gates: analysts can investigate/escalate; only compliance officers close true positives / file STRs.
const TRANSITIONS = {
  open: ['investigating', 'closed_false_positive'], investigating: ['escalated', 'closed_false_positive', 'closed_true_positive'],
  escalated: ['closed_false_positive', 'closed_true_positive', 'str_filed'], closed_true_positive: ['str_filed'],
};
const OFFICER_ONLY = new Set(['closed_true_positive', 'str_filed']);
alertsRouter.post('/:id/transition', requireRole('tenant_admin', 'compliance_officer', 'analyst'), async (req, res, next) => {
  try {
    const { status, note, assigned_to } = req.body;
    const a = await db('alerts').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first();
    if (!a) return res.status(404).json({ error: 'Not found' });
    if (status) {
      if (!(TRANSITIONS[a.status] || []).includes(status)) return res.status(400).json({ error: `Cannot move ${a.status} → ${status}` });
      if (OFFICER_ONLY.has(status) && !['compliance_officer', 'tenant_admin', 'super_admin'].includes(req.actor.role)) return res.status(403).json({ error: 'Only a compliance officer can confirm a true positive or file an STR' });
    }
    const patch = { updated_at: db.fn.now() };
    if (status) { patch.status = status; if (status.startsWith('closed') || status === 'str_filed') patch.resolved_at = db.fn.now(); }
    if (note) patch.resolution_note = note; if (assigned_to !== undefined) patch.assigned_to = assigned_to;
    await db('alerts').where({ id: a.id }).update(patch);
    req.skipAutoAudit = true;
    await audit(req, { action: 'alert.transition', resource_type: 'alert', resource_id: a.id, before: { status: a.status, assigned_to: a.assigned_to }, after: { status: status || a.status, assigned_to, note } });
    if (status === 'closed_true_positive' && a.customer_id) await db('customers').where({ id: a.customer_id }).update({ monitoring_status: 'enhanced' });
    res.json({ ...a, ...patch });
  } catch (e) { next(e); }
});

// Cases group alerts for investigation
export const casesRouter = Router();
casesRouter.get('/', async (req, res) => { const rows = await db('cases').where({ tenant_id: req.actor.tenant_id }).orderBy('created_at', 'desc'); res.json(rows.map(r => ({ ...r, alert_ids: j(r.alert_ids), timeline: j(r.timeline) }))); });
casesRouter.post('/', requireRole('tenant_admin', 'compliance_officer', 'analyst'), async (req, res, next) => {
  try {
    const { title, priority = 'medium', customer_id, alert_ids = [] } = req.body;
    const count = await db('cases').where({ tenant_id: req.actor.tenant_id }).count({ c: '*' }).first();
    const row = { id: uuid(), tenant_id: req.actor.tenant_id, reference: `CASE-${new Date().getFullYear()}-${String(Number(count.c) + 1).padStart(5, '0')}`, title, priority, customer_id, owner_id: req.actor.id,
      alert_ids: JSON.stringify(alert_ids), timeline: JSON.stringify([{ at: new Date().toISOString(), by: req.actor.id, event: 'Case opened' }]) };
    await db('cases').insert(row);
    if (alert_ids.length) await db('alerts').whereIn('id', alert_ids).update({ case_id: row.id, status: 'investigating' });
    res.status(201).json(row);
  } catch (e) { next(e); }
});
casesRouter.post('/:id/note', requireRole('tenant_admin', 'compliance_officer', 'analyst'), async (req, res) => {
  const c = await db('cases').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first();
  if (!c) return res.status(404).json({ error: 'Not found' });
  const tl = j(c.timeline) || []; tl.push({ at: new Date().toISOString(), by: req.actor.id, event: req.body.note });
  const patch = { timeline: JSON.stringify(tl) }; if (req.body.status) patch.status = req.body.status; if (req.body.outcome) patch.outcome = req.body.outcome;
  await db('cases').where({ id: c.id }).update(patch); res.json({ ...c, ...patch, timeline: tl });
});
