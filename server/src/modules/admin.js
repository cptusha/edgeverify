import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, j } from '../db/knex.js';
import { requireRole, ROLES, hashKey, issueToken } from '../middleware/auth.js';
import { audit, verifyChain } from '../middleware/audit.js';
import { expandBuiltins } from '../engine/rules.js';
import { DEFAULT_RISK_CONFIG } from '../engine/risk.js';
import { sendPasswordReset } from '../services/email.js';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { createSession } from '../middleware/auth.js';

export const authRouter = Router();
authRouter.post('/login', async (req, res) => {
  const { email, password, tenant_id, totp_code } = req.body;
  const u = await db('users').where({ email }).modify(q => { if (tenant_id) q.where({ tenant_id }); }).first();
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });

  // If 2FA is enabled, require a TOTP code
  if (u.totp_enabled && u.totp_secret) {
    if (!totp_code) return res.status(200).json({ totp_required: true }); // frontend shows TOTP prompt
    const valid = speakeasy.totp.verify({ secret: u.totp_secret, encoding: 'base32', token: String(totp_code), window: 1 });
    if (!valid) return res.status(401).json({ error: 'Invalid authenticator code' });
  }

  const sessionId = await createSession(u, { ip: req.ip, userAgent: req.get('user-agent') });
  await audit({ actor: { id: u.id, type: 'user', tenant_id: u.tenant_id }, ip: req.ip, get: (h) => req.get(h) }, { action: 'auth.login', resource_type: 'user', resource_id: u.id });
  res.json({ token: issueToken(u, sessionId), user: { id: u.id, name: u.name, email: u.email, role: u.role, tenant_id: u.tenant_id, totp_enabled: u.totp_enabled } });
});
authRouter.get('/me', (req, res) => res.json(req.actor));
authRouter.get('/roles', (req, res) => res.json(ROLES));

// Password reset — request (unauthenticated)
authRouter.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  // Always return 200 to prevent user enumeration
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
  if (!email) return;
  const user = await db('users').where({ email: email.toLowerCase().trim() }).first();
  if (!user || !user.active) return;
  const token = crypto.randomBytes(32).toString('hex');
  await db('password_reset_tokens').insert({ id: token, user_id: user.id, expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
  await sendPasswordReset({ to: user.email, name: user.name, token }).catch(e => console.error('[email] forgot-password:', e.message));
});

// Password reset — confirm (unauthenticated)
authRouter.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8) return res.status(400).json({ error: 'token and password (min 8 chars) are required' });
  const row = await db('password_reset_tokens').where({ id: token, used: false }).first();
  if (!row) return res.status(400).json({ error: 'Invalid or expired reset link' });
  if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
  const hash = await bcrypt.hash(password, 10);
  await db.transaction(async trx => {
    await trx('users').where({ id: row.user_id }).update({ password_hash: hash });
    await trx('password_reset_tokens').where({ id: token }).update({ used: true });
  });
  res.json({ ok: true, message: 'Password updated. You can now sign in.' });
});

// Change own password (authenticated)
authRouter.post('/change-password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || new_password.length < 8) return res.status(400).json({ error: 'current_password and new_password (min 8 chars) are required' });
  const user = await db('users').where({ id: req.actor.id }).first();
  if (!user || !(await bcrypt.compare(current_password, user.password_hash))) return res.status(401).json({ error: 'Current password is incorrect' });
  await db('users').where({ id: user.id }).update({ password_hash: await bcrypt.hash(new_password, 10) });
  res.json({ ok: true });
});

