/** Public inbound signature boundary, disabled unless server bindings opt in. */
import { createSandboxWebhookHandler } from "../../../packages/paypal/src/webhook-intake";
import { createD1WebhookInbox, type WebhookDatabase } from "../../../packages/paypal/src/webhook-inbox";
import type { PaymentConfigurationInput } from "../../../packages/paypal/src/contract";

export const PAYPAL_WEBHOOK_ROUTE = "/webhooks/paypal/sandbox" as const;
export interface PayPalWebhookBindings extends PaymentConfigurationInput {
  readonly DB?: WebhookDatabase;
  readonly PAYPAL_WEBHOOK_INTAKE_ENABLED?: string;
}
export function createPayPalWebhookRoute(http: typeof fetch = fetch) {
  return async (request: Request, bindings: PayPalWebhookBindings | undefined): Promise<Response> => {
    if (!bindings?.DB || bindings.PAYPAL_WEBHOOK_INTAKE_ENABLED !== "true"
      || !["sandbox", "judge"].includes(bindings.APP_MODE ?? "")) {
      return unavailable();
    }
    // Instance per request: no stale credential cache across environment rotation.
    // The handler still coalesces token refreshes within its own verification operation.
    try {
      const handle = createSandboxWebhookHandler(bindings, {
        sandboxWebhookIntakeEnabled: true, fetch: (url, init) => http(url, init),
        inbox: createD1WebhookInbox(bindings.DB),
      });
      return await handle(request);
    } catch { return unavailable(); }
  };
}
function unavailable(): Response {
  return new Response(JSON.stringify({ status: "unavailable", code: "webhook_intake_disabled" }), {
    status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Retry-After": "30" },
  });
}
