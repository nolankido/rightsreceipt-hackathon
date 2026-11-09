import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { readdirSync } from "node:fs";
import {
  REQUIRED_D1_MIGRATIONS, evaluateWranglerLedger, main,
} from "./judge-d1-ledger-check.mjs";
import { PERSISTENCE_MIGRATIONS, PERSISTENCE_SCHEMA_VERSION } from "../packages/persistence/src/manifest.ts";

const names = [...REQUIRED_D1_MIGRATIONS];
function response(rows = names.map(name => ({ name }))) {
  return [{ results: rows, success: true, meta: { rows_read: rows.length, rows_written: 0 } }];
}
function codes(value) { return evaluateWranglerLedger(value).errorCodes; }
function outputSink() {
  const messages = [];
  return { messages, write(value) { messages.push(value); } };
}

test("ledger contract matches all nine reviewed migration files", () => {
  assert.equal(PERSISTENCE_SCHEMA_VERSION, 9);
  assert.deepEqual(names, [...PERSISTENCE_MIGRATIONS]);
  const fileNames = readdirSync(new URL("../migrations/", import.meta.url))
    .filter(name => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name)).sort();
  assert.deepEqual(fileNames, names);
});

test("valid remote-style Wrangler JSON passes without returning database values", () => {
  const result = evaluateWranglerLedger(response());
  assert.equal(result.status, "passed");
  assert.deepEqual(result.errorCodes, []);
  assert.equal(result.expectedMigrationCount, 9);
  assert.equal(result.observedMigrationCount, 9);
  assert.equal(JSON.stringify(result).includes("0001_initial_schema"), false);
});

test("a missing, extra, duplicate or renamed migration is rejected", () => {
  for (const rows of [
    names.slice(0, 8).map(name => ({ name })),
    [...names, "0010_unreviewed.sql"].map(name => ({ name })),
    [...names.slice(0, 8), names[0]].map(name => ({ name })),
    names.map(name => ({ name: name === "0008_canonical_receipts.sql" ? "0008_changed.sql" : name })),
  ]) assert.equal(evaluateWranglerLedger(response(rows)).status, "failed");
});

test("migration ordering must match applied Wrangler ledger order", () => {
  const reversed = [...names].reverse().map(name => ({ name }));
  assert.ok(codes(response(reversed)).includes("migration_sequence_mismatch"));
});

test("malformed response structure or extra projected fields fails closed", () => {
  for (const value of [null, [], {}, "text", [null], [false], [response()[0], response()[0]]]) {
    assert.ok(codes(value).includes("wrangler_result_invalid"));
  }
  for (const rows of [
    [null], [{ name: 7 }], [{ name: names[0], id: 1 }],
  ]) assert.ok(codes(response(rows)).includes("migration_rows_invalid"));
});

test("a failed Wrangler query or missing result rows cannot pass", () => {
  for (const value of [
    [{ success: false, results: names.map(name => ({ name })) }],
    [{ success: true }],
    [{ results: [], success: "true" }],
  ]) assert.ok(codes(value).includes("wrangler_query_failed"));
});

test("reported write activity is forbidden for the read-only ledger query", () => {
  for (const metadata of [
    { rows_written: 1 },
    { rows_written: "1" },
    { changes: 1 },
  ]) {
    const value = response();
    value[0].meta = metadata;
    assert.ok(codes(value).includes("unexpected_write_evidence"));
  }
});

test("the CLI accepts a bounded stdin pipe and prints sanitized counts", async () => {
  const out = outputSink();
  const code = await main([], Readable.from([JSON.stringify(response())]), out);
  assert.equal(code, 0);
  const parsed = JSON.parse(out.messages.join(""));
  assert.equal(parsed.status, "passed");
  assert.equal(parsed.observedMigrationCount, 9);
});

test("the CLI refuses malformed JSON without echoing raw private data", async () => {
  const out = outputSink();
  const secret = "fake-secret-client-key";
  assert.equal(await main([], Readable.from(["{ " + secret]), out), 1);
  const displayed = out.messages.join("");
  assert.equal(displayed.includes(secret), false);
  assert.deepEqual(JSON.parse(displayed).errorCodes, ["input_invalid"]);
});

test("the CLI rejects empty, oversized and unexpected argument input", async () => {
  for (const value of ["", "x".repeat(65537)]) {
    const out = outputSink();
    assert.equal(await main([], Readable.from([value]), out), 1);
    assert.deepEqual(JSON.parse(out.messages.join("")).errorCodes, ["input_invalid"]);
  }
  const out = outputSink();
  assert.equal(await main(["--file", "x"], Readable.from([]), out), 2);
  assert.deepEqual(JSON.parse(out.messages.join("")).errorCodes, ["arguments_invalid"]);
});
