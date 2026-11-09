# Architecture Documentation

This directory contains the accepted technical and domain design for RightsReceipt. Architecture records define system boundaries and tradeoffs without claiming that the application is already implemented.

## Canonical architecture

- [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md): stack, deployment, package boundaries, persistence, AI runtime, PayPal integration, receipts, access, testing, and failure recovery.
- [`DOMAIN_MODEL.md`](DOMAIN_MODEL.md): entities, identifiers, canonical terms, version rules, state machines, audit events, receipt triggers, persistence blueprint, and 50 numbered domain invariants.

## Accepted decision records

- [`../decisions/0001-pnpm-typescript-monorepo.md`](../decisions/0001-pnpm-typescript-monorepo.md): pnpm workspace monorepo and strict TypeScript boundaries.
- [`../decisions/0002-single-cloudflare-worker-react-hono.md`](../decisions/0002-single-cloudflare-worker-react-hono.md): React static assets and Hono API in one Cloudflare Worker deployment.
- [`../decisions/0003-d1-drizzle-persistence.md`](../decisions/0003-d1-drizzle-persistence.md): D1, Drizzle, SQL migrations, and repository ports.
- [`../decisions/0004-portable-local-model-runtime.md`](../decisions/0004-portable-local-model-runtime.md): offline Python training and portable TypeScript inference.
- [`../decisions/0005-paypal-port-webhook-inbox.md`](../decisions/0005-paypal-port-webhook-inbox.md): fake and Sandbox adapters, durable webhook inbox, idempotency, and reconciliation.
- [`../decisions/0006-versioned-canonical-receipts.md`](../decisions/0006-versioned-canonical-receipts.md): RFC 8785 canonical receipt revisions and SHA-256.
- [`../decisions/0007-demo-access-and-capabilities.md`](../decisions/0007-demo-access-and-capabilities.md): creator demo session, buyer capabilities, and public receipt identifiers.
- [`../decisions/0008-separate-payment-permission-verification-lifecycles.md`](../decisions/0008-separate-payment-permission-verification-lifecycles.md): separate terms, consent, invoice, permission, verification, and receipt lifecycles.

## Ownership by management turn

- Turn 004 owns the system architecture baseline and platform tradeoffs.
- Turn 005 owns the accepted domain entities, state machines, invariants, canonical receipt fields, and persistence blueprint.
- Turn 006 owns screen-level journeys and visual interaction rules.
- Turn 007 owns the executable scaffold, pinned versions, and local verification command.
- Turn 008 owns exact D1 tables, migrations, repository mappings, seed, and reset behavior.
- Later implementation turns may refine adapter internals without violating the accepted boundaries.

## Domain implementation rule

Implementation must preserve the domain dependency boundary:

- route handlers validate and translate but do not contain lifecycle rules;
- application commands coordinate repositories, clocks, identifiers, and adapters;
- domain functions decide legal transitions and derived state;
- persistence stores immutable versions and current projections;
- adapters normalize external evidence before it reaches the domain;
- every consequential mutation and audit event commits atomically.

## Change rule

A material change to runtime, deployment topology, persistence, model serving, payment authority, receipt hashing, access control, version semantics, or lifecycle transitions requires a new ADR that supersedes the relevant accepted decision.

As of Turn 005, the repository remains documentation-only. No diagram, model, invariant, or decision in this directory is evidence that the corresponding behavior has been implemented or tested.
