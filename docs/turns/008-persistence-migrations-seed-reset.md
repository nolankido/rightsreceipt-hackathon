# Turn 008 Receipt: Implement Persistence, Migrations, Seeds, and Reset

- **Status:** Completed with live D1 handoff pending
- **Date:** October 25, 2026 HST
- **Priority:** P0
- **Objective:** Create the initial relational schema, ordered migration system, repository interfaces, test database, deterministic Harbor After Rain judge seed, and repeatable reset command.
- **Exit criteria:** Database setup and reset are repeatable and covered by integration tests.

## Scope completed

- Created two ordered, hash-tracked SQL migrations.
- Created all 25 tables named in the frozen persistence blueprint.
- Added foreign keys for domain references and uniqueness constraints for terms, quotes, policy versions, payment operations, provider events, invoice bindings, public verification identifiers, receipt revisions, and audit order.
- Added supported-value and integer-range checks for money, duration, impressions, permission states, invoice states, environments, asset types, and other frozen enumerations.
- Added JSON validity checks for structured fields and canonical payload records.
- Added query indexes and partial unique indexes for current quotes, active policies, active buyer capabilities, and audit idempotency.
- Added update guards for append-only evidence and immutable version records.
- Created a deterministic judge reset for Maya Chen, Harbor After Rain, the versioned demo pricing policy, and the Cedar & Tide Travel buyer fixture.
- Preserved zero stale licensing, payment, permission, receipt, webhook, and audit records after reset.
- Added a dependency-free Node SQLite migration, seed, reset, snapshot, drift-detection, and verification runner.
- Added six Node integration tests covering migration idempotency, deterministic reset, stale-record removal, foreign keys, check constraints, request immutability, migration drift, and immutable version-content guards.
- Added D1-shaped repository interfaces and a persistence manifest in the TypeScript package.
- Added future Vitest coverage for the manifest and implementation-status contract.
- Added root database commands and included persistence verification in the static and full quality gates.
- Expanded the format checker to cover SQL migrations and seed files.
- Added persistence engineering documentation and migration rules.

## Files added

- `migrations/0001_initial_schema.sql`
- `migrations/0002_indexes_and_guards.sql`
- `migrations/README.md`
- `seed/demo-reset.sql`
- `scripts/db-local.mjs`
- `scripts/db-local.test.mjs`
- `packages/persistence/src/manifest.ts`
- `packages/persistence/src/ports.ts`
- `packages/persistence/src/index.test.ts`
- `docs/engineering/PERSISTENCE.md`
- `docs/turns/008-persistence-migrations-seed-reset.md`

## Files updated

- `packages/persistence/src/index.ts`
- `package.json`
- `scripts/check-format.mjs`
- `docs/engineering/README.md`
- `README.md`
- `PROJECT_STATUS.md`
- `.gitignore`

## Requirements advanced

### `RR-P0-002`

Persistence setup, migrations, and reset are deterministic under the checked-in local SQLite harness. Two consecutive resets produce the same identifiers and snapshot hash.

### `RR-P0-003`

The seed creates the expected creator, asset, versioned pricing policy, buyer fixture, and quote expectation while leaving every transactional table empty.

### Supporting requirements and invariants

This turn also materially advances:

- `RR-P0-008`, stable asset identity and fingerprint persistence;
- `RR-P0-031`, audit ordering and append-only structure;
- `RR-P0-044`, invoice-binding uniqueness and operation idempotency foundations;
- `RR-P0-048` through `RR-P0-051`, provider-event storage, deduplication, and reconciliation foundations;
- `RR-P0-053` through `RR-P0-059`, canonical receipt and verification storage foundations;
- `RR-P0-063`, deterministic persistence integration coverage.

Relevant domain invariants include `RR-DOM-001` through `RR-DOM-050`, with direct persistence enforcement for identity, version uniqueness, original evidence, money ranges, consent references, invoice uniqueness, provider-event deduplication, receipt revision order, and audit sequence order.

## Verification commands

```text
node --no-warnings scripts/db-local.mjs verify --database /mnt/data/rr-turn008/.data/verify.sqlite
node --no-warnings --test scripts/db-local.test.mjs

tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes \
  --module ESNext --moduleResolution Bundler --target ES2023 \
  packages/persistence/src/manifest.ts \
  packages/persistence/src/ports.ts \
  packages/persistence/src/index.ts

node --check scripts/db-local.mjs
node --check scripts/db-local.test.mjs
```

## Verification results

- Migration 0001 and 0002 applied successfully.
- A second migration pass skipped both files after matching their hashes.
- `PRAGMA integrity_check` returned `ok`.
- `PRAGMA foreign_key_check` returned no rows.
- All 25 expected domain tables exist.
- The deterministic seed snapshot hash is `5f7722e60a99164f6a0447f06184226e923fb691d7ade1b523c9430b0bee3df6`.
- The first and second reset produced the same snapshot hash.
- The seed contains Maya Chen, Harbor After Rain, Cedar & Tide Travel, and the 42,500-cent expected quote metadata.
- Every transactional table contains zero rows after reset.
- Six integration tests passed with zero failures.
- TypeScript strict checking passed for the persistence manifest, ports, and public exports.
- JavaScript syntax and local formatting checks passed.
- No em dash, credential, token, personal account data, production payment endpoint, or GitHub Actions workflow was introduced.

## Live D1 limitation

The current execution environment still cannot install the Turn 007 dependency graph. This turn therefore verifies the schema through Node's SQLite implementation rather than Wrangler and remote D1. The SQL uses D1-compatible SQLite features and the repository records this distinction explicitly.

The blocked Turn 007 clean-install gate remains open. Live D1 binding, Drizzle mapping execution, and remote migration evidence remain pending, and are not represented as complete.

## External blocker

None for the dependency-free persistence implementation. Live D1 verification will require the later configured Cloudflare environment, but no user action is requested by this turn.

## Recommended next work

Continue the first available independent P0 work while preserving the Turn 007 blocker. Turn 009 can build the creator workspace and asset registration against the new persistence contracts and seeded identifiers. The full package, build, and deployment gate must still pass before release claims are made.
