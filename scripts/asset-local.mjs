import { randomUUID } from "node:crypto";
import {
  AssetRegistrationError,
  SAFE_ASSET_PREVIEWS,
  createAssetRecord,
} from "../packages/domain/src/assets.ts";

function mapWorkspace(row) {
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    displayName: row.display_name,
    mode: row.mode,
    defaultPricingPolicyId: row.default_pricing_policy_id,
    defaultPricingPolicyVersion: row.default_pricing_policy_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

function mapAsset(row) {
  if (!row) return null;
  return {
    assetId: row.asset_id,
    workspaceId: row.workspace_id,
    title: row.title,
    assetType: row.asset_type,
    creatorDisplayName: row.creator_display_name,
    provenanceNote: row.provenance_note,
    fingerprintAlgorithm: row.fingerprint_algorithm,
    fingerprintValue: row.fingerprint_value,
    previewReference: row.preview_reference,
    availability: row.availability,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

export function getCreatorWorkspaceView(database) {
  const workspace = mapWorkspace(
    database
      .prepare(
        `SELECT workspace_id, display_name, mode, default_pricing_policy_id,
                default_pricing_policy_version, created_at, updated_at, row_version
         FROM creator_workspaces
         WHERE mode = 'demo'
         ORDER BY created_at
         LIMIT 1`,
      )
      .get(),
  );

  if (!workspace) {
    throw new Error("The seeded creator workspace is unavailable.");
  }

  const assets = database
    .prepare(
      `SELECT asset_id, workspace_id, title, asset_type, creator_display_name,
              provenance_note, fingerprint_algorithm, fingerprint_value,
              preview_reference, availability, created_at, updated_at, row_version
       FROM assets
       WHERE workspace_id = ?
       ORDER BY created_at, title`,
    )
    .all(workspace.workspaceId)
    .map(mapAsset);

  const pricingPolicy = database
    .prepare(
      `SELECT pricing_policy_id, version_number, policy_name, currency
       FROM pricing_policy_versions
       WHERE pricing_policy_id = ? AND version_number = ?`,
    )
    .get(workspace.defaultPricingPolicyId, workspace.defaultPricingPolicyVersion);

  return {
    workspace,
    assets,
    pricingPolicy: pricingPolicy
      ? {
          pricingPolicyId: pricingPolicy.pricing_policy_id,
          versionNumber: pricingPolicy.version_number,
          policyName: pricingPolicy.policy_name,
          currency: pricingPolicy.currency,
        }
      : null,
    previewOptions: Object.values(SAFE_ASSET_PREVIEWS),
  };
}

export function getAssetDetail(database, assetId) {
  const asset = mapAsset(
    database
      .prepare(
        `SELECT asset_id, workspace_id, title, asset_type, creator_display_name,
                provenance_note, fingerprint_algorithm, fingerprint_value,
                preview_reference, availability, created_at, updated_at, row_version
         FROM assets
         WHERE asset_id = ?`,
      )
      .get(assetId),
  );

  if (!asset) return null;

  const relatedCases = database
    .prepare("SELECT COUNT(*) AS count FROM licensing_cases WHERE asset_id = ?")
    .get(assetId);

  return {
    asset,
    relatedCaseCount: Number(relatedCases.count),
    fingerprintNotice:
      "This fingerprint identifies the controlled demo representation. It does not prove ownership or authority to license.",
  };
}

export function registerAssetMetadata(database, input, options = {}) {
  const workspaceId = options.workspaceId
    ?? database
      .prepare("SELECT workspace_id FROM creator_workspaces WHERE mode = 'demo' LIMIT 1")
      .get()?.workspace_id;

  if (!workspaceId) {
    throw new Error("The seeded creator workspace is unavailable.");
  }

  const record = createAssetRecord(input, {
    assetId: options.assetId ?? randomUUID(),
    workspaceId,
    now: options.now ?? new Date().toISOString(),
  });

  database
    .prepare(
      `INSERT INTO assets (
         asset_id, workspace_id, title, asset_type, creator_display_name,
         provenance_note, fingerprint_algorithm, fingerprint_value,
         preview_reference, availability, created_at, updated_at, row_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.assetId,
      record.workspaceId,
      record.title,
      record.assetType,
      record.creatorDisplayName,
      record.provenanceNote,
      record.fingerprintAlgorithm,
      record.fingerprintValue,
      record.previewReference,
      record.availability,
      record.createdAt,
      record.updatedAt,
      record.rowVersion,
    );

  return getAssetDetail(database, record.assetId)?.asset ?? record;
}

export { AssetRegistrationError };
