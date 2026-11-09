import type { AutomatedExtractionAttempt, AutomatedExtractionRepositoryPort } from "@rightsreceipt/application";
import type { FieldObservationRecord } from "@rightsreceipt/domain";
const DETERMINISTIC_EXTRACTOR_VERSION = "rights-rule-baseline-v1" as const;
import type { D1DatabasePort } from "./ports";

interface AttemptDbRow {
  extraction_attempt_id: string; case_id: string; attempt_number: number;
  status: "completed"; extractor_version: typeof DETERMINISTIC_EXTRACTOR_VERSION;
  model_id: string | null; model_version: string | null; artifact_hash: string | null;
  input_hash: string; started_at: string; completed_at: string; error_code: null;
}
interface ObservationDbRow {
  field_observation_id: string; extraction_attempt_id: string;
  field_name: FieldObservationRecord["fieldName"]; normalized_value_json: string | null;
  resolution_state: FieldObservationRecord["resolutionState"]; provenance: "deterministic";
  confidence_basis_points: null; evidence_start_utf16: number | null;
  evidence_end_utf16: number | null; evidence_text: string | null;
  resolver_version: string; created_at: string;
}
const mapObservation = (r: ObservationDbRow): FieldObservationRecord => ({
  fieldObservationId: r.field_observation_id, extractionAttemptId: r.extraction_attempt_id,
  fieldName: r.field_name, normalizedValueJson: r.normalized_value_json,
  resolutionState: r.resolution_state, provenance: r.provenance,
  confidenceBasisPoints: r.confidence_basis_points, evidenceStartUtf16: r.evidence_start_utf16,
  evidenceEndUtf16: r.evidence_end_utf16, evidenceText: r.evidence_text,
  resolverVersion: r.resolver_version, createdAt: r.created_at,
});
export function createD1ExtractionRepository(database: D1DatabasePort): AutomatedExtractionRepositoryPort {
  return {
    async getAutomated(caseId) {
      const row = await database.prepare<AttemptDbRow>(
        `SELECT extraction_attempt_id, case_id, attempt_number, status,
                extractor_version, model_id, model_version, artifact_hash,
                input_hash, started_at, completed_at, error_code
         FROM extraction_attempts
         WHERE case_id = ? AND extractor_version = ?
         ORDER BY attempt_number DESC LIMIT 1`,
      ).bind(caseId, DETERMINISTIC_EXTRACTOR_VERSION).first<AttemptDbRow>();
      if (!row) return null;
      const result = await database.prepare<ObservationDbRow>(
        `SELECT field_observation_id, extraction_attempt_id, field_name,
                normalized_value_json, resolution_state, provenance,
                confidence_basis_points, evidence_start_utf16,
                evidence_end_utf16, evidence_text, resolver_version, created_at
         FROM field_observations
         WHERE extraction_attempt_id = ? ORDER BY rowid`,
      ).bind(row.extraction_attempt_id).all();
      const attempt: AutomatedExtractionAttempt = {
        extractionAttemptId: row.extraction_attempt_id, caseId: row.case_id,
        attemptNumber: row.attempt_number, status: row.status,
        extractorVersion: row.extractor_version, modelId: row.model_id,
        modelVersion: row.model_version, artifactHash: row.artifact_hash,
        inputHash: row.input_hash, startedAt: row.started_at,
        completedAt: row.completed_at, errorCode: row.error_code,
      };
      return { attempt, observations: (result.results ?? []).map(mapObservation) };
    },
    async saveAutomated(attempt, observations, audit, expectedCaseRowVersion) {
      const createAttempt = database.prepare(
        `INSERT INTO extraction_attempts (
           extraction_attempt_id, case_id, attempt_number, status,
           extractor_version, model_id, model_version, artifact_hash,
           input_hash, started_at, completed_at, error_code
         ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM licensing_cases lc
           WHERE lc.case_id = ? AND lc.row_version = ?
             AND lc.case_outcome = 'open' AND lc.request_submission_id IS NOT NULL
             AND lc.latest_terms_version_id IS NULL
             AND lc.latest_extraction_attempt_id IS NULL
         )`,
      ).bind(attempt.extractionAttemptId, attempt.caseId, attempt.attemptNumber,
        attempt.status, attempt.extractorVersion, attempt.modelId, attempt.modelVersion,
        attempt.artifactHash, attempt.inputHash, attempt.startedAt, attempt.completedAt,
        attempt.errorCode, attempt.caseId, expectedCaseRowVersion);
      const statements = [
        createAttempt,
        ...observations.map(row => database.prepare(
          `INSERT INTO field_observations (
             field_observation_id, extraction_attempt_id, field_name,
             normalized_value_json, resolution_state, provenance,
             confidence_basis_points, evidence_start_utf16,
             evidence_end_utf16, evidence_text, resolver_version, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(row.fieldObservationId, row.extractionAttemptId, row.fieldName,
          row.normalizedValueJson, row.resolutionState, row.provenance,
          row.confidenceBasisPoints, row.evidenceStartUtf16, row.evidenceEndUtf16,
          row.evidenceText, row.resolverVersion, row.createdAt)),
        database.prepare(
          `INSERT INTO audit_events (
             audit_event_id, case_id, aggregate_type, aggregate_id,
             aggregate_sequence, event_type, actor_type, actor_reference,
             payload_json, correlation_id, idempotency_key, created_at
           ) VALUES (?, ?, 'extraction', ?,
             (SELECT COALESCE(MAX(aggregate_sequence), 0) + 1 FROM audit_events
              WHERE case_id = ? AND aggregate_type = 'extraction'),
             ?, 'system', ?, ?, ?, ?, ?)`,
        ).bind(audit.auditEventId, audit.caseId, audit.aggregateId, audit.caseId,
          audit.eventType, audit.actorReference, audit.payloadJson,
          audit.correlationId, audit.idempotencyKey, audit.createdAt),
        database.prepare(
          `UPDATE licensing_cases
           SET latest_extraction_attempt_id = ?, updated_at = ?, row_version = row_version + 1
           WHERE case_id = ? AND row_version = ?
             AND latest_terms_version_id IS NULL
             AND latest_extraction_attempt_id IS NULL`,
        ).bind(attempt.extractionAttemptId, attempt.completedAt,
          attempt.caseId, expectedCaseRowVersion),
      ];
      // A stale conditional insert is rolled back by the first dependent
      // observation foreign key, since D1.batch is atomic.
      const results = await database.batch(statements);
      if (results.some(item => !item.success)
        || Number(results[0]?.meta?.changes ?? 0) !== 1
        || Number(results.at(-1)?.meta?.changes ?? 0) !== 1) {
        throw new Error("Extraction write did not meet the expected case version.");
      }
    },
  };
}
