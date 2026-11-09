# Turn 004 Receipt: Lock Architecture and Write Decision Records

- **Status:** Completed
- **Date:** October 25, 2026 HST
- **Priority:** P0
- **Objective:** Select the complete technical architecture for the frozen RightsReceipt MVP and record the durable tradeoffs before executable scaffolding begins.
- **Exit criteria:** Architecture diagrams and accepted ADRs remove material ambiguity around repository structure, runtime, deployment, persistence, local AI, PayPal, receipts, access, and verification.

## Scope completed

- Created one canonical system architecture covering architecture drivers, selected stack, context, deployment topology, route ownership, modes, package boundaries, dependency direction, command handling, API validation, persistence, data authority, sequences, PayPal recovery, local AI, pricing, receipts, access control, observability, testing, and failure recovery.
- Selected a pnpm workspace monorepo with strict TypeScript boundaries and no task-runner framework in P0.
- Selected a React SPA and Hono API combined into one Cloudflare Worker deployment and one origin through static assets and Worker routes.
- Selected Cloudflare D1 with checked-in SQL migrations, Drizzle inside the persistence adapter, repository ports, foreign keys, unique constraints, and atomic D1 batches.
- Selected offline Python training and evaluation with a schema-versioned JSON artifact and pure TypeScript inference in the Worker.
- Selected fake and PayPal Sandbox payment adapters behind one application port.
- Defined a durable verified-webhook inbox, idempotent event processing, operation records, deferred processing, and reconciliation.
- Selected RFC 8785 canonical JSON and SHA-256 for immutable receipt revisions.
- Defined the creator demo session, buyer capability, and public verifier access boundaries without adding public accounts.
- Defined local, Sandbox, and judge modes and their truth-labeling rules.
- Defined the test architecture for pure packages, Worker and D1 integration, browser flows, and model reproducibility.
- Recorded seven accepted architecture decision records with alternatives, consequences, validation, and revisit triggers.
- Updated the root overview, architecture index, decision index, and live project ledger.

## Accepted decisions

1. `ADR 0001`: Use a pnpm TypeScript monorepo.
2. `ADR 0002`: Deploy React and Hono as one Cloudflare Worker unit.
3. `ADR 0003`: Use D1 and Drizzle behind repository ports.
4. `ADR 0004`: Train offline and run a portable local model in TypeScript.
5. `ADR 0005`: Isolate PayPal behind a port and durable webhook inbox.
6. `ADR 0006`: Use versioned RFC 8785 receipt revisions with SHA-256.
7. `ADR 0007`: Use a demo creator session and scoped opaque capabilities.

## Files changed

- `README.md`
- `PROJECT_STATUS.md`
- `docs/architecture/README.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-pnpm-typescript-monorepo.md`
- `docs/decisions/0002-single-cloudflare-worker-react-hono.md`
- `docs/decisions/0003-d1-drizzle-persistence.md`
- `docs/decisions/0004-portable-local-model-runtime.md`
- `docs/decisions/0005-paypal-port-webhook-inbox.md`
- `docs/decisions/0006-versioned-canonical-receipts.md`
- `docs/decisions/0007-demo-access-and-capabilities.md`
- `docs/turns/004-system-architecture-and-decisions.md`

## Requirements materially advanced

The architecture establishes an implementation path but does not pass any P0 row.

Materially advanced ranges:

- `RR-P0-001` through `RR-P0-005`;
- `RR-P0-009` through `RR-P0-031`;
- `RR-P0-032` through `RR-P0-039`;
- `RR-P0-040` through `RR-P0-052`;
- `RR-P0-053` through `RR-P0-059`;
- `RR-P0-060` through `RR-P0-069`.

Asset requirements `RR-P0-006` through `RR-P0-008` are supported by the selected persistence and package boundaries but remain primarily owned by later domain and asset implementation turns.

## Verification

### Sources reviewed

