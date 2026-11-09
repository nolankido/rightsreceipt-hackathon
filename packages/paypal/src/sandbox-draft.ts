/**
 * Opt-in PayPal Sandbox OAuth and DRAFT invoice transport.
 * This is not wired to public routes. It never sends an invoice, verifies
 * a payment, grants rights, or stores credentials outside this instance.
 */
import {
  PaymentAdapterError,
  PAYPAL_INVOICES_PATH,
  PAYPAL_OAUTH_TOKEN_PATH,
  PAYPAL_SANDBOX_BASE_URL,
  inspectPaymentConfiguration,
  validateAuthorizedInvoiceSnapshot,
} from "./adapter";
import type {
  AuthorizedInvoiceSnapshot,
  PaymentAdapter,
  PaymentAdapterDescriptor,
  PaymentConfigurationInput,
  PaymentInvoiceView,
} from "./contract";

export const SANDBOX_DRAFT_INTEGRATION_VERSION = "rightsreceipt-sandbox-draft-v1" as const;
const INV_ID = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/u;
const AUTH_TOKEN_MAX = 8192;
const MAX_RESPONSE = 16_384;
const TOKEN_URL = `${PAYPAL_SANDBOX_BASE_URL}${PAYPAL_OAUTH_TOKEN_PATH}` as const;
const INVOICE_URL = `${PAYPAL_SANDBOX_BASE_URL}${PAYPAL_INVOICES_PATH}` as const;

export interface SandboxMerchant {
  readonly name: string;
  readonly email: string;
}
export type SandboxHttpTransport = (url: string, init: RequestInit) => Promise<Response>;
/** Explicit server-side test handoff, never a browser or AI option. */
export interface SandboxDraftDependencies {
  readonly fetch: SandboxHttpTransport;
  readonly merchant: SandboxMerchant;
  readonly now?: () => number;
  /** Canonical callers bind this to the live dispatch claim and human session.
   * Checked after OAuth, immediately before every invoice POST, including refresh.
   */
  readonly authorizeCreate?: (request: Readonly<AuthorizedInvoiceSnapshot>) => Promise<boolean>;
  /** Enabling transport is a separate affirmative code-level action. */
  readonly sandboxDraftTransportEnabled: true;
}
export interface SandboxDraftAdapter extends PaymentAdapter {
  /** No publicly accessible token method. */
  readonly integrationVersion: typeof SANDBOX_DRAFT_INTEGRATION_VERSION;
}
export class SandboxDraftAuthorizationError extends Error {
  readonly code = "authorization_required" as const;
  constructor() { super("Current human authorization is required for this Sandbox draft."); this.name = "SandboxDraftAuthorizationError"; }
}

type StoredOperation = {
  readonly canonicalRequest: string;
  readonly dealKey: string;
  result: PaymentInvoiceView | null;
  pending: Promise<PaymentInvoiceView> | null;
};
type CachedToken = { token: string; usableUntilMs: number };

