import {
  TermsReviewPersistenceError,
  type TermsReviewCaseSummaryRecord,
  type TermsReviewPersistencePort,
} from "@rightsreceipt/application";
import type {
  AssetRecord,
  BuyerRequestSubmissionRecord,
  FieldObservationRecord,
  RightsReviewCaseContext,
  TermsVersionRecord,
} from "@rightsreceipt/domain";
import type { D1DatabasePort } from "./ports";

interface CaseContextRow {
  case_id: string;
  workspace_id: string;
  case_outcome: "open" | "rejected" | "canceled";
  row_version: number;
  latest_extraction_attempt_id: string | null;
  latest_terms_version_id: string | null;
  asset_id: string;
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
  request_submission_id: string;
  buyer_name: string;
  buyer_organization: string;
  buyer_email: string;
  intended_use_text: string;
  normalized_text: string;
  consent_copy_version: "buyer-request-v1";
  consent_acknowledged: number;
  submitted_at: string;
  terms_version_id: string | null;
  version_number: number | null;
  resolution_status: TermsVersionRecord["resolutionStatus"] | null;
  use_purpose: "commercial" | null;
  channels_json: string | null;
  paid_advertising: number | null;
  territories_json: string | null;
  start_date: string | null;
  duration_days: number | null;
  max_impressions: number | null;
  exclusivity: "non_exclusive" | null;
  modification_scope: "none" | "crop_only" | null;
  attribution: "required" | "not_required" | null;
  sublicensing: "prohibited" | null;
  ai_use: "prohibited" | null;
  source_kind: "extracted" | "human_corrected" | null;
  terms_hash: string | null;
  created_by_actor: "system" | "creator" | "buyer" | null;
  terms_created_at: string | null;
}

interface AttemptNumberRow {
  latest_attempt_number: number;
}

interface ObservationRow {
  field_observation_id: string;
  extraction_attempt_id: string;
  field_name: FieldObservationRecord["fieldName"];
  normalized_value_json: string | null;
  resolution_state: FieldObservationRecord["resolutionState"];
  provenance: FieldObservationRecord["provenance"];
  confidence_basis_points: number | null;
  evidence_start_utf16: number | null;
  evidence_end_utf16: number | null;
  evidence_text: string | null;
  resolver_version: string;
  created_at: string;
}

interface CaseSummaryRow {
  case_id: string;
  row_version: number;
  asset_id: string;
  asset_title: string;
  preview_reference: string;
  buyer_organization: string;
  submitted_at: string;
  version_number: number | null;
  resolution_status: TermsVersionRecord["resolutionStatus"] | null;
}

function parseArray<T extends string>(value: string | null): readonly T[] | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? (parsed as readonly T[]) : null;
}

