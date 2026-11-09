import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SEED_POLICY_VERSION, calculateQuote } from "../packages/pricing/src/index.ts";
import { createD1PricingPolicyReader, createD1QuoteRepository } from "../packages/persistence/src/quotes.ts";

const directory = mkdtempSync(join(tmpdir(), "rr-pricing-test-"));
const pricingUri = pathToFileURL(resolve("packages/pricing/src/index.ts")).href;
const pricingServiceSource = readFileSync(resolve("packages/application/src/quotes.ts"), "utf8")
  .replace('from "@rightsreceipt/pricing"', `from "${pricingUri}"`);
const copiedService = join(directory, "quotes.ts");
writeFileSync(copiedService, pricingServiceSource);
const { QuoteService, QuoteServiceError } = await import(pathToFileURL(copiedService).href);

const seededTerms = {
  termsVersionId: "20000000-0000-4000-8000-000000000002",
  caseId: "10000000-0000-4000-8000-000000000001",
  versionNumber: 1,
  resolutionStatus: "complete",
  usePurpose: "commercial",
  channels: ["instagram_paid", "facebook_paid"],
  paidAdvertising: true,
  territories: ["US", "CA"],
  startDate: "2026-11-01",
  durationDays: 90,
  maxImpressions: 500000,
  exclusivity: "non_exclusive",
  modificationScope: "crop_only",
  attribution: "not_required",
  sublicensing: "prohibited",
  aiUse: "prohibited",
  sourceKind: "human_corrected",
  termsHash: "b".repeat(64),
  createdByActor: "creator",
  createdAt: "2026-10-26T12:00:00.000Z",
};

function setupDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE pricing_policy_versions (
      pricing_policy_id TEXT, workspace_id TEXT, version_number INTEGER,
      policy_name TEXT, currency TEXT, rules_json TEXT, policy_hash TEXT,
      status TEXT, PRIMARY KEY (pricing_policy_id, version_number)
    );
    CREATE TABLE licensing_cases (
      case_id TEXT PRIMARY KEY, row_version INTEGER, case_outcome TEXT,
      latest_terms_version_id TEXT, request_submission_id TEXT,
      latest_quote_id TEXT, updated_at TEXT
    );
    CREATE TABLE terms_versions (terms_version_id TEXT PRIMARY KEY);
    CREATE TABLE quotes (
      quote_id TEXT PRIMARY KEY, case_id TEXT, quote_version_number INTEGER,
      terms_version_id TEXT, pricing_policy_id TEXT, pricing_policy_version INTEGER,
      amount_cents INTEGER, currency TEXT, status TEXT, calculation_hash TEXT,
      created_at TEXT,
      FOREIGN KEY (terms_version_id) REFERENCES terms_versions(terms_version_id),
      UNIQUE(case_id, quote_version_number), UNIQUE(case_id, calculation_hash)
    );
    CREATE TABLE quote_lines (
      quote_line_id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, line_position INTEGER,
      line_code TEXT, description TEXT, amount_cents INTEGER, created_at TEXT,
      FOREIGN KEY(quote_id) REFERENCES quotes(quote_id)
    );
    CREATE TABLE audit_events (
      audit_event_id TEXT PRIMARY KEY, case_id TEXT, aggregate_type TEXT,
      aggregate_id TEXT, aggregate_sequence INTEGER, event_type TEXT,
      actor_type TEXT, actor_reference TEXT, payload_json TEXT,
      correlation_id TEXT, idempotency_key TEXT, created_at TEXT
    );
  `);
  db.prepare(`INSERT INTO pricing_policy_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    SEED_POLICY_VERSION.pricingPolicyId, SEED_POLICY_VERSION.workspaceId,
    SEED_POLICY_VERSION.versionNumber, SEED_POLICY_VERSION.policyName,
    SEED_POLICY_VERSION.currency, SEED_POLICY_VERSION.rulesJson,
    SEED_POLICY_VERSION.policyHash, SEED_POLICY_VERSION.status,
  );
  db.prepare(`INSERT INTO licensing_cases VALUES (?, 3, 'open', ?, ?, NULL, ?)`).run(
    seededTerms.caseId, seededTerms.termsVersionId,
    "30000000-0000-4000-8000-000000000001", "2026-10-26T12:00:00.000Z",
  );
  db.prepare(`INSERT INTO terms_versions VALUES (?)`).run(seededTerms.termsVersionId);
  return db;
}

