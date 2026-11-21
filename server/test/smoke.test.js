// End-to-end smoke test. Seeds the database, starts the real server, and calls the main endpoints.
// Runs against SQLite by default, or against Postgres when DATABASE_URL is set:
//   npm test
//   DATABASE_URL=postgres://... JWT_SECRET=<32+ chars> npm test
// Use a throwaway database for Postgres runs, never the live one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';

const PORT = 4999;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'SmokeTest-Password-1';
const env = { ...process.env, PORT: String(PORT), SEED_DEMO_PASSWORD: PASSWORD };
let server, token;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

before(async () => {
  execFileSync(process.execPath, ['src/db/seed.js'], { env, stdio: 'ignore' });
  server = spawn(process.execPath, ['src/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', d => process.stderr.write(d));
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  const login = await api('/v1/auth/login', { method: 'POST', body: { email: 'mlro@demobank.ng', password: PASSWORD } });
  assert.equal(login.status, 200, 'login failed');
  token = login.data.token;
});

after(() => server?.kill());

test('name screening finds a sanctioned person', async () => {
  const r = await api('/v1/screen', { method: 'POST', body: { name: 'Nasser Ahmed Qadri' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.notEqual(r.data.outcome, 'clear');
});

test('name screening matches on an alias', async () => {
  const r = await api('/v1/screen', { method: 'POST', body: { name: 'Pyong San Maritime' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.matches.length > 0);
});

test('profile search looks inside aliases (the Nov 4 crash)', async () => {
  const r = await api('/v1/lists/entries?q=pyong%20san');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.some(e => e.primary_name === 'Pyongsan Maritime Ventures'));
});

test('customer onboarding screens the customer', async () => {
  const r = await api('/v1/customers', { method: 'POST', body: { full_name: 'Smoke Test Customer', nationality: 'NG' } });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.data));
});

test('transaction with counterparty screening is blocked on a sanctions hit', async () => {
  const r = await api('/v1/transactions', { method: 'POST', body: { direction: 'debit', amount: 5000, counterparty_name: 'Al Hassan Trading Co', dry_run: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((r.data.transaction || r.data).status, 'blocked');
});

test('server is still alive after all of the above', async () => {
  const r = await api('/health');
  assert.equal(r.status, 200);
});
