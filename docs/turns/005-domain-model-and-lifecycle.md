# Turn 005 Receipt: Specify Domain Model, State Machine, and Invariants

- **Status:** Completed
- **Date:** October 25, 2026 HST
- **Priority:** P0
- **Objective:** Define the database-independent entities, identifiers, immutable versions, lifecycle states, transition guards, audit events, refund and expiration behavior, and receipt revision triggers that will drive persistence and tests.
- **Exit criteria:** Domain types, lifecycle diagrams, valid and forbidden transition rules, and numbered invariants are specific enough to drive the TypeScript domain package, D1 schema, migrations, repositories, and automated tests.

## Scope completed

- Defined 21 core entities spanning creator workspace, assets, licensing cases, buyer capabilities, extraction, terms, pricing, consent, payment evidence, permission, verification, receipts, and audit history.
- Selected canonical lowercase UUID version 4 identifiers for internal entities.
- Defined separate opaque public verification identifiers and hashed high-entropy buyer capability tokens.
- Defined UTC instant and date-only licensing semantics using a half-open interval.
- Defined integer-cent USD money semantics.
- Defined the exact canonical P0 rights-term shape and deterministic ordering rules.
- Defined field observation provenance, UTF-16 evidence spans, resolver versions, and integer confidence basis points.
- Defined immutable terms, policy, quote, approval, acceptance, payment evidence, and receipt revisions.
- Defined expected-version conflict handling and command idempotency behavior.
- Defined a derived user-facing case stage rather than a directly writable broad status field.
- Defined separate state machines for terms resolution, consent, invoice state, permission effectiveness, public verification, and receipt revisions.
- Defined legal transition preconditions, atomic results, and rejection examples for the complete request-to-receipt path.
- Defined payment scheduling, activation, expiration, full refund, and creator revocation semantics.
- Defined a durable audit-event taxonomy.
- Defined the exact logical canonical receipt payload and six receipt revision triggers.
- Defined 50 consecutively numbered `RR-DOM-*` invariants.
- Defined a forbidden-transition catalog and relational persistence blueprint.
- Defined pure, property, and integration test blueprints for later implementation turns.
- Accepted ADR 0008 to separate payment, permission, verification, and receipt lifecycles.
- Updated the root overview, architecture index, decision index, and live project ledger.

## Key domain decisions

### Payment and permission are separate

A paid invoice is necessary for permission issuance but the licensing dates determine whether the issued permission is `scheduled`, `active`, or `expired`.

### Verification and rights receipts are separate

A public verification record may exist before payment. An unpaid canceled case can therefore be verified as canceled without receiving a rights receipt revision.

### Refund and revocation are separate

A full PayPal refund changes permission to `refunded`. A creator action changes permission to `revoked`. Neither event implies the other.

### Immutable version binding

Quotes, creator approvals, buyer acceptances, and invoices bind to exact terms and policy versions. A material edit before invoice binding creates a new version and invalidates stale consent. Material editing after invoice binding is outside the P0 case lifecycle.

### Current stage is derived

The UI stage is derived from authoritative current records. Route handlers, browser claims, model output, and unverified webhooks cannot assign lifecycle state directly.

## Files changed

- `README.md`
- `PROJECT_STATUS.md`
- `docs/architecture/README.md`
- `docs/architecture/DOMAIN_MODEL.md`
- `docs/decisions/README.md`
- `docs/decisions/0008-separate-payment-permission-verification-lifecycles.md`
- `docs/turns/005-domain-model-and-lifecycle.md`

## Commit sequence

The GitHub contents connector writes one file per commit, so this turn is a bounded linear commit sequence rather than one multi-file commit:

- `7e25facdc2309131329b3d736c7062ef6809a732`: canonical domain model
- `fc6149dd3a0a2c4a209615718015d1d4304bc39d`: lifecycle ADR
- `f5c1d45fdaed5177d9a349b3ca43ffed2304c234`: architecture index
- `3985a5aff50ad9974f9bbda1cffd6d3644236d3b`: ADR index
- `8edd569a3ae3e27bef29d95827a5c739e1e70eab`: root overview
- `47d4731346c71da963e7951a7a7f62e0e275989d`: live project ledger

This receipt is the final documentation commit for the turn. The current `main` SHA after receipt creation is recorded in the final turn report and repository history.

## Requirements materially advanced

No P0 requirement passes solely because the design exists.

The domain contract materially advances:

