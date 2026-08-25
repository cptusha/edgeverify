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
    req.actor = { id: payload.sub, type: 'user', role: payload.role, tenant_id: payload.tenant_id, email: payload.email, name: payload.name };
    // super_admin may act on behalf of a tenant
    const asTenant = req.header('x-tenant-id');
    if (asTenant && payload.role === 'super_admin') req.actor.tenant_id = asTenant;
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

export const issueToken = (user) => jwt.sign({ sub: user.id, role: user.role, tenant_id: user.tenant_id, email: user.email, name: user.name }, config.jwtSecret, { expiresIn: '12h' });
