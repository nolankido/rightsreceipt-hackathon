import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "..");
export const defaultDatabasePath = join(repositoryRoot, ".data", "rightsreceipt-local.sqlite");
export const migrationDirectory = join(repositoryRoot, "migrations");
export const seedFile = join(repositoryRoot, "seed", "demo-reset.sql");

const transactionalTables = Object.freeze([
  "licensing_cases",
  "request_submissions",
  "buyer_capabilities",
  "extraction_attempts",
  "field_observations",
  "clarification_rounds",
  "clarification_questions",
  "clarification_answers",
  "clarification_submissions",
  "clarification_reviews",
  "terms_versions",
  "quotes",
  "quote_lines",
  "creator_decisions",
  "buyer_acceptances",
  "payment_operations",
  "paypal_delivery_journal",
  "paypal_webhook_projections",
  "paypal_webhook_processing_receipts",
  "paypal_reconciliation_outbox",
  "paypal_reconciliation_receipts",
  "paypal_lifecycle_observations",
  "invoice_bindings",
  "webhook_inbox_events",
  "payment_evidence",
  "permissions",
  "verification_records",
  "receipt_revisions",
  "audit_events",
]);

const expectedDomainTables = Object.freeze([
  "assets",
  "audit_events",
  "buyer_acceptances",
  "buyer_capabilities",
  "clarification_answers",
  "clarification_questions",
  "clarification_rounds",
  "clarification_submissions",
  "clarification_reviews",
  "creator_decisions",
  "creator_workspaces",
  "demo_reset_epochs",
  "extraction_attempts",
  "field_observations",
  "invoice_bindings",
  "licensing_cases",
  "payment_evidence",
  "payment_operations",
  "paypal_delivery_journal",
  "paypal_webhook_projections",
  "paypal_webhook_processing_receipts",
  "paypal_reconciliation_outbox",
  "paypal_reconciliation_receipts",
  "paypal_lifecycle_observations",
  "permissions",
  "pricing_policy_versions",
  "quote_lines",
  "quotes",
  "receipt_revisions",
  "request_submissions",
  "terms_versions",
  "verification_records",
  "webhook_inbox_events",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function ensureParentDirectory(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
}

export function openDatabase(databasePath = defaultDatabasePath) {
  ensureParentDirectory(databasePath);
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  return database;
}

function ensureMigrationLedger(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS rr_schema_migrations (
      migration_name TEXT PRIMARY KEY,
      content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
}

export function listMigrationFiles(directory = migrationDirectory) {
  return readdirSync(directory)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
}

export function applyMigrations(database, options = {}) {
  const directory = options.migrationDirectory ?? migrationDirectory;
  ensureMigrationLedger(database);

  const selectMigration = database.prepare(
    "SELECT content_sha256 FROM rr_schema_migrations WHERE migration_name = ?",
  );
  const insertMigration = database.prepare(
    "INSERT INTO rr_schema_migrations (migration_name, content_sha256, applied_at) VALUES (?, ?, ?)",
  );

  const applied = [];
  const skipped = [];

  for (const migrationName of listMigrationFiles(directory)) {
    const sql = readFileSync(join(directory, migrationName), "utf8");
    const contentHash = sha256(sql);
    const existing = selectMigration.get(migrationName);

    if (existing) {
      if (existing.content_sha256 !== contentHash) {
        throw new Error(
          `Migration drift detected for ${migrationName}: expected ${existing.content_sha256}, found ${contentHash}`,
        );
      }
      skipped.push(migrationName);
      continue;
    }

    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec(sql);
      insertMigration.run(migrationName, contentHash, "2026-10-25T12:00:00.000Z");
      database.exec("COMMIT;");
      applied.push(migrationName);
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  }

  return { applied, skipped };
}

export function resetSeed(database, options = {}) {
  const selectedSeedFile = options.seedFile ?? seedFile;
  const sql = readFileSync(selectedSeedFile, "utf8");

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(sql);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function queryCount(database, tableName) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  return Number(row.count);
}

function listDomainTables(database) {
  return database
    .prepare(
      `SELECT name
       FROM sqlite_schema
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name != 'rr_schema_migrations'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);
}

function getSeedRows(database) {
  return {
    workspace: database
      .prepare(
        `SELECT workspace_id, display_name, mode, default_pricing_policy_id,
                default_pricing_policy_version, row_version
         FROM creator_workspaces`,
      )
      .get(),
    asset: database
      .prepare(
        `SELECT asset_id, workspace_id, title, asset_type, creator_display_name,
                fingerprint_algorithm, fingerprint_value, preview_reference,
                availability, row_version
         FROM assets`,
      )
      .get(),
    policy: database
      .prepare(
        `SELECT pricing_policy_id, workspace_id, version_number, policy_name,
                currency, rules_json, policy_hash, status
         FROM pricing_policy_versions`,
      )
      .get(),
    reset: database
      .prepare(
        `SELECT reset_epoch, seed_version, schema_version, reset_at,
                fixture_manifest_json, seed_hash
         FROM demo_reset_epochs`,
      )
      .get(),
  };
}

export function seedSnapshot(database) {
  const rows = getSeedRows(database);
  const counts = Object.fromEntries(
    ["creator_workspaces", "assets", "pricing_policy_versions", "demo_reset_epochs", ...transactionalTables]
      .map((tableName) => [tableName, queryCount(database, tableName)]),
  );
  const snapshot = { rows, counts };
  return {
    snapshot,
    canonicalJson: canonicalize(snapshot),
    sha256: sha256(canonicalize(snapshot)),
  };
}

export function verifyDatabase(database) {
  const integrity = database.prepare("PRAGMA integrity_check").get();
  if (integrity.integrity_check !== "ok") {
    throw new Error(`SQLite integrity check failed: ${integrity.integrity_check}`);
  }

  const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyViolations.length !== 0) {
    throw new Error(`Foreign key check failed: ${JSON.stringify(foreignKeyViolations)}`);
  }

  const actualTables = listDomainTables(database);
  if (canonicalize(actualTables) !== canonicalize([...expectedDomainTables].sort())) {
    throw new Error(
      `Domain table set mismatch. Expected ${expectedDomainTables.length}, found ${actualTables.length}`,
    );
  }

  const migrationCount = queryCount(database, "rr_schema_migrations");
  if (migrationCount !== listMigrationFiles().length) {
    throw new Error(`Expected ${listMigrationFiles().length} migrations, found ${migrationCount}`);
  }

  const { rows, counts } = seedSnapshot(database).snapshot;
  if (!rows.workspace || rows.workspace.workspace_id !== "00000000-0000-4000-8000-000000000001") {
    throw new Error("Seeded creator workspace is missing or has an unexpected identifier");
  }
  if (!rows.asset || rows.asset.title !== "Harbor After Rain") {
    throw new Error("Seeded Harbor After Rain asset is missing");
  }
  if (!rows.policy || rows.policy.policy_hash !== "33d8c85a963b9b12c1dc61bc5f3d6dd8ae186a8bef47f5ac4a6c1ccc10163916") {
    throw new Error("Seeded pricing policy is missing or changed unexpectedly");
  }
  if (!rows.reset || rows.reset.seed_hash !== "d8a3738ede3a49f7eace625f6cbe2574af719699aaf7fbf22820bc7d9a647d37") {
    throw new Error("Seed manifest is missing or changed unexpectedly");
  }
  if (rows.reset.schema_version !== migrationCount) {
    throw new Error("Seed snapshot schema version does not match applied migrations");
  }

  const fixture = JSON.parse(rows.reset.fixture_manifest_json);
  if (
    fixture.buyer?.organization !== "Cedar & Tide Travel"
    || fixture.expected_quote_cents !== 42500
    || fixture.transaction_records_seeded !== 0
  ) {
    throw new Error("Seed manifest does not match the frozen judge scenario");
  }

  for (const tableName of transactionalTables) {
    if (counts[tableName] !== 0) {
      throw new Error(`Expected no stale transaction records in ${tableName}, found ${counts[tableName]}`);
    }
  }

  return {
    integrity: "ok",
    domainTableCount: actualTables.length,
    migrationCount,
    seedSnapshotSha256: seedSnapshot(database).sha256,
    fixture: {
      creator: rows.workspace.display_name,
      asset: rows.asset.title,
      buyerOrganization: fixture.buyer.organization,
      expectedQuoteCents: fixture.expected_quote_cents,
    },
  };
}

export function setupDatabase(databasePath = defaultDatabasePath) {
  const database = openDatabase(databasePath);
  try {
    const migrations = applyMigrations(database);
    return { migrations };
  } finally {
    database.close();
  }
}

export function resetDatabase(databasePath = defaultDatabasePath) {
  const database = openDatabase(databasePath);
  try {
    const migrations = applyMigrations(database);
    resetSeed(database);
    const verification = verifyDatabase(database);
    return { migrations, verification };
  } finally {
    database.close();
  }
}

export function removeDatabase(databasePath = defaultDatabasePath) {
  for (const suffix of ["", "-shm", "-wal"]) {
    const candidate = `${databasePath}${suffix}`;
    if (existsSync(candidate)) {
      rmSync(candidate, { force: true });
    }
  }
}

function parseArguments(argumentsList) {
  const [command = "verify", ...rest] = argumentsList;
  let databasePath = defaultDatabasePath;

  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--database") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--database requires a path");
      }
      databasePath = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${rest[index]}`);
    }
  }

  return { command, databasePath };
}

function runCommand({ command, databasePath }) {
  if (command === "setup") {
    return setupDatabase(databasePath);
  }
  if (command === "reset") {
    return resetDatabase(databasePath);
  }
  if (command === "verify") {
    removeDatabase(databasePath);
    const first = resetDatabase(databasePath);
    const database = openDatabase(databasePath);
    let firstHash;
    try {
      firstHash = seedSnapshot(database).sha256;
    } finally {
      database.close();
    }
    const second = resetDatabase(databasePath);
    const reopened = openDatabase(databasePath);
    try {
      const secondHash = seedSnapshot(reopened).sha256;
      if (firstHash !== secondHash) {
        throw new Error(`Reset is not deterministic: ${firstHash} != ${secondHash}`);
      }
      return {
        first,
        second,
        deterministicResetSha256: secondHash,
      };
    } finally {
      reopened.close();
    }
  }

  throw new Error(`Unknown command: ${command}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  try {
    const result = runCommand(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
