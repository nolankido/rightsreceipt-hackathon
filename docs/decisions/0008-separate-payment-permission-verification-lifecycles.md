# ADR 0008: Separate Payment, Permission, Verification, and Receipt Lifecycles

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** RightsReceipt project
- **Related turns:** Turn 005
- **Supersedes:** None
- **Superseded by:** None

## Context

The product connects an accepted rights package, a PayPal invoice, payment evidence, permission effectiveness, and a public record. These concepts are related but not identical.

A single broad status field would create several correctness problems:

- A paid invoice with a future start date would be shown as active too early.
- A canceled unpaid invoice could be mistaken for a rights receipt.
- A full refund could be confused with creator revocation.
- An out-of-order webhook could regress a later state.
- A payment operation timeout could be mistaken for a provider failure.
- A public verification route could expose internal case or payment details.
- Stale creator approval or buyer acceptance could remain eligible after a material edit.

The frozen MVP also requires payment-linked activation, explicit time boundaries, canceled and refunded outcomes, receipt hashing, public verification, event deduplication, and recovery from missed webhooks.

## Decision

RightsReceipt will model the workflow with separate, coordinated domain lifecycles instead of one writable status field.

### 1. Licensing case

`LicensingCase` coordinates one asset-specific request and stores pointers to the current immutable terms, quote, creator decision, buyer acceptance, invoice binding, permission, and verification record.

The user-facing case stage is derived from authoritative related records. It is not directly set by route handlers or AI output.

### 2. Terms and consent

Material rights terms are immutable versions. Quotes, creator approvals, and buyer acceptances bind to exact version identifiers.

A material edit before invoice binding creates a new terms version, supersedes the quote, and invalidates effective consent. Material editing after invoice binding is outside the P0 case lifecycle and requires a new licensing case.

### 3. Invoice lifecycle

The invoice projection uses explicit local states for operation progress and normalized provider outcomes:

- `none`
- `create_pending`
- `draft`
- `send_pending`
- `sent`
- `paid`
- `canceled`
- `fully_refunded`
- `reconciliation_required`

Verified PayPal webhook evidence or reconciliation is authoritative in Sandbox mode. Simulated fixtures are authoritative only in visibly simulated mode.

### 4. Permission lifecycle

The permission lifecycle is separate:

- `not_issued`
- `scheduled`
- `active`
- `expired`
- `refunded`
- `revoked`

Verified paid evidence issues a permission. Date boundaries determine whether the issued permission begins as scheduled, active, or expired. Refund and revocation remain distinct facts.

### 5. Verification record

A privacy-minimized `VerificationRecord` receives one opaque public identifier. It may exist before payment and may show a safe status such as `pending_payment` or `canceled` without claiming that a rights receipt exists.

### 6. Receipt revision chain

A `ReceiptRevision` is created only after permission issuance or a material permission-state change. Revisions are immutable, sequential, canonically serialized, SHA-256 hashed, and linked to the prior revision hash.

A canceled unpaid invoice therefore has a public verification record but no rights receipt revision.

### 7. Temporal semantics

Licensing intervals use date-only UTC semantics and a half-open interval:

```text
[start_date, end_date_exclusive)
```

A paid future-dated permission is scheduled until the UTC start date. A paid request first confirmed on or after the end date is expired immediately and is never briefly represented as active.

### 8. Concurrency and evidence

Consequential commands require expected aggregate versions and exact target version identifiers. External operations and repeatable commands use idempotency keys. Webhook events use unique provider event identities. Illegal or stale transitions produce no business-state change.

## Consequences

### Positive

- Payment, legal-use timing, creator revocation, and public verification remain semantically distinct.
- Future-dated rights are not represented as currently usable.
- Canceled unpaid deals do not receive misleading rights receipts.
- Refunds and creator revocations remain auditable as different events.
- Webhook retry and ordering behavior can be tested against explicit transition tables.
- Public verification can remain privacy-minimized without exposing internal aggregates.
- Receipt hashes cover only canonical rights records, not transient operation state.
- Derived case status gives the UI a simple stage without making it the source of truth.

### Negative and tradeoffs

- More entities and transition tests are required than with one status column.
- Queries need joins or a maintained derived projection.
- Operators must understand the difference between invoice state, permission state, and verification status.
- Temporal refresh commands are needed for scheduled and expired transitions.
- A partially refunded or inconsistent provider state requires a fail-closed review path rather than a simplistic mapping.
- Material editing after invoice binding is deliberately constrained in P0.

## Alternatives considered

### One broad workflow enum

Rejected because it would mix consent, provider operations, permission effectiveness, and public status. It would also encourage illegal regressions and misleading status copy.

### Create a rights receipt at buyer acceptance

Rejected because payment has not been confirmed and no permission has been issued. A pre-payment verification record provides continuity without overstating authority.

### Treat paid as immediately active regardless of start date

Rejected because it misrepresents future-dated rights and conflicts with the canonical licensing interval.

### Use only PayPal invoice state as the permission state

Rejected because PayPal does not encode the rights start date, expiration, creator revocation, supported-scope terms, or receipt-integrity state.

### Event sourcing as the only persistence model

Rejected for P0. Append-only audit evidence is required, but explicit current projections make the hackathon implementation and judge path simpler.

### Permit material edits after invoice creation

Rejected for P0 because it would require canceling or replacing external invoices, re-acceptance, more complex idempotency, and potentially several invoice bindings per case. A new licensing case is clearer and safer.

## Validation

This decision is working when:

- pure domain tests cover every legal and forbidden transition;
- paid-before-start produces scheduled and not active;
- paid-within-window produces active;
- paid-after-end produces expired;
- canceled unpaid cases have no receipt revision;
- full refund produces a new refunded receipt revision;
- creator revocation does not imply refund;
- duplicate and out-of-order events do not duplicate or regress side effects;
- a stale human command returns a conflict with no mutation;
- public verification never exposes private or privileged fields;
- current projections agree with deterministic derivation.

## Revisit triggers

Reconsider this decision only if:

- official contest requirements demand a different receipt lifecycle;
- PayPal Sandbox behavior cannot be normalized into the accepted invoice states;
- the one-invoice-per-case restriction prevents the required judge path;
- the status model creates an unresolvable usability problem in Turn 006;
- D1 constraints cannot enforce the required uniqueness and atomicity;
- a future production release requires partial refunds, renewals, amendments, or multiple invoice attempts inside one case.

Any replacement must preserve truthful status, version-bound consent, payment evidence, and immutable receipt history.

## References

- [`../architecture/DOMAIN_MODEL.md`](../architecture/DOMAIN_MODEL.md)
- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md)
- [`../product/MVP_SCOPE.md`](../product/MVP_SCOPE.md)
- [`../product/ACCEPTANCE_MATRIX.md`](../product/ACCEPTANCE_MATRIX.md)