function mapAsset(row: CaseContextRow): AssetRecord {
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

function mapRequest(row: CaseContextRow): BuyerRequestSubmissionRecord {
  return {
    requestSubmissionId: row.request_submission_id,
    caseId: row.case_id,
    buyerName: row.buyer_name,
    buyerOrganization: row.buyer_organization,
    buyerEmail: row.buyer_email,
    intendedUseText: row.intended_use_text,
    normalizedText: row.normalized_text,
    consentCopyVersion: row.consent_copy_version,
    consentAcknowledged: row.consent_acknowledged === 1,
    submittedAt: row.submitted_at,
  } as BuyerRequestSubmissionRecord;
}

function mapTermsVersion(row: CaseContextRow): TermsVersionRecord | null {
  if (
    !row.terms_version_id
    || row.version_number === null
    || !row.resolution_status
    || !row.terms_hash
    || row.source_kind !== "human_corrected"
    || row.created_by_actor !== "creator"
    || !row.terms_created_at
  ) {
    return null;
  }
  return {
    termsVersionId: row.terms_version_id,
    caseId: row.case_id,
    versionNumber: row.version_number,
    resolutionStatus: row.resolution_status,
    usePurpose: row.use_purpose,
    channels: parseArray(row.channels_json),
    paidAdvertising: row.paid_advertising === 1 ? true : null,
    territories: parseArray(row.territories_json),
    startDate: row.start_date,
    durationDays: row.duration_days,
    maxImpressions: row.max_impressions,
    exclusivity: row.exclusivity,
    modificationScope: row.modification_scope,
    attribution: row.attribution,
    sublicensing: row.sublicensing,
    aiUse: row.ai_use,
    sourceKind: "human_corrected",
    termsHash: row.terms_hash,
    createdByActor: "creator",
    createdAt: row.terms_created_at,
  };
}

function mapObservation(row: ObservationRow): FieldObservationRecord {
  return {
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
  };
}

function insertObservationStatement(
  database: D1DatabasePort,
  observation: FieldObservationRecord,
) {
  return database
    .prepare(
      `INSERT INTO field_observations (
         field_observation_id, extraction_attempt_id, field_name,
         normalized_value_json, resolution_state, provenance,
         confidence_basis_points, evidence_start_utf16, evidence_end_utf16,
         evidence_text, resolver_version, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
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

export function createD1TermsReviewRepository(
  database: D1DatabasePort,
): TermsReviewPersistencePort {
  return {
    async listSubmittedCases(workspaceId) {
      const result = await database
        .prepare<CaseSummaryRow>(
          `SELECT lc.case_id, lc.row_version, a.asset_id,
                  a.title AS asset_title, a.preview_reference,
                  rs.buyer_organization, rs.submitted_at,
                  tv.version_number, tv.resolution_status
           FROM licensing_cases lc
           JOIN assets a ON a.asset_id = lc.asset_id
           JOIN request_submissions rs ON rs.request_submission_id = lc.request_submission_id
           LEFT JOIN terms_versions tv ON tv.terms_version_id = lc.latest_terms_version_id
           WHERE lc.workspace_id = ?
           ORDER BY rs.submitted_at DESC, lc.case_id`,
        )
        .bind(workspaceId)
        .all();
      return (result.results ?? []).map((row): TermsReviewCaseSummaryRecord => ({
        caseId: row.case_id,
        caseRowVersion: row.row_version,
        assetId: row.asset_id,
        assetTitle: row.asset_title,
        assetPreviewReference: row.preview_reference,
        buyerOrganization: row.buyer_organization,
        submittedAt: row.submitted_at,
        termsVersionNumber: row.version_number,
        resolutionStatus: row.resolution_status,
      }));
    },

    async getCaseContext(caseId) {
      const row = await database
        .prepare<CaseContextRow>(
          `SELECT
             lc.case_id, lc.workspace_id, lc.case_outcome, lc.row_version,
             lc.latest_extraction_attempt_id, lc.latest_terms_version_id,
             a.asset_id, a.title, a.asset_type, a.creator_display_name,
             a.provenance_note, a.fingerprint_algorithm, a.fingerprint_value,
             a.preview_reference, a.availability,
             a.created_at AS asset_created_at,
             a.updated_at AS asset_updated_at,
             a.row_version AS asset_row_version,
             rs.request_submission_id, rs.buyer_name, rs.buyer_organization,
             rs.buyer_email, rs.intended_use_text, rs.normalized_text,
             rs.consent_copy_version, rs.consent_acknowledged, rs.submitted_at,
             tv.terms_version_id, tv.version_number, tv.resolution_status,
             tv.use_purpose, tv.channels_json, tv.paid_advertising,
             tv.territories_json, tv.start_date, tv.duration_days,
             tv.max_impressions, tv.exclusivity, tv.modification_scope,
             tv.attribution, tv.sublicensing, tv.ai_use, tv.source_kind,
             tv.terms_hash, tv.created_by_actor,
             tv.created_at AS terms_created_at
           FROM licensing_cases lc
           JOIN assets a ON a.asset_id = lc.asset_id
           JOIN request_submissions rs ON rs.request_submission_id = lc.request_submission_id
           LEFT JOIN terms_versions tv ON tv.terms_version_id = lc.latest_terms_version_id
           WHERE lc.case_id = ?
           LIMIT 1`,
        )
        .bind(caseId)
        .first<CaseContextRow>();
      if (!row) return null;

      const attemptRow = await database
        .prepare<AttemptNumberRow>(
          `SELECT COALESCE(MAX(attempt_number), 0) AS latest_attempt_number
           FROM extraction_attempts
           WHERE case_id = ?`,
        )
        .bind(caseId)
        .first<AttemptNumberRow>();

      let latestObservations: readonly FieldObservationRecord[] = [];
      if (row.latest_extraction_attempt_id) {
        const observations = await database
          .prepare<ObservationRow>(
            `SELECT field_observation_id, extraction_attempt_id, field_name,
                    normalized_value_json, resolution_state, provenance,
                    confidence_basis_points, evidence_start_utf16,
                    evidence_end_utf16, evidence_text, resolver_version, created_at
             FROM field_observations
             WHERE extraction_attempt_id = ?
             ORDER BY field_name`,
          )
          .bind(row.latest_extraction_attempt_id)
          .all();
        latestObservations = (observations.results ?? []).map(mapObservation);
      }

      const context: RightsReviewCaseContext = {
        caseId: row.case_id,
        workspaceId: row.workspace_id,
        caseOutcome: row.case_outcome,
        caseRowVersion: row.row_version,
        asset: mapAsset(row),
        request: mapRequest(row),
        latestAttemptNumber: Number(attemptRow?.latest_attempt_number ?? 0),
        latestTermsVersion: mapTermsVersion(row),
        latestObservations,
      };
      return context;
    },

    async saveManualRevision(revision, expectedCaseRowVersion) {
      const attempt = revision.extractionAttempt;
      const terms = revision.termsVersion;
      const audit = revision.auditEvent;
      const statements = [
        database
          .prepare(
            `INSERT INTO extraction_attempts (
               extraction_attempt_id, case_id, attempt_number, status,
               extractor_version, model_id, model_version, artifact_hash,
               input_hash, started_at, completed_at, error_code
             )
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM licensing_cases
               WHERE case_id = ? AND row_version = ?
                 AND request_submission_id IS NOT NULL AND case_outcome = 'open'
             )`,
          )
          .bind(
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
            attempt.caseId,
            expectedCaseRowVersion,
          ),
        ...revision.observations.map((observation) =>
          insertObservationStatement(database, observation)),
        database
          .prepare(
            `INSERT INTO terms_versions (
               terms_version_id, case_id, version_number, resolution_status,
               use_purpose, channels_json, paid_advertising, territories_json,
               start_date, duration_days, max_impressions, exclusivity,
               modification_scope, attribution, sublicensing, ai_use,
               source_kind, terms_hash, created_by_actor, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
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
          ),
        database
          .prepare(
            `INSERT INTO audit_events (
               audit_event_id, case_id, aggregate_type, aggregate_id,
               aggregate_sequence, event_type, actor_type, actor_reference,
               payload_json, correlation_id, idempotency_key, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
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
          ),
        database
          .prepare(
            `UPDATE licensing_cases
             SET latest_extraction_attempt_id = ?, latest_terms_version_id = ?,
                 updated_at = ?, row_version = row_version + 1
             WHERE case_id = ? AND row_version = ?`,
          )
          .bind(
            attempt.extractionAttemptId,
            terms.termsVersionId,
            terms.createdAt,
            terms.caseId,
            expectedCaseRowVersion,
          ),
      ];

      try {
        const results = await database.batch(statements);
        if (results.some((result) => !result.success)) {
          throw new TermsReviewPersistenceError(
            "persistence_conflict",
            "The manual rights review could not be persisted atomically.",
          );
        }
        const update = results.at(-1);
        if (Number(update?.meta?.changes ?? 0) !== 1) {
          throw new TermsReviewPersistenceError(
            "stale_case",
            "The licensing case changed before the review was saved.",
          );
        }
      } catch (error) {
        if (error instanceof TermsReviewPersistenceError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new TermsReviewPersistenceError(
          /terms_hash|UNIQUE constraint failed: terms_versions/iu.test(message)
            ? "duplicate_terms"
            : /FOREIGN KEY|row_version|extraction_attempt/iu.test(message)
              ? "stale_case"
              : "persistence_conflict",
          "The manual rights review could not be persisted.",
        );
      }
    },
  };
}