// Self-service signup — creates a new tenant + first admin user
authRouter.post('/signup', async (req, res, next) => {
  try {
    const { org_name, org_email, phone, plan, name, email, password } = req.body;
    if (!org_name || !org_email || !name || !email || !password) return res.status(400).json({ error: 'org_name, org_email, name, email and password are all required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const VALID_PLANS = ['startup', 'growth', 'enterprise'];
    const chosenPlan = VALID_PLANS.includes(plan) ? plan : 'growth';

    // Check no existing user with this email across any tenant
    const existing = await db('users').where({ email }).first();
    if (existing) return res.status(409).json({ error: 'An account with this email address already exists.' });

    const tenantId = uuid();
    const userId = uuid();
    const hash = await bcrypt.hash(password, 10);

    await db.transaction(async trx => {
      await trx('tenants').insert({
        id: tenantId,
        name: org_name,
        plan: chosenPlan,
        settings: JSON.stringify({ org_email, phone: phone || null }),
      });
      await trx('users').insert({
        id: userId,
        tenant_id: tenantId,
        email,
        name,
        role: 'tenant_admin',
        password_hash: hash,
        active: true,
      });
    });

    res.status(201).json({ message: 'Account created. You can now sign in.', tenant_id: tenantId });
  } catch (e) { next(e); }
});

export const adminRouter = Router();
// Users
adminRouter.get('/users', requireRole('tenant_admin', 'auditor'), async (req, res) => res.json(await db('users').where({ tenant_id: req.actor.tenant_id }).select('id', 'email', 'name', 'role', 'active', 'created_at')));
adminRouter.post('/users', requireRole('tenant_admin'), async (req, res, next) => {
  try {
    const { email, name, role, password } = req.body; if (!ROLES[role] || role === 'super_admin') return res.status(400).json({ error: 'Invalid role' });
    const row = { id: uuid(), tenant_id: req.actor.tenant_id, email, name, role, password_hash: await bcrypt.hash(password, 10) };
    await db('users').insert(row); res.status(201).json({ id: row.id, email, name, role });
  } catch (e) { next(e); }
});
adminRouter.patch('/users/:id', requireRole('tenant_admin'), async (req, res) => {
  const { role, active, name } = req.body; const patch = {}; if (role && ROLES[role] && role !== 'super_admin') patch.role = role; if (active !== undefined) patch.active = active; if (name) patch.name = name;
  await db('users').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).update(patch); res.json({ id: req.params.id, ...patch });
});
// API keys (shown once)
adminRouter.get('/api-keys', requireRole('tenant_admin', 'auditor'), async (req, res) => res.json(await db('api_keys').where({ tenant_id: req.actor.tenant_id }).select('id', 'label', 'prefix', 'scopes', 'last_used_at', 'active', 'created_at')));
adminRouter.post('/api-keys', requireRole('tenant_admin'), async (req, res) => {
  const key = 'ev_live_' + crypto.randomBytes(24).toString('base64url');
  const row = { id: uuid(), tenant_id: req.actor.tenant_id, label: req.body.label || 'Core banking', key_hash: hashKey(key), prefix: key.slice(0, 12), scopes: JSON.stringify(req.body.scopes || ['screen', 'transactions', 'customers']) };
  await db('api_keys').insert(row); res.status(201).json({ id: row.id, label: row.label, key, note: 'Store this key now; it will not be shown again.' });
});
adminRouter.delete('/api-keys/:id', requireRole('tenant_admin'), async (req, res) => { await db('api_keys').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).update({ active: false }); res.json({ revoked: true }); });
// Rules (custom risky-transaction set-up)
adminRouter.get('/rules', async (req, res) => res.json((await db('rules').where({ tenant_id: req.actor.tenant_id }).orderBy('code')).map(r => ({ ...r, definition: j(r.definition) }))));
adminRouter.get('/rules/library', (req, res) => res.json(expandBuiltins()));
adminRouter.post('/rules', requireRole('tenant_admin', 'compliance_officer'), async (req, res, next) => {
  try {
    const { code, name, description, category = 'custom', severity = 'medium', action = 'alert', definition, enabled = true } = req.body;
    if (!code || !definition) return res.status(400).json({ error: 'code and definition are required' });
    const row = { id: uuid(), tenant_id: req.actor.tenant_id, code: code.toUpperCase(), name, description, category, severity, action, definition: JSON.stringify(definition), enabled, created_by: req.actor.id };
    await db('rules').insert(row); res.status(201).json({ ...row, definition });
  } catch (e) { next(e); }
});
adminRouter.patch('/rules/:id', requireRole('tenant_admin', 'compliance_officer'), async (req, res) => {
  const before = await db('rules').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first(); if (!before) return res.status(404).json({ error: 'Not found' });
  const patch = {}; for (const k of ['name', 'description', 'severity', 'action', 'enabled', 'category']) if (req.body[k] !== undefined) patch[k] = req.body[k];
  if (req.body.definition) patch.definition = JSON.stringify(req.body.definition);
  await db('rules').where({ id: before.id }).update(patch); req.skipAutoAudit = true;
  await audit(req, { action: 'rule.update', resource_type: 'rule', resource_id: before.code, before: { ...before, definition: j(before.definition) }, after: req.body });
  res.json({ ...before, ...patch, definition: req.body.definition || j(before.definition) });
});
adminRouter.post('/rules/test', requireRole('tenant_admin', 'compliance_officer', 'analyst'), async (req, res, next) => {
  // Dry-run a rule definition against recent transactions to estimate alert volume before enabling it.
  try {
    const { evaluateRule } = await import('../engine/rules.js'); const { countryRiskMap } = await import('./customers.js');
    const rule = { ...req.body, enabled: true }; const countryRisk = await countryRiskMap();
    const txns = await db('transactions').where({ tenant_id: req.actor.tenant_id }).orderBy('occurred_at', 'desc').limit(2000);
    let hits = 0; const sample = [];
    for (const tx of txns) {
      const customer = tx.customer_id ? await db('customers').where({ id: tx.customer_id }).first() : {};
      const history = txns.filter(h => h.customer_id === tx.customer_id && h.id !== tx.id && new Date(h.occurred_at) < new Date(tx.occurred_at));
      const h = evaluateRule(rule, tx, { customer: customer || {}, history, countryRisk }); if (h) { hits++; if (sample.length < 5) sample.push({ tx: tx.external_ref || tx.id, ...h }); }
    }
    res.json({ evaluated: txns.length, would_alert: hits, hit_rate_pct: txns.length ? Math.round(1000 * hits / txns.length) / 10 : 0, sample });
  } catch (e) { next(e); }
});
// Risk model
adminRouter.get('/risk-config', async (req, res) => { const t = await db('tenants').where({ id: req.actor.tenant_id }).first(); res.json({ ...DEFAULT_RISK_CONFIG, ...(j(t.risk_config) || {}) }); });
adminRouter.put('/risk-config', requireRole('tenant_admin', 'compliance_officer'), async (req, res) => {
  const before = await db('tenants').where({ id: req.actor.tenant_id }).first();
  await db('tenants').where({ id: req.actor.tenant_id }).update({ risk_config: JSON.stringify(req.body) }); req.skipAutoAudit = true;
  await audit(req, { action: 'risk_model.update', resource_type: 'tenant', resource_id: req.actor.tenant_id, before: j(before.risk_config), after: req.body }); res.json(req.body);
});
adminRouter.get('/country-risk', async (req, res) => res.json(await db('country_risk').orderBy('score', 'desc')));
adminRouter.put('/country-risk/:iso2', requireRole('tenant_admin', 'compliance_officer'), async (req, res) => { await db('country_risk').where({ iso2: req.params.iso2 }).update(req.body); res.json({ iso2: req.params.iso2, ...req.body }); });
// Webhooks — full CRUD now lives in webhookAdminRouter (see index.js)
// Legacy stubs kept for backwards compat; new clients use /v1/admin/webhooks/*
// Audit log (auditor + admin)
adminRouter.get('/audit', requireRole('tenant_admin', 'auditor', 'compliance_officer'), async (req, res) => {
  const { action, actor_id, resource_type, limit = 200 } = req.query;
  const rows = await db('audit_log').where({ tenant_id: req.actor.tenant_id }).modify(q => { if (action) q.where('action', 'like', `%${action}%`); if (actor_id) q.where({ actor_id }); if (resource_type) q.where({ resource_type }); }).orderBy('seq', 'desc').limit(Number(limit));
  res.json(rows.map(r => ({ ...r, before: j(r.before), after: j(r.after) })));
});
adminRouter.get('/audit/verify', requireRole('tenant_admin', 'auditor'), async (req, res) => res.json(await verifyChain(req.actor.tenant_id)));
adminRouter.get('/tenant', async (req, res) => { const t = await db('tenants').where({ id: req.actor.tenant_id }).first(); res.json({ ...t, settings: j(t.settings), risk_config: j(t.risk_config) }); });
adminRouter.put('/tenant/settings', requireRole('tenant_admin'), async (req, res) => { await db('tenants').where({ id: req.actor.tenant_id }).update({ settings: JSON.stringify(req.body) }); res.json(req.body); });

