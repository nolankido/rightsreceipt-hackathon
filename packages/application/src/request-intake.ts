/** Authenticated issuance and immutable buyer intake, with exact deliberate retry evidence. */
import { BUYER_REQUEST_CONSENT_COPY, BUYER_REQUEST_CONSENT_COPY_VERSION, createBuyerRequestSubmissionRecord,
  type BuyerRequestSubmissionRecord } from "../../domain/src/buyer-requests";
import { canonicalHash, canonicalJson, parseCanonical, sha256Hex } from "../../receipts/src/canonical";
import type { CreatorPrincipal } from "./consent-contract";
import { CAPABILITY_LIFETIME_SECONDS, INTAKE_ACTIONS, INTAKE_VERSION, LINK_COPY, LINK_COPY_VERSION, RequestIntakeError,
  intakeFail as fail, type BuyerIntakeView, type CreatorIntakeView, type IntakeAsset, type IntakeSnapshot, type LinkCommand,
  type LinkResult, type OriginalRequest, type RequestCommand, type RequestIntakePrincipal, type RequestIntakeStore, type RequestResult } from "./request-intake-contract";
export { RequestIntakeError } from "./request-intake-contract";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const AUTHORITY = Object.freeze({ version: INTAKE_VERSION, paymentConfirmed: false, permissionGranted: false } as const);
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("source_invalid"); return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).sort().join() !== [...keys].sort().join()) fail("source_invalid");
}
function id(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) return fail("source_invalid"); return value; }
function hash(value: unknown): string { if (typeof value !== "string" || !HASH.test(value)) return fail("source_invalid"); return value; }
function int(value: unknown, min = 1): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) >= Number.MAX_SAFE_INTEGER) return fail("source_invalid"); return Number(value);
}
function instant(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return fail("source_invalid"); return value;
}
function text(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string" || !value.length || Array.from(value).length > max
    || (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u : /[\x00-\x1f\x7f]/u).test(value)) return fail("source_invalid");
  canonicalJson(value); return value;
}
function command(raw: unknown, buyer: false): LinkCommand;
function command(raw: unknown, buyer: true): RequestCommand;
function command(raw: unknown, buyer: boolean): LinkCommand | RequestCommand {
  try {
    const c = row(JSON.parse(canonicalJson(raw)));
    exact(c, buyer ? ["requestId", "expectedCaseVersion", "reviewHash", "buyerName", "buyerOrganization", "buyerEmail", "intendedUseText", "consentAcknowledged", "copyVersion"]
      : ["requestId", "expectedAssetVersion", "reviewHash", "tokenDigestSha256", "confirmed", "copyVersion"]);
    id(c.requestId); int(c[buyer ? "expectedCaseVersion" : "expectedAssetVersion"]); hash(c.reviewHash);
    if (buyer) {
      if (c.consentAcknowledged !== true || c.copyVersion !== BUYER_REQUEST_CONSENT_COPY_VERSION) fail("invalid_command");
      for (const name of ["buyerName", "buyerOrganization", "buyerEmail", "intendedUseText"]) if (typeof c[name] !== "string") fail("invalid_command");
      const normalized = createBuyerRequestSubmissionRecord(c as unknown as RequestCommand, {
        requestSubmissionId: c.requestId as string, caseId: c.requestId as string, submittedAt: "2026-01-01T00:00:00.000Z",
      });
      text(normalized.buyerName, 100); text(normalized.buyerOrganization, 120); text(normalized.buyerEmail, 254);
      text(normalized.intendedUseText, 4000, true);
    } else {
      hash(c.tokenDigestSha256);
      if (c.confirmed !== true || c.copyVersion !== LINK_COPY_VERSION) fail("invalid_command");
    }
    return Object.freeze(c) as unknown as LinkCommand | RequestCommand;
  } catch { return fail("invalid_command"); }
}
function asset(source: Record<string, unknown>, at: string) {
  const a = row(source.asset), w = row(source.workspace);
  const assetId = id(a.asset_id), workspaceId = id(a.workspace_id), assetVersion = int(a.row_version);
  if (id(w.workspace_id) !== workspaceId || w.mode !== "demo" || a.availability !== "active") fail("not_authorized");
  int(w.row_version); text(w.display_name, 120);
  for (const record of [a, w]) if (instant(record.created_at) > instant(record.updated_at) || instant(record.updated_at) > at) fail("source_invalid");
  if (w.default_pricing_policy_id !== null) id(w.default_pricing_policy_id);
  if (w.default_pricing_policy_version !== null) int(w.default_pricing_policy_version);
  if ((w.default_pricing_policy_id === null) !== (w.default_pricing_policy_version === null)) fail("source_invalid");
  if (!["photograph", "illustration"].includes(String(a.asset_type)) || a.fingerprint_algorithm !== "sha256") fail("source_invalid");
  text(a.preview_reference, 500);
  const view: IntakeAsset = { assetId, title: text(a.title, 200), assetType: a.asset_type as IntakeAsset["assetType"],
    creatorDisplayName: text(a.creator_display_name, 120), provenanceNote: text(a.provenance_note, 2000, true),
    fingerprintAlgorithm: "sha256", fingerprintValue: hash(a.fingerprint_value) };
  return { assetId, workspaceId, assetVersion, view };
}
function capability(s: IntakeSnapshot, digest: string, at: string) {
  try {
    const k = row(s.root.capability), c = row(s.root.case);
    if (k.case_id !== c.case_id || k.token_digest_sha256 !== digest || k.revoked_at !== null || k.rotation_number !== 1
      || instant(k.issued_at) > at || instant(k.expires_at) <= at
      || Date.parse(String(k.expires_at)) - Date.parse(String(k.issued_at)) !== CAPABILITY_LIFETIME_SECONDS * 1000
      || canonicalJson(JSON.parse(String(k.allowed_actions_json))) !== canonicalJson(INTAKE_ACTIONS)
      || s.root.capabilityCount !== 1) fail("not_authorized");
    id(k.buyer_capability_id); return k;
  } catch { return fail("not_authorized"); }
}
function auditPayload(a: Record<string, unknown>, kind: "link" | "request") {
  const p = row(parseCanonical(String(a.payload_json)));
  if (a.aggregate_type !== "request_intake" || a.aggregate_sequence !== 1 || a.event_type !== `request_intake.${kind === "link" ? "link_issued" : "request_submitted"}`
    || a.actor_type !== (kind === "link" ? "creator" : "buyer") || a.audit_event_id !== p.requestId || a.correlation_id !== p.requestId
    || a.idempotency_key !== `request-intake:${kind}:${p.requestId}` || a.case_id !== p.caseId || p.version !== INTAKE_VERSION || p.kind !== kind) fail("source_invalid");
  id(p.requestId); id(p.caseId); id(p.workspaceId); hash(p.commandHash); hash(p.reviewHash); hash(p.copyHash);
  return p;
}
const assetHash = (source: Readonly<Record<string, unknown>>) => canonicalHash({ version: "request-intake-asset-v1", source });
const caseHash = (source: Readonly<Record<string, unknown>>) => canonicalHash({ version: "request-intake-case-v1", source });
const linkHash = (c: LinkCommand, assetId: string, owner: CreatorPrincipal) => canonicalHash({ version: INTAKE_VERSION, kind: "link", assetId,
  owner: { workspaceId: owner.workspaceId, actorReference: owner.actorReference }, command: c });
