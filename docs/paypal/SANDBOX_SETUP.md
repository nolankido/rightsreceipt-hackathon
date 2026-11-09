# PayPal Sandbox configuration and handoff

**Owner:** Turn 021, October 26, 2026 HST
**Status as of Turn 022:** Offline fake adapter and mocked Sandbox OAuth/draft creation are implemented and tested. No live Sandbox API call, webhook registration, D1 invoice persistence, or real payment evidence yet. The original Turn 021 steps below are retained for historical context.

## Safety boundaries

RightsReceipt is a hackathon-only PayPal **Sandbox** integration. The only allowed API origin is exactly `https://api-m.sandbox.paypal.com`. `https://api-m.paypal.com` and all other origins, aliases, redirects, URLs with credentials, HTTP downgrades, paths, ports or query strings are prohibited by configuration validation. Never enable a production PayPal environment for this project.

The fake adapter is not PayPal. It is an in-process, resettable simulator for unit tests and offline local development. Every fake invoice says `provider: fake`, `environment: simulated`, `simulated: true`, and `authoritativePaymentEvidence: false`. A fake `PAID` status never authorizes license activation or a real receipt.

Sandbox credentials are accepted only as **server-only environment bindings**, never browser variables or source files. Do not put credentials in chat, issues, logs, audit payloads, Git commits, screenshots, compiled front-end assets, or public demo links. The application must use the trusted server-side accepted quote and human-consent records to construct each invoice snapshot. Browser input or AI proposals may not construct an approved payment command.

For the newer Turn 022 draft-only implementation, see [Sandbox draft transport](SANDBOX_DRAFT_TRANSPORT.md). It accepts injected HTTP only and remains deliberately disconnected from public application routes. No Sandbox credentials or merchant identity are requested from the user in this turn.

## Local offline mode (working)

The checked-in `.dev.vars.example` is safe to copy without credentials:

```dotenv
APP_MODE=local
PAYPAL_MODE=fake
```

Start local verification without a package install:

```bash
node --no-warnings --experimental-strip-types --test scripts/paypal-adapter-local.test.mjs
node --no-warnings --experimental-strip-types scripts/paypal-demo-local.mjs
```

The fake adapter supports draft creation, simulated sending, and fake-only paid/canceled/refunded transitions, with idempotency tied to a stable request key and the exact quote/terms/acceptance tuple. It is local process memory, not D1 persistence or the existing Turn 013 mock transaction store.

## Sandbox handoff for future Turns 022 through 024 (not active)

When real Sandbox testing is authorized and the integration code is ready:

1. Sign into the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) and create/select a **Sandbox** REST app associated with a Sandbox business test account with Invoicing enabled. Use a Sandbox personal test buyer for payment testing. Never use production funds or accounts.
2. Obtain the Sandbox app Client ID and Secret. Add these only to `.dev.vars` for local development or a protected deployment secret mechanism for a permitted private preview. The example file is not the place to store actual values.
3. Set the following server-side bindings. The strings inside angle brackets below are documentation placeholders, not functional credentials. Do not commit populated files.

```dotenv
APP_MODE=sandbox
PAYPAL_MODE=paypal_sandbox
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_SANDBOX_CLIENT_ID=<server-only-sandbox-client-id>
PAYPAL_SANDBOX_CLIENT_SECRET=<server-only-sandbox-client-secret>
# PAYPAL_SANDBOX_WEBHOOK_ID=<registered-sandbox-webhook-id-when-available>
```

4. Keep the Sandbox recipient email distinct from the merchant email. Ensure the recipient is a sandbox test account. No invoice should be sent until a creator approved and buyer accepted the *same* immutable terms and quote versions.
5. In Turn 022, implement server-side OAuth client-credentials exchange at `POST /v1/oauth2/token`, short-lived memory token cache, version-bound idempotent draft invoice creation at `POST /v2/invoicing/invoices`, and sanitized error translation.
6. In Turn 023, implement an explicit send action `POST /v2/invoicing/invoices/{id}/send`, invoice status retrieval, and the PayPal-hosted payment link. Use a stable PayPal request ID for mutating calls and persist invoice bindings before retry.
7. In Turn 024, register a Sandbox webhook and verify the actual signed event with the registered **webhook ID** before processing. Preserve original request bytes and redact sensitive fields. PayPal's webhook simulator is not equivalent to signed sandbox transaction evidence.
8. Until the authentication, session, D1, and browser gates pass, **do not deploy public creator or payment actions**.

**Turn 021 behavior:** Sandbox configuration validation can confirm that server-only values look present, but the adapter deliberately throws the sanitized `sandbox_transport_pending` error for every draft, send, or read call. No HTTP transport is enabled. This is intentional, not a successful Sandbox connection.

## Adapter contract and allowed sources

`AuthorizedInvoiceSnapshot` requires case, asset, terms version, quote, creator decision, buyer acceptance, integer-cent USD amount, bounded recipient email, bounded rights summary, and stable idempotency key. The adapter checks structural integrity and rejects unknown fields, but it **does not by itself verify human identities, approvals, policy validity, or payment**. A future trusted application service must resolve those records transactionally and validate them before invoking the adapter.

Production deployment must never infer permission state from a client callback, browser redirect, invoice status string alone, simulated result, or unverified webhook. Only verified Sandbox PayPal evidence and the separate authoritative permission lifecycle engine can activate rights.

## Official PayPal references checked October 26, 2026

- [Invoicing v2 quick start](https://developer.paypal.com/api/invoicing) (updated September 3, 2026): draft, send, buyer sandbox sequence.
- [Invoicing v2 REST reference](https://developer.paypal.com/api/invoicing/v2/): supported invoice endpoints.
- [PayPal OAuth 2.0 authentication](https://developer.paypal.com/api/rest/authentication): client credentials and access tokens.
- [PayPal API base hosts and request idempotency](https://developer.paypal.com/api/make-api-requests): sandbox origin and PayPal-Request-Id.
- [Invoicing webhook guide](https://developer.paypal.com/api/invoicing/webhooks/): events, signed verification, and registered webhook ID.

No Sandbox credentials are required from the user for Turn 021, and no request for them is being made until an authorized integration handoff.
