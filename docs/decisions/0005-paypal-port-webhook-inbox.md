# ADR 0005: Isolate PayPal Behind a Port and Durable Webhook Inbox

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** RightsReceipt project
- **Related turns:** Turn 004, implemented in Turns 021 through 027
- **Supersedes:** None
- **Superseded by:** None

## Context

PayPal is central to RightsReceipt, but external payment calls cannot be mixed directly into browser code or domain rules. The project needs deterministic offline tests, real Sandbox evidence, verified webhooks, duplicate protection, tolerance for out-of-order events, and recovery from missed or delayed delivery.

A PayPal API call and a D1 transaction cannot form one distributed transaction. Webhook processing may also outlive the initial request. The design therefore needs explicit operation records, accepted-event storage, idempotent command handling, and reconciliation.

## Decision

Define a `PaymentGateway` application port and implement two adapters:

- a clearly labeled deterministic fake adapter for local development and automated tests;
- a real PayPal Sandbox REST adapter for OAuth, invoice creation, sending, status retrieval, and webhook verification.

The Sandbox adapter must:

- reject production endpoints and production-mode configuration;
- keep client secrets and OAuth tokens server-side;
- cache OAuth tokens only in memory for a safe lifetime;
- use stable local operation keys and unique constraints for invoice creation and sending;
- map PayPal responses into validated internal types;
- store PayPal identifiers and safe status evidence;
- translate external failures into typed retryable or terminal application failures.

Webhook intake uses a durable inbox pattern:

1. validate method, content type, headers, and size;
2. preserve the original request bytes required for verification;
3. verify authenticity before accepting the event;
4. atomically store a redacted event record with a stable event or transmission identity;
5. acknowledge the accepted delivery;
6. process the event through an idempotent domain command, using Worker deferred execution when appropriate;
7. leave failed processing visible for retry or reconciliation.

Reconciliation retrieves current invoice status from PayPal and applies it through the same lifecycle command path. Cloudflare Queues are not part of P0.

## Consequences

### Positive

- Domain and pricing code remain independent of PayPal payloads and credentials.
- Offline tests can exercise the full application path without misrepresenting simulated payment.
- Sandbox evidence uses the same port and command path as fake tests.
- Duplicate and out-of-order delivery have explicit storage and handling.
- Partial external failures can recover through operation records and reconciliation.
- Direct REST mapping makes the exact PayPal integration visible to reviewers.

### Negative and tradeoffs

- The project must maintain adapter contract tests for fake and Sandbox implementations.
- An accepted webhook can remain pending if deferred processing fails.
- Reconciliation adds states and operational UI beyond a simple callback.
- Without a queue, retry scheduling is limited and depends on explicit processing or reconciliation.
- Local verification of PayPal signatures may require certificate handling, while the verification API introduces a network call before acceptance. Turn 024 must select and test one supported method.

## Alternatives considered

### Call PayPal directly from the browser

Rejected because client secrets, trusted invoice construction, webhook state, and payment authority belong on the server.

### Use only a fake payment provider

Rejected because the hackathon requires a meaningful PayPal integration and the product promise depends on real payment-derived state.

### Use PayPal SDK objects throughout the domain

Rejected because it would couple lifecycle and tests to external transport types. Direct REST mapping at the adapter boundary is clearer.

### Process webhook business logic before durable storage

Rejected because a crash or timeout could lose accepted evidence or repeat side effects.

### Add Cloudflare Queues immediately

Rejected for P0 because the event volume is tiny and an inbox plus deferred processing and reconciliation is sufficient. A queue would add bindings, deployment state, and another failure mode.

## Validation

Turns 021 through 027 must demonstrate:

- identical adapter contract behavior where fake and Sandbox semantics overlap;
- explicit simulated and Sandbox labels;
- production endpoint rejection;
- secret-safe OAuth caching;
- one invoice for one accepted canonical version under retry;
- valid webhook acceptance and forged-event rejection;
- durable duplicate detection;
- safe out-of-order processing;
- recovery after a missed webhook or transient failure;
- paid, canceled, and fully refunded permission outcomes.

## Revisit triggers

- Deferred Worker execution loses accepted events without reliable recovery.
- PayPal verification cannot complete within the request model.
- Sandbox behavior requires a supported official SDK to avoid mapping risk.
- Observed event volume or retry behavior justifies a queue.
- Official PayPal webhook requirements materially change.

## References

- [PayPal Invoicing API](https://developer.paypal.com/api/invoicing)
- [PayPal Invoicing webhooks](https://developer.paypal.com/api/invoicing/webhooks/)
- [PayPal security guidelines](https://developer.paypal.com/security-guidelines)
- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md)
