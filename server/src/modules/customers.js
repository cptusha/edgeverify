import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db, j } from '../db/knex.js';
import { normalizeName } from '../engine/normalize.js';
import { assessRisk, DEFAULT_RISK_CONFIG } from '../engine/risk.js';
import { runScreening } from './screening.js';
import { emitAlert } from './alerts.js';
import { audit } from '../middleware/audit.js';
import { requireRole } from '../middleware/auth.js';

export const customersRouter = Router();
const Body = z.object({
  external_ref: z.string().optional(), customer_type: z.enum(['individual', 'business']).default('individual'), full_name: z.string().min(2),
  dob: z.string().optional(), nationality: z.string().length(2).optional(), residence_country: z.string().length(2).optional(), id_type: z.string().optional(), id_number: z.string().optional(),
  occupation: z.string().optional(), industry: z.string().optional(), products: z.array(z.string()).optional(), channel: z.string().optional(), expected_monthly_turnover: z.number().optional(),
  ubos: z.array(z.object({ name: z.string(), share: z.number().optional(), is_pep: z.boolean().optional(), nationality: z.string().optional() })).optional(),
  is_pep: z.boolean().optional(), is_rca: z.boolean().optional(), is_sip: z.boolean().optional(), adverse_media: z.boolean().optional(),
  screen: z.boolean().default(true),
});

export async function countryRiskMap() { const rows = await db('country_risk'); return Object.fromEntries(rows.map(r => [r.iso2, r])); }
export async function tenantRiskConfig(tenant_id) { const t = await db('tenants').where({ id: tenant_id }).first(); return { ...DEFAULT_RISK_CONFIG, ...(j(t?.risk_config) || {}) }; }

// Onboarding: create → screen (sanctions/PEP/watchlists) → auto-flag PEP → score risk → set review cycle.
export async function onboardOrRescore(tenant_id, customer, actorId, { screen = true } = {}) {
  let screening = null, sanctionsHit = null;
  if (screen) {
    screening = await runScreening(tenant_id, { name: customer.full_name, dob: customer.dob, nationality: customer.nationality, entityType: customer.customer_type === 'business' ? 'organisation' : 'person', customer_id: customer.id, context: 'onboarding' }, actorId);
    const top = screening.matches[0];
    if (top) {
      if (top.list.list_type === 'Sanction') sanctionsHit = screening.outcome === 'confirmed_match' ? 'confirmed' : 'potential';
      if (top.list.list_type === 'PEP' && top.score >= 90) customer.is_pep = true;
    }
    // UBO screening for businesses
    for (const u of (customer.ubos || [])) {
      const s = await runScreening(tenant_id, { name: u.name, nationality: u.nationality, entityType: 'person', customer_id: customer.id, context: 'onboarding' }, actorId);
      if (s.matches[0]?.list.list_type === 'Sanction') sanctionsHit = sanctionsHit || 'potential';
      if (s.matches[0]?.list.list_type === 'PEP' && s.matches[0].score >= 90) u.is_pep = true;
    }
  }
  const cfg = await tenantRiskConfig(tenant_id);
  const risk = assessRisk(customer, { countryRisk: await countryRiskMap(), sanctionsHit }, cfg);
  await db('customers').where({ id: customer.id }).update({ risk_score: risk.score, risk_level: risk.level, risk_factors: JSON.stringify(risk.factors), next_review_at: risk.next_review_at,
    is_pep: !!customer.is_pep, ubos: JSON.stringify(customer.ubos || []), kyc_status: risk.level === 'prohibited' ? 'rejected' : risk.edd_required ? 'edd_required' : 'approved', updated_at: db.fn.now() });
  if (risk.edd_required) await emitAlert(tenant_id, { alert_type: 'kyc', severity: risk.level === 'prohibited' ? 'critical' : 'high', customer_id: customer.id,
    title: `${risk.level.toUpperCase()} risk customer: ${customer.full_name} (${risk.score}/100)`, summary: 'Enhanced due diligence required before/while servicing this customer.', evidence: { factors: risk.factors } });
  return { risk, screening };
}

