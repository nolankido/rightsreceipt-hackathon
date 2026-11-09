/** Capability-authorized local status and explicit, read-only Sandbox handoff.
 * No provider creation/send method or canonical mutation is reachable here.
 */
import { strictSecurityJson } from "./security/strict-json";
import { createD1BuyerPaymentStore } from "../../../packages/persistence/src/buyer-payment";
import type { ConsentDatabase } from "../../../packages/persistence/src/human-consent";
import type { ReceiptDatabase } from "../../../packages/receipts/src/store";
import { ConsentError, CONSENT_UUID, consentRow } from "../../../packages/application/src/consent-contract";
import { createHumanConsentService } from "../../../packages/application/src/human-consent";
import { verifyBuyerInvoice, type BuyerPaymentSnapshot } from "../../../packages/application/src/buyer-invoice";
import { createReceiptReader, validPublicReceiptId, type ReceiptReadResult } from "../../../packages/receipts/src/experience";
import { sha256Hex } from "../../../packages/receipts/src/canonical";
import { createPayPalSandboxDraftAdapter, type SandboxDraftDependencies } from "../../../packages/paypal/src/sandbox-draft";
import { createPayPalSandboxInvoiceAdapter, validateSandboxPaymentUrl } from "../../../packages/paypal/src/sandbox-invoice";
import { isLocallyAssessedSettlement } from "../../../packages/paypal/src/settlement";
import type { PaymentConfigurationInput } from "../../../packages/paypal/src/contract";

export interface BuyerPaymentBindings extends PaymentConfigurationInput {
  readonly DB?: ConsentDatabase & ReceiptDatabase;
  readonly BUYER_PAYMENT_ENABLED?: string;
  readonly HUMAN_CONSENT_ENABLED?: string;
  readonly HUMAN_CONSENT_ORIGIN?: string;
  readonly RIGHTS_RECEIPT_READ_ENABLED?: string;
  readonly RIGHTS_RECEIPT_PUBLIC_ORIGIN?: string;
}
const STATUS = "/api/invoices/buyer/status", HANDOFF = "/api/invoices/buyer/handoff";
const BASE = "https://api-m.sandbox.paypal.com", INVOICE = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow", "Vary": "Authorization", "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" };
class BuyerPaymentError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) { super("Buyer invoice information is unavailable."); this.code = code; this.status = status; }
}
function fail(code: string, status = 409): never { throw new BuyerPaymentError(code, status); }
function reply(status: number, data: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extra } });
}
function enabled(env: BuyerPaymentBindings | undefined): env is BuyerPaymentBindings & { DB: ConsentDatabase & ReceiptDatabase } {
  if (!env?.DB || env.BUYER_PAYMENT_ENABLED !== "true" || env.HUMAN_CONSENT_ENABLED !== "true"
    || env.PAYPAL_MODE !== "paypal_sandbox" || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) return false;
  try { const u = new URL(env.HUMAN_CONSENT_ORIGIN ?? ""); return u.protocol === "https:" && u.origin === env.HUMAN_CONSENT_ORIGIN && !u.username && !u.password; }
  catch { return false; }
}
function instant(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) fail("not_authorized", 403);
  const ms = Date.parse(value); if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) fail("not_authorized", 403); return ms;
}
function capability(s: BuyerPaymentSnapshot, now: number) {
  const k = consentRow(s.consent.root.capability);
  if (!CONSENT_UUID.test(String(k.buyer_capability_id)) || k.case_id !== s.caseId || k.revoked_at !== null
    || !Number.isSafeInteger(k.rotation_number) || Number(k.rotation_number) < 1 || instant(k.issued_at) > now || instant(k.expires_at) <= now) fail("not_authorized", 403);
  let actions: unknown; try { actions = JSON.parse(String(k.allowed_actions_json)); } catch { fail("not_authorized", 403); }
  if (!Array.isArray(actions) || actions.length > 4 || new Set(actions).size !== actions.length
    || actions.some(a => !["submit_request", "clarify", "review", "receipt"].includes(a)) || !actions.includes("review")) fail("not_authorized", 403);
  return { id: String(k.buyer_capability_id), expiresAt: instant(k.expires_at), receipt: actions.includes("receipt") };
}
function safeStage(s: BuyerPaymentSnapshot) {
  const c = consentRow(s.consent.root.case), d = s.consent.root.decision === null ? null : consentRow(s.consent.root.decision);
  const a = s.consent.root.acceptance === null ? null : consentRow(s.consent.root.acceptance);
  const matching = (v: Record<string, unknown> | null) => v?.case_id === s.caseId
    && v.terms_version_id === c.latest_terms_version_id && v.quote_id === c.latest_quote_id;
  if (c.case_outcome !== "open") return String(c.case_outcome);
  if (!matching(d)) return "awaiting_creator";
  if (d!.decision === "clarification_requested") return "clarification_required";
  if (d!.decision === "rejected") return "rejected";
  if (matching(a)) return s.consent.root.invoiceCount === 0 && s.consent.root.operationCount === 0 ? "accepted_awaiting_invoice" : "billing_started";
  return "awaiting_buyer";
}
async function readCommand(request: Request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "") || request.headers.has("content-encoding")) fail("invalid_command", 400);
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > 4096)) fail("invalid_command", 400);
  const reader = request.body?.getReader(); if (!reader) fail("invalid_command", 400);
  let length = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength;
      if (length > 4096) { await reader.cancel(); fail("invalid_command", 400); } chunks.push(part.value); }
    const bytes = new Uint8Array(length); let offset = 0; for (const b of chunks) { bytes.set(b, offset); offset += b.length; }
    const value = strictSecurityJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), 4096);
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_command", 400);
    const c = value as Record<string, unknown>;
    if (Object.keys(c).sort().join() !== "confirmed,expectedCaseVersion,invoiceId" || c.confirmed !== true
      || !Number.isSafeInteger(c.expectedCaseVersion) || Number(c.expectedCaseVersion) < 1 || Number(c.expectedCaseVersion) >= Number.MAX_SAFE_INTEGER
      || typeof c.invoiceId !== "string" || !INVOICE.test(c.invoiceId)) fail("invalid_command", 400);
    return c as { expectedCaseVersion: number; invoiceId: string; confirmed: true };
  } catch { return fail("invalid_command", 400); }
  finally { reader.releaseLock(); }
}

