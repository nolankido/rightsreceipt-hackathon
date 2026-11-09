/** Opt-in Sandbox send/read transport. No public route, webhook, or permission authority. */
import { sandboxSendRequestId } from "./delivery-adoption";
import { assessInvoiceSettlement, type InvoiceSettlement } from "./settlement";
import { PAYPAL_SANDBOX_BASE_URL, inspectPaymentConfiguration, validateAuthorizedInvoiceSnapshot } from "./adapter";
import { createPayPalSandboxDraftAdapter, mapSandboxDraftInvoice, type SandboxDraftDependencies } from "./sandbox-draft";
import type { AuthorizedInvoiceSnapshot, PaymentAdapter, PaymentConfigurationInput, PaymentInvoiceView } from "./contract";
import type { DeliveryEntry, SandboxDeliveryJournal, SandboxInvoiceBinding } from "./delivery-journal";

export const PROVIDER_INVOICE_STATUSES = [
  "DRAFT", "SENT", "SCHEDULED", "UNPAID", "PAID", "MARKED_AS_PAID", "CANCELLED",
  "REFUNDED", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "MARKED_AS_REFUNDED",
  "PAYMENT_PENDING", "AUTO_CANCELLED", "PAID_EXTERNAL", "REFUNDED_EXTERNAL", "SHARED",
] as const;
export interface SandboxInvoiceView extends PaymentInvoiceView {
  readonly settlement: InvoiceSettlement;
  readonly paymentUrl: string | null;
  readonly observedAt: string;
  readonly requiresReconciliation: boolean;
}
export type DeliveryErrorCode = "invoice_not_bound" | "delivery_conflict" | "authorization_required"
  | "transport_unavailable" | "oauth_rejected" | "rate_limited" | "invoice_not_found"
  | "provider_rejected" | "invalid_provider_response" | "invoice_mismatch"
  | "unsafe_payment_url" | "unknown_send_outcome" | "reconciliation_required";
