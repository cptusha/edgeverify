/**
 * Usage metering — increment counters and check limits.
 *
 * Counters live in usage_counters (tenant_id, metric, period, count).
 * period is YYYY-MM (calendar month, UTC).
 *
 * Sandbox tenants: counters are never incremented and limits are never checked.
 */
import { db } from '../db/knex.js';
import { getPlanLimits, currentPeriod } from '../engine/plans.js';

// Increment a metric for a tenant. No-op for sandbox tenants.
export async function increment(tenant_id, metric, by = 1) {
  if (!tenant_id) return;
  const tenant = await db('tenants').where({ id: tenant_id }).first();
  if (!tenant || tenant.sandbox) return; // sandbox — don't count

  const period = currentPeriod();
  await db('usage_counters')
    .insert({ tenant_id, metric, period, count: by })
    .onConflict(['tenant_id', 'metric', 'period'])
    .merge({ count: db.raw('usage_counters.count + ?', [by]) });
}

// Get current period usage for a tenant, shaped as { metric: count }
export async function getUsage(tenant_id) {
  const period = currentPeriod();
  const rows = await db('usage_counters').where({ tenant_id, period });
  return Object.fromEntries(rows.map(r => [r.metric, r.count]));
}

// Check if a tenant is over their plan limit for a metric.
// Returns { allowed: true } or { allowed: false, limit, current, metric }
export async function checkLimit(tenant_id, metric) {
  const tenant = await db('tenants').where({ id: tenant_id }).first();
  if (!tenant) return { allowed: true };
  if (tenant.sandbox) return { allowed: true }; // sandbox always allowed

  const limits = getPlanLimits(tenant.plan);
  const limit = limits[metric];
  if (limit === -1 || limit === undefined) return { allowed: true }; // unlimited

  const period = currentPeriod();
  const row = await db('usage_counters').where({ tenant_id, metric, period }).first();
  const current = row?.count || 0;

  if (current >= limit) return { allowed: false, metric, limit, current, plan: tenant.plan };
  return { allowed: true };
}

// Middleware factory: block request if tenant is over limit for a metric
// Usage: router.post('/screen', requireUnderLimit('screens'), handler)
export function requireUnderLimit(metric) {
  return async (req, res, next) => {
    if (!req.actor?.tenant_id || req.actor.role === 'super_admin') return next();
    const result = await checkLimit(req.actor.tenant_id, metric);
    if (!result.allowed) {
      return res.status(429).json({
        error: `Monthly ${metric} limit reached`,
        limit: result.limit,
        current: result.current,
        plan: result.plan,
        upgrade_url: `${process.env.APP_URL || ''}/`,
      });
    }
    next();
  };
}

// Get full usage summary with limits for a tenant
export async function getUsageSummary(tenant_id) {
  const tenant = await db('tenants').where({ id: tenant_id }).first();
  if (!tenant) return null;

  const limits = getPlanLimits(tenant.plan);
  const usage = await getUsage(tenant_id);

  // Point-in-time counts (not period-based)
  const [userCount, customerCount] = await Promise.all([
    db('users').where({ tenant_id, active: true }).count({ n: '*' }).first(),
    db('customers').where({ tenant_id }).count({ n: '*' }).first(),
  ]);

  const metrics = {
    screens:      { used: usage.screens || 0,      limit: limits.screens },
    transactions: { used: usage.transactions || 0,  limit: limits.transactions },
    api_calls:    { used: usage.api_calls || 0,     limit: limits.api_calls },
    cases:        { used: usage.cases || 0,          limit: limits.cases },
    users:        { used: Number(userCount?.n || 0), limit: limits.users },
    customers:    { used: Number(customerCount?.n || 0), limit: limits.customers },
  };

  return {
    plan: tenant.plan,
    sandbox: tenant.sandbox || false,
    period: currentPeriod(),
    metrics,
  };
}
