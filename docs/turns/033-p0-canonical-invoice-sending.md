# Management turn 033: Canonical draft adoption and authorized sending

**Date:** October 27, 2026 HST
**Base:** 8f4f5652ddf1a66634bd7480de041c60b92d0928
**Priority:** P0 integration recovery
**Status:** Implemented and verified locally. Release gates remain open.
**Scope:** Original Turn 033 whole-application UX/accessibility pass deferred, not completed.

## Delivered

- Canonical draft adoption into the existing durable send journal, with no second creation call.
- Explicit creator confirmation of the case revision and invoice, protected by current human-consent and deterministic-price validation.
- Atomic journal/operation/binding/audit reservation, one-claim dispatch and read-only recovery after uncertainty.
- Exact actual send-request keys in both HTTP and persistent operation evidence.
- Fresh status checks and an atomic handoff to the existing reconciliation queue without payment or permission authority.
- Terminal-state preservation, safe fresh payer links, pending financial-generation preservation and private-data redaction.
- Repaired the adapter's OAuth gap: authorization is now checked after token acquisition/refresh, immediately before each POST.
- Default-disabled server composition, focused verification/type-check commands and updated project ledger.

## Executed evidence

```text
New sending/adoption/HTTP/SQL tests: 96 passed.
Earlier invoice creation: 94 passed. Earlier human consent: 100 passed.
Earlier fake/configuration: 22 passed. Earlier OAuth/draft: 27 passed.
Combined: 339 passed, 0 failed, 0 skipped.
Standalone TypeScript 5.8.3 strict check: passed with actual dependency sources, no stubs.
All 8 actual migrations execute; schema remains 31 tables with clean foreign keys.
```

Two targeted OAuth-authorization regressions fail against the original adapter and pass after the repair. A full injected-provider scenario executes durable human commands, creation, adoption, send and status retrieval: one creation, one send, exact `425.00` USD and no payment evidence/permissions/receipts. Transaction failures, lost acknowledgements, restart, eight competing callers and 100 replays are tested. Loop scenarios are not counted as separate tests.

The full historical signature/delivery/lifecycle/receipt/clock collections, original seed/reset runner and installed monorepo build were not run. Tests are native Node/SQLite with synthetic records and injected HTTP, not live PayPal, network-browser or deployed D1 evidence.

## Boundaries and next

No new public route, Worker integration, Cron Trigger, deployment, real credentials, actual email/payment, paid API or GitHub Action was used. `RIGHTS_INVOICE_SENDING_ENABLED=false` remains the default. Existing creation/receipt/clock flags stay unchanged.

Uncertain operations with no safe completion remain blocked. A crash after claiming but before sending is not automatically retried. A successful send acknowledgement never activates a license. Current creator authorization is still injected; no actual login/session system or canonical browser flow is introduced.

Next independent P0 unit: secure creator-session authorization and canonical browser/API wiring. Optional dashboard/agent work and the full UX pass remain deferred. Turn 007 and Gates A/B/C remain open.

See [canonical sending engineering record](../engineering/CANONICAL_INVOICE_SENDING.md).
