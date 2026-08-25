import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db, j } from '../db/knex.js';
import { evaluateAll } from '../engine/rules.js';
import { toCanonical, MAPPERS } from '../adapters/corebanking.js';
import { runScreening } from './screening.js';
import { emitAlert } from './alerts.js';
import { countryRiskMap } from './customers.js';
import { requireRole } from '../middleware/auth.js';
import { normalizeName } from '../engine/normalize.js';

export const transactionsRouter = Router();
const Tx = z.object({
  external_ref: z.string().optional(), customer_id: z.string().optional(), customer_ref: z.string().optional(), account_id: z.string().optional(),
  direction: z.enum(['credit', 'debit']), tx_type: z.enum(['cash', 'wire', 'card', 'transfer', 'crypto', 'cheque', 'mobile_money']).default('transfer'),
  amount: z.number().positive(), currency: z.string().default('USD'), counterparty_name: z.string().optional(), counterparty_account: z.string().optional(), counterparty_bank: z.string().optional(),
  counterparty_country: z.string().optional(), origin_country: z.string().optional(), destination_country: z.string().optional(), channel: z.string().optional(), device_id: z.string().optional(),
  ip_address: z.string().optional(), narrative: z.string().optional(), occurred_at: z.string().optional(), screen_counterparty: z.boolean().default(true), dry_run: z.boolean().default(false),
});
// FX to base (USD). Replace with a live rates provider in production (tenant.settings.fx_provider).
const FX = { USD: 1, EUR: 1.08, GBP: 1.27, NGN: 1 / 1550, KES: 1 / 129, GHS: 1 / 15.5, ZAR: 1 / 18.2, AED: 1 / 3.67, SAR: 1 / 3.75, INR: 1 / 84, CNY: 1 / 7.2, JPY: 1 / 150, CAD: 1 / 1.37, AUD: 1 / 1.52, BRL: 1 / 5.6, EGP: 1 / 49 };
export const toBase = (amt, ccy) => Math.round(Number(amt) * (FX[ccy?.toUpperCase()] ?? 1) * 100) / 100;

