-- RightsReceipt migration 0002
-- Query indexes, idempotency constraints, and immutable-record guards.

PRAGMA foreign_keys = ON;

CREATE INDEX idx_assets_workspace_availability
  ON assets(workspace_id, availability, title);

CREATE INDEX idx_cases_workspace_updated
  ON licensing_cases(workspace_id, updated_at DESC);

CREATE INDEX idx_cases_asset_created
  ON licensing_cases(asset_id, created_at DESC);

CREATE INDEX idx_extractions_case_status
  ON extraction_attempts(case_id, status, attempt_number DESC);

CREATE INDEX idx_field_observations_attempt_field
  ON field_observations(extraction_attempt_id, field_name);

CREATE INDEX idx_terms_case_latest
  ON terms_versions(case_id, version_number DESC);

CREATE INDEX idx_quotes_case_latest
  ON quotes(case_id, quote_version_number DESC);

CREATE INDEX idx_payment_operations_case_status
  ON payment_operations(case_id, status, created_at);

CREATE INDEX idx_invoice_provider_status
  ON invoice_bindings(provider, environment, invoice_status);

CREATE INDEX idx_webhook_processing
  ON webhook_inbox_events(processing_status, received_at);

CREATE INDEX idx_payment_evidence_invoice_observed
  ON payment_evidence(invoice_binding_id, observed_at);

CREATE INDEX idx_permissions_state_date
  ON permissions(permission_state, start_date, end_date_exclusive);

CREATE INDEX idx_verification_public_status
  ON verification_records(public_verification_id, current_status);

CREATE INDEX idx_audit_case_created
  ON audit_events(case_id, created_at, aggregate_sequence);

CREATE UNIQUE INDEX uq_audit_idempotency
  ON audit_events(case_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX uq_active_buyer_capability
  ON buyer_capabilities(case_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX uq_current_quote_per_case
  ON quotes(case_id)
  WHERE status = 'current';

CREATE UNIQUE INDEX uq_active_policy_per_workspace
  ON pricing_policy_versions(workspace_id)
  WHERE status = 'active';

CREATE TRIGGER prevent_request_submission_update
BEFORE UPDATE ON request_submissions
BEGIN
  SELECT RAISE(ABORT, 'request_submissions are immutable');
END;

CREATE TRIGGER prevent_extraction_attempt_update_after_completion
BEFORE UPDATE ON extraction_attempts
WHEN OLD.status IN ('completed', 'failed')
BEGIN
  SELECT RAISE(ABORT, 'completed extraction attempts are immutable');
END;

CREATE TRIGGER prevent_field_observation_update
BEFORE UPDATE ON field_observations
BEGIN
  SELECT RAISE(ABORT, 'field_observations are immutable');
END;

CREATE TRIGGER prevent_terms_version_update
BEFORE UPDATE ON terms_versions
BEGIN
  SELECT RAISE(ABORT, 'terms_versions are immutable');
END;

CREATE TRIGGER prevent_pricing_policy_content_update
BEFORE UPDATE ON pricing_policy_versions
WHEN
  OLD.pricing_policy_id != NEW.pricing_policy_id
  OR OLD.workspace_id != NEW.workspace_id
  OR OLD.version_number != NEW.version_number
  OR OLD.policy_name != NEW.policy_name
  OR OLD.currency != NEW.currency
  OR OLD.rules_json != NEW.rules_json
  OR OLD.policy_hash != NEW.policy_hash
  OR OLD.created_at != NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'pricing policy version content is immutable');
END;

CREATE TRIGGER prevent_quote_content_update
BEFORE UPDATE ON quotes
WHEN
  OLD.quote_id != NEW.quote_id
  OR OLD.case_id != NEW.case_id
  OR OLD.quote_version_number != NEW.quote_version_number
  OR OLD.terms_version_id != NEW.terms_version_id
  OR OLD.pricing_policy_id != NEW.pricing_policy_id
  OR OLD.pricing_policy_version != NEW.pricing_policy_version
  OR OLD.amount_cents != NEW.amount_cents
  OR OLD.currency != NEW.currency
  OR OLD.calculation_hash != NEW.calculation_hash
  OR OLD.created_at != NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'quote content is immutable');
END;

CREATE TRIGGER prevent_quote_line_update
BEFORE UPDATE ON quote_lines
BEGIN
  SELECT RAISE(ABORT, 'quote_lines are immutable');
END;

CREATE TRIGGER prevent_creator_decision_update
BEFORE UPDATE ON creator_decisions
BEGIN
  SELECT RAISE(ABORT, 'creator_decisions are immutable');
END;

CREATE TRIGGER prevent_buyer_acceptance_update
BEFORE UPDATE ON buyer_acceptances
BEGIN
  SELECT RAISE(ABORT, 'buyer_acceptances are immutable');
END;

CREATE TRIGGER prevent_payment_evidence_update
BEFORE UPDATE ON payment_evidence
BEGIN
  SELECT RAISE(ABORT, 'payment_evidence is immutable');
END;

CREATE TRIGGER prevent_receipt_revision_update
BEFORE UPDATE ON receipt_revisions
BEGIN
  SELECT RAISE(ABORT, 'receipt_revisions are immutable');
END;

CREATE TRIGGER prevent_audit_event_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are immutable');
END;
