import { Router } from 'express';
import { db, j } from '../db/knex.js';
export const dashboardsRouter = Router();
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString();

// Executive overview
dashboardsRouter.get('/overview', async (req, res) => {
  const t = req.actor.tenant_id;
  const [customers, byRisk, alertsOpen, alertsBySev, txToday, txStatus, screenings, cases, sla] = await Promise.all([
    db('customers').where({ tenant_id: t }).count({ n: '*' }).first(),
    db('customers').where({ tenant_id: t }).select('risk_level').count({ n: '*' }).groupBy('risk_level'),
    db('alerts').where({ tenant_id: t }).whereIn('status', ['open', 'investigating', 'escalated']).count({ n: '*' }).first(),
    db('alerts').where({ tenant_id: t }).whereIn('status', ['open', 'investigating', 'escalated']).select('severity').count({ n: '*' }).groupBy('severity'),
    db('transactions').where({ tenant_id: t }).andWhere('occurred_at', '>=', daysAgo(1)).count({ n: '*' }).sum({ vol: 'amount_base' }).first(),
    db('transactions').where({ tenant_id: t }).andWhere('occurred_at', '>=', daysAgo(30)).select('status').count({ n: '*' }).groupBy('status'),
    db('screenings').where({ tenant_id: t }).andWhere('created_at', '>=', daysAgo(30)).select('outcome').count({ n: '*' }).groupBy('outcome'),
    db('cases').where({ tenant_id: t }).select('status').count({ n: '*' }).groupBy('status'),
    db('alerts').where({ tenant_id: t }).whereIn('status', ['open', 'investigating', 'escalated']).andWhere('sla_due_at', '<', new Date().toISOString()).count({ n: '*' }).first(),
  ]);
  res.json({ customers: Number(customers.n), customers_by_risk: byRisk, open_alerts: Number(alertsOpen.n), alerts_by_severity: alertsBySev, sla_breached: Number(sla.n),
    transactions_24h: { count: Number(txToday.n), volume_base: Number(txToday.vol || 0) }, transactions_30d_by_status: txStatus, screenings_30d_by_outcome: screenings, cases_by_status: cases });
});
// Alert trend + rule effectiveness
dashboardsRouter.get('/monitoring', async (req, res) => {
  const t = req.actor.tenant_id;
  const alerts = await db('alerts').where({ tenant_id: t }).andWhere('created_at', '>=', daysAgo(30)).select('created_at', 'severity', 'status', 'rule_code', 'alert_type');
  const byDay = {}; const byRule = {};
  for (const a of alerts) {
    const d = new Date(a.created_at).toISOString().slice(0, 10); byDay[d] = byDay[d] || { date: d, total: 0, critical: 0, high: 0, medium: 0, low: 0 }; byDay[d].total++; byDay[d][a.severity] = (byDay[d][a.severity] || 0) + 1;
    if (a.rule_code) { byRule[a.rule_code] = byRule[a.rule_code] || { rule_code: a.rule_code, alerts: 0, true_positive: 0, false_positive: 0 }; byRule[a.rule_code].alerts++;
      if (a.status === 'closed_true_positive' || a.status === 'str_filed') byRule[a.rule_code].true_positive++; if (a.status === 'closed_false_positive') byRule[a.rule_code].false_positive++; }
  }
  const rules = Object.values(byRule).map(r => ({ ...r, precision: r.true_positive + r.false_positive ? Math.round(100 * r.true_positive / (r.true_positive + r.false_positive)) : null })).sort((a, b) => b.alerts - a.alerts);
  const latency = await db('transactions').where({ tenant_id: t }).andWhere('occurred_at', '>=', daysAgo(7)).avg({ avg: 'latency_ms' }).max({ max: 'latency_ms' }).first();
  res.json({ alerts_by_day: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)), rule_effectiveness: rules, latency_ms: { avg: Math.round(Number(latency.avg || 0)), max: Number(latency.max || 0) } });
});
// Analyst workload queue
dashboardsRouter.get('/workload', async (req, res) => {
  const t = req.actor.tenant_id;
  const [byAssignee, oldest, reviewsDue] = await Promise.all([
    db('alerts').where({ tenant_id: t }).whereIn('status', ['open', 'investigating', 'escalated']).select('assigned_to').count({ n: '*' }).groupBy('assigned_to'),
    db('alerts').where({ tenant_id: t }).whereIn('status', ['open', 'investigating', 'escalated']).orderBy('created_at', 'asc').limit(10),
    db('customers').where({ tenant_id: t }).andWhere('next_review_at', '<=', daysAgo(-30)).count({ n: '*' }).first(),
  ]);
  const users = await db('users').where({ tenant_id: t }).select('id', 'name', 'role');
  res.json({ by_assignee: byAssignee.map(b => ({ ...b, user: users.find(u => u.id === b.assigned_to) || null })), oldest_open: oldest.map(a => ({ ...a, evidence: undefined })), kyc_reviews_due_30d: Number(reviewsDue.n) });
});
// Coverage: what lists are protecting this tenant
dashboardsRouter.get('/coverage', async (req, res) => {
  const enabled = await db('list_sources').where({ enabled: true });
  const stale = enabled.filter(s => !s.last_synced_at || Date.now() - new Date(s.last_synced_at) > s.refresh_hours * 2 * 3600e3);
  const byRegion = {}; for (const s of enabled) { byRegion[s.region] = byRegion[s.region] || { region: s.region, sources: 0, entries: 0 }; byRegion[s.region].sources++; byRegion[s.region].entries += s.entry_count || 0; }
  res.json({ enabled: enabled.length, entries: enabled.reduce((a, s) => a + (s.entry_count || 0), 0), stale: stale.map(s => ({ code: s.code, name: s.name, last_synced_at: s.last_synced_at })), by_region: Object.values(byRegion) });
});
