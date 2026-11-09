# Sandbox invoice financial details and permission lifecycle

**Owner:** Turn 027, October 27, 2026 HST
**Status:** Locally tested implementation. Not deployed, not tested with genuine Sandbox transactions.

## What is trusted

The existing authenticated Sandbox invoice GET first validates invoice identity, merchant, recipient, amount, line item, rights summary and accepted version references. Only after those checks does it assess the financial fields from that same response. No second, unrelated payload can be substituted. The old `authoritativePaymentEvidence: false` transport flag remains: the adapter alone still grants no rights.

The new lifecycle requires that validated server-side reader, a current recovery lease, exact human-approved terms/quote/acceptance and an atomic database commit. Its input is an internal invoice-binding ID, not browser or model JSON. Default configuration disables the server composition helper. No public route or schedule is added.

## Financial assessment

`settlement.ts` validates integer-cent USD amounts without rounding, exact paid/due/refund totals, unique transaction IDs, bounded arrays, original payment dates and refund dates. Only provider-listed `PAYPAL` transactions with supported payment methods qualify. Manual/external entries, partial/pending states, missing details, future/invalid dates, conditional totals and nonzero gratuity remain under review. Arrays and summaries are immutable, redacted and locally constructed. A local construction marker is not cryptographic proof; the authenticated, content-validating invoice GET remains the authority source.

- `PAID`: full invoice amount equals the PayPal transaction sum and aggregated paid amount, due is zero, and there is no refund.
- `REFUNDED`: both the original full PayPal payment and a full PayPal refund are explicitly listed and their totals agree. Refund without payment history cannot qualify.
- `CANCELLED` or `AUTO_CANCELLED`: no payment or refund transactions exist. A prior paid permission makes cancellation conflicting, not an automatic reversal.
- Anything incomplete, partial, manually recorded, external or contradictory becomes `review_required`.

These are provider-recorded invoice financial checks. They do not establish irreversible bank settlement, eliminate dispute/chargeback risk, or make the software a legal authority. No separate capture/refund endpoint is guessed from an invoicing transaction ID. Genuine Sandbox payload compatibility must be proven at Gate C.

## Canonical transitions

A validated full payment creates a permission as scheduled, active or expired using the UTC half-open interval `[start_date, end_date_exclusive)`. It never calls a future-dated permission active. Repeat observations reuse the same payment-evidence hash and do not repeat activation. A full-refund snapshot arriving before a separate paid notification records the paid and refund evidence atomically and creates only a refunded permission, never a temporary active one.

Partial refund or conflicting detail sets the permission's new `review_required` flag and the invoice's reconciliation state. Presentation must call `permissionPresentation` or enforce the equivalent review check, never expose the stored active state by itself. Known refund amounts cannot decrease on a later PAID read. Refunded, revoked and expired permissions cannot return to active or scheduled. Expired permissions may become refunded on subsequently verified full refunds; creator revocation remains distinct from money movement.

`revokeSandboxPermission` requires an injected authenticated creator-authorization function and expected revision. It atomically changes the permission, records a creator audit event and invalidates public verification. It does not refund money, alter the invoice or write fake refund evidence. No creator endpoint is exposed yet.

## Atomicity, concurrency and public verification

The first completion insert contains a NOT NULL SQL fence over the current accepted tuple, case/invoice revisions, exact licensing dates, permission revision, lease owner/expiry and captured reconciliation generation. A notification arriving during the read prevents this older financial result from granting rights. All completion writes roll back together on failure.

A successful transaction appends an immutable financial observation, reconciliation receipt, deduplicated normalized payment evidence, permission change when needed, case/invoice pointers, audit and generation acknowledgement. Lost acknowledgements are recognized by the persisted generation. Lease ownership and retries reuse the Turn 026 recovery port.

No hashed rights receipt is issued here. Any existing verification record is marked invalid after a material lifecycle change. This prevents an old or absent receipt from displaying a newly active claim. Turn 028 must generate and bind the correct immutable receipt revision before public verification becomes valid. These records are internal Sandbox state, not public production licenses.

## Persistence and configuration

Migration 0007 adds `paypal_lifecycle_observations`, an immutable observation table, and `permissions.review_required`. Database guards protect permission identity and terminal states. Schema version becomes 7 with 31 tracked tables. The new observation rows clear through existing invoice-binding delete cascades; no baseline seed content changes.

`PAYPAL_PERMISSION_LIFECYCLE_ENABLED=false` is the default. The server helper requires Sandbox/judge mode and `paypal_sandbox`, a migrated database, the same database's recovery store and the validated invoice reader. It neither acquires credentials nor installs any public or scheduled task.

## Executed verification

- 91 new financial validation, lifecycle, revocation, SQLite, concurrency and failure scenarios passed.
- Five new tests exercised the actual modified Sandbox invoice transport against injected HTTP responses.
- 49 previous configuration/fake/OAuth/draft tests were rerun, with verified base source identities.
- Combined: **145 tests passed, 0 failed**.
- Standalone TypeScript 5.8.3 strict checks passed for the new modules, modified transport and server helper with their actual recovered dependencies, without stub declarations.

The SQLite suite executes the real new SQL against focused parent-schema fixtures and a test recovery-lease implementation. It does not replace the full production recovery suite, full migration/seed gate, live D1, installed dependency build, browser tests or genuine Sandbox evidence. The prior complete delivery, webhook, processing and reconciliation suites were not rerun here. Full `pnpm verify` remains blocked by registry DNS resolution.

## Official references checked October 27, 2026

- Invoice GET and authentication: https://developer.paypal.com/api/invoicing/v2/invoices-get/
- Invoice amounts, due amount, PayPal/external payments and refund details: https://developer.paypal.com/api/invoicing/v2/definitions/invoice/
- Payment transaction schema: https://developer.paypal.com/api/invoicing/v2/definitions/payments
- Webhook PAID can mean partial/pending; REFUNDED can mean partial: https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/

## Next

Gate C requires the integrated, registered Sandbox flow with redacted evidence, secure creator access, actual buyer payment and matching receipt verification. The gate is not passed by local fixtures. Receipt hashing and publication remain Turn 028; buyer clarification-answer persistence and the installed/browser gates also remain open.
