/** New human reviews must remain usable by the existing financial receipt path. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { transactionBrowserFixture, CONSENT_PATH } from "./support/transaction-browser-fixture.mjs";
import { ids, NOW } from "./support/human-consent-fixture.mjs";

const REQUEST = "We would like to license Harbor After Rain for a commercial campaign. Please clarify all of the remaining rights details.";
const RIGHTS = { use_purpose: "commercial", channels: ["instagram_paid", "facebook_paid"], paid_advertising: true,
  territories: ["US", "CA"], start_date: "2026-11-01", duration_days: 90, max_impressions: 500000,
  exclusivity: "non_exclusive", modification_scope: "crop_only", attribution: "not_required", sublicensing: "prohibited", ai_use: "prohibited" };
const REVIEW = `/api/clarification/creator/cases/${ids.case}/review`;
const TERMS = `/api/clarification/creator/cases/${ids.case}/terms`;
const hash = value => createHash("sha256").update(value).digest("hex");

async function data(response) {
  const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body;
}
async function answer(f) {
  const view = await data(await f.native("/api/clarification/buyer/review", { buyerToken: f.token }));
  return data(await f.native("/api/clarification/buyer/answers", { method: "POST", buyerToken: f.token, body: {
    requestId: crypto.randomUUID(), expectedCaseVersion: view.caseVersion, reviewHash: view.reviewHash,
    answers: view.questions.map(question => ({ fieldName: question.fieldName,
      answerText: `Private clarification evidence for ${question.fieldName}. The creator must select the supported terms.` })),
    confirmed: true, copyVersion: view.answerCopyVersion,
  } }));
}
async function review(f, incomplete = false) {
  const view = await data(await f.native(REVIEW));
  const fields = Object.fromEntries(Object.entries(RIGHTS).map(([field, value]) => [field,
    incomplete && field === "territories" ? { state: "unresolved" } : { state: "resolved", value }]));
  return data(await f.native(TERMS, { method: "POST", body: {
    requestId: crypto.randomUUID(), expectedCaseVersion: view.caseVersion, reviewHash: view.reviewHash,
    submissionId: view.latestSubmission?.reviewedTermsVersionId === null ? view.latestSubmission.submissionId : null,
    fields, confirmed: true, copyVersion: view.reviewCopyVersion,
  } }));
}

for (const kind of ["first complete review", "incomplete review followed by complete terms", "unchanged rights after creator follow-up"]) {
  test(`clarification ${kind} supports payment, receipt integrity and refund continuity`, async () => {
    const f = transactionBrowserFixture({ initialTerms: false, requestText: REQUEST });
    try {
      assert.equal(f.count("terms_versions"), 0); assert.equal(f.count("quotes"), 0);
      await answer(f);
      const firstReview = await review(f, kind === "incomplete review followed by complete terms");
      if (kind === "incomplete review followed by complete terms") {
        assert.equal(firstReview.quoteId, null);
        await answer(f); const completed = await review(f);
        assert.equal(completed.resolutionStatus, "complete"); assert.notEqual(completed.termsVersionId, firstReview.termsVersionId);
      } else if (kind === "unchanged rights after creator follow-up") {
        const offer = await data(await f.native(`${CONSENT_PATH}/review`));
        await data(await f.native(`${CONSENT_PATH}/decision`, { method: "POST", body: {
          requestId: crypto.randomUUID(), expectedCaseVersion: offer.caseVersion, termsVersionId: offer.termsVersionId,
          quoteId: offer.quoteId, reviewHash: offer.reviewHash, decision: "clarification_requested",
          reason: "Confirm that the original restrictions remain sufficient for your campaign.",
          confirmed: true, copyVersion: offer.creatorCopyVersion,
        } }));
        await answer(f); const reaffirmed = await review(f);
        assert.equal(reaffirmed.termsVersionId, firstReview.termsVersionId); assert.equal(reaffirmed.quoteId, firstReview.quoteId);
        assert.equal(f.case().latest_creator_decision_id, null); assert.equal(f.case().latest_buyer_acceptance_id, null);
      }
      assert.equal(f.providerCalls.length, 0);
      await f.approve(); await f.accept(); await f.sendAccepted();
      f.controls.providerStatus = "PAID";
      const financial = await f.reconcile(), issued = await f.issueReceipt();
      assert.equal(financial.outcomes.applied, 1); assert.equal(f.permission().permission_state, "scheduled");
      assert.equal(issued.outcome, "issued", `Human review provenance must satisfy canonical receipt verification: ${JSON.stringify(issued)}`);
      const first = f.receipt(), payload = JSON.parse(first.canonical_payload_json);
      assert.equal(hash(first.canonical_payload_json), first.payload_hash);
      assert.equal(payload.quote.amount_cents, 42500);
      assert.ok(payload.ai_provenance.extraction_history.length >= 1);
      for (const attempt of payload.ai_provenance.extraction_history) {
        assert.equal(attempt.extractor_version, "manual-review-v1"); assert.equal(attempt.input_sha256, hash(REQUEST));
        assert.equal(attempt.model_id, null); assert.equal(attempt.model_version, null);
      }
      for (const privateText of [REQUEST, "Private clarification evidence", f.token, "buyer@example.test"]) {
        assert.equal(first.canonical_payload_json.includes(privateText), false);
      }
      assert.equal((await f.issueReceipt()).outcome, "unchanged");
      const publicResponse = await f.native(`/verify/receipt/${f.publicId()}`);
      assert.equal(publicResponse.status, 200); assert.ok((await publicResponse.text()).includes(first.payload_hash));
      const reads = f.totalChanges();
      assert.equal((await f.native("/api/clarification/buyer/review", { buyerToken: f.token })).status, 409);
      assert.equal((await f.native(REVIEW)).status, 409);
      assert.equal(f.totalChanges(), reads);
      f.setTime(new Date(Date.parse(NOW) + 60000).toISOString()); f.controls.providerStatus = "REFUNDED";
      assert.equal((await f.reconcile({ requestAnotherGeneration: true })).outcomes.applied, 1);
      assert.equal((await f.issueReceipt()).outcome, "issued");
      assert.equal(f.receipt().revision_number, 2); assert.equal(f.receipt().previous_revision_hash, first.payload_hash);
      assert.equal(f.permission().permission_state, "refunded");
      assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(f.db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    } finally { f.close(); }
  });
}
