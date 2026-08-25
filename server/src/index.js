import express from 'express';
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
import { listsRouter, syncSource, FIXTURE_MAP, registerFixtures } from './modules/lists.js';
import { dashboardsRouter } from './modules/dashboards.js';
import { FIXTURES } from './fixtures/index.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.get('/health', async (req, res) => { try { await db.raw('select 1'); res.json({ ok: true, service: 'edgeverify', version: '0.1.0', mode: config.databaseUrl ? 'postgres' : 'standalone-sqlite' }); } catch (e) { res.status(503).json({ ok: false }); } });
app.use('/v1/auth', (req, res, next) => (req.path === '/login' ? next() : authenticate(req, res, next)), authRouter);

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
app.use('/v1', v1);

// Standalone mode: serve the built console from the same process (client/dist). API-only deployments just don't ship the dist folder.
import path from 'node:path'; import fs from 'node:fs';
const dist = path.resolve(process.cwd(), '..', 'client', 'dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get(/^(?!\/v1|\/health).*/, (req, res) => res.sendFile(path.join(dist, 'index.html'))); }

app.use((err, req, res, next) => {
  if (err?.name === 'ZodError') return res.status(422).json({ error: 'Validation failed', issues: err.issues });
  console.error(err); res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

registerFixtures(FIXTURES);
// Scheduled list refresh
setInterval(async () => { const srcs = await db('list_sources').where({ enabled: true }); for (const s of srcs) await syncSource({ ...s, fixture: FIXTURE_MAP[s.code] }); }, config.listRefreshMinutes * 60_000).unref();

app.listen(config.port, () => console.log(`EdgeVerify API on :${config.port} (${config.databaseUrl ? 'postgres' : 'standalone sqlite'})`));
