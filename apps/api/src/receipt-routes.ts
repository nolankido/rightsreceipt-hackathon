/** Read-only server composition. No demo-role header authorizes creator exports. */
import type { CreatorAccessBindings } from "./security/creator-access";
import { createD1ReceiptStore, type ReceiptDatabase } from "../../../packages/receipts/src/store";
import { createD1ReceiptDirectory } from "../../../packages/receipts/src/access";
import { createReceiptExperienceHandler, createReceiptReadLimiter, isReceiptExperiencePath,
  receiptHttpResponse } from "../../../packages/receipts/src/http";
import { renderUnavailable } from "../../../packages/receipts/src/presentation";
export interface ReceiptExperienceBindings extends CreatorAccessBindings {
  readonly APP_MODE?: string;
  readonly PAYPAL_MODE?: string;
  readonly RIGHTS_RECEIPT_READ_ENABLED?: string;
  readonly RIGHTS_RECEIPT_PUBLIC_ORIGIN?: string;
  readonly DB?: ReceiptDatabase;
}
/** Authentication must be wired by the server, not supplied in bindings/JSON. */
function unavailable(request: Request): Response {
  const path = new URL(request.url).pathname;
  const page = path === "/receipts/buyer" || path.startsWith("/verify/receipt/");
  return receiptHttpResponse(page ? renderUnavailable("Receipt service unavailable",
    "Receipt reading has not been enabled in this environment. No payment action is needed.")
    : JSON.stringify({ status: "receipt_reads_unavailable" }), 503,
    page ? "text/html; charset=utf-8" : undefined);
}
export function createReceiptRoutes(
  authorizeCreator?: (request: Request, caseId: string, bindings: ReceiptExperienceBindings) => Promise<boolean>,
  now: () => Date = () => new Date(),
) {
  const allowRead = createReceiptReadLimiter(() => now().getTime());
  return async (request: Request, bindings: ReceiptExperienceBindings | undefined): Promise<Response | null> => {
    if (!isReceiptExperiencePath(new URL(request.url).pathname)) return null;
    if (!bindings?.DB || bindings.RIGHTS_RECEIPT_READ_ENABLED !== "true"
      || bindings.PAYPAL_MODE !== "paypal_sandbox" || !["sandbox", "judge"].includes(bindings.APP_MODE ?? "")
      || !bindings.RIGHTS_RECEIPT_PUBLIC_ORIGIN) {
      return unavailable(request);
    }
    try {
      const handler = createReceiptExperienceHandler({ store: createD1ReceiptStore(bindings.DB),
        directory: createD1ReceiptDirectory(bindings.DB), publicOrigin: bindings.RIGHTS_RECEIPT_PUBLIC_ORIGIN, now,
        allowRead, authorizeCreator: (req, caseId) => authorizeCreator?.(req, caseId, bindings) ?? Promise.resolve(false) });
      return await handler(request);
    } catch { return unavailable(request); }
  };
}
