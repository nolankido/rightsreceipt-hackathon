-- RightsReceipt migration 0001
-- Initial relational schema for the frozen P0 domain contract.

PRAGMA foreign_keys = ON;

CREATE TABLE creator_workspaces (
  workspace_id TEXT PRIMARY KEY CHECK (length(workspace_id) = 36),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  mode TEXT NOT NULL CHECK (mode IN ('demo')),
  default_pricing_policy_id TEXT,
  default_pricing_policy_version INTEGER CHECK (default_pricing_policy_version IS NULL OR default_pricing_policy_version >= 1),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK (length(updated_at) >= 20),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  FOREIGN KEY (default_pricing_policy_id, default_pricing_policy_version)
    REFERENCES pricing_policy_versions(pricing_policy_id, version_number)
    ON UPDATE RESTRICT ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE assets (
  asset_id TEXT PRIMARY KEY CHECK (length(asset_id) = 36),
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('photograph', 'illustration')),
  creator_display_name TEXT NOT NULL CHECK (length(creator_display_name) BETWEEN 1 AND 120),
  provenance_note TEXT NOT NULL CHECK (length(provenance_note) BETWEEN 1 AND 2000),
  fingerprint_algorithm TEXT NOT NULL CHECK (fingerprint_algorithm IN ('sha256')),
  fingerprint_value TEXT NOT NULL CHECK (length(fingerprint_value) = 64),
  preview_reference TEXT NOT NULL CHECK (length(preview_reference) BETWEEN 1 AND 500),
  availability TEXT NOT NULL CHECK (availability IN ('active', 'archived')),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK (length(updated_at) >= 20),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  FOREIGN KEY (workspace_id) REFERENCES creator_workspaces(workspace_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) STRICT;

CREATE TABLE licensing_cases (
  case_id TEXT PRIMARY KEY CHECK (length(case_id) = 36),
  workspace_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  request_submission_id TEXT,
  case_outcome TEXT NOT NULL DEFAULT 'open' CHECK (case_outcome IN ('open', 'rejected', 'canceled')),
  latest_extraction_attempt_id TEXT,
  latest_terms_version_id TEXT,
  latest_quote_id TEXT,
  latest_creator_decision_id TEXT,
  latest_buyer_acceptance_id TEXT,
  invoice_binding_id TEXT,
  permission_id TEXT,
  verification_record_id TEXT,
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK (length(updated_at) >= 20),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  FOREIGN KEY (workspace_id) REFERENCES creator_workspaces(workspace_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (request_submission_id) REFERENCES request_submissions(request_submission_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  FOREIGN KEY (latest_extraction_attempt_id) REFERENCES extraction_attempts(extraction_attempt_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  FOREIGN KEY (latest_terms_version_id) REFERENCES terms_versions(terms_version_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  FOREIGN KEY (latest_quote_id) REFERENCES quotes(quote_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  FOREIGN KEY (latest_creator_decision_id) REFERENCES creator_decisions(creator_decision_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  FOREIGN KEY (latest_buyer_acceptance_id) REFERENCES buyer_acceptances(buyer_acceptance_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  FOREIGN KEY (invoice_binding_id) REFERENCES invoice_bindings(invoice_binding_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  FOREIGN KEY (verification_record_id) REFERENCES verification_records(verification_record_id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) STRICT;

CREATE TABLE request_submissions (
  request_submission_id TEXT PRIMARY KEY CHECK (length(request_submission_id) = 36),
  case_id TEXT NOT NULL UNIQUE,
  buyer_name TEXT NOT NULL CHECK (length(buyer_name) BETWEEN 2 AND 100),
  buyer_organization TEXT NOT NULL CHECK (length(buyer_organization) BETWEEN 2 AND 120),
  buyer_email TEXT NOT NULL CHECK (length(buyer_email) BETWEEN 3 AND 254),
  intended_use_text TEXT NOT NULL CHECK (length(intended_use_text) BETWEEN 40 AND 4000),
  normalized_text TEXT,
  consent_copy_version TEXT NOT NULL CHECK (length(consent_copy_version) BETWEEN 1 AND 80),
  consent_acknowledged INTEGER NOT NULL CHECK (consent_acknowledged IN (0, 1)),
  submitted_at TEXT NOT NULL CHECK (length(submitted_at) >= 20),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) STRICT;

CREATE TABLE buyer_capabilities (
  buyer_capability_id TEXT PRIMARY KEY CHECK (length(buyer_capability_id) = 36),
  case_id TEXT NOT NULL,
  token_digest_sha256 TEXT NOT NULL UNIQUE CHECK (length(token_digest_sha256) = 64),
  allowed_actions_json TEXT NOT NULL CHECK (json_valid(allowed_actions_json)),
  issued_at TEXT NOT NULL CHECK (length(issued_at) >= 20),
  expires_at TEXT NOT NULL CHECK (length(expires_at) >= 20),
  revoked_at TEXT,
  rotation_number INTEGER NOT NULL DEFAULT 1 CHECK (rotation_number >= 1),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) STRICT;

CREATE TABLE extraction_attempts (
  extraction_attempt_id TEXT PRIMARY KEY CHECK (length(extraction_attempt_id) = 36),
  case_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  extractor_version TEXT NOT NULL CHECK (length(extractor_version) BETWEEN 1 AND 120),
  model_id TEXT,
  model_version TEXT,
  artifact_hash TEXT CHECK (artifact_hash IS NULL OR length(artifact_hash) = 64),
  input_hash TEXT NOT NULL CHECK (length(input_hash) = 64),
  started_at TEXT NOT NULL CHECK (length(started_at) >= 20),
  completed_at TEXT,
  error_code TEXT,
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  UNIQUE (case_id, attempt_number)
) STRICT;

CREATE TABLE field_observations (
  field_observation_id TEXT PRIMARY KEY CHECK (length(field_observation_id) = 36),
  extraction_attempt_id TEXT NOT NULL,
  field_name TEXT NOT NULL CHECK (field_name IN (
    'use_purpose', 'channels', 'paid_advertising', 'territories', 'start_date',
    'duration_days', 'max_impressions', 'exclusivity', 'modification_scope',
    'attribution', 'sublicensing', 'ai_use'
  )),
  normalized_value_json TEXT CHECK (normalized_value_json IS NULL OR json_valid(normalized_value_json)),
  resolution_state TEXT NOT NULL CHECK (resolution_state IN ('resolved', 'unresolved', 'contradictory', 'unsupported')),
  provenance TEXT NOT NULL CHECK (provenance IN ('deterministic', 'model', 'human')),
  confidence_basis_points INTEGER CHECK (
    confidence_basis_points IS NULL OR confidence_basis_points BETWEEN 0 AND 10000
  ),
  evidence_start_utf16 INTEGER CHECK (evidence_start_utf16 IS NULL OR evidence_start_utf16 >= 0),
  evidence_end_utf16 INTEGER CHECK (evidence_end_utf16 IS NULL OR evidence_end_utf16 >= 0),
  evidence_text TEXT,
  resolver_version TEXT NOT NULL CHECK (length(resolver_version) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  FOREIGN KEY (extraction_attempt_id) REFERENCES extraction_attempts(extraction_attempt_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CHECK (
    (evidence_start_utf16 IS NULL AND evidence_end_utf16 IS NULL)
    OR (evidence_start_utf16 IS NOT NULL AND evidence_end_utf16 IS NOT NULL AND evidence_end_utf16 >= evidence_start_utf16)
  ),
  CHECK (
    provenance != 'human' OR confidence_basis_points IS NULL
  )
) STRICT;

CREATE TABLE clarification_rounds (
  clarification_round_id TEXT PRIMARY KEY CHECK (length(clarification_round_id) = 36),
  case_id TEXT NOT NULL,
  round_number INTEGER NOT NULL CHECK (round_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('open', 'answered', 'closed')),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  closed_at TEXT,
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  UNIQUE (case_id, round_number)
) STRICT;

CREATE TABLE clarification_questions (
  clarification_question_id TEXT PRIMARY KEY CHECK (length(clarification_question_id) = 36),
  clarification_round_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  question_order INTEGER NOT NULL CHECK (question_order >= 1),
  question_text TEXT NOT NULL CHECK (length(question_text) BETWEEN 1 AND 500),
  reason_code TEXT NOT NULL CHECK (reason_code IN ('missing', 'contradictory', 'unsupported', 'low_confidence')),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  FOREIGN KEY (clarification_round_id) REFERENCES clarification_rounds(clarification_round_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  UNIQUE (clarification_round_id, question_order)
) STRICT;

CREATE TABLE clarification_answers (
  clarification_answer_id TEXT PRIMARY KEY CHECK (length(clarification_answer_id) = 36),
  clarification_question_id TEXT NOT NULL UNIQUE,
  answer_text TEXT NOT NULL CHECK (length(answer_text) BETWEEN 1 AND 2000),
  answered_at TEXT NOT NULL CHECK (length(answered_at) >= 20),
  FOREIGN KEY (clarification_question_id) REFERENCES clarification_questions(clarification_question_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) STRICT;

CREATE TABLE terms_versions (
  terms_version_id TEXT PRIMARY KEY CHECK (length(terms_version_id) = 36),
  case_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('complete', 'incomplete', 'contradictory', 'unsupported')),
  use_purpose TEXT CHECK (use_purpose IS NULL OR use_purpose IN ('commercial')),
  channels_json TEXT CHECK (channels_json IS NULL OR json_valid(channels_json)),
  paid_advertising INTEGER CHECK (paid_advertising IS NULL OR paid_advertising IN (0, 1)),
  territories_json TEXT CHECK (territories_json IS NULL OR json_valid(territories_json)),
  start_date TEXT CHECK (start_date IS NULL OR length(start_date) = 10),
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 365),
  max_impressions INTEGER CHECK (max_impressions IS NULL OR max_impressions BETWEEN 1 AND 500000),
  exclusivity TEXT CHECK (exclusivity IS NULL OR exclusivity IN ('non_exclusive')),
  modification_scope TEXT CHECK (modification_scope IS NULL OR modification_scope IN ('none', 'crop_only')),
  attribution TEXT CHECK (attribution IS NULL OR attribution IN ('required', 'not_required')),
  sublicensing TEXT CHECK (sublicensing IS NULL OR sublicensing IN ('prohibited')),
  ai_use TEXT CHECK (ai_use IS NULL OR ai_use IN ('prohibited')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('extracted', 'human_corrected')),
  terms_hash TEXT NOT NULL CHECK (length(terms_hash) = 64),
  created_by_actor TEXT NOT NULL CHECK (created_by_actor IN ('system', 'creator', 'buyer')),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  UNIQUE (case_id, version_number),
  UNIQUE (case_id, terms_hash),
  CHECK (
    resolution_status != 'complete'
    OR (
      use_purpose IS NOT NULL AND channels_json IS NOT NULL AND paid_advertising = 1
      AND territories_json IS NOT NULL AND start_date IS NOT NULL
      AND duration_days IS NOT NULL AND max_impressions IS NOT NULL
      AND exclusivity IS NOT NULL AND modification_scope IS NOT NULL
      AND attribution IS NOT NULL AND sublicensing IS NOT NULL AND ai_use IS NOT NULL
    )
  )
) STRICT;

CREATE TABLE pricing_policy_versions (
  pricing_policy_id TEXT NOT NULL CHECK (length(pricing_policy_id) = 36),
  workspace_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  policy_name TEXT NOT NULL CHECK (length(policy_name) BETWEEN 1 AND 120),
  currency TEXT NOT NULL CHECK (currency IN ('USD')),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  policy_hash TEXT NOT NULL CHECK (length(policy_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  PRIMARY KEY (pricing_policy_id, version_number),
  FOREIGN KEY (workspace_id) REFERENCES creator_workspaces(workspace_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  UNIQUE (workspace_id, version_number, policy_hash)
) STRICT;

CREATE TABLE quotes (
  quote_id TEXT PRIMARY KEY CHECK (length(quote_id) = 36),
  case_id TEXT NOT NULL,
  quote_version_number INTEGER NOT NULL CHECK (quote_version_number >= 1),
  terms_version_id TEXT NOT NULL,
  pricing_policy_id TEXT NOT NULL,
  pricing_policy_version INTEGER NOT NULL CHECK (pricing_policy_version >= 1),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('USD')),
  status TEXT NOT NULL CHECK (status IN ('current', 'superseded')),
  calculation_hash TEXT NOT NULL CHECK (length(calculation_hash) = 64),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (terms_version_id) REFERENCES terms_versions(terms_version_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (pricing_policy_id, pricing_policy_version)
    REFERENCES pricing_policy_versions(pricing_policy_id, version_number)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (case_id, quote_version_number),
  UNIQUE (case_id, calculation_hash)
) STRICT;

CREATE TABLE quote_lines (
  quote_line_id TEXT PRIMARY KEY CHECK (length(quote_line_id) = 36),
  quote_id TEXT NOT NULL,
  line_position INTEGER NOT NULL CHECK (line_position >= 1),
  line_code TEXT NOT NULL CHECK (length(line_code) BETWEEN 1 AND 80),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 300),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  FOREIGN KEY (quote_id) REFERENCES quotes(quote_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  UNIQUE (quote_id, line_position),
  UNIQUE (quote_id, line_code)
) STRICT;

CREATE TABLE creator_decisions (
  creator_decision_id TEXT PRIMARY KEY CHECK (length(creator_decision_id) = 36),
  case_id TEXT NOT NULL,
  terms_version_id TEXT,
  quote_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'clarification_requested')),
  reason_text TEXT CHECK (reason_text IS NULL OR length(reason_text) <= 2000),
  actor_reference TEXT NOT NULL CHECK (length(actor_reference) BETWEEN 1 AND 120),
  decided_at TEXT NOT NULL CHECK (length(decided_at) >= 20),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (terms_version_id) REFERENCES terms_versions(terms_version_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (quote_id) REFERENCES quotes(quote_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    decision != 'approved' OR (terms_version_id IS NOT NULL AND quote_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE buyer_acceptances (
  buyer_acceptance_id TEXT PRIMARY KEY CHECK (length(buyer_acceptance_id) = 36),
  case_id TEXT NOT NULL,
  terms_version_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  creator_decision_id TEXT NOT NULL,
  acceptance_copy_version TEXT NOT NULL CHECK (length(acceptance_copy_version) BETWEEN 1 AND 80),
  accepted_at TEXT NOT NULL CHECK (length(accepted_at) >= 20),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (terms_version_id) REFERENCES terms_versions(terms_version_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (quote_id) REFERENCES quotes(quote_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (creator_decision_id) REFERENCES creator_decisions(creator_decision_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TABLE payment_operations (
  payment_operation_id TEXT PRIMARY KEY CHECK (length(payment_operation_id) = 36),
  case_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('create_invoice', 'send_invoice', 'retrieve_status', 'reconcile')),
  operation_key TEXT NOT NULL UNIQUE CHECK (length(operation_key) BETWEEN 16 AND 200),
  command_fingerprint TEXT NOT NULL CHECK (length(command_fingerprint) = 64),
  provider TEXT NOT NULL CHECK (provider IN ('paypal')),
  environment TEXT NOT NULL CHECK (environment IN ('simulated', 'sandbox')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'unknown')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_request_id TEXT,
  provider_reference TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK (length(updated_at) >= 20),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) STRICT;

CREATE TABLE invoice_bindings (
  invoice_binding_id TEXT PRIMARY KEY CHECK (length(invoice_binding_id) = 36),
  case_id TEXT NOT NULL UNIQUE,
  terms_version_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  buyer_acceptance_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('paypal')),
  environment TEXT NOT NULL CHECK (environment IN ('simulated', 'sandbox')),
  provider_invoice_id TEXT,
  safe_invoice_reference TEXT,
  invoice_status TEXT NOT NULL CHECK (invoice_status IN (
    'create_pending', 'draft', 'send_pending', 'sent', 'paid', 'canceled',
    'fully_refunded', 'reconciliation_required'
  )),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  sent_at TEXT,
  updated_at TEXT NOT NULL CHECK (length(updated_at) >= 20),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (terms_version_id) REFERENCES terms_versions(terms_version_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (quote_id) REFERENCES quotes(quote_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (buyer_acceptance_id) REFERENCES buyer_acceptances(buyer_acceptance_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (provider, environment, provider_invoice_id)
) STRICT;

CREATE TABLE webhook_inbox_events (
  webhook_inbox_event_id TEXT PRIMARY KEY CHECK (length(webhook_inbox_event_id) = 36),
  provider TEXT NOT NULL CHECK (provider IN ('paypal')),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox')),
  provider_event_id TEXT NOT NULL CHECK (length(provider_event_id) BETWEEN 1 AND 200),
  transmission_id TEXT,
  invoice_binding_id TEXT,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 160),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'rejected')),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('pending', 'processed', 'failed', 'duplicate')),
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  verified_headers_json TEXT NOT NULL CHECK (json_valid(verified_headers_json)),
  received_at TEXT NOT NULL CHECK (length(received_at) >= 20),
  processed_at TEXT,
  processing_error_code TEXT,
  FOREIGN KEY (invoice_binding_id) REFERENCES invoice_bindings(invoice_binding_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  UNIQUE (provider, environment, provider_event_id)
) STRICT;

CREATE TABLE payment_evidence (
  payment_evidence_id TEXT PRIMARY KEY CHECK (length(payment_evidence_id) = 36),
  invoice_binding_id TEXT NOT NULL,
  evidence_source TEXT NOT NULL CHECK (evidence_source IN ('verified_webhook', 'reconciliation', 'simulated_fixture')),
  source_reference TEXT NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 240),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('draft', 'sent', 'paid', 'canceled', 'fully_refunded')),
  amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency TEXT CHECK (currency IS NULL OR currency IN ('USD')),
  observed_at TEXT NOT NULL CHECK (length(observed_at) >= 20),
  evidence_hash TEXT NOT NULL UNIQUE CHECK (length(evidence_hash) = 64),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  FOREIGN KEY (invoice_binding_id) REFERENCES invoice_bindings(invoice_binding_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) STRICT;

CREATE TABLE permissions (
  permission_id TEXT PRIMARY KEY CHECK (length(permission_id) = 36),
  case_id TEXT NOT NULL UNIQUE,
  invoice_binding_id TEXT NOT NULL,
  terms_version_id TEXT NOT NULL,
  permission_state TEXT NOT NULL CHECK (permission_state IN ('scheduled', 'active', 'expired', 'refunded', 'revoked')),
  state_reason_code TEXT NOT NULL CHECK (length(state_reason_code) BETWEEN 1 AND 120),
  start_date TEXT NOT NULL CHECK (length(start_date) = 10),
  end_date_exclusive TEXT NOT NULL CHECK (length(end_date_exclusive) = 10),
  state_effective_at TEXT NOT NULL CHECK (length(state_effective_at) >= 20),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK (length(updated_at) >= 20),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (invoice_binding_id) REFERENCES invoice_bindings(invoice_binding_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (terms_version_id) REFERENCES terms_versions(terms_version_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (end_date_exclusive > start_date)
) STRICT;

CREATE TABLE verification_records (
  verification_record_id TEXT PRIMARY KEY CHECK (length(verification_record_id) = 36),
  case_id TEXT NOT NULL UNIQUE,
  public_verification_id TEXT NOT NULL UNIQUE CHECK (length(public_verification_id) BETWEEN 22 AND 128),
  current_status TEXT NOT NULL CHECK (current_status IN (
    'pending', 'scheduled', 'active', 'expired', 'canceled', 'rejected',
    'refunded', 'revoked', 'invalid'
  )),
  current_receipt_revision_id TEXT,
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK (length(updated_at) >= 20),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (current_receipt_revision_id) REFERENCES receipt_revisions(receipt_revision_id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) STRICT;

CREATE TABLE receipt_revisions (
  receipt_revision_id TEXT PRIMARY KEY CHECK (length(receipt_revision_id) = 36),
  verification_record_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  schema_version TEXT NOT NULL CHECK (length(schema_version) BETWEEN 1 AND 40),
  previous_revision_hash TEXT CHECK (previous_revision_hash IS NULL OR length(previous_revision_hash) = 64),
  canonical_payload_json TEXT NOT NULL CHECK (json_valid(canonical_payload_json)),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  FOREIGN KEY (verification_record_id) REFERENCES verification_records(verification_record_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (verification_record_id, revision_number),
  UNIQUE (verification_record_id, payload_hash),
  CHECK (
    (revision_number = 1 AND previous_revision_hash IS NULL)
    OR (revision_number > 1 AND previous_revision_hash IS NOT NULL)
  )
) STRICT;

CREATE TABLE audit_events (
  audit_event_id TEXT PRIMARY KEY CHECK (length(audit_event_id) = 36),
  case_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (length(aggregate_type) BETWEEN 1 AND 80),
  aggregate_id TEXT NOT NULL CHECK (length(aggregate_id) BETWEEN 1 AND 200),
  aggregate_sequence INTEGER NOT NULL CHECK (aggregate_sequence >= 1),
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 120),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'creator', 'buyer', 'paypal', 'clock')),
  actor_reference TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  correlation_id TEXT NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 120),
  idempotency_key TEXT,
  created_at TEXT NOT NULL CHECK (length(created_at) >= 20),
  FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  UNIQUE (case_id, aggregate_type, aggregate_id, aggregate_sequence)
) STRICT;

CREATE TABLE demo_reset_epochs (
  reset_epoch INTEGER PRIMARY KEY CHECK (reset_epoch >= 1),
  seed_version TEXT NOT NULL CHECK (length(seed_version) BETWEEN 1 AND 80),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  reset_at TEXT NOT NULL CHECK (length(reset_at) >= 20),
  fixture_manifest_json TEXT NOT NULL CHECK (json_valid(fixture_manifest_json)),
  seed_hash TEXT NOT NULL CHECK (length(seed_hash) = 64)
) STRICT;