function d1Bridge(db) {
  function prepare(sql) {
    let bound = [];
    return {
      bind(...values) { bound = values; return this; },
      async first() { return db.prepare(sql).get(...bound) ?? null; },
      async all() { return { success: true, results: db.prepare(sql).all(...bound) }; },
      async run() { const result = db.prepare(sql).run(...bound); return { success: true, meta: { changes: result.changes } }; },
      async raw() { return []; },
    };
  }
  return {
    prepare,
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        db.exec("COMMIT");
        return result;
      } catch(error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql) { db.exec(sql); return { count: 0, duration: 0 }; },
  };
}

function createFixture() {
  const db = setupDatabase();
  const bridge = d1Bridge(db);
  const quotes = createD1QuoteRepository(bridge);
  const pricingPolicies = createD1PricingPolicyReader(bridge);
  const terms = { ...seededTerms };
  const termsReader = {
    async getCaseContext(caseId) {
      if (caseId !== terms.caseId) return null;
      const row = db.prepare("SELECT * FROM licensing_cases WHERE case_id = ?").get(caseId);
      return {
        caseId, workspaceId: SEED_POLICY_VERSION.workspaceId,
        caseRowVersion: row.row_version, caseOutcome: row.case_outcome,
        latestTermsVersion: { ...terms },
      };
    },
  };
  const workspaces = {
    async getDemoWorkspace() {
      return {
        workspaceId: SEED_POLICY_VERSION.workspaceId,
        defaultPricingPolicyId: SEED_POLICY_VERSION.pricingPolicyId,
        defaultPricingPolicyVersion: SEED_POLICY_VERSION.versionNumber,
      };
    },
  };
  let counter = 0;
  const svc = new QuoteService({
    quotes,
    pricingPolicies,
    terms: termsReader,
    workspaces,
    clock: { now: () => new Date("2026-10-26T12:00:00.000Z") },
    identifiers: { create() { counter++; return `40000000-0000-4000-8000-${String(counter).padStart(12, "0")}`; } },
    hasher: { sha256Hex: async (s) => createHash("sha256").update(s).digest("hex") },
  });
  return { db, quotes, pricingPolicies, terms, svc };
}

function count(db, table) { return db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n; }

test("quote service blocks before a complete rights version", async () => {
  const f = createFixture();
  try {
    f.terms.resolutionStatus = "incomplete";
    assert.equal((await f.svc.getQuote(seededTerms.caseId)).status, "blocked");
    await assert.rejects(f.svc.generateQuote(seededTerms.caseId, 3), (error) => error instanceof QuoteServiceError && error.code === "terms_incomplete");
    assert.equal(count(f.db, "quotes"), 0);
  } finally { f.db.close(); }
});

test("SQL adapter creates one versioned quote, five lines, and audit atomically", async () => {
  const f = createFixture();
  try {
    assert.equal((await f.svc.getQuote(seededTerms.caseId)).status, "ready_for_pricing");
    const view = await f.svc.generateQuote(seededTerms.caseId, 3);
    assert.equal(view.status, "quoted");
    assert.equal(view.quote.record.amountCents, 42_500);
    assert.equal(view.quote.lines.length, 5);
    assert.equal(view.quote.lines.reduce((sum, l) => sum + l.amountCents, 0), 42_500);
    assert.equal(count(f.db, "quotes"), 1);
    assert.equal(count(f.db, "quote_lines"), 5);
    assert.equal(count(f.db, "audit_events"), 1);
    assert.equal(f.db.prepare("SELECT latest_quote_id IS NOT NULL AS linked FROM licensing_cases").get().linked, 1);
  } finally { f.db.close(); }
});

test("repeat generation with current case version is idempotent", async () => {
  const f = createFixture();
  try {
    await f.svc.generateQuote(seededTerms.caseId, 3);
    const repeated = await f.svc.generateQuote(seededTerms.caseId, 4);
    assert.equal(repeated.status, "quoted");
    assert.equal(count(f.db, "quotes"), 1);
    assert.equal(count(f.db, "audit_events"), 1);
  } finally { f.db.close(); }
});

