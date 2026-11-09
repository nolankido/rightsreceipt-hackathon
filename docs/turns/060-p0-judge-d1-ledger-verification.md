# Turn 060 Receipt: Judge D1 Migration Ledger Verification

- **Status:** Implemented and isolated-test verified; no live D1 or PayPal operations.
- **Date:** November 1, 2026 UTC.
- **Priority:** P0.
- **Objective:** Refuse hosted judge readiness when expected SQLite schema artifacts exist but the actual Wrangler migration history is absent or inconsistent, and give the deployment operator a read-only way to check the remote history.

## Scope completed

1. Extended `apps/api/src/hosted-persistence.ts` with two scalar checks against `d1_migrations`: exactly nine total rows and nine distinct expected filenames. These are combined with the Turn 059 table, index, trigger and column checks in one read-only SQLite query. Missing ledger, duplicate, unexpected, renamed or deleted migration evidence fails closed with the same sanitized `503 persistence_unavailable` response.
2. Updated the in-memory D1 readiness fixture to apply the actual nine SQL files and simulate Wrangler's default migration ledger shape. Added failure regressions for no ledger, missing/renamed/extra records and a forged duplicate replacing a missing record. Kept the existing late-column, index, trigger and partial-schema regressions.
3. Added `scripts/judge-d1-ledger-check.mjs`, an offline, bounded-stdin parser for the JSON output of a single operator-run `wrangler d1 execute --remote --json` query. It requires one successful result containing exactly the nine expected filename-only rows in order. It rejects malformed or extra fields, duplicate/unknown/reordered records, unexpected write metadata and oversized input, and never echoes the input.
4. Added ten isolated JSON-parser/CLI regressions and wired `pnpm judge:d1:ledger:verify` into both verification chains. The separate `pnpm judge:d1:ledger:check` command consumes the operator's stdin JSON.
5. Pinned `migrations_table` to `d1_migrations` in the restricted Wrangler template and the static deployment preflight. Added mismatch and missing-field regressions.
6. Updated route-level health assertions, the judge quick start, README and project status. The quick start now places the operator-run read-only remote ledger query after applying migrations and before restricted deployment.

## Verification

- Thirteen isolated hosted D1 readiness tests passed in Node 24.22.1 with the actual nine migration SQL files plus a simulated Wrangler ledger.
- Ten isolated ledger JSON-parser/CLI tests passed under Node 24.22.1 using in-memory module substitution, including input bounds, failed query and redacted output.
- Staged scripts and TypeScript sources parsed successfully. The reviewed config template is valid JSON.
- The route-level Vitest assertion was updated but not executed. No full dependency-backed `pnpm verify` or clean pinned Node 22 `pnpm release:verify` was possible in this connector-only environment.
- No Cloudflare account access, remote D1 call, migration apply, Worker deployment, PayPal Sandbox operation, payment or paid AI API call occurred.

## Limitations and next gates

The operator-provided Wrangler JSON could be fabricated or copied from a local database. This checker cannot authenticate Cloudflare account, query origin, database UUID or evidence freshness. The hosted query confirms ledger filenames and schema artifact names but not migration SQL hashes, row content, object definitions or foreign-key integrity. The deployment command itself still runs only static configuration checks, so the documented remote ledger check must be completed separately before using it.

A genuine judge preview still requires approved D1 provisioning, remote migration application, the ledger check, restricted deployment, a signed-out hosted smoke, exact clean Node 22 release verification, genuine Sandbox invoice/payment/verified webhook evidence, a sanitized one-commit public repository and final submission assets.

## Commit

This receipt is part of the Turn 060 implementation commit. A merged pull request, if approved, identifies the exact SHA.
