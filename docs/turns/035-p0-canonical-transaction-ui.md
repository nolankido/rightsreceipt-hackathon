# Turn 035 Receipt: Canonical buyer acceptance and authenticated invoice controls

- **Status:** Completed implementation and local verification; external release gates remain blocked.
- **Date:** October 27, 2026 HST.
- **Base:** `1ad5c8c8750ee0d34a87c7d4bc1c07b7cc294bd0`.
- **Objective:** Connect buyer acceptance and creator invoice services to browser controls, with explicit human decisions, safe retries and per-dispatch authorization.
- **Scope decision:** P0 transaction integration takes priority. Deferred dashboard work, whole-application UX/security reviews and external release gates are not marked complete.

## Scope completed

- Buyer review of all twelve rights, canonical quote/dates, exact acceptance copy and an unchecked confirmation.
- Fragment capability handoff, immediate URL cleanup, header-only authorization, no buyer cookies/storage and private-state clearing.
- Authenticated creator invoice read, draft creation and separate send routes using existing durable services.
- Complete material-view validation, version-bound commands, no background invoice mutation and explicit uncertain-outcome retries.
- Shared native transaction composition used by Worker source and integrated browser tests.
- OAuth/post-refresh draft authorization, original-principal/exact-source binding, and final source-read authorization ordering fixes for both creation and sending.
- Default-off settings, native buyer asset routing, repeatable verification commands and updated sprint/README records.
- Repaired an inherited Gate C test expecting seven migrations after the eighth was added, and added the eighth migration's exact Git blob check. Schema and migration bytes remain unchanged.

## Files changed

Runtime: `apps/api/src/buyer-review.ts`, `creator-review.ts`, `invoice-control-routes.ts`, `invoice-creation.ts`, `transaction-routes.ts`, `worker.ts`; `apps/web/src/buyer-review-client.ts`, `creator-review-client.ts`; `packages/application/src/invoice-creation.ts`, `invoice-sending.ts`; `packages/paypal/src/sandbox-draft.ts`.

Verification: `scripts/invoice-controls-local.test.mjs`, `transaction-routes-local.test.mjs`, `transaction-browser-check.mjs`, `support/transaction-browser-fixture.mjs`, `creator-review-browser-check.py`, `creator-session-local.test.mjs`, `gate-c-integration-local.test.mjs`; `tsconfig.transaction-ui.json`.

Configuration: `.dev.vars.example`, `wrangler.jsonc`, `package.json`.

Records: `README.md`, `PROJECT_STATUS.md`, `DEVELOPMENT_PLAN.md`, this receipt, the engineering index and `CANONICAL_TRANSACTION_UI.md`, plus four JSON evidence records under `docs/evidence/turn035/`.

## Executed verification

Every `scripts/*.test.mjs` file was executed independently under Node 22.18.0 with native type stripping and `scripts/consent-ts-test-loader.mjs`. The completed sweep reports **1,434 tests passed, 0 failed, 0 skipped, across 38 files**. It includes all historical consent, invoice, provider, financial, receipt and clock collections, plus **60** new invoice/dispatch tests and **18** new composition tests. See [per-file native results](../evidence/turn035/native-regression.json).

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/invoice-controls-local.test.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/transaction-routes-local.test.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/transaction-browser-check.mjs
```

The integrated Chromium harness passed **61 checks across eight scenarios** using actual native Worker composition, all eight migrations, SQLite, generated RSA signatures and real browser scripts. Only gateway/JWKS and PayPal transport replies are injected. The browser completed creator approval, buyer acceptance, one $425 draft and separate single delivery. Lost-response retries did not duplicate durable acceptance, creation or sending.

The expanded offline creator browser harness passed **43 checks**, preserving its prior 30 and adding incomplete-view and late-response regressions. Desktop/mobile screenshots were inspected for legibility, wrapping, controls and overflow. They remain internal verification artifacts rather than production evidence.

Strict TypeScript 5.8.3 passed `tsconfig.transaction-ui.json` and `tsconfig.invoice-sending.json` against actual sources without stubs. All-source syntax parsing passed for 149 TypeScript files. Workspace graph, formatting, exact synthetic dataset reproduction and `git diff --check` passed. The compiler differs from the uninstalled pinned 5.9.3 toolchain; this is not a full installed-build claim.

Both final-source-read race tests were executed against an isolated copy with only the corrected guard order reverted. Each failed by observing one unauthorized provider POST; the corrected implementation observes zero. The original OAuth race was independently reproduced before correction.

## Risks and limits

- Chromium requests are intercepted and forwarded into native handlers. No listening server, actual Access application/cookie lifecycle, deployed Worker/D1 or genuine PayPal transaction was used.
- Actual browser Origin is verified. Fetch Metadata is unavailable through this interception runtime; native HTTP tests cover rejection behavior.
- Expiry clocks and hidden/history events are injected. The separate creator harness injects response bodies.
- Payment evidence, permission and receipt rows remain absent after invoice delivery alone. No successful payment, active license, live refund or complete public judge flow is claimed.
- Pinned clean installation, full installed-library checks/Vite/Wrangler build, actual Sandbox credentials/webhooks and deployment remain open. No external enabling action occurred.
- Existing unknown-outcome claims cannot reset into another provider POST. Operator recovery and a fresh buyer payment-link handoff remain unfinished.

## Commit and next turn

Source, evidence and records are committed together as `feat: connect canonical acceptance and Sandbox invoice controls (turn 035)`. The final identifier is in repository history and the work handoff; this receipt does not embed its own future hash.

**Next P0:** Capability-authorized buyer payment handoff and current receipt/status navigation using fresh validated provider observations. Complete pinned build and genuine managed-session/PayPal/D1 acceptance before a public release claim. Independent implementation can continue without a routine user handoff.
