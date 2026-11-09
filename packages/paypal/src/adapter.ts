/** Offline fake and fail-closed Sandbox adapter configuration. No HTTP is made here. */
import type {
  AuthorizedInvoiceSnapshot,
  FakePaymentAdapter,
  PaymentAdapter,
  PaymentAdapterDescriptor,
  PaymentConfigurationInput,
  PaymentConfigurationSummary,
  PaymentInvoiceView,
  InvoiceStatus,
} from "./contract";

export const PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com" as const;
export const PAYPAL_OAUTH_TOKEN_PATH = "/v1/oauth2/token" as const;
export const PAYPAL_INVOICES_PATH = "/v2/invoicing/invoices" as const;
export const PAYMENT_ADAPTER_CONTRACT_VERSION = "rightsreceipt-payment-adapter-v1" as const;

export type PaymentErrorCode =
  | "invalid_configuration"
  | "live_endpoint_forbidden"
  | "credentials_missing"
  | "sandbox_transport_pending"
  | "sandbox_transport_unavailable"
  | "sandbox_oauth_rejected"
  | "sandbox_oauth_invalid_response"
  | "sandbox_invoice_rejected"
  | "sandbox_invoice_invalid_response"
  | "sandbox_unknown_outcome"
  | "sandbox_rate_limited"
  | "invalid_invoice_request"
  | "invoice_conflict"
  | "invoice_not_found"
  | "invalid_invoice_state";

const ERRORS: Readonly<Record<PaymentErrorCode, string>> = {
  invalid_configuration: "Payment configuration is invalid. Check the server-only Sandbox settings.",
  live_endpoint_forbidden: "Live PayPal endpoints are prohibited in this demonstration.",
  credentials_missing: "Sandbox configuration is incomplete. Provide server-side test credentials.",
  sandbox_transport_pending: "This PayPal Sandbox operation is not available yet.",
  sandbox_transport_unavailable: "PayPal Sandbox authentication transport is temporarily unavailable.",
  sandbox_oauth_rejected: "PayPal Sandbox authentication was rejected. Check server-side access and invoicing scope.",
  sandbox_oauth_invalid_response: "PayPal Sandbox returned an invalid authentication response.",
  sandbox_invoice_rejected: "PayPal Sandbox rejected the draft invoice. Verify the merchant and accepted scope.",
  sandbox_invoice_invalid_response: "PayPal Sandbox returned an invalid draft invoice response.",
  sandbox_unknown_outcome: "The Sandbox invoice request outcome is unknown. Retry with the same request ID, not a new invoice.",
  sandbox_rate_limited: "PayPal Sandbox is rate limiting requests. Retry later with the same request ID.",
  invalid_invoice_request: "The accepted invoice snapshot does not satisfy the payment contract.",
  invoice_conflict: "A different invoice is already bound to this request or accepted deal.",
  invoice_not_found: "The requested simulated invoice does not exist.",
  invalid_invoice_state: "This simulated invoice cannot make the requested state transition.",
};
export class PaymentAdapterError extends Error {
  readonly code: PaymentErrorCode;
  constructor(code: PaymentErrorCode) {
    super(ERRORS[code]);
    this.name = "PaymentAdapterError";
    this.code = code;
  }
}

