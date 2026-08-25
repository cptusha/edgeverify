import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { db, j } from '../db/knex.js';
import { scoreEntry, candidateFilter } from '../engine/matcher.js';
import { normalizeName, tokens } from '../engine/normalize.js';
import { audit } from '../middleware/audit.js';
import { requireRole } from '../middleware/auth.js';
import { emitAlert } from './alerts.js';

export const screeningRouter = Router();

const ScreenBody = z.object({
  name: z.string().min(2), dob: z.string().optional(), nationality: z.string().optional(), country: z.string().optional(),
  entityType: z.enum(['person', 'organisation', 'vessel', 'aircraft']).optional(), customer_id: z.string().optional(),
  context: z.enum(['onboarding', 'ongoing', 'transaction', 'adhoc']).default('adhoc'),
  threshold: z.number().min(50).max(100).optional(), list_types: z.array(z.string()).optional(), max_results: z.number().max(100).default(25),
});

// Core screening routine — shared by onboarding, ongoing monitoring and transaction screening.
export async function runScreening(tenant_id, input, actorId) {
  const started = Date.now();
  const tenant = await db('tenants').where({ id: tenant_id }).first();
  const settings = j(tenant?.settings) || {};
  const threshold = input.threshold ?? settings.screening_threshold ?? 80;
  const enabled = await db('list_sources').where({ enabled: true }).modify(q => { if (input.list_types?.length) q.whereIn('list_type', input.list_types); }).select('code', 'name', 'list_type', 'country');
  const codes = enabled.map(s => s.code); const byCode = Object.fromEntries(enabled.map(s => [s.code, s]));

  // Candidate prefilter in SQL (token prefixes), then in-memory scoring.
  const tk = tokens(input.name).map(t => t.slice(0, 4)).filter(t => t.length >= 3);
  let q = db('list_entries').whereIn('source_code', codes).whereNull('delisted_on');
  if (tk.length) q = q.where(b => { for (const p of tk) b.orWhere('name_normalized', 'like', `%${p}%`).orWhere('aliases_normalized', 'like', `%${p}%`); });
  const rows = await q.limit(5000);
  const filt = candidateFilter(input.name);
  const matches = [];
  for (const r of rows) {
    const entry = { ...r, aliases: j(r.aliases) || [], dobs: j(r.dobs) || [], nationalities: j(r.nationalities) || [], countries: j(r.countries) || [], phonetic_keys: j(r.phonetic_keys) || [], programs: j(r.programs) || [] };
    if (!filt(entry)) continue;
    const s = scoreEntry(input, entry);
    if (s.score >= threshold) matches.push({ entry_id: r.id, score: s.score, name_score: s.nameScore, matched_name: s.matchedName, reasons: s.reasons,
      list: byCode[r.source_code], entity_type: r.entity_type, primary_name: r.primary_name, programs: entry.programs, dobs: entry.dobs, nationalities: entry.nationalities, pep_tier: r.pep_tier, pep_role: r.pep_role });
  }
  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, input.max_results);
  const topScore = top[0]?.score || 0;
  const outcome = !top.length ? 'clear' : topScore >= 95 ? 'confirmed_match' : 'potential_match';
  const screening = { id: uuid(), tenant_id, customer_id: input.customer_id || null, context: input.context, query_name: input.name, query: JSON.stringify(input),
    match_count: matches.length, top_score: topScore, outcome, matches: JSON.stringify(top), lists_screened: codes.length, duration_ms: Date.now() - started, requested_by: actorId };
  await db('screenings').insert(screening);
  if (input.customer_id) await db('customers').where({ id: input.customer_id, tenant_id }).update({ last_screened_at: db.fn.now() });
  if (outcome !== 'clear') {
    const sev = outcome === 'confirmed_match' ? 'critical' : topScore >= 88 ? 'high' : 'medium';
    await emitAlert(tenant_id, { alert_type: 'screening', severity: sev, customer_id: input.customer_id || null, screening_id: screening.id,
      title: `${top[0].list.list_type} match: ${input.name} ↔ ${top[0].matched_name} (${topScore}%)`,
      summary: `${matches.length} candidate(s) across ${codes.length} lists. Top: ${top[0].list.name}.`, evidence: { top: top.slice(0, 5) } });
  }
  return { ...screening, query: input, matches: top };
}

screeningRouter.post('/', requireRole('tenant_admin', 'compliance_officer', 'analyst', 'api_client'), async (req, res, next) => {
  try {
    const input = ScreenBody.parse(req.body);
    const result = await runScreening(req.actor.tenant_id, input, req.actor.id);
    req.skipAutoAudit = true;
    await audit(req, { action: 'screening.run', resource_type: 'screening', resource_id: result.id, after: { name: input.name, outcome: result.outcome, top_score: result.top_score, matches: result.match_count } });
    res.json(result);
  } catch (e) { next(e); }
});

// Batch screening (onboarding files / nightly re-screen)
screeningRouter.post('/batch', requireRole('tenant_admin', 'compliance_officer', 'analyst', 'api_client'), async (req, res, next) => {
  try {
    const items = z.array(ScreenBody).max(500).parse(req.body.items);
    const out = []; for (const it of items) out.push(await runScreening(req.actor.tenant_id, it, req.actor.id));
    res.json({ count: out.length, results: out.map(r => ({ id: r.id, name: r.query_name, outcome: r.outcome, top_score: r.top_score, match_count: r.match_count })) });
  } catch (e) { next(e); }
});

screeningRouter.get('/', async (req, res) => {
  const { customer_id, outcome, limit = 50 } = req.query;
  const rows = await db('screenings').where({ tenant_id: req.actor.tenant_id }).modify(q => { if (customer_id) q.where({ customer_id }); if (outcome) q.where({ outcome }); }).orderBy('created_at', 'desc').limit(Number(limit));
  res.json(rows.map(r => ({ ...r, query: j(r.query), matches: j(r.matches) })));
});
screeningRouter.get('/:id', async (req, res) => {
  const r = await db('screenings').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first();
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json({ ...r, query: j(r.query), matches: j(r.matches) });
});