// ── 2FA (TOTP) ──────────────────────────────────────────────────────────────

// Step 1: generate a secret + QR code — user scans with their authenticator app
authRouter.post('/2fa/setup', async (req, res) => {
  const user = await db('users').where({ id: req.actor.id }).first();
  if (user.totp_enabled) return res.status(400).json({ error: '2FA is already enabled. Disable it first.' });
  const secret = speakeasy.generateSecret({ name: `EdgeVerify (${user.email})`, issuer: 'EdgeVerify' });
  // Store secret temporarily (not yet activated — user must verify first)
  await db('users').where({ id: user.id }).update({ totp_secret: secret.base32 });
  const qr = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ secret: secret.base32, qr }); // qr is a data: URI the frontend renders as <img>
});

// Step 2: verify the code from the app to activate 2FA
authRouter.post('/2fa/verify', async (req, res) => {
  const { code } = req.body;
  const user = await db('users').where({ id: req.actor.id }).first();
  if (!user.totp_secret) return res.status(400).json({ error: 'Run /2fa/setup first' });
  const valid = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: String(code), window: 1 });
  if (!valid) return res.status(400).json({ error: 'Code is incorrect. Try again.' });
  await db('users').where({ id: user.id }).update({ totp_enabled: true });
  res.json({ ok: true, message: '2FA enabled successfully.' });
});

