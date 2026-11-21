import express from 'express';
// Express 4 does not catch errors thrown in async route handlers. This patches it so they reach the error handler below.
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { db } from './db/knex.js';
import { authenticate } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { authRouter, adminRouter } from './modules/admin.js';
import { screeningRouter } from './modules/screening.js';
import { customersRouter } from './modules/customers.js';
import { transactionsRouter } from './modules/transactions.js';
import { alertsRouter, casesRouter } from './modules/alerts.js';
import { listsRouter, syncSource, FIXTURE_MAP, registerFixtures, seedLiveSources, runScheduledRefresh } from './modules/lists.js';
import { dashboardsRouter } from './modules/dashboards.js';
import { strRouter } from './modules/str.js';
import { countryRiskRouter } from './modules/country_risk.js';
import { operatorRouter } from './modules/operator.js';
import { webhookAdminRouter, processWebhookQueue } from './modules/webhooks.js';
import { FIXTURES } from './fixtures/index.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.get('/health', async (req, res) => { try { await db.raw('select 1'); res.json({ ok: true, service: 'edgeverify', version: '0.1.0', mode: config.databaseUrl ? 'postgres' : 'standalone-sqlite' }); } catch (e) { res.status(503).json({ ok: false }); } });
const PUBLIC_AUTH = ['/login', '/signup', '/forgot-password', '/reset-password'];
app.use('/v1/auth', (req, res, next) => (PUBLIC_AUTH.includes(req.path) ? next() : authenticate(req, res, next)), authRouter);

const v1 = express.Router();
v1.use(authenticate, auditMiddleware);
v1.use('/screen', screeningRouter);
v1.use('/customers', customersRouter);
v1.use('/transactions', transactionsRouter);
v1.use('/alerts', alertsRouter);
v1.use('/cases', casesRouter);
v1.use('/lists', listsRouter);
v1.use('/dashboards', dashboardsRouter);
v1.use('/admin', adminRouter);
v1.use('/str-reports', strRouter);
v1.use('/country-risk', countryRiskRouter);
v1.use('/operator', operatorRouter);
v1.use('/admin/webhooks', webhookAdminRouter);
app.use('/v1', v1);

// Standalone mode: serve the built console from the same process (client/dist). API-only deployments just don't ship the dist folder.
import path from 'node:path'; import fs from 'node:fs';
const dist = path.resolve(process.cwd(), '..', 'client', 'dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get(/^(?!\/v1|\/health).*/, (req, res) => res.sendFile(path.join(dist, 'index.html'))); }

app.use((err, req, res, next) => {
  if (err?.name === 'ZodError') return res.status(422).json({ error: 'Validation failed', issues: err.issues });
  console.error(err); const status = err.status || err.statusCode || 500; res.status(status).json({ error: status >= 500 ? 'Internal error' : (err.message || 'Request failed') });
});

// Last-resort logging. A failed promise is logged and the server keeps running.
// A truly uncaught exception leaves the process in an unknown state, so log it and exit; Render restarts the service.
process.on('unhandledRejection', (err) => { console.error('[unhandledRejection]', err); });
process.on('uncaughtException', (err) => { console.error('[uncaughtException]', err); process.exit(1); });

registerFixtures(FIXTURES);

// Seed the four live sources on startup, then run an immediate refresh cycle.
// seedLiveSources is idempotent — safe on every restart.
seedLiveSources()
  .then(() => runScheduledRefresh())
  .then(r => { if (r.synced > 0) console.log(`[list-refresh] startup sync: ${r.synced}/${r.checked} sources refreshed`); })
  .catch(e => console.error('[list-refresh] startup failed:', e.message));

// Scheduled refresh: check every 30 minutes; each source decides for itself
// whether it is due based on its refresh_hours setting (default 24h).
setInterval(async () => {
  try {
    const r = await runScheduledRefresh();
    if (r.synced > 0) console.log(`[list-refresh] scheduled: ${r.synced}/${r.checked} sources refreshed`);
  } catch (e) { console.error('[list-refresh] scheduled run failed:', e.message); }
}, 30 * 60_000).unref();

// Webhook delivery queue — process pending/retrying deliveries every 60 seconds
setInterval(async () => {
  try { await processWebhookQueue(); }
  catch (e) { console.error('[webhooks] queue run failed:', e.message); }
}, 60_000).unref();

app.listen(config.port, () => {
  console.log(`EdgeVerify API on :${config.port} (${config.databaseUrl ? 'postgres' : 'standalone sqlite'})`);

  // Keep-alive: ping our own health endpoint every 10 minutes so Render
  // free-tier does not spin the service down after 15 minutes of inactivity.
  if (process.env.SELF_URL) {
    const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    setInterval(() => {
      fetch(`${process.env.SELF_URL}/health`)
        .then(() => console.log('[keep-alive] ping ok'))
        .catch(e => console.warn('[keep-alive] ping failed:', e.message));
    }, INTERVAL_MS).unref();
    console.log(`[keep-alive] pinging ${process.env.SELF_URL}/health every 10 minutes`);
  }
});