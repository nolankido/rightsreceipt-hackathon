-- Transactional notification handling only. These tables confer no payment authority.
CREATE TABLE paypal_webhook_projections (
  invoice_binding_id TEXT PRIMARY KEY REFERENCES invoice_bindings(invoice_binding_id) ON DELETE CASCADE,
  provider_invoice_id TEXT NOT NULL CHECK (provider_invoice_id GLOB 'INV2-*'),
  signal_mask INTEGER NOT NULL CHECK (signal_mask BETWEEN 0 AND 255),
  last_event_created_at TEXT NOT NULL,
  last_provider_event_id TEXT NOT NULL,
  last_resource_status TEXT,
  row_version INTEGER NOT NULL CHECK (row_version >= 1),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE paypal_webhook_processing_receipts (
  processing_receipt_id TEXT PRIMARY KEY CHECK (length(processing_receipt_id) = 36),
  webhook_inbox_event_id TEXT NOT NULL UNIQUE REFERENCES webhook_inbox_events(webhook_inbox_event_id) ON DELETE CASCADE,
  invoice_binding_id TEXT NOT NULL REFERENCES invoice_bindings(invoice_binding_id) ON DELETE CASCADE,
  source_payload_sha256 TEXT NOT NULL CHECK (length(source_payload_sha256) = 64),
  projection_version INTEGER NOT NULL CHECK (projection_version >= 1),
  outcome TEXT NOT NULL CHECK (outcome = 'queued_reconciliation'),
  processed_at TEXT NOT NULL
) STRICT;
CREATE TABLE paypal_reconciliation_outbox (
  invoice_binding_id TEXT PRIMARY KEY REFERENCES invoice_bindings(invoice_binding_id) ON DELETE CASCADE,
  requested_generation INTEGER NOT NULL CHECK (requested_generation >= 1),
  completed_generation INTEGER NOT NULL DEFAULT 0 CHECK (completed_generation >= 0 AND completed_generation <= requested_generation),
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_reconciliation_pending ON paypal_reconciliation_outbox(completed_generation, requested_generation);
CREATE TRIGGER webhook_processing_receipt_immutable BEFORE UPDATE ON paypal_webhook_processing_receipts
BEGIN SELECT RAISE(ABORT, 'webhook processing receipts are immutable'); END;
CREATE TRIGGER webhook_projection_monotonic BEFORE UPDATE ON paypal_webhook_projections
WHEN NEW.invoice_binding_id IS NOT OLD.invoice_binding_id OR NEW.provider_invoice_id IS NOT OLD.provider_invoice_id
  OR NEW.row_version != OLD.row_version + 1 OR (NEW.signal_mask | OLD.signal_mask) != NEW.signal_mask
  OR NEW.last_event_created_at < OLD.last_event_created_at
  OR (NEW.last_event_created_at = OLD.last_event_created_at AND NEW.last_provider_event_id < OLD.last_provider_event_id)
BEGIN SELECT RAISE(ABORT, 'webhook projection cannot regress'); END;
CREATE TRIGGER webhook_outbox_monotonic BEFORE UPDATE ON paypal_reconciliation_outbox
WHEN NEW.invoice_binding_id IS NOT OLD.invoice_binding_id OR NEW.requested_generation < OLD.requested_generation
  OR NEW.completed_generation < OLD.completed_generation
BEGIN SELECT RAISE(ABORT, 'reconciliation generation cannot regress'); END;
CREATE TRIGGER webhook_processed_receipt_stable BEFORE UPDATE ON webhook_inbox_events
WHEN OLD.processing_status = 'processed' AND (
  NEW.processing_status IS NOT OLD.processing_status OR NEW.invoice_binding_id IS NOT OLD.invoice_binding_id
  OR NEW.processed_at IS NOT OLD.processed_at OR NEW.processing_error_code IS NOT OLD.processing_error_code)
BEGIN SELECT RAISE(ABORT, 'processed webhook cannot reopen'); END;
