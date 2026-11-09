/** D1-shaped receipt persistence. A single SQL statement reads each source snapshot;
 * atomic compare-and-swap publication covers that snapshot AND the entire chain.
 */
import { id, row, instant } from "./material";
import type { ReceiptCommit, ReceiptStore, StoredReceipt } from "./contract";
export interface ReceiptStatement {
  bind(...values: readonly (string | number | null)[]): ReceiptStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ readonly success: boolean; readonly meta?: { readonly changes?: number } }>;
}
export interface ReceiptDatabase {
  prepare(sql: string): ReceiptStatement;
  batch(statements: readonly ReceiptStatement[]): Promise<readonly { readonly success: boolean; readonly meta?: { readonly changes?: number } }[]>;
}
function obj(alias: string, columns: string): string {
  return `json_object(${columns.split(" ").map(c => `'${c}',${alias}.${c}`).join(",")})`;
}
function one(table: string, alias: string, columns: string, where: string, tail = "") {
  return `json((SELECT ${obj(alias, columns)} FROM ${table} ${alias} WHERE ${where} ${tail} LIMIT 1))`;
}
function many(table: string, alias: string, columns: string, where: string, order: string, limit: number) {
  return `json((SELECT json_group_array(json(doc)) FROM (SELECT ${obj(alias, columns)} AS doc FROM ${table} ${alias}
    WHERE ${where} ORDER BY ${order} LIMIT ${limit})))`;
}
const CASE_COLUMNS = "case_id workspace_id asset_id request_submission_id case_outcome latest_extraction_attempt_id latest_terms_version_id latest_quote_id latest_creator_decision_id latest_buyer_acceptance_id invoice_binding_id permission_id verification_record_id row_version";
const sources: Record<string, string> = {
  case: obj("c", CASE_COLUMNS),
  workspace: one("creator_workspaces", "w", "workspace_id display_name row_version", "w.workspace_id=c.workspace_id"),
  asset: one("assets", "a", "asset_id workspace_id title asset_type creator_display_name fingerprint_algorithm fingerprint_value row_version", "a.asset_id=c.asset_id"),
  request: one("request_submissions", "r", "request_submission_id case_id buyer_organization intended_use_text consent_acknowledged submitted_at", "r.request_submission_id=c.request_submission_id"),
  binding: one("invoice_bindings", "b", "invoice_binding_id case_id terms_version_id quote_id buyer_acceptance_id provider environment provider_invoice_id invoice_status row_version", "b.invoice_binding_id=c.invoice_binding_id"),
  permission: one("permissions", "p", "permission_id case_id invoice_binding_id terms_version_id permission_state state_reason_code start_date end_date_exclusive state_effective_at review_required row_version", "p.permission_id=c.permission_id"),
  verification: one("verification_records", "v", "verification_record_id case_id public_verification_id current_status current_receipt_revision_id row_version", "v.verification_record_id=c.verification_record_id"),
  terms: one("terms_versions", "t", "terms_version_id case_id version_number resolution_status use_purpose channels_json paid_advertising territories_json start_date duration_days max_impressions exclusivity modification_scope attribution sublicensing ai_use source_kind terms_hash created_by_actor created_at", "t.terms_version_id=c.latest_terms_version_id"),
  quote: one("quotes", "q", "quote_id case_id terms_version_id pricing_policy_id pricing_policy_version amount_cents currency status calculation_hash created_at", "q.quote_id=c.latest_quote_id"),
  policy: one("pricing_policy_versions", "y", "pricing_policy_id workspace_id version_number rules_json policy_hash currency",
    "y.pricing_policy_id=(SELECT pricing_policy_id FROM quotes WHERE quote_id=c.latest_quote_id) AND y.version_number=(SELECT pricing_policy_version FROM quotes WHERE quote_id=c.latest_quote_id)"),
  decision: one("creator_decisions", "d", "creator_decision_id case_id terms_version_id quote_id decision decided_at", "d.creator_decision_id=c.latest_creator_decision_id"),
  acceptance: one("buyer_acceptances", "a", "buyer_acceptance_id case_id terms_version_id quote_id creator_decision_id acceptance_copy_version accepted_at", "a.buyer_acceptance_id=c.latest_buyer_acceptance_id"),
  lines: many("quote_lines", "l", "quote_id line_position line_code description amount_cents", "l.quote_id=c.latest_quote_id", "l.line_position", 33),
  evidence: many("payment_evidence", "e", "payment_evidence_id invoice_binding_id evidence_source source_reference payment_status amount_cents currency observed_at evidence_hash",
    "e.invoice_binding_id=c.invoice_binding_id", "e.payment_status,e.observed_at,e.payment_evidence_id", 101),
  financial: one("paypal_lifecycle_observations", "f", "invoice_binding_id generation conclusion paid_cents refunded_cents detail_sha256 observed_at", "f.invoice_binding_id=c.invoice_binding_id", "ORDER BY f.generation DESC"),
  outbox: one("paypal_reconciliation_outbox", "o", "invoice_binding_id requested_generation completed_generation lease_token blocked_code", "o.invoice_binding_id=c.invoice_binding_id"),
  extractions: many("extraction_attempts", "e", "extraction_attempt_id case_id attempt_number status extractor_version model_id model_version artifact_hash input_hash completed_at",
    "e.case_id=c.case_id AND e.status='completed'", "e.attempt_number,e.extraction_attempt_id", 129),
  audit: many("audit_events", "u", "audit_event_id case_id aggregate_type aggregate_id aggregate_sequence event_type actor_type actor_reference payload_json correlation_id idempotency_key created_at",
    "u.case_id=c.case_id", "u.created_at,u.audit_event_id", 1025),
};
const ROOT_JSON = `json_object(${Object.entries(sources).map(([k, sql]) => `'${k}',${sql}`).join(",")})`;
const CHAIN_JSON = `(SELECT json_group_array(json(doc)) FROM (SELECT json_object(
  'id',r.receipt_revision_id,'verificationId',r.verification_record_id,'permissionId',r.permission_id,
  'revision',r.revision_number,'schema',r.schema_version,'previousHash',r.previous_revision_hash,
  'canonical',r.canonical_payload_json,'hash',r.payload_hash,'materialHash',r.material_sha256,
  'auditRootHash',r.audit_root_sha256,'createdAt',r.created_at) AS doc
  FROM receipt_revisions r WHERE r.verification_record_id=c.verification_record_id ORDER BY r.revision_number LIMIT 257))`;
