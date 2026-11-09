/** Explicit, canonical Sandbox delivery. No receipt, money or permission authority.
 * The durable coordinator claim AND the adapter journal prevent blind re-sends.
 */
import { canonicalHash, canonicalJson } from "../../receipts/src/canonical";
import { verifyAcceptedInvoiceSnapshot } from "./human-consent";
import { consentId, consentRow, consentTime, type CreatorPrincipal } from "./consent-contract";
import type { InvoiceCreationSnapshot } from "./invoice-creation";
import { prepareDeliveryAdoption, sandboxSendRequestId } from "../../paypal/src/delivery-adoption";
import type { DeliveryEntry } from "../../paypal/src/delivery-journal";
import type { SandboxMerchant } from "../../paypal/src/sandbox-draft";
import { validateSandboxPaymentUrl, type SandboxConsentContext, type SandboxInvoiceView } from "../../paypal/src/sandbox-invoice";
import type { InvoiceExecutionFence } from "./invoice-recovery-contract";
export interface SendCommand { readonly expectedCaseVersion: number; readonly invoiceId: string; readonly confirmed: true }
export interface InvoiceSendingSnapshot {
  readonly stateJson: string; readonly creation: InvoiceCreationSnapshot;
  readonly operations: readonly Record<string, unknown>[]; readonly journal: DeliveryEntry | null;
}
export interface SendReservation {
  readonly snapshot: InvoiceSendingSnapshot; readonly entry: DeliveryEntry;
  readonly fingerprint: string; readonly sendKey: string; readonly operationId: string; readonly actor: string; readonly at: string;
}
export interface InvoiceSendingStore {
  load(caseId: string): Promise<InvoiceSendingSnapshot | null>;
  reserve(input: SendReservation): Promise<void>;
  claim(snapshot: InvoiceSendingSnapshot, actor: string, at: string): Promise<void>;
  complete(snapshot: InvoiceSendingSnapshot, view: SandboxInvoiceView, actor: string, at: string): Promise<void>;
}
export type SendFailure = "invalid_command" | "not_authorized" | "not_found" | "source_invalid"
  | "delivery_conflict" | "stale_revision" | "storage_unavailable" | "transport_unavailable";
export class InvoiceSendingError extends Error {
  readonly code: SendFailure;
  constructor(code: SendFailure) { super("Sandbox invoice delivery is blocked."); this.name = "InvoiceSendingError"; this.code = code; }
}
function fail(code: SendFailure): never { throw new InvoiceSendingError(code); }
const ID = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const PAYABLE = ["SENT", "UNPAID", "SHARED"];
const OBSERVED = [...PAYABLE, "SCHEDULED", "PAID", "CANCELLED", "REFUNDED", "PARTIALLY_PAID", "PARTIALLY_REFUNDED",
  "PAYMENT_PENDING", "MARKED_AS_PAID", "MARKED_AS_REFUNDED", "PAID_EXTERNAL", "REFUNDED_EXTERNAL", "AUTO_CANCELLED"];
