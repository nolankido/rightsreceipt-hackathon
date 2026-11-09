import type { TermsVersionRecord, SupportedRightsValues } from "../../domain/src/rights-terms";
import { calculateQuote, validateQuoteableTerms, type PricingPolicyVersion } from "../../pricing/src/index";
import { canonicalHash, canonicalJson, sha256Hex } from "../../receipts/src/canonical";
import { consentFail, consentId, consentRow, consentTime, type ConsentSnapshot } from "./consent-contract";
function eq(a: unknown, b: unknown) { if (a !== b) consentFail("source_invalid"); }
function integer(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1 || v >= Number.MAX_SAFE_INTEGER) return consentFail("source_invalid");
  return v;
}
function safe(v: unknown, max: number): string {
  if (typeof v !== "string" || !v.length || v.length > max || /[\x00-\x1f\x7f]/u.test(v)) return consentFail("source_invalid");
  canonicalJson(v); return v;
}
export interface VerifiedConsentDeal {
  readonly caseId: string; readonly workspaceId: string; readonly caseVersion: number;
  readonly assetId: string; readonly termsVersionId: string; readonly quoteId: string;
  readonly termsHash: string; readonly calculationHash: string; readonly dealHash: string; readonly reviewHash: string;
  readonly amountCents: number; readonly rights: SupportedRightsValues;
  readonly period: { readonly startDate: string; readonly endDateExclusive: string; readonly lastPermittedDate: string };
  readonly lines: readonly { readonly code: string; readonly description: string; readonly amountCents: number }[];
  readonly asset: { readonly title: string; readonly creator: string; readonly fingerprint: string };
}
/** Reuses the actual deterministic pricing implementation, not a second pricing formula.
 * Source data stays server-side; never accept a browser-supplied price or rights object.
 */
