/** Durable draft creation only. No send, payment, receipt or permission methods.
 * An uncertain POST is never automatically repeated, even after a restart.
 */
import { canonicalHash, canonicalJson } from "../../receipts/src/canonical";
import { verifyAcceptedInvoiceSnapshot } from "./human-consent";
import { consentId, consentRow, consentTime, type ConsentSnapshot, type CreatorPrincipal } from "./consent-contract";
import type { AuthorizedInvoiceSnapshot, PaymentInvoiceView } from "../../paypal/src/contract";
import type { InvoiceExecutionFence } from "./invoice-recovery-contract";
export type InvoiceCreationFailure = "invalid_command" | "not_authorized" | "not_found" | "source_invalid"
  | "stale_revision" | "invoice_conflict" | "storage_unavailable" | "transport_unavailable";
export class InvoiceCreationError extends Error {
  readonly code: InvoiceCreationFailure;
  constructor(code: InvoiceCreationFailure) { super("Sandbox invoice creation could not be completed."); this.name = "InvoiceCreationError"; this.code = code; }
}
export interface InvoiceCreationSnapshot {
  readonly stateJson: string; readonly consent: ConsentSnapshot;
  readonly operations: readonly Record<string, unknown>[];
  readonly binding: Record<string, unknown> | null;
  readonly verification: Record<string, unknown> | null;
}
export interface InvoiceReservation {
  readonly snapshot: InvoiceCreationSnapshot; readonly request: AuthorizedInvoiceSnapshot;
  readonly fingerprint: string; readonly operationId: string; readonly bindingId: string;
  readonly verificationId: string; readonly publicId: string; readonly actor: string; readonly at: string;
}
export interface InvoiceCreationStore {
  load(caseId: string): Promise<InvoiceCreationSnapshot | null>;
  reserve(input: InvoiceReservation): Promise<void>;
  claim(snapshot: InvoiceCreationSnapshot, actor: string, at: string): Promise<void>;
  /** Retain a returned provider reference even if consent/session subsequently changes. */
  remember(operation: Readonly<Record<string, unknown>>, invoiceId: string, at: string): Promise<void>;
  bind(snapshot: InvoiceCreationSnapshot, actor: string, at: string): Promise<void>;
}
function fail(code: InvoiceCreationFailure): never { throw new InvoiceCreationError(code); }
const INV = /^INV2-[A-Za-z0-9-]{3,100}$/u;
function result(outcome: "reserved" | "draft_bound" | "already_bound" | "awaiting_reconciliation" | "retry_pending",
  s: InvoiceCreationSnapshot) {
  const o = s.operations[0], b = s.binding;
  return Object.freeze({ outcome, operationId: o?.payment_operation_id ?? null,
    bindingId: b?.invoice_binding_id ?? null, providerInvoiceId: b?.provider_invoice_id ?? null,
    environment: "sandbox" as const, invoiceSentByThisCommand: false, paymentConfirmed: false, permissionGranted: false });
}
export function createInvoiceCreationService(deps: {
  readonly store: InvoiceCreationStore;
  /** Hash of trusted merchant/app identity, not a credential or browser value. */
  readonly accountFingerprint: string;
  readonly authorizeCreator?: (caseId: string) => Promise<CreatorPrincipal | null>;
  readonly createDraft?: (request: AuthorizedInvoiceSnapshot) => Promise<PaymentInvoiceView>;
  readonly now?: () => Date;
  /** Request-bound expiry/configuration check, synchronous after the final read. */
  readonly checkActive?: () => void;
}) {
  if (!/^[0-9a-f]{64}$/u.test(deps.accountFingerprint)) fail("invalid_command");
  const time = () => consentTime((deps.now?.() ?? new Date()).toISOString());
  // An adapter callback alone cannot start or revive a dispatch. Authority exists
  // only during this service instance's successfully claimed createDraft call.
  const dispatches = new Map<string, { owner: CreatorPrincipal; stateJson: string; requestJson: string }>();
  async function load(caseId: string) {
    let s: InvoiceCreationSnapshot | null;
    try { s = await deps.store.load(caseId); } catch { return fail("storage_unavailable"); }
    if (!s) fail("not_found");
    if (consentRow(s.consent.root.case).case_id !== caseId) fail("source_invalid");
    return s;
  }
  async function authorize(caseId: string, prior?: CreatorPrincipal) {
    try {
      const p = await deps.authorizeCreator?.(caseId);
      if (!p || !/^[A-Za-z0-9._:-]{1,120}$/u.test(p.actorReference)) fail("not_authorized");
      consentId(p.workspaceId);
      if (prior && (p.workspaceId !== prior.workspaceId || p.actorReference !== prior.actorReference)) fail("not_authorized");
      return Object.freeze({ workspaceId: p.workspaceId, actorReference: p.actorReference });
    } catch { return fail("not_authorized"); }
  }
  async function validate(s: InvoiceCreationSnapshot, owner: CreatorPrincipal) {
    try {
      const { deal, request } = await verifyAcceptedInvoiceSnapshot(s.consent, time());
      if (deal.workspaceId !== owner.workspaceId) fail("not_authorized");
      const fingerprint = await canonicalHash({ schema: "invoice-creation-v1", account_sha256: deps.accountFingerprint, request });
      return { deal, request, fingerprint };
    } catch (e) { if (e instanceof InvoiceCreationError) throw e; return fail("source_invalid"); }
  }
  function existing(s: InvoiceCreationSnapshot, checked: Awaited<ReturnType<typeof validate>>) {
    const { request: r, fingerprint } = checked, c = consentRow(s.consent.root.case);
    if (s.operations.length !== 1 || !s.binding || !s.verification) fail("invoice_conflict");
    const o = s.operations[0]!, b = s.binding, v = s.verification;
    try { consentId(o.payment_operation_id); consentId(b.invoice_binding_id); consentId(v.verification_record_id); }
    catch { fail("invoice_conflict"); }
    if (![o.row_version, b.row_version, v.row_version].every(x => Number.isSafeInteger(x) && Number(x) >= 1)
      || ![0, 1].includes(Number(o.attempt_count))
      || !["pending", "unknown", "succeeded"].includes(String(o.status))) fail("invoice_conflict");
    if (o.case_id !== r.caseId || o.operation_type !== "create_invoice" || o.provider !== "paypal" || o.environment !== "sandbox"
      || o.operation_key !== `invoice-create:${r.requestId}` || o.provider_request_id !== r.requestId || o.command_fingerprint !== fingerprint
      || b.case_id !== r.caseId || b.provider !== "paypal" || b.environment !== "sandbox"
      || b.terms_version_id !== r.termsVersionId || b.quote_id !== r.quoteId || b.buyer_acceptance_id !== r.buyerAcceptanceId
      || c.invoice_binding_id !== b.invoice_binding_id || v.case_id !== r.caseId || c.verification_record_id !== v.verification_record_id
      || Number(o.attempt_count) < 0 || !Number.isSafeInteger(o.row_version)) fail("invoice_conflict");
    if (o.status === "succeeded") {
      if (o.attempt_count !== 1 || typeof b.provider_invoice_id !== "string" || !INV.test(b.provider_invoice_id)
        || o.provider_reference !== b.provider_invoice_id || b.safe_invoice_reference !== b.provider_invoice_id
        || b.invoice_status === "create_pending") fail("invoice_conflict");
    } else if (b.invoice_status !== "create_pending" || b.provider_invoice_id !== null || b.safe_invoice_reference !== null
      || c.permission_id !== null || s.consent.root.permissionCount !== 0 || s.consent.root.receiptCount !== 0
      || s.consent.root.operationCount !== 1 || s.consent.root.invoiceCount !== 1
      || v.current_receipt_revision_id !== null || v.current_status !== "pending") fail("invoice_conflict");
    if ((o.status === "pending" && (o.attempt_count !== 0 || o.error_code !== null || o.provider_reference !== null))
      || (o.status === "unknown" && (o.attempt_count !== 1
        || !((o.error_code === "creation_dispatch_claimed" && o.provider_reference === null)
          || (o.error_code === "draft_observed" && typeof o.provider_reference === "string" && INV.test(o.provider_reference)))))
      || (o.status === "succeeded" && o.error_code !== null)) fail("invoice_conflict");
    return o;
  }
  async function checkedLoad(caseId: string, owner: CreatorPrincipal) {
    const s = await load(caseId), checked = await validate(s, owner), o = existing(s, checked);
    return { s, checked, o };
  }
  return Object.freeze({
    /** Internal authenticated inspection. Never serialize this private snapshot. */
    async inspect(caseId: string) {
      const owner = await authorize(consentId(caseId)), current = await checkedLoad(caseId, owner);
      await authorize(caseId, owner);
      if ((await load(caseId)).stateJson !== current.s.stateJson) fail("stale_revision");
      deps.checkActive?.(); return current;
    },
    async authorizeTransport(request: Readonly<AuthorizedInvoiceSnapshot>): Promise<boolean> {
      try {
        const active = dispatches.get(request.requestId);
        if (!active || active.requestJson !== canonicalJson(request)) return false;
        const owner = await authorize(request.caseId, active.owner);
        const current = await checkedLoad(request.caseId, owner);
        if (current.s.stateJson !== active.stateJson || current.o.status !== "unknown"
          || current.o.attempt_count !== 1 || current.o.error_code !== "creation_dispatch_claimed"
          || current.o.provider_reference !== null || canonicalJson(current.checked.request) !== active.requestJson) return false;
        if ((await load(request.caseId)).stateJson !== active.stateJson) return false;
        // Legacy authorizers finish with a same-principal recheck. Recovery also
        // supplies a verified synchronous lease, so it can finish with exact
        // source SQL followed by expiry/configuration checks without another await.
        await authorize(request.caseId, active.owner);
        if (deps.checkActive) {
          if ((await load(request.caseId)).stateJson !== active.stateJson) return false;
          deps.checkActive();
        }
        return dispatches.get(request.requestId) === active;
      } catch { return false; }
    },
    async reserve(caseId: string, expectedCaseVersion: number) {
      try { consentId(caseId); } catch { fail("invalid_command"); }
      if (!Number.isSafeInteger(expectedCaseVersion) || expectedCaseVersion < 1) fail("invalid_command");
      const owner = await authorize(caseId);
      for (let attempt = 0; attempt < 3; attempt++) {
        const s = await load(caseId), checked = await validate(s, owner), c = consentRow(s.consent.root.case);
        if (s.binding || s.operations.length) {
          const o = existing(s, checked); await authorize(caseId, owner);
          if ((await load(caseId)).stateJson !== s.stateJson) continue;
          return result(o.status === "succeeded" ? "already_bound" : o.attempt_count === 0 ? "reserved" : "awaiting_reconciliation", s);
        }
        if (checked.deal.caseVersion !== expectedCaseVersion) fail("stale_revision");
        if (c.invoice_binding_id !== null || c.permission_id !== null || s.consent.root.invoiceCount !== 0
          || s.consent.root.operationCount !== 0 || s.consent.root.permissionCount !== 0 || s.consent.root.receiptCount !== 0) fail("invoice_conflict");
        const v = s.verification;
        if (v && (v.case_id !== caseId || v.verification_record_id !== c.verification_record_id
          || v.current_status !== "pending" || v.current_receipt_revision_id !== null)) fail("invoice_conflict");
        if (!v && c.verification_record_id !== null) fail("invoice_conflict");
        const publicId = v ? String(v.public_verification_id) : btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
          .replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
        if (!/^[A-Za-z0-9_-]{22,128}$/u.test(publicId)
          || /^[0-9a-f]{8}-[0-9a-f-]{27}$/u.test(publicId)) fail("invoice_conflict");
        const at = time(); await authorize(caseId, owner);
        try {
          await deps.store.reserve({ snapshot: s, request: checked.request, fingerprint: checked.fingerprint,
            operationId: crypto.randomUUID(), bindingId: crypto.randomUUID(), verificationId: v ? String(v.verification_record_id) : crypto.randomUUID(),
            publicId, actor: owner.actorReference, at });
          // Reload verifies the committed identity and handles lost acknowledgements.
        } catch { /* Never call the provider from reservation or its retries. */ }
      }
      const last = await load(caseId);
      if (!last.binding || !last.operations.length) fail("storage_unavailable");
      const { s, o } = await checkedLoad(caseId, owner); await authorize(caseId, owner);
      return result(o.status === "succeeded" ? "already_bound" : "reserved", s);
    },
    async execute(caseId: string, fence?: InvoiceExecutionFence) {
      try { consentId(caseId); } catch { fail("invalid_command"); }
      const owner = await authorize(caseId);
      let current = await checkedLoad(caseId, owner);
      if (fence && (fence.stateJson !== current.s.stateJson || fence.operationId !== current.o.payment_operation_id
        || !((fence.action === "resume_creation" && current.o.status === "pending" && current.o.attempt_count === 0)
          || (fence.action === "record_draft" && current.o.status === "unknown" && current.o.error_code === "draft_observed")))) fail("stale_revision");
      deps.checkActive?.();
      if (current.o.status === "succeeded") { await authorize(caseId, owner); return result("already_bound", current.s); }
      if (current.o.status === "pending" && current.o.attempt_count === 0 && current.o.provider_reference === null) {
        if (!deps.createDraft) fail("transport_unavailable");
        await authorize(caseId, owner);
        try { await deps.store.claim(current.s, owner.actorReference, time()); }
        catch { return result("retry_pending", await load(caseId)); }
        // A durable claim is never stolen or expired into another POST attempt.
        current = await checkedLoad(caseId, owner); await authorize(caseId, owner);
        if (current.o.status !== "unknown" || current.o.attempt_count !== 1 || current.o.error_code !== "creation_dispatch_claimed"
          || current.o.provider_reference !== null) return result("awaiting_reconciliation", current.s);
        if ((await load(caseId)).stateJson !== current.s.stateJson) return result("awaiting_reconciliation", current.s);
        let draft: PaymentInvoiceView;
        const dispatch = { owner, stateJson: current.s.stateJson, requestJson: canonicalJson(current.checked.request) };
        dispatches.set(current.checked.request.requestId, dispatch);
        try { draft = await deps.createDraft(current.checked.request); }
        catch { return result("awaiting_reconciliation", await load(caseId)); }
        finally {
          if (dispatches.get(current.checked.request.requestId) === dispatch) dispatches.delete(current.checked.request.requestId);
        }
        const r = current.checked.request;
        if (!draft || !INV.test(draft.invoiceId) || draft.provider !== "paypal" || draft.environment !== "sandbox"
          || draft.mode !== "paypal_sandbox" || draft.simulated !== false || draft.authoritativePaymentEvidence !== false
          || draft.status !== "DRAFT" || draft.caseId !== r.caseId || draft.quoteId !== r.quoteId
          || draft.termsVersionId !== r.termsVersionId || draft.buyerAcceptanceId !== r.buyerAcceptanceId
          || draft.currency !== "USD" || draft.amountCents !== r.amountCents) return result("awaiting_reconciliation", current.s);
        for (let n = 0; n < 3; n++) {
          try { await deps.store.remember(current.o, draft.invoiceId, time()); break; }
          catch {
            const fresh = await load(caseId), op = fresh.operations[0];
            if (op?.provider_reference === draft.invoiceId && op.command_fingerprint === current.o.command_fingerprint) break;
            if (n === 2) return result("awaiting_reconciliation", fresh);
          }
        }
      }
      // A retained successful response can be bound after restart without a second POST.
      for (let n = 0; n < 3; n++) {
        current = await checkedLoad(caseId, owner); await authorize(caseId, owner);
        if (current.o.status === "succeeded") return result("already_bound", current.s);
        if (current.o.status !== "unknown" || current.o.attempt_count !== 1 || current.o.error_code !== "draft_observed"
          || typeof current.o.provider_reference !== "string" || !INV.test(current.o.provider_reference)) return result("awaiting_reconciliation", current.s);
        try { await deps.store.bind(current.s, owner.actorReference, time());
          return result("draft_bound", await load(caseId)); }
        catch { /* Reload but never create another external invoice. */ }
      }
      return result("retry_pending", await load(caseId));
    },
  });
}