export async function monitorTransaction(tenant_id, input, actorId) {
  const started = Date.now();
  let customer = null;
  if (input.customer_id) customer = await db('customers').where({ id: input.customer_id, tenant_id }).first();
  else if (input.customer_ref) customer = await db('customers').where({ external_ref: input.customer_ref, tenant_id }).first();
  const occurred_at = input.occurred_at || new Date().toISOString();
  const tx = { id: uuid(), tenant_id, ...input, customer_id: customer?.id || null, amount_base: toBase(input.amount, input.currency), occurred_at };
  delete tx.customer_ref; delete tx.screen_counterparty; delete tx.dry_run;

  const tenant = await db('tenants').where({ id: tenant_id }).first();
  const homeCountry = (j(tenant?.settings) || {}).jurisdiction || 'US';
  const [rules, countryRisk, history] = await Promise.all([
    db('rules').where({ tenant_id, enabled: true }),
    countryRiskMap(),
    customer ? db('transactions').where({ customer_id: customer.id }).andWhere('occurred_at', '>=', new Date(+new Date(occurred_at) - 90 * 86400e3).toISOString()).orderBy('occurred_at', 'desc').limit(2000) : [],
  ]);
  const parsedRules = rules.map(r => ({ ...r, definition: j(r.definition) }));
  const ev = evaluateAll(parsedRules, tx, { customer: customer ? { ...customer, is_pep: !!customer.is_pep } : {}, history, countryRisk, homeCountry });

  // Real-time counterparty sanctions screening (payment screening)
  let cpScreening = null;
  if (input.screen_counterparty && input.counterparty_name) {
    cpScreening = await runScreening(tenant_id, { name: input.counterparty_name, country: input.counterparty_country, context: 'transaction', list_types: ['Sanction'], threshold: 85, max_results: 3 }, actorId);
    if (cpScreening.outcome !== 'clear') {
      ev.hits.push({ rule_code: 'SANCTIONS-COUNTERPARTY', rule_name: 'Counterparty sanctions match', severity: 'critical', action: 'block', score: 100,
        explanation: `${input.counterparty_name} ↔ ${cpScreening.matches[0].matched_name} (${cpScreening.top_score}%) on ${cpScreening.matches[0].list.name}` });
      ev.status = 'blocked'; ev.score = 100;
    }
  }
  tx.status = ev.status; tx.rule_hits = JSON.stringify(ev.hits); tx.risk_score = ev.score; tx.latency_ms = Date.now() - started;
  if (!input.dry_run) {
    await db('transactions').insert({ ...tx, raw: JSON.stringify(input) });
    if (ev.hits.length) {
      const worst = ev.hits.reduce((w, h) => ({ critical: 4, high: 3, medium: 2, low: 1 }[h.severity] > ({ critical: 4, high: 3, medium: 2, low: 1 }[w.severity] || 0) ? h : w), ev.hits[0]);
      await emitAlert(tenant_id, { alert_type: ev.hits.some(h => h.rule_code === 'SANCTIONS-COUNTERPARTY') ? 'screening' : (worst.severity && parsedRules.find(r => r.code === worst.rule_code)?.category === 'fraud' ? 'fraud' : 'transaction'),
        severity: worst.severity, customer_id: tx.customer_id, transaction_id: tx.id, rule_code: worst.rule_code, screening_id: cpScreening?.id || null,
        title: `${worst.rule_name}: ${Number(tx.amount).toLocaleString()} ${tx.currency} (${tx.status})`, summary: ev.hits.map(h => h.explanation || h.error).join(' | '), evidence: { hits: ev.hits, transaction: { ...tx, rule_hits: ev.hits } } });
    }
  }
  return { transaction_id: tx.id, status: ev.status, risk_score: ev.score, decision: ev.status === 'blocked' ? 'REJECT' : ev.status === 'held' ? 'REVIEW' : 'ACCEPT',
    hits: ev.hits, counterparty_screening: cpScreening && { outcome: cpScreening.outcome, top_score: cpScreening.top_score }, latency_ms: tx.latency_ms, customer_id: tx.customer_id, dry_run: !!input.dry_run };
}

// Real-time endpoint (sub-100ms target). Core banking calls this synchronously before posting.
transactionsRouter.post('/', requireRole('tenant_admin', 'compliance_officer', 'analyst', 'api_client'), async (req, res, next) => {
  try { res.json(await monitorTransaction(req.actor.tenant_id, Tx.parse(req.body), req.actor.id)); } catch (e) { next(e); }
});
// Ingest raw core-banking payload
transactionsRouter.post('/ingest/:system', requireRole('tenant_admin', 'api_client'), async (req, res, next) => {
  try {
    const canonical = toCanonical(req.params.system, req.body);
    res.json({ mapped: canonical, result: await monitorTransaction(req.actor.tenant_id, Tx.parse({ ...canonical, amount: Number(canonical.amount) }), req.actor.id) });
  } catch (e) { next(e); }
});
transactionsRouter.get('/systems', (req, res) => res.json({ supported: Object.keys(MAPPERS) }));
// Batch / end-of-day file
transactionsRouter.post('/batch', requireRole('tenant_admin', 'api_client'), async (req, res, next) => {
  try {
    const items = z.array(Tx).max(5000).parse(req.body.items); const out = { accepted: 0, flagged: 0, held: 0, blocked: 0 };
    for (const it of items) { const r = await monitorTransaction(req.actor.tenant_id, it, req.actor.id); out[r.status === 'cleared' ? 'accepted' : r.status]++; }
    res.json(out);
  } catch (e) { next(e); }
});
transactionsRouter.get('/', async (req, res) => {
  const { status, customer_id, limit = 100 } = req.query;
  const rows = await db('transactions').where({ tenant_id: req.actor.tenant_id }).modify(q => { if (status) q.where({ status }); if (customer_id) q.where({ customer_id }); }).orderBy('occurred_at', 'desc').limit(Number(limit));
  res.json(rows.map(r => ({ ...r, rule_hits: j(r.rule_hits) })));
});
