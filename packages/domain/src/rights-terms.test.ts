import { describe, expect, it } from "vitest";
import {
  RIGHTS_FIELD_NAMES,
  RightsReviewValidationError,
  canonicalizeManualRightsReview,
  createManualTermsRevision,
  deriveTermsResolutionStatus,
  emptyRightsFieldViews,
  rightsFieldViewsFromObservations,
} from "./rights-terms";

function completeReview(overrides = {}) {
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
      ...overrides,
    },
  } as const;
}

describe("structured rights review", () => {
  it("exposes twelve unresolved fields before a revision exists", () => {
    expect(emptyRightsFieldViews()).toHaveLength(12);
    expect(emptyRightsFieldViews().map((field) => field.fieldName)).toEqual(
      RIGHTS_FIELD_NAMES,
    );
  });

  it("canonicalizes supported array values and completes the contract", () => {
    const canonical = canonicalizeManualRightsReview(
      completeReview({
        channels: { state: "resolved", value: ["facebook_paid", "instagram_paid"] },
        territories: { state: "resolved", value: ["CA", "US"] },
      }),
    );
    expect(canonical.fields.channels).toEqual({
      state: "resolved",
      value: ["instagram_paid", "facebook_paid"],
    });
    expect(canonical.fields.territories).toEqual({
      state: "resolved",
      value: ["US", "CA"],
    });
    expect(deriveTermsResolutionStatus(canonical)).toBe("complete");
  });

  it("rejects unsupported resolved values rather than coercing them", () => {
    expect(() =>
      canonicalizeManualRightsReview(
        completeReview({ exclusivity: { state: "resolved", value: "exclusive" } }),
      ),
    ).toThrow(RightsReviewValidationError);
  });

  it("persists human provenance without model confidence", () => {
    const ids = Object.fromEntries(
      RIGHTS_FIELD_NAMES.map((field, index) => [
        field,
        `20000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      ]),
    ) as Record<(typeof RIGHTS_FIELD_NAMES)[number], string>;
    const revision = createManualTermsRevision(completeReview(), {
      caseId: "10000000-0000-4000-8000-000000000001",
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
      correlationId: "test-review-1",
    });
    expect(revision.observations).toHaveLength(12);
    expect(revision.observations.every((item) => item.provenance === "human")).toBe(true);
    expect(revision.observations.every((item) => item.confidenceBasisPoints === null)).toBe(true);
    expect(
      rightsFieldViewsFromObservations(revision.observations).every(
        (item) => item.provenance === "human",
      ),
    ).toBe(true);
  });
});
