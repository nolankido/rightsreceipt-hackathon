-- Lease-fenced fresh reads. No raw provider bodies, secrets or automatic licenses.
ALTER TABLE paypal_reconciliation_outbox ADD COLUMN lease_token TEXT;
ALTER TABLE paypal_reconciliation_outbox ADD COLUMN lease_expires_at TEXT;
ALTER TABLE paypal_reconciliation_outbox ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5);
ALTER TABLE paypal_reconciliation_outbox ADD COLUMN attempt_generation INTEGER NOT NULL DEFAULT 0 CHECK(attempt_generation>=0);
ALTER TABLE paypal_reconciliation_outbox ADD COLUMN next_attempt_at TEXT;
ALTER TABLE paypal_reconciliation_outbox ADD COLUMN last_error_code TEXT;
ALTER TABLE paypal_reconciliation_outbox ADD COLUMN blocked_code TEXT;
ALTER TABLE paypal_reconciliation_outbox ADD COLUMN last_success_at TEXT;
CREATE TABLE paypal_reconciliation_receipts (
  reconciliation_receipt_id TEXT PRIMARY KEY CHECK(length(reconciliation_receipt_id)=36),
  invoice_binding_id TEXT NOT NULL REFERENCES invoice_bindings(invoice_binding_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL CHECK(generation>=1),
  provider_invoice_id TEXT NOT NULL CHECK(provider_invoice_id GLOB 'INV2-*'),
  provider_status TEXT NOT NULL CHECK(length(provider_status) BETWEEN 1 AND 40),
  local_invoice_status TEXT NOT NULL CHECK(local_invoice_status IN ('create_pending','draft','send_pending','sent','paid','canceled','fully_refunded','reconciliation_required')),
  reason_code TEXT NOT NULL CHECK(reason_code IN ('current_provider_state','financial_review_required','uncertain_provider_state','state_regression_blocked')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000),
  currency TEXT NOT NULL CHECK(currency='USD'),
  safe_payment_url TEXT,
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE(invoice_binding_id,generation)
) STRICT;
CREATE TRIGGER paypal_reconciliation_receipt_immutable BEFORE UPDATE ON paypal_reconciliation_receipts
BEGIN SELECT RAISE(ABORT,'reconciliation receipts are immutable'); END;
CREATE INDEX idx_reconciliation_ready ON paypal_reconciliation_outbox(blocked_code,next_attempt_at,lease_expires_at);
