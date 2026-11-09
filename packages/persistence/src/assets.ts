import type {
  CreatorAssetRepositoryPort,
  CreatorWorkspaceRepositoryPort,
  PricingPolicyAssignment,
  PricingPolicyAssignmentPort,
} from "@rightsreceipt/application";
import type { AssetRecord, WorkspaceRecord } from "@rightsreceipt/domain";
import type { D1DatabasePort } from "./ports";

interface WorkspaceRow {
  workspace_id: string;
  display_name: string;
  mode: "demo";
  default_pricing_policy_id: string | null;
  default_pricing_policy_version: number | null;
  created_at: string;
  updated_at: string;
  row_version: number;
}

interface AssetRow {
  asset_id: string;
  workspace_id: string;
  title: string;
  asset_type: "photograph" | "illustration";
  creator_display_name: string;
  provenance_note: string;
  fingerprint_algorithm: "sha256";
  fingerprint_value: string;
  preview_reference: string;
  availability: "active" | "archived";
  created_at: string;
  updated_at: string;
  row_version: number;
}

interface PricingPolicyAssignmentRow {
  pricing_policy_id: string;
  version_number: number;
  policy_name: string;
  currency: "USD";
}

interface CountRow {
  count: number;
}

function mapWorkspace(row: WorkspaceRow): WorkspaceRecord {
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

function mapAsset(row: AssetRow): AssetRecord {
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

export function createD1WorkspaceRepository(
  database: D1DatabasePort,
): CreatorWorkspaceRepositoryPort {
  return {
    async getDemoWorkspace() {
      const row = await database
        .prepare<WorkspaceRow>(
          `SELECT workspace_id, display_name, mode, default_pricing_policy_id,
                  default_pricing_policy_version, created_at, updated_at, row_version
           FROM creator_workspaces
           WHERE mode = 'demo'
           ORDER BY created_at
           LIMIT 1`,
        )
        .first<WorkspaceRow>();
      return row ? mapWorkspace(row) : null;
    },
  };
}

export function createD1AssetRepository(
  database: D1DatabasePort,
): CreatorAssetRepositoryPort {
  return {
    async getById(assetId) {
      const row = await database
        .prepare<AssetRow>(
          `SELECT asset_id, workspace_id, title, asset_type, creator_display_name,
                  provenance_note, fingerprint_algorithm, fingerprint_value,
                  preview_reference, availability, created_at, updated_at, row_version
           FROM assets
           WHERE asset_id = ?`,
        )
        .bind(assetId)
        .first<AssetRow>();
      return row ? mapAsset(row) : null;
    },

    async listByWorkspace(workspaceId) {
      const result = await database
        .prepare<AssetRow>(
          `SELECT asset_id, workspace_id, title, asset_type, creator_display_name,
                  provenance_note, fingerprint_algorithm, fingerprint_value,
                  preview_reference, availability, created_at, updated_at, row_version
           FROM assets
           WHERE workspace_id = ?
           ORDER BY created_at, title`,
        )
        .bind(workspaceId)
        .all();
      return (result.results ?? []).map(mapAsset);
    },

    async insert(record) {
      const result = await database
        .prepare(
          `INSERT INTO assets (
             asset_id, workspace_id, title, asset_type, creator_display_name,
             provenance_note, fingerprint_algorithm, fingerprint_value,
             preview_reference, availability, created_at, updated_at, row_version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
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
        )
        .run();

      if (!result.success) {
        throw new Error("Asset metadata could not be persisted.");
      }
    },

    async countCases(assetId) {
      const row = await database
        .prepare<CountRow>(
          "SELECT COUNT(*) AS count FROM licensing_cases WHERE asset_id = ?",
        )
        .bind(assetId)
        .first<CountRow>();
      return Number(row?.count ?? 0);
    },
  };
}

export function createD1PricingPolicyAssignmentRepository(
  database: D1DatabasePort,
): PricingPolicyAssignmentPort {
  return {
    async getActiveAssignment(pricingPolicyId, versionNumber) {
      const row = await database
        .prepare<PricingPolicyAssignmentRow>(
          `SELECT pricing_policy_id, version_number, policy_name, currency
           FROM pricing_policy_versions
           WHERE pricing_policy_id = ? AND version_number = ? AND status = 'active'`,
        )
        .bind(pricingPolicyId, versionNumber)
        .first<PricingPolicyAssignmentRow>();

      if (!row) return null;
      const assignment: PricingPolicyAssignment = {
        pricingPolicyId: row.pricing_policy_id,
        versionNumber: row.version_number,
        policyName: row.policy_name,
        currency: row.currency,
      };
      return assignment;
    },
  };
}
