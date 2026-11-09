/** Builds a privacy-minimized receipt from an exact server-side relational snapshot.
 * This is not a payment detector. It requires existing canonical Sandbox evidence.
 */
import { canonicalHash, canonicalJson, sha256Hex, type Json } from "./canonical";
import { ReceiptError, type AuditAnchor, type PreparedReceipt, type ReceiptMaterial, type ReceiptSnapshot, type ReceiptState } from "./contract";
export const FIELD_ORDER = ["use_purpose", "channels", "paid_advertising", "territories", "start_date",
  "duration_days", "max_impressions", "exclusivity", "modification_scope", "attribution", "sublicensing", "ai_use"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const STATES = ["scheduled", "active", "expired", "refunded", "revoked"];
export function invalid(): never { throw new ReceiptError("source_invalid"); }
export function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 200, min = 1): string {
  if (typeof value !== "string" || value.length < min || value.length > max || /[\x00-\x1f]/u.test(value)) invalid();
  canonicalJson(value); return value;
}
export function id(value: unknown): string { const x = text(value, 36); if (!UUID.test(x)) invalid(); return x; }
export function digest(value: unknown): string { const x = text(value, 64); if (!HASH.test(x)) invalid(); return x; }
export function integer(value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER - 1): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) invalid(); return value;
}
export function instant(value: unknown): string {
  const x = text(value, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(x)) invalid();
  const date = new Date(x); if (!Number.isFinite(date.getTime()) || date.toISOString() !== x) invalid(); return x;
}
export function items(value: unknown, max = 1024): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > max) invalid(); return value.map(row);
}
function equal(a: unknown, b: unknown): void { if (a !== b) invalid(); }
function date(value: unknown): string {
  const d = text(value, 10); instant(`${d}T00:00:00.000Z`); return d;
}
function choice(value: unknown, allowed: readonly (string | number | boolean)[]): Json {
  if (!allowed.includes(value as string)) invalid(); return value as Json;
}
function canonicalList(raw: unknown, allowed: readonly string[]): string[] {
  const list: unknown = JSON.parse(text(raw, 256));
  if (!Array.isArray(list) || !list.length || list.length > allowed.length || new Set(list).size !== list.length
    || list.some((v, i) => !allowed.includes(v) || (i > 0 && allowed.indexOf(list[i - 1]) >= allowed.indexOf(v)))) invalid();
  return list as string[];
}
export async function anchorAudit(events: readonly Record<string, unknown>[], caseId: string): Promise<AuditAnchor> {
  const seen = new Set<string>();
  const safe = [];
  for (const event of events) {
    equal(event.case_id, caseId); const key = id(event.audit_event_id);
    if (seen.has(key)) invalid(); seen.add(key);
    integer(event.aggregate_sequence); instant(event.created_at);
    const type = text(event.event_type, 120);
    // Receipt events are linked by the chain itself. Excluding them prevents a
    // self-referential hash and audit-only activity from creating new revisions.
    if (type.startsWith("receipt.")) continue;
    const payload: unknown = JSON.parse(text(event.payload_json, 65536));
    safe.push({ audit_event_id: key, sha256: await canonicalHash({ ...event, payload_json: payload }) });
  }
  return Object.freeze({ event_count: safe.length, root_sha256: await canonicalHash(safe), events: Object.freeze(safe) });
}
/** clockTransition validates the same source, but permits ONLY a forward UTC
 * scheduled/active transition. Ordinary issuance and GET verification stay strict.
 * This server-internal option is never derived from a request parameter.
 */
