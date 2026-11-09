/** D1-shaped fencing and atomic reconciliation. Raw provider bodies never persist. */
import type { ReconciliationClaim, ReconciliationFailure, ReconciliationObservation, ReconciliationStore } from "./reconciliation";
export interface ReconciliationStatement {
  bind(...values: readonly (string | number | null)[]): ReconciliationStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ readonly success: boolean; readonly results?: readonly T[] }>;
  run(): Promise<{ readonly success: boolean; readonly meta?: { readonly changes?: number } }>;
}
export interface ReconciliationDatabase {
  prepare(sql: string): ReconciliationStatement;
  batch(statements: readonly ReconciliationStatement[]): Promise<readonly {
    readonly success: boolean; readonly meta?: { readonly changes?: number };
  }[]>;
}
const FROM = `FROM invoice_bindings b
 JOIN paypal_reconciliation_outbox o ON o.invoice_binding_id=b.invoice_binding_id
 JOIN licensing_cases c ON c.case_id=b.case_id
 LEFT JOIN terms_versions t ON t.terms_version_id=b.terms_version_id
 LEFT JOIN quotes q ON q.quote_id=b.quote_id
 LEFT JOIN buyer_acceptances a ON a.buyer_acceptance_id=b.buyer_acceptance_id
 LEFT JOIN creator_decisions d ON d.creator_decision_id=a.creator_decision_id`;
const CONSENT = `c.case_outcome='open' AND c.invoice_binding_id=b.invoice_binding_id
 AND c.latest_terms_version_id=b.terms_version_id AND c.latest_quote_id=b.quote_id
 AND c.latest_buyer_acceptance_id=b.buyer_acceptance_id AND c.latest_creator_decision_id=d.creator_decision_id
 AND t.case_id=b.case_id AND t.resolution_status='complete' AND t.source_kind='human_corrected' AND t.created_by_actor='creator'
 AND q.case_id=b.case_id AND q.terms_version_id=b.terms_version_id AND q.status='current'
 AND q.amount_cents>0 AND q.amount_cents<=1000000000 AND q.currency='USD'
 AND a.case_id=b.case_id AND a.terms_version_id=b.terms_version_id AND a.quote_id=b.quote_id
 AND length(a.acceptance_copy_version)>0 AND length(a.accepted_at)>=20
 AND d.case_id=b.case_id AND d.terms_version_id=b.terms_version_id AND d.quote_id=b.quote_id AND d.decision='approved'`;
