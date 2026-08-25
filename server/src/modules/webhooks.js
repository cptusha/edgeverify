import crypto from 'node:crypto';
import { db, j } from '../db/knex.js';
export async function dispatchWebhook(tenant_id, event, payload) {
  const hooks = await db('webhooks').where({ tenant_id, active: true });
  for (const h of hooks) {
    const events = j(h.events) || [];
    if (events.length && !events.includes(event) && !events.includes('*')) continue;
    const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
    const sig = crypto.createHmac('sha256', h.secret || '').update(body).digest('hex');
    fetch(h.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-edgeverify-signature': sig, 'x-edgeverify-event': event }, body }).catch(() => {});
  }
}
