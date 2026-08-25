# Integration guide

Authenticate with `x-api-key: <key>` (generated in *Users & API keys*) or a user JWT.

## 1. Onboarding

```http
POST /v1/customers
{ "external_ref":"CIF-1001", "customer_type":"individual", "full_name":"…", "dob":"1990-03-12",
  "nationality":"NG", "residence_country":"NG", "occupation":"…", "products":["savings"],
  "channel":"face_to_face", "expected_monthly_turnover":2500, "ubos":[{"name":"…","share":60}] }
→ { id, risk:{score,level,edd_required,factors,next_review_at}, kyc_status, screening:{outcome,matches} }
```

## 2. Ad-hoc screening

```http
POST /v1/screen        { "name":"…", "dob":"1968", "nationality":"RU", "threshold":80 }
POST /v1/screen/batch  { "queries":[ … up to 500 … ] }
```

## 3. Real-time transactions

Canonical: `POST /v1/transactions` with `customer_id | external_ref`, `direction`, `tx_type`, `amount`, `currency`, `counterparty_*`, `destination_country`, `channel`, `device_id`, `occurred_at`. Add `"dry_run": true` to evaluate without posting.

Native payloads: `POST /v1/transactions/ingest/{system}` accepts the system's own JSON and maps it:

| system | mapper notes |
|---|---|
| `finacle` | TranId, CustId, AcctId, PartTranType (C/D), TranAmt, TranCrncyCode, Channel |
| `t24` | FT record fields (DEBIT/CREDIT ACCT, AMOUNT, CURRENCY, BENEFICIARY) |
| `flexcube` | XREF, CUST_NO, TXN_AMOUNT, TXN_CCY, DR_CR |
| `mambu` | Mambu transaction JSON (`type`, `amount`, `currencyCode`, `accountKey`) |
| `finastra` | Fusion Essence / Equation payment JSON |
| `bankone` | BankOne (Nigeria) transaction JSON |
| `nip` | NIBSS Instant Payment message (name enquiry / fund transfer) |
| `iso20022` | pacs.008 / pain.001 flattened JSON |

Response: `{ decision: "ACCEPT"|"REVIEW"|"REJECT", status, risk_score, hits:[{rule_code,severity,explanation}], counterparty_screening, latency_ms }`. Map REVIEW to a hold queue and REJECT to a decline in the core.

## 4. Ongoing monitoring

Schedule `POST /v1/customers/rescreen` daily after list refresh (or rely on the in-process scheduler, `LIST_REFRESH_CRON_MINUTES`).

## 5. Webhooks

Register a URL for `alert.created`, `alert.transitioned`, `transaction.blocked`, `list.synced`. Payloads carry `X-EdgeVerify-Signature: sha256=<HMAC>` using the webhook secret.

## 6. Adding a local list

`POST /v1/lists/sources` with `name`, `list_type`, `country`, `source_url`, `adapter:"generic"`, and a column `mapping` (e.g. `{ "name":"Full Name", "dob":"DOB", "nationality":"Country" }`), then `POST /v1/lists/sources/{code}/sync`.
