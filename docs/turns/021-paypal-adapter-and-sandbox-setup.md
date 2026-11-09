# Turn 021: Fake and PayPal Sandbox adapter contract

**Priority:** P0, USER handoff deferred
**Date:** October 26, 2026 HST
**Status:** Offline adapter contract complete and locally tested. Real Sandbox HTTP integration is pending Turn 022 onward.

## Scope delivered

- Replaced the PayPal package placeholder with a typed, versioned `PaymentAdapter` contract and narrow `AuthorizedInvoiceSnapshot`.
- Validated USD integer cents, quote/terms/creator decision/buyer acceptance identifiers, bounded recipient contact, rights summary, and server-derived idempotency key. Raw browser/model actions and unknown fields fail closed.
- Implemented a separate in-memory fake adapter supporting deterministic draft, send, paid, cancelled, and refunded test transitions with exact idempotency and safe, privacy-minimized outputs.
- Explicitly labeled fake state as simulated and non-authoritative for payment or rights; never called or represented PayPal Sandbox.
- Added strict Sandbox configuration checks for exact `api-m.sandbox.paypal.com` origin, explicit nonlocal mode selection, valid non-placeholder server-only credentials, Vite-secret rejection, and safe redacted diagnostics.
- Added a deliberately inert Sandbox adapter. Missing secrets fail closed; valid secrets still do not enable OAuth, network calls, or invoice creation.
- Added a redacted `.dev.vars.example`, Sandbox setup/handoff document, script for a realistic offline $425 flow, root verification command, and status ledger update.

## Verification

```text
node --no-warnings --experimental-strip-types --test scripts/paypal-adapter-local.test.mjs
22 passed, 0 failed

tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noUnusedLocals --noUnusedParameters --noImplicitOverride --verbatimModuleSyntax --target ES2023 --module ESNext --moduleResolution Bundler packages/paypal/src/*.ts
0 errors

node --no-warnings --experimental-strip-types scripts/paypal-demo-local.mjs
SIMULATED ONLY - NO PAYPAL PAYMENT OR LICENSE
```

The source checks are local and independent of paid APIs. They do not replace installed dependency, Hono/React, deployed D1, browser, live PayPal Sandbox, or webhook acceptance tests.

## Requirements advanced

- **RR-P0-040:** Offline fake adapter contract and simulated create/send/paid/refunded/cancel flow passed native tests. Existing application end-to-end integration remains separate and must be verified in later turns.
- **RR-P0-041:** Exact host allowlist and production rejection passed native configuration tests. No real Sandbox connection has been made.
- **RR-P0-042 through RR-P0-052:** Not implemented by this turn. No OAuth, invoice, send, webhook, reconciliation, or real payment evidence claim.
- **RR-P0-001, Gate A, Gate B:** Installed dependencies, browser and live environment proof remain blocked.

## Next

Turn 022: Implement OAuth and version-bound draft invoice creation using the established Sandbox-only port, test fixtures and idempotency. No production endpoint and no paid API service. Credentials should be provided through protected server-side secrets only at the authorized Sandbox handoff.
