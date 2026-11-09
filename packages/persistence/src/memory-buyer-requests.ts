import type {
  BuyerRequestPersistencePort,
} from "@rightsreceipt/application";
import type {
  AssetRecord,
  BuyerCapabilityRecord,
  BuyerRequestLinkContext,
  BuyerRequestSubmissionRecord,
  LicensingCaseDraftRecord,
} from "@rightsreceipt/domain";

export interface MemoryBuyerCaseRecord
  extends Omit<LicensingCaseDraftRecord, "rowVersion"> {
  readonly rowVersion: number;
  readonly requestSubmissionId: string | null;
  readonly latestExtractionAttemptId: string | null;
  readonly latestTermsVersionId: string | null;
  readonly latestQuoteId?: string | null;
}

export interface MemoryBuyerRequestStore {
  readonly cases: Map<string, MemoryBuyerCaseRecord>;
  readonly capabilitiesByDigest: Map<string, BuyerCapabilityRecord>;
  readonly submissionsByCase: Map<string, BuyerRequestSubmissionRecord>;
}

export type MemoryBuyerRequestPersistence = BuyerRequestPersistencePort & {
  readonly store: MemoryBuyerRequestStore;
  reset(): void;
  countCases(assetId: string): number;
};

export function createMemoryBuyerRequestPersistence(
  assets: Map<string, AssetRecord>,
  store: MemoryBuyerRequestStore = {
    cases: new Map(),
    capabilitiesByDigest: new Map(),
    submissionsByCase: new Map(),
  },
): MemoryBuyerRequestPersistence {
  return {
    store,
    async createRequestLink(licensingCase, capability) {
      if (store.cases.has(licensingCase.caseId)) {
        throw new Error("Licensing case identifier already exists.");
      }
      if (store.capabilitiesByDigest.has(capability.tokenDigestSha256)) {
        throw new Error("Buyer capability digest already exists.");
      }
      store.cases.set(licensingCase.caseId, {
        ...licensingCase,
        requestSubmissionId: null,
        latestExtractionAttemptId: null,
        latestTermsVersionId: null,
      });
      store.capabilitiesByDigest.set(
        capability.tokenDigestSha256,
        Object.freeze({ ...capability }),
      );
    },

    async findByCapabilityDigest(tokenDigestSha256) {
      const capability = store.capabilitiesByDigest.get(tokenDigestSha256);
      if (!capability) return null;
      const licensingCase = store.cases.get(capability.caseId);
      if (!licensingCase) return null;
      const asset = assets.get(licensingCase.assetId);
      if (!asset) return null;

      const context: BuyerRequestLinkContext = {
        caseId: licensingCase.caseId,
        asset,
        allowedActions: capability.allowedActions,
        issuedAt: capability.issuedAt,
        expiresAt: capability.expiresAt,
        revokedAt: capability.revokedAt,
        requestSubmissionId: licensingCase.requestSubmissionId,
      };
      return context;
    },

    async submitRequest(record) {
      const licensingCase = store.cases.get(record.caseId);
      if (!licensingCase || licensingCase.requestSubmissionId) {
        throw new Error("Buyer request cannot be submitted for this case.");
      }
      store.submissionsByCase.set(
        record.caseId,
        Object.freeze({ ...record }),
      );
      store.cases.set(record.caseId, {
        ...licensingCase,
        requestSubmissionId: record.requestSubmissionId,
        updatedAt: record.submittedAt,
        rowVersion: licensingCase.rowVersion + 1,
      });
    },

    countCases(assetId) {
      return [...store.cases.values()].filter((record) => record.assetId === assetId).length;
    },

    reset() {
      store.cases.clear();
      store.capabilitiesByDigest.clear();
      store.submissionsByCase.clear();
    },
  };
}
