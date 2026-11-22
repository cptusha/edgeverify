/**
 * Plan definitions and limit enforcement.
 *
 * Each plan specifies hard limits per billing period (calendar month).
 * Sandbox tenants are exempt from all limits and their usage is not counted.
 *
 * Metrics tracked:
 *   screens          — POST /v1/screen calls
 *   transactions     — transactions ingested (POST /v1/transactions or adapters)
 *   api_calls        — all authenticated API requests (excluding health/static)
 *   cases            — open cases at any point in the month
 *   users            — active users (checked at invite time, not monthly)
 *   customers        — total KYC customer records
 *
 * -1 = unlimited
 */
export const PLANS = {
  startup: {
    label: 'Startup',
    limits: {
      screens: 500,
      transactions: 2_000,
      api_calls: 10_000,
      cases: 50,
      users: 5,
      customers: 500,
    },
  },
  growth: {
    label: 'Growth',
    limits: {
      screens: 5_000,
      transactions: 25_000,
      api_calls: 100_000,
      cases: 500,
      users: 20,
      customers: 10_000,
    },
  },
  enterprise: {
    label: 'Enterprise',
    limits: {
      screens: -1,
      transactions: -1,
      api_calls: -1,
      cases: -1,
      users: -1,
      customers: -1,
    },
  },
};

export function getPlanLimits(plan) {
  return PLANS[plan]?.limits || PLANS.enterprise.limits;
}

export function currentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
