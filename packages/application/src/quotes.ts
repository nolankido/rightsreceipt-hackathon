import type { TermsReviewPersistencePort, Sha256Port } from "./rights-terms";
import type { ClockPort, IdentifierPort } from "./index";
import type { CreatorWorkspaceRepositoryPort } from "./assets";
import {
  calculateQuote,
  parseAndValidatePricingPolicy,
  PricingValidationError,
  type PricingPolicyVersion,
  type QuoteCalculation,
  type QuoteLine,
} from "@rightsreceipt/pricing";

export interface QuoteRow {
  readonly quoteId: string;
  readonly caseId: string;
  readonly quoteVersionNumber: number;
  readonly termsVersionId: string;
  readonly pricingPolicyId: string;
  readonly pricingPolicyVersion: number;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly status: "current" | "superseded";
  readonly calculationHash: string;
  readonly createdAt: string;
}

export interface QuoteLineRow {
  readonly quoteLineId: string;
  readonly quoteId: string;
  readonly linePosition: number;
  readonly lineCode: QuoteLine["code"];
  readonly description: string;
  readonly amountCents: number;
  readonly createdAt: string;
}

export interface QuoteAuditRow {
  readonly auditEventId: string;
  readonly caseId: string;
  readonly aggregateType: "quote";
  readonly aggregateId: string;
  readonly eventType: "quote.generated";
  readonly actorType: "system";
  readonly payloadJson: string;
  readonly correlationId: string;
  readonly createdAt: string;
}

export interface QuoteAggregate {
  readonly record: QuoteRow;
  readonly lines: readonly QuoteLineRow[];
}

export interface QuoteRepositoryPort {
  getLatest(caseId: string): Promise<QuoteAggregate | null>;
  saveNew(
    quote: QuoteRow,
    lines: readonly QuoteLineRow[],
    audit: QuoteAuditRow,
    expectedCaseRowVersion: number,
  ): Promise<void>;
}

export interface PricingPolicyReaderPort {
  getAssignedActive(
    workspaceId: string,
    policyId: string,
    versionNumber: number,
  ): Promise<PricingPolicyVersion | null>;
}

export interface QuoteServiceDependencies {
  readonly workspaces: CreatorWorkspaceRepositoryPort;
  readonly terms: TermsReviewPersistencePort;
  readonly pricingPolicies: PricingPolicyReaderPort;
  readonly quotes: QuoteRepositoryPort;
  readonly identifiers: IdentifierPort;
  readonly clock: ClockPort;
  readonly hasher: Sha256Port;
}

export interface QuoteView {
  readonly caseId: string;
  readonly caseRowVersion: number;
  readonly termsVersionNumber: number | null;
  readonly status: "blocked" | "ready_for_pricing" | "quoted" | "stale_quote";
  readonly reason: string;
  readonly policy: {
    readonly pricingPolicyId: string;
    readonly versionNumber: number;
    readonly policyName: string;
    readonly currency: "USD";
  } | null;
  readonly quote: QuoteAggregate | null;
  readonly licensePeriod: {
    readonly startDate: string;
    readonly endDateExclusive: string;
    readonly lastPermittedDate: string;
  } | null;
}

export class QuoteServiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "QuoteServiceError";
    this.code = code;
  }
}

function quoteReason(code: string) {
  if (code === "incomplete" || code === "contradictory" || code === "unsupported") {
    return `Terms are ${code}. Resolve the rights review before generating a quote.`;
  }
  return "A complete, supported terms version is required before pricing.";
}

export class QuoteService {
  readonly #dependencies: QuoteServiceDependencies;

