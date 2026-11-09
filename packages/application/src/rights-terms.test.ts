import { describe, expect, it } from "vitest";
import type {
  ManualTermsRevision,
  RightsReviewCaseContext,
} from "@rightsreceipt/domain";
import {
  TermsReviewPersistenceError,
  TermsReviewService,
  type TermsReviewPersistencePort,
} from "./rights-terms";

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

function baseContext(): RightsReviewCaseContext {
  return {
    caseId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000001",
    caseOutcome: "open",
    caseRowVersion: 2,
    asset: {
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
    },
    request: {
      requestSubmissionId: "10000000-0000-4000-8000-000000000003",
      caseId: "10000000-0000-4000-8000-000000000001",
      buyerName: "Jordan Lee",
      buyerOrganization: "Cedar & Tide Travel",
      buyerEmail: "jordan@example.test",
      intendedUseText:
        "We request paid Instagram and Facebook use in the US and Canada for ninety days.",
      normalizedText:
        "We request paid Instagram and Facebook use in the US and Canada for ninety days.",
      consentCopyVersion: "buyer-request-v1",
      consentAcknowledged: true,
      submittedAt: "2026-10-25T12:30:00.000Z",
    },
    latestAttemptNumber: 0,
    latestTermsVersion: null,
    latestObservations: [],
  };
}

function service(options: { stale?: boolean } = {}) {
  let context = baseContext();
  let counter = 0;
  const persistence: TermsReviewPersistencePort = {
    listSubmittedCases: async () => [
      {
        caseId: context.caseId,
        caseRowVersion: context.caseRowVersion,
        assetId: context.asset.assetId,
        assetTitle: context.asset.title,
        assetPreviewReference: context.asset.previewReference,
        buyerOrganization: context.request.buyerOrganization,
        submittedAt: context.request.submittedAt,
        termsVersionNumber: context.latestTermsVersion?.versionNumber ?? null,
        resolutionStatus: context.latestTermsVersion?.resolutionStatus ?? null,
      },
    ],
    getCaseContext: async () => context,
    saveManualRevision: async (
      revision: ManualTermsRevision,
      expectedCaseRowVersion: number,
    ) => {
      if (options.stale || expectedCaseRowVersion !== context.caseRowVersion) {
        throw new TermsReviewPersistenceError("stale_case", "Stale review.");
      }
      context = {
        ...context,
        caseRowVersion: context.caseRowVersion + 1,
        latestAttemptNumber: revision.extractionAttempt.attemptNumber,
        latestTermsVersion: revision.termsVersion,
        latestObservations: revision.observations,
      };
    },
  };
  return new TermsReviewService({
    workspaces: {
      getDemoWorkspace: async () => ({
        workspaceId: context.workspaceId,
        displayName: "Maya Chen",
        mode: "demo",
        defaultPricingPolicyId: "00000000-0000-4000-8000-000000000002",
        defaultPricingPolicyVersion: 1,
        createdAt: "2026-10-25T12:00:00.000Z",
        updatedAt: "2026-10-25T12:00:00.000Z",
        rowVersion: 1,
      }),
    },
    terms: persistence,
    identifiers: {
      create: () => `20000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    },
    clock: {
      now: () => new Date("2026-10-26T12:00:00.000Z"),
      todayUtc: () => "2026-10-26",
    },
    hasher: {
      sha256Hex: async (value) =>
        value.includes("rights-review-v1") ? "b".repeat(64) : "a".repeat(64),
    },
  });
}

describe("terms review service", () => {
  it("shows all fields unresolved before the first manual revision", async () => {
    const view = await service().getReview(baseContext().caseId);
    expect(view.currentTermsVersion).toBeNull();
    expect(view.fields).toHaveLength(12);
    expect(view.quoteReadiness.status).toBe("blocked");
  });

  it("saves and reloads a complete human-entered version", async () => {
    const instance = service();
    const view = await instance.saveManualReview(
      baseContext().caseId,
      2,
      completeReview(),
      "test-correlation",
    );
    expect(view.currentTermsVersion).toBe(1);
    expect(view.resolutionStatus).toBe("complete");
    expect(view.quoteReadiness.status).toBe("ready_for_pricing");
    expect(view.fields.every((field) => field.provenance === "human")).toBe(true);
  });

  it("surfaces stale persistence as a typed service failure", async () => {
    await expect(
      service({ stale: true }).saveManualReview(
        baseContext().caseId,
        2,
        completeReview(),
      ),
    ).rejects.toMatchObject({ code: "stale_case" });
  });
});
