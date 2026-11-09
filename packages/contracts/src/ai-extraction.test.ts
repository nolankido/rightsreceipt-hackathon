import { describe, expect, it } from "vitest";
import { AiExtractionAssessmentSchema, AiExtractionProposalSchema } from "./ai-extraction";

describe("AI extraction wire contract", () => {
  it("rejects consequential commands from the model", () => {
    expect(AiExtractionProposalSchema.safeParse({
      contractVersion: "rights-extraction-v1",
      inputSha256: "a".repeat(64),
      extractor: { kind: "model", extractorVersion: "v1", modelId: "m1", modelVersion: "1", artifactSha256: "b".repeat(64) },
      fields: [],
      payment: { status: "paid" },
    }).success).toBe(false);
  });

  it("refuses assessments that grant quoting or permit actions", () => {
    const data = {
      contractVersion: "rights-extraction-v1",
      inputSha256: "a".repeat(64),
      status: "review_required", reviewRequired: true,
      quoteEligible: true, permittedActions: ["confirm_payment"],
      issueCodes: [], extractor: null, fields: [],
    };
    expect(AiExtractionAssessmentSchema.safeParse(data).success).toBe(false);
  });
});