// Disable 2FA (requires current TOTP code or password as confirmation)
authRouter.post('/2fa/disable', async (req, res) => {
  const { code, password } = req.body;
  const user = await db('users').where({ id: req.actor.id }).first();
  if (!user.totp_enabled) return res.status(400).json({ error: '2FA is not enabled.' });
  // Verify by TOTP code or by password (whichever they provide)
  let confirmed = false;
  if (code) confirmed = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: String(code), window: 1 });
  if (!confirmed && password) confirmed = await bcrypt.compare(password, user.password_hash);
  if (!confirmed) return res.status(401).json({ error: 'Invalid code or password.' });
  await db('users').where({ id: user.id }).update({ totp_enabled: false, totp_secret: null });
  res.json({ ok: true, message: '2FA disabled.' });
});

// ── Sessions ─────────────────────────────────────────────────────────────────

// List active sessions for the current user
authRouter.get('/sessions', async (req, res) => {
  const rows = await db('user_sessions').where({ user_id: req.actor.id, active: true }).orderBy('last_seen_at', 'desc');
  res.json(rows.map(r => ({ ...r, current: r.id === req.actor.jti })));
});

// Revoke a specific session
authRouter.delete('/sessions/:id', async (req, res) => {
  const n = await db('user_sessions').where({ id: req.params.id, user_id: req.actor.id }).update({ active: false });
  if (!n) return res.status(404).json({ error: 'Session not found' });
  res.json({ ok: true });
});

// Revoke all sessions except current
authRouter.post('/sessions/revoke-all', async (req, res) => {
  await db('user_sessions').where({ user_id: req.actor.id, active: true }).whereNot({ id: req.actor.jti || '' }).update({ active: false });
  res.json({ ok: true });
});