export const RECEIPT_SNAPSHOT_GUARD = `(SELECT ${ROOT_JSON} FROM licensing_cases c WHERE c.case_id=?)=?
  AND (SELECT ${CHAIN_JSON} FROM licensing_cases c WHERE c.case_id=?)=?`;
function checked(results: readonly { success: boolean; meta?: { changes?: number } }[], exact: readonly boolean[]) {
  if (results.length !== exact.length || results.some((r, i) => !r.success || (exact[i] ? r.meta?.changes !== 1 : ![0, 1].includes(r.meta?.changes ?? -1)))) {
    throw new Error("Receipt transaction unavailable.");
  }
}
export function createD1ReceiptStore(db: ReceiptDatabase): ReceiptStore {
  return {
    async load(caseId) {
      id(caseId);
      const result = await db.prepare(`SELECT ${ROOT_JSON} AS sourceJson,${CHAIN_JSON} AS chainJson FROM licensing_cases c WHERE c.case_id=?`)
        .bind(caseId).first<{ sourceJson: string; chainJson: string }>();
      if (!result) return null;
      if (result.sourceJson.length > 2_000_000 || result.chainJson.length > 16_000_000) throw new Error("Receipt source exceeds bounds.");
      return { ...result, root: row(JSON.parse(result.sourceJson)), chain: JSON.parse(result.chainJson) as StoredReceipt[] };
    },
    async commit(input: ReceiptCommit) {
      const r = input.record;
      const results = await db.batch([
        db.prepare(`INSERT INTO receipt_revisions(receipt_revision_id,verification_record_id,permission_id,
          revision_number,schema_version,previous_revision_hash,canonical_payload_json,payload_hash,created_at,material_sha256,audit_root_sha256)
          VALUES (?,(SELECT verification_record_id FROM verification_records WHERE verification_record_id=? AND case_id=? AND ${RECEIPT_SNAPSHOT_GUARD}),?,?,?,?,?,?,?,?,?)`)
          .bind(r.id, r.verificationId, input.caseId, input.caseId, input.sourceJson, input.caseId, input.expectedChainJson,
            r.permissionId, r.revision, r.schema, r.previousHash, r.canonical, r.hash, r.createdAt, r.materialHash, r.auditRootHash),
        db.prepare(`UPDATE verification_records SET current_receipt_revision_id=?,current_status=?,updated_at=?,row_version=row_version+1
          WHERE verification_record_id=? AND case_id=?`).bind(r.id, input.state, r.createdAt, r.verificationId, input.caseId),
        db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
          actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
          VALUES (?,?,'rights_receipt',?,?,'receipt.revision_issued','system','receipt-service',?,?,?,?)`)
          .bind(input.auditId, input.caseId, r.verificationId, r.revision, JSON.stringify({ receipt_revision_id: r.id,
            payload_sha256: r.hash, previous_revision_hash: r.previousHash, material_sha256: r.materialHash,
            audit_root_sha256: r.auditRootHash, environment: "sandbox" }), r.id, `receipt:${r.verificationId}:${r.revision}`, r.createdAt),
      ]);
      checked(results, [true, true, true]);
    },
    async restore(caseId, snapshot, record, state, at) {
      const v = row(snapshot.root.verification);
      if (v.current_status === state) {
        const current = await db.prepare(`SELECT 1 AS ok WHERE ${RECEIPT_SNAPSHOT_GUARD}`).bind(caseId, snapshot.sourceJson, caseId, snapshot.chainJson).first();
        if (!current) throw new Error("Receipt source changed.");
        return;
      }
      const results = await db.batch([
        db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
          actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
          VALUES (?,(SELECT case_id FROM licensing_cases WHERE case_id=? AND ${RECEIPT_SNAPSHOT_GUARD}),
          'receipt_verification',?,?,'receipt.verification_restored','system','receipt-service',?,?,?,?)`)
          .bind(crypto.randomUUID(), caseId, caseId, snapshot.sourceJson, caseId, snapshot.chainJson, record.verificationId,
            Number(v.row_version), JSON.stringify({ receipt_revision_id: record.id, payload_sha256: record.hash }), record.id,
            `receipt-restore:${record.id}:${v.row_version}`, at),
        db.prepare(`UPDATE verification_records SET current_status=?,updated_at=?,row_version=row_version+1
          WHERE verification_record_id=? AND current_receipt_revision_id=? AND row_version=?`)
          .bind(state, at, record.verificationId, record.id, Number(v.row_version)),
      ]);
      checked(results, [true, true]);
    },
    async invalidate(caseId, snapshot, code, at) {
      if (!snapshot.root.verification) return;
      const v = row(snapshot.root.verification);
      const key = `receipt-integrity:${v.verification_record_id}:${snapshot.chain.at(-1)?.hash ?? "empty"}:${code}`;
      const results = await db.batch([
        db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
          actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
          VALUES (?,(SELECT case_id FROM licensing_cases WHERE case_id=? AND ${RECEIPT_SNAPSHOT_GUARD}),
          'receipt_integrity',?,?,'receipt.integrity_failed','system','receipt-service',?,?,?,?) ON CONFLICT DO NOTHING`)
          .bind(crypto.randomUUID(), caseId, caseId, snapshot.sourceJson, caseId, snapshot.chainJson,
            String(v.verification_record_id), Number(v.row_version), JSON.stringify({ code, valid: false }),
            crypto.randomUUID(), key, at),
        db.prepare(`UPDATE verification_records SET current_status='invalid',updated_at=?,row_version=row_version+1
          WHERE verification_record_id=? AND row_version=? AND current_status!='invalid'`)
          .bind(at, String(v.verification_record_id), Number(v.row_version)),
      ]);
      checked(results, [false, false]);
    },
  };
}
/** Server-only reservation of a cryptographically random public reference. It is
 * not a capability, not a receipt, and conveys no payment or ownership proof.
 */
export async function reserveReceiptVerification(db: ReceiptDatabase, caseId: string, expectedCaseVersion: number, at: string) {
  id(caseId); instant(at);
  if (!Number.isSafeInteger(expectedCaseVersion) || expectedCaseVersion < 1) throw new Error("Invalid case revision.");
  const verificationId = crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const publicId = btoa(String.fromCharCode(...bytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
  const results = await db.batch([
    db.prepare(`INSERT INTO verification_records(verification_record_id,case_id,public_verification_id,current_status,created_at,updated_at)
      VALUES (?,(SELECT case_id FROM licensing_cases WHERE case_id=? AND row_version=? AND verification_record_id IS NULL),?,'pending',?,?)`)
      .bind(verificationId, caseId, expectedCaseVersion, publicId, at, at),
    db.prepare(`UPDATE licensing_cases SET verification_record_id=?,updated_at=?,row_version=row_version+1
      WHERE case_id=? AND row_version=? AND verification_record_id IS NULL`).bind(verificationId, at, caseId, expectedCaseVersion),
  ]);
  checked(results, [true, true]); return Object.freeze({ verificationId, publicId });
}