function invalid(code: PaymentErrorCode): never {
  throw new PaymentAdapterError(code);
}
function hasContent(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function configured(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}
function safeCredential(value: unknown): value is string {
  return hasContent(value) && value === value.trim()
    && value.length >= 8 && value.length <= 512
    && !/[\s\r\n<>]/u.test(value)
    && !/^(?:YOUR_|REPLACE_|EXAMPLE|PLACEHOLDER|CHANGE_ME|SK-TEST)/iu.test(value);
}

/** Exact allowlist prevents arbitrary base URLs, credentials in URLs, and production calls. */
export function inspectPaymentConfiguration(
  input: PaymentConfigurationInput,
): PaymentConfigurationSummary {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("invalid_configuration");
  const appMode = input.APP_MODE ?? "local";
  if (!["local", "sandbox", "judge"].includes(appMode)) invalid("invalid_configuration");
  if (configured(input.VITE_PAYPAL_CLIENT_SECRET) || configured(input.VITE_PAYPAL_SANDBOX_CLIENT_SECRET)) {
    invalid("invalid_configuration");
  }
  const mode = input.PAYPAL_MODE ?? (appMode === "local" ? "fake" : "");
  if (mode !== "fake" && mode !== "paypal_sandbox") invalid("invalid_configuration");
  if (input.PAYPAL_BASE_URL !== undefined && input.PAYPAL_BASE_URL !== PAYPAL_SANDBOX_BASE_URL) {
    if (/paypal\.com/iu.test(String(input.PAYPAL_BASE_URL))) invalid("live_endpoint_forbidden");
    invalid("invalid_configuration");
  }
  if (mode === "fake") {
    if (appMode !== "local" || input.PAYPAL_BASE_URL !== undefined
      || configured(input.PAYPAL_SANDBOX_CLIENT_ID)
      || configured(input.PAYPAL_SANDBOX_CLIENT_SECRET)
      || configured(input.PAYPAL_SANDBOX_WEBHOOK_ID)) invalid("invalid_configuration");
    return Object.freeze({
      mode, environment: "simulated", endpoint: "none", operational: true,
      explanation: "Offline fake adapter only. No PayPal requests or real payment evidence.",
    });
  }
  if (input.PAYPAL_BASE_URL !== PAYPAL_SANDBOX_BASE_URL) invalid("invalid_configuration");
  if (!safeCredential(input.PAYPAL_SANDBOX_CLIENT_ID)
    || !safeCredential(input.PAYPAL_SANDBOX_CLIENT_SECRET)) invalid("credentials_missing");
  if (input.PAYPAL_SANDBOX_CLIENT_ID === input.PAYPAL_SANDBOX_CLIENT_SECRET) invalid("invalid_configuration");
  if (input.PAYPAL_SANDBOX_WEBHOOK_ID !== undefined
    && !safeCredential(input.PAYPAL_SANDBOX_WEBHOOK_ID)) invalid("invalid_configuration");
  return Object.freeze({
    mode, environment: "sandbox", endpoint: PAYPAL_SANDBOX_BASE_URL,
    operational: false,
    explanation: "Sandbox credentials validated, but OAuth, invoice HTTP, and webhooks are not implemented.",
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/u;
const REQUEST_KEY = /^[A-Za-z0-9_-]{8,64}$/u;
const OWN = Object.prototype.hasOwnProperty;
const INPUT_KEYS = [
  "caseId", "assetId", "termsVersionId", "quoteId", "creatorDecisionId",
  "buyerAcceptanceId", "amountCents", "currency", "recipientEmail",
  "rightsSummary", "requestId",
] as const;

/** A known-good command is required; raw browser, model, or buyer JSON is rejected. */
export function validateAuthorizedInvoiceSnapshot(raw: unknown): AuthorizedInvoiceSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("invalid_invoice_request");
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).length !== INPUT_KEYS.length
    || INPUT_KEYS.some(key => !OWN.call(value, key))) invalid("invalid_invoice_request");
  for (const key of ["caseId", "assetId", "termsVersionId", "quoteId", "creatorDecisionId", "buyerAcceptanceId"] as const) {
    if (typeof value[key] !== "string" || !UUID.test(value[key])) invalid("invalid_invoice_request");
  }
  const amount = value.amountCents;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount)
    || amount <= 0 || amount > 1_000_000_000 || value.currency !== "USD") invalid("invalid_invoice_request");
  const email = value.recipientEmail;
  if (typeof email !== "string" || email.length > 254 || !EMAIL.test(email)) invalid("invalid_invoice_request");
  const summary = value.rightsSummary;
  if (typeof summary !== "string" || summary.length < 15 || summary.length > 400
    || /[\x00-\x1f<>]/u.test(summary)) invalid("invalid_invoice_request");
  const requestId = value.requestId;
  if (typeof requestId !== "string" || !REQUEST_KEY.test(requestId)) invalid("invalid_invoice_request");
  return Object.freeze(Object.fromEntries(INPUT_KEYS.map(key => [key, value[key]]))) as unknown as AuthorizedInvoiceSnapshot;
}

const fakeDescriptor: PaymentAdapterDescriptor = Object.freeze({
  mode: "fake", environment: "simulated", status: "simulation_only",
  networkEnabled: false, createsRealInvoice: false, authoritativePaymentEvidence: false,
});
const sandboxDescriptor: PaymentAdapterDescriptor = Object.freeze({
  mode: "paypal_sandbox", environment: "sandbox", status: "sandbox_transport_pending",
  networkEnabled: false, createsRealInvoice: false, authoritativePaymentEvidence: false,
});

