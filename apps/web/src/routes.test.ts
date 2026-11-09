import { describe, expect, it } from "vitest";
import {
  buyerRequestRoutePattern,
  creatorTermsRoutes,
  routeFor,
  scaffoldRoutes,
} from "./routes";

describe("route contract", () => {
  it("keeps actor surfaces separate", () => {
    expect(new Set(scaffoldRoutes.map((route) => route.role))).toEqual(
      new Set(["public", "judge", "creator", "buyer", "verifier"]),
    );
  });

  it("resolves the public verification route", () => {
    expect(routeFor("/verify/demo")?.role).toBe("verifier");
  });

  it("records capability and creator terms route patterns", () => {
    expect(buyerRequestRoutePattern).toBe("/request/:capability");
    expect(creatorTermsRoutes).toEqual({
      list: "/creator/cases",
      review: "/creator/cases/:caseId",
    });
  });
});
