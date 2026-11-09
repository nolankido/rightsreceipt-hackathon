import type {
  BuyerRequestPersistencePort,
  CreatorAssetRepositoryPort,
  CreatorWorkspaceRepositoryPort,
  PricingPolicyAssignmentPort,
  TermsReviewPersistencePort,
  AutomatedExtractionRepositoryPort,
} from "@rightsreceipt/application";
import type { AssetRecord, WorkspaceRecord } from "@rightsreceipt/domain";
import {
  createMemoryBuyerRequestPersistence,
  type MemoryBuyerRequestStore,
} from "./memory-buyer-requests";
import { createMemoryTermsReviewPersistence, type MemoryTermsReviewStore } from "./memory-rights-terms";
import { createMemoryExtractionRepository } from "./memory-extraction";
import { createMemoryQuotePersistence, type MemoryQuotePersistence } from "./memory-quotes";

const SEEDED_WORKSPACE: WorkspaceRecord = Object.freeze({
  workspaceId: "00000000-0000-4000-8000-000000000001",
  displayName: "Maya Chen",
  mode: "demo",
  defaultPricingPolicyId: "00000000-0000-4000-8000-000000000002",
  defaultPricingPolicyVersion: 1,
  createdAt: "2026-10-25T12:00:00.000Z",
  updatedAt: "2026-10-25T12:00:00.000Z",
  rowVersion: 1,
});

const SEEDED_ASSET: AssetRecord = Object.freeze({
  assetId: "00000000-0000-4000-8000-000000000003",
  workspaceId: SEEDED_WORKSPACE.workspaceId,
  title: "Harbor After Rain",
  assetType: "photograph",
  creatorDisplayName: "Maya Chen",
  provenanceNote:
    "Project-owned demonstration image for the RightsReceipt hackathon entry. The fingerprint identifies this seeded representation only and does not prove ownership.",
  fingerprintAlgorithm: "sha256",
  fingerprintValue: "aeae6d66d7b96a628239e1802ee5e0cd180ddccc6cc924f8fb125f9da5db0345",
  previewReference: "/demo/harbor-after-rain.svg",
  availability: "active",
  createdAt: "2026-10-25T12:00:00.000Z",
  updatedAt: "2026-10-25T12:00:00.000Z",
  rowVersion: 1,
});

export interface MemoryAssetPersistence {
  readonly workspaces: CreatorWorkspaceRepositoryPort;
  readonly assets: CreatorAssetRepositoryPort;
  readonly pricingPolicies: PricingPolicyAssignmentPort;
  readonly buyerRequests: BuyerRequestPersistencePort;
  readonly termsReviews: TermsReviewPersistencePort;
  readonly automatedExtraction: AutomatedExtractionRepositoryPort;
  readonly quotePersistence: MemoryQuotePersistence;
  reset(): void;
}

export function createMemoryAssetPersistence(): MemoryAssetPersistence {
  const records = new Map<string, AssetRecord>();
  const buyerStore: MemoryBuyerRequestStore = {
    cases: new Map(),
    capabilitiesByDigest: new Map(),
    submissionsByCase: new Map(),
  };
  const buyerRequests = createMemoryBuyerRequestPersistence(records, buyerStore);
  const termsStore: MemoryTermsReviewStore = {
    attemptsByCase: new Map(), observationsByAttempt: new Map(),
    termsVersionsByCase: new Map(), auditEventsByCase: new Map(),
  };
  const termsReviews = createMemoryTermsReviewPersistence(records, buyerStore, termsStore);
  const automatedExtraction = createMemoryExtractionRepository(buyerStore, termsStore);
  const quotePersistence = createMemoryQuotePersistence(buyerStore);

  function reset() {
    records.clear();
    records.set(SEEDED_ASSET.assetId, SEEDED_ASSET);
    buyerRequests.reset();
    termsReviews.reset();
    automatedExtraction.reset();
    quotePersistence.reset();
  }

  reset();

  return {
    workspaces: {
      getDemoWorkspace: async () => SEEDED_WORKSPACE,
    },
    assets: {
      getById: async (assetId) => records.get(assetId) ?? null,
      listByWorkspace: async (workspaceId) =>
        [...records.values()]
          .filter((asset) => asset.workspaceId === workspaceId)
          .sort((left, right) =>
            left.createdAt.localeCompare(right.createdAt)
            || left.title.localeCompare(right.title),
          ),
      insert: async (record) => {
        if (records.has(record.assetId)) {
          throw new Error("Asset identifier already exists.");
        }
        records.set(record.assetId, Object.freeze({ ...record }));
      },
      countCases: async (assetId) => buyerRequests.countCases(assetId),
    },
    pricingPolicies: {
      getActiveAssignment: async (pricingPolicyId, versionNumber) =>
        pricingPolicyId === SEEDED_WORKSPACE.defaultPricingPolicyId
        && versionNumber === SEEDED_WORKSPACE.defaultPricingPolicyVersion
          ? {
              pricingPolicyId,
              versionNumber,
              policyName: "Harbor demo policy",
              currency: "USD",
            }
          : null,
    },
    buyerRequests,
    termsReviews,
    automatedExtraction,
    quotePersistence,
    reset,
  };
}
