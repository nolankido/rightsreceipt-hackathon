/** Immutable buyer evidence followed by explicit, version-bound human review. */
import {
  RIGHTS_FIELD_NAMES, RIGHTS_FIELD_LABELS, canonicalizeManualRightsReview, createManualTermsRevision,
  deriveTermsResolutionStatus, manualRightsReviewCanonicalJson,
  type ManualRightsReviewInput, type RightsFieldEdit, type RightsFieldName, type TermsVersionRecord,
} from "../../domain/src/rights-terms";
import { assessDeterministicRights } from "../../ai-runtime/src/deterministic";
import { buildClarificationPlan, type ClarificationFieldInput } from "../../ai-runtime/src/clarification";
import { calculateQuote, type PricingPolicyVersion } from "../../pricing/src/index";
import { canonicalHash, canonicalJson, parseCanonical, sha256Hex } from "../../receipts/src/canonical";
import type { CreatorPrincipal } from "./consent-contract";
import {
  ANSWER_COPY, ANSWER_COPY_VERSION, REVIEW_COPY, REVIEW_COPY_VERSION, ClarificationError, clarificationFail as fail,
  type Answer, type AnswerCommand, type ClarificationSnapshot, type ClarificationStore, type Question, type ReviewCommand,
  type ReviewCommit,
} from "./clarification-contract";
export { ANSWER_COPY, ANSWER_COPY_VERSION, REVIEW_COPY, REVIEW_COPY_VERSION, ClarificationError } from "./clarification-contract";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const FIELD_KEYS = [...RIGHTS_FIELD_NAMES, "additional_context"];
function row(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail("source_invalid"); return v as Record<string, unknown>;
}
function arr(v: unknown, max: number): Record<string, unknown>[] {
  if (!Array.isArray(v) || v.length > max) return fail("source_invalid"); return v.map(row);
}
function id(v: unknown): string { if (typeof v !== "string" || !UUID.test(v)) return fail("source_invalid"); return v; }
function int(v: unknown): number {
  if (!Number.isSafeInteger(v) || Number(v) < 1 || Number(v) >= Number.MAX_SAFE_INTEGER) return fail("source_invalid"); return Number(v);
}
function timestamp(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)
    || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) return fail("source_invalid"); return v;
}
function text(v: unknown, max: number, multiline = false): string {
  if (typeof v !== "string" || !v.length || v.length > max || v.trim() !== v
    || (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u : /[\x00-\x1f\x7f]/u).test(v)) return fail("source_invalid");
  canonicalJson(v); return v;
}
function exactKeys(v: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(v).sort().join() !== [...keys].sort().join()) fail("invalid_command");
}
function command(raw: unknown, buyer: boolean): AnswerCommand | ReviewCommand {
  try {
    const c = row(JSON.parse(canonicalJson(raw)));
    exactKeys(c, ["requestId", "expectedCaseVersion", "reviewHash", "confirmed", "copyVersion", ...(buyer ? ["answers"] : ["submissionId", "fields"])]);
    id(c.requestId); int(c.expectedCaseVersion);
    if (typeof c.reviewHash !== "string" || !HASH.test(c.reviewHash) || c.confirmed !== true
      || c.copyVersion !== (buyer ? ANSWER_COPY_VERSION : REVIEW_COPY_VERSION)) fail("invalid_command");
    if (buyer) {
      const answers = arr(c.answers, 13);
      if (!answers.length) fail("invalid_command");
      const used = new Set<string>();
      for (const a of answers) {
        exactKeys(a, ["fieldName", "answerText"]);
        if (!FIELD_KEYS.includes(String(a.fieldName)) || used.has(String(a.fieldName))) fail("invalid_command");
        used.add(String(a.fieldName)); text(a.answerText, 2000, true);
      }
    } else {
      if (c.submissionId !== null) id(c.submissionId);
      const fields = row(c.fields); exactKeys(fields, RIGHTS_FIELD_NAMES);
      for (const name of RIGHTS_FIELD_NAMES) {
        const f = row(fields[name]);
        exactKeys(f, f.state === "resolved" ? ["state", "value"] : f.state === "unresolved" ? ["state"] : ["state", "note"]);
        if (f.state === "unsupported" || f.state === "contradictory") text(f.note, 500, true);
      }
      canonicalizeManualRightsReview({ fields } as unknown as ManualRightsReviewInput);
    }
    return Object.freeze(c) as unknown as AnswerCommand | ReviewCommand;
  } catch { return fail("invalid_command"); }
}
function consent(s: ClarificationSnapshot) { return row(s.root.consent); }
function caseRow(s: ClarificationSnapshot) { return row(consent(s).case); }
function capability(s: ClarificationSnapshot, at: string) {
  try {
    const k = row(consent(s).capability);
    if (k.case_id !== caseRow(s).case_id || k.revoked_at !== null || timestamp(k.issued_at) > at || timestamp(k.expires_at) <= at
      || int(k.rotation_number) < 1) fail("not_authorized");
    const actions: unknown = JSON.parse(String(k.allowed_actions_json));
    if (!Array.isArray(actions) || actions.length > 4 || new Set(actions).size !== actions.length || !actions.includes("clarify")
      || actions.some(v => !["submit_request", "clarify", "review", "receipt"].includes(v))) fail("not_authorized");
    return id(k.buyer_capability_id);
  } catch { return fail("not_authorized"); }
}
function open(s: ClarificationSnapshot) {
  const r = consent(s), c = caseRow(s);
  if (c.case_outcome !== "open" || c.invoice_binding_id !== null || c.permission_id !== null
    || r.invoiceCount !== 0 || r.operationCount !== 0 || r.permissionCount !== 0 || r.receiptCount !== 0) fail("decision_locked");
}
function termsFrom(t: Record<string, unknown>): TermsVersionRecord {
  return {
    termsVersionId: id(t.terms_version_id), caseId: id(t.case_id), versionNumber: int(t.version_number),
    resolutionStatus: t.resolution_status as TermsVersionRecord["resolutionStatus"],
    usePurpose: t.use_purpose as TermsVersionRecord["usePurpose"], channels: t.channels_json === null ? null : JSON.parse(String(t.channels_json)),
    paidAdvertising: t.paid_advertising === 1 ? true : null, territories: t.territories_json === null ? null : JSON.parse(String(t.territories_json)),
    startDate: t.start_date as string | null, durationDays: t.duration_days as number | null, maxImpressions: t.max_impressions as number | null,
    exclusivity: t.exclusivity as TermsVersionRecord["exclusivity"], modificationScope: t.modification_scope as TermsVersionRecord["modificationScope"],
    attribution: t.attribution as TermsVersionRecord["attribution"], sublicensing: t.sublicensing as TermsVersionRecord["sublicensing"],
    aiUse: t.ai_use as TermsVersionRecord["aiUse"], sourceKind: "human_corrected", termsHash: String(t.terms_hash), createdByActor: "creator", createdAt: timestamp(t.created_at),
  };
}
function rightsValues(t: TermsVersionRecord): Record<RightsFieldName, unknown> {
  return { use_purpose: t.usePurpose, channels: t.channels, paid_advertising: t.paidAdvertising, territories: t.territories,
    start_date: t.startDate, duration_days: t.durationDays, max_impressions: t.maxImpressions, exclusivity: t.exclusivity,
    modification_scope: t.modificationScope, attribution: t.attribution, sublicensing: t.sublicensing, ai_use: t.aiUse };
}
async function humanFields(s: ClarificationSnapshot, at: string): Promise<{ fields: ManualRightsReviewInput["fields"]; terms: TermsVersionRecord | null }> {
  const raw = consent(s).terms, c = caseRow(s);
  if (raw === null) {
    if (c.latest_terms_version_id !== null) fail("source_invalid");
    return { fields: Object.fromEntries(RIGHTS_FIELD_NAMES.map(name => [name, { state: "unresolved" }])) as ManualRightsReviewInput["fields"], terms: null };
  }
  const t = row(raw), terms = termsFrom(t);
  if (t.source_kind !== "human_corrected" || t.created_by_actor !== "creator" || terms.caseId !== c.case_id
    || terms.termsVersionId !== c.latest_terms_version_id || terms.createdAt > at) fail("source_invalid");
  const observations = arr(s.root.observations, 12), fields = {} as Record<RightsFieldName, RightsFieldEdit>;
  // Early complete-term fixtures and saved pre-integration records have no observation pointer.
  // Their exact canonical term content still must verify against the immutable hash.
  if (observations.length === 0 && s.root.extractionId === null && terms.resolutionStatus === "complete") {
    const values = rightsValues(terms);
    for (const name of RIGHTS_FIELD_NAMES) fields[name] = { state: "resolved", value: values[name] };
  } else {
    if (observations.length !== 12 || new Set(observations.map(o => o.field_name)).size !== 12) fail("source_invalid");
    for (const name of RIGHTS_FIELD_NAMES) {
      const o = observations.find(v => v.field_name === name);
      if (!o || o.provenance !== "human" || o.resolver_version !== "manual-review-v1") fail("source_invalid");
      const state = o.resolution_state;
      if (state === "resolved") fields[name] = { state, value: JSON.parse(String(o.normalized_value_json)) };
      else if (state === "unresolved" && o.normalized_value_json === null) fields[name] = { state };
      else if (state === "unsupported" || state === "contradictory") fields[name] = { state, note: text(row(JSON.parse(String(o.normalized_value_json))).note, 500, true) };
      else fail("source_invalid");
    }
  }
  const canonical = canonicalizeManualRightsReview({ fields });
  if (deriveTermsResolutionStatus(canonical) !== terms.resolutionStatus || await sha256Hex(manualRightsReviewCanonicalJson(canonical)) !== terms.termsHash) fail("source_invalid");
  const values = rightsValues(terms);
  for (const name of RIGHTS_FIELD_NAMES) {
    const f = canonical.fields[name];
    if (canonicalJson(values[name]) !== canonicalJson(f.state === "resolved" ? f.value : null)) fail("source_invalid");
  }
  return { fields: canonical.fields, terms };
}
interface SubmissionView {
  readonly submissionId: string; readonly roundNumber: number; readonly submittedAt: string;
  readonly sourceCaseVersion: number; readonly sourceTermsVersionId: string | null;
  readonly answers: readonly Answer[]; readonly reviewedTermsVersionId: string | null;
}
async function history(s: ClarificationSnapshot, at: string): Promise<SubmissionView | null> {
  const submissions = arr(s.root.submissions, 16), rounds = arr(s.root.rounds, 16), questions = arr(s.root.questions, 208), answers = arr(s.root.answers, 208);
  const reviews = arr(s.root.reviews, 64), audits = arr(s.root.audits, 80), c = caseRow(s);
  if (submissions.length !== rounds.length || answers.length !== questions.length || audits.length !== submissions.length + reviews.length) fail("source_invalid");
  const answerCopyHash = await sha256Hex(ANSWER_COPY), reviewCopyHash = await sha256Hex(REVIEW_COPY);
  let latest: SubmissionView | null = null;
  const usedQuestions = new Set<string>(), usedAnswers = new Set<string>();
  for (let n = 0; n < submissions.length; n++) {
    const a = submissions[n]!, round = rounds[n]!;
    const roundId = id(a.clarification_round_id), submissionId = id(a.submission_id);
    if (a.case_id !== c.case_id || round.case_id !== c.case_id || round.clarification_round_id !== roundId
      || round.round_number !== n + 1 || round.status !== "answered" || round.created_at !== a.submitted_at || round.closed_at !== a.submitted_at
      || timestamp(a.submitted_at) > at || int(a.source_case_version) >= int(c.row_version)
      || a.copy_version !== ANSWER_COPY_VERSION || a.copy_hash !== answerCopyHash || !HASH.test(String(a.command_hash))) fail("source_invalid");
    id(a.buyer_capability_id); id(a.request_id);
    if (a.source_terms_version_id !== null) id(a.source_terms_version_id);
    if (a.source_creator_decision_id !== null) id(a.source_creator_decision_id);
    const plan = row(parseCanonical(String(a.plan_json))), pq = arr(plan.questions, 13);
    if (plan.caseId !== c.case_id || plan.caseVersion !== a.source_case_version || plan.termsVersionId !== a.source_terms_version_id
      || plan.creatorDecisionId !== a.source_creator_decision_id || await sha256Hex(String(a.plan_json)) !== a.plan_hash || !pq.length) fail("source_invalid");
    const qs = questions.filter(q => q.clarification_round_id === roundId).sort((a, b) => Number(a.question_order) - Number(b.question_order));
    if (qs.length !== pq.length || new Set(pq.map(q => q.fieldName)).size !== pq.length) fail("source_invalid");
    const saved: Answer[] = [];
    for (let j = 0; j < qs.length; j++) {
      const q = qs[j]!, p = pq[j]!, qid = id(q.clarification_question_id), matches = answers.filter(v => v.clarification_question_id === qid);
      if (!FIELD_KEYS.includes(String(p.fieldName)) || q.field_name !== p.fieldName || q.question_text !== p.question || q.question_order !== j + 1
        || q.created_at !== a.submitted_at || q.reason_code !== (p.reason === "ambiguous" ? "missing" : p.reason) || matches.length !== 1
        || usedQuestions.has(qid)) fail("source_invalid");
      const answer = matches[0]!; usedQuestions.add(qid); usedAnswers.add(id(answer.clarification_answer_id));
      if (answer.answered_at !== a.submitted_at) fail("source_invalid");
      saved.push({ fieldName: p.fieldName as Answer["fieldName"], answerText: text(answer.answer_text, 2000, true) });
    }
    if (await canonicalHash(saved) !== a.answers_hash) fail("source_invalid");
    const matching = reviews.filter(r => r.submission_id === submissionId);
    if (matching.length > 1) fail("source_invalid");
    const evidence = audits.filter(e => e.aggregate_id === submissionId);
    if (evidence.length !== 1 || evidence[0]!.actor_reference !== `capability:${a.buyer_capability_id}`
      || evidence[0]!.actor_type !== "buyer" || evidence[0]!.created_at !== a.submitted_at
      || evidence[0]!.event_type !== "clarification.answers_submitted"
      || evidence[0]!.idempotency_key !== `clarification:buyer:${a.request_id}`) fail("source_invalid");
    const payload = row(parseCanonical(String(evidence[0]!.payload_json)));
    if (payload.version !== "clarification-evidence-v1" || payload.command_hash !== a.command_hash || payload.plan_hash !== a.plan_hash || payload.answers_hash !== a.answers_hash
      || payload.result_id !== submissionId || payload.copy_hash !== a.copy_hash) fail("source_invalid");
    latest = { submissionId, roundNumber: n + 1, submittedAt: String(a.submitted_at), sourceCaseVersion: Number(a.source_case_version),
      sourceTermsVersionId: a.source_terms_version_id as string | null, answers: saved, reviewedTermsVersionId: matching.length ? id(matching[0]!.terms_version_id) : null };
  }
  if (usedQuestions.size !== questions.length || usedAnswers.size !== answers.length) fail("source_invalid");
  for (const r of reviews) {
    if (r.case_id !== c.case_id || timestamp(r.created_at) > at || int(r.source_case_version) >= int(c.row_version)
      || r.copy_version !== REVIEW_COPY_VERSION || r.copy_hash !== reviewCopyHash || !HASH.test(String(r.command_hash))
      || !HASH.test(String(r.source_review_hash))) fail("source_invalid");
    id(r.review_id); id(r.terms_version_id); id(r.request_id); if (r.quote_id !== null) id(r.quote_id);
    if (r.submission_id !== null && !submissions.some(a => a.submission_id === r.submission_id && Number(a.source_case_version) < Number(r.source_case_version))) fail("source_invalid");
    const evidence = audits.filter(e => e.aggregate_id === r.review_id);
    if (evidence.length !== 1 || evidence[0]!.actor_type !== "creator" || evidence[0]!.actor_reference !== r.actor_reference
      || evidence[0]!.created_at !== r.created_at || evidence[0]!.event_type !== "clarification.terms_reviewed"
      || evidence[0]!.idempotency_key !== `clarification:creator:${r.request_id}`) fail("source_invalid");
    const payload = row(parseCanonical(String(evidence[0]!.payload_json)));
    if (payload.version !== "clarification-evidence-v1" || payload.result_id !== r.review_id || payload.command_hash !== r.command_hash || payload.submission_id !== r.submission_id
      || payload.terms_version_id !== r.terms_version_id || payload.quote_id !== r.quote_id || payload.copy_hash !== r.copy_hash) fail("source_invalid");
  }
  return latest;
}
export function createClarificationWorkflow(deps: {
  readonly store: ClarificationStore; readonly authorizeCreator?: (caseId: string) => Promise<CreatorPrincipal | null>;
  readonly now?: () => Date; readonly checkActive?: () => void;
}) {
  const clock = deps.now ?? (() => new Date());
  function time() { deps.checkActive?.(); return timestamp(clock().toISOString()); }
  async function principal(caseId: string) {
    try {
      const p = await deps.authorizeCreator?.(caseId); time();
      if (!p || typeof p.actorReference !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/u.test(p.actorReference)) fail("not_authorized");
      return { workspaceId: id(p.workspaceId), actorReference: p.actorReference };
    } catch { return fail("not_authorized"); }
  }
  async function load(caseId: string, digest: string | null) {
    time(); const s = await deps.store.load(caseId, digest); time();
    if (!s) fail(digest === null ? "not_found" : "not_authorized");
    if (caseRow(s).case_id !== caseId) fail("source_invalid"); return s;
  }
  async function buyer(token: string) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) fail("not_authorized");
    const digest = await sha256Hex(token), caseId = await deps.store.findBuyerCase(digest); time();
    if (!caseId) fail("not_authorized"); return { digest, caseId: id(caseId) };
  }
  async function authorize(s: ClarificationSnapshot, digest: string | null, owner: CreatorPrincipal | null) {
    if (digest !== null) return `capability:${capability(s, time())}`;
    const p = await principal(String(caseRow(s).case_id));
    if (!owner || p.workspaceId !== owner.workspaceId || p.actorReference !== owner.actorReference
      || caseRow(s).workspace_id !== p.workspaceId) fail("not_authorized"); return p.actorReference;
  }
  async function inspect(s: ClarificationSnapshot) {
    try {
      const at = time(), r = consent(s), c = caseRow(s), a = row(r.asset), w = row(r.workspace), request = row(s.root.originalRequest);
      id(c.case_id); id(c.workspace_id); int(c.row_version);
      if (a.asset_id !== c.asset_id || a.workspace_id !== c.workspace_id || w.workspace_id !== c.workspace_id
        || a.availability !== "active" || request.case_id !== c.case_id || request.request_submission_id !== c.request_submission_id
        || request.consent_acknowledged !== 1 || request.consent_copy_version !== "buyer-request-v1"
        || timestamp(request.submitted_at) > at || timestamp(c.updated_at) > at) fail("source_invalid");
      const originalRequest = text(request.intended_use_text, 8000, true);
      if ([...originalRequest].length < 40 || [...originalRequest].length > 4000) fail("source_invalid");
      const human = await humanFields(s, at);
      let input: readonly ClarificationFieldInput[];
      if (human.terms) input = RIGHTS_FIELD_NAMES.map(fieldName => {
        const f = human.fields[fieldName];
        return { fieldName, resolutionState: f.state, normalizedValue: f.state === "resolved" ? f.value : null,
          reasonCode: f.state === "resolved" ? "explicit_evidence" : f.state === "contradictory" ? "conflicting_evidence"
            : f.state === "unsupported" ? "out_of_scope" : "not_stated", evidenceSpans: [] };
      });
      else {
        const assessed = await assessDeterministicRights(originalRequest, { sha256Hex });
        if (assessed.status !== "review_required" || assessed.quoteEligible !== false || assessed.permittedActions.length !== 0) fail("source_invalid");
        input = assessed.fields.map(f => ({ fieldName: f.fieldName, resolutionState: f.resolutionState, normalizedValue: f.normalizedValue,
          reasonCode: f.reasonCode, evidenceSpans: f.evidenceSpans }));
      }
      const plan = buildClarificationPlan({ originalText: originalRequest, source: human.terms ? "human_corrected" : "deterministic_proposal", fields: input });
      const questions: Question[] = plan.questions.map(q => ({ fieldName: q.fieldName, label: q.label, question: q.question, reason: q.reason }));
      let creatorDecisionId: string | null = null;
      if (r.decision !== null) {
        const d = row(r.decision);
        if (d.case_id !== c.case_id || d.creator_decision_id !== c.latest_creator_decision_id) fail("source_invalid");
        // The reason is included separately by the persistence snapshot below.
        if (d.decision === "clarification_requested" && d.terms_version_id === c.latest_terms_version_id) {
          creatorDecisionId = id(d.creator_decision_id);
          const reason = text(s.root.decisionReason, 500);
          questions.push({ fieldName: "additional_context", label: "Creator follow-up", question: reason, reason: "missing" });
        }
      }
      const latestSubmission = await history(s, at);
      arr(s.root.termHashes, 64); arr(s.root.quotes, 64);
      const reviewHash = await sha256Hex(s.sourceJson);
      return { c, human, originalRequest, questions, creatorDecisionId, latestSubmission, reviewHash,
        unsupported: plan.unsupported.map(b => ({ fieldName: b.fieldName, label: b.label, explanation: b.explanation })),
        asset: { title: text(a.title, 200), creator: text(a.creator_display_name, 120) } };
    } catch (error) {
      if (error instanceof ClarificationError) throw error; return fail("source_invalid");
    }
  }
  async function finalRead(s: ClarificationSnapshot, caseId: string, digest: string | null, owner: CreatorPrincipal | null) {
    await authorize(s, digest, owner);
    const fresh = await load(caseId, digest);
    // Check fresh capability first so revoked access does not become a stale-source hint.
    await authorize(fresh, digest, owner);
    if (fresh.sourceJson !== s.sourceJson) fail("stale_revision");
    const checked = await deps.store.check(s, caseId, digest, time()); time();
    if (checked === "unauthorized") fail("not_authorized");
    if (checked !== "current") fail("stale_revision");
    if (digest !== null) capability(fresh, time());
  }
  async function review(caseId: string, digest: string | null, owner: CreatorPrincipal | null) {
    const s = await load(caseId, digest); await authorize(s, digest, owner); open(s);
    const v = await inspect(s); await finalRead(s, caseId, digest, owner);
    const pending = v.latestSubmission !== null && v.latestSubmission.reviewedTermsVersionId === null;
    return Object.freeze({ schemaVersion: "clarification-review-v1", environment: "sandbox", caseId,
      caseVersion: int(v.c.row_version), reviewHash: v.reviewHash, asset: v.asset, originalRequest: v.originalRequest,
      termsVersionId: v.human.terms?.termsVersionId ?? null, termsVersionNumber: v.human.terms?.versionNumber ?? null,
      fields: RIGHTS_FIELD_NAMES.map(fieldName => { const f = v.human.fields[fieldName];
        return { fieldName, label: RIGHTS_FIELD_LABELS[fieldName], resolutionState: f.state,
          value: f.state === "resolved" ? f.value : null, note: f.state === "unsupported" || f.state === "contradictory" ? f.note : null }; }),
      questions: v.questions, unsupported: v.unsupported, latestSubmission: v.latestSubmission,
      canSubmitAnswers: digest !== null && !pending && v.questions.length > 0 && arr(s.root.submissions, 16).length < 16,
      canSaveTerms: digest === null, checkedAt: time(), accessExpiresAt: digest === null ? null : String(row(consent(s).capability).expires_at),
      answerCopyVersion: ANSWER_COPY_VERSION, answerCopy: ANSWER_COPY, reviewCopyVersion: REVIEW_COPY_VERSION, reviewCopy: REVIEW_COPY,
      paymentConfirmed: false, permissionGranted: false });
  }
  function result(outcome: "recorded" | "replayed", record: Record<string, unknown>, buyerRole: boolean, version: number) {
    return Object.freeze({ schemaVersion: "clarification-command-result-v1", outcome,
      resultId: String(record[buyerRole ? "submission_id" : "review_id"]), caseVersion: version,
      submissionId: buyerRole ? String(record.submission_id) : record.submission_id as string | null,
      termsVersionId: buyerRole ? null : record.terms_version_id as string, quoteId: buyerRole ? null : record.quote_id as string | null,
      resolutionStatus: buyerRole ? null : record.resolution_status as string, paymentConfirmed: false, permissionGranted: false });
  }
  async function mutate(caseId: string, digest: string | null, owner: CreatorPrincipal | null, c: AnswerCommand | ReviewCommand) {
    const buyerRole = digest !== null;
    let committed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const s = await load(caseId, digest), actor = await authorize(s, digest, owner); open(s);
      const v = await inspect(s), commandHash = await canonicalHash({ schema: "clarification-command-v1", caseId, actor, command: c });
      const old = arr(buyerRole ? s.root.submissions : s.root.reviews, buyerRole ? 16 : 64).find(r => r.request_id === c.requestId);
      if (old) {
        if (old.command_hash !== commandHash || (!buyerRole && old.actor_reference !== actor)
          || (buyerRole && `capability:${old.buyer_capability_id}` !== actor)) fail("idempotency_conflict");
        if (int(v.c.row_version) !== Number(old.source_case_version) + 1
          || (buyerRole && v.latestSubmission?.submissionId !== old.submission_id)
          || (!buyerRole && v.c.latest_terms_version_id !== old.terms_version_id)) fail("stale_command");
        await finalRead(s, caseId, digest, owner);
        return result(committed ? "recorded" : "replayed", { ...old, resolution_status: v.human.terms?.resolutionStatus ?? null }, buyerRole, int(v.c.row_version));
      }
      if (c.expectedCaseVersion !== v.c.row_version || c.reviewHash !== v.reviewHash) fail("stale_revision");
      const resultId = crypto.randomUUID(), copyHash = await sha256Hex(buyerRole ? ANSWER_COPY : REVIEW_COPY);
      const base = { snapshot: s, caseId, workspaceId: id(v.c.workspace_id), digest,
        capabilityId: digest === null ? null : capability(s, time()), actorReference: actor, resultId, commandHash,
        auditId: crypto.randomUUID(), copyHash, at: time() };
      if (buyerRole) {
        const cmd = c as AnswerCommand;
        if (v.latestSubmission && v.latestSubmission.reviewedTermsVersionId === null) fail("review_pending");
        if (arr(s.root.submissions, 16).length >= 16) fail("limit_reached");
        if (!v.questions.length) fail("answers_not_requested");
        if (cmd.answers.length !== v.questions.length || cmd.answers.some((a, n) => a.fieldName !== v.questions[n]!.fieldName)) fail("invalid_command");
        const planJson = canonicalJson({ caseId, caseVersion: c.expectedCaseVersion, termsVersionId: v.human.terms?.termsVersionId ?? null,
          creatorDecisionId: v.creatorDecisionId, questions: v.questions });
        const planHash = await sha256Hex(planJson), answersHash = await canonicalHash(cmd.answers);
        const auditPayload = canonicalJson({ version: "clarification-evidence-v1", result_id: resultId, command_hash: commandHash,
          plan_hash: planHash, answers_hash: answersHash, copy_hash: copyHash });
        await authorize(s, digest, owner); time();
        try {
          await deps.store.commitAnswers({ ...base, at: time(), command: cmd, roundId: crypto.randomUUID(), roundNumber: arr(s.root.rounds, 16).length + 1,
            sourceTermsVersionId: v.human.terms?.termsVersionId ?? null, sourceCreatorDecisionId: v.creatorDecisionId,
            questions: v.questions, planJson, planHash, answersHash, auditPayload }); committed = true;
        } catch { /* Reload exact idempotency evidence after a competing writer or lost acknowledgement. */ }
      } else {
        const cmd = c as ReviewCommand, pending = v.latestSubmission?.reviewedTermsVersionId === null ? v.latestSubmission : null;
        if (cmd.submissionId !== (pending?.submissionId ?? null)) fail("stale_revision");
        if (arr(s.root.reviews, 64).length >= 64) fail("limit_reached");
        const input = canonicalizeManualRightsReview({ fields: cmd.fields }), termsHash = await sha256Hex(manualRightsReviewCanonicalJson(input));
        const same = v.human.terms?.termsHash === termsHash;
        if (same && !pending) fail("terms_unchanged");
        if (!same && arr(s.root.termHashes, 64).some(t => t.terms_hash === termsHash)) fail("terms_unchanged");
        if (!same && arr(s.root.termHashes, 64).length >= 64) fail("limit_reached");
        const revision = same ? null : createManualTermsRevision(input, {
          caseId, extractionAttemptId: crypto.randomUUID(), fieldObservationIds: Object.fromEntries(RIGHTS_FIELD_NAMES.map(n => [n, crypto.randomUUID()])) as Record<RightsFieldName, string>,
          termsVersionId: crypto.randomUUID(), auditEventId: crypto.randomUUID(), attemptNumber: int(s.root.nextAttempt), versionNumber: int(s.root.nextTerms),
          inputHash: await sha256Hex(v.originalRequest), termsHash, createdAt: time(), actorReference: actor, correlationId: c.requestId,
        });
        const terms = revision?.termsVersion ?? v.human.terms!;
        let quote: ReviewCommit["quote"] = null;
        if (terms.resolutionStatus === "complete") {
          try {
            const p = row(s.root.assignedPolicy);
            const policy: PricingPolicyVersion = { pricingPolicyId: id(p.pricing_policy_id), workspaceId: id(p.workspace_id), versionNumber: int(p.version_number),
              policyName: text(p.policy_name, 200), currency: p.currency as "USD", rulesJson: String(p.rules_json), policyHash: String(p.policy_hash), status: p.status as PricingPolicyVersion["status"] };
            if (policy.workspaceId !== v.c.workspace_id || await sha256Hex(policy.rulesJson) !== policy.policyHash) fail("policy_unavailable");
            const calculated = calculateQuote(terms, policy);
            if (calculated.totalCents < 1 || calculated.totalCents > 1_000_000_000
              || `${calculated.licenseEndDateExclusive}T00:00:00.000Z` <= time()) fail("policy_unavailable");
            const calculationHash = await sha256Hex(calculated.calculationCanonicalJson), prior = arr(s.root.quotes, 64).find(q => q.calculation_hash === calculationHash);
            if (!prior && arr(s.root.quotes, 64).length >= 64) fail("limit_reached");
            if (prior) {
              const lines = arr(s.root.quoteLines, 2080).filter(l => l.quote_id === prior.quote_id);
              if (prior.terms_version_id !== terms.termsVersionId || prior.pricing_policy_id !== policy.pricingPolicyId || prior.pricing_policy_version !== policy.versionNumber
                || prior.amount_cents !== calculated.totalCents || prior.currency !== "USD" || lines.length !== calculated.lineItems.length
                || lines.some((l, n) => l.line_position !== n + 1 || l.line_code !== calculated.lineItems[n]!.code
                  || l.description !== calculated.lineItems[n]!.description || l.amount_cents !== calculated.lineItems[n]!.amountCents)) fail("source_invalid");
            }
            quote = { quoteId: prior ? id(prior.quote_id) : crypto.randomUUID(), quoteVersion: prior ? int(prior.quote_version_number) : int(s.root.nextQuote),
              calculated, calculationHash, reuse: !!prior };
          } catch (error) { if (error instanceof ClarificationError) throw error; fail("policy_unavailable"); }
        }
        const auditPayload = canonicalJson({ version: "clarification-evidence-v1", result_id: resultId, command_hash: commandHash,
          submission_id: cmd.submissionId, terms_version_id: terms.termsVersionId, terms_hash: terms.termsHash,
          quote_id: quote?.quoteId ?? null, calculation_hash: quote?.calculationHash ?? null, copy_hash: copyHash });
        await authorize(s, digest, owner); time();
        try { await deps.store.commitReview({ ...base, at: time(), command: cmd, revision, terms, quote, auditPayload }); committed = true; }
        catch { /* Reload exact idempotency evidence after a competing writer or lost acknowledgement. */ }
      }
    }
    return fail("storage_unavailable");
  }
  return Object.freeze({
    async reviewBuyer(token: string) { const b = await buyer(token); return review(b.caseId, b.digest, null); },
    async answerBuyer(token: string, raw: unknown) { const b = await buyer(token); return mutate(b.caseId, b.digest, null, command(raw, true)); },
    async reviewCreator(caseId: string) { id(caseId); return review(caseId, null, await principal(caseId)); },
    async saveCreatorTerms(caseId: string, raw: unknown) { id(caseId); return mutate(caseId, null, await principal(caseId), command(raw, false)); },
  });
}