  constructor(dependencies: QuoteServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async getQuote(caseId: string): Promise<QuoteView> {
    const context = await this.#context(caseId);
    const terms = context.latestTermsVersion;
    const latest = await this.#dependencies.quotes.getLatest(caseId);
    const workspace = await this.#dependencies.workspaces.getDemoWorkspace();
    const policy = await this.#assignedPolicy(workspace, context.workspaceId);
    const displayedPolicy = policy
      ? {
          pricingPolicyId: policy.pricingPolicyId,
          versionNumber: policy.versionNumber,
          policyName: policy.policyName,
          currency: policy.currency,
        } : null;
    const common = {
      caseId,
      caseRowVersion: context.caseRowVersion,
      termsVersionNumber: terms?.versionNumber ?? null,
      policy: displayedPolicy,
    };
    if (!terms || terms.resolutionStatus !== "complete" || !policy) {
      return {
        ...common,
        status: "blocked",
        reason: policy ? quoteReason(terms?.resolutionStatus ?? "") : "An active assigned USD creator policy is required.",
        quote: null,
        licensePeriod: null,
      };
    }
    if (latest?.record.termsVersionId === terms.termsVersionId && latest.record.status === "current"
      && latest.record.pricingPolicyId === policy.pricingPolicyId
      && latest.record.pricingPolicyVersion === policy.versionNumber) {
      const calculated = calculateQuote(terms, policy);
      const policyHash = await this.#dependencies.hasher.sha256Hex(policy.rulesJson);
      const calculationHash = await this.#dependencies.hasher.sha256Hex(calculated.calculationCanonicalJson);
      if (policyHash !== policy.policyHash || latest.record.calculationHash !== calculationHash
        || latest.record.amountCents !== calculated.totalCents
        || latest.lines.length !== calculated.lineItems.length
        || latest.lines.some((line, index) => {
          const expected = calculated.lineItems[index];
          return !expected || line.linePosition !== index + 1
            || line.lineCode !== expected.code
            || line.description !== expected.description
            || line.amountCents !== expected.amountCents;
        })) {
        throw new QuoteServiceError("stored_quote_mismatch", "The saved quote disagrees with its verified deterministic calculation.");
      }
      return {
        ...common,
        status: "quoted",
        reason: "A version-bound deterministic quote is recorded. Creator approval and buyer acceptance are still required.",
        quote: latest,
        licensePeriod: {
          startDate: calculated.licenseStartDate,
          endDateExclusive: calculated.licenseEndDateExclusive,
          lastPermittedDate: calculated.lastPermittedDate,
        },
      };
    }
    return {
      ...common,
      status: latest ? "stale_quote" : "ready_for_pricing",
      reason: latest
        ? "An earlier quote belongs to a different terms or policy version. Generate a new quote."
        : "All twelve terms are supported. Generate the deterministic creator-policy quote.",
      quote: null,
      licensePeriod: null,
    };
  }

  async generateQuote(caseId: string, expectedCaseRowVersion: number): Promise<QuoteView> {
    const context = await this.#context(caseId);
    if (context.caseOutcome !== "open") {
      throw new QuoteServiceError("case_closed", "Only an open licensing case can be priced.");
    }
    if (context.caseRowVersion !== expectedCaseRowVersion) {
      throw new QuoteServiceError("stale_case", "The case changed. Reload before generating the quote.");
    }
    const terms = context.latestTermsVersion;
    if (!terms) {
      throw new QuoteServiceError("terms_incomplete", "The creator must resolve the rights review before quoting.");
    }
    const workspace = await this.#dependencies.workspaces.getDemoWorkspace();
    const policy = await this.#assignedPolicy(workspace, context.workspaceId);
    if (!policy) {
      throw new QuoteServiceError("policy_unavailable", "A matching active USD pricing policy is required.");
    }
    let calculated: QuoteCalculation;
    try {
      calculated = calculateQuote(terms, policy);
      parseAndValidatePricingPolicy(policy);
    } catch (error) {
      if (error instanceof PricingValidationError) {
        throw new QuoteServiceError(error.code, error.message);
      }
      throw error;
    }
    const actualPolicyHash = await this.#dependencies.hasher.sha256Hex(policy.rulesJson);
    if (actualPolicyHash !== policy.policyHash) {
      throw new QuoteServiceError("policy_integrity_failed", "The stored policy hash does not match the policy rules.");
    }
    const hash = await this.#dependencies.hasher.sha256Hex(calculated.calculationCanonicalJson);
    const latest = await this.#dependencies.quotes.getLatest(caseId);
    if (latest?.record.calculationHash === hash && latest.record.status === "current"
      && latest.record.termsVersionId === terms.termsVersionId) {
      return this.getQuote(caseId);
    }
    const createdAt = this.#dependencies.clock.now().toISOString();
    const quoteId = this.#dependencies.identifiers.create();
    const quote: QuoteRow = {
      quoteId,
      caseId,
      quoteVersionNumber: (latest?.record.quoteVersionNumber ?? 0) + 1,
      termsVersionId: terms.termsVersionId,
      pricingPolicyId: policy.pricingPolicyId,
      pricingPolicyVersion: policy.versionNumber,
      amountCents: calculated.totalCents,
      currency: "USD",
      status: "current",
      calculationHash: hash,
      createdAt,
    };
    const lines: QuoteLineRow[] = calculated.lineItems.map((line, index) => ({
      quoteLineId: this.#dependencies.identifiers.create(),
      quoteId,
      linePosition: index + 1,
      lineCode: line.code,
      description: line.description,
      amountCents: line.amountCents,
      createdAt,
    }));
    const audit: QuoteAuditRow = {
      auditEventId: this.#dependencies.identifiers.create(),
      caseId,
      aggregateType: "quote",
      aggregateId: quoteId,
      eventType: "quote.generated",
      actorType: "system",
      payloadJson: JSON.stringify({
        calculation_hash: hash,
        terms_version_id: terms.termsVersionId,
        policy_id: policy.pricingPolicyId,
        policy_version: policy.versionNumber,
        amount_cents: calculated.totalCents,
      }),
      correlationId: this.#dependencies.identifiers.create(),
      createdAt,
    };
    await this.#dependencies.quotes.saveNew(quote, lines, audit, expectedCaseRowVersion);
    return this.getQuote(caseId);
  }

  async #context(caseId: string) {
    const context = await this.#dependencies.terms.getCaseContext(caseId);
    if (!context) throw new QuoteServiceError("case_not_found", "The requested case is not available for pricing.");
    return context;
  }

  async #assignedPolicy(workspace: Awaited<ReturnType<CreatorWorkspaceRepositoryPort["getDemoWorkspace"]>>, caseWorkspaceId: string) {
    if (!workspace || workspace.workspaceId !== caseWorkspaceId
      || !workspace.defaultPricingPolicyId || !workspace.defaultPricingPolicyVersion) {
      return null;
    }
    return this.#dependencies.pricingPolicies.getAssignedActive(
      workspace.workspaceId,
      workspace.defaultPricingPolicyId,
      workspace.defaultPricingPolicyVersion,
    );
  }
}
