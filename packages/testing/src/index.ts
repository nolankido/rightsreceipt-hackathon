import type { ClockPort } from "@rightsreceipt/application";

export class FakeClock implements ClockPort {
  public constructor(private current: Date) {}

  public now(): Date {
    return new Date(this.current.getTime());
  }

  public todayUtc(): string {
    return this.current.toISOString().slice(0, 10);
  }

  public set(instant: Date): void {
    this.current = new Date(instant.getTime());
  }
}
