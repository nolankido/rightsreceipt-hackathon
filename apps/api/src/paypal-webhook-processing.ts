/** Server-only batch hook. No HTTP endpoint or Cron Trigger is installed here. */
import { createD1WebhookProcessingStore, type ProcessingDatabase } from "../../../packages/paypal/src/webhook-processing-store";
import { processVerifiedWebhookBatch } from "../../../packages/paypal/src/webhook-processing";
export interface PayPalProcessingBindings {
  readonly APP_MODE?: string;
  readonly PAYPAL_MODE?: string;
  readonly PAYPAL_WEBHOOK_PROCESSING_ENABLED?: string;
  readonly DB?: ProcessingDatabase;
}
export async function runPayPalWebhookProcessing(bindings: PayPalProcessingBindings | undefined) {
  if (!bindings?.DB || bindings.PAYPAL_WEBHOOK_PROCESSING_ENABLED !== "true"
    || bindings.PAYPAL_MODE !== "paypal_sandbox" || !["sandbox", "judge"].includes(bindings.APP_MODE ?? "")) {
    return Object.freeze({ enabled: false, examined: 0 });
  }
  try {
    const summary = await processVerifiedWebhookBatch(createD1WebhookProcessingStore(bindings.DB));
    return Object.freeze({ enabled: true, ...summary });
  } catch { throw new Error("Verified webhook processing unavailable."); }
}