const MESSAGES: Record<DeliveryErrorCode, string> = {
  invoice_not_bound: "No trusted local Sandbox invoice binding exists.",
  delivery_conflict: "The accepted invoice or merchant binding changed.",
  authorization_required: "Current creator approval and buyer acceptance are required.",
  transport_unavailable: "Sandbox status is unavailable. Retry a read, not a blind send.",
  oauth_rejected: "Sandbox authentication failed.",
  rate_limited: "Sandbox requests are rate limited. Retry status retrieval later.",
  invoice_not_found: "The bound invoice was not found in PayPal Sandbox.",
  provider_rejected: "PayPal Sandbox rejected this operation.",
  invalid_provider_response: "The Sandbox response could not be validated.",
  invoice_mismatch: "The remote invoice differs from the accepted licensing package.",
  unsafe_payment_url: "The provider payment link is not an allowed Sandbox invoice URL.",
  unknown_send_outcome: "Invoice sending has an uncertain outcome. Retrieve status before any recovery.",
  reconciliation_required: "A previous operation needs reconciliation. Automatic resend is blocked.",
};
export class SandboxDeliveryError extends Error {
  readonly code: DeliveryErrorCode;
  constructor(code: DeliveryErrorCode) { super(MESSAGES[code]); this.name = "SandboxDeliveryError"; this.code = code; }
}
function fail(code: DeliveryErrorCode): never { throw new SandboxDeliveryError(code); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const ID = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const PAYABLE = new Set(["UNPAID", "SENT", "SHARED"]);
const UNCERTAIN = new Set(["PARTIALLY_PAID", "PARTIALLY_REFUNDED", "MARKED_AS_PAID",
  "MARKED_AS_REFUNDED", "PAID_EXTERNAL", "REFUNDED_EXTERNAL", "PAYMENT_PENDING", "UNKNOWN"]);
async function hash(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function money(value: unknown): number {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,8})(?:\.\d{1,2})?$/u.test(value)) fail("invoice_mismatch");
  const [whole = "", fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1_000_000_000) fail("invoice_mismatch");
  return cents;
}
/** A browser handoff only. Never fetch the supplied URL or accept API/merchant links. */
export function validateSandboxPaymentUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\\x00-\x1f%]/u.test(value)) fail("unsafe_payment_url");
  let url: URL;
  try { url = new URL(value); } catch { fail("unsafe_payment_url"); }
  if (url.origin !== "https://www.sandbox.paypal.com" || url.username || url.password || url.search
    || !/^https:\/\/www\.sandbox\.paypal\.com\//u.test(value)
    || !/^\/invoice\/(?:p\/|payerView\/details\/)[A-Za-z0-9/_-]*$/u.test(url.pathname)
    || !/^(?:#[A-Za-z0-9_-]+)?$/u.test(url.hash)
    || (url.pathname.endsWith("/") && !url.hash)) fail("unsafe_payment_url");
  return url.href;
}
function envelope(response: Response): void {
  if (response.redirected || (response.status >= 300 && response.status < 400)) fail("invalid_provider_response");
  if (response.url) {
    let origin: string;
    try { origin = new URL(response.url).origin; } catch { fail("invalid_provider_response"); }
    if (origin !== PAYPAL_SANDBOX_BASE_URL) fail("invalid_provider_response");
  }
}
async function json(response: Response, maxBytes = 65536): Promise<unknown> {
  envelope(response);
  if (Number(response.headers.get("content-length")) > maxBytes || !response.body) fail("invalid_provider_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); fail("invalid_provider_response"); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch { fail("invalid_provider_response"); }
  finally { reader.releaseLock(); }
}
export type SandboxConsentContext = Pick<AuthorizedInvoiceSnapshot,
  "caseId" | "assetId" | "quoteId" | "termsVersionId" | "creatorDecisionId"
  | "buyerAcceptanceId" | "amountCents" | "currency">;
export interface SandboxInvoiceDependencies extends SandboxDraftDependencies {
  readonly sandboxInvoiceTransportEnabled: true;
  readonly journal: SandboxDeliveryJournal;
  /** Trusted application rechecks current exact consent tuple; never accept a browser boolean. */
  readonly authorize: (invoice: Readonly<SandboxConsentContext>) => Promise<boolean>;
}
export interface SandboxInvoiceAdapter extends PaymentAdapter {
  sendInvoice(id: string): Promise<SandboxInvoiceView>;
  getInvoice(id: string): Promise<SandboxInvoiceView>;
}

export function createPayPalSandboxInvoiceAdapter(
  config: PaymentConfigurationInput, deps: SandboxInvoiceDependencies,
): SandboxInvoiceAdapter {
  const state = inspectPaymentConfiguration(config);
  if (state.mode !== "paypal_sandbox" || !deps || deps.sandboxInvoiceTransportEnabled !== true
    || !deps.journal || typeof deps.authorize !== "function") fail("authorization_required");
  const merchant = Object.freeze({ ...deps.merchant });
  const draft = createPayPalSandboxDraftAdapter(config, { ...deps, merchant });
  const now = deps.now ?? (() => Date.now());
  const clientId = config.PAYPAL_SANDBOX_CLIENT_ID!;
  const secret = config.PAYPAL_SANDBOX_CLIENT_SECRET!;
  const scope = hash(`${clientId}\n${merchant.email.toLowerCase()}`);
  const creations = new Map<string, { fingerprint: string; pending: Promise<PaymentInvoiceView> }>();
  const sends = new Map<string, Promise<SandboxInvoiceView>>();
  let cached: { value: string; until: number } | null = null;
  let acquiring: Promise<string> | null = null;
  async function authorize(value: SandboxConsentContext): Promise<void> {
    const snapshot = Object.freeze({ caseId: value.caseId, assetId: value.assetId,
      quoteId: value.quoteId, termsVersionId: value.termsVersionId,
      creatorDecisionId: value.creatorDecisionId, buyerAcceptanceId: value.buyerAcceptanceId,
      amountCents: value.amountCents, currency: value.currency });
    let allowed = false;
    try { allowed = await deps.authorize(snapshot); } catch { fail("authorization_required"); }
    if (allowed !== true) fail("authorization_required");
  }
  async function journalCall<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch { fail("delivery_conflict"); }
  }
  async function token(): Promise<string> {
    if (cached && now() < cached.until) return cached.value;
    if (acquiring) return acquiring;
    const task = (async () => {
      const basic = btoa([...new TextEncoder().encode(`${clientId}:${secret}`)].map(b => String.fromCharCode(b)).join(""));
      let response: Response;
      try { response = await deps.fetch(`${PAYPAL_SANDBOX_BASE_URL}/v1/oauth2/token`, {
        method: "POST", redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: "grant_type=client_credentials",
      }); } catch { fail("transport_unavailable"); }
      envelope(response);
      if (response.status === 429) fail("rate_limited");
      if (!response.ok) fail("oauth_rejected");
      const body = await json(response, 16384);
      if (!object(body) || body.token_type !== "Bearer" || typeof body.access_token !== "string"
        || !body.access_token.length || body.access_token.length > 8192 || /\s/u.test(body.access_token)
        || typeof body.expires_in !== "number" || !Number.isSafeInteger(body.expires_in)
        || body.expires_in < 1 || body.expires_in > 86400) fail("invalid_provider_response");
      const ttl = body.expires_in * 1000;
      cached = { value: body.access_token, until: now() + Math.max(0, ttl - Math.min(60000, Math.max(5000, ttl / 10))) };
      return cached.value;
    })();
    acquiring = task;
    try { return await task; } finally { if (acquiring === task) acquiring = null; }
  }
  async function request(id: string, sendKey?: string): Promise<Response> {
    const send = sendKey !== undefined;
    const perform = async (bearer: string) => {
      // OAuth acquisition/refresh may yield. Recheck consent AFTER it, immediately
      // before every send POST, including the bounded explicit-401 retry.
      if (send) {
        const entry = await bound(id);
        if (entry.sendState !== "started") fail("reconciliation_required");
        await authorize({ ...entry.binding.draft, assetId: entry.binding.assetId, creatorDecisionId: entry.binding.creatorDecisionId });
      }
      try { return await deps.fetch(`${PAYPAL_SANDBOX_BASE_URL}/v2/invoicing/invoices/${id}${send ? "/send" : ""}`, {
        method: send ? "POST" : "GET", redirect: "error", credentials: "omit", cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json",
          ...(send ? { "Content-Type": "application/json", "PayPal-Request-Id": sendKey } : {}) },
        ...(send ? { body: JSON.stringify({ send_to_recipient: true, send_to_invoicer: false }) } : {}),
      }); } catch { fail(send ? "unknown_send_outcome" : "transport_unavailable"); }
    };
    let response = await perform(await token()); envelope(response);
    if (response.status === 401) { cached = null; response = await perform(await token()); envelope(response); }
    if (response.status === 401 || response.status === 403) fail("oauth_rejected");
    if (response.status === 404) fail("invoice_not_found");
    if (response.status === 429) fail("rate_limited");
    if (response.status >= 500) fail(send ? "unknown_send_outcome" : "transport_unavailable");
    if (response.status !== 200 && !(send && response.status === 202)) fail("provider_rejected");
    return response;
  }
  async function bound(id: string): Promise<DeliveryEntry & { binding: SandboxInvoiceBinding }> {
    if (!ID.test(id)) fail("invoice_not_bound");
    const entry = await journalCall(() => deps.journal.byInvoice(id));
    if (!entry?.binding || entry.binding.draft.invoiceId !== id || entry.merchantHash !== await scope) fail("invoice_not_bound");
    return entry as DeliveryEntry & { binding: SandboxInvoiceBinding };
  }
  async function getInvoice(id: string): Promise<SandboxInvoiceView> {
    const entry = await bound(id), binding = entry.binding;
    const raw = await json(await request(id));
    if (!object(raw) || raw.id !== id || typeof raw.status !== "string" || !object(raw.detail)
      || !object(raw.amount) || raw.amount.currency_code !== "USD" || raw.detail.currency_code !== "USD"
      || money(raw.amount.value) !== binding.draft.amountCents
      || raw.detail.invoice_number !== binding.invoiceNumber || raw.detail.reference !== `RR-${entry.caseId}`
      || typeof raw.detail.note !== "string" || await hash(raw.detail.note) !== binding.noteHash
      || !object(raw.invoicer) || typeof raw.invoicer.email_address !== "string"
      || await hash(raw.invoicer.email_address.toLowerCase()) !== binding.merchantEmailHash
      || !Array.isArray(raw.primary_recipients) || raw.primary_recipients.length !== 1) fail("invoice_mismatch");
    const recipient: unknown = raw.primary_recipients[0];
    if (!object(recipient) || !object(recipient.billing_info) || typeof recipient.billing_info.email_address !== "string"
      || await hash(recipient.billing_info.email_address.toLowerCase()) !== binding.recipientHash
      || !Array.isArray(raw.items) || raw.items.length !== 1) fail("invoice_mismatch");
    const item: unknown = raw.items[0];
    if (!object(item) || item.name !== "Visual artwork rights license" || typeof item.description !== "string"
      || await hash(item.description) !== binding.summaryHash || item.quantity !== "1" || !object(item.unit_amount)
      || item.unit_amount.currency_code !== "USD" || money(item.unit_amount.value) !== binding.draft.amountCents) fail("invoice_mismatch");
    const status = PROVIDER_INVOICE_STATUSES.includes(raw.status as typeof PROVIDER_INVOICE_STATUSES[number])
      ? raw.status as typeof PROVIDER_INVOICE_STATUSES[number] : "UNKNOWN";
    let url: string | null = null;
    const metadata = raw.detail.metadata;
    if (object(metadata) && metadata.recipient_view_url !== undefined) url = validateSandboxPaymentUrl(metadata.recipient_view_url);
    if (status !== "DRAFT" && status !== "UNKNOWN") await journalCall(() => deps.journal.confirmSend(id));
    const observedAt = new Date(now()).toISOString();
    const settlement = assessInvoiceSettlement(raw, binding.draft.amountCents, observedAt);
    return Object.freeze({ ...binding.draft, status, settlement, paymentUrl: PAYABLE.has(status) ? url : null,
      observedAt,
      requiresReconciliation: UNCERTAIN.has(status) || (PAYABLE.has(status) && !url),
      authoritativePaymentEvidence: false });
  }
  async function sendInvoice(id: string): Promise<SandboxInvoiceView> {
    const entry = await bound(id);
    await authorize({ ...entry.binding.draft, assetId: entry.binding.assetId, creatorDecisionId: entry.binding.creatorDecisionId });
    const prior = await getInvoice(id);
    if (prior.status !== "DRAFT") {
      if (prior.status === "UNKNOWN") fail("reconciliation_required");
      return prior;
    }
    if (!await journalCall(() => deps.journal.claimSend(id))) fail("reconciliation_required");
    // Recheck consent after provider I/O and the durable claim, before the external effect.
    await authorize({ ...entry.binding.draft, assetId: entry.binding.assetId, creatorDecisionId: entry.binding.creatorDecisionId });
    // Acquire journal ownership BEFORE the external effect. A crash keeps send blocked.
    const sendKey = await sandboxSendRequestId(entry.merchantHash, id);
    await request(id, sendKey);
    // A 200/202 acknowledgement is NOT payment, a payable link, or even a sent status.
    const after = await getInvoice(id);
    if (after.status === "DRAFT" || after.status === "UNKNOWN") fail("reconciliation_required");
    return after;
  }
  return Object.freeze({
    descriptor: Object.freeze({ ...draft.descriptor, status: "sandbox_invoice_transport_ready" as const }),
    async createDraftInvoice(raw: AuthorizedInvoiceSnapshot): Promise<PaymentInvoiceView> {
      const accepted = validateAuthorizedInvoiceSnapshot(raw);
      await authorize(accepted);
      const fingerprint = await hash(JSON.stringify(accepted));
      const active = creations.get(accepted.requestId);
      if (active) { if (active.fingerprint !== fingerprint) fail("delivery_conflict"); return active.pending; }
      const task = (async () => {
        const merchantHash = await scope;
        const reservation = await journalCall(() => deps.journal.reserve({ requestId: accepted.requestId, caseId: accepted.caseId,
          snapshotHash: fingerprint, merchantHash }));
        if (!reservation.acquired) {
          if (!reservation.entry.binding) fail("reconciliation_required");
          return Object.freeze({ ...reservation.entry.binding.draft });
        }
        const result = await draft.createDraftInvoice(accepted);
        const mapped = await mapSandboxDraftInvoice(accepted, merchant);
        const detail = mapped.detail as Record<string, unknown>;
        const binding: SandboxInvoiceBinding = {
          draft: result, assetId: accepted.assetId, creatorDecisionId: accepted.creatorDecisionId, invoiceNumber: String(detail.invoice_number),
          recipientHash: await hash(accepted.recipientEmail.toLowerCase()),
          merchantEmailHash: await hash(merchant.email.toLowerCase()),
          noteHash: await hash(String(detail.note)), summaryHash: await hash(accepted.rightsSummary),
        };
        await journalCall(() => deps.journal.complete(accepted.requestId, binding));
        return result;
      })();
      creations.set(accepted.requestId, { fingerprint, pending: task });
      try { return await task; } finally { creations.delete(accepted.requestId); }
    },
    async sendInvoice(id: string) {
      // Every invocation checks current authorization, including callers joining an in-flight send.
      const entry = await bound(id);
      await authorize({ ...entry.binding.draft, assetId: entry.binding.assetId, creatorDecisionId: entry.binding.creatorDecisionId });
      const existing = sends.get(id); if (existing) return existing;
      const task = sendInvoice(id); sends.set(id, task);
      try { return await task; } finally { if (sends.get(id) === task) sends.delete(id); }
    },
    getInvoice,
  });
}
