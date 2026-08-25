# Benchmark: EdgeVerify vs. established vendors

Comparison is against the vendors' publicly described capabilities as of early 2026 (Sanction Scanner, ComplyAdvantage, MetaMap, LexisNexis Bridger, Refinitiv World-Check). A live web check returned nothing usable, so treat vendor columns as "typical positioning" to be re-verified before use in a sales deck.

| Dimension | Sanction Scanner | ComplyAdvantage | MetaMap | EdgeVerify (this build) |
|---|---|---|---|---|
| Sanctions / watchlist sources | ~3,000+ lists, proprietary data | Proprietary + adverse media | Focused on LATAM/identity | 1,259 catalogued; official feeds for OFAC/UN/OFSI; any local list via CSV/JSON adapter |
| PEP / RCA / SIP | Yes (own database) | Yes (own database) | Partial | Data model + register in place; needs a licensed or curated PEP feed for production |
| Adverse media | Yes | Strong (AI) | Limited | Flag supported; no crawler yet |
| Fuzzy matching with explanations | Yes | Yes | Basic | Yes — every match carries reasons (name %, DOB, nationality) |
| Real-time transaction monitoring | Yes | Yes | No (identity-first) | Yes, synchronous decision with rule hits, < 20 ms measured |
| Custom rule builder with back-testing | Yes (UI) | Yes | No | Yes (JSON + dry-run against history); visual builder is a roadmap item |
| Fraud signals (device, velocity, mule) | Partial | Partial | Yes (identity/biometrics) | Yes (rules); no biometrics / document OCR |
| KYC risk scoring | Yes | Yes | Yes | Yes, configurable weights, EDD, review cycle |
| Core-banking connectors | API + partners | API | SDKs | Native mappers for Finacle, T24, FLEXCUBE, Mambu, Finastra, BankOne, NIP, ISO 20022 |
| Deployment | SaaS | SaaS | SaaS | SaaS **and** standalone / on-prem / air-gapped |
| Audit | Yes | Yes | Yes | Hash-chained, independently verifiable |
| Multi-tenant + roles | Yes | Yes | Yes | Yes, six roles with officer-only STR gate |
| Local-market fit (Nigeria / West Africa) | Generic | Generic | LATAM | EFCC, NFIU, CBN framing, NIP, BankOne, NGN base — first-class |

## Where EdgeVerify wins
Deployment flexibility (on-prem for banks that cannot send customer data to a foreign SaaS), explainable matching, native African core-banking mappers, price (no per-seat data licence baked in), and full ownership of rules and risk model.

## Where it does not yet
Data breadth is the real gap: the vendors' value is curated PEP, adverse media and continuously QA'd list data. Closing it means (a) licensing a PEP/adverse-media feed (e.g. OpenSanctions commercial, Dow Jones, LSEG) into `list_entries`, and (b) operating the sync pipeline with monitoring. Also absent: document verification / biometrics (MetaMap's core), a visual rule builder, and ML-based anomaly scoring on top of the rules.
