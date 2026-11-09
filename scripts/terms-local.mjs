import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  RIGHTS_FIELD_NAMES,
  createManualTermsRevision,
  emptyRightsFieldViews,
  manualRightsReviewCanonicalJson,
  rightsFieldViewsFromObservations,
} from "../packages/domain/src/rights-terms.ts";

export const SEEDED_CASE_ID = "10000000-0000-4000-8000-000000000001";
export const SEEDED_ASSET_ID = "00000000-0000-4000-8000-000000000003";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function completeManualReview(overrides = {}) {
  return {
    fields: {
      use_purpose: { state: "resolved", value: "commercial" },
      channels: {
        state: "resolved",
        value: ["instagram_paid", "facebook_paid"],
      },
      paid_advertising: { state: "resolved", value: true },
      territories: { state: "resolved", value: ["US", "CA"] },
      start_date: { state: "resolved", value: "2026-11-01" },
      duration_days: { state: "resolved", value: 90 },
      max_impressions: { state: "resolved", value: 500000 },
      exclusivity: { state: "resolved", value: "non_exclusive" },
      modification_scope: { state: "resolved", value: "crop_only" },
      attribution: { state: "resolved", value: "not_required" },
      sublicensing: { state: "resolved", value: "prohibited" },
      ai_use: { state: "resolved", value: "prohibited" },
      ...overrides,
    },
  };
}

