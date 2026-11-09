# Idempotent, order-safe verified webhook processing

**Owner:** Turn 025, October 27, 2026 HST
**Status:** Native Node/SQLite implementation verified locally. No live Sandbox or D1 run.
**Base:** 88cf6959801544766554465f3e80d80dd2470082

## Boundary

Turn 024 authenticates and durably receives a redacted notification. Turn 025 consumes that verified inbox row by its internal identifier. It does not accept arbitrary provider JSON from a caller. It cannot call PayPal, send an invoice, set the canonical invoice status, create payment evidence, activate permission, or issue a licensing receipt.

A signed `INVOICING.INVOICE.PAID` event can concern partial or pending payments. A refund event can concern a partial refund. Consequently, neither a signed event name nor the retained status text establishes settled money. Processing emits a **reconciliation request**, not an authorization.

## Atomic effects and crash behavior

`createVerifiedWebhookProcessor` resolves a canonical Sandbox invoice binding and computes a monotone notification projection. The D1-shaped store commits five effects as one batch:

1. Insert a unique immutable processing receipt for the inbox event.
2. Merge notification facts into the invoice's projection.
3. Advance the invoice's single reconciliation-outbox generation.
4. Append a sanitized application audit event.
5. Associate the inbox with the binding and mark it processed.

The first insert contains a compare-and-swap guard against the original verified inbox identity, content hash, processing state, canonical invoice binding revision and projection revision. A failed guard produces a NOT NULL constraint failure, rolling back the entire batch. There is no `INSERT OR IGNORE` shortcut followed by unconditional side effects.

Duplicate receipt uniqueness and binding/projection revision checks coordinate independent callers. The processor reloads after a conflict, with at most four attempts. Failure remains `retry_pending`; accepted evidence is not erased. A lost acknowledgement after a successful transaction is recognized from its durable receipt on reload. No network call occurs inside this transaction.

## Delivery-order independence

The projection accumulates notification facts using bitwise union: created, sent, scheduled, payment-related, cancellation, refund-related, updated and uncertain. Those facts never disappear. An older CREATED or SENT event cannot replace a payment/refund notice. Payment plus cancellation becomes a conflict for review, not a guessed final state.

For display metadata only, the latest provider creation instant is chosen, with a stable ASCII provider-event-ID tie break. All instants are validated and normalized to UTC. The current provider status remains a notification hint, not a paid permission. The projection is independent of the order in which a fixed event set is processed.

Partial, pending, manual/external and unknown statuses retain an uncertainty flag. Every new verified event requests reconciliation, even when its notification facts repeat earlier facts.

## Durable coalescing and Turn 026 handoff

Migration 0005 adds three adapter-side tables:

- `paypal_webhook_processing_receipts`: one immutable successful processing result per inbox event. This is not a rights receipt.
- `paypal_webhook_projections`: accumulated notification facts, latest notice metadata and optimistic revision.
- `paypal_reconciliation_outbox`: one row per invoice binding, with requested and completed generations.

A replay of the same event does not advance any generation or audit. Different provider event IDs coalesce into one invoice work item. Requested generations advance once per distinct processed event; an earlier completed generation is retained. A future reconciler must acknowledge only the generation it actually examined. A newer notification must remain pending if it arrives during a status fetch.

**No exactly-once claim is made for future external I/O.** Turn 026 must implement fresh status reads, accepted-version checks, safe retry and generation acknowledgement. Turn 027 owns authoritative payment and permission lifecycle behavior.

## Missing associations, errors and privacy

An event received before its canonical invoice binding remains pending. Once the binding exists, the processor associates it safely in the same transaction. A reference to another invoice, rejected/legacy unverified event, malformed identity/date or unsupported event type creates no processing effects. Processed rows without a matching receipt are treated as inconsistent history, not trusted duplicates.

The bounded batch query excludes unknown invoice bindings so they do not occupy every batch slot. Errors and return values are sanitized. Buyer contact data, raw payloads, signing headers and credentials are not copied into processing receipts, audits or summaries.

## Invocation and configuration

`runPayPalWebhookProcessing` is a server-only batch hook. The Worker exposes it through a scheduled handler, but **no Cron Trigger is installed**. No public processing route is added and no remote configuration is changed.

The hook requires `PAYPAL_WEBHOOK_PROCESSING_ENABLED=true`, `PAYPAL_MODE=paypal_sandbox`, Sandbox/judge application mode and a migrated database. Defaults remain false. Each call handles at most 25 associated events. The library accepts a caller-selected batch size of 1 through 100 for bounded tests and future controlled use.

The existing intake remains separate: acknowledgement means durable authenticated receipt, not completion of downstream reconciliation. Intake does not wait for this processor.

## Executed verification

```text
npm run webhook:processing:verify
47 passed, 0 failed

Combined new processing + earlier fake/configuration + OAuth/draft suites
96 passed, 0 failed

Standalone strict TypeScript 5.8.3: processing engine, SQL store and batch hook
0 errors
```

The 47 tests include all 120 permutations of five event types, 100 replay calls, concurrent workers, per-statement transaction failure injection, lost commit acknowledgements, stale binding/projection races, late association, file close/reopen, immutable evidence, reset cascades and zero protected-state changes. They execute the real new migration and store SQL on Node SQLite. Parent tables are minimal fixtures; this is not the full repository migration/seed gate or live D1.

The Turn 023 delivery and Turn 024 cryptographic intake suites were not rerun in this isolated workspace. The full combined root payment command remains to be executed in a complete checkout. No installed-library build, browser acceptance, live Sandbox or Worker deployment is claimed. npm registry DNS resolution was retried and remained unavailable.

## Official references reviewed October 27, 2026

- PayPal Invoicing webhooks: https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/ (paid may be partial/pending; refunded may be partial).
- PayPal Invoicing webhook handling: https://developer.paypal.com/api/invoicing/webhooks/ (duplicate deliveries and out-of-order events; fetch current invoice state when needed).
- PayPal REST webhook delivery: https://developer.paypal.com/api/rest/webhooks/rest/ (retry behavior and listener acknowledgement).

Gate A, Gate B and Turn 007 remain open. This turn does not change the learned model's prohibition on automatic rights resolution.
