import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db, j } from '../db/knex.js';
import { config } from '../config.js';

export const ROLES = {
  super_admin:        { level: 100, desc: 'Platform operator: all tenants, list registry, system settings' },
  tenant_admin:       { level: 80,  desc: 'Manages users, API keys, rules, risk model for one tenant' },
  compliance_officer: { level: 60,  desc: 'Approves/escalates alerts, files STR/SAR, owns cases' },
  analyst:            { level: 40,  desc: 'Screens customers, works alerts, cannot close true positives alone' },
  auditor:            { level: 20,  desc: 'Read-only across everything incl. the audit log' },
  api_client:         { level: 30,  desc: 'Machine credential from core banking / onboarding systems' },
};

export const hashKey = (k) => crypto.createHash('sha256').update(k).digest('hex');

export async function authenticate(req, res, next) {
  try {
    const apiKey = req.header('x-api-key');
    if (apiKey) {
      const row = await db('api_keys').where({ key_hash: hashKey(apiKey), active: true }).first();
      if (!row) return res.status(401).json({ error: 'Invalid API key' });
      await db('api_keys').where({ id: row.id }).update({ last_used_at: db.fn.now() });
      req.actor = { id: row.id, type: 'api_key', role: 'api_client', tenant_id: row.tenant_id, scopes: j(row.scopes) || [] };
      return next();
    }
    const auth = req.header('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, config.jwtSecret);
    // Check session not revoked (non-blocking for tokens without jti)
    if (payload.jti) {
      const valid = await touchSession(payload.jti);
      if (!valid) return res.status(401).json({ error: 'Session has been revoked' });
    }
    req.actor = { id: payload.sub, type: 'user', role: payload.role, tenant_id: payload.tenant_id, email: payload.email, name: payload.name, jti: payload.jti };
    // super_admin may act on behalf of a tenant
    const asTenant = req.header('x-tenant-id');
    if (asTenant && payload.role === 'super_admin') req.actor.tenant_id = asTenant;
    // super_admin impersonation token
    if (payload.impersonating) req.actor.impersonating = payload.impersonating;
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid or expired token' }); }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.actor) return res.status(401).json({ error: 'Authentication required' });
  if (req.actor.role === 'super_admin' || roles.includes(req.actor.role)) return next();
  res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
};

export const minLevel = (lvl) => (req, res, next) => {
  const l = ROLES[req.actor?.role]?.level ?? 0;
  if (l >= lvl) return next();
  res.status(403).json({ error: 'Insufficient privileges' });
};

// Issue a JWT and record the session. sessionId ties the token to a revocable row.
export const issueToken = (user, sessionId = null) => {
  const jti = sessionId || crypto.randomUUID();
  return jwt.sign({ sub: user.id, role: user.role, tenant_id: user.tenant_id, email: user.email, name: user.name, jti }, config.jwtSecret, { expiresIn: '12h' });
};

// Record a new session in the DB (called on login)
export async function createSession(user, { ip, userAgent } = {}) {
  const { v4: uuid } = await import('uuid');
  const id = uuid();
  await db('user_sessions').insert({ id, user_id: user.id, tenant_id: user.tenant_id, ip, user_agent: userAgent, active: true, last_seen_at: db.fn.now() });
  return id;
}

// Update last_seen_at and check session is still active
export async function touchSession(jti) {
  if (!jti) return true; // tokens issued before sessions feature still work
  const row = await db('user_sessions').where({ id: jti }).first();
  if (!row) return true; // unknown jti — allow (backward compat)
  if (!row.active) return false; // revoked
  await db('user_sessions').where({ id: jti }).update({ last_seen_at: db.fn.now() });
  return true;
}
