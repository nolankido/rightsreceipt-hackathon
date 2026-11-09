/** Explicit server-only clock job. No public write route or installed schedule. */
import { createD1TemporalStore } from "../../../packages/receipts/src/temporal-store";
import { runPermissionClockBatch } from "../../../packages/receipts/src/temporal-service";
import type { ReceiptDatabase } from "../../../packages/receipts/src/store";
export interface PermissionClockBindings {
  readonly APP_MODE?: string;
  readonly PAYPAL_MODE?: string;
  readonly RIGHTS_PERMISSION_CLOCK_ENABLED?: string;
  readonly RIGHTS_RECEIPT_ISSUANCE_ENABLED?: string;
  readonly DB?: ReceiptDatabase;
}
export async function runPermissionClock(bindings: PermissionClockBindings | undefined, clock: () => Date = () => new Date()) {
  if (!bindings?.DB || bindings.RIGHTS_PERMISSION_CLOCK_ENABLED !== "true" || bindings.RIGHTS_RECEIPT_ISSUANCE_ENABLED !== "true"
    || bindings.PAYPAL_MODE !== "paypal_sandbox" || !["sandbox","judge"].includes(bindings.APP_MODE ?? "")) {
    return Object.freeze({ enabled: false, examined: 0 });
  }
  try { return Object.freeze({ enabled: true, ...await runPermissionClockBatch(createD1TemporalStore(bindings.DB), clock) }); }
  catch { throw new Error("Permission clock unavailable."); }
}
