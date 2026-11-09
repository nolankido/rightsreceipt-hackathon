-- RightsReceipt deterministic judge seed and reset.
-- This script is idempotent when run inside one transaction after migrations.

PRAGMA defer_foreign_keys = ON;

DELETE FROM clarification_reviews;
DELETE FROM clarification_submissions;
DELETE FROM receipt_revisions;
DELETE FROM payment_evidence;
DELETE FROM webhook_inbox_events;
DELETE FROM permissions;
DELETE FROM invoice_bindings;
DELETE FROM payment_operations;
DELETE FROM buyer_acceptances;
DELETE FROM creator_decisions;
DELETE FROM quote_lines;
DELETE FROM quotes;
DELETE FROM terms_versions;
DELETE FROM clarification_answers;
DELETE FROM clarification_questions;
DELETE FROM clarification_rounds;
DELETE FROM field_observations;
DELETE FROM extraction_attempts;
DELETE FROM buyer_capabilities;
DELETE FROM request_submissions;
DELETE FROM audit_events;
DELETE FROM verification_records;
DELETE FROM licensing_cases;
DELETE FROM assets;
DELETE FROM demo_reset_epochs;
DELETE FROM creator_workspaces;
DELETE FROM pricing_policy_versions;

INSERT INTO creator_workspaces (
  workspace_id,
  display_name,
  mode,
  default_pricing_policy_id,
  default_pricing_policy_version,
  created_at,
  updated_at,
  row_version
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Maya Chen',
  'demo',
  NULL,
  NULL,
  '2026-10-25T12:00:00.000Z',
  '2026-10-25T12:00:00.000Z',
  1
);

INSERT INTO pricing_policy_versions (
  pricing_policy_id,
  workspace_id,
  version_number,
  policy_name,
  currency,
  rules_json,
  policy_hash,
  status,
  created_at
) VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  1,
  'Harbor demo policy',
  'USD',
  '{"currency":"USD","rules":[{"amount_cents":20000,"code":"base_commercial_digital"},{"amount_cents":10000,"code":"paid_social"},{"amount_cents":2500,"code":"territory_us"},{"amount_cents":2500,"code":"territory_ca"},{"amount_cents":5000,"code":"territory_us_ca"},{"amount_cents":2500,"code":"duration_1_30"},{"amount_cents":5000,"code":"duration_31_90"},{"amount_cents":10000,"code":"duration_91_180"},{"amount_cents":17500,"code":"duration_181_365"},{"amount_cents":2500,"code":"crop_only"},{"amount_cents":0,"code":"none"}],"version":1}',
  '33d8c85a963b9b12c1dc61bc5f3d6dd8ae186a8bef47f5ac4a6c1ccc10163916',
  'active',
  '2026-10-25T12:00:00.000Z'
);

UPDATE creator_workspaces
SET
  default_pricing_policy_id = '00000000-0000-4000-8000-000000000002',
  default_pricing_policy_version = 1
WHERE workspace_id = '00000000-0000-4000-8000-000000000001';

INSERT INTO assets (
  asset_id,
  workspace_id,
  title,
  asset_type,
  creator_display_name,
  provenance_note,
  fingerprint_algorithm,
  fingerprint_value,
  preview_reference,
  availability,
  created_at,
  updated_at,
  row_version
) VALUES (
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  'Harbor After Rain',
  'photograph',
  'Maya Chen',
  'Project-owned demonstration image for the RightsReceipt hackathon entry. The fingerprint identifies this seeded representation only and does not prove ownership.',
  'sha256',
  'aeae6d66d7b96a628239e1802ee5e0cd180ddccc6cc924f8fb125f9da5db0345',
  '/demo/harbor-after-rain.svg',
  'active',
  '2026-10-25T12:00:00.000Z',
  '2026-10-25T12:00:00.000Z',
  1
);

INSERT INTO demo_reset_epochs (
  reset_epoch,
  seed_version,
  schema_version,
  reset_at,
  fixture_manifest_json,
  seed_hash
) VALUES (
  1,
  'harbor-after-rain-v1',
  9,
  '2026-10-25T12:00:00.000Z',
  '{"asset":{"title":"Harbor After Rain","type":"photograph"},"buyer":{"email":"jordan@example.test","name":"Jordan Lee","organization":"Cedar & Tide Travel"},"creator":{"display_name":"Maya Chen"},"expected_quote_cents":42500,"request":"We would like to use Harbor After Rain in paid Instagram and Facebook ads in the United States and Canada for about three months. We expect around 500,000 impressions and may crop it for vertical formats.","scenario":"harbor-after-rain","transaction_records_seeded":0}',
  'd8a3738ede3a49f7eace625f6cbe2574af719699aaf7fbf22820bc7d9a647d37'
);