interface FakeStoredInvoice {
  readonly request: AuthorizedInvoiceSnapshot;
  readonly invoiceId: string;
  status: InvoiceStatus;
}

/** Source data and test state are local to each instance. Never serialize this adapter. */
export function createFakePaymentAdapter(): FakePaymentAdapter {
  const invoices = new Map<string, FakeStoredInvoice>();
  const byRequestId = new Map<string, string>();
  const byDeal = new Map<string, string>();
  let sequence = 0;
  const view = (stored: FakeStoredInvoice): PaymentInvoiceView => Object.freeze({
    invoiceId: stored.invoiceId, mode: "fake", provider: "fake", environment: "simulated",
    caseId: stored.request.caseId, quoteId: stored.request.quoteId,
    termsVersionId: stored.request.termsVersionId,
    buyerAcceptanceId: stored.request.buyerAcceptanceId,
    amountCents: stored.request.amountCents, currency: "USD", status: stored.status,
    simulated: true, authoritativePaymentEvidence: false,
  });
  function find(invoiceId: string): FakeStoredInvoice {
    const record = invoices.get(invoiceId);
    if (!record) invalid("invoice_not_found");
    return record;
  }
  async function change(invoiceId: string, current: readonly InvoiceStatus[], next: InvoiceStatus) {
    const record = find(invoiceId);
    if (record.status === next) return view(record);
    if (!current.includes(record.status)) invalid("invalid_invoice_state");
    record.status = next;
    return view(record);
  }
  return {
    descriptor: fakeDescriptor,
    async createDraftInvoice(input) {
      const request = validateAuthorizedInvoiceSnapshot(input);
      const earlierId = byRequestId.get(request.requestId);
      if (earlierId) {
        const previous = find(earlierId);
        if (JSON.stringify(previous.request) !== JSON.stringify(request)) invalid("invoice_conflict");
        return view(previous);
      }
      const dealKey = [request.caseId, request.quoteId, request.termsVersionId, request.buyerAcceptanceId].join(":");
      if (byDeal.has(dealKey)) invalid("invoice_conflict");
      if (sequence >= 999999) invalid("invoice_conflict");
      sequence++;
      const invoiceId = `SIM-INV-${String(sequence).padStart(6, "0")}`;
      const record = {request, invoiceId, status: "DRAFT" as InvoiceStatus};
      invoices.set(invoiceId, record);
      byRequestId.set(request.requestId, invoiceId);
      byDeal.set(dealKey, invoiceId);
      return view(record);
    },
    async sendInvoice(invoiceId) { return change(invoiceId, ["DRAFT"], "UNPAID"); },
    async getInvoice(invoiceId) { return view(find(invoiceId)); },
    async simulatePaidForTests(invoiceId) { return change(invoiceId, ["UNPAID"], "PAID"); },
    async simulateRefundForTests(invoiceId) { return change(invoiceId, ["PAID"], "REFUNDED"); },
    async simulateCancelForTests(invoiceId) { return change(invoiceId, ["DRAFT", "UNPAID"], "CANCELLED"); },
    resetForTests() { invoices.clear(); byRequestId.clear(); byDeal.clear(); sequence = 0; },
  };
}

/** Even valid Sandbox credentials do not enable network calls in Turn 021. */
export function createPayPalSandboxAdapter(input: PaymentConfigurationInput): PaymentAdapter {
  const config = inspectPaymentConfiguration(input);
  if (config.mode !== "paypal_sandbox") invalid("invalid_configuration");
  const pending = async (): Promise<never> => invalid("sandbox_transport_pending");
  return Object.freeze({ descriptor: sandboxDescriptor,
    createDraftInvoice: pending, sendInvoice: pending, getInvoice: pending,
  });
}

/** A factory keeps the fake adapter explicitly local-only and the real adapter inert. */
export function createPaymentAdapter(input: PaymentConfigurationInput): PaymentAdapter {
  const configuration = inspectPaymentConfiguration(input);
  return configuration.mode === "fake"
    ? createFakePaymentAdapter()
    : createPayPalSandboxAdapter(input);
}

/** This is setup readiness, never a payment or external verification claim. */
export const PAYMENT_ADAPTERS = Object.freeze([
  Object.freeze({ mode: "fake", implemented: true, operational: true, environment: "simulated" }),
  Object.freeze({ mode: "paypal_sandbox", implemented: false, operational: false, environment: "sandbox" }),
]);
