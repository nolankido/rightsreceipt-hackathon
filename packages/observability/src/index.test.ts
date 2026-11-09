import { describe, expect, it } from "vitest";
import { createSafeLogContext } from "./index";

describe("safe log context", () => {
  it("does not invent a correlation identifier", () => {
    expect(createSafeLogContext({ event: "test" })).toEqual({
      correlation_id: null,
      event: "test",
    });
  });

  it("bounds an untrusted correlation identifier", () => {
    const value = createSafeLogContext({
      correlationId: "x".repeat(300),
      event: "test",
    });
    expect(value.correlation_id).toHaveLength(128);
  });
});
