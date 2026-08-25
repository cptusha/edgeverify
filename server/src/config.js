export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  listFetchEnabled: process.env.LIST_FETCH_ENABLED === 'true',
  listRefreshMinutes: Number(process.env.LIST_REFRESH_CRON_MINUTES || 360),
};
