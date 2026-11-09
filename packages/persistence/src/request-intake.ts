/** Exact asset and case snapshots fence atomic request intake without storing a raw capability. */
import type { IntakeSnapshot, RequestIntakeStore } from "../../application/src/request-intake-contract";
import type { ConsentDatabase, ConsentStatement } from "./human-consent";
function obj(alias: string, columns: string) {
  return `json_object(${columns.split(" ").map(c => `'${c}',${alias}.${c}`).join(",")})`;
}
const ASSET_COLUMNS = "asset_id workspace_id title asset_type creator_display_name provenance_note fingerprint_algorithm fingerprint_value preview_reference availability created_at updated_at row_version";
const WORKSPACE_COLUMNS = "workspace_id display_name mode default_pricing_policy_id default_pricing_policy_version created_at updated_at row_version";
const CASE_COLUMNS = "case_id workspace_id asset_id request_submission_id case_outcome latest_extraction_attempt_id latest_terms_version_id latest_quote_id latest_creator_decision_id latest_buyer_acceptance_id invoice_binding_id permission_id verification_record_id created_at updated_at row_version";
const AUDIT_COLUMNS = "audit_event_id case_id aggregate_type aggregate_id aggregate_sequence event_type actor_type actor_reference payload_json correlation_id idempotency_key created_at";
export const INTAKE_ASSET_SQL = `json_object('asset',${obj("a", ASSET_COLUMNS)},'workspace',${obj("w", WORKSPACE_COLUMNS)})`;
const TABLES = ["request_submissions", "extraction_attempts", "terms_versions", "quotes", "creator_decisions", "buyer_acceptances",
  "clarification_rounds", "clarification_submissions", "clarification_reviews", "invoice_bindings", "payment_operations", "permissions", "verification_records"];
export const INTAKE_CASE_SQL = `json_object(
  'assetSource',json((SELECT ${INTAKE_ASSET_SQL} FROM assets a JOIN creator_workspaces w ON w.workspace_id=a.workspace_id WHERE a.asset_id=c.asset_id)),
  'case',${obj("c", CASE_COLUMNS)},
  'capability',json((SELECT ${obj("k", "buyer_capability_id case_id token_digest_sha256 allowed_actions_json issued_at expires_at revoked_at rotation_number")}
    FROM buyer_capabilities k WHERE k.case_id=c.case_id AND k.token_digest_sha256=arg.digest)),
  'request',json((SELECT ${obj("r", "request_submission_id case_id buyer_name buyer_organization buyer_email intended_use_text normalized_text consent_copy_version consent_acknowledged submitted_at")}
    FROM request_submissions r WHERE r.request_submission_id=c.request_submission_id)),
  'audits',json((SELECT json_group_array(json(doc)) FROM (SELECT ${obj("e", AUDIT_COLUMNS)} doc FROM audit_events e
    WHERE e.case_id=c.case_id AND e.aggregate_type='request_intake' ORDER BY e.created_at,e.audit_event_id LIMIT 3))),
  'counts',json_object(${TABLES.map(t => `'${t}',(SELECT COUNT(*) FROM ${t} WHERE case_id=c.case_id)`).join(",")}),
  'capabilityCount',(SELECT COUNT(*) FROM buyer_capabilities WHERE case_id=c.case_id),
  'receiptCount',(SELECT COUNT(*) FROM receipt_revisions WHERE verification_record_id IN(SELECT verification_record_id FROM verification_records WHERE case_id=c.case_id)))`;
