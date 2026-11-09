/** Disabled-by-default server composition. No public issuer/verification route. */
import { createD1ReceiptStore, type ReceiptDatabase } from "../../../packages/receipts/src/store";
import { createReceiptService } from "../../../packages/receipts/src/service";
export async function issueSandboxReceipt(bindings: {
  readonly APP_MODE?: string; readonly PAYPAL_MODE?: string;
  readonly RIGHTS_RECEIPT_ISSUANCE_ENABLED?: string; readonly DB?: ReceiptDatabase;
} | undefined, caseId: string, clock: () => Date = () => new Date()) {
  if (!bindings?.DB || bindings.RIGHTS_RECEIPT_ISSUANCE_ENABLED !== "true"
    || !["sandbox", "judge"].includes(bindings.APP_MODE ?? "") || bindings.PAYPAL_MODE !== "paypal_sandbox") {
    return Object.freeze({ enabled: false });
  }
  return Object.freeze({ enabled: true, ...await createReceiptService(createD1ReceiptStore(bindings.DB), clock).issue(caseId) });
}
