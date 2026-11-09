import { describe, expect, it } from "vitest";
import {
  RIGHTS_FIELD_NAMES,
  createManualTermsRevision,
  type AssetRecord,
  type BuyerRequestSubmissionRecord,
} from "@rightsreceipt/domain";
import { TermsReviewPersistenceError } from "@rightsreceipt/application";
import { createMemoryTermsReviewPersistence } from "./memory-rights-terms";
import type { MemoryBuyerRequestStore } from "./memory-buyer-requests";

const caseId = "10000000-0000-4000-8000-000000000001";
const asset: AssetRecord = {
  assetId: "00000000-0000-4000-8000-000000000003",
  workspaceId: "00000000-0000-4000-8000-000000000001",
  title: "Harbor After Rain",
  assetType: "photograph",
  creatorDisplayName: "Maya Chen",
  provenanceNote: "Project-owned demo image.",
  fingerprintAlgorithm: "sha256",
  fingerprintValue: "a".repeat(64),
  previewReference: "/demo/harbor-after-rain.svg",
  availability: "active",
  createdAt: "2026-10-25T12:00:00.000Z",
  updatedAt: "2026-10-25T12:00:00.000Z",
  rowVersion: 1,
};
const request: BuyerRequestSubmissionRecord = {
  requestSubmissionId: "10000000-0000-4000-8000-000000000003",
  caseId,
  buyerName: "Jordan Lee",
  buyerOrganization: "Cedar & Tide Travel",
  buyerEmail: "jordan@example.test",
  intendedUseText:
    "We request paid Instagram and Facebook use in the United States and Canada for ninety days.",
  normalizedText:
    "We request paid Instagram and Facebook use in the United States and Canada for ninety days.",
  consentCopyVersion: "buyer-request-v1",
  consentAcknowledged: true,
  submittedAt: "2026-10-25T12:30:00.000Z",
};

function completeReview() {
  return {
    fields: {
      use_purpose: { state: "resolved", value: "commercial" },
      channels: { state: "resolved", value: ["instagram_paid", "facebook_paid"] },
      paid_advertising: { state: "resolved", value: true },
      territories: { state: "resolved", value: ["US", "CA"] },
      start_date: { state: "resolved", value: "2026-11-01" },
      duration_days: { state: "resolved", value: 90 },
      max_impressions: { state: "resolved", value: 500000 },
      exclusivity: { state: "resolved", value: "non_exclusive" },
      modification_scope: { state: "resolved", value: "crop_only" },
      attribution: { state: "resolved", value: "not_required" },
      sublicensing: { state: "resolved", value: "prohibited" },
      ai_use: { state: "resolved", value: "prohibited" },
    },
  } as const;
}

function revision() {
  const ids = Object.fromEntries(
    RIGHTS_FIELD_NAMES.map((field, index) => [
      field,
      `20000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
    ]),
  ) as Record<(typeof RIGHTS_FIELD_NAMES)[number], string>;
  return createManualTermsRevision(completeReview(), {
    caseId,
    extractionAttemptId: "20000000-0000-4000-8000-000000000001",
    fieldObservationIds: ids,
    termsVersionId: "20000000-0000-4000-8000-000000000002",
    auditEventId: "20000000-0000-4000-8000-000000000003",
    attemptNumber: 1,
    versionNumber: 1,
    inputHash: "a".repeat(64),
    termsHash: "b".repeat(64),
    createdAt: "2026-10-26T12:00:00.000Z",
    actorReference: "demo-creator",
    correlationId: "persistence-test",
  });
}

function setup() {
  const assets = new Map([[asset.assetId, asset]]);
  const buyerStore: MemoryBuyerRequestStore = {
    cases: new Map([
      [
        caseId,
        {
          caseId,
          workspaceId: asset.workspaceId,
          assetId: asset.assetId,
          caseOutcome: "open",
          createdAt: "2026-10-25T12:00:00.000Z",
          updatedAt: request.submittedAt,
          rowVersion: 2,
          requestSubmissionId: request.requestSubmissionId,
          latestExtractionAttemptId: null,
          latestTermsVersionId: null,
        },
      ],
    ]),
    capabilitiesByDigest: new Map(),
    submissionsByCase: new Map([[caseId, request]]),
  };
  return {
    repository: createMemoryTermsReviewPersistence(assets, buyerStore),
    buyerStore,
  };
}

describe("memory terms review persistence", () => {
  it("lists submitted cases and reloads a manual revision", async () => {
    const { repository, buyerStore } = setup();
    expect(await repository.listSubmittedCases(asset.workspaceId)).toHaveLength(1);
    await repository.saveManualRevision(revision(), 2);
    const context = await repository.getCaseContext(caseId);
    expect(context?.latestTermsVersion?.versionNumber).toBe(1);
    expect(context?.latestObservations).toHaveLength(12);
    expect(context?.latestObservations.every((item) => item.provenance === "human")).toBe(true);
    expect(buyerStore.cases.get(caseId)?.rowVersion).toBe(3);
  });

  it("rejects stale expected case versions without mutation", async () => {
    const { repository } = setup();
    await expect(repository.saveManualRevision(revision(), 1)).rejects.toBeInstanceOf(
      TermsReviewPersistenceError,
    );
    expect((await repository.getCaseContext(caseId))?.latestTermsVersion).toBeNull();
  });
});