test("stale generation cannot mutate quotes or audit and keeps old quote active", async () => {
  const f = createFixture();
  try {
    await f.svc.generateQuote(seededTerms.caseId, 3);
    f.terms.termsVersionId = randomUUID();
    f.terms.versionNumber = 2;
    f.terms.termsHash = "c".repeat(64);
    f.db.prepare("INSERT INTO terms_versions VALUES (?)").run(f.terms.termsVersionId);
    f.db.prepare("UPDATE licensing_cases SET latest_terms_version_id = ?, row_version = 5").run(f.terms.termsVersionId);
    assert.equal((await f.svc.getQuote(seededTerms.caseId)).status, "stale_quote");
    await assert.rejects(f.svc.generateQuote(seededTerms.caseId, 4), (error) => error instanceof QuoteServiceError && error.code === "stale_case");
    assert.equal(count(f.db, "quotes"), 1);
    assert.equal(f.db.prepare("SELECT status FROM quotes").get().status, "current");
    assert.equal(count(f.db, "audit_events"), 1);
  } finally { f.db.close(); }
});

test("new terms version creates quote version 2 and supersedes history", async () => {
  const f = createFixture();
  try {
    await f.svc.generateQuote(seededTerms.caseId, 3);
    f.terms.termsVersionId = randomUUID();
    f.terms.versionNumber = 2;
    f.terms.termsHash = "c".repeat(64);
    f.terms.modificationScope = "none";
    f.db.prepare("INSERT INTO terms_versions VALUES (?)").run(f.terms.termsVersionId);
    f.db.prepare("UPDATE licensing_cases SET latest_terms_version_id = ?, row_version = 5").run(f.terms.termsVersionId);
    const second = await f.svc.generateQuote(seededTerms.caseId, 5);
    assert.equal(second.quote.record.quoteVersionNumber, 2);
    assert.equal(second.quote.record.amountCents, 40_000);
    assert.deepEqual(f.db.prepare("SELECT status FROM quotes ORDER BY quote_version_number").all().map((x) => x.status), ["superseded", "current"]);
    assert.equal(count(f.db, "audit_events"), 2);
  } finally { f.db.close(); }
});

test("SQL adapter fails stale CAS atomically, including supersede and audit", async () => {
  const f = createFixture();
  try {
    const first = await f.svc.generateQuote(seededTerms.caseId, 3);
    f.db.prepare("UPDATE licensing_cases SET row_version = 9").run();
    const calc = calculateQuote({ ...seededTerms, termsHash: "d".repeat(64) }, SEED_POLICY_VERSION);
    const quote = {
      ...first.quote.record,
      quoteId: randomUUID(),
      quoteVersionNumber: 2,
      calculationHash: createHash("sha256").update(calc.calculationCanonicalJson).digest("hex"),
    };
    const lines = first.quote.lines.map((x) => ({ ...x, quoteLineId: randomUUID(), quoteId: quote.quoteId }));
    const audit = {
      auditEventId: randomUUID(), caseId: seededTerms.caseId, aggregateType: "quote",
      aggregateId: quote.quoteId, eventType: "quote.generated", actorType: "system",
      payloadJson: "{}", correlationId: randomUUID(), createdAt: quote.createdAt,
    };
    await assert.rejects(f.quotes.saveNew(quote, lines, audit, 4));
    assert.equal(count(f.db, "quotes"), 1);
    assert.equal(count(f.db, "quote_lines"), 5);
    assert.equal(count(f.db, "audit_events"), 1);
    assert.equal(f.db.prepare("SELECT status FROM quotes").get().status, "current");
  } finally { f.db.close(); }
});

test("tampered stored policy is refused with no quote side effect", async () => {
  const f = createFixture();
  try {
    f.db.prepare("UPDATE pricing_policy_versions SET policy_hash = ?").run("a".repeat(64));
    await assert.rejects(f.svc.generateQuote(seededTerms.caseId, 3), (error) => error instanceof QuoteServiceError && error.code === "policy_integrity_failed");
    assert.equal(count(f.db, "quotes"), 0);
  } finally { f.db.close(); }
});

test("missing or inactive policy blocks quote issuance", async () => {
  const f = createFixture();
  try {
    f.db.prepare("UPDATE pricing_policy_versions SET status = 'superseded'").run();
    assert.equal((await f.svc.getQuote(seededTerms.caseId)).status, "blocked");
    await assert.rejects(f.svc.generateQuote(seededTerms.caseId, 3), (error) => error.code === "policy_unavailable");
    assert.equal(count(f.db, "quotes"), 0);
  } finally { f.db.close(); }
});

process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