- `RR-P0-008` through `RR-P0-031`;
- `RR-P0-039` through `RR-P0-059`;
- `RR-P0-062` through `RR-P0-065`.

Future implementation receipts should cite both the P0 row and the relevant domain invariant.

## Verification

### Repository checks

```text
Branch check: confirm main began at Turn 004 commit f7b048f53653b7a4b11112c6d43e6ebae3cd2707
Compare check: confirm the pre-receipt Turn 005 head is six commits ahead and zero commits behind
Changed-file check: confirm exactly the intended domain, ADR, index, README, and status paths changed before receipt creation
Link check: confirm every new relative link targets a tracked path
ADR check: confirm accepted records are numbered 0001 through 0008 without duplication
```

### Domain coverage checks

```text
Entity review: map every Turn 005 entity named in the development plan to a defined record
State review: trace terms, consent, invoice, permission, verification, and receipt lifecycles
Transition review: inspect preconditions, atomic results, and forbidden transitions
Version review: inspect stale commands, material edits, consent invalidation, and invoice locking
Temporal review: inspect scheduled, active, expired, refunded, and revoked outcomes with UTC dates
Evidence review: inspect webhook trust, reconciliation, simulated labeling, and event deduplication
Receipt review: inspect canonical fields, revision triggers, prior-hash chaining, and invalid integrity behavior
Persistence review: map entities and uniqueness constraints to the Turn 008 blueprint
Testability review: confirm each invariant can be exercised by pure, property, or integration tests
```

### Results

- The primary domain record contains 21 named entities.
- The document defines canonical internal, public, and capability identifier rules.
- Material rights terms and all consequential agreements are immutable and version-bound.
- The terms resolution, consent, invoice, permission, verification, and receipt models have explicit legal behavior.
- `RR-DOM-001` through `RR-DOM-050` are present consecutively.
- Paid future-dated rights are scheduled rather than falsely active.
- Paid evidence first observed after the licensing interval yields expired rather than briefly active.
- Canceled unpaid cases have no rights receipt revision.
- Refund and creator revocation remain distinct.
- Unverified webhook data, browser input, AI output, invoice creation, and invoice sending cannot issue permission.
- Partial or inconsistent payment evidence fails closed into reconciliation rather than a clean active claim.
- Receipt revisions are immutable, sequential, canonically hashed, and linked to the prior revision.
- A material hash mismatch marks verification invalid and does not rewrite history.
- Every consequential state mutation requires an atomic audit event.
- The persistence blueprint includes unique constraints for versioning, operations, provider events, public identifiers, receipt revisions, and audit order.
- The architecture and product scope were not expanded into accounts, escrow, autonomous negotiation, multiple invoices per case, or production payments.
- No credential, secret, capability token, private personal data, executable code, database configuration, or production endpoint was added.
- No em dash character was introduced in the authored records.
- Automated application tests were not applicable because the repository remains documentation-only.

## Manual evidence

- [`../architecture/DOMAIN_MODEL.md`](../architecture/DOMAIN_MODEL.md) is the canonical domain contract.
- [`../decisions/0008-separate-payment-permission-verification-lifecycles.md`](../decisions/0008-separate-payment-permission-verification-lifecycles.md) records the durable lifecycle decision and rejected alternatives.
- [`../architecture/README.md`](../architecture/README.md) indexes the system and domain records.
- [`../decisions/README.md`](../decisions/README.md) indexes eight accepted decisions.
- `PROJECT_STATUS.md` identifies Turn 006 as the next eligible unit and states that no P0 row passes yet.

## Risks or limitations

- Exact TypeScript types, packages, and error codes are deferred to Turn 007.
- Exact D1 columns, indexes, SQL constraints, and repository mappings are deferred to Turn 008.
- Partial refunds are outside automatic P0 behavior and fail closed to reconciliation.
- P0 permits only one invoice binding per licensing case. Material changes after invoice creation require a new case.
- The shared demo creator session remains suitable for judging, not a production identity system.
- The frozen narrative fixture has a future start date. The final video must show `scheduled` truthfully or use a recording fixture with an effective date on or before recording.
- The receipt hash is tamper-evident, not a digital signature or ownership proof.

## External blocker

None.

No account, credential, paid service, or user attestation was needed for this turn.

## Recommended next turn

Turn 006: Design the core user journeys and visual system. Convert the accepted product, architecture, and domain contracts into route-level flows, screen states, role-aware actions, low-fidelity wireframes, responsive tokens, accessibility rules, error and recovery behavior, and a coherent three-minute demo path before executable scaffolding begins.
