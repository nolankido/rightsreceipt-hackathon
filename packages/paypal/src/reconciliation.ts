/** Fresh Sandbox reads and fenced recovery. No send, refund or permission capability. */
export const RECONCILIATION_VERSION = "rightsreceipt-reconciliation-v1" as const;
export const RECONCILIATION_LEASE_MS = 90_000;
export const RECONCILIATION_MAX_ATTEMPTS = 5;
export interface ReconciliationClaim {
  readonly bindingId: string; readonly caseId: string; readonly invoiceId: string;
  readonly quoteId: string; readonly termsVersionId: string; readonly buyerAcceptanceId: string;
  readonly amountCents: number; readonly currency: string; readonly invoiceState: string;
  readonly bindingVersion: number; readonly caseVersion: number; readonly consentCurrent: number;
  readonly generation: number; readonly token: string; readonly attemptNumber: number;
  readonly startedAt: string; readonly leaseUntil: string;
}
/** Supplied only by the existing, content-validating Sandbox invoice adapter. */
export interface ReconciliationProviderView {
  readonly invoiceId: string; readonly caseId: string; readonly quoteId: string;
  readonly termsVersionId: string; readonly buyerAcceptanceId: string;
  readonly amountCents: number; readonly currency: string; readonly status: string;
  readonly mode: string; readonly provider: string; readonly environment: string;
  readonly simulated: boolean; readonly authoritativePaymentEvidence: false;
  readonly observedAt: string; readonly paymentUrl: string | null;
  readonly requiresReconciliation: boolean;
}
export type ReconciliationReason = "current_provider_state" | "financial_review_required"
  | "uncertain_provider_state" | "state_regression_blocked";
export interface ReconciliationObservation {
  readonly providerStatus: string; readonly invoiceState: string;
  readonly reason: ReconciliationReason; readonly reviewRequired: boolean;
  readonly paymentUrl: string | null; readonly observedAt: string;
  readonly amountCents: number; readonly currency: "USD";
}
export type ReconciliationFailure = "transport_unavailable" | "rate_limited" | "oauth_rejected"
  | "invoice_not_found" | "invoice_not_bound" | "invoice_mismatch" | "invalid_provider_response"
  | "authorization_required" | "unsafe_payment_url" | "provider_rejected" | "state_changed"
  | "storage_unavailable";
