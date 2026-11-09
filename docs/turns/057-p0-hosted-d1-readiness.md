# Turn 057 Receipt: Hosted Judge D1 Readiness

- **Status:** Completed local hosted-persistence readiness hardening; live deployment and provider gates remain open.
- **Date:** October 31, 2026 UTC.
- **Priority:** P0.
- **Objective:** Prevent a publicly reachable Worker from being treated as judge-ready when its D1 binding is absent, unusable or missing core migrations.
- **Exit criteria:** Fail closed with a sanitized response in hosted modes, keep offline local health intact, reject old hosted health output in the signed-out smoke, add regressions and document what the check does and does not prove.

## Scope completed

1. Added `apps/api/src/hosted-persistence.ts`, a dependency-free read-only D1 readiness query. It checks fourteen representative tables spanning workspace, buyer request, rights terms, invoicing, PayPal journal/webhooks, payment evidence, permission, receipts and clarification migrations.
2. Updated both `/health` and `/api/health` routes. Hosted `sandbox` and `judge` modes return HTTP 503 with only `persistence_unavailable` on a missing binding, a failed query or incomplete schema. No SQL text, database values or errors are exposed. A passing hosted response adds `persistence: ready`. Local mode reports `persistence: not_required` without querying D1.
3. Updated the signed-out hosted smoke to require `persistence: ready` as well as the previous mode, privacy, page and asset checks. An older deployed build with a merely successful health response now fails.
4. Added isolated SQLite-backed readiness regressions, two smoke regressions for missing D1 evidence, and API integration assertions. Wired the new isolated tests into `pnpm judge:hosted:smoke:verify` and therefore both verification chains.
5. Updated judge instructions, README and project status. No application payment, authentication, webhook, database migration or receipt decision path was changed.

## Files changed

- `apps/api/src/hosted-persistence.ts`: new read-only D1 gate.
- `apps/api/src/index.ts`: hosted health response and sanitized 503.
- `apps/api/src/index.test.ts`: hosted missing-binding and mocked D1 response assertions.
- `scripts/hosted-persistence-local.test.mjs`: five isolated tests.
- `scripts/hosted-judge-smoke.mjs` and `scripts/hosted-judge-smoke-local.test.mjs`: require and test the hosted persistence field.
- `package.json`: include the new test in hosted smoke verification.
- `docs/submission/JUDGE_QUICKSTART.md`, `README.md`, `PROJECT_STATUS.md`: operator truth.
- This receipt.

## Verification

The modified JavaScript and TypeScript sources were reviewed for syntax and format. The isolated regression source was executed in a disposable Node 24.22.1 test environment with in-memory SQLite and mocked HTTP responses:

- Five D1 cases: absent binding, missing schema, complete representative tables, removed late-migration table and malformed/erroring database response.
- Thirteen hosted HTTP smoke cases, including an older response lacking `persistence: ready` and a hosted 503 on missing D1.
- The existing route-level Vitest test collection was updated, but no installed project dependencies or exact Node 22 clean checkout were available to execute the full suite.

No real Cloudflare, D1, PayPal, paid AI API or payment operation was called.

## Limitations

The health query confirms a working D1 binding and representative table presence only. It does not establish schema hashes, all columns, seed content, current D1 migration ledger, a creator login, a browser journey or real PayPal payment. A forged HTTP server can imitate the response; the check is a guard against missing/old configuration, not independent deployment attestation.

The checked-in `wrangler.jsonc` still defaults to local mode without a D1 binding. That configuration cannot pass the hosted smoke and must not be presented to judges as a finished Sandbox build.

## Next turn

Run `pnpm release:verify` on an exact clean Node 22 checkout, execute genuine PayPal Sandbox invoice/payment/verified webhook acceptance, configure a restricted Cloudflare/D1 deployment and apply migrations. Then run `pnpm judge:hosted:smoke -- --origin https://YOUR-APPROVED-JUDGE-HOST`, export the sanitized public repo using the passing release evidence, and finish the video/Devpost submission.

## Commit

This receipt is included in the Turn 057 implementation commit. The merged pull request identifies the exact SHA.
