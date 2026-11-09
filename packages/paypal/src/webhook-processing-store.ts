/** Atomic D1 batch adapter for verified inbox -> receipt/projection/outbox/audit.
 * No remote call is made while holding the transaction. The first INSERT embeds
 * the compare-and-swap guard in a NOT NULL subquery: stale reads abort the batch.
 */
import type { NotificationProjection, ProcessingBinding, ProcessingCommit,
  ProcessingEvent, ProcessingReceipt, WebhookProcessingStore } from "./webhook-processing";
export type ProcessingSqlValue = string | number | null;
export interface ProcessingStatement {
  bind(...values: readonly ProcessingSqlValue[]): ProcessingStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ readonly success: boolean; readonly results?: readonly T[] }>;
}
export interface ProcessingDatabase {
  prepare(sql: string): ProcessingStatement;
  batch(statements: readonly ProcessingStatement[]): Promise<readonly {
    readonly success: boolean; readonly meta?: { readonly changes?: number };
  }[]>;
}
export function createD1WebhookProcessingStore(db: ProcessingDatabase): WebhookProcessingStore {
  return {
    loadEvent(inboxId) {
      return db.prepare(`SELECT webhook_inbox_event_id AS inboxId, provider, environment,
        provider_event_id AS providerEventId, provider_invoice_id AS providerInvoiceId,
        invoice_binding_id AS invoiceBindingId, event_type AS eventType,
        event_created_at AS eventCreatedAt, resource_status AS resourceStatus,
        verification_status AS verificationStatus, verification_method AS verificationMethod,
        payload_sha256 AS payloadSha256, processing_status AS processingStatus
        FROM webhook_inbox_events WHERE webhook_inbox_event_id=?`).bind(inboxId).first<ProcessingEvent>();
    },
    loadReceipt(inboxId) {
      return db.prepare(`SELECT webhook_inbox_event_id AS inboxId, invoice_binding_id AS bindingId,
        source_payload_sha256 AS payloadSha256 FROM paypal_webhook_processing_receipts
        WHERE webhook_inbox_event_id=?`).bind(inboxId).first<ProcessingReceipt>();
    },
    findBinding(providerInvoiceId) {
      return db.prepare(`SELECT invoice_binding_id AS bindingId, case_id AS caseId,
        provider_invoice_id AS providerInvoiceId, provider, environment, row_version AS rowVersion
        FROM invoice_bindings WHERE provider='paypal' AND environment='sandbox' AND provider_invoice_id=?`)
        .bind(providerInvoiceId).first<ProcessingBinding>();
    },
    loadProjection(bindingId) {
      return db.prepare(`SELECT invoice_binding_id AS bindingId, provider_invoice_id AS providerInvoiceId,
        signal_mask AS signalMask, last_event_created_at AS lastEventCreatedAt,
        last_provider_event_id AS lastProviderEventId, last_resource_status AS lastResourceStatus,
        row_version AS rowVersion FROM paypal_webhook_projections WHERE invoice_binding_id=?`)
        .bind(bindingId).first<NotificationProjection>();
    },
    async listReady(limit) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid processing batch limit.");
      const rows = await db.prepare(`SELECT e.webhook_inbox_event_id AS inboxId
        FROM webhook_inbox_events e JOIN invoice_bindings b
          ON b.provider=e.provider AND b.environment=e.environment AND b.provider_invoice_id=e.provider_invoice_id
        WHERE e.verification_status='verified' AND e.verification_method='paypal_postback_v1'
          AND e.provider='paypal' AND e.environment='sandbox' AND e.processing_status IN ('pending','failed')
          AND (e.invoice_binding_id IS NULL OR e.invoice_binding_id=b.invoice_binding_id)
        ORDER BY e.received_at, e.provider_event_id LIMIT ?`).bind(limit).all<{ inboxId: string }>();
      if (!rows.success || !rows.results) throw new Error("Verified inbox scan unavailable.");
      return rows.results.map(row => row.inboxId);
    },
    async commit(input: ProcessingCommit) {
      const { event: e, binding: b, projection: p, processedAt: at } = input;
      const statements = [
        // No INSERT OR IGNORE: duplicate IDs, CAS failures and failed guards must
        // abort the transaction before any later statement can mutate state.
        db.prepare(`INSERT INTO paypal_webhook_processing_receipts (
          processing_receipt_id, webhook_inbox_event_id, invoice_binding_id,
          source_payload_sha256, projection_version, outcome, processed_at
        ) VALUES (?, (
          SELECT e.webhook_inbox_event_id FROM webhook_inbox_events e JOIN invoice_bindings b
            ON b.provider=e.provider AND b.environment=e.environment AND b.provider_invoice_id=e.provider_invoice_id
          WHERE e.webhook_inbox_event_id=? AND e.provider='paypal' AND e.environment='sandbox'
            AND e.verification_status='verified' AND e.verification_method='paypal_postback_v1'
            AND e.processing_status IN ('pending','failed') AND e.payload_sha256=?
            AND e.provider_event_id=? AND e.event_type=? AND e.event_created_at=? AND e.resource_status IS ?
            AND b.invoice_binding_id=? AND b.case_id=? AND b.row_version=?
            AND (e.invoice_binding_id IS NULL OR e.invoice_binding_id=b.invoice_binding_id)
            AND COALESCE((SELECT row_version FROM paypal_webhook_projections WHERE invoice_binding_id=?),0)=?
        ), ?, ?, ?, 'queued_reconciliation', ?)`).bind(
          input.receiptId, e.inboxId, e.payloadSha256, e.providerEventId, e.eventType,
          e.eventCreatedAt, e.resourceStatus, b.bindingId, b.caseId, b.rowVersion,
          b.bindingId, input.expectedProjectionVersion, b.bindingId, e.payloadSha256, p.rowVersion, at),
        db.prepare(`INSERT INTO paypal_webhook_projections (
          invoice_binding_id, provider_invoice_id, signal_mask, last_event_created_at,
          last_provider_event_id, last_resource_status, row_version, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(invoice_binding_id) DO UPDATE SET signal_mask=excluded.signal_mask,
          last_event_created_at=excluded.last_event_created_at, last_provider_event_id=excluded.last_provider_event_id,
          last_resource_status=excluded.last_resource_status, row_version=excluded.row_version, updated_at=excluded.updated_at`)
          .bind(b.bindingId, b.providerInvoiceId, p.signalMask, p.lastEventCreatedAt,
            p.lastProviderEventId, p.lastResourceStatus, p.rowVersion, at),
        db.prepare(`INSERT INTO paypal_reconciliation_outbox (invoice_binding_id, requested_generation, completed_generation, updated_at)
          VALUES (?, ?, 0, ?) ON CONFLICT(invoice_binding_id) DO UPDATE
          SET requested_generation=requested_generation+1, updated_at=excluded.updated_at`)
          .bind(b.bindingId, p.rowVersion, at),
        db.prepare(`INSERT INTO audit_events (
          audit_event_id, case_id, aggregate_type, aggregate_id, aggregate_sequence, event_type,
          actor_type, actor_reference, payload_json, correlation_id, idempotency_key, created_at
        ) VALUES (?, ?, 'webhook_processing', ?, 1, 'paypal.webhook.reconciliation_queued',
          'system', 'verified-webhook-processor', ?, ?, ?, ?)`)
          .bind(input.auditId, b.caseId, e.inboxId, JSON.stringify({ provider_event_id: e.providerEventId,
            payload_sha256: e.payloadSha256, invoice_binding_id: b.bindingId, signal_mask: p.signalMask,
            notification_projection_version: p.rowVersion, authoritative_payment_evidence: false }),
          input.receiptId, `paypal:sandbox:${e.providerEventId}`, at),
        db.prepare(`UPDATE webhook_inbox_events SET invoice_binding_id=?, processing_status='processed',
          processed_at=?, processing_error_code=NULL WHERE webhook_inbox_event_id=?
          AND verification_status='verified' AND processing_status IN ('pending','failed')`)
          .bind(b.bindingId, at, e.inboxId),
      ];
      const results = await db.batch(statements);
      if (results.length !== statements.length || results.some(r => !r.success || r.meta?.changes !== 1)) {
        throw new Error("Webhook processing commit unavailable.");
      }
    },
  };
}
