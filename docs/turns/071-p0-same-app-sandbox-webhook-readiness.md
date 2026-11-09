# Turn 071: Same-app PayPal Sandbox paid webhook readiness

## P0 problem

The genuine PayPal Sandbox acceptance harness could create and send a USD 425.00 invoice even when the configured webhook belonged to a different REST application, was not subscribed to `INVOICING.INVOICE.PAID`, or pointed to an invalid callback URL. Under PayPal's current invoicing behavior, an app mismatch prevents the paid webhook from being sent. Such an invoice could be paid but still could not complete RightsReceipt's required signed-webhook acceptance gate without later account intervention.

Official source: [PayPal invoicing webhook troubleshooting](https://developer.paypal.com/invoicing/troubleshooting) and [PayPal Webhooks integration](https://developer.paypal.com/api/rest/webhooks/rest/).

## Completed change

- Added `scripts/support/sandbox-webhook-readiness.mjs`. It uses the same configured Sandbox client credentials as the invoice adapter, requests an OAuth token through the fixed `https://api-m.sandbox.paypal.com/v1/oauth2/token` endpoint, and performs one authenticated read-only `GET /v1/notifications/webhooks`. It does not call PayPal production, create an invoice, create/delete a registration, or send a webhook.
- Validates that the configured `PAYPAL_SANDBOX_WEBHOOK_ID` appears exactly once in this REST app's registration list, subscribes to `INVOICING.INVOICE.PAID` or all events, and uses a structurally valid public HTTPS listener URL. Rejects simulator-only `WEBHOOK_ID`, local/private/test addresses, credentials, queries, malformed/oversized responses, redirect attempts and unrecognized/missing subscriptions. Uses bounded JSON bodies, explicit request timeouts, and sanitized fixed error codes.
- Added `scripts/sandbox-webhook-preflight.mjs` as `pnpm sandbox:acceptance:webhook:preflight`. It prints only sanitized status, event type and a SHA-256 hash of the configured ID. Does not print access tokens, secrets, listener URL or private account details. Useful before touching invoice state.
- Integrated the same check into `runCreate` before the first invoice POST. A wrong-app/missing registration stops Stage 1 without creating or sending an invoice. A passing Stage 1 captures sanitized webhook-registration readiness in its local acceptance evidence.
- Added 10 standalone registration tests, 3 CLI tests and 2 negative end-to-end fixture cases. Updated the normal canonical test fixture and interrupted-send fixture to return a mocked same-app registration list.
- Registered the tests in `sandbox:acceptance:verify`, `sandbox:acceptance:webhook:preflight:verify` and `paypal:verify`. Updated the PayPal Sandbox runbook, README, project status and judge quick start.

## Verification evidence and limits

**13 focused tests passed under Node 22.16.0**, using only synthetic HTTP responses. Exact blob hashes of all four new source/test files were compared to their locally executed bytes. Tests include wrong REST app, missing paid subscription, disabled event, wildcard event, simulator-only ID, invalid listener URLs, malformed OAuth/list replies, oversize response and sanitized transport errors.

The modified existing acceptance integration test suite was staged but **not run against the complete private GitHub repository in this session**. No actual PayPal Sandbox OAuth, webhook management API, invoice creation/sending, payment, signed webhook delivery, or production operation was performed.

**What this proves:** The code checks registration metadata from the same OAuth application before invoice creation. **What it does not prove:** Public HTTPS listener reachability, genuine event delivery, webhook cryptographic authenticity, payment/settlement, or app production readiness. PayPal simulator events are not usable with the real `verify-webhook-signature` postback API.

## Remaining gates

Before release, run the full clean Node 22 `pnpm release:verify`, provision a legitimate public HTTPS Sandbox webhook listener if one is not available, run a genuine business/personal PayPal Sandbox invoice and payment through the private buyer handoff, verify a genuine captured paid webhook, reconcile the evidence, export the sanitized one-commit public repository, and finalize the functional demo video and Devpost submission.

No paid AI API, real PayPal payment, Cloudflare deployment, GitHub Actions or public publication was performed.
