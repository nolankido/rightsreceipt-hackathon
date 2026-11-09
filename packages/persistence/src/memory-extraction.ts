import type {
  AutomatedExtractionAudit, AutomatedExtractionRepositoryPort,
  AutomatedExtractionSnapshot,
} from "@rightsreceipt/application";
import type { MemoryBuyerRequestStore } from "./memory-buyer-requests";
import type { MemoryTermsReviewStore } from "./memory-rights-terms";

export function createMemoryExtractionRepository(
  buyerStore: MemoryBuyerRequestStore,
  reviewStore: MemoryTermsReviewStore,
): AutomatedExtractionRepositoryPort & {
  readonly audits: ReadonlyMap<string, readonly AutomatedExtractionAudit[]>;
  reset(): void;
} {
  const snapshots = new Map<string, AutomatedExtractionSnapshot>();
  const audits = new Map<string, AutomatedExtractionAudit[]>();
  return {
    audits,
    async getAutomated(caseId) {
      const snapshot = snapshots.get(caseId);
      return snapshot ? structuredClone(snapshot) : null;
    },
    async saveAutomated(attempt, observations, audit, expectedCaseRowVersion) {
      const licensingCase = buyerStore.cases.get(attempt.caseId);
      if (!licensingCase || licensingCase.caseOutcome !== "open"
        || !licensingCase.requestSubmissionId
        || licensingCase.rowVersion !== expectedCaseRowVersion
        || licensingCase.latestTermsVersionId !== null
        || licensingCase.latestExtractionAttemptId !== null
        || snapshots.has(attempt.caseId)
        || observations.length < 12
        || observations.some(row => row.extractionAttemptId !== attempt.extractionAttemptId)
        || audit.caseId !== attempt.caseId || audit.aggregateId !== attempt.extractionAttemptId
        || attempt.attemptNumber !== (reviewStore.attemptsByCase.get(attempt.caseId)?.length ?? 0) + 1) {
        throw new Error("Stale extraction: no proposal evidence was saved.");
      }
      snapshots.set(attempt.caseId, structuredClone({ attempt, observations }));
      audits.set(attempt.caseId, [...(audits.get(attempt.caseId) ?? []), structuredClone(audit)]);
      reviewStore.attemptsByCase.set(attempt.caseId, [
        ...(reviewStore.attemptsByCase.get(attempt.caseId) ?? []),
        { attemptNumber: attempt.attemptNumber, extractionAttemptId: attempt.extractionAttemptId },
      ]);
      reviewStore.observationsByAttempt.set(attempt.extractionAttemptId, structuredClone(observations));
      buyerStore.cases.set(attempt.caseId, {
        ...licensingCase,
        latestExtractionAttemptId: attempt.extractionAttemptId,
        updatedAt: attempt.completedAt,
        rowVersion: licensingCase.rowVersion + 1,
      });
    },
    reset() { snapshots.clear(); audits.clear(); },
  };
}
