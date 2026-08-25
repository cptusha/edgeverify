# Architecture

## Deployment topologies

1. **Standalone appliance** — one Node process serves the API and the built console, backed by embedded SQLite. Suits a single bank, on-prem or air-gapped (lists loaded from files). `docker compose up` gives this in one container.
2. **API integration** — the server without the console, called by core banking / onboarding systems with API keys. The bank uses its own case-management UI, or the console for compliance only.
3. **Hosted SaaS** — the same code with `DATABASE_URL` pointing at PostgreSQL/Supabase; every business table carries `tenant_id`, and the JWT / API key carries the tenant. A `super_admin` may act across tenants via `x-tenant-id`.

## Request path for a transaction

```
core banking ──► /v1/transactions/ingest/{finacle|t24|flexcube|mambu|finastra|bankone|nip|iso20022}
                  │ mapper → canonical transaction
                  │ FX to tenant base currency
                  │ load customer + 90-day history + tenant rules + country risk
                  │ rules engine (conditions, profile, windowed aggregates)
                  │ real-time counterparty screening (sanctions lists)
                  ▼
        decision ACCEPT | REVIEW (hold) | REJECT (block)   ← returned synchronously, typically < 20 ms
                  │
                  ├─ transaction persisted with rule hits, score, latency
                  ├─ alert(s) emitted with severity-based SLA
                  ├─ webhooks (HMAC-signed) → SIEM / case tool
                  └─ audit entry (hash-chained)
```

## Screening

Candidate pre-filter in SQL (normalised token / phonetic key overlap), then in-memory scoring:
`0.45 × aligned token Jaro-Winkler + 0.25 × sorted-token similarity + 0.15 × phonetic (Double Metaphone) + 0.15 × whole-string`, adjusted by DOB (year/full), nationality, and entity-type agreement. Threshold is per tenant (default 80); ≥ 95 is a confirmed match. All screenings are persisted with the full match set for audit.

## Risk model

Additive weighted factors (`DEFAULT_RISK_CONFIG`, editable per tenant): residence and nationality country risk (FATF / EU high-risk aware), PEP / RCA / SIP status, sanctions or wanted hits, occupation, industry, products, channel, turnover vs. expectation, UBO findings, adverse media. Output: score 0-100, level low / medium / high / prohibited, EDD flag, next review date (12 / 6 / 3 months).

## Lists

`list_sources` holds the 1,259-source catalogue plus tenant-added feeds. `list_entries` is the normalised profile store (names, aliases, DOBs, nationalities, identifiers, programmes, PEP tier/role/RCA link). Sync is scheduled per source (`refresh_hours`); the ongoing-monitoring job re-screens the customer base after refresh so new designations surface the same day.

## Security & assurance

- Roles: `super_admin`, `tenant_admin`, `compliance_officer`, `analyst`, `auditor`, `api_client`; state transitions on alerts are role-gated (only officers confirm true positives / file STRs).
- Audit log is append-only with `hash = sha256(prev_hash ‖ entry)`; `GET /v1/admin/audit/verify` recomputes the chain.
- Sensitive ID numbers are stored hashed with last-4 only; API keys are stored hashed and shown once.
- Helmet, CORS allow-list, rate limiting, Zod validation on every write.

## Scaling notes

- Screening is CPU-bound and stateless after prefilter → scale API replicas horizontally; move the prefilter to Postgres trigram / full-text indexes at > ~1M list entries.
- Move list sync and daily re-screening to a worker process (BullMQ/Redis) at multi-tenant scale.
- Transaction history aggregates can be pre-computed into a rolling-window table for > 1k TPS.
