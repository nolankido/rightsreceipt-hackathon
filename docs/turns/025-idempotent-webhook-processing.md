# Turn 025: Idempotent and order-safe webhook processing

**Priority:** P0
**Date:** October 27, 2026 HST
**Status:** Implemented and locally verified. Live Sandbox, full application and release gates remain pending.
**Base commit:** 88cf6959801544766554465f3e80d80dd2470082

## Delivered

- Added a bounded processor that reads only authenticated, persisted Sandbox inbox records by internal ID.
- Added immutable per-event processing receipts and an atomic five-write D1 batch spanning receipt, notification projection, reconciliation outbox, audit and inbox completion.
- Added event uniqueness and compare-and-swap guards for conflicting workers, case binding revisions and per-invoice projection revisions.
- Preserved pending events after failures, allowed safe retries, and recognized committed work after a lost acknowledgement or process restart.
- Added monotone notification flags and stable timestamp/event-ID ordering; stale CREATED/SENT events cannot erase financial notices.
- Retained partial, pending, manual/external and unknown statuses as uncertain, non-authoritative notices.
- Coalesced reconciliation work into one generation-tracked row per canonical invoice, preserving previously acknowledged generations.
- Added schema migration 0005, manifest version 5 with 29 tables, reset/verifier table lists and updated Vitest expectations.
- Added a server-only scheduled-handler hook, explicitly disabled by default with no Cron Trigger or public processing route configured.
- Added native SQL, concurrency, crash, permutation, privacy and feature-flag regression coverage.

## Executed evidence

```text
npm run webhook:processing:verify
47 tests passed, 0 failed

New processing tests plus earlier fake/configuration and OAuth/draft tests
96 tests passed, 0 failed (47 + 22 + 27)

Strict TypeScript 5.8.3, new processing/store/batch-hook modules
0 errors

Worker wrapper syntax and modified JavaScript syntax
passed
```

The 47 tests include 120 event-order permutations and 100 replay invocations inside their scenarios, not as inflated separate test counts. Failures injected at each of the five transaction statements leave no partial effects. A reopened file-backed SQLite database retains receipts and suppresses reprocessing. Native tests use the actual new SQL, existing inbox columns, migration 0004 and minimal canonical-parent fixtures.

Existing OAuth/draft source recovered from prior verified artifacts matches the repository blob hashes. The later Turn 023 invoice-delivery suite and Turn 024 signature-intake suite were not rerun here. No full pnpm gate, project-pinned TypeScript/Vitest run, complete schema/seed check, browser, live D1 or actual PayPal delivery is claimed.

## Acceptance relationship

- RR-P0-049: local duplicate/concurrency/crash tests establish one successful processing receipt and one audit per verified event, with one coalesced reconciliation row per invoice.
- RR-P0-050: local delivery permutations produce identical notification projections and cannot regress canonical invoice/permission state because this worker has no write capability for those tables. Full financial lifecycle permutations remain Turn 027.
- RR-P0-048: processing audit/receipt data remain redacted and correlated to accepted inbox/binding identities.
- RR-P0-051 and RR-P0-052: status reconciliation and authoritative payment/permission activation are not implemented here.
- RR-P0-001, Gate A and Gate B: remain open.

## Limitations and next

A verified notification does not establish settled amounts. This processor intentionally queues review, never sends invoices or creates payment evidence, rights receipts or permissions. Canonical invoice bindings and real human consent still require the application integration. The worker hook is source-tested but not deployed or scheduled.

Next independent unit: **Turn 026, reconciliation and failure recovery**, consuming outbox generations with fresh Sandbox status and accepted-version checks. No live credentials, paid API, GitHub Actions, remote scheduling or user handoff was used.

See [engineering record](../paypal/IDEMPOTENT_WEBHOOK_PROCESSING.md).
