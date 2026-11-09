import type {
  PricingPolicyReaderPort,
  QuoteAggregate,
  QuoteRepositoryPort,
  QuoteAuditRow,
} from "@rightsreceipt/application";
import { SEED_POLICY_VERSION } from "@rightsreceipt/pricing";
import type { MemoryBuyerRequestStore } from "./memory-buyer-requests";

export interface MemoryQuotePersistence {
  readonly pricingPolicies: PricingPolicyReaderPort;
  readonly quotes: QuoteRepositoryPort;
  readonly auditEvents: ReadonlyMap<string, readonly QuoteAuditRow[]>;
  reset(): void;
}

export function createMemoryQuotePersistence(
  buyerStore: MemoryBuyerRequestStore,
): MemoryQuotePersistence {
  const history = new Map<string, QuoteAggregate[]>();
  const audits = new Map<string, QuoteAuditRow[]>();

  return {
    pricingPolicies: {
      async getAssignedActive(workspaceId, pricingPolicyId, versionNumber) {
        if (
          workspaceId !== SEED_POLICY_VERSION.workspaceId
          || pricingPolicyId !== SEED_POLICY_VERSION.pricingPolicyId
          || versionNumber !== SEED_POLICY_VERSION.versionNumber
        ) return null;
        return SEED_POLICY_VERSION;
      },
    },
    quotes: {
      async getLatest(caseId) {
        return history.get(caseId)?.at(-1) ?? null;
      },
      async saveNew(quote, lines, audit, expectedCaseRowVersion) {
        const currentCase = buyerStore.cases.get(quote.caseId);
        if (
          !currentCase || !currentCase.requestSubmissionId
          || currentCase.caseOutcome !== "open"
          || currentCase.rowVersion !== expectedCaseRowVersion
          || currentCase.latestTermsVersionId !== quote.termsVersionId
        ) throw new Error("Stale case or terms version. No quote was written.");
        if (!Number.isSafeInteger(quote.amountCents)
          || lines.reduce((sum, line) => sum + line.amountCents, 0) !== quote.amountCents) {
          throw new Error("Quote line items do not equal the exact integer-cent total.");
        }
        const previous = history.get(quote.caseId) ?? [];
        if (quote.quoteVersionNumber !== previous.length + 1
          || previous.some((existing) => existing.record.calculationHash === quote.calculationHash)) {
          throw new Error("Quote sequence or hash conflicts with existing history.");
        }
        const revisions = previous.map((existing) => ({
          ...existing,
          record: { ...existing.record, status: "superseded" as const },
        }));
        const newQuote = {
          record: Object.freeze({ ...quote }),
          lines: Object.freeze(lines.map((line) => Object.freeze({ ...line }))),
        };
        history.set(quote.caseId, [...revisions, newQuote]);
        audits.set(quote.caseId, [...(audits.get(quote.caseId) ?? []), Object.freeze({ ...audit })]);
        buyerStore.cases.set(quote.caseId, {
          ...currentCase,
          latestQuoteId: quote.quoteId,
          updatedAt: quote.createdAt,
          rowVersion: currentCase.rowVersion + 1,
        });
      },
    },
    auditEvents: audits,
    reset() {
      history.clear();
      audits.clear();
    },
  };
}
