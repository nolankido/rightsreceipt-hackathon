/** Creator-authorized, evidence-preserving extraction. AI has no mutation authority. */
import {
  assessDeterministicRights,
  DETERMINISTIC_EXTRACTOR_VERSION,
  evidenceRowsFromAssessment,
  verifySavedEvidence,
  type AiExtractionAssessment,
  type EvidenceRow,
  type ReviewOnlyAssessment,
} from "@rightsreceipt/ai-runtime";
import type { FieldObservationRecord } from "@rightsreceipt/domain";
import type { ClockPort, IdentifierPort } from "./index";
import type { TermsReviewPersistencePort, Sha256Port } from "./rights-terms";

export interface AutomatedExtractionAttempt {
  readonly extractionAttemptId: string;
  readonly caseId: string;
  readonly attemptNumber: number;
  readonly status: "completed";
  readonly extractorVersion: typeof DETERMINISTIC_EXTRACTOR_VERSION;
  readonly modelId: string | null;
  readonly modelVersion: string | null;
  readonly artifactHash: string | null;
  readonly inputHash: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly errorCode: null;
}
export interface AutomatedExtractionAudit {
  readonly auditEventId: string;
  readonly caseId: string;
  readonly aggregateId: string;
  readonly eventType: "extraction.proposals_saved";
  readonly actorReference: "deterministic-local-extractor";
  readonly payloadJson: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}
