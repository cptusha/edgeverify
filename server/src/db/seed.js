import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from './knex.js';
import { up } from './migrations/001_init.js';
import { expandBuiltins } from '../engine/rules.js';
import { normalizeName } from '../engine/normalize.js';
import { FIXTURES } from '../fixtures/index.js';
import { registerFixtures, syncSource } from '../modules/lists.js';
import { hashKey } from '../middleware/auth.js';

await up(db);
registerFixtures(FIXTURES);

// 1. List registry from the catalogue (1,259 sources)
const catalog = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', 'data', 'list_catalog.json'), 'utf8'));
const existing = new Set((await db('list_sources').select('code')).map(r => r.code));
const ADAPTER = { 'LS-7D41BF56': 'ofac_sdn', 'LS-5A022320': 'un_consolidated', 'LS-B0D28FB5': 'uk_ofsi' };
const URLS = { 'LS-7D41BF56': 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML', 'LS-5A022320': 'https://scsanctions.un.org/resources/xml/en/consolidated.xml', 'LS-B0D28FB5': 'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv' };
const rows = catalog.filter(c => !existing.has(c.code)).map(c => ({ code: c.code, slug: c.slug, name: c.name, list_type: c.list_type, country: c.country, region: c.region, tier: c.tier, origin: c.origin,
  adapter: ADAPTER[c.code] || 'generic', source_url: URLS[c.code] || null, refresh_hours: c.refresh_hours, enabled: Boolean(FIXTURES[c.code]) || Boolean(URLS[c.code]) }));
if (rows.length > 0) {
  for (let i = 0; i < rows.length; i += 200) await db('list_sources').insert(rows.slice(i, i + 200));
}
if (!existing.has('LS-PEP-GLOBAL')) await db('list_sources').insert({ code: 'LS-PEP-GLOBAL', slug: 'edgeverify-pep-register', name: 'EdgeVerify Global PEP / RCA / SIP Register', list_type: 'PEP', country: 'International', region: 'International', tier: 1, origin: 'EdgeVerify', adapter: 'generic', refresh_hours: 24, enabled: true });
console.log(`list registry: ${rows.length} new sources (${catalog.length} total in catalogue); sources with a bundled feed are enabled, the rest are one click away`);

// 2. Country risk baseline (FATF Feb-2025 style lists + Basel-index-like scores; tenants can edit)
const CR = [['KP', "North Korea", 100, 1, 0], ['IR', 'Iran', 98, 1, 0], ['MM', 'Myanmar', 95, 1, 0], ['SY', 'Syria', 92, 0, 1], ['YE', 'Yemen', 88, 0, 1], ['AF', 'Afghanistan', 90, 0, 0], ['RU', 'Russia', 85, 0, 0], ['BY', 'Belarus', 80, 0, 0],
  ['NG', 'Nigeria', 72, 0, 1], ['ZA', 'South Africa', 65, 0, 1], ['KE', 'Kenya', 66, 0, 1], ['VN', 'Vietnam', 64, 0, 1], ['BG', 'Bulgaria', 60, 0, 1], ['HT', 'Haiti', 78, 0, 1], ['VE', 'Venezuela', 82, 0, 1], ['LB', 'Lebanon', 75, 0, 1], ['ML', 'Mali', 74, 0, 1], ['MZ', 'Mozambique', 68, 0, 1],
  ['SO', 'Somalia', 88, 0, 0], ['LY', 'Libya', 84, 0, 0], ['SS', 'South Sudan', 86, 0, 1], ['CD', 'DR Congo', 80, 0, 1], ['IQ', 'Iraq', 76, 0, 0], ['PK', 'Pakistan', 62, 0, 0], ['CN', 'China', 55, 0, 0], ['AE', 'UAE', 50, 0, 0], ['TR', 'Turkey', 52, 0, 0], ['PA', 'Panama', 48, 0, 0], ['CY', 'Cyprus', 42, 0, 0],
  ['GH', 'Ghana', 45, 0, 0], ['EG', 'Egypt', 50, 0, 0], ['IN', 'India', 40, 0, 0], ['BR', 'Brazil', 42, 0, 0], ['MX', 'Mexico', 48, 0, 0], ['US', 'United States', 20, 0, 0], ['GB', 'United Kingdom', 18, 0, 0], ['DE', 'Germany', 15, 0, 0], ['FR', 'France', 17, 0, 0], ['CA', 'Canada', 15, 0, 0], ['AU', 'Australia', 14, 0, 0],
  ['SG', 'Singapore', 22, 0, 0], ['JP', 'Japan', 16, 0, 0], ['CH', 'Switzerland', 25, 0, 0], ['NL', 'Netherlands', 16, 0, 0], ['SA', 'Saudi Arabia', 45, 0, 0], ['QA', 'Qatar', 40, 0, 0], ['KW', 'Kuwait', 44, 0, 0], ['SE', 'Sweden', 12, 0, 0], ['NO', 'Norway', 12, 0, 0], ['ES', 'Spain', 20, 0, 0], ['IT', 'Italy', 24, 0, 0]];
const crExisting = new Set((await db('country_risk').select('iso2')).map(r => r.iso2));
const crRows = CR.filter(c => !crExisting.has(c[0])).map(([iso2, name, score, b, g]) => ({ iso2, name, score, band: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low', fatf_blacklist: !!b, fatf_greylist: !!g, eu_high_risk: !!b || !!g }));
if (crRows.length > 0) await db('country_risk').insert(crRows);

// 3. Demo tenant, users, API key, rules
const tenantId = 'tnt_demo_bank';
if (!(await db('tenants').where({ id: tenantId }).first())) {
  await db('tenants').insert({ id: tenantId, name: 'Demo Bank Nigeria PLC', plan: 'enterprise', settings: JSON.stringify({ base_currency: 'USD', screening_threshold: 80, core_banking: 'finacle', jurisdiction: 'NG', regulator: 'CBN / NFIU' }) });
  const users = [['admin@demobank.ng', 'Prusha (Admin)', 'tenant_admin'], ['mlro@demobank.ng', 'Funke Adeyemi (MLRO)', 'compliance_officer'], ['analyst@demobank.ng', 'Tobi Okon (Analyst)', 'analyst'], ['auditor@demobank.ng', 'Internal Audit', 'auditor']];
  for (const [email, name, role] of users) await db('users').insert({ id: uuid(), tenant_id: tenantId, email, name, role, password_hash: await bcrypt.hash('EdgeVerify!2026', 10) });
  await db('users').insert({ id: uuid(), tenant_id: null, email: 'root@edgeverify.io', name: 'Platform Operator', role: 'super_admin', password_hash: await bcrypt.hash('EdgeVerify!2026', 10) });
  await db('api_keys').insert({ id: uuid(), tenant_id: tenantId, label: 'Finacle integration (demo)', key_hash: hashKey('ev_live_DEMO_KEY_change_me'), prefix: 'ev_live_DEMO', scopes: JSON.stringify(['screen', 'transactions', 'customers']) });
  for (const r of expandBuiltins()) await db('rules').insert({ id: uuid(), tenant_id: tenantId, code: r.code, name: r.name, description: r.description, category: r.category, severity: r.severity, action: r.action, definition: JSON.stringify(r.definition), enabled: true, created_by: 'system' });
  console.log('demo tenant created: users admin@/mlro@/analyst@/auditor@demobank.ng, root@edgeverify.io — password EdgeVerify!2026; API key ev_live_DEMO_KEY_change_me');
}

// 4. Load fixture lists
for (const src of await db('list_sources').where({ enabled: true })) { const r = await syncSource({ ...src, fixture: FIXTURES[src.code] }); if (r.status === 'ok') console.log(`  loaded ${r.entries} entries → ${src.name}`); }

// 5. Demo customers (screened + scored via the real onboarding path) and transaction history
const { onboardOrRescore } = await import('../modules/customers.js');
const { monitorTransaction } = await import('../modules/transactions.js');
if (!(await db('customers').where({ tenant_id: tenantId }).first())) {
  const demo = [
    { external_ref: 'CIF-100001', customer_type: 'individual', full_name: 'Adaobi Grace Nwachukwu', dob: '1990-03-12', nationality: 'NG', residence_country: 'NG', occupation: 'Software engineer', products: ['savings', 'debit card'], channel: 'face_to_face', expected_monthly_turnover: 2500 },
    { external_ref: 'CIF-100002', customer_type: 'individual', full_name: 'Seun Falana', dob: '1963-02-14', nationality: 'NG', residence_country: 'NG', occupation: 'Politician', products: ['current account', 'international wire'], channel: 'face_to_face', expected_monthly_turnover: 150000 },
    { external_ref: 'CIF-100003', customer_type: 'business', full_name: 'Alhassan Trading Co Ltd', nationality: 'AE', residence_country: 'NG', industry: 'Import/export general trading', products: ['trade finance', 'foreign exchange'], channel: 'agent', expected_monthly_turnover: 900000, ubos: [{ name: 'Yusuf Alhassan', share: 60, nationality: 'AE' }, { name: 'Ibrahim Danladi', share: 40, nationality: 'NG' }] },
    { external_ref: 'CIF-100004', customer_type: 'individual', full_name: 'Emeka Nwosu', dob: '1988-01-15', nationality: 'NG', residence_country: 'GB', occupation: 'Crypto trader', products: ['crypto'], channel: 'non_face_to_face', expected_monthly_turnover: 60000 },
    { external_ref: 'CIF-100005', customer_type: 'business', full_name: 'Lekki Logistics Services Ltd', nationality: 'NG', residence_country: 'NG', industry: 'Logistics', products: ['current account'], channel: 'face_to_face', expected_monthly_turnover: 40000, ubos: [{ name: 'Chidi Okeke', share: 100, nationality: 'NG' }] },
    { external_ref: 'CIF-100006', customer_type: 'individual', full_name: 'Charlotte Whitmore', dob: '1968-04-18', nationality: 'GB', residence_country: 'GB', occupation: 'Civil servant', products: ['savings'], channel: 'face_to_face', expected_monthly_turnover: 8000 },
    { external_ref: 'CIF-100007', customer_type: 'individual', full_name: 'Kwame Owusu Ansah', dob: '1995-07-07', nationality: 'GH', residence_country: 'GH', occupation: 'Teacher', products: ['mobile money'], channel: 'agent', expected_monthly_turnover: 900 },
    { external_ref: 'CIF-100008', customer_type: 'individual', full_name: 'Dmitry Arkadiev', dob: '1968-04-12', nationality: 'RU', residence_country: 'CY', occupation: 'Investor', products: ['private banking'], channel: 'non_face_to_face', expected_monthly_turnover: 2000000 },
  ];
  const ids = {};
  for (const d of demo) {
    const row = { id: uuid(), tenant_id: tenantId, ...d, name_normalized: normalizeName(d.full_name), products: JSON.stringify(d.products || []), ubos: JSON.stringify(d.ubos || []) };
    await db('customers').insert(row); ids[d.external_ref] = row.id;
    await onboardOrRescore(tenantId, { ...row, products: d.products || [], ubos: d.ubos || [] }, 'seed', { screen: true });
  }
  const day = (n, h = 10) => new Date(Date.now() - n * 86400e3 + h * 3600e3 - 10 * 3600e3).toISOString();
  const txs = [];
  for (let i = 30; i > 0; i--) txs.push({ customer_id: ids['CIF-100001'], account_id: 'ACC-1', direction: i % 5 === 0 ? 'credit' : 'debit', tx_type: i % 5 === 0 ? 'transfer' : 'card', amount: 15000 + (i * 1337) % 40000, currency: 'NGN', counterparty_name: 'Shoprite Lekki', counterparty_account: 'MERCH-0' + (i % 3), counterparty_country: 'NG', channel: 'pos', device_id: 'dev-A', occurred_at: day(i) });
  for (let i = 40; i > 0; i -= 2) txs.push({ customer_id: ids['CIF-100005'], account_id: 'ACC-5', direction: 'credit', tx_type: 'transfer', amount: 2_000_000 + (i * 91) % 900000, currency: 'NGN', counterparty_name: 'Dangote Cement Distributors', counterparty_account: 'DCD-1', counterparty_country: 'NG', channel: 'nip', occurred_at: day(i) });
  for (let k = 0; k < 4; k++) txs.push({ customer_id: ids['CIF-100003'], account_id: 'ACC-3', direction: 'credit', tx_type: 'cash', amount: 9500, currency: 'USD', channel: 'branch', occurred_at: day(2, 9 + k) });
  txs.push({ customer_id: ids['CIF-100004'], account_id: 'ACC-4', direction: 'credit', tx_type: 'transfer', amount: 48000, currency: 'GBP', counterparty_name: 'Bright Star Ventures', counterparty_account: 'GB29NWBK60161331926819', counterparty_country: 'GB', channel: 'faster_payments', occurred_at: day(1, 8) });
  txs.push({ customer_id: ids['CIF-100004'], account_id: 'ACC-4', direction: 'debit', tx_type: 'crypto', amount: 45000, currency: 'GBP', counterparty_name: 'Binance Exchange', counterparty_account: 'binance-hot-01', counterparty_country: 'AE', channel: 'crypto_exchange', device_id: 'dev-new-iphone', occurred_at: day(1, 11) });
  txs.push({ customer_id: ids['CIF-100008'], account_id: 'ACC-8', direction: 'debit', tx_type: 'wire', amount: 250000, currency: 'USD', counterparty_name: 'Al Hasan Trading Company', counterparty_account: 'AE07033100000000000000', counterparty_country: 'AE', destination_country: 'IR', channel: 'swift', occurred_at: day(0, 9) });
  txs.push({ customer_id: ids['CIF-100002'], account_id: 'ACC-2', direction: 'debit', tx_type: 'wire', amount: 120000, currency: 'USD', counterparty_name: 'Hudson Realty Partners', counterparty_account: 'US-HRP-1', counterparty_country: 'US', destination_country: 'US', channel: 'swift', occurred_at: day(3, 14) });
  txs.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  for (const t of txs) await monitorTransaction(tenantId, { ...t, screen_counterparty: true }, 'seed');
  console.log(`demo data: ${demo.length} customers, ${txs.length} transactions`);
}
await db.destroy();
console.log('seed complete');