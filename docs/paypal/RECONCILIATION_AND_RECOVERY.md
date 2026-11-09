# Sandbox reconciliation and failure recovery

**Owner:** Turn 026, October 27, 2026 HST
**Status:** Implemented and tested locally. No live Sandbox, browser or D1 acceptance.
**Base:** a78d8b699e72580911a6b17607c39008bf68e463

## Purpose and authority

The Turn 025 queue now has a consumer. It requests a fresh read of a known, bound Sandbox invoice through the existing content-validating `SandboxInvoiceAdapter.getInvoice` contract. It never creates an invoice, sends one, records an external payment, refunds money, or grants a license. The composition function accepts an explicit trusted reader, not a browser-supplied status or arbitrary URL.

Before provider I/O, the database resolves current human-confirmed terms, current quote, creator approval, buyer acceptance and canonical invoice binding. Every case/version/quote/acceptance identifier and the USD amount must agree. The same conditions and case/binding revisions are rechecked inside the final database transaction. Changed or missing consent fails closed.

## Fresh observations and conservative state mapping

The returned invoice must match its accepted tuple, known provider ID, amount and USD currency. It must be non-simulated PayPal Sandbox data and retain `authoritativePaymentEvidence=false`. Its observation timestamp must fall within this worker's fresh-read interval and unexpired lease. Payable links must match the strict Sandbox invoice URL allowlist.

DRAFT, SENT/UNPAID/SHARED and CANCELLED/AUTO_CANCELLED can converge safe local invoice states. A delayed DRAFT cannot erase sent state, and a read cannot regress an already paid, refunded or canceled terminal binding. Conflicting observations remain visible as review requirements.

PAID and REFUNDED are stored as financial observations, not promoted to authoritative settlement or permission. The current transport returns status and accepted total but not independently verified settled payment/refund transaction details. Partial, pending, manual/external, scheduled and unknown outcomes also require review. This is an intentional Turn 027 handoff, not a claim that RR-P0-052 is complete.

The immutable reconciliation record preserves provider status, mapped local state, reason, accepted amount, observation time and a safe payer link only when an uncomplicated sent/unpaid state allows it. It contains no payer email, raw source body, signing information or credentials. It is an internal processing record, not the buyer's rights receipt.

## Lease fencing and atomic completion

One queue row can hold one 90-second lease. Competing workers do not acquire the same live lease. A crashed worker's lease expires and can be reclaimed; the old lease token cannot later commit or change retry state.

The completion transaction inserts one immutable record for the binding/generation, updates the canonical invoice's safe operational state, appends a sanitized audit event and acknowledges only the captured queue generation. The first insert includes a NOT NULL subquery guard for lease token/expiry, consent, exact tuple, quote amount and both row revisions. A stale condition rolls back every statement.

A notification received during HTTP increments `requested_generation`. Completion advances only `completed_generation` to the generation originally claimed. The newer work remains pending. A lost commit acknowledgement is recognized from the unique durable reconciliation record; it does not duplicate an audit or erase newer work.

## Shared generation repair

Before this turn, webhook processing assigned the queue generation from the notification projection's revision. A missed-webhook or explicit recovery request can advance the queue independently, so that assignment could regress the counter or lose pending work.

Webhook processing now increments the existing queue counter on conflict. Its audit field is accurately named `notification_projection_version`, not incorrectly labeled as the independent reconciliation generation. A regression test executes the actual webhook store transaction after two non-webhook recovery generations and confirms that the next notification becomes generation three.

## Retries and missed-webhook recovery

Transient transport failures, rate limits and stale revisions retain pending work and schedule a database-backed retry using exponential backoff plus bounded jitter. There is no sleeping retry loop. The first ordinary delay is 30 seconds; rate limits begin at 60 seconds. Automatic attempts stop at five. Authentication, missing invoice/binding, unsafe URL, payload mismatch and malformed provider response failures block automatic retries immediately.

A server-authorized operator retry clears the local recovery block and rechecks status; it never resends an invoice. Repeated requests coalesce into one outstanding generation. Retry deadlines and completion records survive database restart. Five crashed leases are shown as blocked rather than an apparently runnable pending task.

The optional stale-invoice sweep recovers a missing webhook without manual SQL. It examines only already-bound Sandbox invoice IDs, queues at most ten by default, rejects limits above 25 and requires an observation-age threshold of at least fifteen minutes. Fresh, active and already-pending items are excluded. No remote invoice search or high-frequency polling is implemented.

## Creator-facing information and invocation

`inspectReconciliation` returns plain-language pending, in-progress, retry-scheduled, blocked, review-required or up-to-date information. Financial-review observations cannot be displayed as clean completion. The response includes safe retry timestamps and error codes, never a lease token or credentials. This is a tested presentation contract; an authenticated creator API and rendered UI remain to be connected.

`runPayPalReconciliation` is an explicitly opt-in server composition hook requiring Sandbox/judge mode, `PAYPAL_MODE=paypal_sandbox`, `PAYPAL_RECONCILIATION_ENABLED=true`, a migrated database and a trusted reader. It is not attached to a public endpoint or the Worker scheduled handler. No Cron Trigger, deployment or remote settings were changed. Defaults remain false.

## Persistence and verification

Migration 0006 adds lease/retry metadata to the existing outbox and an immutable `paypal_reconciliation_receipts` table. The manifest is schema version 6 with 30 tables. The new table is removed through the invoice-binding delete cascade; seed contents are unchanged. The verifier table lists and Vitest manifest expectations were updated.

Executed locally on Node.js 22.16.0:

```text
New reconciliation/native SQLite suite: 81 passed, 0 failed
Earlier configuration/fake suite rerun: 22 passed, 0 failed
Earlier OAuth/draft suite rerun: 27 passed, 0 failed
Combined executed result: 130 passed, 0 failed
Standalone strict TypeScript 5.8.3: new reconciliation modules and server hook, 0 errors
```

The SQL tests run the new production migration and actual store statements with focused canonical-parent fixtures. They include failures at each completion statement, lost acknowledgements, stale consent and versions, lease expiry, concurrent callers, a newer notification during a read, real webhook-store counter interoperation, file-backed restart, safe links, partial/manual statuses and zero permission/payment-evidence writes.

The injected provider reader returns controlled fixtures. No actual Sandbox account or network call is exercised by the new suite. Earlier delivery, cryptographic-intake and complete Turn 025 suites were not rerun. The new webhook-store change is covered by a focused integration scenario, not a claim of rerunning its full prior suite. The complete migration/seed check, installed-library build, Hono/Worker/browser, live D1 and actual PayPal acceptance remain open.

The local working copy's earlier adapter and draft source hashes matched their existing repository blobs before the 49 regression tests ran. Published core source/test blobs match the locally executed files. Registry DNS was retried and remained unavailable.

## Official references reviewed October 27, 2026

- PayPal Invoicing reference, fresh invoice GET and payment/refund history: https://developer.paypal.com/invoicing/reference/
- Invoice statuses and due amounts: https://developer.paypal.com/api/invoicing/v2/definitions/invoice/
- Aggregated paid amount and PAYPAL versus EXTERNAL transactions: https://developer.paypal.com/api/invoicing/v2/definitions/payments
- Rate limits and backoff guidance: https://developer.paypal.com/api/rate-limiting/

RR-P0-051 has local missed-notification, transient-failure and safe retry evidence. Full settled-payment/permission convergence remains Turn 027 and the live Gate C flow. Turn 007, Gate A and Gate B are not passed by this work.