export async function verifyConsentDeal(snapshot: ConsentSnapshot, at: string): Promise<VerifiedConsentDeal> {
  try {
    consentTime(at);
    const r = snapshot.root, c = consentRow(r.case), t = consentRow(r.terms), q = consentRow(r.quote);
    const y = consentRow(r.policy), w = consentRow(r.workspace), a = consentRow(r.asset), request = consentRow(r.request);
    const caseId = consentId(c.case_id), workspaceId = consentId(c.workspace_id);
    const termsVersionId = consentId(t.terms_version_id), quoteId = consentId(q.quote_id), assetId = consentId(a.asset_id);
    eq(c.latest_terms_version_id, termsVersionId); eq(c.latest_quote_id, quoteId); eq(c.asset_id, assetId);
    eq(a.workspace_id, workspaceId); eq(w.workspace_id, workspaceId); eq(y.workspace_id, workspaceId);
    eq(request.request_submission_id, c.request_submission_id); eq(request.case_id, caseId); eq(request.consent_acknowledged, 1);
    eq(t.case_id, caseId); eq(q.case_id, caseId); eq(q.terms_version_id, termsVersionId);
    eq(t.resolution_status, "complete"); eq(t.source_kind, "human_corrected"); eq(t.created_by_actor, "creator");
    eq(q.status, "current"); eq(q.currency, "USD"); eq(y.currency, "USD"); eq(y.status, "active");
    eq(q.pricing_policy_id, y.pricing_policy_id); eq(q.pricing_policy_version, y.version_number);
    eq(w.default_pricing_policy_id, y.pricing_policy_id); eq(w.default_pricing_policy_version, y.version_number);
    eq(a.availability, "active");
    for (const value of [c.row_version, a.row_version, w.row_version, t.version_number, q.quote_version_number]) integer(value);
    for (const value of [t.created_at, q.created_at, request.submitted_at, c.updated_at]) {
      if (consentTime(String(value)) > at) consentFail("source_invalid");
    }
    if (String(q.created_at) < String(t.created_at)) consentFail("source_invalid");
    const terms = {
      termsVersionId, caseId, versionNumber: t.version_number, resolutionStatus: t.resolution_status,
      usePurpose: t.use_purpose, channels: JSON.parse(String(t.channels_json)), paidAdvertising: t.paid_advertising === 1 ? true : null,
      territories: JSON.parse(String(t.territories_json)), startDate: t.start_date, durationDays: t.duration_days,
      maxImpressions: t.max_impressions, exclusivity: t.exclusivity, modificationScope: t.modification_scope,
      attribution: t.attribution, sublicensing: t.sublicensing, aiUse: t.ai_use, sourceKind: t.source_kind,
      termsHash: t.terms_hash, createdByActor: t.created_by_actor, createdAt: t.created_at,
    } as TermsVersionRecord;
    const policy = {
      pricingPolicyId: y.pricing_policy_id, workspaceId, versionNumber: y.version_number, policyName: y.policy_name,
      currency: y.currency, rulesJson: y.rules_json, policyHash: y.policy_hash, status: y.status,
    } as PricingPolicyVersion;
    const rights = validateQuoteableTerms(terms);
    eq(JSON.stringify(terms.channels), JSON.stringify(rights.channels));
    eq(JSON.stringify(terms.territories), JSON.stringify(rights.territories));
    const termsHash = await canonicalHash({ schema_version: "rights-review-v1",
      fields: Object.fromEntries(Object.entries(rights).map(([key, value]) => [key, { state: "resolved", value }])) });
    eq(t.terms_hash, termsHash); eq(await sha256Hex(safe(y.rules_json, 32768)), y.policy_hash);
    const calculated = calculateQuote(terms, policy);
    const calculationHash = await sha256Hex(calculated.calculationCanonicalJson);
    eq(q.calculation_hash, calculationHash); eq(q.amount_cents, calculated.totalCents);
    if (calculated.totalCents < 1 || calculated.totalCents > 1_000_000_000) consentFail("source_invalid");
    if (!Array.isArray(r.lines) || r.lines.length !== calculated.lineItems.length) consentFail("source_invalid");
    r.lines.forEach((raw, i) => {
      const line = consentRow(raw), expected = calculated.lineItems[i]!;
      eq(line.quote_id, quoteId); eq(line.line_position, i + 1); eq(line.line_code, expected.code);
      eq(line.description, expected.description); eq(line.amount_cents, expected.amountCents);
    });
    if (!Array.isArray(r.commands) || r.commands.length > 128) consentFail("source_invalid");
    const decision = r.decision === null ? null : consentRow(r.decision);
    const acceptance = r.acceptance === null ? null : consentRow(r.acceptance);
    if (decision) {
      eq(c.latest_creator_decision_id, consentId(decision.creator_decision_id)); eq(decision.case_id, caseId);
      if (consentTime(String(decision.decided_at)) > at) consentFail("source_invalid");
    } else eq(c.latest_creator_decision_id, null);
    if (acceptance) {
      eq(c.latest_buyer_acceptance_id, consentId(acceptance.buyer_acceptance_id)); eq(acceptance.case_id, caseId);
      if (consentTime(String(acceptance.accepted_at)) > at) consentFail("source_invalid");
    } else eq(c.latest_buyer_acceptance_id, null);
    const asset = { title: safe(a.title, 200), creator: safe(a.creator_display_name, 120), fingerprint: safe(a.fingerprint_value, 64) };
    if (!/^[0-9a-f]{64}$/u.test(asset.fingerprint)) consentFail("source_invalid");
    const period = { startDate: calculated.licenseStartDate, endDateExclusive: calculated.licenseEndDateExclusive,
      lastPermittedDate: calculated.lastPermittedDate };
    const recipient = safe(request.buyer_email, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient)) consentFail("source_invalid");
    const dealHash = await canonicalHash({ schema_version: "human-consent-deal-v1", case_id: caseId, workspace_id: workspaceId,
      asset_id: assetId, asset, request_submission_id: request.request_submission_id, recipient_sha256: await sha256Hex(recipient),
      terms_version_id: termsVersionId, quote_id: quoteId, terms_hash: termsHash, calculation_hash: calculationHash,
      policy_id: y.pricing_policy_id, policy_version: y.version_number, rights, period, amount_cents: calculated.totalCents, currency: "USD" });
    const reviewHash = await canonicalHash({ schema_version: "human-consent-review-v1", deal_sha256: dealHash,
      creator_decision_id: decision?.creator_decision_id ?? null, decision: decision?.decision ?? null });
    return Object.freeze({ caseId, workspaceId, caseVersion: integer(c.row_version), assetId, termsVersionId, quoteId,
      termsHash, calculationHash, dealHash, reviewHash, amountCents: calculated.totalCents, rights, period, lines: calculated.lineItems, asset });
  } catch { return consentFail("source_invalid"); }
}
