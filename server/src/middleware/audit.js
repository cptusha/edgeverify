// Append-only, hash-chained audit log. Each row's hash covers its content + previous hash,
// so tampering with any historical entry is detectable (GET /audit/verify).
import crypto from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { db } from '../db/knex.js';

let chainLock = Promise.resolve();

export async function audit(req, { action, resource_type, resource_id, before = null, after = null }) {
  const run = async () => {
    const last = await db('audit_log').orderBy('seq', 'desc').first();
    const prev_hash = last?.hash || 'GENESIS';
    const entry = {
      id: uuid(), tenant_id: req?.actor?.tenant_id || null, actor_id: req?.actor?.id || 'system', actor_type: req?.actor?.type || 'system',
      action, resource_type, resource_id: resource_id ? String(resource_id) : null,
      before: before ? JSON.stringify(before) : null, after: after ? JSON.stringify(after) : null,
      ip: req?.ip || null, user_agent: req?.get?.('user-agent') || null, prev_hash, at: new Date().toISOString(),
    };
    entry.hash = crypto.createHash('sha256').update(JSON.stringify({ ...entry, hash: undefined })).digest('hex');
    await db('audit_log').insert(entry);
    return entry;
  };
  chainLock = chainLock.then(run, run);
  return chainLock;
}

export async function verifyChain(tenant_id) {
  const rows = await db('audit_log').orderBy('seq', 'asc');
  let prev = 'GENESIS', broken = [];
  for (const r of rows) {
    const { hash, seq, ...rest } = r;
    const recomputed = crypto.createHash('sha256').update(JSON.stringify({ ...rest, at: new Date(r.at).toISOString(), hash: undefined })).digest('hex');
    if (r.prev_hash !== prev || recomputed !== hash) broken.push(seq);
    prev = hash;
  }
  return { entries: rows.length, intact: broken.length === 0, broken_at: broken.slice(0, 20) };
}

// Automatic audit of every mutating request
export function auditMiddleware(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const started = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400 || req.skipAutoAudit) return;
    audit(req, { action: `${req.method} ${req.baseUrl}${req.path}`, resource_type: 'http', resource_id: null,
      after: { status: res.statusCode, ms: Date.now() - started, body: redact(req.body) } }).catch(() => {});
  });
  next();
}
const redact = (b) => { if (!b || typeof b !== 'object') return b; const c = { ...b }; for (const k of ['password', 'secret', 'api_key', 'id_number']) if (k in c) c[k] = '***'; return c; };
