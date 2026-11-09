/** Server-only, default-off canonical draft adoption and explicit delivery.
 * No HTTP route, scheduled trigger or implicit global fetch is installed.
 */
import { createInvoiceSendingService } from "../../../packages/application/src/invoice-sending";
import { createD1InvoiceSendingStore } from "../../../packages/persistence/src/invoice-sending";
import type { ConsentDatabase } from "../../../packages/persistence/src/human-consent";
import type { CreatorPrincipal } from "../../../packages/application/src/consent-contract";
import { createD1DeliveryJournal, type DeliveryDatabase } from "../../../packages/paypal/src/delivery-journal";
import { createPayPalSandboxInvoiceAdapter } from "../../../packages/paypal/src/sandbox-invoice";
import type { SandboxDraftDependencies } from "../../../packages/paypal/src/sandbox-draft";
import type { PaymentConfigurationInput } from "../../../packages/paypal/src/contract";
import { canonicalHash } from "../../../packages/receipts/src/canonical";
export interface InvoiceSendingBindings extends PaymentConfigurationInput {
  readonly RIGHTS_INVOICE_SENDING_ENABLED?: string;
  readonly DB?: ConsentDatabase & DeliveryDatabase;
}
export async function createSandboxInvoiceSending(bindings: InvoiceSendingBindings | undefined, deps: {
  readonly authorizeCreator: (caseId: string) => Promise<CreatorPrincipal | null>;
  readonly transport: SandboxDraftDependencies; readonly now?: () => Date;
}) {
  if (bindings?.RIGHTS_INVOICE_SENDING_ENABLED !== "true" || !bindings.DB || bindings.PAYPAL_MODE !== "paypal_sandbox"
    || !["sandbox", "judge"].includes(bindings.APP_MODE ?? "")) return null;
  if (typeof deps?.authorizeCreator !== "function") throw new Error("Creator authorization is required.");
  const accountFingerprint = await canonicalHash({ provider: "paypal", environment: "sandbox",
    client_id: bindings.PAYPAL_SANDBOX_CLIENT_ID, merchant: deps.transport.merchant });
  const adapter = createPayPalSandboxInvoiceAdapter(bindings, { ...deps.transport, sandboxInvoiceTransportEnabled: true,
    journal: createD1DeliveryJournal(bindings.DB), authorize: context => service.authorizeTransport(context) });
  const service = createInvoiceSendingService({ store: createD1InvoiceSendingStore(bindings.DB), accountFingerprint,
    clientId: bindings.PAYPAL_SANDBOX_CLIENT_ID!, merchant: deps.transport.merchant, authorizeCreator: deps.authorizeCreator,
    sendInvoice: id => adapter.sendInvoice(id), getInvoice: id => adapter.getInvoice(id), ...(deps.now ? { now: deps.now } : {}) });
  return service;
}
