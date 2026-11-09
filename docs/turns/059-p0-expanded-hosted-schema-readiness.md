# Turn 059 Receipt: Expanded Hosted D1 Schema Readiness

- **Status:** Implemented and isolated regression-verified; no remote deployment or payment evidence.
- **Date:** November 1, 2026 UTC.
- **Priority:** P0.
- **Objective:** Prevent hosted health from reporting readiness when representative core tables exist but later migration indexes, integrity triggers or added columns are missing.

## Change

1. Replaced the fourteen-table presence gate in `apps/api/src/hosted-persistence.ts` with a single read-only SQLite schema query. It requires all 33 domain tables, 23 named indexes, 28 integrity triggers and 15 columns from later ALTER TABLE migrations. The inventory is derived from the nine checked-in migration files and must be reviewed when migrations change.
2. Preserved the existing sanitized health contract: a missing binding, SQL error, malformed result, missing table/index/trigger/column or incomplete migration fails as HTTP 503 `persistence_unavailable` in hosted `sandbox` and `judge` modes. No SQL text, D1 contents or internal errors are exposed. Offline `local` mode remains unchanged.
3. Replaced the table-only SQLite fixture with a regression that applies the actual nine migration SQL files. It checks successful readiness on the intact migrated schema; failures on empty and partial migrations; missing original and late tables; missing early, middle and late indexes; missing integrity triggers; missing later-added columns; and malformed D1 responses.
4. Updated the route-level health integration assertion to use the stricter counts, with a second assertion that a missing receipt-column artifact yields the minimized HTTP 503 response.
5. Updated the judge runbook, README and project status with the new readiness meaning and its limits.

## Verification

- Parsed the revised TypeScript and JavaScript syntax under the available Node 24.22.1 environment.
- Executed all nine real SQL migrations using in-memory `node:sqlite`.
- Passed 28 targeted acceptance/rejection checks and the ten isolated Node test cases, all with zero failures, using in-memory module loading and actual migration DDL under Node 24.22.1.
- The replacement Node test file contains ten test cases and is included in the existing `pnpm judge:hosted:smoke:verify` gate, which is already part of both static and full verification chains.
- The Vitest route integration assertion was updated but full dependency-backed tests and the exact clean Node 22 `pnpm release:verify` were not run in this environment.
- No Cloudflare D1 remote query, deployment, PayPal Sandbox payment, provider credential or paid AI call was made.

## Limits

Object-name checks do not prove table, index or trigger SQL definitions are intact. They also do not prove D1 migration-ledger integrity, foreign-key validity, data correctness, seeded demonstration state, creator login, genuine PayPal Sandbox settlement or a working public judge URL. A forged application can imitate `persistence: ready`; this is a migration-readiness guard, not third-party attestation.

The restricted preview remains blocked on approved Cloudflare account setup, an actual D1 UUID, applying remote migrations and running the signed-out smoke. A complete release still requires real Sandbox invoice/payment/verified webhook evidence, the clean Node 22 release verifier, a sanitized one-commit public export and final submission artifacts.

## Commit

This receipt is included in the Turn 059 implementation commit. The merged pull request, if approved, identifies the exact immutable SHA.
