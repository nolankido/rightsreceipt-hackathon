# Verified PayPal Sandbox webhook intake

**Owner:** Turn 024, October 27, 2026 HST
**Status:** Source implemented and locally tested against injected HTTP and SQLite. Actual PayPal verification, deployed Workers/D1, full Hono/browser and installed-library gates are unverified.

## Boundary and route

`/webhooks/paypal/sandbox` is isolated in the Worker entrypoint before Hono or JSON middleware consumes the body. All other requests delegate to the existing Hono application. The checked-in deployment still has `APP_MODE=local`, so this route returns a sanitized retryable 503 and performs no HTTP.

The server must explicitly set `PAYPAL_WEBHOOK_INTAKE_ENABLED=true`, select `APP_MODE=sandbox` or `judge`, provide a D1 binding with migration 0004, select `PAYPAL_MODE=paypal_sandbox`, use the exact Sandbox API origin and supply server-only Sandbox client credentials plus the registered webhook ID. The ID is application configuration, not data trusted from an incoming request. Simulator `WEBHOOK_ID` placeholders are rejected.

No credential or account action is needed for the local tests. No real credentials were accessed or requested in this turn. Public creator/payment actions remain subject to their existing release gates.

## Verification sequence

1. Require POST, JSON UTF-8 and identity encoding. Validate all five PayPal signing headers. Reject missing, malformed or comma-combined headers, unsupported algorithms and non-allowlisted certificate URLs.
2. Read at most 128 KiB through a bounded stream, even when Content-Length is absent or dishonest. Reject invalid UTF-8, duplicate JSON keys (including escaped and nested keys), nonfinite numbers, malformed envelopes and excessive nesting.
3. Preserve original bytes and source JSON in transient memory. Obtain a short-lived OAuth token using the fixed Sandbox origin. Post the registered webhook ID, original signing headers and original JSON event to `/v1/notifications/verify-webhook-signature`. No payload or certificate URL is fetched locally.
4. Require an HTTP 200 JSON response containing exact `verification_status: SUCCESS`. A `FAILURE`, malformed result, redirect, auth failure, rate limit or unavailable dependency cannot create an accepted inbox row. One OAuth refresh on 401 is permitted; the verification payload remains unchanged.
5. Accept only subscribed Invoicing events. Authenticated unrelated events are acknowledged as ignored. Direct and nested invoice IDs are supported, but conflicting identities are rejected.
6. Persist minimal verified metadata, then acknowledge. Storage failure returns 503 rather than accepting and losing an event. Raw bodies, payer email, private notes, access tokens, signatures and certificate URLs are not stored or returned.

The verification implementation uses PayPal's supported postback method, not a locally reimplemented certificate trust chain. Its exact outgoing `webhook_event` JSON preserves the original representation rather than reserializing parsed properties. The SHA-256 digest identifies the exact received bytes. The digest is not a replacement for signature verification.

## Replay, time and storage

Transmission timestamps permit up to five minutes of future clock skew and up to three days plus five minutes of age. The latter deliberately accommodates PayPal's documented multi-day retry window instead of applying a five-minute maximum age to every redelivery. This is an application policy, not a claimed universal PayPal requirement. Older/manual resends need reconciliation rather than bypassing verification. Event creation time is separately validated and may legitimately predate the transmission.

Every delivery, including a duplicate, is authenticated before deduplication. An exact repeated event yields one durable row and does not reset processing status. A previously accepted event ID with changed bytes or normalized identity returns conflict and never overwrites evidence. Byte-different but semantically similar redelivery is conservatively treated as a conflict. A legacy rejected row cannot be acknowledged as a verified duplicate.

Migration `0004_verified_webhook_intake.sql` extends the existing inbox with invoice ID, event creation timestamp, provider status and verification method. An immutability trigger protects receipt evidence while allowing later processing metadata and invoice binding association to advance. No new domain table is introduced. The manifest becomes schema version 4 with 26 tables.

Known canonical invoice bindings are correlated by provider/environment/invoice ID. Events that arrive before a binding can remain pending with that provider invoice ID; they do not become payment authority. The D1-shaped adapter uses an atomic unique insert followed by a consistency check, with tests across concurrent callers and file close/reopen.

## Not payment confirmation

An authenticated `INVOICING.INVOICE.PAID` event can concern partial, pending or externally recorded payments. This intake never writes `payment_evidence`, permissions or receipts and never changes an invoice state. Its only business write is a verified, pending inbox receipt. Unknown provider status is retained as null, not coerced to PAID. Turn 025 owns processing and ordering; later reconciliation and lifecycle turns own authoritative outcomes.

The route creates a verifier instance per request, avoiding stale credential caches after environment rotation. Its in-instance token cache and refresh are tested, but there is no cross-request token-cache optimization. Deployment rate limiting and actual production-like latency need later verification. All network and stream operations are bounded; no deployed response-time guarantee is claimed.

## Local verification

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/paypal-ts-test-loader.mjs --test scripts/paypal-webhook-local.test.mjs
```

**92 new tests pass.** Together with the 22 adapter and 27 OAuth/draft regressions, **141 tests pass, zero fail**. The prior Turn 023 invoice-delivery suite was not rerun in this isolated workspace; its historical 53-test evidence remains in its own receipt. Do not add historical test counts to this turn's executed total.

The tests use a generated RSA keypair and a local mock of PayPal postback verification to detect changed signed bytes. This is not PayPal-issued signature evidence or an actual Sandbox transaction. SQLite tests execute the exact checked-in inbox DDL and new migration with a minimal invoice-binding fixture, not the complete repository migration/seed suite. They test durable acknowledgement, partial/manual status preservation, conflicts, concurrent inserts, immutability and restart behavior. The actual route adapter is exercised with Web Request/Response objects.

Strict standalone TypeScript 5.8.3 passes for the intake, inbox and route adapter against real built-in web types. The new Worker wrapper is syntax-checked, not executed with Hono/Vite. A renewed npm registry reachability check failed. No full pinned-toolchain, Worker, browser or live D1 acceptance claim is made.

## Official references reviewed October 27, 2026

- [PayPal REST webhook integration](https://developer.paypal.com/api/rest/webhooks/rest/): signing headers, original raw-body importance, registered webhook ID, postback verification, simulator limitations and retries over three days.
- [Webhooks Management API](https://developer.paypal.com/api/webhooks/v1): `/v1/notifications/verify-webhook-signature`.
- [Invoicing webhook events](https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/): invoice-paid includes partial/pending scenarios; refund events can be partial.

Some Invoicing tutorial examples acknowledge before verification or illustrate different body-hash logic. This implementation follows the REST verification reference and does not copy those shortcuts. It acknowledges supported events only after successful verification and storage.
