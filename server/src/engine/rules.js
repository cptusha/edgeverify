// Declarative transaction-monitoring rule engine.
// A rule definition is JSON so tenants can author custom rules from the UI without code:
// {
//   "when": [ {"field":"amount_base","op":">=","value":10000}, {"field":"tx_type","op":"in","value":["cash"]} ],
//   "aggregate": { "window_hours":24, "group_by":"customer_id", "metric":"sum|count|distinct", "field":"amount_base",
//                  "filter":[...conditions on prior txns...], "op":">=", "value":10000 },
//   "profile": { "field":"risk_level", "op":"in", "value":["high"] }          // customer-profile condition
// }
// All present blocks must pass for the rule to fire.

const OPS = {
  '==': (a, b) => a == b, '!=': (a, b) => a != b, '>': (a, b) => Number(a) > Number(b), '>=': (a, b) => Number(a) >= Number(b),
  '<': (a, b) => Number(a) < Number(b), '<=': (a, b) => Number(a) <= Number(b),
  'in': (a, b) => (b || []).map(String).map(s => s.toLowerCase()).includes(String(a ?? '').toLowerCase()),
  'not_in': (a, b) => !(b || []).map(String).map(s => s.toLowerCase()).includes(String(a ?? '').toLowerCase()),
  'contains': (a, b) => String(a ?? '').toLowerCase().includes(String(b).toLowerCase()),
  'regex': (a, b) => new RegExp(b, 'i').test(String(a ?? '')),
  'between': (a, [lo, hi]) => Number(a) >= lo && Number(a) <= hi,
  'round_amount': (a, b) => Number(a) > 0 && Number(a) % Number(b || 1000) === 0,
  'is_true': (a) => Boolean(a), 'is_false': (a) => !a,
  'exists': (a) => a !== null && a !== undefined && a !== '',
};

export function evalConditions(conds = [], obj = {}) {
  return conds.every(c => {
    const fn = OPS[c.op]; if (!fn) throw new Error(`Unknown operator ${c.op}`);
    return fn(obj[c.field], c.value);
  });
}

/**
 * @param rule rules row (definition parsed)
 * @param tx   the transaction being evaluated (already enriched with amount_base, customer, etc.)
 * @param ctx  { customer, history: prior txns of this customer within max window, countryRisk }
 */
export function evaluateRule(rule, tx, ctx) {
  const def = rule.definition;
  const enriched = { ...tx, counterparty_country_risk: ctx.countryRisk?.[tx.counterparty_country]?.score ?? 0,
    destination_country_risk: ctx.countryRisk?.[tx.destination_country]?.score ?? 0,
    is_new_counterparty: !ctx.history.some(h => h.counterparty_account && h.counterparty_account === tx.counterparty_account),
    days_since_last_activity: ctx.history.length ? (new Date(tx.occurred_at) - new Date(Math.max(...ctx.history.map(h => +new Date(h.occurred_at))))) / 86400e3 : null,
    has_history: ctx.history.length > 0,
    is_cross_border: Boolean(tx.counterparty_country && ctx.homeCountry && tx.counterparty_country.toUpperCase() !== ctx.homeCountry.toUpperCase())
      || Boolean(tx.destination_country && ctx.homeCountry && tx.destination_country.toUpperCase() !== ctx.homeCountry.toUpperCase()),
    device_changed: ctx.history.length > 0 && tx.device_id && !ctx.history.some(h => h.device_id === tx.device_id),
    hour_of_day: new Date(tx.occurred_at).getUTCHours(),
  };
  if (def.when && !evalConditions(def.when, enriched)) return null;
  if (def.profile && !evalConditions([def.profile].flat(), ctx.customer || {})) return null;

  let aggValue = null;
  if (def.aggregate) {
    const a = def.aggregate; const since = +new Date(tx.occurred_at) - a.window_hours * 3600e3;
    let set = ctx.history.filter(h => +new Date(h.occurred_at) >= since);
    if (a.filter) set = set.filter(h => evalConditions(a.filter, h));
    if (a.include_current !== false) set = [...set, enriched];
    if (a.metric === 'count') aggValue = set.length;
    else if (a.metric === 'sum') aggValue = set.reduce((s, h) => s + Number(h[a.field || 'amount_base'] || 0), 0);
    else if (a.metric === 'distinct') aggValue = new Set(set.map(h => h[a.field])).size;
    else if (a.metric === 'ratio_in_out') {
      const inn = set.filter(h => h.direction === 'credit').reduce((s, h) => s + Number(h.amount_base || 0), 0);
      const out = set.filter(h => h.direction === 'debit').reduce((s, h) => s + Number(h.amount_base || 0), 0);
      aggValue = inn >= (a.min_inflow || 0) && inn > 0 ? out / inn : 0;
    }
    if (!OPS[a.op](aggValue, a.value)) return null;
  }
  const sevScore = { low: 15, medium: 35, high: 60, critical: 90 }[rule.severity] || 35;
  return { rule_code: rule.code, rule_name: rule.name, severity: rule.severity, action: rule.action, score: sevScore,
    explanation: buildExplanation(rule, enriched, aggValue) };
}

