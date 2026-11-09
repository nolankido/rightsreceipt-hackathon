import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SEED_POLICY_VERSION,
  PricingValidationError,
  calculateQuote,
  formatUsdCents,
  parseAndValidatePricingPolicy,
} from "./index";
import type { TermsVersionRecord } from "@rightsreceipt/domain";

const terms = {
  termsVersionId: "20000000-0000-4000-8000-000000000002",
  caseId: "10000000-0000-4000-8000-000000000001",
  versionNumber: 1,
  resolutionStatus: "complete",
  usePurpose: "commercial",
  channels: ["instagram_paid", "facebook_paid"],
  paidAdvertising: true,
  territories: ["US", "CA"],
  startDate: "2026-11-01",
  durationDays: 90,
  maxImpressions: 500_000,
  exclusivity: "non_exclusive",
  modificationScope: "crop_only",
  attribution: "not_required",
  sublicensing: "prohibited",
  aiUse: "prohibited",
  sourceKind: "human_corrected",
  termsHash: "b".repeat(64),
  createdByActor: "creator",
  createdAt: "2026-10-26T12:00:00.000Z",
} satisfies TermsVersionRecord;

describe("deterministic P0 pricing", () => {
  it("reproduces the immutable seed policy hash", () => {
    expect(createHash("sha256").update(SEED_POLICY_VERSION.rulesJson).digest("hex"))
      .toBe(SEED_POLICY_VERSION.policyHash);
    expect(Object.keys(parseAndValidatePricingPolicy(SEED_POLICY_VERSION))).toHaveLength(11);
  });

  it("calculates the canonical five line $425 quote", () => {
    const result = calculateQuote(terms, SEED_POLICY_VERSION);
    expect(result.totalCents).toBe(42_500);
    expect(result.lineItems.map((line) => line.amountCents)).toEqual([
      20_000, 10_000, 5_000, 5_000, 2_500,
    ]);
    expect(result.lineItems.reduce((sum, line) => sum + line.amountCents, 0))
      .toBe(result.totalCents);
    expect(formatUsdCents(result.totalCents)).toBe("$425.00");
  });

  it("refuses unresolved, unsupported, or contradictory terms", () => {
    for (const resolutionStatus of ["incomplete", "unsupported", "contradictory"] as const) {
      expect(() => calculateQuote({ ...terms, resolutionStatus }, SEED_POLICY_VERSION))
        .toThrow(PricingValidationError);
    }
  });

  it("makes no quote for unsafe values or modified policy", () => {
    expect(() => calculateQuote({ ...terms, exclusivity: "exclusive" as never }, SEED_POLICY_VERSION))
      .toThrow(PricingValidationError);
    expect(() => calculateQuote(terms, { ...SEED_POLICY_VERSION, status: "superseded" }))
      .toThrow(PricingValidationError);
  });
});
