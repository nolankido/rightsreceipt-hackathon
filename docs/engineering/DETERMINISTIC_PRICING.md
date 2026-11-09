# Turn 012: Deterministic policy and pricing

**Status:** Implemented, dependency-free unit and SQL-adapter tests passing.
**Browser / Worker:** Not verified because Turn 007 package installation is blocked.
**Real D1:** Not yet provisioned or tested.

## Product contract

RightsReceipt prices the exact, saved, complete, supported twelve-field rights version against one explicitly assigned USD creator policy version. Model output and buyer prose never set the price. No invoice, permission, creator approval, or buyer acceptance follows merely from generating a quote.

### Authoritative policy

The seeded SQL record uses policy ID `00000000-0000-4000-8000-000000000002`, version 1, and SHA-256 policy hash `33d8c85a963b9b12c1dc61bc5f3d6dd8ae186a8bef47f5ac4a6c1ccc10163916`. The eleven rule codes and their amounts are parsed from `pricing_policy_versions.rules_json`, rather than from a price chosen by a model.

Rules are validated for exact supported codes, unique names, USD currency, matching version, safe nonnegative integer cents, a zero no-modification rule, and an active version. The original policy JSON is hashed before issuing a quote. A mismatch fails closed.

### Canonical $425 example

| Policy line | Integer cents | USD |
| --- | ---: | ---: |
| Base commercial digital license | 20000 | $200.00 |
| Paid social advertising | 10000 | $100.00 |
| United States and Canada | 5000 | $50.00 |
| Duration 31 to 90 days | 5000 | $50.00 |
| Crop permission | 2500 | $25.00 |
| **Total** | **42500** | **$425.00** |

United States only and Canada only select their single-territory rules. Duration tiers are 1 to 30, 31 to 90, 91 to 180, and 181 to 365 days. No crop permission does not add a surcharge. Channels and territories are normalized into canonical order for the same calculation fingerprint. The seeded policy does not add a separate audience-size fee within the supported 1 to 500,000 range.

### Fail-closed quote gate

The engine rejects any unresolved, contradictory, unsupported, absent, or out-of-range material field, regardless of a saved `complete` flag. Examples include exclusive rights, worldwide territory, print channels, AI-training permission, sublicensing, 0 or 366 days, more than 500,000 impressions, invalid dates, invalid currency, and fractional amounts.

The licensing interval is `[start_date, end_date_exclusive)` using UTC calendar days. The last permitted day is displayed separately. This avoids daylight-saving time errors and does not imply permission activation.

## Immutable quote record

Every saved quote stores a stable UUID, case, immutable terms-version ID, pricing-policy ID and version, integer-cent amount, currency, calculation SHA-256, creation time, version number, and the precise line-item records. The source calculation excludes the current clock time and uses only version-bound content.

A quote generation request must present the latest case row version. The D1 batch creates its quote, lines, case update, and audit evidence atomically. An optimistic concurrency miss prevents the quote insert and causes the line-item foreign-key constraint to roll back the entire batch, including any attempted supersede. Repeated generation of the same current calculation returns the existing quote rather than inserting another.

A material new terms version or a new active policy version requires a new quote version. The previous quote content remains immutable; only its current/superseded metadata changes. Quoting does not silently invalidate or substitute for human consent, which belongs to Turn 013.

## Interfaces

`@rightsreceipt/pricing` exports `calculateQuote`, `validateQuoteableTerms`, `parseAndValidatePricingPolicy`, `formatUsdCents`, the rule catalog, and the seeded policy fixture.

`@rightsreceipt/application` exports `QuoteService` with read, generate, policy, hasher, clock, and identifier ports.

`@rightsreceipt/persistence` adds a D1-shaped quote repository, assigned-policy reader, and explicit local-memory quote adapter tied to the same case records as the terms review.

### Routes

- `GET /api/creator/cases/:caseId/quote`: returns saved current quote, stale-quote indicator, or blocked/ready gate.
- `POST /api/creator/cases/:caseId/quote`: generates or reuses a version-bound quote with a required `expectedCaseRowVersion`.
- `/creator/cases/:caseId/quote`: renders policy version, terms version, five or four line items, exact sum, canonical license period, and calculation fingerprint.

Creator routes still use the temporary explicit demo-role header. It is not production authentication.

## Verification

Run without external npm packages:

```bash
node --no-warnings --experimental-strip-types --test scripts/pricing-local.test.mjs scripts/quote-service-local.test.mjs
```

Twenty tests pass, including all twelve rights fields, tier boundaries, the canonical $425, policy integrity, unsafe policy data, calendar arithmetic, quote immutability, idempotency, atomic optimistic concurrency failures, audit writes, stale quote detection, and version progression. The SQL-adapter suite runs the real D1-shaped repository SQL through a Node SQLite port and intentionally uses a minimal test schema. It is not a live Cloudflare D1 test.

Source Vitest coverage is also checked in for the later installed-dependency gate. React screens, Hono routes, Wrangler build, browser tests, and D1 remain unverified until Turn 007's full verification gate is available.
