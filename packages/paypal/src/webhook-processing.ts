/** Verified notifications are hints, not settled payment evidence.
 * Only this receipt/projection/outbox transaction may mark an inbox row processed.
 * No HTTP, invoice sending, permission activation or receipt issuance is available.
 */
export const WEBHOOK_PROCESSOR_VERSION = "rightsreceipt-webhook-processor-v1" as const;
export const NOTICE = Object.freeze({ created: 1, sent: 2, scheduled: 4, payment: 8,
  cancellation: 16, refund: 32, updated: 64, uncertain: 128 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PROVIDER_ID = /^[A-Za-z0-9-]{1,200}$/u;
const INVOICE_ID = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const EVENTS = ["CREATED", "SENT", "SCHEDULED", "PAID", "CANCELLED", "REFUNDED", "UPDATED"] as const;
export interface ProcessingEvent {
  readonly inboxId: string; readonly provider: string; readonly environment: string;
  readonly providerEventId: string; readonly providerInvoiceId: string | null;
  readonly invoiceBindingId: string | null; readonly eventType: string;
  readonly eventCreatedAt: string | null; readonly resourceStatus: string | null;
  readonly verificationStatus: string; readonly verificationMethod: string | null;
  readonly payloadSha256: string; readonly processingStatus: string;
}
export interface ProcessingBinding {
  readonly bindingId: string; readonly caseId: string; readonly providerInvoiceId: string;
  readonly provider: string; readonly environment: string; readonly rowVersion: number;
}
export interface NotificationProjection {
  readonly bindingId: string; readonly providerInvoiceId: string;
  readonly signalMask: number; readonly lastEventCreatedAt: string;
  readonly lastProviderEventId: string; readonly lastResourceStatus: string | null;
  readonly rowVersion: number;
}
export interface ProcessingReceipt {
  readonly inboxId: string; readonly bindingId: string; readonly payloadSha256: string;
}
export interface ProcessingCommit {
  readonly receiptId: string; readonly auditId: string; readonly processedAt: string;
  readonly event: ProcessingEvent; readonly binding: ProcessingBinding;
  readonly expectedProjectionVersion: number; readonly projection: NotificationProjection;
}
export interface WebhookProcessingStore {
  loadEvent(inboxId: string): Promise<ProcessingEvent | null>;
  loadReceipt(inboxId: string): Promise<ProcessingReceipt | null>;
  findBinding(providerInvoiceId: string): Promise<ProcessingBinding | null>;
  loadProjection(bindingId: string): Promise<NotificationProjection | null>;
  /** All writes commit together or none do. A failed compare-and-swap throws. */
  commit(input: ProcessingCommit): Promise<void>;
  listReady(limit: number): Promise<readonly string[]>;
}
export type ProcessingOutcome = "processed" | "duplicate" | "awaiting_binding" | "not_found"
  | "rejected_unverified" | "invalid_event" | "binding_mismatch" | "inconsistent_history" | "retry_pending";
export interface ProcessingResult {
  readonly outcome: ProcessingOutcome; readonly authoritativePaymentEvidence: false;
  readonly permissionActivated: false;
}
function result(outcome: ProcessingOutcome): ProcessingResult {
  return Object.freeze({ outcome, authoritativePaymentEvidence: false, permissionActivated: false });
}
function canonicalInstant(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const normalized = parsed.toISOString();
  // Date.parse normalizes invalid dates, so compare the calendar and clock too.
  if (normalized.slice(0, 19) !== value.slice(0, 19)) return null;
  return normalized;
}
function eventValid(e: ProcessingEvent): boolean {
  return UUID.test(e.inboxId) && PROVIDER_ID.test(e.providerEventId)
    && typeof e.providerInvoiceId === "string" && INVOICE_ID.test(e.providerInvoiceId)
    && (e.invoiceBindingId === null || UUID.test(e.invoiceBindingId))
    && HASH.test(e.payloadSha256) && canonicalInstant(e.eventCreatedAt) !== null
    && EVENTS.some(name => e.eventType === `INVOICING.INVOICE.${name}`)
    && (e.resourceStatus === null || /^[A-Z_]{1,40}$/u.test(e.resourceStatus));
}
function bindingValid(b: ProcessingBinding, e: ProcessingEvent): boolean {
  return UUID.test(b.bindingId) && UUID.test(b.caseId) && b.provider === "paypal"
    && b.environment === "sandbox" && b.providerInvoiceId === e.providerInvoiceId
    && Number.isSafeInteger(b.rowVersion) && b.rowVersion > 0
    && (e.invoiceBindingId === null || e.invoiceBindingId === b.bindingId);
}
function projectionValid(p: NotificationProjection): boolean {
  return UUID.test(p.bindingId) && INVOICE_ID.test(p.providerInvoiceId)
    && Number.isInteger(p.signalMask) && p.signalMask >= 0 && p.signalMask <= 255
    && Number.isSafeInteger(p.rowVersion) && p.rowVersion > 0
    && p.rowVersion < Number.MAX_SAFE_INTEGER
    && canonicalInstant(p.lastEventCreatedAt) === p.lastEventCreatedAt
    && PROVIDER_ID.test(p.lastProviderEventId)
    && (p.lastResourceStatus === null || /^[A-Z_]{1,40}$/u.test(p.lastResourceStatus));
}
/** A monotone union keeps late CREATED/SENT notices from erasing financial flags. */
export function notificationSignals(e: ProcessingEvent): number {
  const kind = e.eventType.slice("INVOICING.INVOICE.".length);
  const typeMask: Record<string, number> = { CREATED: NOTICE.created, SENT: NOTICE.sent,
    SCHEDULED: NOTICE.scheduled, PAID: NOTICE.payment, CANCELLED: NOTICE.cancellation,
    REFUNDED: NOTICE.refund, UPDATED: NOTICE.updated };
  let mask = typeMask[kind] ?? NOTICE.uncertain;
  const statusMask: Record<string, number> = {
    DRAFT: NOTICE.created, SENT: NOTICE.sent, UNPAID: NOTICE.sent, SCHEDULED: NOTICE.scheduled,
    PAID: NOTICE.payment, PARTIALLY_PAID: NOTICE.payment | NOTICE.uncertain,
    PAYMENT_PENDING: NOTICE.payment | NOTICE.uncertain, MARKED_AS_PAID: NOTICE.payment | NOTICE.uncertain,
    CANCELLED: NOTICE.cancellation, REFUNDED: NOTICE.refund,
    PARTIALLY_REFUNDED: NOTICE.refund | NOTICE.uncertain,
    MARKED_AS_REFUNDED: NOTICE.refund | NOTICE.uncertain,
  };
  mask |= e.resourceStatus === null ? NOTICE.uncertain : (statusMask[e.resourceStatus] ?? NOTICE.uncertain);
  return mask;
}
export function notificationStage(mask: number): string {
  if ((mask & NOTICE.cancellation) && (mask & (NOTICE.payment | NOTICE.refund))) return "conflicting_notices";
  if (mask & NOTICE.refund) return "refund_notified";
  if (mask & NOTICE.payment) return "payment_notified";
  if (mask & NOTICE.cancellation) return "cancellation_notified";
  if (mask & (NOTICE.updated | NOTICE.uncertain)) return "review_required";
  if (mask & NOTICE.sent) return "sent_notified";
  if (mask & NOTICE.scheduled) return "scheduled_notified";
  return "draft_notified";
}
/** Timestamp then ASCII event-ID tie break is independent of delivery order. */
export function reduceNotification(
  previous: NotificationProjection | null, event: ProcessingEvent, binding: ProcessingBinding,
): NotificationProjection {
  if (!eventValid(event) || !bindingValid(binding, event) || (previous && (!projectionValid(previous)
    || previous.bindingId !== binding.bindingId || previous.providerInvoiceId !== binding.providerInvoiceId))) {
    throw new Error("Invalid notification projection context.");
  }
  const created = canonicalInstant(event.eventCreatedAt)!;
  const latest = !previous || created > previous.lastEventCreatedAt
    || (created === previous.lastEventCreatedAt && event.providerEventId > previous.lastProviderEventId);
  return Object.freeze({
    bindingId: binding.bindingId, providerInvoiceId: binding.providerInvoiceId,
    signalMask: (previous?.signalMask ?? 0) | notificationSignals(event),
    lastEventCreatedAt: latest ? created : previous!.lastEventCreatedAt,
    lastProviderEventId: latest ? event.providerEventId : previous!.lastProviderEventId,
    lastResourceStatus: latest ? event.resourceStatus : previous!.lastResourceStatus,
    rowVersion: (previous?.rowVersion ?? 0) + 1,
  });
}
/** Database-backed compare-and-swap, with bounded retries for competing workers.
 * The store reads immutable inbox records; callers cannot supply provider payloads.
 */
export function createVerifiedWebhookProcessor(store: WebhookProcessingStore, now: () => Date = () => new Date()) {
  return Object.freeze({
    async process(inboxId: string): Promise<ProcessingResult> {
      if (!UUID.test(inboxId)) return result("invalid_event");
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const e = await store.loadEvent(inboxId);
          if (!e) return result("not_found");
          if (e.provider !== "paypal" || e.environment !== "sandbox"
            || e.verificationStatus !== "verified" || e.verificationMethod !== "paypal_postback_v1") return result("rejected_unverified");
          if (!eventValid(e)) return result("invalid_event");
          const receipt = await store.loadReceipt(inboxId);
          if (receipt) return result(e.processingStatus === "processed" && receipt.inboxId === e.inboxId
            && receipt.payloadSha256 === e.payloadSha256 && receipt.bindingId === e.invoiceBindingId
            ? "duplicate" : "inconsistent_history");
          if (!["pending", "failed"].includes(e.processingStatus)) return result("inconsistent_history");
          const binding = await store.findBinding(e.providerInvoiceId!);
          if (!binding) return result("awaiting_binding");
          if (!bindingValid(binding, e)) return result("binding_mismatch");
          const previous = await store.loadProjection(binding.bindingId);
          const projection = reduceNotification(previous, e, binding);
          const processedAt = now().toISOString();
          if (!canonicalInstant(processedAt)) return result("invalid_event");
          await store.commit({ receiptId: crypto.randomUUID(), auditId: crypto.randomUUID(), processedAt,
            event: e, binding, expectedProjectionVersion: previous?.rowVersion ?? 0, projection });
          return result("processed");
        } catch {
          // No error payload or source text escapes. The transaction must roll back.
          // Reload also recognizes a successful commit whose acknowledgement was lost.
        }
      }
      return result("retry_pending");
    },
  });
}
export async function processVerifiedWebhookBatch(store: WebhookProcessingStore, limit = 25) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid processing batch limit.");
  const ids = await store.listReady(limit);
  if (ids.length > limit) throw new Error("Processing batch exceeded its bound.");
  const processor = createVerifiedWebhookProcessor(store);
  const outcomes: Partial<Record<ProcessingOutcome, number>> = {};
  for (const id of ids) {
    const handled = await processor.process(id);
    outcomes[handled.outcome] = (outcomes[handled.outcome] ?? 0) + 1;
  }
  return Object.freeze({ examined: ids.length, outcomes: Object.freeze(outcomes),
    authoritativePaymentEvidence: false as const, permissionActivated: false as const });
}
