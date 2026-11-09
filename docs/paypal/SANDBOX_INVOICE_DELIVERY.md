# Turn 023: Sandbox invoice delivery and retrieval

**Status:** Implemented and tested with injected HTTP responses and native SQLite. No live PayPal, public route, browser handoff or Cloudflare D1 execution has been verified.
**Date:** October 26, 2026 HST

## Explicit opt-in, no automatic activation

`createPayPalSandboxInvoiceAdapter` extends the Turn 022 draft transport with sending and retrieval. It requires all draft transport dependencies plus `sandboxInvoiceTransportEnabled: true`, a delivery journal, and a trusted asynchronous `authorize` function. The default factory remains inert for Sandbox operations. No existing public or creator route is changed to enable payment calls.

The authorization function receives case, asset, terms, quote, creator-decision and buyer-acceptance identifiers, integer cents, and USD. It must load trusted current server records and reject stale, mismatched or unapproved tuples. It is checked for creation, every send invocation, and again after preflight/claim before sending. Test authorizers are fixtures, not production authentication. No browser Boolean or model output may implement this function.

## Request sequence

1. Validate the accepted snapshot and authorize the exact version tuple.
2. Persist a unique case/request/merchant/fingerprint reservation before external draft creation.
3. Reuse the Turn 022 OAuth and draft mapper; store the provider ID and integrity-bound metadata.
4. On explicit send, retrieve the full invoice first and compare it with the accepted binding.
5. If still DRAFT, atomically claim sending. A second instance cannot acquire that claim.
6. Recheck human authority, then POST `/v2/invoicing/invoices/{id}/send` with a stable, separate `PayPal-Request-Id`.
7. Send the recipient notification and suppress the merchant copy. No reminder or resend operation is implemented.
8. Treat HTTP 200/202 only as acknowledgement. GET the invoice again before reporting its observed state or payer link.

The delivery transport has its own private, memory-only OAuth cache. It does not expose a token accessor. The existing draft adapter retains its separate cache to avoid changing its tested behavior in this turn. Both refresh early and retry authentication once on a 401. No secrets, raw provider errors or recipient contact details are returned in invoice views.

## Restart and uncertainty behavior

Migration `0003_paypal_delivery_journal.sql` adds an adapter-private journal, not a second authoritative payment ledger. It records accepted-tuple fingerprints, merchant scope, immutable provider binding, and a monotonic send marker. Recipient and rights text are stored as hashes, not clear text. These are integrity identifiers, not a promise of anonymity.

The D1-shaped implementation uses real conditional SQL, tested with Node SQLite. Unique request IDs and case IDs prevent a different key from duplicating an accepted case. The send marker advances `not_started -> started -> confirmed`. Database triggers prevent identity rewrites and marker regression. The foreign key cascades on case deletion, so the existing local reset removes journal entries.

The marker is claimed before external I/O. A timeout, 5xx, process interruption, malformed acknowledgement, failed post-send GET, or throttled send leaves the reservation in place. Subsequent calls read provider state and never blindly repeat the POST. If the remote state is still DRAFT, recovery fails closed with `reconciliation_required`. Turn 026 must implement explicit operator/reconciliation recovery; stale claims are not automatically unlocked.

A crash between remote draft creation and local binding likewise leaves the reserved case blocked rather than permitting duplicate creation. A successful binding can be reopened by another adapter/process without another create POST. The journal does not replace canonical `invoice_bindings`, `payment_operations`, application audit events or human-consent persistence. Those still need integration before deployment.

## Status and amount validation

A provider read must match invoice ID, invoice number, case reference, USD total, recipient hash, invoicer hash, rights-note hash, one expected line item, item description, quantity and unit amount. Monetary strings are parsed as integer cents; exponents, negatives, fractional cents, inconsistent totals and foreign currency fail closed.

All sixteen currently documented provider status labels are preserved, including SENT, SCHEDULED, PARTIALLY_PAID, MARKED_AS_PAID, PAYMENT_PENDING and externally recorded statuses. Unknown labels become UNKNOWN with reconciliation required. Manually recorded, partial and pending states are never collapsed into confirmed PAID. No status in this turn creates payment evidence or activates permission: `authoritativePaymentEvidence` remains false.

Each fresh read includes `observedAt`. These are observations, not monotonic domain lifecycle updates. Order-safe authoritative transitions remain Turns 025 through 027.

## Payment links

Only `detail.metadata.recipient_view_url` is considered. The handoff must use HTTPS and the exact `www.sandbox.paypal.com` host with an invoice payer path. Credentials in URLs, explicit ports, other hosts, HTTP, query redirects, control characters, escaped paths and non-invoice paths are rejected. The URL is returned only for UNPAID, SENT or SHARED; other states receive null. A missing eligible link is reported as requiring reconciliation rather than fabricated.

The supplied URL is never fetched by the server. A future buyer screen must render it as a normal protected handoff after buyer-capability authorization; no such public route is enabled here. Narrow URL validation may require updating against real Sandbox output, with new tests, before accepting additional formats.

## Executed checks

`npm run paypal:verify` ran without installing dependencies. It executed 102 tests with zero failures: 53 new delivery/journal checks plus 49 prior fake/configuration/OAuth/draft checks. It also ran the existing clearly labeled simulated $425 smoke.

Standalone TypeScript 5.8.3 strict checking passed for all PayPal modules. This is not the repository-pinned installed-library build. The existing database runner was changed only to include the new table in expected/reset counts; the persistence manifest and Vitest expectations advance to schema 3 and 26 tables. The new migration was executed with a minimal parent-case schema, not the entire production D1 database. Full installed Vitest and repository migration/seed regression remain pending.

The native tests cover empty 202 acknowledgements, concurrent sends, separate clients, file-backed close/reopen recovery, timeout before/after send, rate limits, authentication refresh, failed authorization, revoked consent during preflight, invalid references and money, unknown and partial states, unsafe payer links, bounded response reading, immutable journal data, CAS conflicts, foreign keys and reset cascade.

## Official sources checked for this turn

- [Send invoice](https://developer.paypal.com/api/invoicing/v2/invoices-send/): POST and recipient notification behavior, 200/202 responses.
- [Show invoice details](https://developer.paypal.com/api/invoicing/v2/invoices-get/): authenticated status retrieval.
- [Invoice schema](https://developer.paypal.com/api/invoicing/v2/definitions/invoice/): provider status enumeration and amount fields.
- [Invoice metadata](https://developer.paypal.com/api/invoicing/v2/definitions/metadata/): payer-view URL.
- [Core concepts](https://developer.paypal.com/invoicing/core-concepts/): external/manual payment distinction and request idempotency.

No OAuth token, external Sandbox request, email send, real payment, paid API service, GitHub Actions job or user credential handoff was used during verification.
