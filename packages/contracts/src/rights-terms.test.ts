import { describe, expect, it } from "vitest";
import {
  ManualTermsReviewSaveRequestSchema,
  RightsFieldNameSchema,
  TermsReviewResponseSchema,
} from "./rights-terms";

const completeFields = {
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
} as const;

describe("rights review contracts", () => {
  it("enumerates all twelve material fields", () => {
    expect(RightsFieldNameSchema.options).toHaveLength(12);
  });

  it("accepts a complete supported manual review", () => {
    expect(
      ManualTermsReviewSaveRequestSchema.parse({
        expectedCaseRowVersion: 2,
        fields: completeFields,
      }).fields,
    ).toEqual(completeFields);
  });

  it("rejects an unsupported value marked as resolved", () => {
    expect(() =>
      ManualTermsReviewSaveRequestSchema.parse({
        expectedCaseRowVersion: 2,
        fields: {
          ...completeFields,
          exclusivity: { state: "resolved", value: "exclusive" },
        },
      }),
    ).toThrow();
  });

  it("requires exactly twelve review rows in a response", () => {
    expect(() =>
      TermsReviewResponseSchema.parse({
        storageMode: "memory",
        caseId: "10000000-0000-4000-8000-000000000001",
        caseRowVersion: 2,
        caseOutcome: "open",
        asset: {},
        buyer: {},
        request: {},
        currentTermsVersion: null,
        resolutionStatus: "not_started",
        fields: [],
        quoteReadiness: { status: "blocked", reasons: ["Incomplete."] },
      }),
    ).toThrow();
  });
});