export interface ReconciliationStore {
  claim(bindingId: string, token: string, now: string, leaseUntil: string): Promise<ReconciliationClaim | null>;
  complete(claim: ReconciliationClaim, observation: ReconciliationObservation, now: string): Promise<void>;
  completed(bindingId: string, generation: number): Promise<boolean>;
  fail(claim: ReconciliationClaim, code: ReconciliationFailure, retryAt: string | null, now: string): Promise<void>;
  /** Coalesce existing work. Explicit retry may reopen a blocked item, not a send. */
  request(bindingId: string, reason: "operator_retry" | "stale_sweep", now: string): Promise<void>;
  listReady(now: string, limit: number): Promise<readonly string[]>;
  staleBindings(cutoff: string, limit: number): Promise<readonly string[]>;
}
export interface ReconciliationDependencies {
  readonly store: ReconciliationStore;
  readonly readInvoice: (id: string) => Promise<ReconciliationProviderView>;
  readonly now?: () => Date;
  readonly random?: () => number;
}
export interface ReconciliationResult {
  readonly outcome: "reconciled" | "review_required" | "retry_scheduled" | "blocked"
    | "not_ready" | "already_completed" | "lease_lost";
  readonly code: ReconciliationFailure | null;
  readonly authoritativePaymentEvidence: false;
  readonly permissionActivated: false;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const INVOICE = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const STATES = ["create_pending", "draft", "send_pending", "sent", "paid", "canceled", "fully_refunded", "reconciliation_required"];
const STATUSES = ["DRAFT", "SENT", "SCHEDULED", "UNPAID", "PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED",
  "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "MARKED_AS_REFUNDED", "PAYMENT_PENDING", "AUTO_CANCELLED",
  "PAID_EXTERNAL", "REFUNDED_EXTERNAL", "SHARED", "UNKNOWN"];
const FAILURES: readonly ReconciliationFailure[] = ["transport_unavailable", "rate_limited", "oauth_rejected", "invoice_not_found",
  "invoice_not_bound", "invoice_mismatch", "invalid_provider_response", "authorization_required", "unsafe_payment_url", "provider_rejected"];
class ReconciliationError extends Error {
  readonly code: ReconciliationFailure;
  constructor(code: ReconciliationFailure) { super("Sandbox reconciliation validation failed."); this.code = code; }
}
function reject(code: ReconciliationFailure): never { throw new ReconciliationError(code); }
function instant(value: string): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const d = new Date(value); return Number.isFinite(d.getTime()) && d.toISOString() === value;
}
function positive(value: number): boolean { return Number.isSafeInteger(value) && value > 0 && value < Number.MAX_SAFE_INTEGER; }
function checkedClaim(c: ReconciliationClaim): void {
  if (![c.bindingId, c.caseId, c.quoteId, c.termsVersionId, c.buyerAcceptanceId, c.token].every(id => UUID.test(id))
    || !INVOICE.test(c.invoiceId) || !positive(c.amountCents) || c.amountCents > 1_000_000_000 || c.currency !== "USD"
    || ![c.bindingVersion, c.caseVersion, c.generation, c.attemptNumber].every(positive)
    || c.attemptNumber > RECONCILIATION_MAX_ATTEMPTS || !STATES.includes(c.invoiceState)
    || !instant(c.startedAt) || !instant(c.leaseUntil) || c.leaseUntil <= c.startedAt) reject("invalid_provider_response");
  if (c.consentCurrent !== 1) reject("authorization_required");
}
function safeUrl(value: string | null): boolean {
  if (value === null) return true;
  if (typeof value !== "string" || value.length > 2048 || /[\s\\%\x00-\x1f]/u.test(value)) return false;
  try {
    const u = new URL(value);
    return u.origin === "https://www.sandbox.paypal.com" && !u.username && !u.password && !u.search
      && /^https:\/\/www\.sandbox\.paypal\.com\//u.test(value)
      && /^\/invoice\/(?:p\/|payerView\/details\/)[A-Za-z0-9/_-]*$/u.test(u.pathname)
      && /^(?:#[A-Za-z0-9_-]+)?$/u.test(u.hash) && (!u.pathname.endsWith("/") || !!u.hash);
  } catch { return false; }
}
/** Financial statuses are retained for the separate settlement/lifecycle gate. */
export function reconcileProviderView(c: ReconciliationClaim, v: ReconciliationProviderView, now: string): ReconciliationObservation {
  checkedClaim(c);
  if (!v || v.invoiceId !== c.invoiceId || v.caseId !== c.caseId || v.quoteId !== c.quoteId
    || v.termsVersionId !== c.termsVersionId || v.buyerAcceptanceId !== c.buyerAcceptanceId
    || v.amountCents !== c.amountCents || v.currency !== "USD" || v.mode !== "paypal_sandbox"
    || v.provider !== "paypal" || v.environment !== "sandbox" || v.simulated !== false
    || v.authoritativePaymentEvidence !== false) reject("invoice_mismatch");
  if (!instant(now) || !instant(v.observedAt) || v.observedAt < c.startedAt || v.observedAt > now
    || now >= c.leaseUntil || !STATUSES.includes(v.status)
    || typeof v.requiresReconciliation !== "boolean") reject("invalid_provider_response");
  if (!safeUrl(v.paymentUrl)) reject("unsafe_payment_url");
  const terminal = ["paid", "fully_refunded", "canceled"].includes(c.invoiceState);
  let state = c.invoiceState, reason: ReconciliationReason = "current_provider_state";
  if (["PAID", "REFUNDED"].includes(v.status)) {
    // A matched invoice total is not independently verified settlement evidence.
    if (!terminal) state = "reconciliation_required";
    reason = "financial_review_required";
  } else if (["SENT", "UNPAID", "SHARED"].includes(v.status)) {
    if (terminal) reason = "state_regression_blocked"; else state = "sent";
  } else if (["CANCELLED", "AUTO_CANCELLED"].includes(v.status)) {
    if (["paid", "fully_refunded"].includes(c.invoiceState)) reason = "state_regression_blocked";
    else state = "canceled";
  } else if (v.status === "DRAFT") {
    if (terminal || ["sent", "send_pending"].includes(c.invoiceState)) reason = "state_regression_blocked";
    else state = "draft";
  } else {
    if (!terminal) state = "reconciliation_required";
    reason = "uncertain_provider_state";
  }
  if (v.requiresReconciliation && reason === "current_provider_state") reason = "uncertain_provider_state";
  return Object.freeze({ providerStatus: v.status, invoiceState: state, reason,
    reviewRequired: reason !== "current_provider_state", paymentUrl: reason === "current_provider_state"
      && state === "sent" ? v.paymentUrl : null, observedAt: v.observedAt, amountCents: c.amountCents, currency: "USD" });
}
function outcome(value: ReconciliationResult["outcome"], code: ReconciliationFailure | null = null): ReconciliationResult {
  return Object.freeze({ outcome: value, code, authoritativePaymentEvidence: false, permissionActivated: false });
}
function failure(error: unknown): ReconciliationFailure {
  if (error instanceof ReconciliationError) return error.code;
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return typeof code === "string" && FAILURES.includes(code as ReconciliationFailure)
    ? code as ReconciliationFailure : "transport_unavailable";
}
export function createSandboxReconciler(deps: ReconciliationDependencies) {
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;
  return Object.freeze({
    async reconcile(bindingId: string): Promise<ReconciliationResult> {
      if (!UUID.test(bindingId)) return outcome("blocked", "invoice_not_bound");
      const startedAt = now().toISOString();
      let c: ReconciliationClaim | null;
      try { c = await deps.store.claim(bindingId, crypto.randomUUID(), startedAt,
        new Date(Date.parse(startedAt) + RECONCILIATION_LEASE_MS).toISOString()); }
      catch { return outcome("retry_scheduled", "storage_unavailable"); }
      if (!c) return outcome("not_ready");
      let code: ReconciliationFailure;
      try {
        checkedClaim(c);
        const provider = await deps.readInvoice(c.invoiceId);
        const at = now().toISOString();
        const observation = reconcileProviderView(c, provider, at);
        try { await deps.store.complete(c, observation, at); }
        catch {
          // A successful durable commit may lose its acknowledgement.
          if (await deps.store.completed(c.bindingId, c.generation)) return outcome("already_completed");
          throw new ReconciliationError("state_changed");
        }
        return outcome(observation.reviewRequired ? "review_required" : "reconciled");
      } catch (error) { code = failure(error); }
      const at = now().toISOString();
      const retryable = ["transport_unavailable", "rate_limited", "state_changed", "storage_unavailable"].includes(code);
      const retry = retryable && c.attemptNumber < RECONCILIATION_MAX_ATTEMPTS;
      const sample = random();
      const jitter = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0.5;
      const delay = Math.min(900_000, (code === "rate_limited" ? 60_000 : 30_000)
        * 2 ** (c.attemptNumber - 1)) + Math.floor(jitter * 5000);
      const retryAt = retry ? new Date(Date.parse(at) + delay).toISOString() : null;
      try { await deps.store.fail(c, code, retryAt, at); }
      catch { return outcome("lease_lost", "state_changed"); }
      return outcome(retry ? "retry_scheduled" : "blocked", code);
    },
  });
}
/** No timers, public routes or background scheduling are installed by this helper. */
export async function runReconciliationBatch(deps: ReconciliationDependencies, limit = 10) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error("Invalid reconciliation batch limit.");
  const at = (deps.now?.() ?? new Date()).toISOString();
  const ids = await deps.store.listReady(at, limit);
  if (ids.length > limit) throw new Error("Reconciliation batch exceeded its bound.");
  const worker = createSandboxReconciler(deps);
  const counts: Partial<Record<ReconciliationResult["outcome"], number>> = {};
  for (const id of ids) { const r = await worker.reconcile(id); counts[r.outcome] = (counts[r.outcome] ?? 0) + 1; }
  return Object.freeze({ examined: ids.length, outcomes: Object.freeze(counts), authoritativePaymentEvidence: false });
}
/** Rate-bounded missed-webhook recovery; never scans remote invoices or sends one. */
export async function queueStaleInvoices(store: ReconciliationStore, now: string, staleBefore: string, limit = 10) {
  if (!instant(now) || !instant(staleBefore) || Date.parse(now) - Date.parse(staleBefore) < 900_000
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error("Invalid recovery sweep bounds.");
  const ids = await store.staleBindings(staleBefore, limit);
  if (ids.length > limit) throw new Error("Recovery sweep exceeded its bound.");
  for (const id of ids) await store.request(id, "stale_sweep", now);
  return Object.freeze({ queued: ids.length, authoritativePaymentEvidence: false });
}
