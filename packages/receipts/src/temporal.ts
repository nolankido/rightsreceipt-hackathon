/** Pure UTC calendar rules. No local timezone, payment authority or client clock. */
import type { ReceiptState } from "./contract";
export const EXPIRING_SOON_DAYS = 7 as const;
const DAY = 86_400_000;
export interface LicenseTiming {
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly lastPermittedDate: string;
  readonly phase: "scheduled" | "active" | "expired" | "refunded" | "revoked";
  readonly notice: "starts_later" | "in_effect" | "expires_soon" | "last_day" | "ended" | "not_active";
  /** Ceiling of remaining 24-hour intervals, NOT an extension of the deadline. */
  readonly daysRemaining: number | null;
  readonly nextBoundaryAt: string | null;
  readonly checkedAt: string;
}
export function utcInstant(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) throw new Error("Invalid UTC instant.");
  const n = Date.parse(value);
  if (!Number.isFinite(n) || new Date(n).toISOString() !== value) throw new Error("Invalid UTC instant.");
  return n;
}
export function licenseInterval(startDate: string, endDateExclusive: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(endDateExclusive)) throw new Error("Invalid license dates.");
  const startsAt = `${startDate}T00:00:00.000Z`, expiresAt = `${endDateExclusive}T00:00:00.000Z`;
  const start = utcInstant(startsAt), end = utcInstant(expiresAt), days = (end - start) / DAY;
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("Invalid license interval.");
  return Object.freeze({ start, end, startsAt, expiresAt, days,
    lastPermittedDate: new Date(end - DAY).toISOString().slice(0, 10) });
}
export function effectivePermissionState(state: ReceiptState, startDate: string, endDateExclusive: string, at: string): ReceiptState {
  if (!["scheduled", "active", "expired", "refunded", "revoked"].includes(state)) throw new Error("Invalid permission state.");
  const period = licenseInterval(startDate, endDateExclusive), current = utcInstant(at);
  if (state === "refunded" || state === "revoked" || state === "expired") return state;
  // A clock rollback must not reactivate or rewind an already applied transition.
  if (state === "active" && current < period.start) throw new Error("Clock precedes active permission.");
  return current >= period.end ? "expired" : current >= period.start ? "active" : "scheduled";
}
/** Display metadata only, never used as proof that a financial permission exists. */
export function licenseTiming(state: ReceiptState, startDate: string, endDateExclusive: string, at: string): LicenseTiming {
  const period = licenseInterval(startDate, endDateExclusive), current = utcInstant(at);
  const phase = effectivePermissionState(state, startDate, endDateExclusive, at);
  let notice: LicenseTiming["notice"] = "not_active", daysRemaining: number | null = null;
  let nextBoundaryAt: string | null = null;
  if (phase === "scheduled") { notice = "starts_later"; nextBoundaryAt = period.startsAt; }
  else if (phase === "expired") { notice = "ended"; daysRemaining = 0; }
  else if (phase === "active") {
    const remaining = period.end - current;
    daysRemaining = Math.ceil(remaining / DAY);
    notice = remaining <= DAY ? "last_day" : remaining <= EXPIRING_SOON_DAYS * DAY ? "expires_soon" : "in_effect";
    nextBoundaryAt = period.expiresAt;
  }
  return Object.freeze({ startsAt: period.startsAt, expiresAt: period.expiresAt,
    lastPermittedDate: period.lastPermittedDate, phase, notice, daysRemaining, nextBoundaryAt, checkedAt: at });
}
export function timingMessage(timing: LicenseTiming): string {
  if (timing.notice === "starts_later") return `Not active yet. Starts at ${timing.startsAt} (UTC).`;
  if (timing.notice === "ended") return `The licensing period ended at ${timing.expiresAt} (UTC). No continued use is permitted by this record.`;
  if (timing.notice === "not_active") return `This permission is ${timing.phase}; its original dates do not restore permission.`;
  if (timing.notice === "last_day") return `Final 24 hours or less. Permission ends at ${timing.expiresAt} (UTC), with no grace period.`;
  if (timing.notice === "expires_soon") return `Expires within ${EXPIRING_SOON_DAYS} days, at ${timing.expiresAt} (UTC). The last permitted date is ${timing.lastPermittedDate}.`;
  return `In effect as checked. Permission ends at ${timing.expiresAt} (UTC). Recheck this record before relying on it.`;
}
