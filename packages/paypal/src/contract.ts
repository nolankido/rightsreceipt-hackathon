/** Explicit payment boundary. Neither adapter grants rights or activates permissions. */
export type PaymentAdapterMode = "fake" | "paypal_sandbox";
export type PaymentEnvironment = "simulated" | "sandbox";
export type InvoiceStatus = "DRAFT" | "UNPAID" | "PAID" | "CANCELLED" | "REFUNDED"
  | "SENT" | "SCHEDULED" | "MARKED_AS_PAID" | "PARTIALLY_PAID" | "PARTIALLY_REFUNDED"
  | "MARKED_AS_REFUNDED" | "PAYMENT_PENDING" | "AUTO_CANCELLED" | "PAID_EXTERNAL"
  | "REFUNDED_EXTERNAL" | "SHARED" | "UNKNOWN";

/** Produced only by a trusted application command after exact human version checks.
 * The payment adapter validates shape, but does not independently authenticate people.
 */
export interface AuthorizedInvoiceSnapshot {
  readonly caseId: string;
  readonly assetId: string;
  readonly termsVersionId: string;
  readonly quoteId: string;
  readonly creatorDecisionId: string;
  readonly buyerAcceptanceId: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly recipientEmail: string;
  readonly rightsSummary: string;
  /** Stable server-derived request key. Never derive this from raw buyer text. */
  readonly requestId: string;
}

export interface PaymentAdapterDescriptor {
  readonly mode: PaymentAdapterMode;
  readonly environment: PaymentEnvironment;
  readonly status: "simulation_only" | "sandbox_transport_pending" | "sandbox_draft_transport_ready" | "sandbox_invoice_transport_ready";
  readonly networkEnabled: boolean;
  readonly createsRealInvoice: false;
  readonly authoritativePaymentEvidence: false;
}

/** Invoice summaries never contain bearer credentials, personal email, or raw buyer text. */
export interface PaymentInvoiceView {
  readonly invoiceId: string;
  readonly mode: PaymentAdapterMode;
  readonly provider: "fake" | "paypal";
  readonly environment: PaymentEnvironment;
  readonly caseId: string;
  readonly quoteId: string;
  readonly termsVersionId: string;
  readonly buyerAcceptanceId: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly status: InvoiceStatus;
  readonly simulated: boolean;
  readonly authoritativePaymentEvidence: false;
}

/** The Sandbox implementation is deliberately inert until OAuth and invoicing turns. */
export interface PaymentAdapter {
  readonly descriptor: PaymentAdapterDescriptor;
  createDraftInvoice(input: AuthorizedInvoiceSnapshot): Promise<PaymentInvoiceView>;
  sendInvoice(invoiceId: string): Promise<PaymentInvoiceView>;
  getInvoice(invoiceId: string): Promise<PaymentInvoiceView>;
}

/** Fake-only controls do not exist on the PayPal Sandbox adapter interface. */
export interface FakePaymentAdapter extends PaymentAdapter {
  simulatePaidForTests(invoiceId: string): Promise<PaymentInvoiceView>;
  simulateRefundForTests(invoiceId: string): Promise<PaymentInvoiceView>;
  simulateCancelForTests(invoiceId: string): Promise<PaymentInvoiceView>;
  resetForTests(): void;
}

export interface PaymentConfigurationInput {
  readonly APP_MODE?: string;
  readonly PAYPAL_MODE?: string;
  readonly PAYPAL_BASE_URL?: string;
  readonly PAYPAL_SANDBOX_CLIENT_ID?: string;
  readonly PAYPAL_SANDBOX_CLIENT_SECRET?: string;
  readonly PAYPAL_SANDBOX_WEBHOOK_ID?: string;
  readonly VITE_PAYPAL_CLIENT_SECRET?: string;
  readonly VITE_PAYPAL_SANDBOX_CLIENT_SECRET?: string;
}

/** Diagnostic values are safe to show in a local setup screen. No credentials. */
export interface PaymentConfigurationSummary {
  readonly mode: PaymentAdapterMode;
  readonly environment: PaymentEnvironment;
  readonly endpoint: "none" | "https://api-m.sandbox.paypal.com";
  readonly operational: boolean;
  readonly explanation: string;
}
