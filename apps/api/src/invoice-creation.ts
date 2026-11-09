/** Server-only construction. No HTTP route, schedule, default fetch or demo-role bypass. */
import { createInvoiceCreationService } from "../../../packages/application/src/invoice-creation";
import { createD1InvoiceCreationStore } from "../../../packages/persistence/src/invoice-creation";
import type { CreatorPrincipal } from "../../../packages/application/src/consent-contract";
import type { ConsentDatabase } from "../../../packages/persistence/src/human-consent";
import { canonicalHash } from "../../../packages/receipts/src/canonical";
import { createPayPalSandboxDraftAdapter, type SandboxDraftDependencies } from "../../../packages/paypal/src/sandbox-draft";
import type { PaymentConfigurationInput } from "../../../packages/paypal/src/contract";
export interface InvoiceCreationBindings extends PaymentConfigurationInput {
  readonly RIGHTS_INVOICE_CREATION_ENABLED?: string;
  readonly DB?: ConsentDatabase;
}
export async function createSandboxInvoiceCreation(bindings: InvoiceCreationBindings | undefined, deps: {
  readonly authorizeCreator: (caseId: string) => Promise<CreatorPrincipal | null>;
  readonly transport: SandboxDraftDependencies;
  readonly now?: () => Date;
}) {
  if (!bindings?.DB || bindings.RIGHTS_INVOICE_CREATION_ENABLED !== "true" || bindings.PAYPAL_MODE !== "paypal_sandbox"
    || !["sandbox", "judge"].includes(bindings.APP_MODE ?? "")) return null;
  if (typeof deps?.authorizeCreator !== "function") throw new Error("Creator authorization is required.");
  // Override any injected callback: only the live canonical dispatch may authorize.
  const adapter = createPayPalSandboxDraftAdapter(bindings, { ...deps.transport,
    authorizeCreate: request => service.authorizeTransport(request) });
  // Client ID is a public app identity, not the secret. Only its combined digest persists.
  const accountFingerprint = await canonicalHash({ provider: "paypal", environment: "sandbox",
    client_id: bindings.PAYPAL_SANDBOX_CLIENT_ID, merchant: deps.transport.merchant });
  const service = createInvoiceCreationService({ store: createD1InvoiceCreationStore(bindings.DB), accountFingerprint,
    authorizeCreator: deps.authorizeCreator, createDraft: request => adapter.createDraftInvoice(request),
    ...(deps.now ? { now: deps.now } : {}) });
  return service;
}