export async function prepareReceipt(snapshot: ReceiptSnapshot, at: string, clockTransition = false): Promise<PreparedReceipt> {
  instant(at);
  const r = snapshot.root;
  if (!r.permission || !r.binding) throw new ReceiptError("not_eligible");
  const c = row(r.case), a = row(r.asset), w = row(r.workspace), b = row(r.binding), p = row(r.permission);
  const t = row(r.terms), q = row(r.quote), policy = row(r.policy), d = row(r.decision), accept = row(r.acceptance);
  const request = row(r.request), v = row(r.verification), o = row(r.outbox), financial = row(r.financial);
  const caseId = id(c.case_id), termsId = id(t.terms_version_id), quoteId = id(q.quote_id), bindingId = id(b.invoice_binding_id);
  const permissionId = id(p.permission_id), verificationId = id(v.verification_record_id);
  if (c.case_outcome !== "open" || b.provider !== "paypal" || b.environment !== "sandbox") throw new ReceiptError("not_eligible");
  for (const x of [b, p, t, q, d, accept, request, v]) equal(x.case_id, caseId);
  equal(c.workspace_id, id(w.workspace_id)); equal(a.workspace_id, w.workspace_id); equal(policy.workspace_id, w.workspace_id);
  equal(c.asset_id, id(a.asset_id)); equal(c.permission_id, permissionId); equal(c.invoice_binding_id, bindingId);
  equal(c.verification_record_id, verificationId); equal(c.request_submission_id, id(request.request_submission_id));
  equal(c.latest_terms_version_id, termsId); equal(c.latest_quote_id, quoteId);
  equal(c.latest_creator_decision_id, id(d.creator_decision_id)); equal(c.latest_buyer_acceptance_id, id(accept.buyer_acceptance_id));
  equal(accept.creator_decision_id, d.creator_decision_id); equal(b.buyer_acceptance_id, accept.buyer_acceptance_id);
  for (const x of [b, p, q, d, accept]) equal(x.terms_version_id, termsId);
  for (const x of [b, d, accept]) equal(x.quote_id, quoteId);
  equal(p.invoice_binding_id, bindingId); equal(v.case_id, caseId);
  equal(policy.pricing_policy_id, id(q.pricing_policy_id)); equal(policy.version_number, integer(q.pricing_policy_version));
  for (const x of [c, b, p, v, a, w]) integer(x.row_version);
  if (p.review_required !== 0 || b.invoice_status === "reconciliation_required") throw new ReceiptError("review_required");
  equal(o.invoice_binding_id, bindingId); equal(financial.invoice_binding_id, bindingId);
  const generation = integer(o.requested_generation);
  if (o.completed_generation !== generation || o.lease_token !== null || o.blocked_code !== null
    || financial.generation !== generation) throw new ReceiptError("review_required");
  if (!STATES.includes(String(p.permission_state))) invalid();
  const state = p.permission_state as ReceiptState;
  const invoiceState = text(b.invoice_status);
  if (!["paid", "fully_refunded"].includes(invoiceState)
    || financial.conclusion !== invoiceState || (state === "refunded" && invoiceState !== "fully_refunded")
    || (["scheduled", "active", "expired"].includes(state) && invoiceState !== "paid")) throw new ReceiptError("not_eligible");
  equal(t.resolution_status, "complete"); equal(t.source_kind, "human_corrected"); equal(t.created_by_actor, "creator");
  equal(q.status, "current"); equal(q.currency, "USD"); equal(policy.currency, "USD"); equal(d.decision, "approved");
  text(accept.acceptance_copy_version, 80); equal(request.consent_acknowledged, 1);
  const termsAt = instant(t.created_at), quoteAt = instant(q.created_at), approvedAt = instant(d.decided_at), acceptedAt = instant(accept.accepted_at);
  const effectiveAt = instant(p.state_effective_at), financialAt = instant(financial.observed_at);
  if (termsAt > approvedAt || quoteAt > approvedAt || acceptedAt < approvedAt || financialAt < acceptedAt
    || [termsAt, quoteAt, acceptedAt, effectiveAt, financialAt, instant(request.submitted_at)].some(x => x > at)) invalid();
  const start = date(t.start_date), days = integer(t.duration_days, 1, 365);
  const end = new Date(Date.parse(`${start}T00:00:00.000Z`) + days * 86400000).toISOString().slice(0, 10);
  date(end); equal(p.start_date, start); equal(p.end_date_exclusive, end);
  const today = at.slice(0, 10);
  const temporal = today < start ? "scheduled" : today >= end ? "expired" : "active";
  if (["scheduled", "active", "expired"].includes(state) && state !== temporal) {
    const forward = state === "scheduled" && ["active", "expired"].includes(temporal)
      || state === "active" && temporal === "expired";
    if (!clockTransition || !forward) throw new ReceiptError("temporal_refresh_required");
  }
  const rights: Record<string, Json> = {
    use_purpose: choice(t.use_purpose, ["commercial"]),
    channels: canonicalList(t.channels_json, ["instagram_paid", "facebook_paid"]),
    paid_advertising: t.paid_advertising === 1 ? true : invalid(),
    territories: canonicalList(t.territories_json, ["US", "CA"]), start_date: start, duration_days: days,
    max_impressions: integer(t.max_impressions, 1, 500000), exclusivity: choice(t.exclusivity, ["non_exclusive"]),
    modification_scope: choice(t.modification_scope, ["none", "crop_only"]), attribution: choice(t.attribution, ["required", "not_required"]),
    sublicensing: choice(t.sublicensing, ["prohibited"]), ai_use: choice(t.ai_use, ["prohibited"]),
  };
  const termsHash = digest(t.terms_hash);
  equal(termsHash, await canonicalHash({ schema_version: "rights-review-v1", fields: Object.fromEntries(
    FIELD_ORDER.map(field => [field, { state: "resolved", value: rights[field] }])) }));
  const policyHash = digest(policy.policy_hash), rules = text(policy.rules_json, 32768);
  equal(await sha256Hex(rules), policyHash);
  const amount = integer(q.amount_cents, 1, 1000000000);
  const lines = items(r.lines, 32); if (!lines.length) invalid();
  const lineCodes = new Set<string>();
  const lineItems = lines.map((line, i) => {
    equal(line.quote_id, quoteId); equal(line.line_position, i + 1);
    const code = text(line.line_code, 80); if (lineCodes.has(code)) invalid(); lineCodes.add(code);
    return { code, description: text(line.description, 300), amount_cents: integer(line.amount_cents, 0, 1000000000) };
  });
  equal(lineItems.reduce((sum, line) => sum + line.amount_cents, 0), amount);
  const calculationHash = digest(q.calculation_hash);
  // Verify the original versioned pricing preimage, not a newly invented hash format.
  equal(calculationHash, await sha256Hex(JSON.stringify({ schema_version: "quote-calculation-v1",
    terms_version_id: termsId, terms_hash: termsHash, pricing_policy_id: policy.pricing_policy_id,
    pricing_policy_version: policy.version_number, policy_hash: policyHash, currency: "USD",
    license_start_date: start, license_end_date_exclusive: end, line_items: lineItems, total_cents: amount })));
  const invoiceId = text(b.provider_invoice_id, 105);
  if (!/^INV2-[A-Za-z0-9-]{3,100}$/u.test(invoiceId)) invalid();
  const evidence = items(r.evidence, 100); const supportedEvidence = evidence.filter(e => ["paid", "fully_refunded"].includes(String(e.payment_status)));
  if (!supportedEvidence.length) throw new ReceiptError("not_eligible");
  for (const e of supportedEvidence) {
    id(e.payment_evidence_id); equal(e.invoice_binding_id, bindingId); equal(e.evidence_source, "reconciliation");
    equal(e.source_reference, `invoice-financial:${invoiceId}`); equal(e.amount_cents, amount); equal(e.currency, "USD");
    digest(e.evidence_hash); if (instant(e.observed_at) > at) invalid();
  }
  const paid = supportedEvidence.filter(e => e.payment_status === "paid");
  const refunded = supportedEvidence.filter(e => e.payment_status === "fully_refunded");
  if (!paid.length || (invoiceState === "fully_refunded" && !refunded.length)
    || (invoiceState === "paid" && refunded.length)) throw new ReceiptError("not_eligible");
  equal(financial.paid_cents, amount); equal(financial.refunded_cents, invoiceState === "fully_refunded" ? amount : 0);
  digest(financial.detail_sha256);
  const sourceText = request.intended_use_text;
  if (typeof sourceText !== "string" || [...sourceText].length < 40 || [...sourceText].length > 4000) invalid();
  canonicalJson(sourceText);
  const originalHash = await sha256Hex(sourceText);
  const extractions = items(r.extractions, 128).filter(e => String(e.completed_at) <= termsAt);
  const provenance: Record<string, Json>[] = [];
  for (const e of extractions) {
    equal(e.case_id, caseId); equal(e.status, "completed"); equal(e.input_hash, originalHash);
    const modelSet = [e.model_id, e.model_version, e.artifact_hash];
    if (!modelSet.every(x => x === null) && !modelSet.every(x => typeof x === "string")) invalid();
    provenance.push({ extraction_attempt_id: id(e.extraction_attempt_id), extractor_version: text(e.extractor_version, 120),
      model_id: e.model_id === null ? null : text(e.model_id, 120), model_version: e.model_version === null ? null : text(e.model_version, 120),
      artifact_hash: e.artifact_hash === null ? null : digest(e.artifact_hash), input_sha256: originalHash,
      completed_at: instant(e.completed_at) });
  }
  const last = provenance.at(-1);
  if (c.latest_extraction_attempt_id !== null && !provenance.some(e => e.extraction_attempt_id === c.latest_extraction_attempt_id)) invalid();
  const publicId = text(v.public_verification_id, 128, 22);
  if (!/^[A-Za-z0-9_-]+$/u.test(publicId) || UUID.test(publicId)) invalid();
  const audits = items(r.audit, 1024);
  if (!audits.length || !audits.some(e => e.aggregate_type === "permission_lifecycle" && e.aggregate_id === bindingId)) invalid();
  for (const audit of audits) if (instant(audit.created_at) > at) invalid();
  const anchor = await anchorAudit(audits, caseId);
  const material: ReceiptMaterial = {
    case_id: caseId,
    asset: { asset_id: id(a.asset_id), title: text(a.title, 200), asset_type: choice(a.asset_type, ["photograph", "illustration"]),
      fingerprint_algorithm: choice(a.fingerprint_algorithm, ["sha256"]), fingerprint_value: digest(a.fingerprint_value) },
    creator: { display_name: text(a.creator_display_name, 120) },
    buyer: { organization_display_name: text(request.buyer_organization, 120) },
    terms: rights, period: { start_date: start, end_date_exclusive: end,
      last_permitted_date: new Date(Date.parse(`${end}T00:00:00.000Z`) - 86400000).toISOString().slice(0, 10) },
    quote: { quote_id: quoteId, amount_cents: amount, currency: "USD", pricing_policy_id: id(policy.pricing_policy_id),
      pricing_policy_version: integer(policy.version_number), pricing_policy_sha256: policyHash,
      calculation_sha256: calculationHash, line_items: lineItems },
    consent: { terms_version_id: termsId, terms_sha256: termsHash, creator_decision_id: id(d.creator_decision_id),
      buyer_acceptance_id: id(accept.buyer_acceptance_id), creator_approval_at: approvedAt, buyer_acceptance_at: acceptedAt,
      acceptance_copy_version: text(accept.acceptance_copy_version, 80) },
    ai_provenance: { extraction_attempt_id: last?.extraction_attempt_id ?? null, extractor_version: last?.extractor_version ?? null,
      model_id: last?.model_id ?? null, model_version: last?.model_version ?? null, artifact_hash: last?.artifact_hash ?? null,
      mode: "human_confirmed", extraction_history: provenance },
    payment: { provider: "paypal", environment: "sandbox", safe_invoice_reference: invoiceId,
      payment_status: invoiceState, confirmed_at: [...(invoiceState === "fully_refunded" ? refunded : paid)]
        .map(e => String(e.observed_at)).sort()[0]!,
      evidence: supportedEvidence.map(e => ({ payment_evidence_id: String(e.payment_evidence_id),
        evidence_sha256: String(e.evidence_hash), status: String(e.payment_status) })) },
    permission: { permission_id: permissionId, state, state_effective_at: effectiveAt, state_reason_code: text(p.state_reason_code, 120) },
  };
  return { material, materialHash: await canonicalHash(material), anchor, verificationId, publicId, permissionId, state,
    verificationStatus: text(v.current_status), currentReceiptId: v.current_receipt_revision_id === null ? null : id(v.current_receipt_revision_id) };
}
