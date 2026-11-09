/** Shared native transaction composition used by the Worker and integration tests.
 * Route factories are constructed once so their per-isolate limits persist.
 */
import type { createCreatorSessionAuthorization } from "./creator-session";
import { createCreatorReviewRoutes, type CreatorReviewBindings } from "./creator-review";
import { createBuyerReviewRoutes, type BuyerReviewBindings } from "./buyer-review";
import { createHumanConsentRoutes, type HumanConsentBindings } from "./human-consent-routes";
import { createInvoiceControlRoutes, type InvoiceControlBindings } from "./invoice-control-routes";
import { createBuyerPaymentRoutes, type BuyerPaymentBindings } from "./buyer-payment-routes";
import { createClarificationRoutes, type ClarificationBindings } from "./clarification-routes";
import { createClarificationPageRoutes, type ClarificationPageBindings } from "./clarification-pages";
import { createRequestIntakeRoutes, type RequestIntakeBindings } from "./request-intake-routes";
import { createRequestIntakePageRoutes, type RequestIntakePageBindings } from "./request-intake-pages";
import { legacyBuyerRequestBoundary } from "./legacy-buyer-boundary";
import { createInvoiceRecoveryRoutes, type InvoiceRecoveryBindings } from "./invoice-recovery-routes";
import { inspectPaymentConfiguration } from "../../../packages/paypal/src/adapter";
import type { PaymentConfigurationInput } from "../../../packages/paypal/src/contract";
import type { SandboxDraftDependencies, SandboxHttpTransport } from "../../../packages/paypal/src/sandbox-draft";

/** Transport construction reads configuration only, never the database binding. */
export interface SandboxTransportBindings extends PaymentConfigurationInput {
  readonly RIGHTS_INVOICE_CONTROLS_ENABLED?: string;
  readonly BUYER_PAYMENT_ENABLED?: string;
  readonly PAYPAL_SANDBOX_MERCHANT_NAME?: string;
  readonly PAYPAL_SANDBOX_MERCHANT_EMAIL?: string;
}
export type TransactionBindings = CreatorReviewBindings & BuyerReviewBindings & HumanConsentBindings
  & InvoiceControlBindings & BuyerPaymentBindings & ClarificationBindings & ClarificationPageBindings
  & RequestIntakeBindings & RequestIntakePageBindings & InvoiceRecoveryBindings & SandboxTransportBindings;

/** Pure configuration only. Constructing a transport makes no provider request. */
export function configuredSandboxTransport(env: SandboxTransportBindings, http: SandboxHttpTransport): SandboxDraftDependencies | null {
  if ((env.RIGHTS_INVOICE_CONTROLS_ENABLED !== "true" && env.BUYER_PAYMENT_ENABLED !== "true") || env.PAYPAL_MODE !== "paypal_sandbox"
    || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) return null;
  const name = env.PAYPAL_SANDBOX_MERCHANT_NAME, email = env.PAYPAL_SANDBOX_MERCHANT_EMAIL;
  if (typeof name !== "string" || name.length < 2 || name.length > 120 || name.trim() !== name || /[\x00-\x1f<>]/u.test(name)
    || typeof email !== "string" || email.length > 254
    || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/u.test(email)) return null;
  try { if (inspectPaymentConfiguration(env).environment !== "sandbox") return null; }
  catch { return null; }
  return { fetch: http, merchant: { name, email }, sandboxDraftTransportEnabled: true };
}

export function createTransactionRoutes(deps: {
  readonly sessions: ReturnType<typeof createCreatorSessionAuthorization>;
  readonly transport?: (env: SandboxTransportBindings) => SandboxDraftDependencies | null;
  readonly now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const consent = createHumanConsentRoutes({ now,
    authorizeCreator: (request, caseId, env) => deps.sessions.authorize(request, caseId, env) });
  const invoices = createInvoiceControlRoutes({ now,
    authorizeCreator: (request, caseId, env) => deps.sessions.authorize(request, caseId, env),
    ...(deps.transport ? { transport: deps.transport } : {}) });
  const recovery = createInvoiceRecoveryRoutes({ now,
    authorizeCreator: (request, caseId, env) => deps.sessions.authorizeRecovery(request, caseId, env),
    ...(deps.transport ? { transport: deps.transport } : {}) });
  const buyerPayments = createBuyerPaymentRoutes({ now,
    ...(deps.transport ? { transport: deps.transport } : {}) });
  const clarifications = createClarificationRoutes({ now,
    authorizeCreator: (request, caseId, env) => deps.sessions.authorize(request, caseId, env) });
  const clarificationPages = createClarificationPageRoutes(deps.sessions, () => now().getTime());
  const intake = createRequestIntakeRoutes({ now,
    authorizeCreatorAsset: (request, assetId, env) => deps.sessions.authorizeAsset(request, assetId, env) });
  const intakePages = createRequestIntakePageRoutes(deps.sessions, () => now().getTime());
  const creator = createCreatorReviewRoutes(deps.sessions, () => now().getTime());
  const buyer = createBuyerReviewRoutes(() => now().getTime());
  return async (request: Request, env: TransactionBindings | undefined): Promise<Response | null> => {
    const legacyBoundary = legacyBuyerRequestBoundary(request, env);
    if (legacyBoundary) return legacyBoundary;
    // Buyer access is capability-based and never invokes creator login.
    return await buyer(request, env) ?? await creator(request, env)
      ?? await intakePages(request, env) ?? await intake(request, env)
      ?? await clarificationPages(request, env) ?? await clarifications(request, env)
      ?? await consent(request, env) ?? await buyerPayments(request, env) ?? await recovery(request, env) ?? await invoices(request, env);
  };
}
