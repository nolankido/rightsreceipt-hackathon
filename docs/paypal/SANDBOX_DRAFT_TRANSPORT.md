# PayPal Sandbox OAuth and draft invoice transport

**Owner:** Turn 022, October 26, 2026 HST
**State:** Implemented and verified locally with injected responses. No live PayPal request has been made.
**Transport:** `packages/paypal/src/sandbox-draft.ts`
**Authority:** No payment confirmation, buyer acceptance, license or real-world rights.

## Scope

The explicit opt-in `createPayPalSandboxDraftAdapter(config, dependencies)` supports **only**:

1. Exchange server-only Sandbox client credentials for an OAuth Bearer token using `POST https://api-m.sandbox.paypal.com/v1/oauth2/token` with HTTP Basic and `grant_type=client_credentials`.
2. Cache the token in memory and refresh it before the expiration supplied by PayPal. Concurrent calls share one token fetch. A 401 invoice response triggers one token refresh and one retry with the **same** request ID.
3. Validate the exact trusted `AuthorizedInvoiceSnapshot` from the prior payment contract. Build one Invoicing v2 draft with USD integer-cent amount, merchant and recipient contact, asset reference, rights summary and the exact case and quote references.
4. Create a **DRAFT** invoice with `POST https://api-m.sandbox.paypal.com/v2/invoicing/invoices` and `PayPal-Request-Id` equal to the stable server-issued request key. Replays within one adapter instance return the same saved draft, and overlapping requests share one outbound call.
5. Return a privacy-minimized record with `provider: paypal`, `environment: sandbox`, `status: DRAFT`, `simulated: false`, `authoritativePaymentEvidence: false`.

The default `createPayPalSandboxAdapter()` and `createPaymentAdapter()` from Turn 021 stay inert. This is intentional: no application route instantiates the opt-in transport. `sandboxDraftTransportEnabled: true`, an injected HTTP function, and an independently supplied valid Sandbox merchant are necessary to construct the draft transport. The code never selects a live PayPal origin or follows redirects.

## Request and security invariants

- Only the exact Sandbox origin is allowed. The OAuth and draft paths are fixed constants, not input-controlled URLs.
- No `VITE_` secret, production credential, credential-bearing URL, or unsecured redirect is permitted.
- The merchant business name/email must be independently configured on the server, never copied from arbitrary buyer text.
- The client ID, secret and Bearer token are captured privately in the adapter instance and are excluded from `PaymentInvoiceView`, telemetry, audit, receipts, and error messages.
- Integer cents are formatted as a two-decimal string without floating-point conversions. The canonical case, asset, immutable terms and quote IDs, buyer acceptance ID and approved rights description remain version-bound.
- The `PayPal-Request-Id` is reused for all retries of the same accepted package. Different payloads using the same key, or different keys for the same case/quote/terms/acceptance tuple, fail closed.
- Network interruption or an HTTP 5xx after invoice creation may have occurred is an **unknown outcome**. The caller must retry with the same request ID; do not create a new payment operation.
- 429, 401/403, malformed OAuth/invoice responses, production URL injection and provider error bodies are handled without leaking secrets.
- `sendInvoice()` and `getInvoice()` still reject with `sandbox_transport_pending`. No Send, webhook, reconciliation, paid/refund, authorization or license path was implemented.

### Durability warning

The in-memory adapter journal is **not** a substitute for a durable D1 operation/invoice binding. It prevents duplicates only inside one process. A multi-instance Worker or a restart could lose reservations. PayPal's idempotency retention is finite; therefore **do not expose live Sandbox draft creation to a public route until a durable operation journal, recovery behavior, authenticated creator actions and a tested D1 transaction boundary exist**. The Turn 022 code is for offline testing and future protected integration, not a deployment readiness claim.

### Additional authority warning

The `AuthorizedInvoiceSnapshot` validator checks shape, not signatures or approval history. A future application service must fetch the saved active creator approval, buyer acceptance, current terms/quote versions, recipient and immutable pricing policy in one trusted boundary before constructing a draft. **Do not accept an invoice snapshot from a browser, AI output, or an untrusted request body.** No such public API was added in Turn 022.

## Offline verification

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/paypal-ts-test-loader.mjs --test scripts/paypal-adapter-local.test.mjs scripts/paypal-sandbox-draft-local.test.mjs
node --no-warnings --experimental-strip-types scripts/paypal-demo-local.mjs
tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noUnusedLocals --noUnusedParameters --noImplicitOverride --verbatimModuleSyntax --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM packages/paypal/src/*.ts
```

The combined **49 native Node tests passed**, including the 22 existing fake/strict-configuration tests and 27 new OAuth/draft/negative tests. The TypeScript strict check passed. The offline fake smoke still outputs `SIMULATED ONLY - NO PAYPAL PAYMENT OR LICENSE` and 42,500 cents.

`--experimental-loader` is confined to dependency-free native tests so Node can resolve TypeScript's extensionless relative import. Application bundlers do not use it. The transport injected into the new tests returns synthetic `Response` objects and **does not contact PayPal**.

## Official API references

- [PayPal REST authentication](https://developer.paypal.com/api/rest/authentication), OAuth client-credentials request and response.
- [PayPal Invoicing v2 use cases](https://developer.paypal.com/invoicing/use-cases/), minimum draft fields and create versus send behavior.
- [PayPal REST request headers](https://developer.paypal.com/api/make-api-requests), `PayPal-Request-Id` idempotency and environment base URLs.

## Remaining work

Turn 023: explicit send and status retrieval with bounded provider responses, protected user-action handoff, durable local invoice binding and safe PayPal-hosted links. Turn 024 and onward: verified signed webhooks and authoritative payment/permission lifecycle. The Turn 007 clean dependency gate, Gate A browser test, Gate B AI safety review and D1 deployment checks remain blocked independently.
