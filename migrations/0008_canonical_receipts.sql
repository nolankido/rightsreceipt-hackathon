-- Immutable canonical receipts. Existing mock/historical rows stay untrusted until validated.
ALTER TABLE receipt_revisions ADD COLUMN material_sha256 TEXT CHECK(material_sha256 IS NULL OR length(material_sha256)=64);
ALTER TABLE receipt_revisions ADD COLUMN audit_root_sha256 TEXT CHECK(audit_root_sha256 IS NULL OR length(audit_root_sha256)=64);
CREATE TRIGGER canonical_receipt_chain_guard BEFORE INSERT ON receipt_revisions
WHEN NEW.schema_version='rightsreceipt-receipt-v1' AND (
  NEW.material_sha256 IS NULL OR NEW.audit_root_sha256 IS NULL
  OR NEW.revision_number != COALESCE((SELECT MAX(revision_number) FROM receipt_revisions
    WHERE verification_record_id=NEW.verification_record_id),0)+1
  OR NEW.previous_revision_hash IS NOT (SELECT payload_hash FROM receipt_revisions
    WHERE verification_record_id=NEW.verification_record_id ORDER BY revision_number DESC LIMIT 1)
  OR json_extract(NEW.canonical_payload_json,'$.receipt_chain_id') IS NOT NEW.verification_record_id
  OR json_extract(NEW.canonical_payload_json,'$.revision_number') IS NOT NEW.revision_number
  OR json_extract(NEW.canonical_payload_json,'$.previous_revision_hash') IS NOT NEW.previous_revision_hash
  OR json_extract(NEW.canonical_payload_json,'$.permission.permission_id') IS NOT NEW.permission_id
  OR json_extract(NEW.canonical_payload_json,'$.material_sha256') IS NOT NEW.material_sha256
  OR json_extract(NEW.canonical_payload_json,'$.audit_anchor.root_sha256') IS NOT NEW.audit_root_sha256
  OR json_extract(NEW.canonical_payload_json,'$.payment.environment') IS NOT 'sandbox'
)
BEGIN SELECT RAISE(ABORT,'canonical receipt chain or identity mismatch'); END;
