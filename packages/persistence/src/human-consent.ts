/** D1-shaped consent persistence. An exact source snapshot and final capability
 * check fence the FIRST write. A failed fence aborts the entire batch, not just
 * a zero-row UPDATE. Audit uniqueness provides durable command idempotency.
 */
import type { BuyerConsentCommand, ConsentCommit, ConsentStore, CreatorConsentCommand } from "../../application/src/consent-contract";
export interface ConsentStatement {
  bind(...values: readonly (string | number | null)[]): ConsentStatement;
  first<T>(): Promise<T | null>;
}
export interface ConsentDatabase {
  prepare(sql: string): ConsentStatement;
  batch(statements: readonly ConsentStatement[]): Promise<readonly { readonly success: boolean; readonly meta?: { readonly changes?: number } }[]>;
}
function obj(alias: string, columns: string) {
  return `json_object(${columns.split(" ").map(c => `'${c}',${alias}.${c}`).join(",")})`;
}
function one(table: string, alias: string, columns: string, where: string) {
  return `json((SELECT ${obj(alias, columns)} FROM ${table} ${alias} WHERE ${where} LIMIT 1))`;
}
function many(table: string, alias: string, columns: string, where: string, order: string, max: number) {
  return `json((SELECT json_group_array(json(doc)) FROM (SELECT ${obj(alias, columns)} doc FROM ${table} ${alias}
    WHERE ${where} ORDER BY ${order} LIMIT ${max})))`;
}
const SOURCES: Record<string, string> = {
  case: obj("c", "case_id workspace_id asset_id request_submission_id case_outcome latest_terms_version_id latest_quote_id latest_creator_decision_id latest_buyer_acceptance_id invoice_binding_id permission_id verification_record_id row_version updated_at"),
  workspace: one("creator_workspaces", "w", "workspace_id default_pricing_policy_id default_pricing_policy_version row_version", "w.workspace_id=c.workspace_id"),
  asset: one("assets", "a", "asset_id workspace_id title creator_display_name fingerprint_value availability row_version", "a.asset_id=c.asset_id"),
  request: one("request_submissions", "r", "request_submission_id case_id buyer_email consent_acknowledged submitted_at", "r.request_submission_id=c.request_submission_id"),
  terms: one("terms_versions", "t", "terms_version_id case_id version_number resolution_status use_purpose channels_json paid_advertising territories_json start_date duration_days max_impressions exclusivity modification_scope attribution sublicensing ai_use source_kind terms_hash created_by_actor created_at", "t.terms_version_id=c.latest_terms_version_id"),
  quote: one("quotes", "q", "quote_id case_id quote_version_number terms_version_id pricing_policy_id pricing_policy_version amount_cents currency status calculation_hash created_at", "q.quote_id=c.latest_quote_id"),
  policy: one("pricing_policy_versions", "p", "pricing_policy_id workspace_id version_number policy_name currency rules_json policy_hash status",
    "p.pricing_policy_id=(SELECT pricing_policy_id FROM quotes WHERE quote_id=c.latest_quote_id) AND p.version_number=(SELECT pricing_policy_version FROM quotes WHERE quote_id=c.latest_quote_id)"),
  lines: many("quote_lines", "l", "quote_id line_position line_code description amount_cents", "l.quote_id=c.latest_quote_id", "l.line_position", 33),
  decision: one("creator_decisions", "d", "creator_decision_id case_id terms_version_id quote_id decision actor_reference decided_at", "d.creator_decision_id=c.latest_creator_decision_id"),
  acceptance: one("buyer_acceptances", "b", "buyer_acceptance_id case_id terms_version_id quote_id creator_decision_id acceptance_copy_version accepted_at", "b.buyer_acceptance_id=c.latest_buyer_acceptance_id"),
  capability: one("buyer_capabilities", "k", "buyer_capability_id case_id allowed_actions_json issued_at expires_at revoked_at rotation_number", "k.case_id=c.case_id AND k.token_digest_sha256=arg.digest"),
  commands: many("audit_events", "u", "audit_event_id case_id aggregate_id event_type actor_type actor_reference payload_json idempotency_key created_at",
    "u.case_id=c.case_id AND u.aggregate_type='human_consent'", "u.created_at,u.audit_event_id", 129),
  invoiceCount: "(SELECT COUNT(*) FROM invoice_bindings WHERE case_id=c.case_id)",
  operationCount: "(SELECT COUNT(*) FROM payment_operations WHERE case_id=c.case_id)",
  permissionCount: "(SELECT COUNT(*) FROM permissions WHERE case_id=c.case_id)",
  receiptCount: "(SELECT COUNT(*) FROM receipt_revisions r JOIN verification_records v ON v.verification_record_id=r.verification_record_id WHERE v.case_id=c.case_id)",
};
export const CONSENT_ROOT_SQL = `json_object(${Object.entries(SOURCES).map(([name, sql]) => `'${name}',${sql}`).join(",")})`;
export function createD1HumanConsentStore(db: ConsentDatabase): ConsentStore {
  return {
    async load(caseId, digest) {
      const found = await db.prepare(`SELECT ${CONSENT_ROOT_SQL} AS sourceJson FROM licensing_cases c,(SELECT ? AS digest) arg WHERE c.case_id=?`)
        .bind(digest, caseId).first<{ sourceJson: string }>();
      if (!found) return null;
      if (found.sourceJson.length > 262144) throw new Error("Consent snapshot exceeds bounds.");
      return { sourceJson: found.sourceJson, root: JSON.parse(found.sourceJson) as Record<string, unknown> };
    },
    async findBuyerCase(digest) {
      const r = await db.prepare("SELECT case_id AS caseId FROM buyer_capabilities WHERE token_digest_sha256=?")
        .bind(digest).first<{ caseId: string }>();
      return r?.caseId ?? null;
    },
    async commit(i: ConsentCommit) {
      const creator = i.role === "creator", c = i.command;
      const checkBuyer = creator ? "1=1" : `EXISTS(SELECT 1 FROM buyer_capabilities k WHERE k.case_id=c.case_id
        AND k.buyer_capability_id=? AND k.token_digest_sha256=arg.digest AND k.revoked_at IS NULL
        AND k.issued_at<=? AND k.expires_at>? AND EXISTS(SELECT 1 FROM json_each(k.allowed_actions_json) WHERE value='review'))`;
      const decision = creator ? (c as CreatorConsentCommand).decision : "approved";
      const auditType = creator ? `creator.${decision}` : "buyer.accepted";
      const guardValues: (string | number | null)[] = [i.auditId, i.capabilityDigest, i.caseId, i.snapshot.sourceJson,
        c.expectedCaseVersion, i.workspaceId];
      if (!creator) guardValues.push(i.capabilityId, i.at, i.at);
      guardValues.push(i.resultId, auditType, i.role, i.actorReference, i.auditPayload, c.requestId, i.idempotencyKey, i.at);
      const statements = [db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,
        aggregate_sequence,event_type,actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
        VALUES (?,(SELECT c.case_id FROM licensing_cases c,(SELECT ? AS digest) arg WHERE c.case_id=? AND ${CONSENT_ROOT_SQL}=?
          AND c.row_version=? AND c.workspace_id=? AND c.case_outcome='open' AND ${checkBuyer}),
          'human_consent',?,1,?,?,?,?,?,?,?)`).bind(...guardValues)];
      if (creator) {
        statements.push(db.prepare(`INSERT INTO creator_decisions(creator_decision_id,case_id,terms_version_id,quote_id,
          decision,reason_text,actor_reference,decided_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(i.resultId, i.caseId, c.termsVersionId, c.quoteId, decision, (c as CreatorConsentCommand).reason, i.actorReference, i.at));
        statements.push(db.prepare(`UPDATE licensing_cases SET latest_creator_decision_id=?,latest_buyer_acceptance_id=NULL,
          case_outcome=?,updated_at=?,row_version=row_version+1 WHERE case_id=? AND row_version=?`)
          .bind(i.resultId, decision === "rejected" ? "rejected" : "open", i.at, i.caseId, c.expectedCaseVersion));
        statements.push(db.prepare(`UPDATE verification_records SET current_status=?,updated_at=?,row_version=row_version+1
          WHERE case_id=? AND current_receipt_revision_id IS NULL`)
          .bind(decision === "rejected" ? "rejected" : "pending", i.at, i.caseId));
      } else {
        statements.push(db.prepare(`INSERT INTO buyer_acceptances(buyer_acceptance_id,case_id,terms_version_id,quote_id,
          creator_decision_id,acceptance_copy_version,accepted_at) VALUES (?,?,?,?,?,?,?)`)
          .bind(i.resultId, i.caseId, c.termsVersionId, c.quoteId, (c as BuyerConsentCommand).creatorDecisionId, c.copyVersion, i.at));
        statements.push(db.prepare(`UPDATE licensing_cases SET latest_buyer_acceptance_id=?,updated_at=?,row_version=row_version+1
          WHERE case_id=? AND row_version=?`).bind(i.resultId, i.at, i.caseId, c.expectedCaseVersion));
      }
      const result = await db.batch(statements);
      if (result.length !== statements.length || result.some((r, n) => !r.success
        || (creator && n === 3 ? ![0, 1].includes(r.meta?.changes ?? -1) : r.meta?.changes !== 1))) {
        throw new Error("Consent transaction unavailable.");
      }
    },
  };
}
