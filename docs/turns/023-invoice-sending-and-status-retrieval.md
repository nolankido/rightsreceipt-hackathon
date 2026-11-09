# Turn 023: Invoice sending and status retrieval

**Priority:** P0
**Date:** October 26, 2026 HST
**Status:** Implemented and verified locally. Live Sandbox and buyer-browser exit evidence remain pending.
**Base commit:** dac5d7c848ea16fb8226ec16640364fe7d54f978

## Delivered

- Added explicitly opt-in `createPayPalSandboxInvoiceAdapter` with authenticated send and GET operations, private token caching, early refresh, one 401 refresh and sanitized errors.
- Preserved the default inert Sandbox factory and existing draft-only constructor. No public API route or real payment was enabled.
- Required a trusted current-consent callback for both creation and sending, including a recheck after provider preflight and journal ownership.
- Added immutable accepted-version/provider bindings and an atomic send journal with in-memory and D1-shaped implementations.
- Added migration 0003 with identity guards, unique case/request/provider IDs, monotonic send markers and reset cascade.
- Acknowledgements are followed by GET validation, not fabricated UNPAID or PAID states.
- Added safe Sandbox payer-link extraction, full invoice content comparison and exact decimal-to-cent parsing.
- Preserved partial, manual, external and pending status distinctions; unexpected labels require reconciliation.
- Made uncertain creation/send outcomes fail closed across restarts. No automatic resend after a claimed operation.
- Updated payment exports, status contracts, schema manifest, local database verification table lists, Vitest manifest expectations, root payment verification command and documentation.

## Executed evidence

```text
npm run paypal:verify
102 tests passed, 0 failed
53 new invoice-delivery/journal tests + 49 prior adapter/OAuth/draft tests
Existing fake smoke: DRAFT -> UNPAID -> PAID, 42500 cents, non-authoritative

Standalone tsc 5.8.3, strict PayPal package check
0 errors

node --check scripts/db-local.mjs
passed
```

The tests execute the real transport functions against injected mock responses and real journal SQL against Node SQLite, including closing and reopening a file-backed database. They do not contact PayPal. The old `sandbox-draft.ts` file is unchanged and its prior tests still pass.

The working environment again could not resolve registry.npmjs.org. No claim is made for clean pnpm installation, the project-pinned TypeScript/Vitest build, Hono/React browser execution, the full migration/seed suite, live D1, actual Sandbox emails or payment links.

## Acceptance relationship

- RR-P0-045: mocked send, stable provider identifiers, persisted binding/restart protection and validated payer-link behavior pass. Actual Sandbox sending and buyer navigation are still unverified.
- RR-P0-046: status reads, partial/manual/unknown states, 404/auth/rate-limit/network errors and response-integrity checks pass local tests.
- RR-P0-044: durable request/case reservation adds protection; uncertain creation blocks until reconciliation rather than creating another invoice.
- RR-P0-047 onward: webhook authentication, event processing and authoritative payment lifecycle are not implemented here.
- RR-P0-001, Gate A and Gate B: remain open.

## Known limitations and next work

The caller must implement the real trusted authorization callback, durable creator/buyer consent and application audit integration. The adapter-private journal does not itself authenticate people or activate rights. A stalled reservation requires later explicit reconciliation. All provider observations remain `authoritativePaymentEvidence: false`.

Next independent unit: **Turn 024, verified webhook intake**. Maintain the Sandbox-only allowlist and do not claim payment evidence from a browser redirect, status string, fake event or unsigned webhook.

Detailed behavior and references: [Sandbox invoice delivery](../paypal/SANDBOX_INVOICE_DELIVERY.md).