- pnpm workspace documentation
- Hono and Hono on Cloudflare Workers documentation
- Cloudflare Vite plugin and static-assets documentation
- Cloudflare D1 local development, migrations, Worker API, and batch behavior documentation
- Drizzle Cloudflare D1 documentation
- Cloudflare Workers Vitest integration documentation
- PayPal Invoicing API, webhook, troubleshooting, and security documentation
- RFC 8785 JSON Canonicalization Scheme
- Cloudflare Web Crypto documentation
- scikit-learn model persistence documentation

### Checks performed

```text
Coverage review: map every Turn 004 work item to SYSTEM_ARCHITECTURE.md and one or more accepted ADRs
Product-boundary review: compare architecture with MVP_SCOPE.md and ACCEPTANCE_MATRIX.md
Dependency review: inspect the intended package graph for cycles and platform leakage
Trust-boundary review: trace browser, Worker, D1, PayPal, model artifact, receipt, and capability authority
Failure review: trace partial PayPal calls, duplicate and out-of-order webhooks, model failure, D1 failure, and deployment failure
Decision review: verify each ADR contains context, concrete decision, consequences, alternatives, validation, and revisit triggers
Reference review: confirm selected platform behavior against current official documentation
Link review: verify every new relative link points to a path included in this turn or already tracked
Claims review: confirm accepted design is not described as implemented or tested
Secret review: inspect changed content for credentials, access codes, capability tokens, personal data, and generated secrets
Typography review: confirm the new documents contain no em dash characters
```

### Results

- Every required Turn 004 architecture area has one accepted direction.
- The deployment uses one Worker and one origin while preserving separate source and package boundaries.
- Domain and application layers remain independent of React, D1, Drizzle, PayPal transport objects, and Python tooling.
- PayPal state is authoritative only after verified webhook or reconciliation evidence.
- Fake payment remains an explicitly labeled test and fallback adapter.
- External PayPal calls use operation records and reconciliation rather than false distributed-transaction claims.
- Receipt hashes use a documented canonicalization and digest scheme and make no signature, ownership, or blockchain claim.
- The access model separates creator, buyer, and public capabilities without expanding the MVP into an account platform.
- The architecture does not add a product capability outside the frozen scope.
- No credential, access token, secret, private personal data, executable code, or external configuration was added.
- Automated application tests were not applicable because the repository remains documentation-only.

## Manual evidence

- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md) contains the accepted integrated design and Mermaid diagrams.
- [`../architecture/README.md`](../architecture/README.md) indexes the canonical architecture and all seven ADRs.
- [`../decisions/README.md`](../decisions/README.md) records the accepted decision set and superseding rule.
- `PROJECT_STATUS.md` identifies Turn 005 as the next eligible turn and states that no P0 requirement has passed yet.
- The root README distinguishes frozen architecture from unimplemented behavior.

## Risks or limitations

- Exact dependency versions are intentionally deferred to Turn 007 and must be verified against current compatibility before pinning.
- The domain entities, state transitions, refund and expiration semantics, and exact receipt fields remain open until Turn 005.
- Drizzle, the Cloudflare Vite plugin, and the TypeScript model runtime still require executable feasibility evidence.
- The exact supported PayPal webhook verification method is deferred to Turn 024, but authenticity before business-state change is fixed.
- A shared demo creator session is suitable for judging, not for a production multi-user launch.
- Receipt hashing is tamper-evident only and is not a digital signature.

## External blocker

None.

No account, credential, paid service, or user attestation was needed for this turn.

## Commit

This receipt is included in the self-containing Turn 004 commit. The canonical SHA is recorded in the final turn report and repository history.

## Recommended next turn

Turn 005: Specify the domain model, state machine, and invariants. Define exact entities, identifiers, canonical version rules, lifecycle states, transition guards, audit events, refund and expiration behavior, and receipt revision triggers before executable scaffolding begins.
