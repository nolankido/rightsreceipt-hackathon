import {
  RIGHTS_FIELD_NAMES,
  canonicalizeManualRightsReview,
  createManualTermsRevision,
  emptyRightsFieldViews,
  manualRightsReviewCanonicalJson,
  rightsFieldViewsFromObservations,
  type ManualRightsReviewInput,
  type ManualTermsRevision,
  type RightsReviewCaseContext,
  type RightsFieldReviewView,
  type TermsResolutionStatus,
} from "@rightsreceipt/domain";
import type { CreatorWorkspaceRepositoryPort } from "./assets";
import type { ClockPort, IdentifierPort } from "./index";

export interface TermsReviewCaseSummaryRecord {
  readonly caseId: string;
  readonly caseRowVersion: number;
  readonly assetId: string;
  readonly assetTitle: string;
  readonly assetPreviewReference: string;
  readonly buyerOrganization: string;
  readonly submittedAt: string;
  readonly termsVersionNumber: number | null;
  readonly resolutionStatus: TermsResolutionStatus | null;
}

export interface TermsReviewPersistencePort {
  listSubmittedCases(
    workspaceId: string,
  ): Promise<readonly TermsReviewCaseSummaryRecord[]>;
  getCaseContext(caseId: string): Promise<RightsReviewCaseContext | null>;
  saveManualRevision(
    revision: ManualTermsRevision,
    expectedCaseRowVersion: number,
  ): Promise<void>;
}

export interface Sha256Port {
  sha256Hex(value: string): Promise<string>;
}

export interface TermsReviewServiceDependencies {
  readonly workspaces: CreatorWorkspaceRepositoryPort;
  readonly terms: TermsReviewPersistencePort;
  readonly identifiers: IdentifierPort;
  readonly clock: ClockPort;
  readonly hasher: Sha256Port;
  readonly actorReference?: string;
}

export interface TermsReviewCaseSummaryView extends TermsReviewCaseSummaryRecord {
  readonly stage:
    | "review_not_started"
    | "needs_resolution"
    | "unsupported"
    | "contradictory"
    | "ready_for_pricing";
}

export interface QuoteReadinessView {
  readonly status: "blocked" | "ready_for_pricing";
  readonly reasons: readonly string[];
}

export interface TermsReviewView {
  readonly caseId: string;
  readonly caseRowVersion: number;
  readonly caseOutcome: "open" | "rejected" | "canceled";
  readonly asset: RightsReviewCaseContext["asset"];
  readonly buyer: {
    readonly name: string;
    readonly organization: string;
    readonly email: string;
  };
  readonly request: {
    readonly originalText: string;
    readonly submittedAt: string;
  };
  readonly currentTermsVersion: number | null;
  readonly resolutionStatus: TermsResolutionStatus | "not_started";
  readonly fields: readonly RightsFieldReviewView[];
  readonly quoteReadiness: QuoteReadinessView;
}

export class TermsReviewPersistenceError extends Error {
  readonly code: "stale_case" | "duplicate_terms" | "persistence_conflict";

  constructor(code: TermsReviewPersistenceError["code"], message: string) {
    super(message);
    this.name = "TermsReviewPersistenceError";
    this.code = code;
  }
}

export class TermsReviewServiceError extends Error {
  readonly code:
    | "workspace_unavailable"
    | "case_not_found"
    | "request_required"
    | "case_closed"
    | "terms_unchanged"
    | "stale_case"
    | "persistence_conflict";

  constructor(code: TermsReviewServiceError["code"], message: string) {
    super(message);
    this.name = "TermsReviewServiceError";
    this.code = code;
  }
}

function stageFromResolution(
  resolutionStatus: TermsResolutionStatus | null,
): TermsReviewCaseSummaryView["stage"] {
  switch (resolutionStatus) {
    case null:
      return "review_not_started";
    case "complete":
      return "ready_for_pricing";
    case "unsupported":
      return "unsupported";
    case "contradictory":
      return "contradictory";
    case "incomplete":
      return "needs_resolution";
  }
}

function quoteReadiness(
  fields: readonly RightsFieldReviewView[],
  status: TermsResolutionStatus | "not_started",
): QuoteReadinessView {
  if (status === "complete") {
    return {
      status: "ready_for_pricing",
      reasons: [
        "All twelve fields use supported P0 values. Pricing is performed by the deterministic pricing turn, not by this review screen.",
      ],
    };
  }

  const counts = {
    unresolved: fields.filter((field) => field.resolutionState === "unresolved").length,
    contradictory: fields.filter((field) => field.resolutionState === "contradictory").length,
    unsupported: fields.filter((field) => field.resolutionState === "unsupported").length,
  };
  const reasons: string[] = [];
  if (counts.unresolved > 0) {
    reasons.push(`${counts.unresolved} required field${counts.unresolved === 1 ? " is" : "s are"} unresolved.`);
  }
  if (counts.contradictory > 0) {
    reasons.push(`${counts.contradictory} field${counts.contradictory === 1 ? " has" : "s have"} contradictory information.`);
  }
  if (counts.unsupported > 0) {
    reasons.push(`${counts.unsupported} field${counts.unsupported === 1 ? " is" : "s are"} outside the supported P0 scope.`);
  }
  if (reasons.length === 0) reasons.push("The structured review has not been completed.");
  return { status: "blocked", reasons };
}

