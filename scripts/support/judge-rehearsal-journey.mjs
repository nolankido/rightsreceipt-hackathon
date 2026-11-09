/**
 * Credential-free rehearsal of canonical handlers, with scripted test actors.
 * The caller owns the in-memory fixture and its reset/close lifecycle. This
 * module never opens a socket, loads credentials or inserts transaction rows.
 */
import { createHash, randomBytes } from "node:crypto";
import { seedSnapshot } from "../db-local.mjs";
import { ids } from "./human-consent-fixture.mjs";
import { JUDGE_STEP_CATALOG } from "./judge-rehearsal-report.mjs";

const REQUEST = "We would like to use Harbor After Rain in paid Instagram and Facebook ads in the United States and Canada for about three months. We expect around 500,000 impressions and may crop it for vertical formats. Please have the creator review all remaining rights.";
const BUYER = Object.freeze({ name: "Jordan Lee", organization: "Cedar & Tide Travel", email: "jordan@example.test" });
const RIGHTS = Object.freeze({ use_purpose: "commercial", channels: ["instagram_paid", "facebook_paid"], paid_advertising: true,
  territories: ["US", "CA"], start_date: "2026-11-01", duration_days: 90, max_impressions: 500000,
  exclusivity: "non_exclusive", modification_scope: "crop_only", attribution: "not_required", sublicensing: "prohibited", ai_use: "prohibited" });
export const JUDGE_DURABLE_TABLES = Object.freeze(["licensing_cases", "request_submissions", "clarification_submissions",
  "clarification_reviews", "terms_versions", "quotes", "creator_decisions", "buyer_acceptances", "invoice_bindings",
  "payment_operations", "payment_evidence", "permissions", "receipt_revisions"]);
const SEED_TABLES = Object.freeze(["creator_workspaces", "assets", "pricing_policy_versions", "demo_reset_epochs"]);
const hash = value => createHash("sha256").update(value).digest("hex");

/** Errors expose a fixed stage identifier, never a source/provider payload. */
export class JudgeJourneyError extends Error {
  constructor(stepId, code = "journey_invariant_failed") {
    super("The local judge rehearsal could not verify its " + stepId + " step.");
    this.name = "JudgeJourneyError"; this.code = code; this.stepId = stepId;
  }
}

/**
 * Returns public evidence separately from closures holding retired access.
 * Call only with a fixture created by transactionBrowserFixture({initialCase:false})
 * and resetSeed(fixture.db). No application environment is accepted here.
 */
