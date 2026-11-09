import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  BuyerRequestValidationError,
  createBuyerRequestLinkRecords,
  createBuyerRequestSubmissionRecord,
} from "../packages/domain/src/buyer-requests.ts";

export const SEEDED_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
export const SEEDED_ASSET_ID = "00000000-0000-4000-8000-000000000003";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function openRequestDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE creator_workspaces (
      workspace_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL
    ) STRICT;

    CREATE TABLE assets (
      asset_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      asset_type TEXT NOT NULL CHECK (asset_type IN ('photograph', 'illustration')),
      creator_display_name TEXT NOT NULL,
      provenance_note TEXT NOT NULL,
      fingerprint_algorithm TEXT NOT NULL CHECK (fingerprint_algorithm = 'sha256'),
      fingerprint_value TEXT NOT NULL CHECK (length(fingerprint_value) = 64),
      preview_reference TEXT NOT NULL,
      availability TEXT NOT NULL CHECK (availability IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES creator_workspaces(workspace_id)
    ) STRICT;

    CREATE TABLE licensing_cases (
      case_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      request_submission_id TEXT,
      case_outcome TEXT NOT NULL CHECK (case_outcome IN ('open', 'rejected', 'canceled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES creator_workspaces(workspace_id),
      FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
    ) STRICT;

    CREATE TABLE buyer_capabilities (
      buyer_capability_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      token_digest_sha256 TEXT NOT NULL UNIQUE,
      allowed_actions_json TEXT NOT NULL CHECK (json_valid(allowed_actions_json)),
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      rotation_number INTEGER NOT NULL,
      FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ) STRICT;

    CREATE TABLE request_submissions (
      request_submission_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL UNIQUE,
      buyer_name TEXT NOT NULL,
      buyer_organization TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      intended_use_text TEXT NOT NULL,
      normalized_text TEXT,
      consent_copy_version TEXT NOT NULL,
      consent_acknowledged INTEGER NOT NULL CHECK (consent_acknowledged IN (0, 1)),
      submitted_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ) STRICT;

    CREATE TRIGGER prevent_request_submission_update
    BEFORE UPDATE ON request_submissions
    BEGIN
      SELECT RAISE(ABORT, 'request_submissions are immutable');
    END;
  `);

  database
    .prepare("INSERT INTO creator_workspaces (workspace_id, display_name) VALUES (?, ?)")
    .run(SEEDED_WORKSPACE_ID, "Maya Chen");
  database
    .prepare(
      `INSERT INTO assets (
         asset_id, workspace_id, title, asset_type, creator_display_name,
         provenance_note, fingerprint_algorithm, fingerprint_value,
         preview_reference, availability, created_at, updated_at, row_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      SEEDED_ASSET_ID,
      SEEDED_WORKSPACE_ID,
      "Harbor After Rain",
      "photograph",
      "Maya Chen",
      "Project-owned demonstration image.",
      "sha256",
      "aeae6d66d7b96a628239e1802ee5e0cd180ddccc6cc924f8fb125f9da5db0345",
      "/demo/harbor-after-rain.svg",
      "active",
      "2026-10-25T12:00:00.000Z",
      "2026-10-25T12:00:00.000Z",
      1,
    );

  return database;
}

function mapAsset(row) {
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

export function getAsset(database, assetId) {
  const row = database
    .prepare(
      `SELECT asset_id, workspace_id, title, asset_type, creator_display_name,
              provenance_note, fingerprint_algorithm, fingerprint_value,
              preview_reference, availability, created_at, updated_at, row_version
       FROM assets WHERE asset_id = ?`,
    )
    .get(assetId);
  return row ? mapAsset(row) : null;
}

export function setAssetAvailability(database, assetId, availability) {
  database
    .prepare("UPDATE assets SET availability = ?, row_version = row_version + 1 WHERE asset_id = ?")
    .run(availability, assetId);
}

export function issueRequestLink(database, options = {}) {
  const assetId = options.assetId ?? SEEDED_ASSET_ID;
  const asset = getAsset(database, assetId);
  if (!asset) throw new Error("The requested asset does not exist.");

  const token = options.token ?? "A".repeat(43);
  const issuedAt = options.issuedAt ?? "2026-10-25T12:00:00.000Z";
  const expiresAt = options.expiresAt ?? "2026-11-01T12:00:00.000Z";
  const records = createBuyerRequestLinkRecords(asset, {
    caseId: options.caseId ?? "10000000-0000-4000-8000-000000000001",
    buyerCapabilityId:
      options.buyerCapabilityId ?? "10000000-0000-4000-8000-000000000002",
    tokenDigestSha256: sha256(token),
    issuedAt,
    expiresAt,
  });

  database.exec("BEGIN IMMEDIATE;");
  try {
    database
      .prepare(
        `INSERT INTO licensing_cases (
           case_id, workspace_id, asset_id, request_submission_id,
           case_outcome, created_at, updated_at, row_version
         ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
      )
      .run(
        records.licensingCase.caseId,
        records.licensingCase.workspaceId,
        records.licensingCase.assetId,
        records.licensingCase.caseOutcome,
        records.licensingCase.createdAt,
        records.licensingCase.updatedAt,
      records.licensingCase.rowVersion,
      );
    database
      .prepare(
        `INSERT INTO buyer_capabilities (
           buyer_capability_id, case_id, token_digest_sha256,
           allowed_actions_json, issued_at, expires_at, revoked_at,
           rotation_number
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        records.capability.buyerCapabilityId,
        records.capability.caseId,
        records.capability.tokenDigestSha256,
        JSON.stringify(records.capability.allowedActions),
      records.capability.issuedAt,
      records.capability.expiresAt,
      records.capability.revokedAt,
      records.capability.rotationNumber,
      );
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }

  return { token, ...records };
}

export function loadRequestContext(database, token) {
  const row = database
    .prepare(
      `SELECT lc.case_id, lc.request_submission_id, bc.allowed_actions_json,
              bc.issued_at, bc.expires_at, bc.revoked_at,
              a.asset_id, a.workspace_id, a.title, a.asset_type,
              a.creator_display_name, a.provenance_note,
              a.fingerprint_algorithm, a.fingerprint_value,
              a.preview_reference, a.availability,
              a.created_at, a.updated_at, a.row_version
       FROM buyer_capabilities bc
       JOIN licensing_cases lc ON lc.case_id = bc.case_id
       JOIN assets a ON a.asset_id = lc.asset_id
       WHERE bc.token_digest_sha256 = ?`,
    )
    .get(sha256(token));
  if (!row) return null;
  return {
    caseId: row.case_id,
    requestSubmissionId: row.request_submission_id,
    allowedActions: JSON.parse(row.allowed_actions_json),
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    asset: mapAsset(row),
  };
}

export function submitBuyerRequest(database, token, input, options = {}) {
  const context = loadRequestContext(database, token);
  if (!context) throw new Error("This buyer request link is invalid.");
  if (context.requestSubmissionId) throw new Error("This buyer link has already submitted.");
  if (context.asset.availability !== "active") {
    throw new Error("This asset is no longer available for requests.");
  }
  const record = createBuyerRequestSubmissionRecord(input, {
    requestSubmissionId: options.requestSubmissionId ?? randomUUID(),
    caseId: context.caseId,
    submittedAt: options.submittedAt ?? "2026-10-25T12:30:00.000Z",
  });

  database.exec("BEGIN IMMEDIATE;");
  try {
    database
      .prepare(
        `INSERT INTO request_submissions (
           request_submission_id, case_id, buyer_name, buyer_organization,
           buyer_email, intended_use_text, normalized_text,
           consent_copy_version, consent_acknowledged, submitted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      );
    const update = database
      .prepare(
        `UPDATE licensing_cases
         SET request_submission_id = ?, updated_at = ?, row_version = row_version + 1
         WHERE case_id = ? AND request_submission_id IS NULL`,
      )
      .run(record.requestSubmissionId, record.submittedAt, record.caseId);
    if (update.changes !== 1) throw new Error("Request case changed before submission.");
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }

  return record;
}

export function getStoredSubmission(database, caseId) {
  return database
    .prepare(
      `SELECT request_submission_id, case_id, buyer_name, buyer_organization,
              buyer_email, intended_use_text, normalized_text,
              consent_copy_version, consent_acknowledged, submitted_at
       FROM request_submissions WHERE case_id = ?`,
    )
    .get(caseId);
}

export function tableCounts(database) {
  return Object.fromEntries(
    ["licensing_cases", "buyer_capabilities", "request_submissions"].map((table) => [
      table,
      Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count),
    ]),
  );
}

export { BuyerRequestValidationError };
