import { describe, expect, it } from "vitest";
import { BuyerRequestInputSchema } from "./buyer-requests";

describe("buyer request contracts", () => {
  it("accepts a complete request", () => {
    expect(
      BuyerRequestInputSchema.parse({
        buyerName: "Jordan Lee",
        buyerOrganization: "Cedar & Tide Travel",
        buyerEmail: "jordan@example.test",
        intendedUseText:
          "We request paid Instagram use in the United States and Canada for ninety days.",
        consentAcknowledged: true,
      }).consentAcknowledged,
    ).toBe(true);
  });

  it("rejects an unacknowledged request", () => {
    expect(() =>
      BuyerRequestInputSchema.parse({
        buyerName: "Jordan Lee",
        buyerOrganization: "Cedar & Tide Travel",
        buyerEmail: "jordan@example.test",
        intendedUseText:
          "We request paid Instagram use in the United States and Canada for ninety days.",
        consentAcknowledged: false,
      }),
    ).toThrow();
  });
});