function outcome(value: "reserved" | "already_recorded" | "delivery_observed" | "awaiting_reconciliation" | "retry_pending",
  s: InvoiceSendingSnapshot, view?: SandboxInvoiceView) {
  return Object.freeze({ outcome: value, environment: "sandbox" as const,
    operationId: s.operations[0]?.payment_operation_id ?? null, invoiceId: s.creation.binding?.provider_invoice_id ?? null,
    paymentUrl: view && s.creation.binding?.invoice_status === "sent" && PAYABLE.includes(view.status)
      && !view.requiresReconciliation && view.settlement?.conclusion === "unpaid" ? view.paymentUrl : null,
    providerStatus: view?.status ?? null, paymentConfirmed: false as const, permissionGranted: false as const });
}
export function createInvoiceSendingService(deps: {
  readonly store: InvoiceSendingStore; readonly accountFingerprint: string;
  readonly clientId: string; readonly merchant: SandboxMerchant;
  readonly authorizeCreator?: (caseId: string) => Promise<CreatorPrincipal | null>;
  readonly sendInvoice?: (invoiceId: string) => Promise<SandboxInvoiceView>;
  readonly getInvoice?: (invoiceId: string) => Promise<SandboxInvoiceView>;
  readonly now?: () => Date;
  readonly checkActive?: () => void;
}) {
  if (!/^[0-9a-f]{64}$/u.test(deps.accountFingerprint)) fail("invalid_command");
  const time = () => consentTime((deps.now?.() ?? new Date()).toISOString());
  async function owner(caseId: string, prior?: CreatorPrincipal) {
    try {
      const p = await deps.authorizeCreator?.(caseId);
      if (!p || !/^[A-Za-z0-9._:-]{1,120}$/u.test(p.actorReference)) fail("not_authorized");
      consentId(p.workspaceId);
      if (prior && (prior.workspaceId !== p.workspaceId || prior.actorReference !== p.actorReference)) fail("not_authorized");
      return Object.freeze({ workspaceId: p.workspaceId, actorReference: p.actorReference });
    } catch { return fail("not_authorized"); }
  }
  async function load(caseId: string) {
    let s: InvoiceSendingSnapshot | null;
    try { s = await deps.store.load(caseId); } catch { return fail("storage_unavailable"); }
    if (!s) fail("not_found"); return s;
  }
  async function check(s: InvoiceSendingSnapshot, principal: CreatorPrincipal) {
    try {
      const c = s.creation, b = consentRow(c.binding), op = c.operations[0], v = consentRow(c.verification);
      const { deal, request: r } = await verifyAcceptedInvoiceSnapshot(c.consent, time());
      if (deal.workspaceId !== principal.workspaceId) fail("not_authorized");
      const creationHash = await canonicalHash({ schema: "invoice-creation-v1", account_sha256: deps.accountFingerprint, request: r });
      if (c.operations.length !== 1 || !op || op.status !== "succeeded" || op.attempt_count !== 1
        || op.operation_type !== "create_invoice" || op.provider !== "paypal" || op.environment !== "sandbox"
        || op.operation_key !== `invoice-create:${r.requestId}` || op.provider_request_id !== r.requestId
        || op.command_fingerprint !== creationHash || op.case_id !== r.caseId || op.error_code !== null
        || b.case_id !== r.caseId || b.provider !== "paypal" || b.environment !== "sandbox"
        || typeof b.provider_invoice_id !== "string" || !ID.test(b.provider_invoice_id)
        || op.provider_reference !== b.provider_invoice_id || b.safe_invoice_reference !== b.provider_invoice_id
        || consentRow(c.consent.root.case).invoice_binding_id !== b.invoice_binding_id
        || b.terms_version_id !== r.termsVersionId || b.quote_id !== r.quoteId || b.buyer_acceptance_id !== r.buyerAcceptanceId
        || !["draft", "send_pending", "sent", "paid", "canceled", "fully_refunded", "reconciliation_required"].includes(String(b.invoice_status))) fail("source_invalid");
      consentId(b.invoice_binding_id); consentId(op.payment_operation_id); consentId(v.verification_record_id);
      if (v.case_id !== r.caseId || consentRow(c.consent.root.case).verification_record_id !== v.verification_record_id
        || ![b.row_version, op.row_version, v.row_version].every(x => Number.isSafeInteger(x) && Number(x) > 0
          && Number(x) < Number.MAX_SAFE_INTEGER)) fail("source_invalid");
      const entry = await prepareDeliveryAdoption(r, b.provider_invoice_id, deps.clientId, deps.merchant);
      if (s.journal && (canonicalJson({ ...s.journal, sendState: "not_started" }) !== canonicalJson(entry)
        || !["not_started", "started", "confirmed"].includes(s.journal.sendState))) fail("delivery_conflict");
      const sendKey = await sandboxSendRequestId(entry.merchantHash, b.provider_invoice_id);
      const fingerprint = await canonicalHash({ schema: "invoice-send-v1", creation_sha256: creationHash, invoice_id: b.provider_invoice_id,
        journal: entry, confirmation: "send-sandbox-invoice-v1" });
      if (s.operations.length > 1) fail("delivery_conflict");
      const send = s.operations[0];
      if (send && (send.case_id !== r.caseId || send.operation_type !== "send_invoice" || send.provider !== "paypal"
        || send.environment !== "sandbox" || send.operation_key !== `invoice-send:${r.requestId}`
        || send.provider_reference !== b.provider_invoice_id || send.command_fingerprint !== fingerprint
        || send.provider_request_id !== sendKey || !["pending", "unknown", "succeeded"].includes(String(send.status))
        || ![0, 1].includes(Number(send.attempt_count)) || !Number.isSafeInteger(send.row_version)
        || Number(send.row_version) < 1 || !s.journal)) fail("delivery_conflict");
      if (send && ((send.status === "pending" && (send.attempt_count !== 0 || send.error_code !== null))
        || (send.status !== "pending" && send.attempt_count !== 1)
        || (send.status === "unknown" && send.error_code !== "send_dispatch_claimed")
        || (send.status === "succeeded" && send.error_code !== null))) fail("delivery_conflict");
      return { request: r, entry, fingerprint, sendKey, deal, binding: b };
    } catch (e) { if (e instanceof InvoiceSendingError) throw e; return fail("source_invalid"); }
  }
  async function current(caseId: string, p: CreatorPrincipal) { const s = await load(caseId); return { s, checked: await check(s, p) }; }
  return Object.freeze({
    /** Internal authenticated inspection. Never serialize this private snapshot. */
    async inspect(caseId: string) {
      const p = await owner(consentId(caseId)), state = await current(caseId, p);
      await owner(caseId, p);
      if ((await load(caseId)).stateJson !== state.s.stateJson) fail("stale_revision");
      deps.checkActive?.(); return state;
    },
    async reserve(caseId: string, raw: SendCommand) {
      try { consentId(caseId); if (Object.keys(raw).sort().join() !== "confirmed,expectedCaseVersion,invoiceId"
        || raw.confirmed !== true || !Number.isSafeInteger(raw.expectedCaseVersion) || raw.expectedCaseVersion < 1
        || typeof raw.invoiceId !== "string" || !ID.test(raw.invoiceId)) fail("invalid_command"); }
      catch { return fail("invalid_command"); }
      const p = await owner(caseId);
      for (let n = 0; n < 3; n++) {
        const { s, checked } = await current(caseId, p);
        if (checked.request.caseId !== caseId || checked.binding.provider_invoice_id !== raw.invoiceId) fail("delivery_conflict");
        await owner(caseId, p);
        if (s.operations.length) {
          if ((await load(caseId)).stateJson !== s.stateJson) continue;
          return outcome(s.operations[0]!.status === "succeeded" ? "already_recorded" : "reserved", s);
        }
        if (checked.deal.caseVersion !== raw.expectedCaseVersion) fail("stale_revision");
        if (checked.binding.invoice_status !== "draft" || s.creation.consent.root.permissionCount !== 0
          || s.creation.consent.root.receiptCount !== 0 || (s.journal && s.journal.sendState !== "not_started")) fail("delivery_conflict");
        try { await deps.store.reserve({ snapshot: s, entry: checked.entry, fingerprint: checked.fingerprint, sendKey: checked.sendKey,
          operationId: crypto.randomUUID(), actor: p.actorReference, at: time() }); }
        catch { /* Reload a lost acknowledgement or competing reservation, never send here. */ }
      }
      const { s } = await current(caseId, p); await owner(caseId, p);
      if (!s.operations.length) fail("storage_unavailable");
      return outcome(s.operations[0]!.status === "succeeded" ? "already_recorded" : "reserved", s);
    },
    /** Used by the adapter immediately before its POST, including OAuth refreshes.
     * Not an HTTP endpoint and not a substitute for the adapter's durable claim.
     */
    async authorizeTransport(context: SandboxConsentContext): Promise<boolean> {
      try {
        const caseId = consentId(context.caseId), p = await owner(caseId), { s, checked } = await current(caseId, p);
        if (!s.operations[0] || s.operations[0].status !== "unknown" || s.operations[0].attempt_count !== 1
          || !["draft", "send_pending"].includes(String(checked.binding.invoice_status))
          || !s.journal || s.journal.sendState === "confirmed") return false;
        for (const key of ["caseId", "assetId", "termsVersionId", "quoteId", "creatorDecisionId", "buyerAcceptanceId", "amountCents", "currency"] as const)
          if (context[key] !== checked.request[key]) return false;
        if ((await load(caseId)).stateJson !== s.stateJson) return false;
        // Legacy authorizers finish with this principal recheck. Recovery can
        // additionally finish with exact source SQL and its synchronous verified
        // expiry/configuration lease, covering both boundaries before dispatch.
        await owner(caseId, p);
        if (deps.checkActive) {
          if ((await load(caseId)).stateJson !== s.stateJson) return false;
          deps.checkActive();
        }
        return true;
      } catch { return false; }
    },
    async execute(caseId: string, fence?: InvoiceExecutionFence) {
      try { consentId(caseId); } catch { return fail("invalid_command"); }
      const p = await owner(caseId); let state = await current(caseId, p);
      if (!state.s.operations[0]) fail("delivery_conflict");
      if (fence && (fence.stateJson !== state.s.stateJson || fence.operationId !== state.s.operations[0].payment_operation_id
        || !((fence.action === "resume_sending" && state.s.operations[0].status === "pending" && state.s.operations[0].attempt_count === 0)
          || (fence.action === "check_delivery" && state.s.operations[0].status === "unknown" && state.s.operations[0].attempt_count === 1)))) fail("stale_revision");
      deps.checkActive?.();
      if (state.s.operations[0].status === "succeeded") { await owner(caseId, p); return outcome("already_recorded", state.s); }
      let dispatch = false;
      if (state.s.operations[0].status === "pending") {
        if (!deps.sendInvoice) fail("transport_unavailable"); await owner(caseId, p);
        try { await deps.store.claim(state.s, p.actorReference, time()); dispatch = true; }
        catch { return outcome("retry_pending", await load(caseId)); }
      }
      state = await current(caseId, p); await owner(caseId, p);
      if (state.s.operations[0]?.status === "succeeded") return outcome("already_recorded", state.s);
      if (state.s.operations[0]?.status !== "unknown") fail("delivery_conflict");
      if ((await load(caseId)).stateJson !== state.s.stateJson) return outcome("retry_pending", state.s);
      const read = dispatch ? deps.sendInvoice : deps.getInvoice; if (!read) fail("transport_unavailable");
      let view: SandboxInvoiceView;
      try { view = await read(String(state.checked.binding.provider_invoice_id)); }
      catch { await owner(caseId, p); return outcome("awaiting_reconciliation", (await current(caseId, p)).s); }
      // Re-read source and authority after ALL provider I/O. The store fences that exact snapshot.
      state = await current(caseId, p); await owner(caseId, p);
      if (state.s.operations[0]?.status === "succeeded") return outcome("already_recorded", state.s);
      const r = state.checked.request;
      try {
        if (!view || view.invoiceId !== state.checked.binding.provider_invoice_id || view.provider !== "paypal"
          || view.environment !== "sandbox" || view.mode !== "paypal_sandbox" || view.simulated !== false
          || view.authoritativePaymentEvidence !== false || view.caseId !== r.caseId || view.quoteId !== r.quoteId
          || view.termsVersionId !== r.termsVersionId || view.buyerAcceptanceId !== r.buyerAcceptanceId
          || view.amountCents !== r.amountCents || view.currency !== "USD" || typeof view.requiresReconciliation !== "boolean") fail("source_invalid");
        const at = consentTime(view.observedAt);
        if (at > time() || at < String(state.s.operations[0]!.created_at)) fail("source_invalid");
        if (view.paymentUrl !== null) validateSandboxPaymentUrl(view.paymentUrl);
        if (!OBSERVED.includes(view.status)) return outcome("awaiting_reconciliation", state.s);
      } catch { return outcome("awaiting_reconciliation", state.s); }
      try { await deps.store.complete(state.s, view, p.actorReference, time()); }
      catch {
        const next = await current(caseId, p); await owner(caseId, p);
        return outcome(next.s.operations[0]?.status === "succeeded" ? "already_recorded" : "retry_pending", next.s);
      }
      const fresh = await current(caseId, p); await owner(caseId, p);
      // A pay link is a fresh delivery handoff, not persisted evidence of payment.
      if ((await load(caseId)).stateJson !== fresh.s.stateJson) return outcome("retry_pending", fresh.s);
      return outcome("delivery_observed", fresh.s, view);
    },
  });
}
