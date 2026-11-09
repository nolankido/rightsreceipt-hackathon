/** Uses existing canonical tables. Exact-snapshot audit INSERTs fence each batch. */
import { CONSENT_ROOT_SQL, type ConsentDatabase, type ConsentStatement } from "./human-consent";
import type { InvoiceCreationSnapshot, InvoiceCreationStore } from "../../application/src/invoice-creation";
function object(alias: string, columns: string) {
  return `json_object(${columns.split(" ").map(c => `'${c}',${alias}.${c}`).join(",")})`;
}
const OP_COLUMNS = "payment_operation_id case_id operation_type operation_key command_fingerprint provider environment status attempt_count provider_request_id provider_reference error_code created_at updated_at row_version";
export const INVOICE_CREATION_STATE_SQL = `json_object('consent',json(${CONSENT_ROOT_SQL}),
  'operations',json((SELECT json_group_array(json(doc)) FROM (SELECT ${object("o", OP_COLUMNS)} doc
    FROM payment_operations o WHERE o.case_id=c.case_id AND o.operation_type='create_invoice' ORDER BY o.payment_operation_id LIMIT 3))),
  'binding',json((SELECT ${object("b", "invoice_binding_id case_id terms_version_id quote_id buyer_acceptance_id provider environment provider_invoice_id safe_invoice_reference invoice_status row_version")}
    FROM invoice_bindings b WHERE b.case_id=c.case_id LIMIT 1)),
  'verification',json((SELECT ${object("v", "verification_record_id case_id public_verification_id current_status current_receipt_revision_id row_version")}
    FROM verification_records v WHERE v.case_id=c.case_id LIMIT 1)))`;
