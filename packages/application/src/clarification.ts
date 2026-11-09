/** Read-only clarification planning for a submitted licensing request.
 * Only human-saved terms, never model scores, can make a quote eligible.
 */
import type {
  AiCandidateField, AiExtractionAssessment, ClarificationFieldInput,
  ClarificationPlan, ClarificationPlannerInput,
} from "@rightsreceipt/ai-runtime";
import type { FieldObservationRecord } from "@rightsreceipt/domain";
import type { TermsReviewPersistencePort } from "./rights-terms";
import type { BuyerRequestPersistencePort, CapabilityTokenPort } from "./buyer-requests";
import type { ClockPort } from "./index";

export interface ClarificationPlannerPort {
  build(input: ClarificationPlannerInput): ClarificationPlan;
}
export interface ClarificationServiceDependencies {
  readonly terms: TermsReviewPersistencePort;
  readonly evaluateDeterministic: (originalText: string) => Promise<AiExtractionAssessment>;
  readonly planner: ClarificationPlannerPort;
}
export interface CreatorClarificationView {
  readonly caseId: string;
  readonly caseRowVersion: number;
  readonly termsVersionNumber: number | null;
  readonly plan: ClarificationPlan;
}
export class ClarificationServiceError extends Error {
  readonly code: "case_not_found" | "case_closed" | "evidence_integrity_failed" | "capability_invalid";
  constructor(
    code: ClarificationServiceError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ClarificationServiceError";
    this.code = code;
  }
}

const HUMAN_FIELD_ORDER = [
  "use_purpose", "channels", "paid_advertising", "territories",
  "start_date", "duration_days", "max_impressions", "exclusivity",
  "modification_scope", "attribution", "sublicensing", "ai_use",
] as const;

function humanFields(observations: readonly FieldObservationRecord[]): readonly ClarificationFieldInput[] {
  if (observations.length !== 12 || observations.some(o=>o.provenance!=="human")) {
    throw new ClarificationServiceError("evidence_integrity_failed", "Saved human terms observations are incomplete.");
  }
  const byName = new Map(observations.map(observation=>[observation.fieldName, observation]));
  if (byName.size !== HUMAN_FIELD_ORDER.length) {
    throw new ClarificationServiceError("evidence_integrity_failed", "Human terms contain duplicated or missing fields.");
  }
  return HUMAN_FIELD_ORDER.map(fieldName => {
    const observation = byName.get(fieldName);
    if (!observation) {
      throw new ClarificationServiceError("evidence_integrity_failed", "A human terms field is missing.");
    }
    let value: unknown = null;
    if (observation.resolutionState === "resolved") {
      if (observation.normalizedValueJson === null) {
        throw new ClarificationServiceError("evidence_integrity_failed", "A saved human term has no value.");
      }
      try { value = JSON.parse(observation.normalizedValueJson); }
      catch { throw new ClarificationServiceError("evidence_integrity_failed", "A saved human term is invalid."); }
    }
    return {
      fieldName: observation.fieldName,
      resolutionState: observation.resolutionState,
      normalizedValue: value,
      reasonCode: observation.resolutionState === "resolved" ? "explicit_evidence"
        : observation.resolutionState === "contradictory" ? "conflicting_evidence"
        : observation.resolutionState === "unsupported" ? "out_of_scope" : "not_stated",
      evidenceSpans: [],
    };
  });
}

function expectedStatus(plan: ClarificationPlan): "complete" | "incomplete" | "contradictory" | "unsupported" {
  if (plan.unsupported.length) return "unsupported";
  if (plan.questions.some(question => question.reason === "contradictory")) return "contradictory";
  if (plan.questions.length) return "incomplete";
  return "complete";
}

