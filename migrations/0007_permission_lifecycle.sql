-- Sandbox financial detail and canonical permission transitions, not public receipts.
ALTER TABLE permissions ADD COLUMN review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN (0,1));
CREATE TABLE paypal_lifecycle_observations (
  observation_id TEXT PRIMARY KEY CHECK(length(observation_id)=36),
  invoice_binding_id TEXT NOT NULL REFERENCES invoice_bindings(invoice_binding_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL CHECK(generation>0),
  provider_status TEXT NOT NULL,
  conclusion TEXT NOT NULL CHECK(conclusion IN ('paid','fully_refunded','canceled','unpaid','review_required')),
  reason_code TEXT NOT NULL,
  paid_cents INTEGER CHECK(paid_cents IS NULL OR paid_cents>=0),
  refunded_cents INTEGER CHECK(refunded_cents IS NULL OR refunded_cents>=0),
  detail_sha256 TEXT NOT NULL CHECK(length(detail_sha256)=64),
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE(invoice_binding_id,generation)
) STRICT;
CREATE TRIGGER paypal_lifecycle_observation_immutable BEFORE UPDATE ON paypal_lifecycle_observations
BEGIN SELECT RAISE(ABORT,'lifecycle observations are immutable'); END;
CREATE TRIGGER permission_lifecycle_guard BEFORE UPDATE ON permissions
WHEN NEW.permission_id IS NOT OLD.permission_id OR NEW.case_id IS NOT OLD.case_id
  OR NEW.invoice_binding_id IS NOT OLD.invoice_binding_id OR NEW.terms_version_id IS NOT OLD.terms_version_id
  OR NEW.start_date IS NOT OLD.start_date OR NEW.end_date_exclusive IS NOT OLD.end_date_exclusive
  OR (OLD.permission_state IN ('expired','refunded','revoked') AND NEW.permission_state IN ('scheduled','active'))
  OR (OLD.permission_state IN ('refunded','revoked') AND NEW.permission_state IS NOT OLD.permission_state)
BEGIN SELECT RAISE(ABORT,'permission identity or terminal state cannot change'); END;
