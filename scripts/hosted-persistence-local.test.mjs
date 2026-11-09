import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { hostedD1Ready } from "../apps/api/src/hosted-persistence.ts";
import { PERSISTENCE_MIGRATIONS, PERSISTENCE_SCHEMA_VERSION } from "../packages/persistence/src/manifest.ts";

const migrationsDirectory = new URL("../migrations/", import.meta.url);
function migratedFixture(count = PERSISTENCE_MIGRATIONS.length) {
  const database = new DatabaseSync(":memory:");
  // Wrangler's default remote ledger shape, kept separate from local rr_schema_migrations.
  database.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
  const addMigration = database.prepare("INSERT INTO d1_migrations (name) VALUES (?)");
  for (const name of PERSISTENCE_MIGRATIONS.slice(0, count)) {
    database.exec(readFileSync(new URL(name, migrationsDirectory), "utf8"));
    addMigration.run(name);
  }
  const statements = [];
  return {
    database, statements,
    d1: {
      prepare(sql) {
        statements.push(sql);
        return { first: async () => database.prepare(sql).get() };
      },
    },
  };
}
async function withFixture(action, count = PERSISTENCE_MIGRATIONS.length) {
  const fixture = migratedFixture(count);
  try { await action(fixture); }
  finally { fixture.database.close(); }
}

test("schema readiness fixture stays pinned to all nine checked-in SQL migrations", () => {
  assert.equal(PERSISTENCE_SCHEMA_VERSION, 9);
  const files = readdirSync(fileURLToPath(migrationsDirectory))
    .filter(name => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name)).sort();
  assert.deepEqual(files, [...PERSISTENCE_MIGRATIONS]);
});

test("hosted health refuses a missing or invalid D1 binding", async () => {
  assert.equal(await hostedD1Ready(undefined), false);
  assert.equal(await hostedD1Ready({}), false);
  assert.equal(await hostedD1Ready({ prepare: null }), false);
});

test("empty or partially migrated D1 never reports readiness", async () => {
  for (const count of [0, 1, 2, 7, 8]) {
    await withFixture(async ({ d1 }) => {
      assert.equal(await hostedD1Ready(d1), false, "migration count " + count);
    }, count);
  }
});

test("all nine real SQL migrations satisfy a single read-only hosted readiness query", async () => {
  await withFixture(async ({ d1, statements, database }) => {
    assert.equal(await hostedD1Ready(d1), true);
    assert.equal(statements.length, 1);
    assert.match(statements[0], /^SELECT\s+/u);
    assert.match(statements[0], /pragma_table_info/u);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='d1_migrations'").get().n, 33);
  });
});

test("a schema-complete D1 without the Wrangler migration ledger is unavailable", async () => {
  await withFixture(async ({ database, d1 }) => {
    database.exec("DROP TABLE d1_migrations");
    assert.equal(await hostedD1Ready(d1), false);
  });
});

test("missing, renamed or unexpected applied migration entries cannot pass", async () => {
  for (const change of [
    db => db.exec("DELETE FROM d1_migrations WHERE name='0008_canonical_receipts.sql'"),
    db => db.exec("UPDATE d1_migrations SET name='0008_other.sql' WHERE name='0008_canonical_receipts.sql'"),
    db => db.exec("INSERT INTO d1_migrations (name) VALUES ('0010_unreviewed.sql')"),
  ]) {
    await withFixture(async ({ database, d1 }) => {
      change(database);
      assert.equal(await hostedD1Ready(d1), false);
    });
  }
});

test("duplicate ledger names cannot hide a missing migration", async () => {
  await withFixture(async ({ database, d1 }) => {
    database.exec("DROP TABLE d1_migrations");
    database.exec("CREATE TABLE d1_migrations (name TEXT)");
    const add = database.prepare("INSERT INTO d1_migrations (name) VALUES (?)");
    for (const name of PERSISTENCE_MIGRATIONS.slice(0, 8)) add.run(name);
    add.run(PERSISTENCE_MIGRATIONS[0]);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get().n, 9);
    assert.equal(await hostedD1Ready(d1), false);
  });
});

test("missing a required original or late-migration table fails closed", async () => {
  for (const table of ["assets", "clarification_reviews", "paypal_reconciliation_receipts"]) {
    await withFixture(async ({ database, d1 }) => {
      database.exec("DROP TABLE " + table);
      assert.equal(await hostedD1Ready(d1), false, table);
    });
  }
});

test("removing required early, middle or late indexes fails closed", async () => {
  for (const index of ["uq_current_quote_per_case", "idx_webhook_invoice_pending", "idx_reconciliation_ready", "clarification_review_case"]) {
    await withFixture(async ({ database, d1 }) => {
      database.exec("DROP INDEX " + index);
      assert.equal(await hostedD1Ready(d1), false, index);
    });
  }
});

test("missing an integrity trigger fails hosted readiness", async () => {
  for (const trigger of ["prevent_quote_content_update", "webhook_verified_receipt_immutable", "canonical_receipt_chain_guard"]) {
    await withFixture(async ({ database, d1 }) => {
      database.exec("DROP TRIGGER " + trigger);
      assert.equal(await hostedD1Ready(d1), false, trigger);
    });
  }
});

function dropColumnKeepingTriggerNames(database, table, column) {
  // Placeholder triggers isolate column presence for this test. The real SQL
  // migration fixtures above are used unchanged for the successful case.
  const triggers = database.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND tbl_name=?")
    .all(table).map(row => row.name);
  for (const name of triggers) database.exec("DROP TRIGGER " + name);
  database.exec("ALTER TABLE " + table + " DROP COLUMN " + column);
  for (const name of triggers) {
    database.exec("CREATE TRIGGER " + name + " BEFORE UPDATE ON " + table + " BEGIN SELECT 1; END");
  }
}

test("all four post-initial migration column groups are necessary", async () => {
  for (const [table, column] of [
    ["webhook_inbox_events", "verification_method"],
    ["paypal_reconciliation_outbox", "lease_token"],
    ["permissions", "review_required"],
    ["receipt_revisions", "material_sha256"],
    ["receipt_revisions", "audit_root_sha256"],
  ]) {
    await withFixture(async ({ database, d1 }) => {
      dropColumnKeepingTriggerNames(database, table, column);
      assert.equal(await hostedD1Ready(d1), false, table + "." + column);
    });
  }
});

test("malformed or forged result rows cannot pass", async () => {
  for (const row of [null, undefined, {}, { tables: "33" }, { tables: 33, indexes: 23, triggers: 28 }]) {
    const db = { prepare: () => ({ first: async () => row }) };
    assert.equal(await hostedD1Ready(db), false);
  }
});

test("database errors and unsupported schema introspection fail privately", async () => {
  for (const db of [
    { prepare: () => { throw new Error("private SQL credentials"); } },
    { prepare: () => ({ first: async () => { throw new Error("secret@example.test"); } }) },
  ]) assert.equal(await hostedD1Ready(db), false);
});