const requestHash = (c: RequestCommand, caseId: string, capabilityId: string) => canonicalHash({ version: INTAKE_VERSION, kind: "request", caseId, capabilityId, command: c });
export function createRequestIntakeService(deps: {
  readonly store: RequestIntakeStore; readonly authorizeCreatorAsset?: (assetId: string) => Promise<RequestIntakePrincipal | null>;
  readonly now?: () => Date; readonly checkActive?: () => void;
}) {
  function time() {
    deps.checkActive?.(); const now = (deps.now?.() ?? new Date()).toISOString(); instant(now); return now;
  }
  function principalTime(p: RequestIntakePrincipal) {
    const at = time();
    if (!Number.isSafeInteger(p.expiresAt) || p.expiresAt <= Math.floor(Date.parse(at) / 1000)) fail("not_authorized");
    return at;
  }
  async function storage<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) { if (error instanceof RequestIntakeError) throw error; return fail("storage_unavailable"); }
  }
  async function principal(assetId: string, prior?: CreatorPrincipal) {
    try {
      time(); const p = await deps.authorizeCreatorAsset?.(assetId); time();
      if (!p || !UUID.test(p.workspaceId) || typeof p.actorReference !== "string" || !p.actorReference.length
        || p.actorReference.length > 200 || /[\x00-\x1f\x7f]/u.test(p.actorReference)
        || (prior && (prior.workspaceId !== p.workspaceId || prior.actorReference !== p.actorReference))) fail("not_authorized");
      principalTime(p);
      return { workspaceId: p.workspaceId, actorReference: p.actorReference, expiresAt: p.expiresAt };
    } catch { return fail("not_authorized"); }
  }
  async function loadAsset(assetId: string) {
    const s = await storage(() => deps.store.loadAsset(assetId)); time(); if (!s) fail("not_found"); return s;
  }
  async function loadCase(caseId: string, digest: string) {
    const s = await storage(() => deps.store.loadCase(caseId, digest)); time(); if (!s) fail("not_authorized");
    capability(s, digest, time()); return s;
  }
  async function ownerCheck(s: IntakeSnapshot, assetId: string, owner: RequestIntakePrincipal) {
    const p = await principal(assetId, owner), a = asset(s.root, time());
    if (a.assetId !== assetId || a.workspaceId !== p.workspaceId) fail("not_authorized");
    return p;
  }
  async function finalAsset(s: IntakeSnapshot, assetId: string, owner: RequestIntakePrincipal) {
    await ownerCheck(s, assetId, owner);
    const fresh = await loadAsset(assetId), verified = await ownerCheck(fresh, assetId, owner);
    if (fresh.sourceJson !== s.sourceJson) fail("stale_revision");
    const current = await storage(() => deps.store.checkAsset(s, assetId));
    // Keep SQL after the final asynchronous authorization. The already verified
    // JWT deadline and route policy/abort fence can then be checked synchronously.
    principalTime(verified); if (!current) fail("stale_revision"); return verified;
  }
  async function finalCase(s: IntakeSnapshot, caseId: string, digest: string, owner?: RequestIntakePrincipal) {
    capability(s, digest, time());
    const assetId = id(row(s.root.case).asset_id);
    let verified = owner ?? null;
    if (owner) await ownerCheck({ sourceJson: "", root: row(s.root.assetSource) }, assetId, owner);
    const fresh = await loadCase(caseId, digest);
    if (owner) verified = await ownerCheck({ sourceJson: "", root: row(fresh.root.assetSource) }, assetId, owner);
    if (fresh.sourceJson !== s.sourceJson) fail("stale_revision");
    const checked = await storage(() => deps.store.checkCase(s, caseId, digest, time()));
    const checkedAt = verified ? principalTime(verified) : time();
    if (checked === "unauthorized") fail("not_authorized"); if (checked !== "current") fail("stale_revision");
    capability(fresh, digest, checkedAt); return verified;
  }
  async function inspect(s: IntakeSnapshot, digest: string, readOnly = false) {
    try {
      const at = time(), c = row(s.root.case), k = capability(s, digest, at), liveSource = row(s.root.assetSource);
      const liveAsset = row(liveSource.asset), liveWorkspace = row(liveSource.workspace), continuation = readOnly && c.request_submission_id !== null;
      const caseId = id(c.case_id), caseVersion = int(c.row_version), counts = row(s.root.counts);
      if (c.asset_id !== id(liveAsset.asset_id) || c.workspace_id !== id(liveAsset.workspace_id)
        || c.workspace_id !== id(liveWorkspace.workspace_id) || !["open", "rejected", "canceled"].includes(String(c.case_outcome))) fail("source_invalid");
      if (!continuation && (c.case_outcome !== "open"
        || c.invoice_binding_id !== null || c.permission_id !== null || c.verification_record_id !== null
        || counts.invoice_bindings !== 0 || counts.payment_operations !== 0 || counts.permissions !== 0
        || counts.verification_records !== 0 || s.root.receiptCount !== 0)) fail("decision_locked");
      if (instant(c.created_at) > instant(c.updated_at) || instant(c.updated_at) > at) fail("source_invalid");
      for (const name of ["request_submission_id", "latest_extraction_attempt_id", "latest_terms_version_id", "latest_quote_id", "latest_creator_decision_id", "latest_buyer_acceptance_id",
        "invoice_binding_id", "permission_id", "verification_record_id"]) {
        if (c[name] !== null) id(c[name]);
      }
      Object.values(counts).forEach(n => int(n, 0));
      if (!Array.isArray(s.root.audits) || s.root.audits.length < 1 || s.root.audits.length > 2) fail("source_invalid");
      const audits = s.root.audits.map(row), links = audits.filter(e => e.event_type === "request_intake.link_issued");
      if (links.length !== 1) fail("source_invalid");
      const issueAudit = links[0]!, issued = auditPayload(issueAudit, "link");
      exact(issued, ["version", "kind", "requestId", "commandHash", "assetId", "workspaceId", "actorReference", "assetVersion", "reviewHash",
        "tokenDigestSha256", "capabilityId", "caseId", "issuedAt", "expiresAt", "copyVersion", "copyHash", "allowedActions", "assetSource"]);
      const a = asset(row(issued.assetSource), instant(issued.issuedAt));
      if (issued.assetId !== a.assetId || issued.workspaceId !== a.workspaceId || issued.assetVersion !== a.assetVersion
        || issued.reviewHash !== await assetHash(row(issued.assetSource)) || c.asset_id !== a.assetId || c.workspace_id !== a.workspaceId) fail("source_invalid");
      if (!continuation) {
        asset(liveSource, at);
        if (issued.reviewHash !== await assetHash(liveSource)) fail("stale_revision");
      }
      if (issued.capabilityId !== k.buyer_capability_id || issueAudit.aggregate_id !== k.buyer_capability_id || issued.tokenDigestSha256 !== digest
        || issued.caseId !== caseId || issued.issuedAt !== k.issued_at || issued.expiresAt !== k.expires_at || issueAudit.created_at !== k.issued_at
        || c.created_at !== k.issued_at || issued.copyVersion !== LINK_COPY_VERSION || issued.copyHash !== await sha256Hex(LINK_COPY)
        || issueAudit.actor_reference !== issued.actorReference || canonicalJson(issued.allowedActions) !== canonicalJson(INTAKE_ACTIONS)) fail("source_invalid");
      text(issued.actorReference, 200);
      const reconstructed: LinkCommand = { requestId: id(issued.requestId), expectedAssetVersion: a.assetVersion, reviewHash: hash(issued.reviewHash),
        tokenDigestSha256: digest, confirmed: true, copyVersion: LINK_COPY_VERSION };
      if (issued.commandHash !== await linkHash(reconstructed, a.assetId, { workspaceId: a.workspaceId, actorReference: String(issued.actorReference) })) fail("source_invalid");
      let original: OriginalRequest | null = null, record: BuyerRequestSubmissionRecord | null = null, submitted: Record<string, unknown> | null = null;
      if (c.request_submission_id === null) {
        if (s.root.request !== null || audits.length !== 1 || caseVersion !== 1 || Object.values(counts).some(n => n !== 0)
          || [c.latest_extraction_attempt_id, c.latest_terms_version_id, c.latest_quote_id, c.latest_creator_decision_id, c.latest_buyer_acceptance_id].some(v => v !== null)) fail("source_invalid");
      } else {
        const r = row(s.root.request), requestAudits = audits.filter(e => e.event_type === "request_intake.request_submitted");
        if (counts.request_submissions !== 1 || audits.length !== 2 || requestAudits.length !== 1 || r.case_id !== caseId
          || r.request_submission_id !== c.request_submission_id || r.consent_acknowledged !== 1 || r.consent_copy_version !== BUYER_REQUEST_CONSENT_COPY_VERSION
          || instant(r.submitted_at) < String(k.issued_at) || instant(r.submitted_at) > at) fail("source_invalid");
        record = createBuyerRequestSubmissionRecord({ buyerName: text(r.buyer_name, 100), buyerOrganization: text(r.buyer_organization, 120),
          buyerEmail: text(r.buyer_email, 254), intendedUseText: text(r.intended_use_text, 4000, true), consentAcknowledged: true },
        { requestSubmissionId: id(r.request_submission_id), caseId, submittedAt: instant(r.submitted_at) });
        if (record.buyerName !== r.buyer_name || record.buyerOrganization !== r.buyer_organization || record.buyerEmail !== r.buyer_email
          || record.normalizedText !== r.normalized_text) fail("source_invalid");
        const requestAudit = requestAudits[0]!; submitted = auditPayload(requestAudit, "request");
        exact(submitted, ["version", "kind", "requestId", "commandHash", "caseId", "workspaceId", "capabilityId", "sourceCaseVersion", "reviewHash",
          "requestSubmissionId", "requestHash", "submittedAt", "copyVersion", "copyHash"]);
        if (submitted.caseId !== caseId || submitted.workspaceId !== a.workspaceId || submitted.capabilityId !== k.buyer_capability_id
          || submitted.requestSubmissionId !== r.request_submission_id || requestAudit.aggregate_id !== r.request_submission_id
          || requestAudit.actor_reference !== `buyer-capability:${k.buyer_capability_id}` || submitted.sourceCaseVersion !== 1 || caseVersion < 2
          || submitted.submittedAt !== r.submitted_at || requestAudit.created_at !== r.submitted_at || submitted.copyVersion !== BUYER_REQUEST_CONSENT_COPY_VERSION
          || submitted.copyHash !== await sha256Hex(BUYER_REQUEST_CONSENT_COPY) || submitted.requestHash !== await canonicalHash(record)) fail("source_invalid");
        original = { requestSubmissionId: record.requestSubmissionId, buyerName: record.buyerName, buyerOrganization: record.buyerOrganization,
          buyerEmail: record.buyerEmail, intendedUseText: record.intendedUseText, submittedAt: record.submittedAt, consentCopyVersion: BUYER_REQUEST_CONSENT_COPY_VERSION };
      }
      return { a, c, k, caseId, caseVersion, issued, submitted, original, record, reviewHash: await caseHash(s.root) };
    } catch (error) { if (error instanceof RequestIntakeError) throw error; return fail("source_invalid"); }
  }
  async function buyer(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) fail("not_authorized");
    const digest = await sha256Hex(token), caseId = await storage(() => deps.store.findBuyerCase(digest)); time();
    if (!caseId) fail("not_authorized"); return { digest, caseId: id(caseId) };
  }
  async function existing(requestId: string) { return storage(() => deps.store.findCommand(requestId)); }
  async function linkResult(old: Readonly<Record<string, unknown>>, c: LinkCommand, assetId: string, owner: RequestIntakePrincipal, replayed: boolean): Promise<LinkResult> {
    if (old.aggregate_type !== "request_intake" || old.event_type !== "request_intake.link_issued" || old.actor_reference !== owner.actorReference) fail("idempotency_conflict");
    let p: Record<string, unknown>;
    try { p = auditPayload(row(old), "link"); } catch { return fail("idempotency_conflict"); }
    if (p.assetId !== assetId || p.workspaceId !== owner.workspaceId || p.commandHash !== await linkHash(c, assetId, owner)
      || p.tokenDigestSha256 !== c.tokenDigestSha256) fail("idempotency_conflict");
    const s = await loadCase(id(p.caseId), c.tokenDigestSha256), v = await inspect(s, c.tokenDigestSha256);
    if (v.issued.requestId !== c.requestId || v.issued.commandHash !== p.commandHash) fail("source_invalid");
    if (v.caseVersion !== 1 || v.original !== null) fail("stale_command");
    const verified = await finalCase(s, v.caseId, c.tokenDigestSha256, owner);
    if (!verified) fail("not_authorized"); const checkedAt = principalTime(verified);
    return Object.freeze({ ...AUTHORITY, outcome: "issued", requestId: c.requestId, caseId: v.caseId, buyerCapabilityId: id(v.k.buyer_capability_id),
      assetId, assetVersion: v.a.assetVersion, caseVersion: 1, issuedAt: instant(v.k.issued_at), expiresAt: instant(v.k.expires_at), checkedAt, replayed,
      requestPath: "/buyer/request", creatorReviewPath: `/creator/clarification/${v.caseId}`, allowedActions: INTAKE_ACTIONS });
  }
  async function submittedResult(old: Readonly<Record<string, unknown>>, c: RequestCommand, caseId: string, digest: string, replayed: boolean): Promise<RequestResult> {
    if (old.aggregate_type !== "request_intake" || old.event_type !== "request_intake.request_submitted" || old.case_id !== caseId) fail("idempotency_conflict");
    const s = await loadCase(caseId, digest), v = await inspect(s, digest);
    if (!v.submitted || !v.record || v.submitted.requestId !== c.requestId || v.submitted.commandHash !== await requestHash(c, caseId, id(v.k.buyer_capability_id))) fail("idempotency_conflict");
    if (v.caseVersion !== c.expectedCaseVersion + 1) fail("stale_command");
    await finalCase(s, caseId, digest);
    return Object.freeze({ ...AUTHORITY, outcome: "submitted", requestId: c.requestId, requestSubmissionId: v.record.requestSubmissionId,
      caseId, caseVersion: v.caseVersion, submittedAt: v.record.submittedAt, checkedAt: time(), accessExpiresAt: instant(v.k.expires_at), replayed,
      nextPath: "/buyer/clarification" });
  }
  return Object.freeze({
    async reviewCreator(assetId: string): Promise<CreatorIntakeView> {
      id(assetId); const owner = await principal(assetId), s = await loadAsset(assetId); await ownerCheck(s, assetId, owner);
      const a = asset(s.root, time()), reviewHash = await assetHash(s.root), verified = await finalAsset(s, assetId, owner);
      return Object.freeze({ ...AUTHORITY, checkedAt: principalTime(verified), assetVersion: a.assetVersion, reviewHash, asset: a.view,
        copyVersion: LINK_COPY_VERSION, copy: LINK_COPY, capabilityLifetimeSeconds: CAPABILITY_LIFETIME_SECONDS, allowedActions: INTAKE_ACTIONS });
    },
    async issueLink(assetId: string, raw: unknown): Promise<LinkResult> {
      id(assetId); const c = command(raw, false), owner = await principal(assetId), s = await loadAsset(assetId); await ownerCheck(s, assetId, owner);
      const old = await existing(c.requestId); if (old) return linkResult(old, c, assetId, owner, true);
      const a = asset(s.root, time());
      if (c.expectedAssetVersion !== a.assetVersion || c.reviewHash !== await assetHash(s.root)) fail("stale_revision");
      const caseId = crypto.randomUUID(), capabilityId = crypto.randomUUID(), commandHash = await linkHash(c, assetId, owner), copyHash = await sha256Hex(LINK_COPY);
      const verified = await finalAsset(s, assetId, owner);
      const at = principalTime(verified), expiresAt = new Date(Date.parse(at) + CAPABILITY_LIFETIME_SECONDS * 1000).toISOString();
      const auditPayload = canonicalJson({ version: INTAKE_VERSION, kind: "link", requestId: c.requestId, commandHash,
        assetId, workspaceId: owner.workspaceId, actorReference: owner.actorReference, assetVersion: a.assetVersion, reviewHash: c.reviewHash,
        tokenDigestSha256: c.tokenDigestSha256, capabilityId, caseId, issuedAt: at, expiresAt, copyVersion: LINK_COPY_VERSION, copyHash,
        allowedActions: INTAKE_ACTIONS, assetSource: s.root });
      principalTime(verified);
      let acknowledged = false;
      try { await deps.store.commitLink({ snapshot: s, command: c, caseId, capabilityId, workspaceId: owner.workspaceId,
        assetId, actorReference: owner.actorReference, auditPayload, at, expiresAt }); acknowledged = true; } catch { /* Read committed evidence before reporting an uncertain result. */ }
      time(); const recorded = await existing(c.requestId);
      if (recorded) return linkResult(recorded, c, assetId, owner, !acknowledged);
      await finalAsset(s, assetId, owner);
      if (await storage(() => deps.store.findBuyerCase(c.tokenDigestSha256))) fail("idempotency_conflict");
      return fail("storage_unavailable");
    },
    async reviewBuyer(token: string): Promise<BuyerIntakeView> {
      const b = await buyer(token), s = await loadCase(b.caseId, b.digest), v = await inspect(s, b.digest, true); await finalCase(s, b.caseId, b.digest);
      const counts = row(s.root.counts), nextPath = v.original !== null && (v.c.latest_quote_id !== null || v.c.case_outcome !== "open"
        || counts.invoice_bindings !== 0 || counts.payment_operations !== 0 || counts.permissions !== 0 || counts.verification_records !== 0)
        ? "/buyer/review" : v.original !== null && row(row(s.root.assetSource).asset).availability === "archived" ? null : "/buyer/clarification";
      return Object.freeze({ ...AUTHORITY, checkedAt: time(), accessExpiresAt: instant(v.k.expires_at), caseId: b.caseId, caseVersion: v.caseVersion,
        reviewHash: v.reviewHash, asset: v.a.view, alreadySubmitted: v.original !== null, originalRequest: v.original,
        copyVersion: BUYER_REQUEST_CONSENT_COPY_VERSION, copy: BUYER_REQUEST_CONSENT_COPY, nextPath });
    },
    async submitRequest(token: string, raw: unknown): Promise<RequestResult> {
      const c = command(raw, true), b = await buyer(token), s = await loadCase(b.caseId, b.digest), v = await inspect(s, b.digest);
      const old = await existing(c.requestId); if (old) return submittedResult(old, c, b.caseId, b.digest, true);
      if (v.original !== null) fail("request_already_submitted");
      if (c.expectedCaseVersion !== v.caseVersion || c.reviewHash !== v.reviewHash) fail("stale_revision");
      const commandHash = await requestHash(c, b.caseId, id(v.k.buyer_capability_id)), copyHash = await sha256Hex(BUYER_REQUEST_CONSENT_COPY);
      await finalCase(s, b.caseId, b.digest);
      const at = time(), record = createBuyerRequestSubmissionRecord(c, { requestSubmissionId: crypto.randomUUID(), caseId: b.caseId, submittedAt: at });
      const auditPayload = canonicalJson({ version: INTAKE_VERSION, kind: "request", requestId: c.requestId, commandHash,
        caseId: b.caseId, workspaceId: v.a.workspaceId, capabilityId: v.k.buyer_capability_id, sourceCaseVersion: c.expectedCaseVersion,
        reviewHash: c.reviewHash, requestSubmissionId: record.requestSubmissionId, requestHash: await canonicalHash(record),
        submittedAt: at, copyVersion: BUYER_REQUEST_CONSENT_COPY_VERSION, copyHash });
      capability(s, b.digest, time());
      let acknowledged = false;
      try { await deps.store.commitRequest({ snapshot: s, command: c, record, digest: b.digest, capabilityId: id(v.k.buyer_capability_id),
        workspaceId: v.a.workspaceId, auditPayload, at, checkAt: time() }); acknowledged = true; } catch { /* Read committed evidence before reporting an uncertain result. */ }
      time(); const recorded = await existing(c.requestId);
      if (recorded) return submittedResult(recorded, c, b.caseId, b.digest, !acknowledged);
      await finalCase(s, b.caseId, b.digest); return fail("storage_unavailable");
    },
  });
}
