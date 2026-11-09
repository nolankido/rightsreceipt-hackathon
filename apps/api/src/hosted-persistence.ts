/** Read-only D1 schema readiness guard for hosted Sandbox and judge health routes. */
import type { D1DatabasePort } from "@rightsreceipt/persistence";

// These artifacts and the Wrangler ledger cover the nine checked-in SQL migrations. Update the
// inventory and its real-migration regression when a migration is added.
const requiredTables = [
  "creator_workspaces", "assets", "licensing_cases",
  "request_submissions", "buyer_capabilities", "extraction_attempts",
  "field_observations", "clarification_rounds", "clarification_questions",
  "clarification_answers", "clarification_submissions", "clarification_reviews",
  "terms_versions", "pricing_policy_versions", "quotes",
  "quote_lines", "creator_decisions", "buyer_acceptances",
  "payment_operations", "invoice_bindings", "paypal_delivery_journal",
  "webhook_inbox_events", "paypal_webhook_projections", "paypal_webhook_processing_receipts",
  "paypal_reconciliation_outbox", "paypal_reconciliation_receipts", "paypal_lifecycle_observations",
  "payment_evidence", "permissions", "verification_records",
  "receipt_revisions", "audit_events", "demo_reset_epochs",
] as const;
const requiredIndexes = [
  "idx_assets_workspace_availability", "idx_cases_workspace_updated", "idx_cases_asset_created",
  "idx_extractions_case_status", "idx_field_observations_attempt_field", "idx_terms_case_latest",
  "idx_quotes_case_latest", "idx_payment_operations_case_status", "idx_invoice_provider_status",
  "idx_webhook_processing", "idx_payment_evidence_invoice_observed", "idx_permissions_state_date",
  "idx_verification_public_status", "idx_audit_case_created", "uq_audit_idempotency",
  "uq_active_buyer_capability", "uq_current_quote_per_case", "uq_active_policy_per_workspace",
  "idx_webhook_invoice_pending", "idx_reconciliation_pending", "idx_reconciliation_ready",
  "clarification_submission_case", "clarification_review_case",
] as const;
const requiredTriggers = [
  "prevent_request_submission_update", "prevent_extraction_attempt_update_after_completion", "prevent_field_observation_update",
  "prevent_terms_version_update", "prevent_pricing_policy_content_update", "prevent_quote_content_update",
  "prevent_quote_line_update", "prevent_creator_decision_update", "prevent_buyer_acceptance_update",
  "prevent_payment_evidence_update", "prevent_receipt_revision_update", "prevent_audit_event_update",
  "paypal_delivery_identity_immutable", "paypal_delivery_send_monotonic", "webhook_verified_receipt_immutable",
  "webhook_processing_receipt_immutable", "webhook_projection_monotonic", "webhook_outbox_monotonic",
  "webhook_processed_receipt_stable", "paypal_reconciliation_receipt_immutable", "paypal_lifecycle_observation_immutable",
  "permission_lifecycle_guard", "canonical_receipt_chain_guard", "prevent_clarification_round_update",
  "prevent_clarification_question_update", "prevent_clarification_answer_update", "prevent_clarification_submission_update",
  "prevent_clarification_review_update",
] as const;
const requiredMigrations = [
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
const requiredAlteredColumns = [
  ["webhook_inbox_events", ["provider_invoice_id", "event_created_at", "resource_status", "verification_method"]],
  ["paypal_reconciliation_outbox", ["lease_token", "lease_expires_at", "attempt_count", "attempt_generation", "next_attempt_at", "last_error_code", "blocked_code", "last_success_at"]],
  ["permissions", ["review_required"]],
  ["receipt_revisions", ["material_sha256", "audit_root_sha256"]],
] as const;

function quotedNames(names: readonly string[]): string {
  // Identifiers are source-controlled literals, never values from a request.
  return names.map(name => "'" + name + "'").join(", ");
}

const checks = [
  {
    key: "tables", expected: requiredTables.length,
    sql: "(SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name IN ("
      + quotedNames(requiredTables) + "))",
  },
  {
    key: "indexes", expected: requiredIndexes.length,
    sql: "(SELECT COUNT(*) FROM sqlite_schema WHERE type = 'index' AND name IN ("
      + quotedNames(requiredIndexes) + "))",
  },
  {
    key: "triggers", expected: requiredTriggers.length,
    sql: "(SELECT COUNT(*) FROM sqlite_schema WHERE type = 'trigger' AND name IN ("
      + quotedNames(requiredTriggers) + "))",
  },
  {
    key: "applied_migrations", expected: requiredMigrations.length,
    sql: "(SELECT COUNT(*) FROM d1_migrations)",
  },
  {
    key: "known_migrations", expected: requiredMigrations.length,
    sql: "(SELECT COUNT(DISTINCT name) FROM d1_migrations WHERE name IN ("
      + quotedNames(requiredMigrations) + "))",
  },
  ...requiredAlteredColumns.map(([table, names], index) => ({
    key: "altered_columns_" + index,
    expected: names.length,
    sql: "(SELECT COUNT(*) FROM pragma_table_info('" + table + "') WHERE name IN ("
      + quotedNames(names) + "))",
  })),
];
const query = "SELECT " + checks.map(check => check.sql + " AS " + check.key).join(", ");

export async function hostedD1Ready(database: D1DatabasePort | undefined): Promise<boolean> {
  if (!database || typeof database.prepare !== "function") return false;
  try {
    const row = await database.prepare<Record<string, number>>(query).first();
    return !!row && checks.every(check => row[check.key] === check.expected);
  } catch {
    // Never expose database errors, SQL text or schema details in public health.
    return false;
  }
}