function positiveCount(r: { success: boolean; meta?: { changes?: number } }): number {
  if (!r.success || (r.meta?.changes !== 0 && r.meta?.changes !== 1)) throw new Error("Reconciliation write unavailable.");
  return r.meta.changes;
}
function limitChecked(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error("Invalid reconciliation query limit.");
}
export function createD1ReconciliationStore(db: ReconciliationDatabase): ReconciliationStore {
  return {
    async claim(bindingId, token, now, leaseUntil) {
      const r = await db.prepare(`UPDATE paypal_reconciliation_outbox SET lease_token=?, lease_expires_at=?,
        attempt_count=CASE WHEN attempt_generation=requested_generation THEN attempt_count+1 ELSE 1 END,
        attempt_generation=requested_generation, updated_at=?
        WHERE invoice_binding_id=? AND requested_generation>completed_generation AND blocked_code IS NULL
          AND (next_attempt_at IS NULL OR next_attempt_at<=?) AND (lease_token IS NULL OR lease_expires_at<=?)
          AND (attempt_generation!=requested_generation OR attempt_count<5)
          AND EXISTS (SELECT 1 FROM invoice_bindings b WHERE b.invoice_binding_id=? AND b.provider='paypal'
            AND b.environment='sandbox' AND b.provider_invoice_id IS NOT NULL)`)
        .bind(token, leaseUntil, now, bindingId, now, now, bindingId).run();
      if (!positiveCount(r)) return null;
      return db.prepare(`SELECT b.invoice_binding_id AS bindingId, b.case_id AS caseId, b.provider_invoice_id AS invoiceId,
        b.quote_id AS quoteId, b.terms_version_id AS termsVersionId, b.buyer_acceptance_id AS buyerAcceptanceId,
        q.amount_cents AS amountCents, q.currency, b.invoice_status AS invoiceState,
        b.row_version AS bindingVersion, c.row_version AS caseVersion, CASE WHEN ${CONSENT} THEN 1 ELSE 0 END AS consentCurrent,
        o.attempt_generation AS generation, o.lease_token AS token, o.attempt_count AS attemptNumber,
        o.updated_at AS startedAt, o.lease_expires_at AS leaseUntil ${FROM}
        WHERE b.invoice_binding_id=? AND o.lease_token=?`).bind(bindingId, token).first<ReconciliationClaim>();
    },
    async complete(c: ReconciliationClaim, v: ReconciliationObservation, at: string) {
      const receiptId = crypto.randomUUID();
      const statements = [
        // The NOT NULL binding subquery is the transaction fence. A stale lease,
        // changed human decision, changed tuple or changed revision rolls back ALL writes.
        db.prepare(`INSERT INTO paypal_reconciliation_receipts (
          reconciliation_receipt_id, invoice_binding_id, generation, provider_invoice_id,
          provider_status, local_invoice_status, reason_code, amount_cents, currency,
          safe_payment_url, observed_at, recorded_at
        ) VALUES (?, (SELECT b.invoice_binding_id ${FROM}
          WHERE b.invoice_binding_id=? AND b.provider='paypal' AND b.environment='sandbox'
            AND b.provider_invoice_id=? AND b.quote_id=? AND b.terms_version_id=? AND b.buyer_acceptance_id=?
            AND b.row_version=? AND c.row_version=? AND q.amount_cents=? AND ${CONSENT}
            AND o.lease_token=? AND o.lease_expires_at>? AND o.attempt_generation=?
            AND o.completed_generation<? AND o.requested_generation>=?), ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?)`)
          .bind(receiptId, c.bindingId, c.invoiceId, c.quoteId, c.termsVersionId, c.buyerAcceptanceId,
            c.bindingVersion, c.caseVersion, c.amountCents, c.token, at, c.generation, c.generation, c.generation,
            c.generation, c.invoiceId, v.providerStatus, v.invoiceState, v.reason, v.amountCents, v.paymentUrl, v.observedAt, at),
        db.prepare(`UPDATE invoice_bindings SET invoice_status=?, updated_at=?, row_version=row_version+1,
          sent_at=CASE WHEN ?='sent' THEN COALESCE(sent_at,?) ELSE sent_at END
          WHERE invoice_binding_id=? AND row_version=?`)
          .bind(v.invoiceState, at, v.invoiceState, v.observedAt, c.bindingId, c.bindingVersion),
        db.prepare(`INSERT INTO audit_events (audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,
          event_type,actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
          VALUES (?,?,'paypal_reconciliation',?,?,'paypal.invoice.reconciled','system','sandbox-reconciler',?,?,?,?)`)
          .bind(crypto.randomUUID(), c.caseId, c.bindingId, c.generation, JSON.stringify({
            provider_invoice_id: c.invoiceId, generation: c.generation, provider_status: v.providerStatus,
            invoice_status: v.invoiceState, review_required: v.reviewRequired,
            reason_code: v.reason, authoritative_payment_evidence: false,
          }), receiptId, `reconcile:${c.bindingId}:${c.generation}`, at),
        db.prepare(`UPDATE paypal_reconciliation_outbox SET completed_generation=?, lease_token=NULL, lease_expires_at=NULL,
          attempt_count=0, attempt_generation=0, next_attempt_at=NULL, last_error_code=NULL, blocked_code=NULL,
          last_success_at=?, updated_at=? WHERE invoice_binding_id=? AND lease_token=?`)
          .bind(c.generation, v.observedAt, at, c.bindingId, c.token),
      ];
      const results = await db.batch(statements);
      if (results.length !== statements.length || results.some(r => !r.success || r.meta?.changes !== 1)) {
        throw new Error("Reconciliation transaction unavailable.");
      }
    },
    async completed(bindingId, generation) {
      return !!await db.prepare(`SELECT reconciliation_receipt_id FROM paypal_reconciliation_receipts
        WHERE invoice_binding_id=? AND generation=?`).bind(bindingId, generation).first();
    },
    async fail(c, code: ReconciliationFailure, retryAt, at) {
      const r = await db.prepare(`UPDATE paypal_reconciliation_outbox SET lease_token=NULL,lease_expires_at=NULL,
        next_attempt_at=?,last_error_code=?,blocked_code=?,updated_at=?
        WHERE invoice_binding_id=? AND lease_token=? AND lease_expires_at>?`)
        .bind(retryAt, code, retryAt === null ? code : null, at, c.bindingId, c.token, at).run();
      if (positiveCount(r) !== 1) throw new Error("Reconciliation lease lost.");
    },
    async request(bindingId, reason, at) {
      if (!["operator_retry", "stale_sweep"].includes(reason)) throw new Error("Invalid recovery reason.");
      await db.prepare(`INSERT INTO paypal_reconciliation_outbox (invoice_binding_id,requested_generation,completed_generation,updated_at)
        SELECT invoice_binding_id,1,0,? FROM invoice_bindings WHERE invoice_binding_id=? AND provider='paypal'
          AND environment='sandbox' AND provider_invoice_id IS NOT NULL
        ON CONFLICT(invoice_binding_id) DO UPDATE SET
          requested_generation=CASE WHEN requested_generation>completed_generation THEN requested_generation ELSE requested_generation+1 END,
          blocked_code=CASE WHEN ?='operator_retry' THEN NULL ELSE blocked_code END,
          last_error_code=CASE WHEN ?='operator_retry' THEN NULL ELSE last_error_code END,
          next_attempt_at=CASE WHEN ?='operator_retry' THEN NULL ELSE next_attempt_at END,
          attempt_count=0,attempt_generation=0,lease_token=NULL,lease_expires_at=NULL,updated_at=excluded.updated_at
        WHERE (lease_token IS NULL OR lease_expires_at<=?)
          AND (?='operator_retry' OR requested_generation=completed_generation)`)
        .bind(at, bindingId, reason, reason, reason, at, reason).run().then(positiveCount);
    },
    async listReady(at, limit) {
      limitChecked(limit);
      const r = await db.prepare(`SELECT invoice_binding_id AS id FROM paypal_reconciliation_outbox
        WHERE requested_generation>completed_generation AND blocked_code IS NULL
          AND (next_attempt_at IS NULL OR next_attempt_at<=?) AND (lease_token IS NULL OR lease_expires_at<=?)
          AND (attempt_generation!=requested_generation OR attempt_count<5)
        ORDER BY updated_at,invoice_binding_id LIMIT ?`).bind(at, at, limit).all<{ id: string }>();
      if (!r.success || !r.results) throw new Error("Reconciliation scan unavailable.");
      return r.results.map(row => row.id);
    },
    async staleBindings(cutoff, limit) {
      limitChecked(limit);
      const r = await db.prepare(`SELECT b.invoice_binding_id AS id FROM invoice_bindings b
        LEFT JOIN paypal_reconciliation_outbox o ON o.invoice_binding_id=b.invoice_binding_id
        WHERE b.provider='paypal' AND b.environment='sandbox' AND b.provider_invoice_id IS NOT NULL
          AND (o.invoice_binding_id IS NULL OR o.requested_generation=o.completed_generation)
          AND o.blocked_code IS NULL AND o.lease_token IS NULL
          AND COALESCE(o.last_success_at,b.updated_at)<=? ORDER BY b.updated_at,b.invoice_binding_id LIMIT ?`)
        .bind(cutoff, limit).all<{ id: string }>();
      if (!r.success || !r.results) throw new Error("Recovery sweep unavailable.");
      return r.results.map(row => row.id);
    },
  };
}
/** Creator-safe recovery information. No public route or mutation is exposed. */
export async function inspectReconciliation(db: ReconciliationDatabase, bindingId: string, now: string) {
  const row = await db.prepare(`SELECT o.requested_generation AS requested,o.completed_generation AS completed,
    o.lease_expires_at AS leaseUntil,o.next_attempt_at AS retryAt,o.blocked_code AS blocked,o.last_error_code AS lastError,
    o.last_success_at AS lastObservedAt,o.attempt_count AS attempts,o.attempt_generation AS attemptGeneration,
    r.reason_code AS reviewReason FROM paypal_reconciliation_outbox o LEFT JOIN paypal_reconciliation_receipts r
      ON r.invoice_binding_id=o.invoice_binding_id AND r.generation=o.completed_generation
    WHERE o.invoice_binding_id=?`).bind(bindingId)
    .first<{requested:number;completed:number;leaseUntil:string|null;retryAt:string|null;
      blocked:string|null;lastError:string|null;lastObservedAt:string|null;attempts:number;
      attemptGeneration:number;reviewReason:string|null}>();
  if (!row) return Object.freeze({ status: "not_requested", message: "No current invoice check is recorded.",
    nextAction: "request_status_check", authoritativePaymentEvidence: false });
  const status = row.blocked ? "blocked" : row.leaseUntil && row.leaseUntil > now ? "in_flight"
    : row.attempts >= 5 && row.attemptGeneration === row.requested && row.requested > row.completed ? "blocked"
    : row.retryAt && row.retryAt > now ? "retry_scheduled" : row.requested > row.completed ? "pending"
      : row.reviewReason && row.reviewReason !== "current_provider_state" ? "review_required" : "up_to_date";
  const explanations: Record<string, string> = {
    blocked: "Automatic status checks stopped. Resolve the reported issue before requesting a safe retry.",
    in_flight: "A fresh Sandbox invoice check is in progress. Do not resend the invoice.",
    retry_scheduled: "A temporary provider failure delayed this check. A status-only retry is queued.",
    pending: "A fresh invoice status check is pending. No payment or permission is confirmed.",
    review_required: "The provider observation needs settlement or conflict review. No permission is activated.",
    up_to_date: "The current invoice status was checked. This is not proof of settled payment or an active license.",
  };
  return Object.freeze({ status, message: explanations[status], nextAction: status === "blocked"
    ? "inspect_issue_then_retry_read" : status === "review_required" ? "review_settlement_or_conflict" : "none",
    requestedGeneration: row.requested, completedGeneration: row.completed,
    nextRetryAt: row.retryAt, lastErrorCode: row.lastError, lastObservedAt: row.lastObservedAt,
    reviewReason: row.reviewReason, authoritativePaymentEvidence: false });
}
