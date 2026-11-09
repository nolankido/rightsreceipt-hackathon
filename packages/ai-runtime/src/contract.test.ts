import { describe, expect, it } from "vitest";
import { AI_RIGHTS_FIELDS, abstainAllAiFields, validateAiExtractionProposal } from "./contract";

describe("AI safe extraction contract", () => {
  it("makes no quoteable predictions when no local model is configured", () => {
    const result = abstainAllAiFields("a".repeat(64));
    expect(result.fields).toHaveLength(12);
    expect(result.fields.map((field) => field.fieldName)).toEqual(AI_RIGHTS_FIELDS);
    expect(result.quoteEligible).toBe(false);
    expect(result.permittedActions).toEqual([]);
  });
  it("rejects a model-authored payment command", () => {
    const result = validateAiExtractionProposal({ confirmPayment: true }, "a".repeat(50), "b".repeat(64));
    expect(result.ok).toBe(false);
  });
});
