import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db, j } from '../db/knex.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

export const strRouter = Router();

const StrBody = z.object({
  customer_id: z.string().optional(),
  alert_ids: z.array(z.string()).optional().default([]),
  transaction_ids: z.array(z.string()).optional().default([]),
  report_type: z.enum(['STR', 'CTR']).default('STR'),
  subject_name: z.string().min(1),
  subject_account: z.string().optional(),
  subject_country: z.string().length(2).optional(),
  amount_reported: z.number().positive().optional(),
  currency_reported: z.string().length(3).optional(),
  activity_from_at: z.string().optional(),
  activity_to_at: z.string().optional(),
  grounds_for_suspicion: z.string().min(1),
  nature_of_suspicious_activity: z.string().optional(),
  actions_taken: z.string().optional(),
  filed_with: z.string().optional(),
  regulator_ref: z.string().optional(),
});

// GET /v1/str-reports — list all STRs for this tenant
strRouter.get('/', async (req, res) => {
  const t = req.actor.tenant_id;
  const { status, limit = 100, offset = 0 } = req.query;
  let q = db('str_reports').where({ tenant_id: t }).orderBy('created_at', 'desc').limit(Number(limit)).offset(Number(offset));
  if (status) q = q.where({ status });
  const rows = await q;
  res.json(rows.map(r => ({ ...r, alert_ids: j(r.alert_ids), transaction_ids: j(r.transaction_ids) })));
});

// POST /v1/str-reports — create a new draft STR
strRouter.post('/', requireRole('compliance_officer', 'tenant_admin', 'super_admin'), async (req, res) => {
  const t = req.actor.tenant_id;
  const body = StrBody.parse(req.body);
  const year = new Date().getFullYear();
  const count = await db('str_reports').where({ tenant_id: t }).count({ n: '*' }).first();
  const ref = `${body.report_type}-${year}-${String(Number(count.n) + 1).padStart(4, '0')}`;
  const id = uuid();
  const row = {
    id, tenant_id: t, reference: ref, status: 'draft',
    customer_id: body.customer_id || null,
    alert_ids: JSON.stringify(body.alert_ids),
    transaction_ids: JSON.stringify(body.transaction_ids),
    report_type: body.report_type,
    subject_name: body.subject_name,
    subject_account: body.subject_account || null,
    subject_country: body.subject_country || null,
    amount_reported: body.amount_reported || null,
    currency_reported: body.currency_reported || null,
    activity_from_at: body.activity_from_at || null,
    activity_to_at: body.activity_to_at || null,
    grounds_for_suspicion: body.grounds_for_suspicion,
    nature_of_suspicious_activity: body.nature_of_suspicious_activity || null,
    actions_taken: body.actions_taken || null,
    filed_with: body.filed_with || null,
    regulator_ref: body.regulator_ref || null,
    created_by: req.actor.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db('str_reports').insert(row);
  await audit(req, { action: 'str.created', resource_type: 'str_report', resource_id: id, after: { reference: ref, subject_name: body.subject_name } });
  res.status(201).json({ ...row, alert_ids: body.alert_ids, transaction_ids: body.transaction_ids });
});

// GET /v1/str-reports/:id — get one STR with enriched customer/alerts
strRouter.get('/:id', async (req, res) => {
  const t = req.actor.tenant_id;
  const row = await db('str_reports').where({ id: req.params.id, tenant_id: t }).first();
  if (!row) return res.status(404).json({ error: 'Not found' });
  const alert_ids = j(row.alert_ids) || [];
  const transaction_ids = j(row.transaction_ids) || [];
  const [customer, alerts, transactions] = await Promise.all([
    row.customer_id ? db('customers').where({ id: row.customer_id, tenant_id: t }).first() : Promise.resolve(null),
    alert_ids.length ? db('alerts').whereIn('id', alert_ids).where({ tenant_id: t }) : Promise.resolve([]),
    transaction_ids.length ? db('transactions').whereIn('id', transaction_ids).where({ tenant_id: t }) : Promise.resolve([]),
  ]);
  res.json({ ...row, alert_ids, transaction_ids, customer, alerts, transactions });
});

// PATCH /v1/str-reports/:id — update draft or mark as filed
strRouter.patch('/:id', requireRole('compliance_officer', 'tenant_admin', 'super_admin'), async (req, res) => {
  const t = req.actor.tenant_id;
  const row = await db('str_reports').where({ id: req.params.id, tenant_id: t }).first();
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status === 'filed') return res.status(400).json({ error: 'A filed STR cannot be edited.' });

  const allowed = ['subject_name', 'subject_account', 'subject_country', 'amount_reported', 'currency_reported',
    'activity_from_at', 'activity_to_at', 'grounds_for_suspicion', 'nature_of_suspicious_activity',
    'actions_taken', 'filed_with', 'regulator_ref', 'status'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

  if (updates.status === 'filed') {
    if (!row.grounds_for_suspicion) return res.status(400).json({ error: 'grounds_for_suspicion is required before filing.' });
    updates.filed_at = new Date().toISOString();
    updates.filed_by = req.actor.id;
  }
  updates.updated_at = new Date().toISOString();
  if (req.body.alert_ids !== undefined) updates.alert_ids = JSON.stringify(req.body.alert_ids);
  if (req.body.transaction_ids !== undefined) updates.transaction_ids = JSON.stringify(req.body.transaction_ids);

  await db('str_reports').where({ id: req.params.id }).update(updates);
  await audit(req, { action: 'str.updated', resource_type: 'str_report', resource_id: req.params.id, before: row, after: updates });
  const updated = await db('str_reports').where({ id: req.params.id }).first();
  res.json({ ...updated, alert_ids: j(updated.alert_ids), transaction_ids: j(updated.transaction_ids) });
});

// DELETE /v1/str-reports/:id — only drafts can be deleted
strRouter.delete('/:id', requireRole('tenant_admin', 'super_admin'), async (req, res) => {
  const t = req.actor.tenant_id;
  const row = await db('str_reports').where({ id: req.params.id, tenant_id: t }).first();
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status === 'filed') return res.status(400).json({ error: 'Cannot delete a filed STR.' });
  await db('str_reports').where({ id: req.params.id }).delete();
  await audit(req, { action: 'str.deleted', resource_type: 'str_report', resource_id: req.params.id, before: row });
  res.json({ ok: true });
});
