# Turn 022: Sandbox OAuth and idempotent draft invoice creation

**Priority:** P0
**Date:** October 26, 2026 HST
**Status:** Implementation committed and locally verified with mock HTTP; live Sandbox and release acceptance remain blocked.

## Objectives

Implement an optional Sandbox-only transport that exchanges credentials via OAuth 2.0, safely caches the Bearer token, maps a trusted accepted USD licensing snapshot to a PayPal Invoicing v2 draft, and uses deterministic idempotency for all retries. Do not send invoices, activate permissions, or request user credentials as part of this turn.

## Changes

- `packages/paypal/src/sandbox-draft.ts`: explicit opt-in transport injection, exact fixed Sandbox host/path, HTTP Basic auth, bounded JSON validation, proactive token refresh, single-flight OAuth, one retry after 401, redacted provider failures, and deterministic draft mapping.
- Trusted merchant identity comes from server-side configuration; accepted case, terms, quote, decision and buyer acceptance references are bound to the invoice description and deterministic request number.
- `PayPal-Request-Id` is stable across retries; concurrent calls use the same in-process draft creation operation. Conflicting versions or changed amounts fail before HTTP.
- `packages/paypal/src/adapter.ts`, `contract.ts`, `index.ts`: non-authoritative draft readiness descriptor and new safe error codes while preserving the inert Turn 021 constructor and offline fake flow.
- `scripts/paypal-sandbox-draft-local.test.mjs`: injected PayPal responses, 27 tests. The original 22 offline fake tests continue passing. The lightweight TypeScript import loader is for native tests only.
- PayPal documentation, root verification commands and project ledger revised.

## Verification

```text
Native Node: 49 tests, 49 passed, 0 failed
Strict TypeScript: 0 errors
Offline fake $425 smoke: passed, explicitly simulated
External PayPal HTTP: 0 requests
```

Checks cover missing/invalid Sandbox credentials, prohibited production origin, stable amount/policy references, positive safe cents, authentication caching, expiry refresh, concurrency, idempotent retry, malformed provider data, 429/5xx/401, network uncertainty, payload tampering, redirect rejection and secret redaction.

## Scope boundaries and incomplete acceptance

- `RR-P0-042` OAuth caching and refresh **passed mocked transport tests**, not a credentialed live Sandbox integration. External credential handoff remains pending.
- `RR-P0-043` draft mapping and idempotency **passed mocked transport tests**. A real creator/buyer-approved transaction to PayPal and a durable D1 invoice binding remain unverified.
- `RR-P0-044` in-process idempotency **passed local tests**. Production-safe guarantees across restarts require a durable journal and provider reconciliation.
- `RR-P0-045` and beyond **not implemented**, because sending, webhooks, payment verification and permission state are separate turns.
- `RR-P0-001`, Gate A, Gate B and secure creator authentication **remain blocked**.

The new constructor is not reachable from Hono application routes and is never instantiated with live HTTP by the application. No valid Sandbox merchant credentials were available or used, and no real PayPal invoice was created or sent. A draft-only Sandbox invoice, even if eventually created in tests, is not paid evidence.

## Next

Turn 023: send/GET Sandbox invoices, safely display the PayPal-hosted buyer path, introduce durable operation/binding persistence and verify response mappings with mocked provider responses before any external testing or public exposure.
