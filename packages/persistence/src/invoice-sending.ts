/** Exact-source fenced adoption and send accounting. All network I/O is outside batches. */
import { INVOICE_CREATION_STATE_SQL } from "./invoice-creation";
import type { ConsentDatabase, ConsentStatement } from "./human-consent";
import type { InvoiceSendingSnapshot, InvoiceSendingStore } from "../../application/src/invoice-sending";
import type { InvoiceCreationSnapshot } from "../../application/src/invoice-creation";
import type { DeliveryEntry } from "../../paypal/src/delivery-journal";
function obj(a: string, columns: string) { return `json_object(${columns.split(" ").map(c => `'${c}',${a}.${c}`).join(",")})`; }
const OP = "payment_operation_id case_id operation_type operation_key command_fingerprint provider environment status attempt_count provider_request_id provider_reference error_code created_at updated_at row_version";
const STATE = `json_object('creation',json(${INVOICE_CREATION_STATE_SQL}),
  'operations',json((SELECT json_group_array(json(doc)) FROM (SELECT ${obj("o", OP)} doc FROM payment_operations o
    WHERE o.case_id=c.case_id AND o.operation_type='send_invoice' ORDER BY o.payment_operation_id LIMIT 3))),
  'journal',json((SELECT ${obj("j", "request_id case_id snapshot_hash merchant_hash invoice_id binding_json send_state")}
    FROM paypal_delivery_journal j WHERE j.case_id=c.case_id LIMIT 1)),
  'outbox',json((SELECT ${obj("o", "requested_generation completed_generation lease_token blocked_code")}
    FROM paypal_reconciliation_outbox o WHERE o.invoice_binding_id=c.invoice_binding_id LIMIT 1)))`;