const GUARD = `(SELECT ${INVOICE_CREATION_STATE_SQL} FROM licensing_cases c,(SELECT NULL AS digest) arg WHERE c.case_id=?)=?`;
function checked(rows: readonly { success: boolean; meta?: { changes?: number } }[], size: number) {
  if (rows.length !== size || rows.some(r => !r.success || r.meta?.changes !== 1)) throw new Error("Invoice transaction unavailable.");
}
export function createD1InvoiceCreationStore(db: ConsentDatabase): InvoiceCreationStore {
  function audit(s: InvoiceCreationSnapshot, operationId: string, event: string, actor: string, at: string, payload: unknown): ConsentStatement {
    const c = s.consent.root.case as Record<string, unknown>, o = s.operations[0];
    return db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
      actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
      VALUES (?,(SELECT case_id FROM licensing_cases WHERE case_id=? AND ${GUARD}),'invoice_creation',?,?,?,'creator',?,?,?,?,?)`)
      .bind(crypto.randomUUID(), String(c.case_id), String(c.case_id), s.stateJson, operationId, Number(o?.row_version ?? 0) + 1,
        event, actor, JSON.stringify(payload), operationId, `invoice-create:${operationId}:${event}`, at);
  }
  return {
    async load(caseId) {
      const r = await db.prepare(`SELECT ${INVOICE_CREATION_STATE_SQL} stateJson FROM licensing_cases c,(SELECT NULL AS digest) arg WHERE c.case_id=?`)
        .bind(caseId).first<{ stateJson: string }>();
      if (!r) return null;
      if (r.stateJson.length > 300000) throw new Error("Invoice snapshot exceeds bounds.");
      const s = JSON.parse(r.stateJson) as { consent: Record<string, unknown>; operations: Record<string, unknown>[];
        binding: Record<string, unknown> | null; verification: Record<string, unknown> | null };
      return { ...s, stateJson: r.stateJson, consent: { root: s.consent, sourceJson: JSON.stringify(s.consent) } };
    },
    async reserve(i) {
      const r = i.request, c = i.snapshot.consent.root.case as Record<string, unknown>;
      const statements = [audit(i.snapshot, i.operationId, "invoice.create_reserved", i.actor, i.at,
        { command_sha256: i.fingerprint, invoice_binding_id: i.bindingId, environment: "sandbox" }),
        db.prepare(`INSERT INTO payment_operations(payment_operation_id,case_id,operation_type,operation_key,command_fingerprint,
          provider,environment,status,provider_request_id,created_at,updated_at) VALUES (?,?,'create_invoice',?,?,'paypal','sandbox','pending',?,?,?)`)
          .bind(i.operationId, r.caseId, `invoice-create:${r.requestId}`, i.fingerprint, r.requestId, i.at, i.at),
        db.prepare(`INSERT INTO invoice_bindings(invoice_binding_id,case_id,terms_version_id,quote_id,buyer_acceptance_id,
          provider,environment,invoice_status,created_at,updated_at) VALUES (?,?,?,?,?,'paypal','sandbox','create_pending',?,?)`)
          .bind(i.bindingId, r.caseId, r.termsVersionId, r.quoteId, r.buyerAcceptanceId, i.at, i.at)];
      if (!i.snapshot.verification) statements.push(db.prepare(`INSERT INTO verification_records(verification_record_id,case_id,
        public_verification_id,current_status,created_at,updated_at) VALUES (?,?,?,'pending',?,?)`)
        .bind(i.verificationId, r.caseId, i.publicId, i.at, i.at));
      statements.push(db.prepare(`UPDATE licensing_cases SET invoice_binding_id=?,verification_record_id=?,updated_at=?,row_version=row_version+1
        WHERE case_id=? AND row_version=? AND invoice_binding_id IS NULL`).bind(i.bindingId, i.verificationId, i.at, r.caseId, Number(c.row_version)));
      checked(await db.batch(statements), statements.length);
    },
    async claim(s, actor, at) {
      const o = s.operations[0]!;
      const rows = await db.batch([audit(s, String(o.payment_operation_id), "invoice.create_dispatched", actor, at,
        { command_sha256: o.command_fingerprint, outcome: "unknown_until_response", environment: "sandbox" }),
        db.prepare(`UPDATE payment_operations SET status='unknown',attempt_count=1,error_code='creation_dispatch_claimed',
          updated_at=?,row_version=row_version+1 WHERE payment_operation_id=? AND row_version=? AND status='pending'
          AND attempt_count=0 AND provider_reference IS NULL`).bind(at, String(o.payment_operation_id), Number(o.row_version))]);
      checked(rows, 2);
    },
    async remember(o, invoiceId, at) {
      const rows = await db.batch([
        db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
          actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
          VALUES (?,(SELECT case_id FROM payment_operations WHERE payment_operation_id=? AND row_version=? AND command_fingerprint=?
            AND status='unknown' AND attempt_count=1 AND provider_reference IS NULL AND error_code='creation_dispatch_claimed'),
            'invoice_creation',?,?,'invoice.draft_observed','system','sandbox-draft-adapter',?,?,?,?)`)
          .bind(crypto.randomUUID(), String(o.payment_operation_id), Number(o.row_version), String(o.command_fingerprint),
            String(o.payment_operation_id), Number(o.row_version) + 1, JSON.stringify({ provider_invoice_id: invoiceId, environment: "sandbox" }),
            String(o.payment_operation_id), `invoice-create:${o.payment_operation_id}:invoice.draft_observed`, at),
        db.prepare(`UPDATE payment_operations SET provider_reference=?,error_code='draft_observed',updated_at=?,row_version=row_version+1
          WHERE payment_operation_id=? AND row_version=?`).bind(invoiceId, at, String(o.payment_operation_id), Number(o.row_version)),
      ]); checked(rows, 2);
    },
    async bind(s, actor, at) {
      const o = s.operations[0]!, b = s.binding!, c = s.consent.root.case as Record<string, unknown>;
      const rows = await db.batch([audit(s, String(o.payment_operation_id), "invoice.draft_bound", actor, at,
        { invoice_binding_id: b.invoice_binding_id, provider_invoice_id: o.provider_reference, environment: "sandbox", payment_confirmed: false }),
        db.prepare(`UPDATE payment_operations SET status='succeeded',error_code=NULL,updated_at=?,row_version=row_version+1
          WHERE payment_operation_id=? AND row_version=? AND status='unknown' AND error_code='draft_observed'`)
          .bind(at, String(o.payment_operation_id), Number(o.row_version)),
        db.prepare(`UPDATE invoice_bindings SET provider_invoice_id=?,safe_invoice_reference=?,invoice_status='draft',updated_at=?,row_version=row_version+1
          WHERE invoice_binding_id=? AND row_version=? AND invoice_status='create_pending' AND provider_invoice_id IS NULL`)
          .bind(String(o.provider_reference), String(o.provider_reference), at, String(b.invoice_binding_id), Number(b.row_version)),
        db.prepare(`UPDATE licensing_cases SET updated_at=?,row_version=row_version+1 WHERE case_id=? AND row_version=?`)
          .bind(at, String(c.case_id), Number(c.row_version)),
      ]); checked(rows, 4);
    },
  };
}
