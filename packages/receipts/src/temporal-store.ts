/** Exact-source CAS: a UTC transition, its audit, case revision and verification
 * invalidation commit together. Receipt publication follows, safely retryable.
 */
import { createD1ReceiptStore, RECEIPT_SNAPSHOT_GUARD, type ReceiptDatabase } from "./store";
import { id, instant, integer, row } from "./material";
import { effectivePermissionState, licenseInterval } from "./temporal";
import type { TemporalStore, TemporalTransition } from "./temporal-service";
export function createD1TemporalStore(db: ReceiptDatabase): TemporalStore {
  return {
    receipts: createD1ReceiptStore(db),
    async listDue(at, limit) {
      instant(at);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid clock batch limit.");
      const result = await db.prepare(`SELECT json_group_array(case_id) AS ids FROM (
        SELECT c.case_id FROM licensing_cases c JOIN permissions p ON p.permission_id=c.permission_id
        JOIN invoice_bindings b ON b.invoice_binding_id=c.invoice_binding_id
        JOIN verification_records v ON v.verification_record_id=c.verification_record_id
        JOIN paypal_reconciliation_outbox o ON o.invoice_binding_id=b.invoice_binding_id
        WHERE c.case_outcome='open' AND p.case_id=c.case_id AND p.invoice_binding_id=b.invoice_binding_id
          AND b.provider='paypal' AND b.environment='sandbox' AND b.invoice_status='paid' AND p.review_required=0
          AND o.requested_generation=o.completed_generation AND o.lease_token IS NULL AND o.blocked_code IS NULL
          AND ((p.permission_state='scheduled' AND p.start_date<=?)
            OR (p.permission_state='active' AND p.end_date_exclusive<=?)
            OR (p.permission_state IN ('active','expired') AND p.state_reason_code IN ('utc_start_reached','utc_end_reached')
              AND v.current_status='invalid'))
        ORDER BY p.end_date_exclusive,c.case_id LIMIT ?)`)
        .bind(at.slice(0,10), at.slice(0,10), limit).first<{ ids: string }>();
      const ids: unknown = JSON.parse(result?.ids ?? "[]");
      if (!Array.isArray(ids) || ids.length > limit) throw new Error("Invalid clock batch.");
      return ids.map(id);
    },
    async transition(command: TemporalTransition) {
      const { snapshot, caseId, from, to, effectiveAt, recordedAt } = command;
      id(caseId); instant(recordedAt); instant(effectiveAt);
      const c = row(snapshot.root.case), p = row(snapshot.root.permission), v = row(snapshot.root.verification);
      const permissionId = id(p.permission_id), verificationId = id(v.verification_record_id);
      const caseVersion = integer(c.row_version), permissionVersion = integer(p.row_version), verificationVersion = integer(v.row_version);
      const period = licenseInterval(String(p.start_date), String(p.end_date_exclusive));
      if (c.case_id !== caseId || p.case_id !== caseId || p.permission_state !== from
        || !["scheduled","active"].includes(from) || !["active","expired"].includes(to)
        || from === to || effectivePermissionState(from, String(p.start_date), String(p.end_date_exclusive), recordedAt) !== to
        || effectiveAt !== (to === "active" ? period.startsAt : period.expiresAt) || effectiveAt > recordedAt) throw new Error("Invalid clock transition.");
      const reason = to === "active" ? "utc_start_reached" : "utc_end_reached";
      const auditId = crypto.randomUUID(), key = `permission-clock:${permissionId}:${permissionVersion}:${to}`;
      const results = await db.batch([
        db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
          actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
          VALUES (?,(SELECT case_id FROM licensing_cases WHERE case_id=? AND ${RECEIPT_SNAPSHOT_GUARD}),
            'permission_clock',?,?,?,'clock','utc-permission-clock',?,?,?,?)`)
          .bind(auditId, caseId, caseId, snapshot.sourceJson, caseId, snapshot.chainJson,
            permissionId, permissionVersion + 1, to === "active" ? "permission.activated" : "permission.expired",
            JSON.stringify({ permission_id: permissionId, previous_state: from, state: to,
              effective_at: effectiveAt, recorded_at: recordedAt, reason_code: reason,
              payment_changed: false, receipt_pending: true, environment: "sandbox" }), auditId, key, recordedAt),
        db.prepare(`UPDATE permissions SET permission_state=?,state_reason_code=?,state_effective_at=?,updated_at=?,row_version=row_version+1
          WHERE permission_id=? AND row_version=? AND permission_state=? AND review_required=0`)
          .bind(to, reason, effectiveAt, recordedAt, permissionId, permissionVersion, from),
        db.prepare(`UPDATE licensing_cases SET updated_at=?,row_version=row_version+1 WHERE case_id=? AND row_version=?`)
          .bind(recordedAt, caseId, caseVersion),
        db.prepare(`UPDATE verification_records SET current_status='invalid',updated_at=?,row_version=row_version+1
          WHERE verification_record_id=? AND row_version=?`).bind(recordedAt, verificationId, verificationVersion),
      ]);
      if (results.length !== 4 || results.some(r => !r.success || r.meta?.changes !== 1)) throw new Error("Clock transition unavailable.");
    },
  };
}
