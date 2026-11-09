-- Verified receipt metadata only. Raw bodies, signatures and PII are not stored.
ALTER TABLE webhook_inbox_events ADD COLUMN provider_invoice_id TEXT
  CHECK (provider_invoice_id IS NULL OR (provider_invoice_id GLOB 'INV2-*' AND length(provider_invoice_id) BETWEEN 8 AND 105));
ALTER TABLE webhook_inbox_events ADD COLUMN event_created_at TEXT;
ALTER TABLE webhook_inbox_events ADD COLUMN resource_status TEXT;
ALTER TABLE webhook_inbox_events ADD COLUMN verification_method TEXT
  CHECK (verification_method IS NULL OR verification_method = 'paypal_postback_v1');
CREATE INDEX idx_webhook_invoice_pending ON webhook_inbox_events(environment, provider_invoice_id, processing_status);
CREATE TRIGGER webhook_verified_receipt_immutable
BEFORE UPDATE ON webhook_inbox_events
WHEN OLD.verification_status = 'verified' AND (
  NEW.webhook_inbox_event_id IS NOT OLD.webhook_inbox_event_id OR
  NEW.provider IS NOT OLD.provider OR NEW.environment IS NOT OLD.environment OR
  NEW.provider_event_id IS NOT OLD.provider_event_id OR NEW.transmission_id IS NOT OLD.transmission_id OR
  NEW.event_type IS NOT OLD.event_type OR NEW.verification_status IS NOT OLD.verification_status OR
  NEW.payload_sha256 IS NOT OLD.payload_sha256 OR NEW.verified_headers_json IS NOT OLD.verified_headers_json OR
  NEW.received_at IS NOT OLD.received_at OR NEW.provider_invoice_id IS NOT OLD.provider_invoice_id OR
  NEW.event_created_at IS NOT OLD.event_created_at OR NEW.resource_status IS NOT OLD.resource_status OR
  NEW.verification_method IS NOT OLD.verification_method
)
BEGIN
  SELECT RAISE(ABORT, 'verified webhook receipt is immutable');
END;