customersRouter.post('/', requireRole('tenant_admin', 'compliance_officer', 'analyst', 'api_client'), async (req, res, next) => {
  try {
    const b = Body.parse(req.body); const { screen, ...data } = b;
    const row = { id: uuid(), tenant_id: req.actor.tenant_id, ...data, name_normalized: normalizeName(b.full_name), products: JSON.stringify(b.products || []), ubos: JSON.stringify(b.ubos || []) };
    await db('customers').insert(row);
    const { risk, screening } = await onboardOrRescore(req.actor.tenant_id, { ...row, products: b.products || [], ubos: b.ubos || [] }, req.actor.id, { screen });
    req.skipAutoAudit = true;
    await audit(req, { action: 'customer.onboard', resource_type: 'customer', resource_id: row.id, after: { name: b.full_name, risk_level: risk.level, risk_score: risk.score, screening_outcome: screening?.outcome } });
    res.status(201).json({ id: row.id, ...b, risk, screening: screening && { id: screening.id, outcome: screening.outcome, top_score: screening.top_score, matches: screening.matches.slice(0, 5) } });
  } catch (e) { next(e); }
});

customersRouter.get('/', async (req, res) => {
  const { q, risk_level, kyc_status, limit = 100 } = req.query;
  const rows = await db('customers').where({ tenant_id: req.actor.tenant_id })
    .modify(x => { if (q) x.where('name_normalized', 'like', `%${normalizeName(String(q))}%`); if (risk_level) x.where({ risk_level }); if (kyc_status) x.where({ kyc_status }); })
    .orderBy('risk_score', 'desc').limit(Number(limit));
  res.json(rows.map(r => ({ ...r, products: j(r.products), ubos: j(r.ubos), risk_factors: j(r.risk_factors) })));
});

customersRouter.get('/:id', async (req, res) => {
  const c = await db('customers').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first();
  if (!c) return res.status(404).json({ error: 'Not found' });
  const [screenings, alerts, txns] = await Promise.all([
    db('screenings').where({ customer_id: c.id }).orderBy('created_at', 'desc').limit(20),
    db('alerts').where({ customer_id: c.id }).orderBy('created_at', 'desc').limit(50),
    db('transactions').where({ customer_id: c.id }).orderBy('occurred_at', 'desc').limit(100),
  ]);
  res.json({ ...c, products: j(c.products), ubos: j(c.ubos), risk_factors: j(c.risk_factors),
    screenings: screenings.map(s => ({ ...s, matches: j(s.matches) })), alerts, transactions: txns.map(t => ({ ...t, rule_hits: j(t.rule_hits) })) });
});

customersRouter.patch('/:id', requireRole('tenant_admin', 'compliance_officer', 'analyst'), async (req, res, next) => {
  try {
    const c = await db('customers').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first();
    if (!c) return res.status(404).json({ error: 'Not found' });
    const b = Body.partial().parse(req.body); const { screen, ...data } = b;
    const patch = { ...data }; if (b.full_name) patch.name_normalized = normalizeName(b.full_name);
    if (b.products) patch.products = JSON.stringify(b.products); if (b.ubos) patch.ubos = JSON.stringify(b.ubos);
    await db('customers').where({ id: c.id }).update(patch);
    const merged = { ...c, ...data, products: b.products || j(c.products), ubos: b.ubos || j(c.ubos) };
    const { risk } = await onboardOrRescore(req.actor.tenant_id, merged, req.actor.id, { screen: false });
    req.skipAutoAudit = true; await audit(req, { action: 'customer.update', resource_type: 'customer', resource_id: c.id, before: c, after: patch });
    res.json({ ...merged, risk });
  } catch (e) { next(e); }
});

// Daily ongoing monitoring: re-screen everyone (or a cohort) against refreshed lists and re-score.
customersRouter.post('/rescreen', requireRole('tenant_admin', 'compliance_officer', 'api_client'), async (req, res, next) => {
  try {
    const { risk_level, limit = 1000 } = req.body || {};
    const rows = await db('customers').where({ tenant_id: req.actor.tenant_id, monitoring_status: 'active' }).modify(q => { if (risk_level) q.where({ risk_level }); }).limit(limit);
    const summary = { screened: 0, new_matches: 0, risk_changes: 0 };
    for (const c of rows) {
      const cust = { ...c, products: j(c.products), ubos: j(c.ubos) };
      const { risk, screening } = await onboardOrRescore(req.actor.tenant_id, cust, req.actor.id, { screen: true });
      summary.screened++; if (screening?.outcome !== 'clear') summary.new_matches++; if (risk.level !== c.risk_level) summary.risk_changes++;
    }
    req.skipAutoAudit = true; await audit(req, { action: 'monitoring.daily_rescreen', resource_type: 'customer', after: summary });
    res.json(summary);
  } catch (e) { next(e); }
});
