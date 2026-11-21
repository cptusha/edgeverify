/**
 * Webhook delivery — persistent queue with exponential backoff.
 *
 * Flow:
 *   dispatchWebhook(tenant_id, event, payload)
 *     → writes one webhook_deliveries row per matching hook (status=pending)
 *     → triggers immediate first attempt in background
 *
 * Retry schedule (5 attempts max):
 *   attempt 1 — immediate
 *   attempt 2 — 1 min
 *   attempt 3 — 5 min
 *   attempt 4 — 30 min
 *   attempt 5 — 2 hr
 *   after 5 → status = dead
 *
 * processWebhookQueue() is called on startup and every minute by the scheduler.
 */
import crypto from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { db, j } from '../db/knex.js';

const RETRY_DELAYS_MS = [0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

// ── Dispatch: enqueue deliveries for all matching hooks ─────────────────────

export async function dispatchWebhook(tenant_id, event, payload) {
  const hooks = await db('webhooks').where({ tenant_id, active: true });
  for (const h of hooks) {
    const events = j(h.events) || [];
    if (events.length && !events.includes(event) && !events.includes('*')) continue;
    const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
    const sig = crypto.createHmac('sha256', h.secret || '').update(body).digest('hex');
    const id = uuid();
    await db('webhook_deliveries').insert({
      id, webhook_id: h.id, tenant_id, event,
      payload: JSON.stringify({ body, sig, url: h.url }),
      status: 'pending', attempts: 0,
      next_attempt_at: new Date().toISOString(),
    });
    // Fire immediately in background — don't await so we don't block the caller
    attemptDelivery(id).catch(() => {});
  }
}

// ── Attempt a single delivery ───────────────────────────────────────────────

async function attemptDelivery(deliveryId) {
  const row = await db('webhook_deliveries').where({ id: deliveryId }).first();
  if (!row || row.status === 'delivered' || row.status === 'dead') return;

  const { body, sig, url } = JSON.parse(row.payload);
  const attempts = (row.attempts || 0) + 1;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-edgeverify-signature': sig, 'x-edgeverify-event': row.event },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      await db('webhook_deliveries').where({ id: deliveryId }).update({
        status: 'delivered', attempts, delivered_at: new Date().toISOString(), last_http_status: res.status, last_error: null,
      });
      return;
    }

    // Non-2xx — schedule retry
    await scheduleRetry(deliveryId, attempts, `HTTP ${res.status}`);
  } catch (e) {
    await scheduleRetry(deliveryId, attempts, e.message);
  }
}

async function scheduleRetry(deliveryId, attempts, errorMsg) {
  if (attempts >= MAX_ATTEMPTS) {
    await db('webhook_deliveries').where({ id: deliveryId }).update({ status: 'dead', attempts, last_error: errorMsg });
    return;
  }
  const delayMs = RETRY_DELAYS_MS[attempts] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const nextAt = new Date(Date.now() + delayMs).toISOString();
  await db('webhook_deliveries').where({ id: deliveryId }).update({
    status: 'pending', attempts, next_attempt_at: nextAt, last_error: errorMsg,
  });
}

// ── Queue processor: pick up overdue pending deliveries ─────────────────────

export async function processWebhookQueue() {
  const now = new Date().toISOString();
  const due = await db('webhook_deliveries')
    .where('status', 'pending')
    .where('next_attempt_at', '<=', now)
    .limit(50);

  for (const row of due) {
    // Mark in-flight to avoid double-processing
    await db('webhook_deliveries').where({ id: row.id }).update({ status: 'retrying' });
    attemptDelivery(row.id).catch(() => {});
  }
  return due.length;
}

// ── REST routes for webhook management ─────────────────────────────────────
// (mounted at /v1/admin/webhooks by admin.js)

import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

export const webhookAdminRouter = Router();

// List hooks for this tenant
webhookAdminRouter.get('/', requireRole('tenant_admin'), async (req, res) => {
  const rows = await db('webhooks').where({ tenant_id: req.actor.tenant_id });
  res.json(rows.map(w => ({ ...w, events: j(w.events), secret: undefined })));
});

// Create hook
webhookAdminRouter.post('/', requireRole('tenant_admin'), async (req, res) => {
  const { url, events = ['*'] } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  const secret = crypto.randomBytes(24).toString('hex');
  const row = { id: uuid(), tenant_id: req.actor.tenant_id, url, events: JSON.stringify(events), secret, active: true };
  await db('webhooks').insert(row);
  res.status(201).json({ ...row, events, secret }); // return secret once on creation
});

// Update (toggle active, change events/url)
webhookAdminRouter.patch('/:id', requireRole('tenant_admin'), async (req, res) => {
  const hook = await db('webhooks').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first();
  if (!hook) return res.status(404).json({ error: 'Not found' });
  const { url, events, active } = req.body;
  const patch = {};
  if (url !== undefined) patch.url = url;
  if (events !== undefined) patch.events = JSON.stringify(events);
  if (active !== undefined) patch.active = active;
  await db('webhooks').where({ id: req.params.id }).update(patch);
  res.json({ ...hook, ...patch, events: j(patch.events ?? hook.events), secret: undefined });
});

// Delete hook
webhookAdminRouter.delete('/:id', requireRole('tenant_admin'), async (req, res) => {
  const n = await db('webhooks').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).del();
  if (!n) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Delivery history for a hook
webhookAdminRouter.get('/:id/deliveries', requireRole('tenant_admin'), async (req, res) => {
  const hook = await db('webhooks').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first();
  if (!hook) return res.status(404).json({ error: 'Not found' });
  const rows = await db('webhook_deliveries').where({ webhook_id: req.params.id }).orderBy('created_at', 'desc').limit(100);
  res.json(rows.map(r => ({ ...r, payload: undefined }))); // don't expose raw payload
});

// Retry a dead delivery manually
webhookAdminRouter.post('/:id/deliveries/:deliveryId/retry', requireRole('tenant_admin'), async (req, res) => {
  const hook = await db('webhooks').where({ id: req.params.id, tenant_id: req.actor.tenant_id }).first();
  if (!hook) return res.status(404).json({ error: 'Not found' });
  const delivery = await db('webhook_deliveries').where({ id: req.params.deliveryId, webhook_id: req.params.id }).first();
  if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
  await db('webhook_deliveries').where({ id: delivery.id }).update({ status: 'pending', next_attempt_at: new Date().toISOString() });
  attemptDelivery(delivery.id).catch(() => {});
  res.json({ ok: true });
});
