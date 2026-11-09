# Turn 026: Reconciliation and failure recovery

**Priority:** P0
**Date:** October 27, 2026 HST
**Status:** Implemented and verified locally. Live provider, authenticated UI and release acceptance remain pending.
**Base commit:** a78d8b699e72580911a6b17607c39008bf68e463

## Delivered

- Added fresh, read-only Sandbox reconciliation for an already-bound accepted invoice.
- Required exact current creator decision, buyer acceptance, human terms, quote, amount and case identity before reads and again in the atomic completion guard.
- Added database-backed leases, generation capture, expiry fencing and unique completion records. A stale worker cannot overwrite a new owner or acknowledge a newer notification.
- Added atomic safe invoice-state update, immutable observation, redacted audit and captured-generation acknowledgement.
- Added bounded exponential retry with jitter, persistent retry deadlines, five-attempt limits, terminal failure classification and explicit status-only retry.
- Added a bounded stale-binding sweep for missed webhooks and a safe creator diagnostic/error contract.
- Repaired the shared counter: webhook arrivals now increment the existing reconciliation generation rather than overwriting it from an unrelated projection revision.
- Added migration 0006, schema version 6 with 30 tables, verifier/manifest updates and root test command wiring.
- Added an explicitly disabled server composition hook. No public route, Cron Trigger, real credentials or remote action was enabled.

## Executed evidence

```text
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/paypal-ts-test-loader.mjs --test scripts/paypal-reconciliation-local.test.mjs scripts/paypal-adapter-local.test.mjs scripts/paypal-sandbox-draft-local.test.mjs
130 tests passed, 0 failed (81 new + 22 fake/configuration + 27 OAuth/draft)

Standalone strict TypeScript 5.8.3, new service/store/server hook
0 errors

Authored implementation/test/migration formatting and no-em-dash checks
passed
```

The new suite executes production SQL against Node SQLite with focused parent fixtures and injected provider views. File close/reopen proves persisted retry and completion behavior. A focused integration test executes the actual webhook store against independently advanced recovery generations. All four completion writes have injected-failure rollback tests.

Core source, tests, migration and server hook are published with the same bytes as the verified working files. The older adapter/draft blobs used for the 49 regressions were checked against repository SHA identities.

## Acceptance and deliberate limits

- RR-P0-051: missed-webhook queuing, transient failures, current-version comparisons, restart recovery and explicit read retry pass local scenarios without manual database edits.
- RR-P0-049/050: newer generations survive in-flight reads; repeated work does not repeat completion/audit; terminal local states cannot regress from a stale operational read.
- RR-P0-052: not completed. A PAID/REFUNDED status and matching invoice total do not establish independently verified settlement. Such observations require review and do not activate permission or produce payment evidence.
- The creator-facing error/status contract is implemented but no authenticated browser recovery screen is claimed.
- Turn 007, Gate A and Gate B remain blocked. Registry DNS resolution failed again during this turn.

The complete prior delivery, signature-intake and webhook-processing test suites were not rerun. The full schema/seed gate, project-pinned dependency verification, Hono/Worker/browser, live D1 and live PayPal evidence remain unverified. No paid API, real payment, email, GitHub Actions, scheduled task or user handoff was used.

## Next

**Turn 027: Complete paid, canceled and refunded lifecycle behavior.** Add verified settlement/refund detail checks and auditable permission transitions without treating status text, manual/external payments or a browser redirect as proof of paid rights.

See [reconciliation engineering record](../paypal/RECONCILIATION_AND_RECOVERY.md).
