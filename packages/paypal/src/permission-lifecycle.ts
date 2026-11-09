/** Opt-in financial lifecycle. A trusted invoice GET, exact consent and a fenced
 * database commit are all required. No API for sending, refunding or model actions.
 */
import { isLocallyAssessedSettlement, validUtcInstant, type InvoiceSettlement } from "./settlement";
import type { ReconciliationFailure } from "./reconciliation";
export type PermissionState = "scheduled" | "active" | "expired" | "refunded" | "revoked";
export interface LifecycleClaim {
  readonly bindingId: string; readonly caseId: string; readonly invoiceId: string;
  readonly quoteId: string; readonly termsVersionId: string; readonly buyerAcceptanceId: string;
  readonly amountCents: number; readonly currency: string; readonly invoiceState: string;
  readonly bindingVersion: number; readonly caseVersion: number; readonly consentCurrent: number;
  readonly generation: number; readonly token: string; readonly attemptNumber: number;
  readonly startedAt: string; readonly leaseUntil: string;
}
export interface LifecyclePermission {
  readonly id: string; readonly state: PermissionState; readonly version: number;
  readonly startDate: string; readonly endDateExclusive: string; readonly reviewRequired: number;
}
export interface LifecycleContext {
  readonly startDate: string; readonly durationDays: number;
  readonly permission: LifecyclePermission | null;
  readonly paidPreviously: boolean; readonly highestRefundCents: number;
  readonly lastObservedAt: string | null;
}
export interface LifecycleProviderView {
  readonly invoiceId: string; readonly caseId: string; readonly quoteId: string;
  readonly termsVersionId: string; readonly buyerAcceptanceId: string;
  readonly amountCents: number; readonly currency: string; readonly status: string;
  readonly mode: string; readonly provider: string; readonly environment: string;
  readonly simulated: boolean; readonly authoritativePaymentEvidence: false;
  readonly observedAt: string; readonly settlement: InvoiceSettlement;
}
/** The existing recovery store supplies bounded leases and persistent retry state. */
export interface LifecycleRecovery {
  claim(id: string, token: string, now: string, until: string): Promise<LifecycleClaim | null>;
  fail(c: LifecycleClaim, code: ReconciliationFailure,
    retryAt: string | null, now: string): Promise<void>;
}
export interface LifecycleDecision {
  readonly invoiceState: string; readonly permissionState: PermissionState | null;
  readonly reviewRequired: boolean; readonly reason: string; readonly endDateExclusive: string;
  readonly evidenceKinds: readonly ("paid" | "fully_refunded" | "canceled")[];
  readonly permissionChanged: boolean;
}
export interface LifecycleCompletion {
  readonly claim: LifecycleClaim; readonly context: LifecycleContext;
  readonly financial: InvoiceSettlement; readonly decision: LifecycleDecision;
  readonly observationHash: string; readonly evidence: readonly { kind: "paid" | "fully_refunded" | "canceled"; hash: string }[];
  readonly now: string;
}
export interface PermissionLifecycleStore {
  context(c: LifecycleClaim): Promise<LifecycleContext | null>;
  completed(bindingId: string, generation: number): Promise<boolean>;
  commit(input: LifecycleCompletion): Promise<void>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const INVOICE_STATES = ["create_pending", "draft", "send_pending", "sent", "paid", "canceled", "fully_refunded", "reconciliation_required"];
function checkClaim(c: LifecycleClaim): void {
  if (![c.bindingId, c.caseId, c.quoteId, c.termsVersionId, c.buyerAcceptanceId, c.token].every(x => UUID.test(x))
    || !/^INV2-[A-Za-z0-9-]{3,100}$/u.test(c.invoiceId) || c.currency !== "USD"
    || !Number.isSafeInteger(c.amountCents) || c.amountCents <= 0 || c.amountCents > 1_000_000_000
    || ![c.generation, c.caseVersion, c.bindingVersion, c.attemptNumber].every(x => Number.isSafeInteger(x) && x > 0)
    || c.attemptNumber > 5 || !INVOICE_STATES.includes(c.invoiceState)
    || !validUtcInstant(c.startedAt) || !validUtcInstant(c.leaseUntil) || c.leaseUntil <= c.startedAt) throw new Error("Invalid lifecycle context.");
  if (c.consentCurrent !== 1) throw new Error("Current human consent required.");
}
export function licenseEndExclusive(start: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(start) || !Number.isInteger(days) || days < 1 || days > 365
    || !validUtcInstant(`${start}T00:00:00.000Z`)) throw new Error("Invalid licensing interval.");
  const end = new Date(Date.parse(`${start}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(end) || end <= start) throw new Error("Invalid licensing interval.");
  return end;
}
/** Pure transition reducer, protected by current-version checks in the store. */
export function derivePermissionLifecycle(c: LifecycleClaim, x: LifecycleContext, f: InvoiceSettlement, at: string): LifecycleDecision {
  checkClaim(c);
  if (!isLocallyAssessedSettlement(f) || f.amountCents !== c.amountCents || !validUtcInstant(at)
    || f.observedAt < c.startedAt || f.observedAt > at || at >= c.leaseUntil
    || (x.lastObservedAt !== null && (!validUtcInstant(x.lastObservedAt) || f.observedAt < x.lastObservedAt))
    || !Number.isSafeInteger(x.highestRefundCents) || x.highestRefundCents < 0) throw new Error("Untrusted or stale financial details.");
  const endDateExclusive = licenseEndExclusive(x.startDate, x.durationDays);
  const old = x.permission;
  if (old && (!UUID.test(old.id) || !Number.isSafeInteger(old.version) || old.version < 1
    || !["scheduled", "active", "expired", "refunded", "revoked"].includes(old.state)
    || ![0, 1].includes(old.reviewRequired) || old.startDate !== x.startDate || old.endDateExclusive !== endDateExclusive)) {
    throw new Error("Permission binding differs from accepted terms.");
  }
  let invoiceState = c.invoiceState, permissionState = old?.state ?? null;
  let reviewRequired = f.conclusion === "review_required", reason = f.reason;
  const evidenceKinds: ("paid" | "fully_refunded" | "canceled")[] = [];
  const everPaid = x.paidPreviously || !!old || ["paid", "fully_refunded"].includes(c.invoiceState);
  const regression = f.refundedCents !== null && f.refundedCents < x.highestRefundCents;
  if (regression || (c.invoiceState === "canceled" && ["paid", "fully_refunded"].includes(f.conclusion))
    || (c.invoiceState === "fully_refunded" && f.conclusion !== "fully_refunded")
    || (old?.state === "refunded" && f.conclusion !== "fully_refunded")) {
    reviewRequired = true; reason = "terminal_or_refund_regression";
  } else if (f.conclusion === "paid") {
    invoiceState = "paid"; evidenceKinds.push("paid");
    const today = at.slice(0, 10);
    if (!old || old.state === "scheduled" || old.state === "active") {
      const next = today < x.startDate ? "scheduled" : today >= endDateExclusive ? "expired" : "active";
      permissionState = old?.state === "active" && next === "scheduled" ? "active" : next;
    }
  } else if (f.conclusion === "fully_refunded") {
    invoiceState = "fully_refunded";
    // Fresh invoice detail proves both the original full PayPal payment and refund.
    evidenceKinds.push("paid", "fully_refunded");
    permissionState = old?.state === "revoked" ? "revoked" : "refunded";
  } else if (f.conclusion === "canceled") {
    if (everPaid) { reviewRequired = true; reason = "cancellation_after_payment_conflict"; }
    else { invoiceState = "canceled"; evidenceKinds.push("canceled"); }
  } else if (f.conclusion === "unpaid") {
    if (everPaid) { reviewRequired = true; reason = "payment_history_cannot_regress"; }
    else if (c.invoiceState !== "canceled") {
      invoiceState = f.providerStatus === "DRAFT" ? (["sent", "send_pending"].includes(c.invoiceState) ? c.invoiceState : "draft")
        : f.providerStatus === "SCHEDULED" ? c.invoiceState : "sent";
    }
  }
  if (reviewRequired && !["canceled", "fully_refunded"].includes(c.invoiceState)) invoiceState = "reconciliation_required";
  return Object.freeze({ invoiceState, permissionState, reviewRequired, reason, endDateExclusive,
    evidenceKinds: Object.freeze(reviewRequired ? [] : evidenceKinds),
    permissionChanged: permissionState !== (old?.state ?? null) || (!!old && reviewRequired !== !!old.reviewRequired) });
}
async function sha256(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map(v => v.toString(16).padStart(2, "0")).join("");
}
/** Returned status suppresses active/scheduled claims when financial review is open. */
export function permissionPresentation(state: PermissionState | null, reviewRequired: boolean): string {
  return reviewRequired ? "review_required" : state ?? "not_issued";
}
/** Preserve sanitized provider classifications. Permanent identity/auth failures
 * must not be retried as network faults or leak the provider error body.
 */
function lifecycleReadFailure(error: unknown): ReconciliationFailure {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const allowed: readonly ReconciliationFailure[] = ["transport_unavailable", "rate_limited", "oauth_rejected",
    "invoice_not_found", "invoice_not_bound", "invoice_mismatch", "invalid_provider_response",
    "authorization_required", "unsafe_payment_url", "provider_rejected"];
  if (code === "delivery_conflict") return "state_changed";
  return typeof code === "string" && allowed.includes(code as ReconciliationFailure)
    ? code as ReconciliationFailure : "transport_unavailable";
}
function lifecycleRetryAt(code: ReconciliationFailure, at: string, attempt: number): string | null {
  if (!["transport_unavailable", "rate_limited", "state_changed"].includes(code) || attempt >= 5) return null;
  const delay = (code === "rate_limited" ? 60_000 : 30_000) * 2 ** (attempt - 1);
  return new Date(Date.parse(at) + delay).toISOString();
}
export function createSandboxPermissionLifecycle(deps: {
  readonly recovery: LifecycleRecovery; readonly store: PermissionLifecycleStore;
  readonly readInvoice: (id: string) => Promise<LifecycleProviderView>; readonly now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  return Object.freeze({
    async reconcile(bindingId: string) {
      if (!UUID.test(bindingId)) return Object.freeze({ outcome: "blocked", reason: "invalid_binding" });
      const started = now().toISOString();
      let c: LifecycleClaim | null;
      try { c = await deps.recovery.claim(bindingId, crypto.randomUUID(), started, new Date(Date.parse(started) + 90_000).toISOString()); }
      catch { return Object.freeze({ outcome: "retry_pending", reason: "storage_unavailable" }); }
      if (!c) return Object.freeze({ outcome: "not_ready", reason: "no_available_lease" });
      let failure: ReconciliationFailure = "authorization_required";
      try {
        checkClaim(c);
        const context = await deps.store.context(c);
        if (!context) throw new Error("Current terms missing.");
        failure = "transport_unavailable";
        let view: LifecycleProviderView;
        try { view = await deps.readInvoice(c.invoiceId); }
        catch (error) { failure = lifecycleReadFailure(error); throw error; }
        failure = "invalid_provider_response";
        if (view.invoiceId !== c.invoiceId || view.caseId !== c.caseId || view.quoteId !== c.quoteId
          || view.termsVersionId !== c.termsVersionId || view.buyerAcceptanceId !== c.buyerAcceptanceId
          || view.amountCents !== c.amountCents || view.currency !== "USD" || view.mode !== "paypal_sandbox"
          || view.environment !== "sandbox" || view.provider !== "paypal" || view.simulated !== false
          || view.authoritativePaymentEvidence !== false || view.observedAt !== view.settlement?.observedAt
          || view.status !== view.settlement?.providerStatus) throw new Error("Invoice identity mismatch.");
        const at = now().toISOString(), financial = view.settlement;
        const decision = derivePermissionLifecycle(c, context, financial, at);
        const financialContent = { version: financial.version, bindingId: c.bindingId, invoiceId: c.invoiceId,
          termsVersionId: c.termsVersionId, quoteId: c.quoteId, buyerAcceptanceId: c.buyerAcceptanceId,
          amountCents: c.amountCents, providerStatus: financial.providerStatus, conclusion: financial.conclusion,
          paidCents: financial.paidCents, refundedCents: financial.refundedCents, dueCents: financial.dueCents,
          payments: financial.payments, refunds: financial.refunds };
        const observationHash = await sha256(JSON.stringify(financialContent));
        const evidence = await Promise.all(decision.evidenceKinds.map(async kind => ({ kind,
          hash: await sha256(JSON.stringify({ bindingId: c!.bindingId, invoiceId: c!.invoiceId,
            termsVersionId: c!.termsVersionId, quoteId: c!.quoteId, buyerAcceptanceId: c!.buyerAcceptanceId,
            kind, amountCents: c!.amountCents, payments: kind === "canceled" ? [] : financial.payments,
            refunds: kind === "fully_refunded" ? financial.refunds : [] })) })));
        failure = "state_changed";
        try { await deps.store.commit({ claim: c, context, financial, decision, observationHash, evidence, now: at }); }
        catch (error) {
          if (await deps.store.completed(c.bindingId, c.generation)) return Object.freeze({ outcome: "already_completed", reason: "durable_completion" });
          throw error;
        }
        return Object.freeze({ outcome: decision.reviewRequired ? "review_required" : "applied",
          reason: decision.reason, invoiceState: decision.invoiceState,
          permission: permissionPresentation(decision.permissionState, decision.reviewRequired),
          sandboxOnly: true, publicReceiptReady: false });
      } catch { /* No raw provider, SQL, buyer or credential details escape. */ }
      const at = now().toISOString();
      const retryAt = lifecycleRetryAt(failure, at, c.attemptNumber);
      try { await deps.recovery.fail(c, failure, retryAt, at); }
      catch { return Object.freeze({ outcome: "lease_lost", reason: "state_changed" }); }
      return Object.freeze({ outcome: retryAt !== null ? "retry_scheduled" : "blocked", reason: failure });
    },
  });
}