function buildView(context: RightsReviewCaseContext): TermsReviewView {
  const fields = context.latestObservations.length > 0
    ? rightsFieldViewsFromObservations(context.latestObservations)
    : emptyRightsFieldViews();
  const resolutionStatus = context.latestTermsVersion?.resolutionStatus ?? "not_started";
  return {
    caseId: context.caseId,
    caseRowVersion: context.caseRowVersion,
    caseOutcome: context.caseOutcome,
    asset: context.asset,
    buyer: {
      name: context.request.buyerName,
      organization: context.request.buyerOrganization,
      email: context.request.buyerEmail,
    },
    request: {
      originalText: context.request.intendedUseText,
      submittedAt: context.request.submittedAt,
    },
    currentTermsVersion: context.latestTermsVersion?.versionNumber ?? null,
    resolutionStatus,
    fields,
    quoteReadiness: quoteReadiness(fields, resolutionStatus),
  };
}

export class TermsReviewService {
  readonly #dependencies: TermsReviewServiceDependencies;

  constructor(dependencies: TermsReviewServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async listCases(): Promise<readonly TermsReviewCaseSummaryView[]> {
    const workspace = await this.#dependencies.workspaces.getDemoWorkspace();
    if (!workspace) {
      throw new TermsReviewServiceError(
        "workspace_unavailable",
        "The seeded creator workspace is unavailable.",
      );
    }
    const cases = await this.#dependencies.terms.listSubmittedCases(workspace.workspaceId);
    return cases.map((record) => ({
      ...record,
      stage: stageFromResolution(record.resolutionStatus),
    }));
  }

  async getReview(caseId: string): Promise<TermsReviewView> {
    const context = await this.#loadOpenContext(caseId);
    return buildView(context);
  }

  async saveManualReview(
    caseId: string,
    expectedCaseRowVersion: number,
    input: ManualRightsReviewInput,
    correlationId?: string,
  ): Promise<TermsReviewView> {
    const context = await this.#loadOpenContext(caseId);
    if (context.caseRowVersion !== expectedCaseRowVersion) {
      throw new TermsReviewServiceError(
        "stale_case",
        "The case changed after this review was loaded. Reload before saving corrections.",
      );
    }

    const canonicalInput = canonicalizeManualRightsReview(input);
    const canonicalJson = manualRightsReviewCanonicalJson(canonicalInput);
    const [termsHash, inputHash] = await Promise.all([
      this.#dependencies.hasher.sha256Hex(canonicalJson),
      this.#dependencies.hasher.sha256Hex(context.request.intendedUseText),
    ]);
    if (context.latestTermsVersion?.termsHash === termsHash) {
      throw new TermsReviewServiceError(
        "terms_unchanged",
        "No material field changed from the current terms version.",
      );
    }

    const createdAt = this.#dependencies.clock.now().toISOString();
    const fieldObservationIds = Object.fromEntries(
      RIGHTS_FIELD_NAMES.map((field) => [field, this.#dependencies.identifiers.create()]),
    ) as Record<(typeof RIGHTS_FIELD_NAMES)[number], string>;

    const revision = createManualTermsRevision(canonicalInput, {
      caseId,
      extractionAttemptId: this.#dependencies.identifiers.create(),
      fieldObservationIds,
      termsVersionId: this.#dependencies.identifiers.create(),
      auditEventId: this.#dependencies.identifiers.create(),
      attemptNumber: context.latestAttemptNumber + 1,
      versionNumber: (context.latestTermsVersion?.versionNumber ?? 0) + 1,
      inputHash,
      termsHash,
      createdAt,
      actorReference: this.#dependencies.actorReference ?? "demo-creator",
      correlationId: correlationId ?? this.#dependencies.identifiers.create(),
    });

    try {
      await this.#dependencies.terms.saveManualRevision(
        revision,
        expectedCaseRowVersion,
      );
    } catch (error) {
      if (error instanceof TermsReviewPersistenceError) {
        const code = error.code === "stale_case"
          ? "stale_case"
          : error.code === "duplicate_terms"
            ? "terms_unchanged"
            : "persistence_conflict";
        throw new TermsReviewServiceError(code, error.message);
      }
      throw error;
    }

    const updated = await this.#loadOpenContext(caseId);
    return buildView(updated);
  }

  async #loadOpenContext(caseId: string): Promise<RightsReviewCaseContext> {
    const context = await this.#dependencies.terms.getCaseContext(caseId);
    if (!context) {
      throw new TermsReviewServiceError(
        "case_not_found",
        "The requested licensing case does not exist.",
      );
    }
    if (!context.request) {
      throw new TermsReviewServiceError(
        "request_required",
        "A buyer request must be submitted before structured terms can be reviewed.",
      );
    }
    if (context.caseOutcome !== "open") {
      throw new TermsReviewServiceError(
        "case_closed",
        "Closed cases cannot receive a new terms revision.",
      );
    }
    return context;
  }
}
