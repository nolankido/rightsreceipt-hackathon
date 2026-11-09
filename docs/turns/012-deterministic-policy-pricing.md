# Turn 012 Receipt: Deterministic Policy and Pricing Engine

- **Status:** Completed locally; browser and live D1 verification pending Turn 007 release gate.
- **Date:** October 26, 2026 HST
- **Priority:** P0
- **Objective:** Create versioned USD creator policies, deterministic integer-cent calculation, explainable line items, immutable quotes, validation, and rejection tests.
- **Exit criteria:** The same terms version and creator-policy version deterministically yield the same exact amount and explanation. Unsupported terms create no quote.

## Work completed

- Added the pure TypeScript `@rightsreceipt/pricing` engine using the exact seeded creator policy rules.
- Added strict policy-document validation for all eleven rule codes, version, active status, USD, unique rules, and safe integer-cent amounts.
- Added independent validation for all twelve material rights fields rather than trusting a stored `complete` label.
- Calculated inclusive start, exclusive end, and last permitted date in UTC calendar days.
- Added exact five-line Harbor After Rain regression, totaling 42,500 cents.
- Added single-territory, duration-tier, crop/no-crop, impression-boundary, duplicate-list, and date behavior.
- Added deterministic canonical calculation content and SHA-256 verification before saving.
- Added quote application service with current terms/version and assigned active-policy guards.
- Added D1-shaped policy and quote repositories plus an explicitly labeled local-memory quote adapter.
- Added immutable quote version, line-item records, calculation fingerprint, supersede-only metadata, and audit events.
- Added optimistic case-version checks, atomic D1 batches, stale-quote detection, and idempotent quote reuse.
- Added `GET` and `POST` creator quote API endpoints and shared Zod request/response contracts.
- Added creator quote React page with itemization, policy version, terms version, dates, and unsupported-state feedback.
- Added a link from the saved terms review to its quote route.
- Added dependency-free pricing and SQL-adapter integration tests and retained Vitest tests for later installed-dependency execution.
- Added root `pricing:verify` command to static and full verification gates.

## Verification

```text
node --no-warnings --experimental-strip-types --test scripts/pricing-local.test.mjs scripts/quote-service-local.test.mjs

20 tests, 20 passed, 0 failed
```

The pure test set checks 12 scenarios, including every material field boundary, seeded policy SHA-256, canonical calculation, rule selection, safe cents, DST-safe dates, and version changes. The SQL-adapter integration set checks 8 scenarios including quote creation, idempotent reuse, version 2 superseding, stale transaction rollback, audit records, inactive policy, and hash tampering.

The real installed dependency, Vitest, Vite, Wrangler, React browser, and Cloudflare D1 gates remain unavailable due to Turn 007's package registry DNS blocker. Tests are not represented as live D1 or browser evidence.

## Requirements advanced

- `RR-P0-017`: Passing locally, unresolved/contradictory/unsupported fields cannot generate a quote.
- `RR-P0-022`: Passing locally for quote blocking; invoice blocking remains with PayPal turns.
- `RR-P0-023`: Passing locally, policy ID and version bound to stored quote.
- `RR-P0-024`: Passing locally, monetary arithmetic uses safe integer cents and is deterministic.
- `RR-P0-025`: Passing locally, line items and total agree; browser gate pending.
- `RR-P0-026`: Passing locally, five expected Harbor After Rain line items sum to exactly 42,500 cents.
- `RR-P0-027`: Passing locally, supported rights and all range boundaries enforced.
- `RR-P0-001`: Still blocked, complete installed-dependency gate unavailable.

Domain invariants advanced: `RR-DOM-009` through `RR-DOM-018`, `RR-DOM-021`, `RR-DOM-045` through `RR-DOM-050`.

## Safety and scope

No paid AI API, GitHub Actions, production PayPal endpoint, credential, arbitrary file upload, escrow behavior, autonomous approval, receipt issuance, or external payment claim was added.

Quote creation does not grant rights, confirm payment, approve on behalf of the creator, accept for the buyer, or create an invoice. Those transitions remain later sprint turns.

## Known limitations

- Source integration is not an installed-dependency build.
- The SQL integration harness uses Node SQLite against a minimal test schema, not a live D1 binding.
- The creator demo-role header is not production authentication.
- Policy administration and a multi-policy creator UI are outside P0.
- Final browser, accessibility, and Cloudflare validation remain pending.

## Next turn

Turn 013: Complete the mock end-to-end vertical slice through creator approval, buyer acceptance, simulated payment evidence, and a clearly simulated receipt, without erasing the Turn 007 release verification blocker.
