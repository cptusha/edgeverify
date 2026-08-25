import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, j } from '../db/knex.js';
import { ADAPTERS, SOURCE_URLS, fetchText, loadFixture } from '../adapters/lists.js';
import { normalizeName, phoneticKeys } from '../engine/normalize.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { config } from '../config.js';

export const listsRouter = Router();

// Registry: browse/filter the 1,259 catalogued sources
listsRouter.get('/sources', async (req, res) => {
  const { type, country, region, enabled, q, tier } = req.query;
  const rows = await db('list_sources').modify(x => {
    if (type) x.whereIn('list_type', String(type).split(',')); if (country) x.where({ country }); if (region) x.where({ region });
    if (enabled !== undefined) x.where({ enabled: enabled === 'true' }); if (tier) x.where({ tier: Number(tier) }); if (q) x.where('name', 'like', `%${q}%`);
  }).orderBy(['tier', 'name']);
  res.json(rows);
});
listsRouter.get('/sources/summary', async (req, res) => {
  const [byType, byRegion, totals] = await Promise.all([
    db('list_sources').select('list_type').count({ n: '*' }).sum({ entries: 'entry_count' }).groupBy('list_type'),
    db('list_sources').select('region').count({ n: '*' }).groupBy('region'),
    db('list_sources').count({ sources: '*' }).sum({ entries: 'entry_count' }).first(),
  ]);
  const enabled = await db('list_sources').where({ enabled: true }).count({ n: '*' }).first();
  res.json({ total_sources: Number(totals.sources), enabled_sources: Number(enabled.n), total_entries: Number(totals.entries || 0), by_type: byType, by_region: byRegion });
});
listsRouter.patch('/sources/:code', requireRole('super_admin', 'tenant_admin'), async (req, res) => {
  const { enabled, adapter, source_url, refresh_hours, tier } = req.body;
  const before = await db('list_sources').where({ code: req.params.code }).first();
  if (!before) return res.status(404).json({ error: 'Not found' });
  const patch = {}; for (const [k, v] of Object.entries({ enabled, adapter, source_url, refresh_hours, tier })) if (v !== undefined) patch[k] = v;
  await db('list_sources').where({ code: req.params.code }).update(patch);
  req.skipAutoAudit = true; await audit(req, { action: 'list_source.update', resource_type: 'list_source', resource_id: req.params.code, before, after: patch });
  res.json({ ...before, ...patch });
});
// Register a brand-new local list (e.g. a central bank's internal blacklist) with a generic CSV/JSON feed
listsRouter.post('/sources', requireRole('super_admin', 'tenant_admin'), async (req, res) => {
  const { name, list_type = 'Watchlist', country = 'International', region = 'International', source_url, adapter = 'generic', refresh_hours = 24 } = req.body;
  const code = 'LS-' + uuid().slice(0, 8).toUpperCase();
  const row = { code, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, list_type, country, region, tier: 2, origin: 'tenant', adapter, source_url, refresh_hours, enabled: true };
  await db('list_sources').insert(row); res.status(201).json(row);
});

export async function upsertEntries(source_code, entries) {
  const rows = entries.map(e => ({
    id: uuid(), source_code, external_id: e.external_id, entity_type: e.entity_type || 'person', primary_name: e.primary_name, name_normalized: normalizeName(e.primary_name),
    aliases: JSON.stringify(e.aliases || []), aliases_normalized: JSON.stringify((e.aliases || []).map(normalizeName)),
    phonetic_keys: JSON.stringify([...new Set([e.primary_name, ...(e.aliases || [])].flatMap(phoneticKeys))]),
    dobs: JSON.stringify(e.dobs || []), nationalities: JSON.stringify(e.nationalities || []), countries: JSON.stringify(e.countries || []), identifiers: JSON.stringify(e.identifiers || []),
    addresses: JSON.stringify(e.addresses || []), programs: JSON.stringify(e.programs || []), remarks: e.remarks || '', pep_tier: e.pep_tier || null, pep_role: e.pep_role || null, rca_of: e.rca_of || null,
    raw: null, listed_on: e.listed_on ? new Date(e.listed_on).toISOString() : null,
  }));
  await db.transaction(async trx => {
    await trx('list_entries').where({ source_code }).del();
    for (let i = 0; i < rows.length; i += 200) await trx('list_entries').insert(rows.slice(i, i + 200));
    await trx('list_sources').where({ code: source_code }).update({ last_synced_at: trx.fn.now(), entry_count: rows.length, last_status: 'ok' });
  });
  return rows.length;
}

