import { describe, expect, it } from "vitest";
import { FakeClock } from "./index";

describe("FakeClock", () => {
  it("returns deterministic UTC dates", () => {
    const clock = new FakeClock(new Date("2026-10-25T23:45:00Z"));
    expect(clock.todayUtc()).toBe("2026-10-25");
    expect(clock.now().toISOString()).toBe("2026-10-25T23:45:00.000Z");
  });
});