function snapshot(row: { sourceJson: string } | null): IntakeSnapshot | null {
  if (!row) return null;
  if (row.sourceJson.length > 131072) throw new Error("Request intake source exceeds bounds.");
  return { sourceJson: row.sourceJson, root: JSON.parse(row.sourceJson) as Record<string, unknown> };
}
export function createD1RequestIntakeStore(db: ConsentDatabase): RequestIntakeStore {
  async function commit(statements: readonly ConsentStatement[]) {
    const result = await db.batch(statements);
    if (result.length !== statements.length || result.some(r => !r.success || r.meta?.changes !== 1)) {
      throw new Error("Request intake transaction unavailable.");
    }
  }
  return {
    async loadAsset(assetId) {
      return snapshot(await db.prepare(`SELECT ${INTAKE_ASSET_SQL} AS sourceJson FROM assets a
        JOIN creator_workspaces w ON w.workspace_id=a.workspace_id WHERE a.asset_id=?`).bind(assetId).first<{ sourceJson: string }>());
    },
    async checkAsset(s, assetId) {
      const found = await db.prepare(`SELECT 1 AS current FROM assets a JOIN creator_workspaces w ON w.workspace_id=a.workspace_id
        WHERE a.asset_id=? AND ${INTAKE_ASSET_SQL}=? AND a.availability='active'`).bind(assetId, s.sourceJson).first<{ current: number }>();
      return found?.current === 1;
    },
    async findBuyerCase(digest) {
      const found = await db.prepare("SELECT case_id AS caseId FROM buyer_capabilities WHERE token_digest_sha256=?")
        .bind(digest).first<{ caseId: string }>();
      return found?.caseId ?? null;
    },
    async loadCase(caseId, digest) {
      return snapshot(await db.prepare(`SELECT ${INTAKE_CASE_SQL} AS sourceJson FROM licensing_cases c,(SELECT ? AS digest) arg WHERE c.case_id=?`)
        .bind(digest, caseId).first<{ sourceJson: string }>());
    },
    async checkCase(s, caseId, digest, at) {
      const found = await db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM buyer_capabilities k
        WHERE k.case_id=c.case_id AND k.token_digest_sha256=arg.digest AND k.revoked_at IS NULL AND k.issued_at<=? AND k.expires_at>?
          AND EXISTS(SELECT 1 FROM json_each(k.allowed_actions_json) WHERE value='submit_request')) THEN 'unauthorized'
        WHEN ${INTAKE_CASE_SQL}=? THEN 'current' ELSE 'stale' END AS result
        FROM licensing_cases c,(SELECT ? AS digest) arg WHERE c.case_id=?`)
        .bind(at, at, s.sourceJson, digest, caseId).first<{ result: "current" | "stale" | "unauthorized" }>();
      return found?.result ?? "unauthorized";
    },
    async findCommand(requestId) {
      return await db.prepare(`SELECT ${obj("e", AUDIT_COLUMNS)} AS sourceJson FROM audit_events e WHERE e.audit_event_id=?`)
        .bind(requestId).first<{ sourceJson: string }>().then(found => found ? JSON.parse(found.sourceJson) as Record<string, unknown> : null);
    },
    async commitLink(i) {
      await commit([
        db.prepare(`INSERT INTO licensing_cases(case_id,workspace_id,asset_id,case_outcome,created_at,updated_at,row_version)
          VALUES(?,(SELECT a.workspace_id FROM assets a JOIN creator_workspaces w ON w.workspace_id=a.workspace_id
            WHERE a.asset_id=? AND a.workspace_id=? AND a.row_version=? AND a.availability='active' AND ${INTAKE_ASSET_SQL}=?),?,'open',?,?,1)`)
          .bind(i.caseId, i.assetId, i.workspaceId, i.command.expectedAssetVersion, i.snapshot.sourceJson, i.assetId, i.at, i.at),
        db.prepare(`INSERT INTO buyer_capabilities(buyer_capability_id,case_id,token_digest_sha256,allowed_actions_json,issued_at,expires_at,revoked_at,rotation_number)
          VALUES(?,?,?,'["submit_request","clarify","review","receipt"]',?,?,NULL,1)`)
          .bind(i.capabilityId, i.caseId, i.command.tokenDigestSha256, i.at, i.expiresAt),
        // A command UUID is the globally unique audit primary key, including across new cases.
        db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
          actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
          VALUES(?,?,'request_intake',?,1,'request_intake.link_issued','creator',?,?,?, ?,?)`)
          .bind(i.command.requestId, i.caseId, i.capabilityId, i.actorReference, i.auditPayload, i.command.requestId,
            `request-intake:link:${i.command.requestId}`, i.at),
      ]);
    },
    async commitRequest(i) {
      const r = i.record;
      await commit([
        db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
          actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
          VALUES(?,(SELECT c.case_id FROM licensing_cases c,(SELECT ? AS digest) arg WHERE c.case_id=? AND c.workspace_id=?
            AND c.row_version=? AND c.request_submission_id IS NULL AND c.case_outcome='open' AND ${INTAKE_CASE_SQL}=?
            AND EXISTS(SELECT 1 FROM buyer_capabilities k WHERE k.case_id=c.case_id AND k.buyer_capability_id=?
              AND k.token_digest_sha256=arg.digest AND k.revoked_at IS NULL AND k.issued_at<=? AND k.expires_at>?
              AND EXISTS(SELECT 1 FROM json_each(k.allowed_actions_json) WHERE value='submit_request'))),
            'request_intake',?,1,'request_intake.request_submitted','buyer',?,?,?,?,?)`)
          .bind(i.command.requestId, i.digest, r.caseId, i.workspaceId, i.command.expectedCaseVersion, i.snapshot.sourceJson,
            i.capabilityId, i.checkAt, i.checkAt, r.requestSubmissionId, `buyer-capability:${i.capabilityId}`, i.auditPayload,
            i.command.requestId, `request-intake:request:${i.command.requestId}`, i.at),
        db.prepare(`INSERT INTO request_submissions(request_submission_id,case_id,buyer_name,buyer_organization,buyer_email,
          intended_use_text,normalized_text,consent_copy_version,consent_acknowledged,submitted_at) VALUES(?,?,?,?,?,?,?,?,1,?)`)
          .bind(r.requestSubmissionId, r.caseId, r.buyerName, r.buyerOrganization, r.buyerEmail, r.intendedUseText, r.normalizedText,
            r.consentCopyVersion, r.submittedAt),
        db.prepare(`UPDATE licensing_cases SET request_submission_id=?,row_version=row_version+1,updated_at=?
          WHERE case_id=? AND row_version=? AND request_submission_id IS NULL`)
          .bind(r.requestSubmissionId, i.at, r.caseId, i.command.expectedCaseVersion),
      ]);
    },
  };
}