// Sync one source: fetch (if allowed) → parse via adapter → replace entries atomically
export async function syncSource(src) {
  try {
    let entries;
    const parse = ADAPTERS[src.adapter] || ADAPTERS.generic;
    if (config.listFetchEnabled && src.source_url) entries = parse(await fetchText(src.source_url), j(src.mapping) || {});
    else if (src.fixture) entries = loadFixture(src.fixture);
    else return { code: src.code, status: 'skipped', reason: 'no fetch (LIST_FETCH_ENABLED=false) and no fixture' };
    const n = await upsertEntries(src.code, entries);
    return { code: src.code, status: 'ok', entries: n };
  } catch (e) { await db('list_sources').where({ code: src.code }).update({ last_status: 'error: ' + e.message.slice(0, 120) }); return { code: src.code, status: 'error', error: e.message }; }
}
listsRouter.post('/sources/:code/sync', requireRole('super_admin', 'tenant_admin'), async (req, res) => {
  const src = await db('list_sources').where({ code: req.params.code }).first(); if (!src) return res.status(404).json({ error: 'Not found' });
  res.json(await syncSource({ ...src, fixture: FIXTURE_MAP[src.code] }));
});
listsRouter.post('/sync-all', requireRole('super_admin', 'tenant_admin'), async (req, res) => {
  const srcs = await db('list_sources').where({ enabled: true }); const out = [];
  for (const s of srcs) out.push(await syncSource({ ...s, fixture: FIXTURE_MAP[s.code] }));
  res.json({ synced: out.filter(o => o.status === 'ok').length, results: out });
});

// Profile search: browse listed persons/entities directly (analyst research), not a formal screening.
listsRouter.get('/entries', async (req, res) => {
  const { q, source_code, entity_type, list_type, limit = 50 } = req.query;
  let x = db('list_entries as e').join('list_sources as s', 's.code', 'e.source_code').select('e.*', 's.name as list_name', 's.list_type', 's.country as list_country');
  if (q) { const nq = normalizeName(String(q)); x = x.where(b => b.where('e.name_normalized', 'like', `%${nq}%`).orWhere('e.aliases_normalized', 'like', `%${nq}%`)); }
  if (source_code) x = x.where('e.source_code', source_code); if (entity_type) x = x.where('e.entity_type', entity_type); if (list_type) x = x.where('s.list_type', list_type);
  const rows = await x.limit(Number(limit));
  res.json(rows.map(r => ({ ...r, aliases: j(r.aliases), dobs: j(r.dobs), nationalities: j(r.nationalities), countries: j(r.countries), identifiers: j(r.identifiers), addresses: j(r.addresses), programs: j(r.programs), raw: undefined, aliases_normalized: undefined, phonetic_keys: undefined })));
});
listsRouter.get('/entries/:id', async (req, res) => {
  const r = await db('list_entries as e').join('list_sources as s', 's.code', 'e.source_code').select('e.*', 's.name as list_name', 's.list_type').where('e.id', req.params.id).first();
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json({ ...r, aliases: j(r.aliases), dobs: j(r.dobs), nationalities: j(r.nationalities), countries: j(r.countries), identifiers: j(r.identifiers), addresses: j(r.addresses), programs: j(r.programs), aliases_normalized: undefined, phonetic_keys: undefined });
});

// Which catalogue codes have a bundled fixture (demo / air-gapped). Codes = sha1 of the catalogue name (see data/list_catalog.json).
export const FIXTURE_MAP = {};
export function registerFixtures(map) { Object.assign(FIXTURE_MAP, map); }