/** Read-only consumers reuse the exact aggregate for combined source fences. */
export const INVOICE_SENDING_STATE_SQL = STATE;
const GUARD = `(SELECT ${STATE} FROM licensing_cases c,(SELECT NULL AS digest) arg WHERE c.case_id=?)=?`;
function check(rows: readonly { success: boolean; meta?: { changes?: number } }[], count: number) {
  if (rows.length !== count || rows.some(r => !r.success || r.meta?.changes !== 1)) throw new Error("Invoice delivery transaction unavailable.");
}
export function createD1InvoiceSendingStore(db: ConsentDatabase): InvoiceSendingStore {
  function audit(s: InvoiceSendingSnapshot, opId: string, event: string, actor: string, at: string, payload: unknown): ConsentStatement {
    const c = s.creation.consent.root.case as Record<string, unknown>, op = s.operations[0];
    return db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
      actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
      VALUES (?,(SELECT case_id FROM licensing_cases WHERE case_id=? AND ${GUARD}),'invoice_sending',?,?,?,'creator',?,?,?,?,?)`)
      .bind(crypto.randomUUID(), String(c.case_id), String(c.case_id), s.stateJson, opId, Number(op?.row_version ?? 0) + 1,
        event, actor, JSON.stringify(payload), opId, `invoice-send:${opId}:${event}`, at);
  }
  return {
    async load(caseId) {
      const r = await db.prepare(`SELECT ${STATE} stateJson FROM licensing_cases c,(SELECT NULL AS digest) arg WHERE c.case_id=?`)
        .bind(caseId).first<{ stateJson: string }>();
      if (!r) return null;
      if (r.stateJson.length > 400000) throw new Error("Invoice delivery snapshot exceeds bounds.");
      const s = JSON.parse(r.stateJson), creation = s.creation;
      const c: InvoiceCreationSnapshot = { ...creation, stateJson: JSON.stringify(creation),
        consent: { root: creation.consent, sourceJson: JSON.stringify(creation.consent) } };
      const j = s.journal;
      const journal: DeliveryEntry | null = j ? { requestId: j.request_id, caseId: j.case_id, snapshotHash: j.snapshot_hash,
        merchantHash: j.merchant_hash, binding: j.binding_json === null ? null : JSON.parse(j.binding_json), sendState: j.send_state } : null;
      if (j && journal?.binding && journal.binding.draft.invoiceId !== j.invoice_id) throw new Error("Journal identity mismatch.");
      return { stateJson: r.stateJson, creation: c, operations: s.operations, journal };
    },
    async reserve(i) {
      const s = i.snapshot, b = s.creation.binding!, c = s.creation.consent.root.case as Record<string, unknown>, e = i.entry;
      const statements = [audit(s, i.operationId, "invoice.send_reserved", i.actor, i.at,
        { confirmation: "send-sandbox-invoice-v1", command_sha256: i.fingerprint, invoice_binding_id: b.invoice_binding_id,
          provider_invoice_id: b.provider_invoice_id, environment: "sandbox" })];
      if (!s.journal) statements.push(db.prepare(`INSERT INTO paypal_delivery_journal(request_id,case_id,snapshot_hash,merchant_hash,
        invoice_id,binding_json,send_state) VALUES (?,?,?,?,?,?,'not_started')`).bind(e.requestId, e.caseId, e.snapshotHash,
        e.merchantHash, String(b.provider_invoice_id), JSON.stringify(e.binding)));
      statements.push(db.prepare(`INSERT INTO payment_operations(payment_operation_id,case_id,operation_type,operation_key,command_fingerprint,
        provider,environment,status,provider_request_id,provider_reference,created_at,updated_at)
        VALUES (?,?,'send_invoice',?,?,'paypal','sandbox','pending',?,?,?,?)`)
        .bind(i.operationId, e.caseId, `invoice-send:${e.requestId}`, i.fingerprint, i.sendKey, String(b.provider_invoice_id), i.at, i.at));
      statements.push(db.prepare(`UPDATE invoice_bindings SET invoice_status='send_pending',updated_at=?,row_version=row_version+1
        WHERE invoice_binding_id=? AND row_version=? AND invoice_status='draft'`).bind(i.at, String(b.invoice_binding_id), Number(b.row_version)));
      statements.push(db.prepare(`UPDATE licensing_cases SET updated_at=?,row_version=row_version+1 WHERE case_id=? AND row_version=?`)
        .bind(i.at, e.caseId, Number(c.row_version)));
      check(await db.batch(statements), statements.length);
    },
    async claim(s, actor, at) {
      const op = s.operations[0]!;
      const statements = [audit(s, String(op.payment_operation_id), "invoice.send_dispatched", actor, at,
        { provider_invoice_id: op.provider_reference, command_sha256: op.command_fingerprint, environment: "sandbox" }),
        db.prepare(`UPDATE payment_operations SET status='unknown',attempt_count=1,error_code='send_dispatch_claimed',
          updated_at=?,row_version=row_version+1 WHERE payment_operation_id=? AND row_version=? AND status='pending' AND attempt_count=0`)
          .bind(at, String(op.payment_operation_id), Number(op.row_version))];
      check(await db.batch(statements), statements.length);
    },
    async complete(s, view, actor, at) {
      const op = s.operations[0]!, b = s.creation.binding!, c = s.creation.consent.root.case as Record<string, unknown>;
      const keep = ["paid", "canceled", "fully_refunded"].includes(String(b.invoice_status));
      const local = keep ? String(b.invoice_status) : ["SENT", "UNPAID", "SHARED", "SCHEDULED"].includes(view.status)
        ? "sent" : "reconciliation_required";
      const statements = [audit(s, String(op.payment_operation_id), "invoice.delivery_observed", actor, at,
        { provider_invoice_id: view.invoiceId, provider_status: view.status, observed_at: view.observedAt,
          environment: "sandbox", payment_confirmed: false, permission_granted: false }),
        db.prepare(`UPDATE payment_operations SET status='succeeded',error_code=NULL,updated_at=?,row_version=row_version+1
          WHERE payment_operation_id=? AND row_version=? AND status='unknown' AND attempt_count=1`)
          .bind(at, String(op.payment_operation_id), Number(op.row_version)),
        db.prepare(`UPDATE invoice_bindings SET invoice_status=?,sent_at=COALESCE(sent_at,?),updated_at=?,row_version=row_version+1
          WHERE invoice_binding_id=? AND row_version=? AND provider_invoice_id=?`)
          .bind(local, ["SENT", "UNPAID", "SHARED"].includes(view.status) ? view.observedAt : null,
            at, String(b.invoice_binding_id), Number(b.row_version), view.invoiceId),
        db.prepare(`INSERT INTO paypal_reconciliation_outbox(invoice_binding_id,requested_generation,completed_generation,updated_at)
          VALUES (?,1,0,?) ON CONFLICT(invoice_binding_id) DO UPDATE
          SET requested_generation=paypal_reconciliation_outbox.requested_generation+1,updated_at=excluded.updated_at`)
          .bind(String(b.invoice_binding_id), at),
        db.prepare(`UPDATE licensing_cases SET updated_at=?,row_version=row_version+1 WHERE case_id=? AND row_version=?`)
          .bind(at, String(c.case_id), Number(c.row_version)),
        db.prepare(`UPDATE verification_records SET current_status=CASE WHEN current_receipt_revision_id IS NULL THEN current_status ELSE 'invalid' END,
          updated_at=?,row_version=row_version+1 WHERE verification_record_id=? AND case_id=?`)
          .bind(at, String(c.verification_record_id), String(c.case_id))];
      check(await db.batch(statements), statements.length);
    },
  };
}
