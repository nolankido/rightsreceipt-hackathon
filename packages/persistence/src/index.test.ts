import { describe, expect, it } from "vitest";

import {
  DEMO_EXPECTED_QUOTE_CENTS,
  DEMO_SEED_IDS,
  DOMAIN_TABLES,
  PERSISTENCE_IMPLEMENTATION_STATUS,
  PERSISTENCE_MIGRATIONS,
  PERSISTENCE_SCHEMA_VERSION,
} from "./index";

describe("persistence manifest", () => {
  it("tracks the frozen schema and deterministic judge identifiers", () => {
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(9);
    expect(PERSISTENCE_MIGRATIONS).toEqual([
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
    expect(DOMAIN_TABLES).toHaveLength(33);
    expect(new Set(DOMAIN_TABLES).size).toBe(DOMAIN_TABLES.length);
    expect(DEMO_SEED_IDS.assetId).toBe("00000000-0000-4000-8000-000000000003");
    expect(DEMO_EXPECTED_QUOTE_CENTS).toBe(42_500);
  });

  it("states which adapter evidence is still pending", () => {
    expect(PERSISTENCE_IMPLEMENTATION_STATUS).toEqual({
      adapter: "d1-sql-migrations",
      migrationsImplemented: true,
      deterministicSeedImplemented: true,
      localSqliteVerificationImplemented: true,
      buyerRequestRepositoriesImplemented: true,
      termsReviewRepositoriesImplemented: true,
      drizzleMappingImplemented: false,
      liveD1VerificationCompleted: false,
    });
  });
});
