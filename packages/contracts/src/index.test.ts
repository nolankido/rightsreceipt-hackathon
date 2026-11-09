import { describe, expect, it } from "vitest";
import { createHealthResponse, HealthResponseSchema } from "./index";

describe("shared contracts", () => {
  it("creates a schema-valid structured review health response", () => {
    const value = createHealthResponse("local");
    expect(HealthResponseSchema.parse(value)).toEqual(value);
    expect(value.phase).toBe("mock-vertical-slice");
  });

  it("rejects an unsupported application mode", () => {
    expect(() =>
      HealthResponseSchema.parse({
        status: "ok",
        service: "rightsreceipt",
        phase: "mock-vertical-slice",
        mode: "production",
      }),
    ).toThrow();
  });
});
