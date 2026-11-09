# Canonical draft adoption and authorized sending

Management slot 033, P0 integration. Base: `8f4f5652ddf1a66634bd7480de041c60b92d0928`.

## Scope

This connects the durable human-consent and canonical creation commands to the existing Sandbox delivery adapter. It does not implement creator login, change the simulated React workflow, enable a public send route or complete the original whole-application UX pass. Optional dashboard and sponsor-agent work remain deferred.

`createSandboxInvoiceSending` requires an explicit `RIGHTS_INVOICE_SENDING_ENABLED=true` flag, Sandbox/judge application mode, Sandbox payment configuration, a migrated database, an injected transport and a real creator authorizer. Missing configuration is default-deny. No implicit global fetch, Worker wiring, schedule or deployment is added.

## Canonical adoption

The application reloads the exact accepted deal and reuses the original pricing and consent-evidence checks. It validates the succeeded creation operation, account/merchant fingerprint, canonical provider ID, current case pointers and versions, asset/recipient binding, and verification-record identity. An unaudited or simulated approval is not sufficient.

A pure helper derives the same delivery-journal identity that the existing adapter would have produced during creation: invoice number, accepted-snapshot digest, merchant scope, recipient/email digests, note/rights digests and a non-authoritative Sandbox draft view. It never calls the provider. The service accepts an absent journal or an exactly matching completed journal; partial/conflicting reservations cannot be taken over. Existing journal identity and send history are not reset.

An explicit confirmation command binds the displayed case revision and exact invoice ID. Reservation atomically appends the send audit, adopts the journal when absent, records one `send_invoice` payment operation, marks the canonical binding `send_pending`, and advances the case revision. The first audit INSERT uses a NOT NULL exact-source guard. A failed comparison aborts the batch rather than silently allowing later zero-row updates. New operation keys are stable per accepted invoice.

The send operation's `provider_request_id` is the exact `rr-send-...` key used on the actual HTTP request, not the earlier creation key. The shared derivation is deterministic and produces 38 characters.

## Dispatch and recovery

`execute` claims a pending send operation once, durably marking its outcome unknown before adapter invocation. The adapter independently reads the current invoice, claims its durable send journal, rechecks consent and performs the explicit send operation. Competing workers cannot each invoke a fresh send. After the coordinator claim, subsequent invocations can only retrieve current status.

A timeout, preflight failure, crash before POST, lost claim acknowledgement or post-send read failure does not restore a fresh attempt. This intentionally sacrifices automatic availability to prevent duplicate external actions. A later verified non-draft read can finish local accounting. A still-DRAFT or unknown invoice remains blocked for reconciliation. No unbounded exactly-once external guarantee is claimed.

The adapter retains its bounded retry after an explicit HTTP 401, using the same send key. The integration now rechecks authorization after OAuth acquisition or refresh, immediately before every POST. Two regressions reproduce unauthorized sends against the old adapter and pass with the correction. Network and identity-provider actions cannot be made atomically with the local database; the implementation minimizes rather than claims to eliminate that boundary.

## Completion and reconciliation handoff

A successful 200/202 response is not proof of sending, a payable URL, or payment. The adapter retrieves and validates the same invoice again. The coordinator rechecks the canonical source and current creator authority after all provider I/O, including amount/currency, terms/quote/acceptance IDs, environment and observation time.

Completion atomically appends a sanitized observation audit, completes the send operation, updates delivery state, advances the shared reconciliation outbox, advances the case revision and invalidates a previously issued verification claim. New notification generations and completed generations are preserved. Competing completion or source changes fail the exact snapshot guard. Lost acknowledgements reload the already completed operation without repeating the outbox increment.

Canonical paid, canceled or fully-refunded states are not regressed by a late send result. Financial, refund, manual, partial or pending provider statuses queue reconciliation instead of writing paid status. The command never writes payment evidence, lifecycle observations, permissions or receipt revisions.

A fresh payer link is returned only for validated payable statuses, a locally unpaid financial assessment, no reconciliation warning, and a still-sent canonical binding. Known terminal or conflicting states suppress it. Replay returns a durable result but no stale payment link. Links must pass the existing strict Sandbox payer-URL allowlist. No provider-supplied link is fetched.

## Privacy and schema

No migration is needed: schema version 8 and the original 31 tables are unchanged. Audit and operation data contain identifiers, hashes and safe status information, not buyer email, raw requests, OAuth credentials, bearer tokens or provider response bodies. The existing private request remains the source of the intended recipient. Authorization callbacks are not a session implementation.

## Executed local evidence

```text
96 new native sending/adoption/HTTP/SQLite tests passed.
94 earlier canonical invoice-creation regressions passed.
100 earlier human-consent regressions passed.
22 fake/configuration and 27 OAuth/draft regressions passed.
Combined: 339 passed, 0 failed, 0 skipped.
Strict standalone TypeScript 5.8.3: passed, including exact optional properties and unchecked indexing.
```

The tests invoke actual human approval/acceptance and invoice reservation commands with all eight production migrations. Original migration and recovered dependency Git hashes match the reviewed repository. One complete fixture path invokes the real OAuth/draft/send/read transport against injected HTTP responses. It creates exactly one $425 draft and issues exactly one send. Other scenarios include 100 replays, eight concurrent adapters, all five adoption/two claim/six completion rollback points, file-backed restart, lost acknowledgements, source/auth changes, shared-queue races, terminal-state preservation and privacy.

Tests use synthetic records and mocked provider HTTP. No actual Sandbox account, email, money transfer, network browser session or deployed D1 was used. The original seed/reset runner, full historical delivery/webhook/reconciliation/receipt/clock suites and installed monorepo build were not rerun. Node is 22.16.0; the standalone TypeScript is not the project-pinned 5.9.3. Registry DNS resolution remains unavailable. Turn 007 and Gates A/B/C remain open.

## Commands and next

```text
npm run invoice:sending:verify
npm run invoice:sending:typecheck
```

Next P0 work is secure creator-session authorization and canonical browser/API integration. Runtime flags remain off. The original Turn 033 complete UX/accessibility pass is deferred, not represented as complete by this server-side turn.

Official references reviewed October 27, 2026:

- https://developer.paypal.com/api/invoicing/v2/invoices-send/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
