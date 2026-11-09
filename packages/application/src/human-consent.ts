/** Durable creator decisions and capability-authorized buyer acceptance.
 * Every price/right comes from verified server records. No payment transport is available.
 */
import type { AuthorizedInvoiceSnapshot } from "../../paypal/src/contract";
import { canonicalHash, canonicalJson, sha256Hex } from "../../receipts/src/canonical";
import { verifyConsentDeal, type VerifiedConsentDeal } from "./consent-integrity";
import {
  BUYER_CONSENT_TEXT, BUYER_CONSENT_VERSION, CREATOR_CONSENT_TEXT, CREATOR_CONSENT_VERSION,
  ConsentError, consentFail, consentId, consentRow, consentTime,
  type BuyerConsentCommand, type ConsentCommit, type ConsentSnapshot, type ConsentStore,
  type CreatorConsentCommand, type CreatorPrincipal,
} from "./consent-contract";
const BASE_KEYS = ["requestId", "expectedCaseVersion", "termsVersionId", "quoteId", "reviewHash"];
function command(raw: unknown, role: "creator" | "buyer"): CreatorConsentCommand | BuyerConsentCommand {
  try {
    const encoded = canonicalJson(raw); if (encoded.length > 4096) consentFail("invalid_command");
    const c = consentRow(JSON.parse(encoded));
    const keys = [...BASE_KEYS, ...(role === "creator" ? ["decision", "reason", "confirmed", "copyVersion"]
      : ["creatorDecisionId", "acknowledged", "copyVersion"])].sort().join();
    if (Object.keys(c).sort().join() !== keys || !Number.isSafeInteger(c.expectedCaseVersion)
      || Number(c.expectedCaseVersion) < 1 || Number(c.expectedCaseVersion) >= Number.MAX_SAFE_INTEGER
      || typeof c.reviewHash !== "string" || !/^[0-9a-f]{64}$/u.test(c.reviewHash)) consentFail("invalid_command");
    for (const key of ["requestId", "termsVersionId", "quoteId"]) consentId(c[key]);
    if (role === "creator") {
      if (!["approved", "rejected", "clarification_requested"].includes(String(c.decision))
        || c.confirmed !== true || c.copyVersion !== CREATOR_CONSENT_VERSION
        || !(c.reason === null || (typeof c.reason === "string" && c.reason.length <= 500
          && c.reason.trim() === c.reason && c.reason.length > 0 && !/[\x00-\x1f\x7f]/u.test(c.reason)))
        || (c.decision !== "approved" && c.reason === null)) consentFail("invalid_command");
    } else if (c.acknowledged !== true || c.copyVersion !== BUYER_CONSENT_VERSION) consentFail("invalid_command");
    else consentId(c.creatorDecisionId);
    return Object.freeze(c) as unknown as CreatorConsentCommand | BuyerConsentCommand;
  } catch { return consentFail("invalid_command"); }
}
function cap(snapshot: ConsentSnapshot, at: string): string {
  try {
    const k = consentRow(snapshot.root.capability);
    if (k.case_id !== consentRow(snapshot.root.case).case_id || k.revoked_at !== null
      || consentTime(String(k.issued_at)) > at || consentTime(String(k.expires_at)) <= at
      || !Number.isSafeInteger(k.rotation_number) || Number(k.rotation_number) < 1) consentFail("not_authorized");
    const actions: unknown = JSON.parse(String(k.allowed_actions_json));
    if (!Array.isArray(actions) || actions.length > 4 || new Set(actions).size !== actions.length
      || actions.some(x => !["submit_request", "clarify", "review", "receipt"].includes(x))
      || !actions.includes("review")) consentFail("not_authorized");
    return consentId(k.buyer_capability_id);
  } catch { return consentFail("not_authorized"); }
}
function matching(row: unknown, d: VerifiedConsentDeal): boolean {
  if (row === null) return false;
  const r = consentRow(row); return r.case_id === d.caseId && r.terms_version_id === d.termsVersionId && r.quote_id === d.quoteId;
}
function openUninvoiced(s: ConsentSnapshot) {
  const c = consentRow(s.root.case);
  if (c.case_outcome !== "open" || c.invoice_binding_id !== null || c.permission_id !== null
    || s.root.invoiceCount !== 0 || s.root.operationCount !== 0 || s.root.permissionCount !== 0
    || s.root.receiptCount !== 0) consentFail("decision_locked");
}
function exact(c: CreatorConsentCommand | BuyerConsentCommand, d: VerifiedConsentDeal) {
  if (c.expectedCaseVersion !== d.caseVersion || c.termsVersionId !== d.termsVersionId
    || c.quoteId !== d.quoteId || c.reviewHash !== d.reviewHash) consentFail("stale_revision");
}
function commandRecord(s: ConsentSnapshot, key: string) {
  const records = (s.root.commands as unknown[]).map(consentRow).filter(r => r.idempotency_key === key);
  if (records.length > 1) consentFail("source_invalid");
  return records[0] ?? null;
}
function effectiveRecord(s: ConsentSnapshot, record: Record<string, unknown>, d: VerifiedConsentDeal) {
  const p = consentRow(JSON.parse(String(record.payload_json)));
  const source = record.actor_type === "creator" ? s.root.decision : s.root.acceptance;
  const idKey = record.actor_type === "creator" ? "creator_decision_id" : "buyer_acceptance_id";
  if (!matching(source, d) || consentRow(source)[idKey] !== p.result_id) consentFail("stale_command");
  const sourceRow = consentRow(source), creator = record.actor_type === "creator";
  if (p.version !== "human-consent-evidence-v1" || p.deal_sha256 !== d.dealHash
    || p.terms_sha256 !== d.termsHash || p.calculation_sha256 !== d.calculationHash || p.amount_cents !== d.amountCents
    || record.created_at !== sourceRow[creator ? "decided_at" : "accepted_at"]
    || (creator && (record.actor_reference !== sourceRow.actor_reference || p.decision !== sourceRow.decision))
    || (!creator && p.copy_version !== sourceRow.acceptance_copy_version)
    || record.event_type !== (creator ? `creator.${sourceRow.decision}` : "buyer.accepted")) consentFail("source_invalid");
  return p;
}
async function requireEvidence(s: ConsentSnapshot, d: VerifiedConsentDeal, role: "creator" | "buyer") {
  const source = consentRow(role === "creator" ? s.root.decision : s.root.acceptance);
  const resultId = source[role === "creator" ? "creator_decision_id" : "buyer_acceptance_id"];
  const records = (s.root.commands as unknown[]).map(consentRow).filter(r => r.actor_type === role && r.aggregate_id === resultId);
  if (records.length !== 1) consentFail("approval_required");
  const p = effectiveRecord(s, records[0]!, d), decision = consentRow(s.root.decision);
  const copy = role === "creator" ? CREATOR_CONSENT_TEXT : BUYER_CONSENT_TEXT;
  const version = role === "creator" ? CREATOR_CONSENT_VERSION : BUYER_CONSENT_VERSION;
  if (p.copy_version !== version || p.copy_sha256 !== await sha256Hex(copy) || p.acknowledged !== true
    || p.creator_decision_id !== decision.creator_decision_id || p.decision !== (role === "creator" ? "approved" : "accepted")) consentFail("approval_required");
}
export function createHumanConsentService(deps: {
  readonly store: ConsentStore;
  readonly authorizeCreator?: (caseId: string) => Promise<CreatorPrincipal | null>;
  readonly now?: () => Date;
}) {
  const clock = deps.now ?? (() => new Date());
  const time = () => consentTime(clock().toISOString());
  async function principal(caseId: string): Promise<CreatorPrincipal> {
    try {
      const found = await deps.authorizeCreator?.(caseId);
      if (!found || typeof found.actorReference !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/u.test(found.actorReference)) consentFail("not_authorized");
      return Object.freeze({ workspaceId: consentId(found.workspaceId), actorReference: found.actorReference });
    } catch { return consentFail("not_authorized"); }
  }
  async function buyer(token: string) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) consentFail("not_authorized");
    const digest = await sha256Hex(token), caseId = await deps.store.findBuyerCase(digest);
    if (!caseId) consentFail("not_authorized");
    return { digest, caseId: consentId(caseId) };
  }
  async function load(caseId: string, digest: string | null) {
    const s = await deps.store.load(caseId, digest);
    if (!s) consentFail(digest === null ? "not_found" : "not_authorized");
    if (consentRow(s.root.case).case_id !== caseId) consentFail("source_invalid");
    return s;
  }
  async function authorize(s: ConsentSnapshot, digest: string | null, owner: CreatorPrincipal | null, at: string) {
    if (digest !== null) return `capability:${cap(s, at)}`;
    const next = await principal(String(consentRow(s.root.case).case_id));
    if (!owner || next.workspaceId !== owner.workspaceId || next.actorReference !== owner.actorReference
      || consentRow(s.root.case).workspace_id !== owner.workspaceId) consentFail("not_authorized");
    return next.actorReference;
  }
  function view(s: ConsentSnapshot, d: VerifiedConsentDeal) {
    const c = consentRow(s.root.case), decision = s.root.decision === null ? null : consentRow(s.root.decision);
    const stage = c.case_outcome !== "open" ? String(c.case_outcome) : !matching(decision, d) ? "awaiting_creator"
      : decision!.decision === "clarification_requested" ? "clarification_required" : decision!.decision === "rejected" ? "rejected"
        : matching(s.root.acceptance, d) ? (s.root.invoiceCount === 0 && s.root.operationCount === 0 ? "accepted_awaiting_invoice" : "billing_started") : "awaiting_buyer";
    return Object.freeze({ schemaVersion: "human-consent-view-v1", environment: "sandbox", caseId: d.caseId,
      caseVersion: d.caseVersion, termsVersionId: d.termsVersionId, quoteId: d.quoteId, reviewHash: d.reviewHash,
      creatorDecisionId: matching(decision, d) ? String(decision!.creator_decision_id) : null,
      asset: d.asset, rights: d.rights, period: d.period, amountCents: d.amountCents, currency: "USD",
      lineItems: d.lines, stage, creatorCopyVersion: CREATOR_CONSENT_VERSION, creatorCopy: CREATOR_CONSENT_TEXT,
      buyerCopyVersion: BUYER_CONSENT_VERSION, buyerCopy: BUYER_CONSENT_TEXT,
      paymentConfirmed: false, permissionGranted: false });
  }
  async function review(caseId: string, digest: string | null, owner: CreatorPrincipal | null) {
    const s = await load(caseId, digest); await authorize(s, digest, owner, time());
    const d = await verifyConsentDeal(s, time());
    if (matching(s.root.decision, d) && consentRow(s.root.decision).decision === "approved") await requireEvidence(s, d, "creator");
    if (matching(s.root.acceptance, d)) await requireEvidence(s, d, "buyer");
    await authorize(s, digest, owner, time());
    const fresh = await load(caseId, digest);
    if (fresh.sourceJson !== s.sourceJson) consentFail("stale_revision");
    return view(s, d);
  }
  async function mutate(caseId: string, digest: string | null, owner: CreatorPrincipal | null,
    c: CreatorConsentCommand | BuyerConsentCommand, role: "creator" | "buyer") {
    const key = `human-consent:${role}:${c.requestId}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const s = await load(caseId, digest), actor = await authorize(s, digest, owner, time());
      const d = await verifyConsentDeal(s, time());
      const fingerprint = await canonicalHash({ schema: "human-consent-command-v1", role, caseId, actor, command: c });
      const prior = commandRecord(s, key);
      if (prior) {
        const p = consentRow(JSON.parse(String(prior.payload_json)));
        if (p.command_sha256 !== fingerprint || prior.actor_type !== role || prior.actor_reference !== actor) consentFail("idempotency_conflict");
        effectiveRecord(s, prior, d); await authorize(s, digest, owner, time());
        if ((await load(caseId, digest)).sourceJson !== s.sourceJson) consentFail("stale_revision");
        return Object.freeze({ outcome: "replayed", resultId: String(p.result_id), caseVersion: d.caseVersion,
          paymentConfirmed: false, permissionGranted: false });
      }
      openUninvoiced(s); exact(c, d);
      const decision = s.root.decision === null ? null : consentRow(s.root.decision);
      if (matching(s.root.acceptance, d)) consentFail("decision_locked");
      if (role === "creator") {
        if (matching(decision, d)) {
          if (decision!.decision === "clarification_requested" && (c as CreatorConsentCommand).decision === "approved") consentFail("clarification_required");
          if (decision!.decision === (c as CreatorConsentCommand).decision) consentFail("decision_locked");
        }
      } else if (!matching(decision, d) || decision!.decision !== "approved"
        || (c as BuyerConsentCommand).creatorDecisionId !== decision!.creator_decision_id) consentFail("approval_required");
      if (role === "buyer") await requireEvidence(s, d, "creator");
      const resultId = crypto.randomUUID(), copy = role === "creator" ? CREATOR_CONSENT_TEXT : BUYER_CONSENT_TEXT;
      const payload = canonicalJson({ version: "human-consent-evidence-v1", command_sha256: fingerprint, result_id: resultId,
        terms_version_id: d.termsVersionId, terms_sha256: d.termsHash, quote_id: d.quoteId, calculation_sha256: d.calculationHash,
        review_sha256: c.reviewHash, deal_sha256: d.dealHash, amount_cents: d.amountCents, currency: "USD", copy_version: c.copyVersion,
        copy_sha256: await sha256Hex(copy), acknowledged: true,
        creator_decision_id: role === "buyer" ? (c as BuyerConsentCommand).creatorDecisionId : resultId,
        decision: role === "creator" ? (c as CreatorConsentCommand).decision : "accepted", environment: "sandbox" });
      const at = time(); await authorize(s, digest, owner, at);
      const input: ConsentCommit = { snapshot: s, caseId, workspaceId: d.workspaceId, capabilityDigest: digest,
        capabilityId: digest === null ? null : cap(s, at), role, actorReference: actor, resultId, auditId: crypto.randomUUID(),
        idempotencyKey: key, commandHash: fingerprint, command: c, auditPayload: payload, at };
      try {
        await deps.store.commit(input);
        return Object.freeze({ outcome: "recorded", resultId, caseVersion: d.caseVersion + 1,
          paymentConfirmed: false, permissionGranted: false });
      } catch { /* Reload to resolve competing writers or a lost commit acknowledgement. */ }
    }
    return consentFail("storage_unavailable");
  }
  return Object.freeze({
    async reviewCreator(caseId: string) { consentId(caseId); return review(caseId, null, await principal(caseId)); },
    async reviewBuyer(token: string) { const b = await buyer(token); return review(b.caseId, b.digest, null); },
    async decideCreator(caseId: string, raw: unknown) {
      consentId(caseId); const owner = await principal(caseId);
      return mutate(caseId, null, owner, command(raw, "creator"), "creator");
    },
    async acceptBuyer(token: string, raw: unknown) {
      const b = await buyer(token); return mutate(b.caseId, b.digest, null, command(raw, "buyer"), "buyer");
    },
    /** Trusted server-side preparation only. NOT an HTTP response or external operation.
     * The invoice integration must re-read this authorization at its own final write gate.
     */
    async prepareInvoice(caseId: string): Promise<AuthorizedInvoiceSnapshot> {
      consentId(caseId); const s = await load(caseId, null); openUninvoiced(s);
      const checked = await verifyAcceptedInvoiceSnapshot(s, time());
      if ((await load(caseId, null)).sourceJson !== s.sourceJson) consentFail("stale_revision");
      return checked.request;
    },
  });
}
/** Validates retained human authority even after an invoice has been reserved.
 * It confers no right to create or resend: the operation service must apply its
 * own authenticated reservation and durable dispatch fence.
 */
export async function verifyAcceptedInvoiceSnapshot(s: ConsentSnapshot, at: string): Promise<{
  readonly deal: VerifiedConsentDeal; readonly request: AuthorizedInvoiceSnapshot;
}> {
  const d = await verifyConsentDeal(s, at), caseId = d.caseId;
  if (consentRow(s.root.case).case_outcome !== "open") consentFail("decision_locked");
  if (s.root.decision === null || s.root.acceptance === null) consentFail("approval_required");
  const decision = consentRow(s.root.decision), acceptance = consentRow(s.root.acceptance);
  if (!matching(decision, d) || !matching(acceptance, d) || decision.decision !== "approved"
    || acceptance.creator_decision_id !== decision.creator_decision_id || acceptance.acceptance_copy_version !== BUYER_CONSENT_VERSION
    || String(acceptance.accepted_at) < String(decision.decided_at)) consentFail("approval_required");
  await requireEvidence(s, d, "creator"); await requireEvidence(s, d, "buyer");
  const email = consentRow(s.root.request).buyer_email;
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) consentFail("source_invalid");
  const requestId = `rr_${(await canonicalHash({ caseId, quoteId: d.quoteId, termsVersionId: d.termsVersionId,
    creatorDecisionId: decision.creator_decision_id, buyerAcceptanceId: acceptance.buyer_acceptance_id })).slice(0, 32)}`;
  const request = Object.freeze({ caseId, assetId: d.assetId, termsVersionId: d.termsVersionId, quoteId: d.quoteId,
    creatorDecisionId: String(decision.creator_decision_id), buyerAcceptanceId: String(acceptance.buyer_acceptance_id),
    amountCents: d.amountCents, currency: "USD" as const, recipientEmail: email,
    rightsSummary: canonicalJson(d.rights), requestId });
  return Object.freeze({ deal: d, request });
}

export { ConsentError };
