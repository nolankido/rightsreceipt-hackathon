import type {
  BuyerRequestPersistencePort,
} from "@rightsreceipt/application";
import type {
  AssetRecord,
  BuyerCapabilityAction,
  BuyerCapabilityRecord,
  BuyerRequestSubmissionRecord,
  LicensingCaseDraftRecord,
} from "@rightsreceipt/domain";
import type { D1DatabasePort } from "./ports";

interface BuyerRequestContextRow {
  case_id: string;
  request_submission_id: string | null;
  allowed_actions_json: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
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
  asset_created_at: string;
  asset_updated_at: string;
  asset_row_version: number;
}

function mapAsset(row: BuyerRequestContextRow): AssetRecord {
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
    createdAt: row.asset_created_at,
    updatedAt: row.asset_updated_at,
    rowVersion: row.asset_row_version,
  };
}

function parseAllowedActions(value: string): readonly BuyerCapabilityAction[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (action): action is BuyerCapabilityAction =>
      action === "submit_request"
      || action === "clarify"
      || action === "review"
      || action === "receipt",
  );
}

export function createD1BuyerRequestRepository(
  database: D1DatabasePort,
): BuyerRequestPersistencePort {
  return {
    async createRequestLink(licensingCase, capability) {
      const statements = [
        database
          .prepare(
            `INSERT INTO licensing_cases (
               case_id, workspace_id, asset_id, case_outcome,
               created_at, updated_at, row_version
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            licensingCase.caseId,
            licensingCase.workspaceId,
            licensingCase.assetId,
            licensingCase.caseOutcome,
            licensingCase.createdAt,
            licensingCase.updatedAt,
            licensingCase.rowVersion,
          ),
        database
          .prepare(
            `INSERT INTO buyer_capabilities (
               buyer_capability_id, case_id, token_digest_sha256,
               allowed_actions_json, issued_at, expires_at, revoked_at,
               rotation_number
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            capability.buyerCapabilityId,
            capability.caseId,
            capability.tokenDigestSha256,
            JSON.stringify(capability.allowedActions),
            capability.issuedAt,
            capability.expiresAt,
            capability.revokedAt,
            capability.rotationNumber,
          ),
      ];
      const results = await database.batch(statements);
      if (results.some((result) => !result.success)) {
        throw new Error("Buyer request link could not be persisted.");
      }
    },

    async findByCapabilityDigest(tokenDigestSha256) {
      const row = await database
        .prepare<BuyerRequestContextRow>(
          `SELECT
             lc.case_id,
             lc.request_submission_id,
             bc.allowed_actions_json,
             bc.issued_at,
             bc.expires_at,
             bc.revoked_at,
             a.asset_id,
             a.workspace_id,
             a.title,
             a.asset_type,
             a.creator_display_name,
             a.provenance_note,
             a.fingerprint_algorithm,
             a.fingerprint_value,
             a.preview_reference,
             a.availability,
             a.created_at AS asset_created_at,
             a.updated_at AS asset_updated_at,
             a.row_version AS asset_row_version
           FROM buyer_capabilities bc
           JOIN licensing_cases lc ON lc.case_id = bc.case_id
           JOIN assets a ON a.asset_id = lc.asset_id
           WHERE bc.token_digest_sha256 = ?
           LIMIT 1`,
        )
        .bind(tokenDigestSha256)
        .first<BuyerRequestContextRow>();

      if (!row) return null;
      return {
        caseId: row.case_id,
        asset: mapAsset(row),
        allowedActions: parseAllowedActions(row.allowed_actions_json),
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        requestSubmissionId: row.request_submission_id,
      };
    },

    async submitRequest(record) {
      const statements = [
        database
          .prepare(
            `INSERT INTO request_submissions (
               request_submission_id, case_id, buyer_name, buyer_organization,
               buyer_email, intended_use_text, normalized_text,
               consent_copy_version, consent_acknowledged, submitted_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            record.requestSubmissionId,
            record.caseId,
            record.buyerName,
            record.buyerOrganization,
            record.buyerEmail,
            record.intendedUseText,
            record.normalizedText,
            record.consentCopyVersion,
            record.consentAcknowledged ? 1 : 0,
            record.submittedAt,
          ),
        database
          .prepare(
            `UPDATE licensing_cases
             SET request_submission_id = ?, updated_at = ?, row_version = row_version + 1
             WHERE case_id = ? AND request_submission_id IS NULL`,
          )
          .bind(record.requestSubmissionId, record.submittedAt, record.caseId),
      ];
      const results = await database.batch(statements);
      if (results.some((result) => !result.success)) {
        throw new Error("Buyer request could not be persisted.");
      }
    },
  };
}

export type {
  BuyerCapabilityRecord,
  BuyerRequestSubmissionRecord,
  LicensingCaseDraftRecord,
};
