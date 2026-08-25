// KYC customer risk assessment. Weights are per-tenant configurable (tenants.risk_config).
export const DEFAULT_RISK_CONFIG = {
  weights: {
    country: 25, pep: 25, sanctions: 40, adverse_media: 15, occupation: 10, industry: 10, product: 10, channel: 8, turnover: 7, entity: 5,
  },
  thresholds: { low: 25, medium: 50, high: 75 }, // ≥high → 'high', ≥medium → 'medium', else low; ≥ 90 → 'prohibited'
  highRiskOccupations: ['politician', 'arms dealer', 'casino', 'money service', 'bureau de change', 'precious metals', 'real estate agent', 'lawyer', 'notary', 'crypto'],
  highRiskIndustries: ['gambling', 'casino', 'crypto', 'virtual assets', 'arms', 'defence', 'mining', 'oil', 'gas', 'remittance', 'msb', 'ngo', 'charity', 'shell', 'cash intensive', 'real estate', 'precious'],
  highRiskProducts: ['correspondent banking', 'private banking', 'trade finance', 'crypto', 'prepaid card', 'international wire', 'cash', 'foreign exchange'],
  highRiskChannels: ['non_face_to_face', 'agent', 'third_party', 'crypto_exchange'],
  reviewCycleDays: { low: 730, medium: 365, high: 180, prohibited: 0 },
};

export function assessRisk(customer, ctx, cfg = DEFAULT_RISK_CONFIG) {
  const w = cfg.weights; const factors = []; let score = 0;
  const add = (points, label, detail) => { score += points; factors.push({ factor: label, points, detail }); };

  const c = ctx.countryRisk || {};
  const cr = Math.max(c[customer.nationality]?.score || 0, c[customer.residence_country]?.score || 0);
  if (cr) add(Math.round(w.country * cr / 100), 'geography', `country risk ${cr}/100 (${customer.nationality || '?'} / ${customer.residence_country || '?'})`);
  const fatfBlack = [customer.nationality, customer.residence_country].some(k => c[k]?.fatf_blacklist);
  const fatfGrey = [customer.nationality, customer.residence_country].some(k => c[k]?.fatf_greylist);
  if (fatfBlack) add(30, 'fatf_blacklist', 'FATF call-for-action jurisdiction');
  else if (fatfGrey) add(10, 'fatf_greylist', 'FATF increased-monitoring jurisdiction');

  if (customer.is_pep) add(w.pep, 'pep', 'Politically exposed person');
  else if (customer.is_rca) add(Math.round(w.pep * 0.7), 'rca', 'Relative or close associate of a PEP');
  else if (customer.is_sip) add(Math.round(w.pep * 0.5), 'sip', 'Special interest person');

  if (ctx.sanctionsHit) add(w.sanctions, 'sanctions', `Confirmed/potential sanctions match (${ctx.sanctionsHit})`);
  if (customer.adverse_media) add(w.adverse_media, 'adverse_media', 'Adverse media present');

  const lc = (s) => String(s || '').toLowerCase();
  if (cfg.highRiskOccupations.some(o => lc(customer.occupation).includes(o))) add(w.occupation, 'occupation', customer.occupation);
  if (cfg.highRiskIndustries.some(o => lc(customer.industry).includes(o))) add(w.industry, 'industry', customer.industry);
  const prods = (customer.products || []).map(lc);
  const hp = prods.filter(p => cfg.highRiskProducts.some(h => p.includes(h)));
  if (hp.length) add(Math.min(w.product * hp.length, w.product * 2), 'products', hp.join(', '));
  if (cfg.highRiskChannels.includes(lc(customer.channel))) add(w.channel, 'channel', customer.channel);
  const turn = Number(customer.expected_monthly_turnover || 0);
  if (turn > 1_000_000) add(w.turnover, 'turnover', 'Expected turnover > 1M base units');
  else if (turn > 100_000) add(Math.round(w.turnover / 2), 'turnover', 'Expected turnover > 100k base units');
  if (customer.customer_type === 'business') {
    const ubos = customer.ubos || [];
    if (!ubos.length) add(w.entity, 'ubo', 'No beneficial owners declared');
    if (ubos.some(u => u.is_pep)) add(Math.round(w.pep * 0.8), 'ubo_pep', 'A beneficial owner is a PEP');
    if (ubos.length > 4) add(3, 'ownership_complexity', 'Complex ownership (>4 UBOs)');
  }

  score = Math.min(100, score);
  const t = cfg.thresholds;
  const level = score >= 90 || ctx.sanctionsHit === 'confirmed' ? 'prohibited' : score >= t.high ? 'high' : score >= t.medium ? 'medium' : 'low';
  const days = cfg.reviewCycleDays[level] ?? 365;
  const next_review_at = days ? new Date(Date.now() + days * 86400e3).toISOString() : null;
  const edd_required = level === 'high' || level === 'prohibited' || customer.is_pep;
  return { score, level, factors, next_review_at, edd_required };
}
