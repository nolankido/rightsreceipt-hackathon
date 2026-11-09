/** Exact source fencing and atomic evidence/terms persistence. No provider path. */
import { CONSENT_ROOT_SQL, type ConsentDatabase, type ConsentStatement } from "./human-consent";
import type { AnswerCommit, ClarificationStore, ReviewCommit } from "../../application/src/clarification-contract";
function obj(alias: string, columns: string) {
  return `json_object(${columns.split(" ").map(c => `'${c}',${alias}.${c}`).join(",")})`;
}
function one(table: string, alias: string, columns: string, where: string) {
  return `json((SELECT ${obj(alias, columns)} FROM ${table} ${alias} WHERE ${where} LIMIT 1))`;
}
function many(table: string, alias: string, columns: string, where: string, order: string, max = 65) {
  return `json((SELECT json_group_array(json(doc)) FROM (SELECT ${obj(alias, columns)} doc FROM ${table} ${alias}
    WHERE ${where} ORDER BY ${order} LIMIT ${max})))`;
}
const SOURCES: Record<string, string> = {
  consent: `json(${CONSENT_ROOT_SQL})`,
  originalRequest: one("request_submissions", "r", "request_submission_id case_id intended_use_text consent_copy_version consent_acknowledged submitted_at", "r.request_submission_id=c.request_submission_id"),
  extractionId: "c.latest_extraction_attempt_id",
  decisionReason: "(SELECT reason_text FROM creator_decisions WHERE creator_decision_id=c.latest_creator_decision_id)",
  observations: many("field_observations", "f", "field_name normalized_value_json resolution_state provenance resolver_version", "f.extraction_attempt_id=c.latest_extraction_attempt_id", "f.field_name", 13),
  assignedPolicy: one("pricing_policy_versions", "p", "pricing_policy_id workspace_id version_number policy_name currency rules_json policy_hash status",
    "p.pricing_policy_id=(SELECT default_pricing_policy_id FROM creator_workspaces WHERE workspace_id=c.workspace_id) AND p.version_number=(SELECT default_pricing_policy_version FROM creator_workspaces WHERE workspace_id=c.workspace_id)"),
  rounds: many("clarification_rounds", "z", "clarification_round_id case_id round_number status created_at closed_at", "z.case_id=c.case_id", "z.round_number", 17),
  questions: many("clarification_questions", "q", "clarification_question_id clarification_round_id field_name question_order question_text reason_code created_at", "q.clarification_round_id IN(SELECT clarification_round_id FROM clarification_rounds WHERE case_id=c.case_id)", "q.clarification_round_id,q.question_order", 209),
  answers: many("clarification_answers", "a", "clarification_answer_id clarification_question_id answer_text answered_at", "a.clarification_question_id IN(SELECT clarification_question_id FROM clarification_questions WHERE clarification_round_id IN(SELECT clarification_round_id FROM clarification_rounds WHERE case_id=c.case_id))", "a.clarification_question_id", 209),
  submissions: many("clarification_submissions", "s", "submission_id clarification_round_id case_id buyer_capability_id source_case_version source_terms_version_id source_creator_decision_id plan_json plan_hash answers_hash request_id command_hash copy_version copy_hash submitted_at", "s.case_id=c.case_id", "s.source_case_version", 17),
  reviews: many("clarification_reviews", "r", "review_id case_id submission_id terms_version_id quote_id source_case_version source_review_hash request_id command_hash actor_reference copy_version copy_hash created_at", "r.case_id=c.case_id", "r.source_case_version", 65),
  audits: many("audit_events", "e", "audit_event_id case_id aggregate_id event_type actor_type actor_reference payload_json idempotency_key created_at", "e.case_id=c.case_id AND e.aggregate_type='clarification'", "e.created_at,e.audit_event_id", 81),
  termHashes: many("terms_versions", "t", "terms_version_id terms_hash", "t.case_id=c.case_id", "t.version_number", 65),
  quotes: many("quotes", "q", "quote_id terms_version_id quote_version_number pricing_policy_id pricing_policy_version amount_cents currency status calculation_hash created_at", "q.case_id=c.case_id", "q.quote_version_number", 65),
  quoteLines: many("quote_lines", "l", "quote_id line_position line_code description amount_cents", "l.quote_id IN(SELECT quote_id FROM quotes WHERE case_id=c.case_id)", "l.quote_id,l.line_position", 2081),
  nextAttempt: "(SELECT COALESCE(MAX(attempt_number),0)+1 FROM extraction_attempts WHERE case_id=c.case_id)",
  nextTerms: "(SELECT COALESCE(MAX(version_number),0)+1 FROM terms_versions WHERE case_id=c.case_id)",
  nextQuote: "(SELECT COALESCE(MAX(quote_version_number),0)+1 FROM quotes WHERE case_id=c.case_id)",
};
export const CLARIFICATION_ROOT_SQL = `json_object(${Object.entries(SOURCES).map(([name, sql]) => `'${name}',${sql}`).join(",")})`;
export function createD1ClarificationStore(db: ConsentDatabase): ClarificationStore {
  function guard(i: AnswerCommit | ReviewCommit, buyer: boolean): ConsentStatement {
    const check = buyer ? `EXISTS(SELECT 1 FROM buyer_capabilities k WHERE k.case_id=c.case_id
      AND k.buyer_capability_id=? AND k.token_digest_sha256=arg.digest AND k.revoked_at IS NULL
      AND k.issued_at<=? AND k.expires_at>? AND EXISTS(SELECT 1 FROM json_each(k.allowed_actions_json) WHERE value='clarify'))` : "1=1";
    const args: (string | number | null)[] = [i.auditId, i.digest, i.caseId, i.snapshot.sourceJson, i.command.expectedCaseVersion, i.workspaceId];
    if (buyer) args.push(i.capabilityId, i.at, i.at);
    args.push(i.resultId, buyer ? "clarification.answers_submitted" : "clarification.terms_reviewed", buyer ? "buyer" : "creator",
      i.actorReference, i.auditPayload, i.command.requestId, `clarification:${buyer ? "buyer" : "creator"}:${i.command.requestId}`, i.at);
    return db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
      actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
      VALUES(?,(SELECT c.case_id FROM licensing_cases c,(SELECT ? AS digest) arg WHERE c.case_id=? AND ${CLARIFICATION_ROOT_SQL}=?
        AND c.row_version=? AND c.workspace_id=? AND c.case_outcome='open' AND ${check}),'clarification',?,1,?,?,?,?,?,?,?)`).bind(...args);
  }
  function clear(i: AnswerCommit | ReviewCommit, termsId: string | null, attemptId: string | null, quoteId: string | null) {
    return db.prepare(`UPDATE licensing_cases SET latest_terms_version_id=?,latest_extraction_attempt_id=?,latest_quote_id=?,
      latest_creator_decision_id=NULL,latest_buyer_acceptance_id=NULL,row_version=row_version+1,updated_at=? WHERE case_id=? AND row_version=?`)
      .bind(termsId, attemptId, quoteId, i.at, i.caseId, i.command.expectedCaseVersion);
  }
  async function commit(statements: readonly ConsentStatement[]) {
    const result = await db.batch(statements);
    if (result.length !== statements.length || result.some(r => !r.success) || result[0]?.meta?.changes !== 1
      || result.at(-1)?.meta?.changes !== 1) throw new Error("Clarification transaction unavailable.");
  }
  return {
    async findBuyerCase(digest) {
      const r = await db.prepare("SELECT case_id AS caseId FROM buyer_capabilities WHERE token_digest_sha256=?").bind(digest).first<{ caseId: string }>();
      return r?.caseId ?? null;
    },
    async load(caseId, digest) {
      const r = await db.prepare(`SELECT ${CLARIFICATION_ROOT_SQL} AS sourceJson FROM licensing_cases c,(SELECT ? AS digest) arg WHERE c.case_id=?`)
        .bind(digest, caseId).first<{ sourceJson: string }>();
      if (!r) return null;
      if (r.sourceJson.length > 1_048_576) throw new Error("Clarification snapshot exceeds bounds.");
      return { sourceJson: r.sourceJson, root: JSON.parse(r.sourceJson) as Record<string, unknown> };
    },
    async check(snapshot, caseId, digest, at) {
      const found = await db.prepare(`SELECT CASE WHEN arg.digest IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM buyer_capabilities k WHERE k.case_id=c.case_id AND k.token_digest_sha256=arg.digest
          AND k.revoked_at IS NULL AND k.issued_at<=? AND k.expires_at>?
          AND EXISTS(SELECT 1 FROM json_each(k.allowed_actions_json) WHERE value='clarify')) THEN 'unauthorized'
        WHEN ${CLARIFICATION_ROOT_SQL}=? THEN 'current' ELSE 'stale' END AS result
        FROM licensing_cases c,(SELECT ? AS digest) arg WHERE c.case_id=?`)
        .bind(at, at, snapshot.sourceJson, digest, caseId).first<{ result: "current" | "stale" | "unauthorized" }>();
      return found?.result ?? (digest === null ? "stale" : "unauthorized");
    },
    async commitAnswers(i) {
      const statements = [guard(i, true), db.prepare(`INSERT INTO clarification_rounds(clarification_round_id,case_id,round_number,status,created_at,closed_at)
        VALUES(?,?,?,'answered',?,?)`).bind(i.roundId, i.caseId, i.roundNumber, i.at, i.at)];
      i.questions.forEach((q, n) => {
        const questionId = crypto.randomUUID();
        statements.push(db.prepare(`INSERT INTO clarification_questions(clarification_question_id,clarification_round_id,field_name,
          question_order,question_text,reason_code,created_at) VALUES(?,?,?,?,?,?,?)`)
          .bind(questionId, i.roundId, q.fieldName, n + 1, q.question, q.reason === "ambiguous" ? "missing" : q.reason, i.at));
        statements.push(db.prepare(`INSERT INTO clarification_answers(clarification_answer_id,clarification_question_id,answer_text,answered_at)
          VALUES(?,?,?,?)`).bind(crypto.randomUUID(), questionId, i.command.answers[n]!.answerText, i.at));
      });
      statements.push(db.prepare(`INSERT INTO clarification_submissions(submission_id,clarification_round_id,case_id,buyer_capability_id,
        source_case_version,source_terms_version_id,source_creator_decision_id,plan_json,plan_hash,answers_hash,request_id,command_hash,copy_version,copy_hash,submitted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(i.resultId, i.roundId, i.caseId, i.capabilityId,
        i.command.expectedCaseVersion, i.sourceTermsVersionId, i.sourceCreatorDecisionId, i.planJson, i.planHash, i.answersHash,
        i.command.requestId, i.commandHash, i.command.copyVersion, i.copyHash, i.at));
      statements.push(db.prepare("UPDATE quotes SET status='superseded' WHERE case_id=? AND status='current'").bind(i.caseId));
      statements.push(clear(i, i.sourceTermsVersionId, i.snapshot.root.extractionId as string | null, null));
      await commit(statements);
    },
    async commitReview(i) {
      const statements = [guard(i, false)];
      if (i.revision) {
        const a = i.revision.extractionAttempt, t = i.terms;
        statements.push(db.prepare(`INSERT INTO extraction_attempts(extraction_attempt_id,case_id,attempt_number,status,extractor_version,
          model_id,model_version,artifact_hash,input_hash,started_at,completed_at,error_code) VALUES(?,?,?,'completed','manual-review-v1',NULL,NULL,NULL,?,?,?,NULL)`)
          .bind(a.extractionAttemptId, i.caseId, a.attemptNumber, a.inputHash, i.at, i.at));
        for (const o of i.revision.observations) statements.push(db.prepare(`INSERT INTO field_observations(field_observation_id,
          extraction_attempt_id,field_name,normalized_value_json,resolution_state,provenance,confidence_basis_points,evidence_start_utf16,
          evidence_end_utf16,evidence_text,resolver_version,created_at) VALUES(?,?,?,?,?,'human',NULL,NULL,NULL,NULL,'manual-review-v1',?)`)
          .bind(o.fieldObservationId, o.extractionAttemptId, o.fieldName, o.normalizedValueJson, o.resolutionState, i.at));
        statements.push(db.prepare(`INSERT INTO terms_versions(terms_version_id,case_id,version_number,resolution_status,use_purpose,
          channels_json,paid_advertising,territories_json,start_date,duration_days,max_impressions,exclusivity,modification_scope,attribution,
          sublicensing,ai_use,source_kind,terms_hash,created_by_actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'human_corrected',?,'creator',?)`)
          .bind(t.termsVersionId, i.caseId, t.versionNumber, t.resolutionStatus, t.usePurpose, t.channels ? JSON.stringify(t.channels) : null,
            t.paidAdvertising === true ? 1 : null, t.territories ? JSON.stringify(t.territories) : null, t.startDate, t.durationDays,
            t.maxImpressions, t.exclusivity, t.modificationScope, t.attribution, t.sublicensing, t.aiUse, t.termsHash, i.at));
      }
      statements.push(db.prepare("UPDATE quotes SET status='superseded' WHERE case_id=? AND status='current'").bind(i.caseId));
      if (i.quote) {
        const q = i.quote, c = q.calculated;
        if (q.reuse) statements.push(db.prepare("UPDATE quotes SET status='current' WHERE quote_id=? AND case_id=? AND calculation_hash=?")
          .bind(q.quoteId, i.caseId, q.calculationHash));
        else {
          statements.push(db.prepare(`INSERT INTO quotes(quote_id,case_id,quote_version_number,terms_version_id,pricing_policy_id,
            pricing_policy_version,amount_cents,currency,status,calculation_hash,created_at) VALUES(?,?,?,?,?,?,?,'USD','current',?,?)`)
            .bind(q.quoteId, i.caseId, q.quoteVersion, i.terms.termsVersionId, c.pricingPolicyId, c.pricingPolicyVersion, c.totalCents, q.calculationHash, i.at));
          c.lineItems.forEach((line, n) => statements.push(db.prepare(`INSERT INTO quote_lines(quote_line_id,quote_id,line_position,
            line_code,description,amount_cents,created_at) VALUES(?,?,?,?,?,?,?)`)
            .bind(crypto.randomUUID(), q.quoteId, n + 1, line.code, line.description, line.amountCents, i.at)));
        }
      }
      statements.push(db.prepare(`INSERT INTO clarification_reviews(review_id,case_id,submission_id,terms_version_id,quote_id,
        source_case_version,source_review_hash,request_id,command_hash,actor_reference,copy_version,copy_hash,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(i.resultId, i.caseId, i.command.submissionId, i.terms.termsVersionId, i.quote?.quoteId ?? null,
        i.command.expectedCaseVersion, i.command.reviewHash, i.command.requestId, i.commandHash, i.actorReference,
        i.command.copyVersion, i.copyHash, i.at));
      statements.push(clear(i, i.terms.termsVersionId, i.revision?.extractionAttempt.extractionAttemptId ?? i.snapshot.root.extractionId as string | null,
        i.quote?.quoteId ?? null));
      await commit(statements);
    },
  };
}