export function createBuyerPaymentRoutes(deps: {
  readonly transport?: (env: BuyerPaymentBindings) => SandboxDraftDependencies | null;
  readonly now?: () => Date;
  readonly limit?: (request: Request) => boolean;
} = {}) {
  const now = deps.now ?? (() => new Date()); let minute = -1, used = 0;
  return async (request: Request, env: BuyerPaymentBindings | undefined): Promise<Response | null> => {
    const url = new URL(request.url); if (!url.pathname.startsWith("/api/invoices/buyer/")) return null;
    if (!enabled(env)) return reply(503, { error: "buyer_payment_unavailable" });
    if (url.origin !== env.HUMAN_CONSENT_ORIGIN || url.search) return reply(400, { error: "invalid_request" });
    const currentMinute = Math.floor(now().getTime() / 60000); if (currentMinute !== minute) { minute = currentMinute; used = 0; }
    if (!(deps.limit ? deps.limit(request) : ++used <= 60)) return reply(429, { error: "rate_limited" }, { "Retry-After": "60" });
    if (![STATUS, HANDOFF].includes(url.pathname)) return reply(404, { error: "not_found" });
    const handoff = url.pathname === HANDOFF, method = handoff ? "POST" : "GET";
    if (request.method !== method) return reply(405, { error: "method_not_allowed" }, { Allow: method });
    if ((request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")
      || (request.headers.has("origin") && request.headers.get("origin") !== url.origin)
      || (handoff && request.headers.get("origin") !== url.origin)) return reply(403, { error: "not_authorized" });
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) return reply(403, { error: "not_authorized" });
    const started = now().getTime();
    try {
      const database = env.DB;
      // Captured only in this request's closure, never returned, persisted or logged.
      const configuration = () => JSON.stringify([env.APP_MODE, env.PAYPAL_MODE, env.PAYPAL_BASE_URL,
        env.PAYPAL_SANDBOX_CLIENT_ID, env.PAYPAL_SANDBOX_CLIENT_SECRET, env.BUYER_PAYMENT_ENABLED,
        env.HUMAN_CONSENT_ENABLED, env.HUMAN_CONSENT_ORIGIN, env.RIGHTS_RECEIPT_READ_ENABLED, env.RIGHTS_RECEIPT_PUBLIC_ORIGIN]);
      const initialConfiguration = configuration();
      const digest = await sha256Hex(token), store = createD1BuyerPaymentStore(env.DB), s = await store.load(digest);
      if (!s) fail("not_authorized", 403);
      const access = capability(s, now().getTime()), c = consentRow(s.consent.root.case);
      if (c.case_id !== s.caseId || !CONSENT_UUID.test(s.caseId) || !Number.isSafeInteger(c.row_version)
        || Number(c.row_version) < 1 || Number(c.row_version) >= Number.MAX_SAFE_INTEGER
        || !["open", "rejected", "canceled"].includes(String(c.case_outcome))) fail("source_invalid");
      const caseVersion = Number(c.row_version), stage = safeStage(s), b = s.invoice.creation.binding;
      let invoiceId: string | null = null, invoiceStatus: string | null = null;
      if (b) {
        if (b.case_id !== s.caseId || b.invoice_binding_id !== c.invoice_binding_id || b.provider !== "paypal" || b.environment !== "sandbox"
          || !["create_pending", "draft", "send_pending", "sent", "paid", "canceled", "fully_refunded", "reconciliation_required"].includes(String(b.invoice_status))) fail("source_invalid");
        if (b.provider_invoice_id !== null && (typeof b.provider_invoice_id !== "string" || !INVOICE.test(b.provider_invoice_id))) fail("source_invalid");
        invoiceId = b.provider_invoice_id as string | null; invoiceStatus = String(b.invoice_status);
      } else if (c.invoice_binding_id !== null) fail("source_invalid");
      let merchantIdentity: string | null = null;
      const sameMerchant = () => {
        if (merchantIdentity === null) return true;
        try { const t = deps.transport?.(env); return !!t && t.sandboxDraftTransportEnabled === true && JSON.stringify(t.merchant) === merchantIdentity; }
        catch { return false; }
      };
      const current = async () => {
        if (request.signal.aborted || !enabled(env) || env.HUMAN_CONSENT_ORIGIN !== url.origin
          || env.DB !== database || configuration() !== initialConfiguration || !sameMerchant()) fail("not_authorized", 403);
        if (!await store.unchanged(s, digest, access.id, now().toISOString())) {
          // Distinguish current capability denial from a material version change.
          const fresh = await store.load(digest); if (!fresh) fail("not_authorized", 403);
          capability(fresh, now().getTime()); fail("stale_revision");
        }
        // No awaited work follows these final time/configuration checks.
        capability(s, now().getTime());
        if (request.signal.aborted || !enabled(env) || env.HUMAN_CONSENT_ORIGIN !== url.origin
          || env.DB !== database || configuration() !== initialConfiguration || !sameMerchant()) fail("not_authorized", 403);
      };
      let configured: SandboxDraftDependencies | null = null;
      try { configured = deps.transport?.(env) ?? null; if (configured) createPayPalSandboxDraftAdapter(env, configured); }
      catch { configured = null; }
      if (configured) merchantIdentity = JSON.stringify(configured.merchant);
      const human = createHumanConsentService({ store: store.consent, now });
      let offerValid = false;
      try { const offer = await human.reviewBuyer(token); offerValid = offer.caseVersion === caseVersion && offer.stage === stage; }
      catch (error) { if (error instanceof ConsentError && error.code === "not_authorized") fail("not_authorized", 403); }
      if (!handoff) {
        let receipt: ReceiptReadResult | null = null;
        const receiptsEnabled = env.RIGHTS_RECEIPT_READ_ENABLED === "true" && env.RIGHTS_RECEIPT_PUBLIC_ORIGIN === url.origin;
        if (receiptsEnabled) receipt = await createReceiptReader(store.receipts, now).read(s.caseId);
        let paymentLinkUntil = 0;
        if (configured && offerValid && invoiceStatus === "sent") {
          try { paymentLinkUntil = (await verifyBuyerInvoice(s, env.PAYPAL_SANDBOX_CLIENT_ID ?? "", configured.merchant, now().toISOString())).licenseEndsAt; }
          catch { /* A current receipt remains readable even after prepayment policy validity ends. */ }
        }
        const verification = s.receipt.root.verification === null ? null : consentRow(s.receipt.root.verification);
        const publicId = verification?.public_verification_id;
        const publicPath = receiptsEnabled && verification?.case_id === s.caseId && verification.verification_record_id === c.verification_record_id
          && typeof publicId === "string" && validPublicReceiptId(publicId) ? `/verify/receipt/${publicId}` : null;
        const canReadPrivate = access.receipt && receiptsEnabled && receipt?.publicView.integrity === "verified" && !!receipt.payload && !!receipt.record;
        await current();
        const checkedAt = now().toISOString();
        if (receipt && (Date.parse(checkedAt) < Date.parse(receipt.publicView.checkedAt)
          || receipt.publicView.checkedAt.slice(0, 10) !== checkedAt.slice(0, 10)
          || Date.parse(checkedAt) - Date.parse(receipt.publicView.checkedAt) > 60000)) fail("stale_revision");
        return reply(200, { schemaVersion: "buyer-invoice-status-v1", environment: "sandbox", caseId: s.caseId,
          caseVersion, stage, invoiceId, invoiceStatus, canRequestPaymentLink: paymentLinkUntil > Date.parse(checkedAt), checkedAt,
          receipt: { status: receipt?.publicView.status ?? "unavailable", integrity: receipt?.publicView.integrity ?? "not_verified",
            checkedAt: receipt?.publicView.checkedAt ?? checkedAt, canReadPrivate,
            privatePath: canReadPrivate ? "/receipts/buyer" : null, publicVerificationPath: publicPath, record: receipt?.publicView.receipt ?? null } });
      }
      const command = await readCommand(request);
      if (command.expectedCaseVersion !== caseVersion || command.invoiceId !== invoiceId) fail("stale_revision");
      if (!offerValid) fail("invoice_unavailable");
      if (!configured) fail("payment_handoff_unavailable", 503);
      let checked: Awaited<ReturnType<typeof verifyBuyerInvoice>>;
      try { checked = await verifyBuyerInvoice(s, env.PAYPAL_SANDBOX_CLIENT_ID ?? "", configured.merchant, now().toISOString()); }
      catch { return fail("invoice_unavailable"); }
      await current();
      const endpoint = `${BASE}/v2/invoicing/invoices/${checked.invoiceId}`, transport = configured;
      const denyMutation = async (): Promise<never> => fail("payment_handoff_unavailable", 503);
      // The adapter's GET normally confirms a journal. This private read-only
      // journal supplies the verified entry and makes that acknowledgement inert.
      const adapter = createPayPalSandboxInvoiceAdapter(env, { ...transport, now: () => now().getTime(),
        sandboxInvoiceTransportEnabled: true, authorize: async () => false,
        journal: { byInvoice: async id => id === checked.invoiceId ? structuredClone(checked.entry) : null,
          confirmSend: async () => {}, reserve: denyMutation, complete: denyMutation, claimSend: denyMutation },
        fetch: async (target, init) => {
          if (!((target === `${BASE}/v1/oauth2/token` && init.method === "POST") || (target === endpoint && init.method === "GET"))) return denyMutation();
          await current();
          const response = await transport.fetch(target, init);
          await current(); return response;
        } });
      let observed: Awaited<ReturnType<typeof adapter.getInvoice>>;
      try { observed = await adapter.getInvoice(checked.invoiceId); }
      catch (error) {
        // Transport adapters intentionally hide errors. Recheck capability and
        // source so a revocation or stale tuple retains its public error class.
        await current(); throw error;
      }
      const observedAt = instant(observed.observedAt), at = now().getTime();
      if (observedAt < started || observedAt > at || at < started) fail("payment_handoff_unavailable", 503);
      const expiresAt = Math.min(started + 30000, observedAt + 30000, access.expiresAt, checked.licenseEndsAt);
      let paymentUrl: string | null = null;
      if (["UNPAID", "SENT", "SHARED"].includes(observed.status) && !observed.requiresReconciliation
        && isLocallyAssessedSettlement(observed.settlement) && observed.settlement.conclusion === "unpaid"
        && observed.settlement.paidCents === 0 && observed.settlement.refundedCents === 0
        && observed.settlement.dueCents === checked.request.amountCents && observed.paymentUrl) {
        paymentUrl = validateSandboxPaymentUrl(observed.paymentUrl);
      }
      await current();
      const remaining = Math.max(0, expiresAt - now().getTime()); if (!remaining) paymentUrl = null;
      return reply(200, { schemaVersion: "buyer-payment-handoff-v1", environment: "sandbox", caseId: s.caseId, caseVersion,
        invoiceId: checked.invoiceId, providerStatus: observed.status, observedAt: observed.observedAt,
        paymentUrl, expiresInMs: paymentUrl ? remaining : 0, requiresReconciliation: paymentUrl === null,
        paymentConfirmed: false, permissionGranted: false });
    } catch (error) {
      return error instanceof BuyerPaymentError ? reply(error.status, { error: error.code })
        : reply(503, { error: "payment_handoff_unavailable" });
    }
  };
}