function buildExplanation(rule, tx, aggValue) {
  const parts = [rule.description || rule.name];
  if (aggValue !== null && rule.definition.aggregate) {
    const a = rule.definition.aggregate;
    parts.push(`${a.metric}(${a.field || 'txns'}) over ${a.window_hours}h = ${Number(aggValue).toLocaleString()} ${a.op} ${a.value}`);
  }
  if (tx.amount_base) parts.push(`amount ${Number(tx.amount_base).toLocaleString()} (base)`);
  return parts.join(' · ');
}

export function evaluateAll(rules, tx, ctx) {
  const hits = [];
  for (const r of rules) { if (!r.enabled) continue; try { const h = evaluateRule(r, tx, ctx); if (h) hits.push(h); } catch (e) { hits.push({ rule_code: r.code, error: e.message }); } }
  const score = Math.min(100, hits.filter(h => !h.error).reduce((s, h) => s + h.score, 0));
  const actions = hits.map(h => h.action);
  const status = actions.includes('block') ? 'blocked' : actions.includes('hold') ? 'held' : hits.length ? 'flagged' : 'cleared';
  return { hits, score, status };
}

// Built-in rule library — seeded for every new tenant; all editable.
export const BUILTIN_RULES = [
  { code: 'CTR-THRESHOLD', name: 'Cash above reporting threshold', category: 'aml', severity: 'high', action: 'alert',
    description: 'Single cash transaction at or above the local CTR threshold',
    definition: { when: [{ field: 'tx_type', op: 'in', value: ['cash'] }, { field: 'amount_base', op: '>=', value: 10000 }] } },
  { code: 'STRUCTURING-24H', name: 'Structuring / smurfing', category: 'aml', severity: 'high', action: 'alert',
    description: 'Multiple sub-threshold cash transactions that together exceed the threshold within 24h',
    definition: { when: [{ field: 'tx_type', op: 'in', value: ['cash'] }, { field: 'amount_base', op: 'between', value: [3000, 9999.99] }],
      aggregate: { window_hours: 24, metric: 'sum', field: 'amount_base', filter: [{ field: 'tx_type', op: 'in', value: ['cash'] }], op: '>=', value: 10000 } } },
  { code: 'HIGH-RISK-GEO', name: 'Transfer to/from high-risk jurisdiction', category: 'aml', severity: 'high', action: 'alert',
    description: 'Cross-border payment where counterparty or destination country scores ≥ 70 (FATF grey/black or EU high-risk)',
    definition: { when: [{ field: 'amount_base', op: '>=', value: 1000 }], profile: [], aggregate: null,
      any_of: null, // reserved
      geo: true }, },
  { code: 'VELOCITY-COUNT', name: 'Transaction velocity spike', category: 'fraud', severity: 'medium', action: 'alert',
    description: '15 or more transactions in 1 hour',
    definition: { aggregate: { window_hours: 1, metric: 'count', op: '>=', value: 15 } } },
  { code: 'RAPID-PASSTHROUGH', name: 'Rapid movement of funds (pass-through)', category: 'aml', severity: 'high', action: 'alert',
    description: 'Funds leave within 48h of arriving; outflow ≥ 80% of inflow',
    definition: { when: [{ field: 'direction', op: '==', value: 'debit' }, { field: 'amount_base', op: '>=', value: 5000 }], aggregate: { window_hours: 48, metric: 'ratio_in_out', min_inflow: 10000, op: '>=', value: 0.8 } } },
  { code: 'DORMANT-REACTIVATION', name: 'Dormant account reactivation', category: 'aml', severity: 'medium', action: 'alert',
    description: 'No activity for 180+ days followed by a transaction ≥ 5,000',
    definition: { when: [{ field: 'days_since_last_activity', op: '>=', value: 180 }, { field: 'amount_base', op: '>=', value: 5000 }] } },
  { code: 'ROUND-AMOUNT-WIRE', name: 'Large round-amount international wire', category: 'aml', severity: 'low', action: 'alert',
    description: 'International wire in an exact multiple of 10,000',
    definition: { when: [{ field: 'tx_type', op: 'in', value: ['wire'] }, { field: 'amount_base', op: 'round_amount', value: 10000 }, { field: 'amount_base', op: '>=', value: 50000 }] } },
  { code: 'NEW-BENEFICIARY-LARGE', name: 'Large payment to a new beneficiary', category: 'fraud', severity: 'medium', action: 'hold',
    description: 'First-ever payment to this counterparty account and amount ≥ 20,000',
    definition: { when: [{ field: 'direction', op: '==', value: 'debit' }, { field: 'is_new_counterparty', op: 'is_true' }, { field: 'amount_base', op: '>=', value: 20000 }] } },
  { code: 'DEVICE-CHANGE-SPIKE', name: 'New device + amount spike', category: 'fraud', severity: 'high', action: 'hold',
    description: 'Transaction from a device never seen on this customer, amount ≥ 10,000 (account takeover pattern)',
    definition: { when: [{ field: 'device_changed', op: 'is_true' }, { field: 'amount_base', op: '>=', value: 10000 }] } },
  { code: 'MULE-FANIN', name: 'Money-mule fan-in', category: 'fraud', severity: 'high', action: 'alert',
    description: '10+ distinct senders credit the account within 72h',
    definition: { when: [{ field: 'direction', op: '==', value: 'credit' }], aggregate: { window_hours: 72, metric: 'distinct', field: 'counterparty_account', filter: [{ field: 'direction', op: '==', value: 'credit' }], op: '>=', value: 10 } } },
  { code: 'HIGH-RISK-CUSTOMER-LARGE', name: 'High-risk customer large transaction', category: 'aml', severity: 'medium', action: 'alert',
    description: 'Customer rated high/prohibited transacts ≥ 5,000',
    definition: { when: [{ field: 'amount_base', op: '>=', value: 5000 }], profile: { field: 'risk_level', op: 'in', value: ['high', 'prohibited'] } } },
  { code: 'PEP-OUTBOUND', name: 'PEP outbound transfer', category: 'aml', severity: 'medium', action: 'alert',
    description: 'Any outbound transfer by a PEP ≥ 2,000',
    definition: { when: [{ field: 'direction', op: '==', value: 'debit' }, { field: 'amount_base', op: '>=', value: 2000 }], profile: { field: 'is_pep', op: 'is_true' } } },
  { code: 'CRYPTO-OFFRAMP', name: 'Crypto off-ramp above threshold', category: 'aml', severity: 'medium', action: 'alert',
    description: 'Crypto-related transaction ≥ 3,000',
    definition: { when: [{ field: 'tx_type', op: 'in', value: ['crypto'] }, { field: 'amount_base', op: '>=', value: 3000 }] } },
  { code: 'NIGHT-CASH', name: 'Unusual-hour cash withdrawal', category: 'fraud', severity: 'low', action: 'alert',
    description: 'Cash debit between 00:00–04:59 UTC ≥ 2,000',
    definition: { when: [{ field: 'tx_type', op: 'in', value: ['cash'] }, { field: 'direction', op: '==', value: 'debit' }, { field: 'hour_of_day', op: 'between', value: [0, 4] }, { field: 'amount_base', op: '>=', value: 2000 }] } },
];
// HIGH-RISK-GEO uses derived risk fields; express it declaratively:
BUILTIN_RULES.find(r => r.code === 'HIGH-RISK-GEO').definition = {
  when: [{ field: 'amount_base', op: '>=', value: 1000 }, { field: 'is_cross_border', op: 'is_true' }],
  any_geo: true,
};
// Support "any_geo" by expanding into two rule variants at seed time (counterparty OR destination).
export function expandBuiltins() {
  const out = [];
  for (const r of BUILTIN_RULES) {
    if (r.definition.any_geo) {
      out.push({ ...r, code: r.code + '-CP', name: r.name + ' (counterparty)', definition: { when: [...r.definition.when, { field: 'counterparty_country_risk', op: '>=', value: 70 }] } });
      out.push({ ...r, code: r.code + '-DEST', name: r.name + ' (destination)', definition: { when: [...r.definition.when, { field: 'destination_country_risk', op: '>=', value: 70 }] } });
    } else out.push(r);
  }
  return out;
}
