# Buyer payment handoff and current receipt status

Turn 036 connects the accepted buyer offer to an explicitly requested PayPal Sandbox payment link and the existing current receipt experience. The implementation remains disabled by default. Local provider replies are test inputs, not genuine Sandbox transactions or release evidence.

## Product behavior

The buyer can review the recorded invoice and current receipt status from the private offer page. Opening or refreshing that page reads local records only. An explicit payment-options request retrieves current details for the one canonically bound Sandbox invoice. A separate user click opens the validated PayPal recipient page. The application never automatically navigates to PayPal, records an external payment or sends another invoice from this path.

The payment link is temporary. It is cleared on refresh, failure, expiry, hiding, navigation or restored browser history. A successful provider read with a paid-looking status still does not activate a permission. The existing financial reconciliation and receipt services remain responsible for validated financial evidence, permission state and immutable receipt revisions.

Current receipt presentation distinguishes pending payment, pending receipt, scheduled, active, expired, refunded, revoked and review-required states. A scheduled receipt does not permit use before its start date. A receipt hash is an unsigned integrity check, not ownership proof or legal advice.

## Routes and authorization

| Route | Behavior |
| --- | --- |
| `GET /api/invoices/buyer/status` | Review-scoped bearer capability, current local case/invoice/receipt status, no provider HTTP |
| `POST /api/invoices/buyer/handoff` | Explicit version-bound request, fresh validated invoice GET, safe payment URL or no link |
| `GET /receipts/buyer` | Existing private receipt access shell |
| `GET /api/receipts/buyer?format=html` | Existing independently receipt-scoped protected reader |
| `GET /verify/receipt/:publicId` | Existing minimized public verification page |

The handoff accepts only `{ expectedCaseVersion, invoiceId, confirmed: true }`. The server derives the accepted deal, merchant account, amount, recipient and provider binding. Browser-supplied price, email, destination, rights, payment state or permission state cannot replace those records. Strict JSON parsing rejects duplicate decoded keys, unknown fields, invalid encodings and oversized bodies. Requests must use the configured HTTPS origin. Capability checks are independent from creator managed sessions and public receipt references.

Before a link can be returned, the current human decisions, canonical invoice, successful delivery operation and durable delivery journal must agree. Only the configured Sandbox OAuth endpoint and exact bound invoice GET are reachable through the handoff transport. The existing invoice response validator checks amount, currency, invoice identity, merchant, recipient and licensing material. A read-only journal view prevents status retrieval from writing delivery state. This route cannot call invoice creation, sending, financial reconciliation or receipt issuance.

The final response guard checks the capability, exact invoice aggregate and receipt source together after asynchronous provider and integrity work. Revocation, expiry, changed accepted terms, changed invoice binding or a concurrent financial transition suppresses the stale result. Provider responses remain observations rather than authority to grant permission.

## Browser privacy and freshness

The existing review fragment is erased before data requests. The code stays in memory and buyer requests omit cookies. No code, provider credential, raw provider object or private database snapshot is placed in browser storage.

The browser validates response identities, case versions, status vocabulary and receipt metadata before exposing controls. Status is displayed for at most 60 seconds and no longer than its next UTC licensing boundary. Payment links expire after at most 30 seconds, with elapsed request time deducted. A late response cannot restore cleared private content or an expired link.

Private receipt navigation requires the separate `receipt` capability action. A button constructs the fixed same-origin receipt URL with a fragment only when clicked. The receipt shell immediately erases that fragment and uses header authorization. The token is never retained in a link element, query string or server request URL. Public verification navigation uses only a validated opaque public reference.

The private receipt handler also rechecks authority after its final asynchronous source read and rejects a crossed UTC date boundary. Focused regressions reproduce the prior disclosure at that read boundary and verify the correction for HTML, print and JSON output.

## Configuration and deployment limits

`BUYER_PAYMENT_ENABLED=false` is checked in alongside all existing disabled flags. The buyer payment route requires Sandbox or judge mode, human consent configuration, the migrated database and a fixed HTTPS origin. Provider access additionally needs valid server-only Sandbox merchant/app configuration. Receipt navigation requires independently enabled receipt reading at the same trusted origin.

Keep buyer review, buyer invoice, public verification and buyer receipt ingress outside creator Access. Protect creator review, consent, invoice controls and exports with the managed creator policy. Configure distributed edge limits and log redaction before enabling a deployment. Per-isolate limits are a bounded local defense.

No new dependency, migration, account, paid service, schedule or GitHub Action is required. Live gateway behavior, deployed D1, the pinned installed build and genuine Sandbox invoice/payment/refund/webhook evidence remain separate release gates.

## Verification and reference

The native tests and integrated browser harness use the same transaction and receipt route factories as the Worker. The browser harness applies all eight migrations to SQLite, uses generated RSA assertions verified by the real authorizer and injects provider HTTP responses. Financial reconciliation and receipt issuance use the existing production services; the fixture does not insert fabricated payment or permission rows directly.

Executed counts, scenarios and limits are recorded in [Turn 036](../turns/036-p0-buyer-payment-handoff.md) and its evidence files. Reproduction commands use the supported Node 22 runtime and the existing consent TypeScript loader. This remains local integration evidence, not a genuine provider transaction.

PayPal's [Invoicing reference](https://developer.paypal.com/invoicing/reference/) documents the invoice-details GET and `detail.metadata.recipient_view_url`. It separately describes external recorded payments, which must not be treated as validated PayPal payment evidence. The reference was checked on October 27, 2026 HST.
