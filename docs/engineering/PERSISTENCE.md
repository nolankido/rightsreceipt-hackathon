# Persistence, Migrations, Seed, and Reset

**Current follow-up:** Turn 037 adds migration 9 and two clarification evidence tables, bringing the current schema to 33 domain tables. The deterministic reset clears those tables in dependency order. The historical baseline and snapshot below describe Turn 008. Use [the current project ledger](../../PROJECT_STATUS.md) and [clarification engineering](CLARIFICATION_WORKFLOW.md) for the latest executable schema and evidence.

**Status:** Implemented and verified against local SQLite semantics
**Owning turn:** Turn 008
**Schema version:** 2
**Seed version:** `harbor-after-rain-v1`
**Live D1 verification:** Pending the blocked Turn 007 dependency gate and a configured D1 binding

## Purpose

This record describes the first executable persistence baseline for RightsReceipt. The implementation provides checked-in SQL migrations, database constraints, immutable-record guards, a deterministic Harbor After Rain judge seed, a repeatable reset command, repository interfaces, and dependency-free integration tests.

The local verifier uses Node.js `node:sqlite`. The schema intentionally stays within SQLite and Cloudflare D1-compatible features. It does not claim that a remote D1 database has been provisioned or tested.

## Canonical files

- `migrations/0001_initial_schema.sql`
- `migrations/0002_indexes_and_guards.sql`
- `seed/demo-reset.sql`
- `scripts/db-local.mjs`
- `scripts/db-local.test.mjs`
- `packages/persistence/src/manifest.ts`
- `packages/persistence/src/ports.ts`
- `packages/persistence/src/index.ts`
- `packages/persistence/src/index.test.ts`

## Commands

Create or update the local database schema:

```bash
node --no-warnings scripts/db-local.mjs setup
```

Apply the deterministic judge reset:

```bash
node --no-warnings scripts/db-local.mjs reset
```

Run the complete dependency-free persistence gate:

```bash
node --no-warnings scripts/db-local.mjs verify
node --no-warnings --test scripts/db-local.test.mjs
```

When pnpm is installed, the equivalent root command is:

```bash
pnpm db:verify
```

The default local file is `.data/rightsreceipt-local.sqlite`. A different path can be supplied with `--database`.

## Migration behavior

The local migration runner:

1. discovers files matching `NNNN_name.sql`;
2. sorts them lexically;
3. hashes each file with SHA-256;
4. records the hash in `rr_schema_migrations`;
5. skips an already applied migration only when the stored hash matches;
6. fails before execution when an applied migration has changed;
7. applies each new migration inside `BEGIN IMMEDIATE` and rolls back on failure.

Applied migrations are immutable. A schema change requires a new numbered migration rather than editing a migration that has already been applied.

## Schema coverage

The schema contains 25 domain tables:

- creator workspace and assets;
- licensing cases and immutable buyer submissions;
- buyer capabilities;
- extraction attempts and field observations;
- clarification rounds, questions, and answers;
- immutable terms and pricing-policy versions;
- quotes and quote lines;
- creator decisions and buyer acceptances;
- payment operations, invoice bindings, webhook inbox events, and payment evidence;
- permissions and public verification records;
- immutable receipt revisions and audit events;
- deterministic reset metadata.

The schema includes foreign keys, enumeration checks, integer-range checks, JSON validation, version uniqueness, idempotency uniqueness, provider-event deduplication, current-record partial indexes, and query indexes for the expected workflow.

## Immutable-record guards

Update triggers reject changes to records that serve as historical evidence:

- request submissions;
- completed extraction attempts;
- field observations;
- terms versions;
- pricing-policy version content;
- quote content and quote lines;
- creator decisions;
- buyer acceptances;
- payment evidence;
- receipt revisions;
- audit events.

Policy and quote content remains immutable while their current or superseded status metadata can advance. The deterministic judge reset may delete rows before reseeding. Application behavior must still treat historical records as append-only outside that explicit reset path.

## Deterministic judge seed

The seed creates exactly:

- workspace `00000000-0000-4000-8000-000000000001` for Maya Chen;
- pricing policy `00000000-0000-4000-8000-000000000002`, version 1;
- asset `00000000-0000-4000-8000-000000000003`, Harbor After Rain;
- one fixture manifest containing the Cedar & Tide Travel buyer scenario;
- zero licensing, payment, permission, receipt, webhook, or audit transaction records.

The manifest records the expected deterministic quote of 42,500 cents. It is metadata for later turns and is not a quote implementation.

The seeded state has the stable snapshot hash:

```text
5f7722e60a99164f6a0447f06184226e923fb691d7ade1b523c9430b0bee3df6
```

Two consecutive resets must produce that same snapshot hash.

## Repository interfaces

The persistence package now exports:

- a D1-shaped database and prepared-statement port;
- workspace, asset, pricing-policy, and licensing-case repository interfaces;
- a persistence unit-of-work interface;
- row contracts for the first implementation turns;
- the table manifest, migration manifest, schema version, fixed seed identifiers, and expected quote amount.

The package does not claim that the Drizzle mapper or live D1 adapter is complete. SQL migrations are the current executable schema authority. A later implementation may add Drizzle mappings behind these ports without changing the domain contract.

## Verification evidence

The local gate verified:

- two migrations apply in order and become no-ops on a second run;
- migration drift is detected;
- 25 expected domain tables exist;
- `PRAGMA integrity_check` returns `ok`;
- `PRAGMA foreign_key_check` returns no violations;
- the seed contains the expected creator, asset, pricing policy, buyer fixture, and quote expectation;
- all transactional tables are empty after reset;
- two resets produce the same snapshot hash;
- an inserted stale licensing case is removed by reset;
- invalid foreign keys and unsupported asset types fail closed;
- original buyer request evidence cannot be updated;
- immutable version content is protected while current or superseded metadata can advance.

Six Node integration tests pass using only Node.js built-ins.

## D1 handoff

Remote D1 execution remains intentionally separate from this turn. The later D1 handoff must:

1. add the configured D1 binding to the deployment environment;
2. apply the checked-in migrations with Wrangler;
3. apply the deterministic seed to the judge database;
4. run the same count, integrity, foreign-key, and seed assertions through the D1 adapter;
5. preserve the migration file hashes and seed identifiers;
6. record the exact remote database and release evidence without committing credentials or account identifiers.

## Limitations

- No remote D1 database was created or mutated.
- No Drizzle ORM mapping was executed because the Turn 007 package installation remains blocked.
- The schema is comprehensive, but feature repositories beyond the first interface set are implemented in their owner turns.
- The reset is a judge and local-development operation, not a production data-retention policy.
- Seed names, organizations, email addresses, and identifiers are synthetic.