function fail(code: ConstructorParameters<typeof PaymentAdapterError>[0]): never {
  throw new PaymentAdapterError(code);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function merchantChecked(value: SandboxMerchant): SandboxMerchant {
  if (!object(value) || typeof value.name !== "string"
    || value.name.length < 2 || value.name.length > 120
    || value.name.trim() !== value.name || /[\x00-\x1f<>]/u.test(value.name)
    || typeof value.email !== "string" || value.email.length > 254 || !EMAIL.test(value.email)) {
    fail("invalid_configuration");
  }
  return Object.freeze({ name: value.name, email: value.email });
}
function encodeBasic(user: string, secret: string): string {
  const bytes = new TextEncoder().encode(`${user}:${secret}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function responseJson(response: Response, code: "sandbox_oauth_invalid_response" | "sandbox_invoice_invalid_response"): Promise<unknown> {
  if (response.redirected) fail(code);
  if (response.url) {
    let origin: string;
    try { origin = new URL(response.url).origin; } catch { fail(code); }
    if (origin !== PAYPAL_SANDBOX_BASE_URL) fail(code);
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE) fail(code);
  let text: string;
  try { text = await response.text(); } catch { fail(code); }
  if (text.length > MAX_RESPONSE) fail(code);
  try { return JSON.parse(text) as unknown; } catch { fail(code); }
}
function validToken(input: unknown): input is Record<"access_token" | "expires_in" | "token_type", unknown> {
  if (!object(input) || input.token_type !== "Bearer" || typeof input.access_token !== "string"
    || input.access_token.length === 0 || input.access_token.length > AUTH_TOKEN_MAX
    || /\s/u.test(input.access_token) || typeof input.expires_in !== "number"
    || !Number.isSafeInteger(input.expires_in) || input.expires_in < 1
    || input.expires_in > 86_400) return false;
  return true;
}
function fixedCents(cents: number): string {
  // Never use floating-point cents conversion or parseFloat.
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
async function digestSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** PayPal can return a minimal self-link instead of a full representation.
 * Extract only a strict Sandbox invoice reference. Never fetch response links.
 */
function draftResponseId(payload: unknown): string {
  if (!object(payload) || (payload.status !== undefined && payload.status !== "DRAFT")) fail("sandbox_invoice_invalid_response");
  const ids: string[] = [];
  if (payload.id !== undefined) {
    if (typeof payload.id !== "string" || !INV_ID.test(payload.id)) fail("sandbox_invoice_invalid_response");
    ids.push(payload.id);
  }
  const links: unknown[] = [];
  if (payload.href !== undefined) links.push(payload);
  if (payload.links !== undefined) {
    if (!Array.isArray(payload.links) || payload.links.length > 20) fail("sandbox_invoice_invalid_response");
    links.push(...payload.links.filter(x => object(x) && x.rel === "self"));
  }
  for (const link of links) {
    if (!object(link) || link.rel !== "self" || link.method !== "GET" || typeof link.href !== "string"
      || !link.href.startsWith(`${INVOICE_URL}/`)) fail("sandbox_invoice_invalid_response");
    const id = link.href.slice(INVOICE_URL.length + 1);
    if (!INV_ID.test(id)) fail("sandbox_invoice_invalid_response");
    ids.push(id);
  }
  if (!ids.length || new Set(ids).size !== 1) fail("sandbox_invoice_invalid_response");
  return ids[0]!;
}

/** No buyer-written executable text is accepted. All fields derive from the trusted snapshot. */
export async function mapSandboxDraftInvoice(
  raw: AuthorizedInvoiceSnapshot,
  merchant: SandboxMerchant,
): Promise<Readonly<Record<string, unknown>>> {
  const accepted = validateAuthorizedInvoiceSnapshot(raw);
  const sender = merchantChecked(merchant);
  const invoiceNumber = `RR-${(await digestSha256(accepted.requestId)).slice(0, 20).toUpperCase()}`;
  return Object.freeze({
    detail: {
      invoice_number: invoiceNumber,
      currency_code: "USD",
      reference: `RR-${accepted.caseId}`,
      note: `License terms: ${accepted.rightsSummary} | Asset: ${accepted.assetId} | Terms: ${accepted.termsVersionId} | Quote: ${accepted.quoteId}`,
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    },
    invoicer: { business_name: sender.name, email_address: sender.email },
    primary_recipients: [{ billing_info: { email_address: accepted.recipientEmail } }],
    items: [{
      name: "Visual artwork rights license", description: accepted.rightsSummary,
      quantity: "1", unit_of_measure: "QUANTITY",
      unit_amount: { currency_code: "USD", value: fixedCents(accepted.amountCents) },
    }],
  });
}

/**
 * The default createPayPalSandboxAdapter remains inert. Only this separately
 * constructed adapter can make sandbox draft requests. Its in-memory operation
 * journal is NOT sufficient for public Worker deployment or multi-instance use.
 */
export function createPayPalSandboxDraftAdapter(
  input: PaymentConfigurationInput,
  dependencies: SandboxDraftDependencies,
): SandboxDraftAdapter {
  const state = inspectPaymentConfiguration(input);
  if (state.mode !== "paypal_sandbox" || !dependencies || !object(dependencies)
    || dependencies.sandboxDraftTransportEnabled !== true || typeof dependencies.fetch !== "function"
    || (dependencies.authorizeCreate !== undefined && typeof dependencies.authorizeCreate !== "function")) {
    fail("invalid_configuration");
  }
  const merchant = merchantChecked(dependencies.merchant);
  const now = dependencies.now ?? (() => Date.now());
  if (typeof now !== "function") fail("invalid_configuration");
  // Credentials remain captured by a server-only closure, never exposed in the adapter.
  const clientId = input.PAYPAL_SANDBOX_CLIENT_ID!;
  if (clientId.includes(":")) fail("invalid_configuration");
  const clientSecret = input.PAYPAL_SANDBOX_CLIENT_SECRET!;
  const http = dependencies.fetch;
  let cached: CachedToken | null = null;
  let acquiring: Promise<string> | null = null;
  const operations = new Map<string, StoredOperation>();
  const deals = new Map<string, string>();
  const descriptor: PaymentAdapterDescriptor = Object.freeze({
    mode: "paypal_sandbox", environment: "sandbox",
    status: "sandbox_draft_transport_ready", networkEnabled: true,
    createsRealInvoice: false, authoritativePaymentEvidence: false,
  });

  async function token(force = false): Promise<string> {
    if (!force && cached && now() < cached.usableUntilMs) return cached.token;
    if (acquiring) return acquiring;
    const promise = (async () => {
      let response: Response;
      try {
        response = await http(TOKEN_URL, {
          method: "POST", redirect: "error", credentials: "omit", cache: "no-store",
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Basic ${encodeBasic(clientId, clientSecret)}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: "grant_type=client_credentials",
        });
      } catch { fail("sandbox_transport_unavailable"); }
      if (response.status === 429) fail("sandbox_rate_limited");
      if (!response.ok) fail("sandbox_oauth_rejected");
      const body = await responseJson(response, "sandbox_oauth_invalid_response");
      if (!validToken(body)) fail("sandbox_oauth_invalid_response");
      const lifetimeMs = Number(body.expires_in) * 1000;
      const safetyMs = Math.min(60_000, Math.max(5_000, lifetimeMs / 10));
      cached = { token: body.access_token as string, usableUntilMs: now() + Math.max(0, lifetimeMs - safetyMs) };
      return body.access_token as string;
    })();
    acquiring = promise;
    try { return await promise; }
    finally { if (acquiring === promise) acquiring = null; }
  }

  async function createRemote(request: AuthorizedInvoiceSnapshot): Promise<PaymentInvoiceView> {
    const body = JSON.stringify(await mapSandboxDraftInvoice(request, merchant));
    const attempt = async (bearer: string): Promise<Response> => {
      if (dependencies.authorizeCreate) {
        let authorized = false;
        try { authorized = await dependencies.authorizeCreate(request); } catch { /* Fail closed without provider or private errors. */ }
        if (authorized !== true) throw new SandboxDraftAuthorizationError();
      }
      try {
        return await http(INVOICE_URL, {
          method: "POST", redirect: "error", credentials: "omit", cache: "no-store",
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${bearer}`, "PayPal-Request-Id": request.requestId,
            "Content-Type": "application/json", Accept: "application/json", Prefer: "return=representation",
          }, body,
        });
      } catch { fail("sandbox_unknown_outcome"); }
    };
    let response = await attempt(await token());
    if (response.status === 401) {
      cached = null;
      response = await attempt(await token(true));
    }
    if (response.status === 429) fail("sandbox_rate_limited");
    if (response.status >= 500) fail("sandbox_unknown_outcome");
    if (response.status === 401 || response.status === 403) fail("sandbox_oauth_rejected");
    if (response.status !== 201 && response.status !== 200) fail("sandbox_invoice_rejected");
    const payload = await responseJson(response, "sandbox_invoice_invalid_response");
    const invoiceId = draftResponseId(payload);
    // A DRAFT is not sent, paid, or evidence of an active permission.
    return Object.freeze({
      invoiceId,
      mode: "paypal_sandbox", provider: "paypal", environment: "sandbox",
      caseId: request.caseId, quoteId: request.quoteId,
      termsVersionId: request.termsVersionId, buyerAcceptanceId: request.buyerAcceptanceId,
      amountCents: request.amountCents, currency: "USD", status: "DRAFT",
      simulated: false, authoritativePaymentEvidence: false,
    });
  }

  return Object.freeze({
    integrationVersion: SANDBOX_DRAFT_INTEGRATION_VERSION,
    descriptor,
    async createDraftInvoice(raw: AuthorizedInvoiceSnapshot): Promise<PaymentInvoiceView> {
      const request = validateAuthorizedInvoiceSnapshot(raw);
      const canonicalRequest = JSON.stringify(request);
      const dealKey = [request.caseId, request.quoteId, request.termsVersionId, request.buyerAcceptanceId].join(":");
      let operation = operations.get(request.requestId);
      if (operation) {
        if (operation.canonicalRequest !== canonicalRequest) fail("invoice_conflict");
      } else {
        if (deals.has(dealKey)) fail("invoice_conflict");
        operation = { canonicalRequest, dealKey, result: null, pending: null };
        operations.set(request.requestId, operation);
        deals.set(dealKey, request.requestId);
      }
      if (operation.result) return operation.result;
      if (operation.pending) return operation.pending;
      const current = operation;
      const pending = createRemote(request);
      current.pending = pending;
      try {
        const result = await pending;
        current.result = result;
        return result;
      } finally {
        if (current.pending === pending) current.pending = null;
      }
    },
    async sendInvoice(): Promise<never> { fail("sandbox_transport_pending"); },
    async getInvoice(): Promise<never> { fail("sandbox_transport_pending"); },
  });
}
