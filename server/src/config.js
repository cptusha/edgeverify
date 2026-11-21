export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  listFetchEnabled: process.env.LIST_FETCH_ENABLED === 'true',
  listRefreshMinutes: Number(process.env.LIST_REFRESH_CRON_MINUTES || 360),
};

// Hosted mode (Postgres) or NODE_ENV=production must have a real JWT secret.
// Without one, anyone could forge a login token, so refuse to start instead.
const hosted = Boolean(config.databaseUrl) || config.env === 'production';
const WEAK = new Set(['', 'dev-only-secret', 'change-me-in-production', 'changeme', 'secret']);
if (hosted && (WEAK.has(process.env.JWT_SECRET || '') || (process.env.JWT_SECRET || '').length < 32)) {
  console.error('FATAL: JWT_SECRET is missing or too weak. Set a random value of at least 32 characters in your environment (Render > Environment).');
  process.exit(1);
}
export const isHosted = hosted;
