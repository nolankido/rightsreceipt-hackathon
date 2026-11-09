# Turn 011 Receipt: Build Structured Rights-Term Review Components

- **Status:** Completed locally, browser and live D1 evidence pending the existing Turn 007 blocker
- **Date:** October 25, 2026 HST
- **Priority:** P0
- **Objective:** Render and persist the twelve material rights fields with explicit supported, unresolved, contradictory, and unsupported states, while allowing creator correction without AI or PayPal.
- **Exit criteria:** Terms can be reviewed, classified, corrected, versioned, reloaded, and audited without invoking AI or payment behavior.

## Scope completed

- Added the canonical twelve-field rights schema and fixed display order.
- Added supported-value validation for purpose, channels, paid advertising, territory, dates, duration, impressions, exclusivity, modification, attribution, sublicensing, and AI use.
- Added explicit unresolved, contradictory, and unsupported field states.
- Required a plain-language explanation for contradictory and unsupported fields.
- Rejected unsupported values that were falsely marked resolved.
- Added canonical channel and territory ordering and duplicate-selection rejection.
- Added deterministic resolution precedence for complete, incomplete, contradictory, and unsupported terms versions.
- Added manual-review attempt, human field-observation, immutable terms-version, and audit-event construction.
- Added canonical review hashing and original-request hashing boundaries.
- Added creator terms-review application orchestration and typed stale, unchanged, missing, and closed-case failures.
- Added D1-shaped case-list, joined review-load, and atomic manual-save persistence.
- Added a shared local memory terms adapter linked to the existing buyer cases and submissions.
- Added shared Zod contracts for field edits, case summaries, review responses, and save requests.
- Added creator request queue, full case list, and twelve-field review React routes.
- Added source-evidence, provenance, reliability, quote-gate, loading, retry, validation, and saving UI states.
- Added creator API routes for case listing, review loading, and manual version saving.
- Added domain, contract, application, persistence, API, and route Vitest source tests.
- Added a dependency-free SQLite terms harness and ten passing tests.
- Added terms verification to the root static and full verification commands.
- Added engineering documentation and updated the root overview and project ledger.

## Requirements advanced

### `RR-P0-015`

The structured review defines and renders all twelve material fields in the frozen order. The dependency-free tests assert that the complete field set is present before and after saving.

### `RR-P0-016`

Every field accepts only its supported P0 values or an explicit unresolved, contradictory, or unsupported state. Unsupported values cannot pass as resolved fields.

### `RR-P0-020`

The creator can manually correct every material field without invoking a model. A save creates a new immutable terms version and twelve human-provenance observations. Reloaded values, provenance, and version numbers are verified locally.

### Supporting requirements

This turn materially advances but does not claim final ownership of:

- `RR-P0-017`, because the review produces a deterministic blocked or ready-for-pricing gate while pricing tests remain Turn 012;
- `RR-P0-018` and `RR-P0-019`, because evidence and confidence presentation exists but actual AI evidence belongs to Turn 019;
- `RR-P0-022`, because unsupported terms are preserved with explanations and no supported value is substituted, while quote and invoice blocking remains Turn 012.

Relevant domain invariants include `RR-DOM-005` through `RR-DOM-017`, `RR-DOM-021`, `RR-DOM-045` through `RR-DOM-050`.

## Verification commands

```text
node --check scripts/terms-local.mjs
node --check scripts/terms-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/terms-local.test.mjs

npx --yes tsc -p tsconfig.core.json --pretty false
npx --yes tsc -p tsconfig.apps.json --pretty false
```

The app semantic check used temporary uncommitted declarations for unavailable external packages. Those declarations and temporary route stubs are not part of the commit and do not replace the installed dependency gate.

## Verification results

- Ten dependency-free terms tests passed with zero failures.
- Initial review returned all twelve fields as unresolved and not set.
- A complete manual review persisted one attempt, twelve observations, one terms version, and one audit event.
- Every saved field had human provenance, null model confidence, and no fabricated AI evidence.
- Every material field accepted its supported manual correction.
- Unsupported, contradictory, and unresolved states survived reload distinctly.
- Resolution precedence was unsupported, then contradictory, then incomplete, then complete.
- Exclusive use falsely marked as supported was rejected.
- A second material edit created version 2 while version 1 remained immutable.
- A stale expected row version wrote no attempt, observation, terms, or audit record.
- Equivalent channel and territory sets produced identical canonical hashes regardless of input order.
- The audit event referenced the new terms version, creator actor, sequence, outcome, and idempotency key.
- Strict TypeScript checking passed for new domain, application, and persistence source.
- App source passed semantic TypeScript inspection with temporary external-package declarations.
- Authored files passed final-newline, CRLF, trailing-whitespace, tab, and em-dash checks.
- No credential, capability token, private account data, production payment endpoint, paid service, or GitHub Actions workflow was introduced.

## Files added

- `packages/domain/src/rights-terms.ts`
- `packages/domain/src/rights-terms.test.ts`
- `packages/contracts/src/rights-terms.ts`
- `packages/contracts/src/rights-terms.test.ts`
- `packages/application/src/rights-terms.ts`
- `packages/application/src/rights-terms.test.ts`
- `packages/persistence/src/rights-terms.ts`
- `packages/persistence/src/rights-terms.test.ts`
- `packages/persistence/src/memory-rights-terms.ts`
- `apps/web/src/terms.tsx`
- `apps/web/src/terms.css`
- `scripts/terms-local.mjs`
- `scripts/terms-local.test.mjs`
- `docs/engineering/STRUCTURED_TERMS_REVIEW.md`
- `docs/turns/011-structured-rights-term-review.md`

## Files updated

- `packages/domain/src/index.ts`
- `packages/application/src/index.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/index.test.ts`
- `packages/persistence/src/index.ts`
- `packages/persistence/src/index.test.ts`
- `packages/persistence/src/memory-assets.ts`
- `packages/persistence/src/memory-buyer-requests.ts`
- `apps/api/src/index.ts`
- `apps/api/src/index.test.ts`
- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/routes.ts`
- `apps/web/src/routes.test.ts`
- `package.json`
- `docs/engineering/README.md`
- `README.md`
- `PROJECT_STATUS.md`

## Existing blocker

Turn 007 remains blocked because the execution environment cannot resolve `registry.npmjs.org`. The lockfile, installed-library type check, Vitest run, Vite build, Wrangler dry run, browser execution, accessibility execution, and live D1 evidence remain pending.

No user action, paid resource, or GitHub Actions workaround was requested or introduced.

## Recommended next work

Proceed to Turn 012, deterministic policy and pricing, as the next independent P0 unit. It should consume only complete supported terms, use integer cents and the seeded policy version, explain every line item, and refuse to quote unresolved, contradictory, unsupported, or out-of-range terms.