export class CreatorClarificationService {
  readonly #dependencies: ClarificationServiceDependencies;
  constructor(dependencies: ClarificationServiceDependencies) {
    this.#dependencies = dependencies;
  }
  async get(caseId: string): Promise<CreatorClarificationView> {
    const context = await this.#dependencies.terms.getCaseContext(caseId);
    if (!context) throw new ClarificationServiceError("case_not_found", "No submitted case exists for clarification.");
    if (context.caseOutcome !== "open") {
      throw new ClarificationServiceError("case_closed", "Closed cases cannot request new clarifications.");
    }
    const text = context.request.intendedUseText;
    let input: ClarificationPlannerInput;
    if (context.latestTermsVersion) {
      input = {
        source: "human_corrected", originalText: text,
        fields: humanFields(context.latestObservations),
      };
    } else {
      const assessment = await this.#dependencies.evaluateDeterministic(text);
      if (assessment.status !== "review_required" || assessment.reviewRequired !== true
        || assessment.quoteEligible !== false || assessment.permittedActions.length !== 0
        || assessment.extractor?.kind !== "deterministic" || assessment.fields.length !== 12) {
        throw new ClarificationServiceError("evidence_integrity_failed", "Deterministic extraction could not be verified.");
      }
      input = {
        source: "deterministic_proposal", originalText: text,
        fields: assessment.fields.map((field: AiCandidateField) => ({
          fieldName: field.fieldName,
          resolutionState: field.resolutionState,
          normalizedValue: field.normalizedValue,
          reasonCode: field.reasonCode,
          evidenceSpans: field.evidenceSpans,
        })),
      };
    }
    let plan: ClarificationPlan;
    try { plan = this.#dependencies.planner.build(input); }
    catch { throw new ClarificationServiceError("evidence_integrity_failed", "Clarification source validation failed."); }
    if (context.latestTermsVersion && expectedStatus(plan) !== context.latestTermsVersion.resolutionStatus) {
      throw new ClarificationServiceError("evidence_integrity_failed", "Clarification conflicts with the saved terms status.");
    }
    return {
      caseId, caseRowVersion: context.caseRowVersion,
      termsVersionNumber: context.latestTermsVersion?.versionNumber ?? null,
      plan,
    };
  }
}

export interface BuyerClarificationDependencies {
  readonly clarifications: CreatorClarificationService;
  readonly requests: BuyerRequestPersistencePort;
  readonly capabilities: CapabilityTokenPort;
  readonly clock: ClockPort;
}
export interface BuyerClarificationView {
  readonly assetTitle: string;
  readonly creatorDisplayName: string;
  readonly plan: ClarificationPlan;
  readonly answersAcceptedOnline: false;
}

/** No buyer email, internal case ID, token, or creator-only controls are returned. */
export class BuyerClarificationService {
  readonly #dependencies: BuyerClarificationDependencies;
  constructor(dependencies: BuyerClarificationDependencies) {
    this.#dependencies = dependencies;
  }
  async get(token: string): Promise<BuyerClarificationView> {
    if (!/^[A-Za-z0-9_-]{43,128}$/u.test(token)) {
      throw new ClarificationServiceError("capability_invalid", "This buyer clarification link is not available.");
    }
    const digest = await this.#dependencies.capabilities.digest(token);
    const context = await this.#dependencies.requests.findByCapabilityDigest(digest);
    if (!context || !context.requestSubmissionId || context.revokedAt
      || !Number.isFinite(Date.parse(context.expiresAt))
      || Date.parse(context.expiresAt) <= this.#dependencies.clock.now().getTime()
      || !context.allowedActions.includes("clarify") || context.asset.availability !== "active") {
      throw new ClarificationServiceError("capability_invalid", "This buyer clarification link is not available.");
    }
    const creatorView = await this.#dependencies.clarifications.get(context.caseId);
    return Object.freeze({
      assetTitle: context.asset.title,
      creatorDisplayName: context.asset.creatorDisplayName,
      plan: creatorView.plan,
      answersAcceptedOnline: false as const,
    });
  }
}
