import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/knex.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

export const countryRiskRouter = Router();

// GET /v1/country-risk — full list, optionally filtered by band or region tag
countryRiskRouter.get('/', async (req, res) => {
  const { band, fatf_blacklist, fatf_greylist, q } = req.query;
  let query = db('country_risk').orderBy('score', 'desc');
  if (band) query = query.where({ band });
  if (fatf_blacklist === 'true') query = query.where({ fatf_blacklist: true });
  if (fatf_greylist === 'true') query = query.where({ fatf_greylist: true });
  let rows = await query;
  if (q) { const lq = q.toLowerCase(); rows = rows.filter(r => r.name?.toLowerCase().includes(lq) || r.iso2?.toLowerCase().startsWith(lq)); }
  res.json(rows);
});

// PATCH /v1/country-risk/:iso2 — tenant or super_admin can override a country's score and flags
countryRiskRouter.patch('/:iso2', requireRole('tenant_admin', 'super_admin'), async (req, res) => {
  const { iso2 } = req.params;
  const before = await db('country_risk').where({ iso2: iso2.toUpperCase() }).first();
  if (!before) return res.status(404).json({ error: `Country ${iso2} not found.` });

  const body = z.object({
    score: z.number().int().min(0).max(100).optional(),
    fatf_blacklist: z.boolean().optional(),
    fatf_greylist: z.boolean().optional(),
    eu_high_risk: z.boolean().optional(),
  }).parse(req.body);

  const updates = {};
  if (body.score !== undefined) {
    updates.score = body.score;
    updates.band = body.score >= 70 ? 'high' : body.score >= 40 ? 'medium' : 'low';
  }
  if (body.fatf_blacklist !== undefined) updates.fatf_blacklist = body.fatf_blacklist;
  if (body.fatf_greylist !== undefined) updates.fatf_greylist = body.fatf_greylist;
  if (body.eu_high_risk !== undefined) updates.eu_high_risk = body.eu_high_risk;

  await db('country_risk').where({ iso2: iso2.toUpperCase() }).update(updates);
  await audit(req, { action: 'country_risk.updated', resource_type: 'country_risk', resource_id: iso2.toUpperCase(), before, after: updates });
  const updated = await db('country_risk').where({ iso2: iso2.toUpperCase() }).first();
  res.json(updated);
});

// GET /v1/country-risk/stats — summary counts for dashboard use
countryRiskRouter.get('/stats', async (req, res) => {
  const [byBand, blacklist, greylist, total] = await Promise.all([
    db('country_risk').select('band').count({ n: '*' }).groupBy('band'),
    db('country_risk').where({ fatf_blacklist: true }).count({ n: '*' }).first(),
    db('country_risk').where({ fatf_greylist: true }).count({ n: '*' }).first(),
    db('country_risk').count({ n: '*' }).first(),
  ]);
  res.json({ total: Number(total.n), by_band: byBand, fatf_blacklist: Number(blacklist.n), fatf_greylist: Number(greylist.n) });
});
