export const PERSISTENCE_SCHEMA_VERSION = 9 as const;
export const PERSISTENCE_MIGRATIONS = [
  "0001_initial_schema.sql",
  "0002_indexes_and_guards.sql",
  "0003_paypal_delivery_journal.sql",
  "0004_verified_webhook_intake.sql",
  "0005_webhook_processing.sql",
  "0006_paypal_reconciliation.sql",
  "0007_permission_lifecycle.sql",
  "0008_canonical_receipts.sql",
  "0009_clarification_evidence.sql",
] as const;
export const DOMAIN_TABLES = [
  "creator_workspaces",
  "assets",
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
  "pricing_policy_versions",
  "quotes",
  "quote_lines",
  "creator_decisions",
  "buyer_acceptances",
  "payment_operations",
  "invoice_bindings",
  "paypal_delivery_journal",
  "webhook_inbox_events",
  "paypal_webhook_projections",
  "paypal_webhook_processing_receipts",
  "paypal_reconciliation_outbox",
  "paypal_reconciliation_receipts",
  "paypal_lifecycle_observations",
  "payment_evidence",
  "permissions",
  "verification_records",
  "receipt_revisions",
  "audit_events",
  "demo_reset_epochs",
] as const;
export type DomainTableName = (typeof DOMAIN_TABLES)[number];
export const DEMO_SEED_IDS = Object.freeze({
  workspaceId: "00000000-0000-4000-8000-000000000001",
  pricingPolicyId: "00000000-0000-4000-8000-000000000002",
  assetId: "00000000-0000-4000-8000-000000000003",
});
export const DEMO_SEED_VERSION = "harbor-after-rain-v1" as const;
export const DEMO_SEED_HASH = "d8a3738ede3a49f7eace625f6cbe2574af719699aaf7fbf22820bc7d9a647d37" as const;
export const DEMO_POLICY_HASH = "33d8c85a963b9b12c1dc61bc5f3d6dd8ae186a8bef47f5ac4a6c1ccc10163916" as const;
export const DEMO_EXPECTED_QUOTE_CENTS = 42_500 as const;