export interface AutomatedExtractionSnapshot {
  readonly attempt: AutomatedExtractionAttempt;
  readonly observations: readonly FieldObservationRecord[];
}
export interface AutomatedExtractionRepositoryPort {
  getAutomated(caseId: string): Promise<AutomatedExtractionSnapshot | null>;
  saveAutomated(attempt: AutomatedExtractionAttempt, observations: readonly FieldObservationRecord[],
    audit: AutomatedExtractionAudit, expectedCaseRowVersion: number): Promise<void>;
}
export interface LearnedDiagnostic {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly artifactSha256: string;
  readonly assessment: ReviewOnlyAssessment;
}
export interface LearnedDiagnosticPort {
  inspect(originalText: string): Promise<LearnedDiagnostic | null>;
}
export interface CreatorExtractionView {
  readonly caseId: string;
  readonly caseRowVersion: number;
  readonly originalText: string;
  readonly status: "not_started" | "proposals_saved";
  readonly executedAt: string | null;
  readonly deterministic: AiExtractionAssessment | null;
  readonly learned: LearnedDiagnostic | null;
  readonly modelStatus: "unavailable" | "review_only";
  readonly termsVersionNumber: number | null;
  readonly reviewRequired: true;
  readonly quoteEligible: false;
  readonly permittedActions: readonly [];
}
export class CreatorExtractionError extends Error {
  constructor(
    readonly code: "case_not_found" | "case_closed" | "stale_case" | "already_extracted"
      | "terms_already_reviewed" | "invalid_source" | "evidence_integrity_failed"
      | "persistence_conflict",
    message: string,
  ) {
    super(message);
    this.name = "CreatorExtractionError";
  }
}
export interface CreatorExtractionDependencies {
  readonly terms: TermsReviewPersistencePort;
  readonly extraction: AutomatedExtractionRepositoryPort;
  readonly hasher: Sha256Port;
  readonly identifiers: IdentifierPort;
  readonly clock: ClockPort;
  readonly learned?: LearnedDiagnosticPort;
}
export class CreatorExtractionService {
  readonly #d: CreatorExtractionDependencies;
  constructor(dependencies: CreatorExtractionDependencies) {
    this.#d = dependencies;
  }
  async get(caseId: string): Promise<CreatorExtractionView> {
    const context = await this.#context(caseId);
    const snapshot = await this.#d.extraction.getAutomated(caseId);
    if (!snapshot) return {
      caseId, caseRowVersion: context.caseRowVersion, originalText: context.request.intendedUseText,
      status: "not_started", executedAt: null, deterministic: null, learned: null,
      modelStatus: "unavailable", termsVersionNumber: context.latestTermsVersion?.versionNumber ?? null,
      reviewRequired: true, quoteEligible: false, permittedActions: [],
    };
    const original = context.request.intendedUseText;
    if (snapshot.attempt.inputHash !== await this.#d.hasher.sha256Hex(original)
      || snapshot.attempt.extractorVersion !== DETERMINISTIC_EXTRACTOR_VERSION
      || snapshot.attempt.status !== "completed") {
      throw new CreatorExtractionError("evidence_integrity_failed", "The stored source evidence cannot be trusted.");
    }
    const assessment = await assessDeterministicRights(original, this.#d.hasher);
    if (assessment.status !== "review_required") {
      throw new CreatorExtractionError("invalid_source", "The original buyer request could not be validated.");
    }
    let expected: readonly EvidenceRow[];
    try { expected = evidenceRowsFromAssessment(assessment, original, DETERMINISTIC_EXTRACTOR_VERSION); }
    catch { throw new CreatorExtractionError("evidence_integrity_failed", "The stored proposal format is invalid."); }
    if (!verifySavedEvidence(expected, snapshot.observations)) {
      throw new CreatorExtractionError("evidence_integrity_failed", "Saved observations differ from source evidence.");
    }
    let learned: LearnedDiagnostic | null = null;
    if (snapshot.attempt.modelId && this.#d.learned) {
      try {
        const candidate = await this.#d.learned.inspect(original);
        if (candidate?.modelId === snapshot.attempt.modelId
          && candidate.modelVersion === snapshot.attempt.modelVersion
          && candidate.artifactSha256 === snapshot.attempt.artifactHash
          && candidate.assessment.status === "not_approved_for_automatic_resolution"
          && candidate.assessment.quoteEligible === false
          && candidate.assessment.permittedActions.length === 0) learned = candidate;
      } catch { /* Verified diagnostics are optional and never authority. */ }
    }
    return {
      caseId, caseRowVersion: context.caseRowVersion, originalText: original,
      status: "proposals_saved", executedAt: snapshot.attempt.completedAt,
      deterministic: assessment, learned, modelStatus: learned ? "review_only" : "unavailable",
      termsVersionNumber: context.latestTermsVersion?.versionNumber ?? null,
      reviewRequired: true, quoteEligible: false, permittedActions: [],
    };
  }
  async run(caseId: string, expectedCaseRowVersion: number): Promise<CreatorExtractionView> {
    const context = await this.#context(caseId);
    if (context.caseOutcome !== "open") throw new CreatorExtractionError("case_closed", "Closed cases cannot run extraction.");
    if (context.caseRowVersion !== expectedCaseRowVersion) throw new CreatorExtractionError("stale_case", "The case changed. Reload before extracting.");
    if (context.latestTermsVersion) throw new CreatorExtractionError("terms_already_reviewed", "Human-confirmed terms cannot be replaced by AI.");
    if (await this.#d.extraction.getAutomated(caseId)) throw new CreatorExtractionError("already_extracted", "Source extraction already exists.");
    const original = context.request.intendedUseText;
    const assessment = await assessDeterministicRights(original, this.#d.hasher);
    if (assessment.status !== "review_required") throw new CreatorExtractionError("invalid_source", "Source evidence failed the extraction contract.");
    const projected = evidenceRowsFromAssessment(assessment, original, DETERMINISTIC_EXTRACTOR_VERSION);
    let learned: LearnedDiagnostic | null = null;
    if (this.#d.learned) {
      try {
        const candidate = await this.#d.learned.inspect(original);
        if (candidate?.assessment.status === "not_approved_for_automatic_resolution"
          && candidate.assessment.quoteEligible === false
          && candidate.assessment.permittedActions.length === 0) learned = candidate;
      } catch { /* Remain deterministic-only when the model is unavailable. */ }
    }
    const createdAt = this.#d.clock.now().toISOString();
    const inputHash = await this.#d.hasher.sha256Hex(original);
    const attempt: AutomatedExtractionAttempt = {
      extractionAttemptId: this.#d.identifiers.create(), caseId,
      attemptNumber: context.latestAttemptNumber + 1, status: "completed",
      extractorVersion: DETERMINISTIC_EXTRACTOR_VERSION,
      modelId: learned?.modelId ?? null, modelVersion: learned?.modelVersion ?? null,
      artifactHash: learned?.artifactSha256 ?? null, inputHash,
      startedAt: createdAt, completedAt: createdAt, errorCode: null,
    };
    const observations: FieldObservationRecord[] = projected.map(row => ({
      fieldObservationId: this.#d.identifiers.create(),
      extractionAttemptId: attempt.extractionAttemptId, ...row, createdAt,
    }));
    const audit: AutomatedExtractionAudit = {
      auditEventId: this.#d.identifiers.create(), caseId, aggregateId: attempt.extractionAttemptId,
      eventType: "extraction.proposals_saved", actorReference: "deterministic-local-extractor",
      payloadJson: JSON.stringify({
        input_sha256: inputHash, extractor_version: DETERMINISTIC_EXTRACTOR_VERSION,
        model_artifact_sha256: learned?.artifactSha256 ?? null,
        observation_rows: observations.length, quote_eligible: false, review_required: true,
      }),
      correlationId: this.#d.identifiers.create(), idempotencyKey: inputHash, createdAt,
    };
    try { await this.#d.extraction.saveAutomated(attempt, observations, audit, expectedCaseRowVersion); }
    catch { throw new CreatorExtractionError("persistence_conflict", "Extraction could not be saved atomically. Reload."); }
    return this.get(caseId);
  }
  async #context(caseId: string) {
    const context = await this.#d.terms.getCaseContext(caseId);
    if (!context) throw new CreatorExtractionError("case_not_found", "No submitted buyer request exists for this case.");
    return context;
  }
}
