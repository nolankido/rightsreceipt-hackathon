import {
  TermsReviewPersistenceError,
  type TermsReviewPersistencePort,
} from "@rightsreceipt/application";
import type {
  AssetRecord,
  AuditEventRecord,
  ExtractionAttemptRecord,
  FieldObservationRecord,
  TermsVersionRecord,
} from "@rightsreceipt/domain";
import type { MemoryBuyerRequestStore } from "./memory-buyer-requests";

export interface MemoryTermsReviewStore {
  readonly attemptsByCase: Map<string, Pick<ExtractionAttemptRecord, "attemptNumber" | "extractionAttemptId">[]>;
  readonly observationsByAttempt: Map<string, readonly FieldObservationRecord[]>;
  readonly termsVersionsByCase: Map<string, TermsVersionRecord[]>;
  readonly auditEventsByCase: Map<string, AuditEventRecord[]>;
}

export function createMemoryTermsReviewPersistence(
  assets: Map<string, AssetRecord>,
  buyerStore: MemoryBuyerRequestStore,
  store: MemoryTermsReviewStore = {
    attemptsByCase: new Map(),
    observationsByAttempt: new Map(),
    termsVersionsByCase: new Map(),
    auditEventsByCase: new Map(),
  },
): TermsReviewPersistencePort & { reset(): void } {
  return {
    async listSubmittedCases(workspaceId) {
      return [...buyerStore.cases.values()]
        .filter((record) =>
          record.workspaceId === workspaceId && record.requestSubmissionId !== null)
        .map((record) => {
          const asset = assets.get(record.assetId);
          const submission = buyerStore.submissionsByCase.get(record.caseId);
          const versions = store.termsVersionsByCase.get(record.caseId) ?? [];
          const latest = versions.at(-1) ?? null;
          if (!asset || !submission) return null;
          return {
            caseId: record.caseId,
            caseRowVersion: record.rowVersion,
            assetId: asset.assetId,
            assetTitle: asset.title,
            assetPreviewReference: asset.previewReference,
            buyerOrganization: submission.buyerOrganization,
            submittedAt: submission.submittedAt,
            termsVersionNumber: latest?.versionNumber ?? null,
            resolutionStatus: latest?.resolutionStatus ?? null,
          };
        })
        .filter((record): record is NonNullable<typeof record> => record !== null)
        .sort((left, right) =>
          right.submittedAt.localeCompare(left.submittedAt)
          || left.caseId.localeCompare(right.caseId));
    },

    async getCaseContext(caseId) {
      const licensingCase = buyerStore.cases.get(caseId);
      if (!licensingCase || !licensingCase.requestSubmissionId) return null;
      const asset = assets.get(licensingCase.assetId);
      const request = buyerStore.submissionsByCase.get(caseId);
      if (!asset || !request) return null;
      const attempts = store.attemptsByCase.get(caseId) ?? [];
      const termsVersions = store.termsVersionsByCase.get(caseId) ?? [];
      const latestAttempt = attempts.at(-1) ?? null;
      return {
        caseId,
        workspaceId: licensingCase.workspaceId,
        caseOutcome: licensingCase.caseOutcome,
        caseRowVersion: licensingCase.rowVersion,
        asset,
        request,
        latestAttemptNumber: latestAttempt?.attemptNumber ?? 0,
        latestTermsVersion: termsVersions.at(-1) ?? null,
        latestObservations: latestAttempt
          ? store.observationsByAttempt.get(latestAttempt.extractionAttemptId) ?? []
          : [],
      };
    },

    async saveManualRevision(revision, expectedCaseRowVersion) {
      const caseId = revision.termsVersion.caseId;
      const licensingCase = buyerStore.cases.get(caseId);
      if (
        !licensingCase
        || !licensingCase.requestSubmissionId
        || licensingCase.caseOutcome !== "open"
        || licensingCase.rowVersion !== expectedCaseRowVersion
      ) {
        throw new TermsReviewPersistenceError(
          "stale_case",
          "The licensing case changed before the review was saved.",
        );
      }

      const existingVersions = store.termsVersionsByCase.get(caseId) ?? [];
      if (existingVersions.some((version) => version.termsHash === revision.termsVersion.termsHash)) {
        throw new TermsReviewPersistenceError(
          "duplicate_terms",
          "An identical terms version already exists.",
        );
      }
      if (
        revision.termsVersion.versionNumber !== existingVersions.length + 1
        || revision.extractionAttempt.attemptNumber
          !== (store.attemptsByCase.get(caseId)?.length ?? 0) + 1
      ) {
        throw new TermsReviewPersistenceError(
          "persistence_conflict",
          "The manual review version sequence is inconsistent.",
        );
      }

      const attempts = [...(store.attemptsByCase.get(caseId) ?? []), revision.extractionAttempt];
      const versions = [...existingVersions, revision.termsVersion];
      const audits = [...(store.auditEventsByCase.get(caseId) ?? []), revision.auditEvent];

      store.attemptsByCase.set(caseId, attempts);
      store.observationsByAttempt.set(
        revision.extractionAttempt.extractionAttemptId,
        Object.freeze([...revision.observations]),
      );
      store.termsVersionsByCase.set(caseId, versions);
      store.auditEventsByCase.set(caseId, audits);
      buyerStore.cases.set(caseId, {
        ...licensingCase,
        latestExtractionAttemptId: revision.extractionAttempt.extractionAttemptId,
        latestTermsVersionId: revision.termsVersion.termsVersionId,
        updatedAt: revision.termsVersion.createdAt,
        rowVersion: licensingCase.rowVersion + 1,
      });
    },

    reset() {
      store.attemptsByCase.clear();
      store.observationsByAttempt.clear();
      store.termsVersionsByCase.clear();
      store.auditEventsByCase.clear();
    },
  };
}