export async function runJudgeJourney(fixture, { scenario = "ordinary", onStep } = {}) {
  let activeStep = "baseline";
  const demand = condition => { if (!condition) throw new JudgeJourneyError(activeStep); };
  if (!["ordinary", "lost_send_reply"].includes(scenario)) throw new JudgeJourneyError("baseline", "invalid_scenario");
  if (onStep !== undefined && typeof onStep !== "function") throw new JudgeJourneyError("baseline", "invalid_observer");
  const f = fixture, steps = [], privateTexts = new Set([REQUEST, BUYER.name, BUYER.organization, BUYER.email]);
  try {
    const read = async (path, options, expected = 200) => {
      const response = await f.native(path, options);
      demand(response.status === expected);
      const value = await response.json();
      demand(value !== null && typeof value === "object" && !Array.isArray(value));
      return value;
    };
    const financialRows = () => ({ paymentEvidenceRows: f.count("payment_evidence"), permissionRows: f.count("permissions"), receiptRows: f.count("receipt_revisions") });
    const noFinancialAuthority = () => demand(Object.values(financialRows()).every(value => value === 0));
    const noProviderWrites = () => demand(f.providerCount("create") === 0 && f.providerCount("send") === 0);
    const emit = async (id, outcome) => {
      activeStep = id;
      const item = JUDGE_STEP_CATALOG[id];
      demand(!!item && item.outcomes.includes(outcome));
      const row = Object.freeze({ id, title: item.title, actor: item.actor, operation: item.operation,
        httpStatus: item.httpStatus, outcome, evidence: Object.freeze({ providerCreates: f.providerCount("create"),
          providerSends: f.providerCount("send"), providerReads: f.providerCount("get"), ...financialRows() }) });
      steps.push(row);
      if (onStep) await onStep(row);
    };

    const initial = seedSnapshot(f.db).snapshot;
    demand(SEED_TABLES.every(table => initial.counts[table] === 1));
    demand(Object.entries(initial.counts).filter(([table]) => !SEED_TABLES.includes(table)).every(([, count]) => count === 0));
    demand(initial.rows.asset.title === "Harbor After Rain" && initial.rows.policy.currency === "USD");
    demand(f.migrationHashes.length === 9 && f.providerCalls.length === 0);
    f.environment.INVOICE_RECOVERY_ENABLED = "true";
    await emit("baseline", "seed_only");

    activeStep = "creator_asset_review";
    const changesBeforeReview = f.totalChanges(), callsBeforeReview = f.providerCalls.length;
    const asset = await read(`/api/intake/creator/assets/${ids.asset}/review`);
    demand(f.totalChanges() === changesBeforeReview && f.providerCalls.length === callsBeforeReview);
    await emit(activeStep, "reviewed");

    activeStep = "private_link";
    const token = randomBytes(32).toString("base64url"); privateTexts.add(token);
    const link = await read(`/api/intake/creator/assets/${ids.asset}/links`, { method: "POST", body: {
      requestId: crypto.randomUUID(), expectedAssetVersion: asset.assetVersion, reviewHash: asset.reviewHash,
      tokenDigestSha256: hash(token), confirmed: true, copyVersion: asset.copyVersion,
    } });
    demand(link.outcome === "issued" && f.count("licensing_cases") === 1 && f.count("buyer_capabilities") === 1);
    const beforeAttach = f.totalChanges(); f.attachIntake({ caseId: link.caseId, buyerToken: token });
    demand(f.totalChanges() === beforeAttach);
    const capability = f.db.prepare("SELECT token_digest_sha256 FROM buyer_capabilities WHERE case_id=?").get(f.caseId);
    demand(capability.token_digest_sha256 === hash(token)); noProviderWrites(); noFinancialAuthority();
    await emit(activeStep, "issued");

    activeStep = "buyer_request";
    const requestView = await read("/api/intake/buyer/review", { buyerToken: token });
    demand(requestView.alreadySubmitted === false && requestView.originalRequest === null);
    const submitted = await read("/api/intake/buyer/request", { method: "POST", buyerToken: token, body: {
      requestId: crypto.randomUUID(), expectedCaseVersion: requestView.caseVersion, reviewHash: requestView.reviewHash,
      buyerName: BUYER.name, buyerOrganization: BUYER.organization, buyerEmail: BUYER.email, intendedUseText: REQUEST,
      consentAcknowledged: true, copyVersion: requestView.copyVersion,
    } });
    demand(submitted.outcome === "submitted" && f.count("request_submissions") === 1);
    demand(f.db.prepare("SELECT intended_use_text FROM request_submissions WHERE case_id=?").get(f.caseId).intended_use_text === REQUEST);
    demand(f.count("terms_versions") === 0 && f.count("quotes") === 0); noProviderWrites(); noFinancialAuthority();
    await emit(activeStep, "submitted");

    activeStep = "buyer_answers";
    const questions = await read("/api/clarification/buyer/review", { buyerToken: token });
    demand(Array.isArray(questions.questions) && questions.questions.length > 0);
    const answers = questions.questions.map(q => ({ fieldName: q.fieldName,
      answerText: `Private buyer evidence for ${q.fieldName}. Please have the creator review this right.` }));
    for (const answer of answers) privateTexts.add(answer.answerText);
    const answered = await read("/api/clarification/buyer/answers", { method: "POST", buyerToken: token, body: {
      requestId: crypto.randomUUID(), expectedCaseVersion: questions.caseVersion, reviewHash: questions.reviewHash,
      answers, confirmed: true, copyVersion: questions.answerCopyVersion,
    } });
    demand(answered.outcome === "recorded" && f.count("clarification_submissions") === 1);
    demand(f.count("terms_versions") === 0 && f.count("quotes") === 0); noProviderWrites(); noFinancialAuthority();
    await emit(activeStep, "recorded");

    activeStep = "creator_terms";
    const reviewPath = `/api/clarification/creator/cases/${f.caseId}`;
    const review = await read(`${reviewPath}/review`);
    const terms = await read(`${reviewPath}/terms`, { method: "POST", body: {
      requestId: crypto.randomUUID(), expectedCaseVersion: review.caseVersion, reviewHash: review.reviewHash,
      submissionId: review.latestSubmission.submissionId,
      fields: Object.fromEntries(Object.entries(RIGHTS).map(([field, value]) => [field, { state: "resolved", value }])),
      confirmed: true, copyVersion: review.reviewCopyVersion,
    } });
    demand(terms.resolutionStatus === "complete" && f.count("terms_versions") === 1 && f.count("quotes") === 1);
    const quote = f.db.prepare("SELECT amount_cents,currency FROM quotes WHERE case_id=? AND status='current'").get(f.caseId);
    demand(quote.amount_cents === 42500 && quote.currency === "USD");
    demand(f.case().latest_creator_decision_id === null && f.case().latest_buyer_acceptance_id === null);
    noProviderWrites(); noFinancialAuthority(); await emit(activeStep, "complete");

    activeStep = "creator_approval";
    const approval = await f.approve();
    demand(approval.outcome === "recorded" && f.count("creator_decisions") === 1 && f.count("buyer_acceptances") === 0);
    noProviderWrites(); noFinancialAuthority(); await emit(activeStep, "recorded");

    activeStep = "buyer_acceptance";
    const acceptance = await f.accept();
    demand(acceptance.outcome === "recorded" && f.count("buyer_acceptances") === 1);
    noProviderWrites(); noFinancialAuthority(); await emit(activeStep, "recorded");

    const invoicePath = `/api/invoices/creator/cases/${f.caseId}`;
    activeStep = "draft_created";
    let invoice = await read(invoicePath);
    const draft = await read(`${invoicePath}/create`, { method: "POST", body: { expectedCaseVersion: invoice.caseVersion, confirmed: true } });
    demand(draft.outcome === "draft_bound" && f.providerCount("create") === 1 && f.providerCount("send") === 0);
    demand(f.count("invoice_bindings") === 1 && f.count("payment_operations") === 1);
    noFinancialAuthority(); await emit(activeStep, "draft_bound");

    activeStep = "invoice_sent";
    invoice = await read(invoicePath);
    const originalFetch = f.transport.fetch;
    let lostReply = false;
    if (scenario === "lost_send_reply") f.transport.fetch = async (url, init) => {
      const response = await originalFetch(url, init);
      if (init.method === "POST" && url.endsWith("/send") && !lostReply) {
        lostReply = true; throw new Error("Injected send reply loss after provider acceptance.");
      }
      return response;
    };
    let sent;
    try {
      sent = await read(`${invoicePath}/send`, { method: "POST", body: {
        expectedCaseVersion: invoice.caseVersion, invoiceId: invoice.invoiceId, confirmed: true,
      } });
    } finally { f.transport.fetch = originalFetch; }
    demand(f.providerCount("create") === 1 && f.providerCount("send") === 1 && f.count("payment_operations") === 2);
    demand(sent.outcome === (scenario === "lost_send_reply" ? "awaiting_reconciliation" : "delivery_observed"));
    demand(scenario !== "lost_send_reply" || (lostReply && f.controls.providerStatus === "UNPAID" && f.sendOperation().status === "unknown"));
    noFinancialAuthority(); await emit(activeStep, sent.outcome);

    if (scenario === "lost_send_reply") {
      activeStep = "recovery_review";
      const before = { changes: f.totalChanges(), calls: f.providerCalls.length };
      const recovery = await read(`${invoicePath}/recovery`);
      demand(recovery.state === "delivery_unresolved" && recovery.action === "check_delivery");
      demand(f.totalChanges() === before.changes && f.providerCalls.length === before.calls);
      await emit(activeStep, "delivery_unresolved");
      const command = Object.freeze({ expectedCaseVersion: recovery.caseVersion, operationId: recovery.operationId,
        sourceHash: recovery.sourceHash, action: recovery.action, confirmed: true });
      activeStep = "delivery_recovered";
      const readsBefore = f.providerCount("get");
      const recovered = await read(`${invoicePath}/recover`, { method: "POST", body: command });
      demand(recovered.outcome === "delivery_observed" && recovered.paymentConfirmed === false && recovered.permissionGranted === false);
      demand(f.providerCount("send") === 1 && f.providerCount("create") === 1 && f.providerCount("get") === readsBefore + 1);
      demand(f.sendOperation().status === "succeeded" && f.outbox().requested_generation === 1);
      noFinancialAuthority(); await emit(activeStep, "delivery_observed");
      activeStep = "recovery_replay";
      const replayBefore = { changes: f.totalChanges(), calls: f.providerCalls.length };
      const replay = await read(`${invoicePath}/recover`, { method: "POST", body: command }, 409);
      demand(replay.error === "stale_revision" && f.totalChanges() === replayBefore.changes && f.providerCalls.length === replayBefore.calls);
      demand(f.outbox().requested_generation === 1); await emit(activeStep, "stale_revision");
    }

    activeStep = "provider_paid";
    f.controls.providerStatus = "PAID";
    noFinancialAuthority();
    const statusBeforeFinancial = await read("/api/invoices/buyer/status", { buyerToken: token });
    demand(statusBeforeFinancial.invoiceStatus === "sent" && statusBeforeFinancial.receipt.canReadPrivate === false);
    noFinancialAuthority(); await emit(activeStep, "paid_label_only");

    activeStep = "financial_reconciliation";
    const reconciled = await f.reconcile();
    demand(reconciled.outcomes.applied === 1 && f.count("payment_evidence") === 1 && f.count("permissions") === 1);
    demand(f.permission().permission_state === "scheduled" && f.count("receipt_revisions") === 0);
    await emit(activeStep, "applied");

    activeStep = "receipt_issued";
    const issued = await f.issueReceipt(); demand(issued.outcome === "issued");
    const receipt = f.receipt(), payload = JSON.parse(receipt.canonical_payload_json);
    demand(f.count("receipt_revisions") === 1 && receipt.revision_number === 1);
    demand(hash(receipt.canonical_payload_json) === receipt.payload_hash && payload.quote.amount_cents === 42500);
    demand(payload.ai_provenance.extraction_history.every(item => item.extractor_version === "manual-review-v1" && item.input_sha256 === hash(REQUEST)));
    for (const value of [REQUEST, token, BUYER.email, BUYER.name, "Private buyer evidence"])
      demand(!receipt.canonical_payload_json.includes(value));
    await emit(activeStep, "issued");

    activeStep = "receipt_export";
    const exportResponse = await f.native("/api/receipts/buyer?format=json", { buyerToken: token });
    demand(exportResponse.status === 200);
    const exported = await exportResponse.text();
    demand(exported === receipt.canonical_payload_json && hash(exported) === exportResponse.headers.get("x-receipt-sha256"));
    await emit(activeStep, "verified");

    activeStep = "public_verification";
    const verification = await read(`/api/receipt-verification/${f.publicId()}`);
    demand(verification.integrity === "verified" && verification.status === "scheduled");
    const publicText = JSON.stringify(verification);
    for (const value of privateTexts) demand(!publicText.includes(value));
    await emit(activeStep, "verified");

    activeStep = "original_link_continuation";
    const beforeContinue = { changes: f.totalChanges(), calls: f.providerCalls.length };
    const continued = await read("/api/intake/buyer/review", { buyerToken: token });
    demand(continued.alreadySubmitted === true && continued.nextPath === "/buyer/review");
    const buyerStatus = await read("/api/invoices/buyer/status", { buyerToken: token });
    demand(buyerStatus.receipt.canReadPrivate === true && buyerStatus.receipt.integrity === "verified" && buyerStatus.receipt.status === "scheduled");
    demand(f.totalChanges() === beforeContinue.changes && f.providerCalls.length === beforeContinue.calls);
    await emit(activeStep, "receipt_available");

    activeStep = "completed_recovery";
    const finished = await read(`${invoicePath}/recovery`);
    demand(finished.state === "complete" && finished.action === null && finished.invoiceStatus === "paid");
    demand(f.providerCount("create") === 1 && f.providerCount("send") === 1);
    demand(f.db.prepare("PRAGMA foreign_key_check").all().length === 0 && f.db.prepare("PRAGMA integrity_check").get().integrity_check === "ok");
    await emit(activeStep, "complete");

    const result = Object.freeze({ id: scenario === "ordinary" ? "ordinary" : "recovery",
      label: scenario === "ordinary" ? "Ordinary licensing journey" : "Invoice delivery recovery", status: "passed", steps: Object.freeze(steps),
      summary: Object.freeze({ quoteCents: quote.amount_cents, currency: quote.currency,
        providerCalls: Object.freeze(Object.fromEntries(["oauth", "create", "send", "get"].map(stage => [stage, f.providerCount(stage)]))),
        durableRows: Object.freeze(Object.fromEntries(JUDGE_DURABLE_TABLES.map(table => [table, f.count(table)]))),
        permissionState: f.permission().permission_state, receiptIntegrity: verification.integrity, receiptRevision: receipt.revision_number,
        foreignKeys: "ok", integrity: "ok" }) });

    // These values never enter the public result. Reset checks use the old
    // authority against the caller's reset or replacement fixture, even after
    // the original database has been closed.
    const retired = Object.freeze({ token, caseId: f.caseId, publicId: f.publicId() });
    for (const value of [retired.caseId, retired.publicId, receipt.payload_hash, f.binding().provider_invoice_id,
      f.environment.PAYPAL_SANDBOX_CLIENT_ID, f.environment.PAYPAL_SANDBOX_CLIENT_SECRET,
      f.environment.PAYPAL_SANDBOX_MERCHANT_EMAIL, "transaction-fixture-access", "BROWSERPAYMENT036", "BROWSERREFUND036"])
      if (typeof value === "string" && value.length > 0) privateTexts.add(value);
    for (const request of f.providerCalls) if (request.requestId) privateTexts.add(request.requestId);

    const assertSafeArtifacts = text => {
      if (typeof text !== "string") throw new JudgeJourneyError("artifacts", "artifact_privacy_failed");
      const html = value => value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
      for (const value of privateTexts) {
        if ([value, html(value), encodeURIComponent(value)].some(secret => text.includes(secret)))
          throw new JudgeJourneyError("artifacts", "artifact_privacy_failed");
      }
      if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bINV2-[A-Za-z0-9-]+/u.test(text)
        || /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu.test(text))
        throw new JudgeJourneyError("artifacts", "artifact_privacy_failed");
      return true;
    };
    assertSafeArtifacts(JSON.stringify(result));

    const verifyRetiredAccess = async next => {
      const before = { changes: next.totalChanges(), calls: next.providerCalls.length };
      for (const [path, buyer, expected] of [
        ["/api/intake/buyer/review", true, 403],
        ["/api/consent/buyer/review", true, 403],
        ["/api/invoices/buyer/status", true, 403],
        ["/api/receipts/buyer?format=json", true, 404],
        [`/api/receipt-verification/${retired.publicId}`, false, 404],
        [`/api/consent/creator/cases/${retired.caseId}/review`, false, 403],
      ]) {
        const response = await next.native(path, buyer ? { buyerToken: retired.token } : {});
        if (response.status !== expected) throw new JudgeJourneyError("reset", "retired_access_not_denied");
      }
      if (next.totalChanges() !== before.changes || next.providerCalls.length !== before.calls)
        throw new JudgeJourneyError("reset", "retired_access_mutated_state");
      return Object.freeze({ oldCapabilityDenied: true, oldReceiptDenied: true, oldCreatorCaseDenied: true });
    };
    return Object.freeze({ result, verifyRetiredAccess, assertSafeArtifacts });
  } catch (error) {
    if (error instanceof JudgeJourneyError) throw error;
    throw new JudgeJourneyError(activeStep);
  }
}
