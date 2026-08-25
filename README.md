# EdgeVerify

Enterprise AML, sanctions screening, transaction monitoring and KYC risk platform.
Built by Secure Edge Technologies (SETS) on the same stack as Ciphera: Node.js / Express / React 18 / PostgreSQL (Supabase) — with an embedded SQLite mode for standalone or on-premises deployment.

## What it does

| Capability | Where |
|---|---|
| Name screening against 1,259 catalogued sanctions, PEP, watch and wanted lists | `POST /v1/screen`, console → *Screen a name* |
| Customer onboarding: screen → UBO screening → risk score → decision (approve / EDD / reject) | `POST /v1/customers` |
| Daily ongoing monitoring (re-screen every customer against refreshed lists) | `POST /v1/customers/rescreen` (cron) |
| Real-time transaction monitoring with accept / review / reject decisions in <20 ms | `POST /v1/transactions`, `/v1/transactions/ingest/{system}` |
| Fraud detection (device change, velocity, mule fan-in, pass-through, structuring) | built-in rules |
| Custom risky-transaction rules written as JSON, with dry-run back-testing | console → *Rules* |
| Alerts with SLAs, role-gated workflow, cases, STR filing | console → *Alerts & cases* |
| Dashboards: overview, monitoring effectiveness, workload, list coverage | console → *Overview* |
| Tamper-evident (hash-chained) audit log | console → *Audit log* |
| Six roles, multi-tenant, API keys, webhooks | console → *Users & API keys* |

## Quick start (standalone, no external database)

```bash
cd server && npm install && cp .env.example .env
npm run seed          # migrates, loads the list catalogue + demo data
cd ../client && npm install && npm run build
cd ../server && npm start    # http://localhost:4000  (console + API in one process)
```

Demo logins (password `EdgeVerify!2026`): `analyst@demobank.ng`, `mlro@demobank.ng` (compliance officer), `admin@demobank.ng`, `auditor@demobank.ng`, `root@edgeverify.io` (platform operator).
Demo API key: `ev_live_DEMO_KEY_change_me`.

Try it: screen **Dimitri Arkadiev** (1968, RU); simulate a wire to **Al Hassan Trading Company** with destination IR; write a rule and test it against history.

## Hosted / API mode

Set `DATABASE_URL` to a PostgreSQL (Supabase) connection string and the same code runs multi-tenant. Deploy the server without `client/dist` for an API-only footprint. See `docs/ARCHITECTURE.md` and `docs/INTEGRATION.md`.

## Live list feeds

The bundled fixtures are **synthetic demo records**. For production set `LIST_FETCH_ENABLED=true`; OFAC SDN, UN Consolidated and UK OFSI adapters fetch and parse the official feeds. Every other catalogued source can be attached to a CSV/JSON feed URL with a column mapping through the registry.

## Layout

```
data/list_catalog.json    1,259 list sources (code, type, country, region, tier)
server/src/engine/        matcher, risk model, rules engine
server/src/adapters/      list feed parsers, core-banking payload mappers
server/src/modules/       screening, customers, transactions, alerts/cases, lists, dashboards, admin
server/src/db/            Knex migration (SQLite or Postgres), seed
client/src/               React console
docs/                     architecture, integration, benchmark
```
"# edgeverify" 
