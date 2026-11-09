-- Adapter-private recovery evidence, not authoritative payment or permission state.
CREATE TABLE paypal_delivery_journal (
  request_id TEXT PRIMARY KEY CHECK(length(request_id) BETWEEN 8 AND 64),
  case_id TEXT NOT NULL UNIQUE REFERENCES licensing_cases(case_id) ON DELETE CASCADE,
  snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash) = 64),
  merchant_hash TEXT NOT NULL CHECK(length(merchant_hash) = 64),
  invoice_id TEXT UNIQUE,
  binding_json TEXT CHECK(binding_json IS NULL OR json_valid(binding_json)),
  send_state TEXT NOT NULL DEFAULT 'not_started'
    CHECK(send_state IN ('not_started', 'started', 'confirmed')),
  CHECK((invoice_id IS NULL AND binding_json IS NULL AND send_state = 'not_started')
    OR (invoice_id IS NOT NULL AND binding_json IS NOT NULL)),
  CHECK(binding_json IS NULL OR (
    json_extract(binding_json, '$.draft.invoiceId') IS invoice_id
    AND json_extract(binding_json, '$.draft.caseId') IS case_id
    AND json_extract(binding_json, '$.draft.environment') IS 'sandbox'
    AND json_extract(binding_json, '$.draft.mode') IS 'paypal_sandbox'
    AND json_extract(binding_json, '$.draft.provider') IS 'paypal'
    AND json_extract(binding_json, '$.draft.simulated') IS 0
    AND json_extract(binding_json, '$.draft.status') IS 'DRAFT'
    AND json_extract(binding_json, '$.draft.authoritativePaymentEvidence') IS 0))
) STRICT;
CREATE TRIGGER paypal_delivery_identity_immutable
BEFORE UPDATE ON paypal_delivery_journal
WHEN NEW.request_id IS NOT OLD.request_id OR NEW.case_id IS NOT OLD.case_id
  OR NEW.snapshot_hash IS NOT OLD.snapshot_hash OR NEW.merchant_hash IS NOT OLD.merchant_hash
  OR (OLD.binding_json IS NOT NULL AND
    (NEW.binding_json IS NOT OLD.binding_json OR NEW.invoice_id IS NOT OLD.invoice_id))
BEGIN SELECT RAISE(ABORT, 'Immutable Sandbox delivery identity'); END;
CREATE TRIGGER paypal_delivery_send_monotonic
BEFORE UPDATE OF send_state ON paypal_delivery_journal
WHEN (OLD.send_state = 'confirmed' AND NEW.send_state != 'confirmed')
  OR (OLD.send_state = 'started' AND NEW.send_state = 'not_started')
BEGIN SELECT RAISE(ABORT, 'Sandbox send state cannot regress'); END;
