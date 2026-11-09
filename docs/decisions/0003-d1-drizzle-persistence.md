# ADR 0003: Use D1 and Drizzle Behind Repository Ports

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** RightsReceipt project
- **Related turns:** Turn 004, implemented in Turns 007 and 008
- **Supersedes:** None
- **Superseded by:** None

## Context

RightsReceipt needs relational records, versioned terms, approvals, invoice bindings, webhook deduplication, audit events, permission projections, receipt revisions, deterministic seed data, and migration evidence. The deployed application runs on Cloudflare Workers and must also support repeatable local development.

The data model is modest, but correctness depends on unique constraints, foreign keys, atomic multi-row changes, and explicit migrations. A document store or key-value store would move those invariants into application code. A separately hosted database would add network, credentials, and deployment complexity.

## Decision

Use Cloudflare D1 as the deployed relational database and local D1 through Wrangler or the Cloudflare Vite tooling for integration development.

Use:

- SQLite-compatible schema and SQL semantics;
- checked-in, ordered SQL migrations as the canonical schema history;
- Drizzle ORM inside `packages/persistence` for schema mapping and routine typed queries;
- direct D1 prepared statements inside the persistence adapter when they are clearer or needed for D1-specific behavior;
- repository ports defined by the application layer;
- D1 batched prepared statements for atomic multi-row state changes and matching audit events;
- foreign keys, unique constraints, and `STRICT` tables where supported;
- local in-memory fakes only for pure unit tests, not as a substitute for D1 integration tests;
- one D1 database for the hackathon judge environment.

The domain model does not expose Drizzle rows or D1 types. Every persisted row is explicitly mapped and validated.

## Consequences

### Positive

- The Worker receives D1 through a native binding with no separate database credentials in application code.
- Local D1 closely matches the deployed engine.
- SQL migrations provide readable and reviewable schema history.
- Relational constraints support versioning, idempotency, and audit integrity.
- D1 batches can atomically commit state and audit changes.
- Repository ports keep domain and application tests independent of the storage implementation.
- Drizzle reduces repetitive mapping while allowing direct SQL where necessary.

### Negative and tradeoffs

- D1 is the selected deployment platform and creates some Cloudflare coupling.
- Drizzle adds a dependency and version-compatibility surface.
- SQLite and D1 concurrency characteristics must be respected.
- External PayPal calls cannot share a database transaction, so operation records and reconciliation are required.
- Integration tests need the local Worker and D1 tooling rather than a generic in-memory database alone.

## Alternatives considered

### PostgreSQL through Supabase, Neon, or another host

Rejected for P0 because it adds a second hosted system, separate credentials, network behavior, and account setup. The MVP does not need PostgreSQL-specific capabilities.

### Cloudflare KV

Rejected because the product needs relational constraints, ordered lifecycle evidence, unique idempotency records, and structured queries.

### Durable Objects as the main store

Rejected because the MVP does not need per-entity coordination strong enough to justify a separate storage and routing model. D1 plus atomic batches and optimistic version checks are sufficient.

### Raw D1 SQL without a mapping library

Viable, but not selected as the default because routine row mapping and schema type reuse would become repetitive. Direct prepared statements remain allowed inside the adapter.

### Drizzle-generated migrations as the only schema authority

Rejected. Generated output may assist development, but checked-in SQL migration files and applied migration evidence remain the canonical schema history.

## Validation

Turns 007 and 008 must demonstrate:

- typed D1 bindings;
- a local database created from migrations;
- deterministic migration and seed commands;
- repeatable reset behavior;
- repository mapping tests;
- foreign-key and uniqueness failures for invalid relationships and duplicate operations;
- an atomic state transition plus audit event;
- no D1 or Drizzle types escaping into the domain package.

## Revisit triggers

- The selected Drizzle release cannot support the required D1 behavior reliably.
- D1 cannot meet an observed atomicity, migration, or query requirement.
- The database exceeds platform limits or workload assumptions.
- A later production release requires multi-region write behavior or database features outside D1.

## References

- [Cloudflare D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)
- [Drizzle and Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)
- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md)
