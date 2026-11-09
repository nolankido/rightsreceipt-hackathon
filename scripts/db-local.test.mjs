import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyMigrations,
  listMigrationFiles,
  openDatabase,
  removeDatabase,
  resetDatabase,
  resetSeed,
  seedSnapshot,
  verifyDatabase,
} from "./db-local.mjs";

function temporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "rightsreceipt-db-"));
  const databasePath = join(directory, "test.sqlite");
  return {
    directory,
    databasePath,
    cleanup() {
      removeDatabase(databasePath);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("migrations apply in order and are idempotent", () => {
  const fixture = temporaryDatabase();
  try {
    const database = openDatabase(fixture.databasePath);
    try {
      const first = applyMigrations(database);
      const second = applyMigrations(database);
      assert.deepEqual(first.applied, listMigrationFiles());
      assert.deepEqual(first.skipped, []);
      assert.deepEqual(second.applied, []);
      assert.deepEqual(second.skipped, listMigrationFiles());
    } finally {
      database.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test("seed reset is deterministic and removes stale transaction rows", () => {
  const fixture = temporaryDatabase();
  try {
    resetDatabase(fixture.databasePath);
    const database = openDatabase(fixture.databasePath);
    let firstHash;
    try {
      firstHash = seedSnapshot(database).sha256;
      database.prepare(
        `INSERT INTO licensing_cases (
          case_id, workspace_id, asset_id, case_outcome, created_at, updated_at, row_version
        ) VALUES (?, ?, ?, 'open', ?, ?, 1)`,
      ).run(
        "10000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000003",
        "2026-10-25T13:00:00.000Z",
        "2026-10-25T13:00:00.000Z",
      );
      assert.equal(
        database.prepare("SELECT COUNT(*) AS count FROM licensing_cases").get().count,
        1,
      );
      resetSeed(database);
      verifyDatabase(database);
      assert.equal(
        database.prepare("SELECT COUNT(*) AS count FROM licensing_cases").get().count,
        0,
      );
      assert.equal(seedSnapshot(database).sha256, firstHash);
    } finally {
      database.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test("foreign keys and range checks fail closed", () => {
  const fixture = temporaryDatabase();
  try {
    resetDatabase(fixture.databasePath);
    const database = openDatabase(fixture.databasePath);
    try {
      assert.throws(() => {
        database.prepare(
          `INSERT INTO assets (
            asset_id, workspace_id, title, asset_type, creator_display_name,
            provenance_note, fingerprint_algorithm, fingerprint_value,
            preview_reference, availability, created_at, updated_at, row_version
          ) VALUES (?, ?, ?, ?, ?, ?, 'sha256', ?, ?, 'active', ?, ?, 1)`,
        ).run(
          "20000000-0000-4000-8000-000000000001",
          "99999999-9999-4999-8999-999999999999",
          "Unknown asset",
          "photograph",
          "Maya Chen",
          "Invalid foreign key fixture",
          "a".repeat(64),
          "/demo/invalid.svg",
          "2026-10-25T13:00:00.000Z",
          "2026-10-25T13:00:00.000Z",
        );
      }, /FOREIGN KEY constraint failed/u);

      assert.throws(() => {
        database.prepare(
          `INSERT INTO assets (
            asset_id, workspace_id, title, asset_type, creator_display_name,
            provenance_note, fingerprint_algorithm, fingerprint_value,
            preview_reference, availability, created_at, updated_at, row_version
          ) VALUES (?, ?, ?, ?, ?, ?, 'sha256', ?, ?, 'active', ?, ?, 1)`,
        ).run(
          "20000000-0000-4000-8000-000000000002",
          "00000000-0000-4000-8000-000000000001",
          "Unsupported asset",
          "video",
          "Maya Chen",
          "Unsupported type fixture",
          "b".repeat(64),
          "/demo/invalid.svg",
          "2026-10-25T13:00:00.000Z",
          "2026-10-25T13:00:00.000Z",
        );
      }, /CHECK constraint failed/u);
    } finally {
      database.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test("judge seed schema metadata matches every applied migration", () => {
  const fixture = temporaryDatabase();
  try {
    resetDatabase(fixture.databasePath);
    const database = openDatabase(fixture.databasePath);
    try {
      assert.equal(seedSnapshot(database).snapshot.rows.reset.schema_version, listMigrationFiles().length);
      database.prepare("UPDATE demo_reset_epochs SET schema_version=2").run();
      assert.throws(() => verifyDatabase(database), /schema version does not match applied migrations/u);
      resetSeed(database);
      assert.equal(verifyDatabase(database).migrationCount, 9);
    } finally { database.close(); }
  } finally { fixture.cleanup(); }
});

test("immutable request evidence rejects updates", () => {
  const fixture = temporaryDatabase();
  try {
    resetDatabase(fixture.databasePath);
    const database = openDatabase(fixture.databasePath);
    try {
      database.prepare(
        `INSERT INTO licensing_cases (
          case_id, workspace_id, asset_id, case_outcome, created_at, updated_at, row_version
        ) VALUES (?, ?, ?, 'open', ?, ?, 1)`,
      ).run(
        "30000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000003",
        "2026-10-25T13:00:00.000Z",
        "2026-10-25T13:00:00.000Z",
      );
      database.prepare(
        `INSERT INTO request_submissions (
          request_submission_id, case_id, buyer_name, buyer_organization,
          buyer_email, intended_use_text, normalized_text, consent_copy_version,
          consent_acknowledged, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(
        "30000000-0000-4000-8000-000000000002",
        "30000000-0000-4000-8000-000000000001",
        "Jordan Lee",
        "Cedar & Tide Travel",
        "jordan@example.test",
        "We would like to use this photograph in paid social advertisements for ninety days.",
        "we would like to use this photograph in paid social advertisements for ninety days.",
        "buyer-request-v1",
        "2026-10-25T13:00:00.000Z",
      );

      assert.throws(() => {
        database.prepare(
          "UPDATE request_submissions SET intended_use_text = ? WHERE request_submission_id = ?",
        ).run(
          "Changed text that must never replace the original evidence record.",
          "30000000-0000-4000-8000-000000000002",
        );
      }, /request_submissions are immutable/u);
    } finally {
      database.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test("migration drift is detected before execution", () => {
  const fixture = temporaryDatabase();
  const migrationCopy = mkdtempSync(join(tmpdir(), "rightsreceipt-migrations-"));
  try {
    const database = openDatabase(fixture.databasePath);
    try {
      applyMigrations(database);
      for (const migrationName of listMigrationFiles()) {
        const source = new URL(`../migrations/${migrationName}`, import.meta.url);
        writeFileSync(join(migrationCopy, migrationName), readFileSync(source, "utf8"), "utf8");
      }
      const firstMigration = listMigrationFiles(migrationCopy)[0];
      writeFileSync(
        join(migrationCopy, firstMigration),
        `${readFileSync(join(migrationCopy, firstMigration), "utf8")}\n-- drift\n`,
        "utf8",
      );
      assert.throws(
        () => applyMigrations(database, { migrationDirectory: migrationCopy }),
        /Migration drift detected/u,
      );
    } finally {
      database.close();
    }
  } finally {
    fixture.cleanup();
    rmSync(migrationCopy, { recursive: true, force: true });
  }
});

test("version content remains immutable while current-state metadata can advance", () => {
  const fixture = temporaryDatabase();
  try {
    resetDatabase(fixture.databasePath);
    const database = openDatabase(fixture.databasePath);
    try {
      database.prepare(
        `UPDATE pricing_policy_versions
         SET status = 'superseded'
         WHERE pricing_policy_id = ? AND version_number = 1`,
      ).run("00000000-0000-4000-8000-000000000002");

      database.prepare(
        `INSERT INTO pricing_policy_versions (
          pricing_policy_id, workspace_id, version_number, policy_name, currency,
          rules_json, policy_hash, status, created_at
        ) VALUES (?, ?, 2, ?, 'USD', ?, ?, 'active', ?)`,
      ).run(
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000001",
        "Harbor demo policy v2",
        '{"currency":"USD","rules":[],"version":2}',
        "c".repeat(64),
        "2026-10-25T14:00:00.000Z",
      );

      assert.throws(() => {
        database.prepare(
          `UPDATE pricing_policy_versions
           SET rules_json = ?
           WHERE pricing_policy_id = ? AND version_number = 2`,
        ).run(
          '{"currency":"USD","rules":[{"code":"mutated"}],"version":2}',
          "00000000-0000-4000-8000-000000000002",
        );
      }, /pricing policy version content is immutable/u);
    } finally {
      database.close();
    }
  } finally {
    fixture.cleanup();
  }
});
