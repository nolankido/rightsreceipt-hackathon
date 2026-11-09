#!/usr/bin/env node
/** Offline, read-only verifier for the JSON output of an operator-run Wrangler D1 ledger query. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_D1_MIGRATIONS = Object.freeze([
  "0001_initial_schema.sql",
  "0002_indexes_and_guards.sql",
  "0003_paypal_delivery_journal.sql",
  "0004_verified_webhook_intake.sql",
  "0005_webhook_processing.sql",
  "0006_paypal_reconciliation.sql",
  "0007_permission_lifecycle.sql",
  "0008_canonical_receipts.sql",
  "0009_clarification_evidence.sql",
]);
const schemaVersion = "rightsreceipt-judge-d1-ledger-check-v1";
const maxInputBytes = 64 * 1024;
const limitation = "Validates supplied JSON only. The operator must use the documented --remote query; this tool cannot authenticate its Cloudflare source or database identity.";

function record(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The expected input is one --json response for SELECT name FROM d1_migrations ORDER BY id. */
export function evaluateWranglerLedger(value) {
  const errors = new Set();
  let observedMigrationCount = null;
  if (!Array.isArray(value) || value.length !== 1 || !record(value[0])) {
    errors.add("wrangler_result_invalid");
  } else {
    const query = value[0];
    if (query.success !== true || !Array.isArray(query.results)) {
      errors.add("wrangler_query_failed");
    } else {
      const rows = query.results;
      observedMigrationCount = rows.length;
      if (rows.length !== REQUIRED_D1_MIGRATIONS.length) errors.add("migration_count_mismatch");
      const wellFormed = rows.every(row =>
        record(row) && Object.keys(row).length === 1 && typeof row.name === "string"
          && /^\d{4}_[a-z0-9_]+\.sql$/u.test(row.name));
      if (!wellFormed) {
        errors.add("migration_rows_invalid");
      } else if (JSON.stringify(rows.map(row => row.name)) !== JSON.stringify(REQUIRED_D1_MIGRATIONS)) {
        errors.add("migration_sequence_mismatch");
      }
    }
    if (record(query.meta) &&
      ([query.meta.rows_written, query.meta.changes].some(value =>
        value !== undefined && value !== null && value !== 0))) {
      errors.add("unexpected_write_evidence");
    }
  }
  const errorCodes = [...errors].sort();
  return {
    schemaVersion,
    status: errorCodes.length === 0 ? "passed" : "failed",
    expectedMigrationCount: REQUIRED_D1_MIGRATIONS.length,
    observedMigrationCount, errorCodes, limitation,
  };
}

export async function readLimitedInput(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxInputBytes) throw new Error("input_too_large");
    chunks.push(bytes);
  }
  if (size === 0) throw new Error("input_empty");
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(args = process.argv.slice(2), input = process.stdin, output = process.stdout) {
  if (args.length === 1 && args[0] === "--help") {
    output.write("Pipe one Wrangler D1 execute --remote --json result into this read-only checker.\n");
    return 0;
  }
  if (args.length !== 0) {
    output.write(JSON.stringify({schemaVersion, status:"failed", errorCodes:["arguments_invalid"], limitation}) + "\n");
    return 2;
  }
  let result;
  try {
    result = evaluateWranglerLedger(JSON.parse(await readLimitedInput(input)));
  } catch {
    result = {schemaVersion, status:"failed", errorCodes:["input_invalid"], limitation};
  }
  output.write(JSON.stringify(result) + "\n");
  return result.status === "passed" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