export function openTermsDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE assets (
      asset_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      creator_display_name TEXT NOT NULL,
      provenance_note TEXT NOT NULL,
      fingerprint_algorithm TEXT NOT NULL,
      fingerprint_value TEXT NOT NULL,
      preview_reference TEXT NOT NULL,
      availability TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE licensing_cases (
      case_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      request_submission_id TEXT NOT NULL,
      case_outcome TEXT NOT NULL,
      latest_extraction_attempt_id TEXT,
      latest_terms_version_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
    ) STRICT;

    CREATE TABLE request_submissions (
      request_submission_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL UNIQUE,
      buyer_name TEXT NOT NULL,
      buyer_organization TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      intended_use_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      consent_copy_version TEXT NOT NULL,
      consent_acknowledged INTEGER NOT NULL,
      submitted_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id)
    ) STRICT;

    CREATE TABLE extraction_attempts (
      extraction_attempt_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      extractor_version TEXT NOT NULL,
      model_id TEXT,
      model_version TEXT,
      artifact_hash TEXT,
      input_hash TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error_code TEXT,
      FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id),
      UNIQUE (case_id, attempt_number)
    ) STRICT;

    CREATE TABLE field_observations (
      field_observation_id TEXT PRIMARY KEY,
      extraction_attempt_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      normalized_value_json TEXT,
      resolution_state TEXT NOT NULL,
      provenance TEXT NOT NULL,
      confidence_basis_points INTEGER,
      evidence_start_utf16 INTEGER,
      evidence_end_utf16 INTEGER,
      evidence_text TEXT,
      resolver_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (extraction_attempt_id) REFERENCES extraction_attempts(extraction_attempt_id)
    ) STRICT;

    CREATE TABLE terms_versions (
      terms_version_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      resolution_status TEXT NOT NULL,
      use_purpose TEXT,
      channels_json TEXT,
      paid_advertising INTEGER,
      territories_json TEXT,
      start_date TEXT,
      duration_days INTEGER,
      max_impressions INTEGER,
      exclusivity TEXT,
      modification_scope TEXT,
      attribution TEXT,
      sublicensing TEXT,
      ai_use TEXT,
      source_kind TEXT NOT NULL,
      terms_hash TEXT NOT NULL,
      created_by_actor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id),
      UNIQUE (case_id, version_number),
      UNIQUE (case_id, terms_hash)
    ) STRICT;

    CREATE TABLE audit_events (
      audit_event_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      aggregate_sequence INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_reference TEXT,
      payload_json TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      idempotency_key TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES licensing_cases(case_id),
      UNIQUE (case_id, aggregate_type, aggregate_id, aggregate_sequence),
      UNIQUE (case_id, idempotency_key)
    ) STRICT;

    CREATE TRIGGER prevent_terms_version_update
    BEFORE UPDATE ON terms_versions
    BEGIN
      SELECT RAISE(ABORT, 'terms_versions are immutable');
    END;

    CREATE TRIGGER prevent_field_observation_update
    BEFORE UPDATE ON field_observations
    BEGIN
      SELECT RAISE(ABORT, 'field_observations are immutable');
    END;
  `);

  database.prepare(
    `INSERT INTO assets (
       asset_id, workspace_id, title, asset_type, creator_display_name,
       provenance_note, fingerprint_algorithm, fingerprint_value,
       preview_reference, availability, created_at, updated_at, row_version
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    SEEDED_ASSET_ID,
    "00000000-0000-4000-8000-000000000001",
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

  database.prepare(
    `INSERT INTO licensing_cases (
       case_id, workspace_id, asset_id, request_submission_id, case_outcome,
       created_at, updated_at, row_version
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    SEEDED_CASE_ID,
    "00000000-0000-4000-8000-000000000001",
    SEEDED_ASSET_ID,
    "10000000-0000-4000-8000-000000000003",
    "open",
    "2026-10-25T12:00:00.000Z",
    "2026-10-25T12:30:00.000Z",
    2,
  );

  const intendedUseText =
    "We would like to use Harbor After Rain in paid Instagram and Facebook ads in the United States and Canada for ninety days. We expect 500,000 impressions and may crop it for vertical formats.";
  database.prepare(
    `INSERT INTO request_submissions (
       request_submission_id, case_id, buyer_name, buyer_organization,
       buyer_email, intended_use_text, normalized_text,
       consent_copy_version, consent_acknowledged, submitted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "10000000-0000-4000-8000-000000000003",
    SEEDED_CASE_ID,
    "Jordan Lee",
    "Cedar & Tide Travel",
    "jordan@example.test",
    intendedUseText,
    intendedUseText,
    "buyer-request-v1",
    1,
    "2026-10-25T12:30:00.000Z",
  );

  return database;
}

function uuid(index) {
  return `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function nextVersion(database, caseId) {
  const row = database
    .prepare(
      `SELECT COALESCE(MAX(version_number), 0) AS version_number
       FROM terms_versions WHERE case_id = ?`,
    )
    .get(caseId);
  return Number(row.version_number) + 1;
}

function nextAttempt(database, caseId) {
  const row = database
    .prepare(
      `SELECT COALESCE(MAX(attempt_number), 0) AS attempt_number
       FROM extraction_attempts WHERE case_id = ?`,
    )
    .get(caseId);
  return Number(row.attempt_number) + 1;
}

export function saveReview(database, input, options = {}) {
  const caseId = options.caseId ?? SEEDED_CASE_ID;
  const caseRow = database
    .prepare(
      `SELECT lc.row_version, lc.case_outcome, rs.intended_use_text
       FROM licensing_cases lc
       JOIN request_submissions rs ON rs.request_submission_id = lc.request_submission_id
       WHERE lc.case_id = ?`,
    )
    .get(caseId);
  if (!caseRow) throw new Error("Case not found.");
  const expectedRowVersion = options.expectedRowVersion ?? caseRow.row_version;
  if (caseRow.row_version !== expectedRowVersion) {
    throw new Error("stale_case");
  }

  const versionNumber = nextVersion(database, caseId);
  const attemptNumber = nextAttempt(database, caseId);
  const canonicalJson = manualRightsReviewCanonicalJson(input);
  const offset = versionNumber * 100;
  const observationIds = Object.fromEntries(
    RIGHTS_FIELD_NAMES.map((field, index) => [field, uuid(offset + index + 10)]),
  );
  const revision = createManualTermsRevision(input, {
    caseId,
    extractionAttemptId: uuid(offset + 1),
    fieldObservationIds: observationIds,
    termsVersionId: uuid(offset + 2),
    auditEventId: uuid(offset + 3),
    attemptNumber,
    versionNumber,
    inputHash: sha256(caseRow.intended_use_text),
    termsHash: sha256(canonicalJson),
    createdAt: options.createdAt ?? `2026-10-${25 + versionNumber}T12:00:00.000Z`,
    actorReference: "demo-creator",
    correlationId: `turn011-local-${versionNumber}`,
  });

  database.exec("BEGIN IMMEDIATE;");
  try {
    const attempt = revision.extractionAttempt;
    database.prepare(
      `INSERT INTO extraction_attempts (
         extraction_attempt_id, case_id, attempt_number, status,
         extractor_version, model_id, model_version, artifact_hash,
         input_hash, started_at, completed_at, error_code
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      attempt.extractionAttemptId,
      attempt.caseId,
      attempt.attemptNumber,
      attempt.status,
      attempt.extractorVersion,
      attempt.modelId,
      attempt.modelVersion,
      attempt.artifactHash,
      attempt.inputHash,
      attempt.startedAt,
      attempt.completedAt,
      attempt.errorCode,
    );

    const insertObservation = database.prepare(
      `INSERT INTO field_observations (
         field_observation_id, extraction_attempt_id, field_name,
         normalized_value_json, resolution_state, provenance,
         confidence_basis_points, evidence_start_utf16, evidence_end_utf16,
         evidence_text, resolver_version, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const observation of revision.observations) {
      insertObservation.run(
        observation.fieldObservationId,
        observation.extractionAttemptId,
        observation.fieldName,
        observation.normalizedValueJson,
        observation.resolutionState,
        observation.provenance,
        observation.confidenceBasisPoints,
        observation.evidenceStartUtf16,
        observation.evidenceEndUtf16,
        observation.evidenceText,
        observation.resolverVersion,
        observation.createdAt,
      );
    }

    const terms = revision.termsVersion;
    database.prepare(
      `INSERT INTO terms_versions (
         terms_version_id, case_id, version_number, resolution_status,
         use_purpose, channels_json, paid_advertising, territories_json,
         start_date, duration_days, max_impressions, exclusivity,
         modification_scope, attribution, sublicensing, ai_use,
         source_kind, terms_hash, created_by_actor, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      terms.termsVersionId,
      terms.caseId,
      terms.versionNumber,
      terms.resolutionStatus,
      terms.usePurpose,
      terms.channels ? JSON.stringify(terms.channels) : null,
      terms.paidAdvertising ? 1 : null,
      terms.territories ? JSON.stringify(terms.territories) : null,
      terms.startDate,
      terms.durationDays,
      terms.maxImpressions,
      terms.exclusivity,
      terms.modificationScope,
      terms.attribution,
      terms.sublicensing,
      terms.aiUse,
      terms.sourceKind,
      terms.termsHash,
      terms.createdByActor,
      terms.createdAt,
    );

    const audit = revision.auditEvent;
    database.prepare(
      `INSERT INTO audit_events (
         audit_event_id, case_id, aggregate_type, aggregate_id,
         aggregate_sequence, event_type, actor_type, actor_reference,
         payload_json, correlation_id, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      audit.auditEventId,
      audit.caseId,
      audit.aggregateType,
      audit.aggregateId,
      audit.aggregateSequence,
      audit.eventType,
      audit.actorType,
      audit.actorReference,
      audit.payloadJson,
      audit.correlationId,
      audit.idempotencyKey,
      audit.createdAt,
    );

    const update = database.prepare(
      `UPDATE licensing_cases
       SET latest_extraction_attempt_id = ?, latest_terms_version_id = ?,
           updated_at = ?, row_version = row_version + 1
       WHERE case_id = ? AND row_version = ?`,
    ).run(
      attempt.extractionAttemptId,
      terms.termsVersionId,
      terms.createdAt,
      caseId,
      expectedRowVersion,
    );
    if (update.changes !== 1) throw new Error("stale_case");
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
  return revision;
}

export function loadReview(database, caseId = SEEDED_CASE_ID) {
  const caseRow = database.prepare(
    `SELECT row_version, latest_extraction_attempt_id, latest_terms_version_id
     FROM licensing_cases WHERE case_id = ?`,
  ).get(caseId);
  if (!caseRow) return null;
  if (!caseRow.latest_extraction_attempt_id || !caseRow.latest_terms_version_id) {
    return {
      caseRowVersion: caseRow.row_version,
      versionNumber: null,
      resolutionStatus: "not_started",
      fields: emptyRightsFieldViews(),
    };
  }
  const terms = database.prepare(
    `SELECT version_number, resolution_status, terms_hash
     FROM terms_versions WHERE terms_version_id = ?`,
  ).get(caseRow.latest_terms_version_id);
  const observations = database.prepare(
    `SELECT field_observation_id, extraction_attempt_id, field_name,
            normalized_value_json, resolution_state, provenance,
            confidence_basis_points, evidence_start_utf16,
            evidence_end_utf16, evidence_text, resolver_version, created_at
     FROM field_observations
     WHERE extraction_attempt_id = ?`,
  ).all(caseRow.latest_extraction_attempt_id).map((row) => ({
    fieldObservationId: row.field_observation_id,
    extractionAttemptId: row.extraction_attempt_id,
    fieldName: row.field_name,
    normalizedValueJson: row.normalized_value_json,
    resolutionState: row.resolution_state,
    provenance: row.provenance,
    confidenceBasisPoints: row.confidence_basis_points,
    evidenceStartUtf16: row.evidence_start_utf16,
    evidenceEndUtf16: row.evidence_end_utf16,
    evidenceText: row.evidence_text,
    resolverVersion: row.resolver_version,
    createdAt: row.created_at,
  }));
  return {
    caseRowVersion: caseRow.row_version,
    versionNumber: terms.version_number,
    resolutionStatus: terms.resolution_status,
    termsHash: terms.terms_hash,
    fields: rightsFieldViewsFromObservations(observations),
  };
}

export function tableCounts(database) {
  return Object.fromEntries(
    ["extraction_attempts", "field_observations", "terms_versions", "audit_events"].map(
      (table) => [
        table,
        Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count),
      ],
    ),
  );
}
