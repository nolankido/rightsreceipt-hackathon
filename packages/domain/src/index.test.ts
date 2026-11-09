import { describe, expect, it } from "vitest";
import { authorityFor } from "./index";

describe("authority boundaries", () => {
  it("does not assign payment confirmation to AI", () => {
    expect(authorityFor("confirm_payment")).toBe("paypal");
    expect(authorityFor("propose_terms")).toBe("ai");
  });

  it("keeps pricing deterministic", () => {
    expect(authorityFor("calculate_price")).toBe("deterministic");
  });
});
