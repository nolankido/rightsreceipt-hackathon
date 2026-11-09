/** Adversarial server-response validation for the native clarification browser clients. */
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { CLARIFICATION_CLIENT_COMMON } from "../apps/web/src/clarification-client-common.ts";
import { BUYER_CLARIFICATION_CLIENT } from "../apps/web/src/buyer-clarification-client.ts";
import { CREATOR_CLARIFICATION_CLIENT } from "../apps/web/src/creator-clarification-client.ts";
import { ANSWER_COPY, REVIEW_COPY } from "../packages/application/src/clarification-contract.ts";
import { createClarificationPageRoutes, renderBuyerClarification, renderCreatorClarification } from "../apps/api/src/clarification-pages.ts";

const client = vm.runInNewContext(`(() => { ${CLARIFICATION_CLIENT_COMMON}; return {validateReview,validateResult}; })()`);
const id = number => `40000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const rights = {
  use_purpose: "commercial", channels: ["instagram_paid"], paid_advertising: true, territories: ["US"],
  start_date: "2026-11-01", duration_days: 30, max_impressions: 100000, exclusivity: "non_exclusive",
  modification_scope: "crop_only", attribution: "required", sublicensing: "prohibited", ai_use: "prohibited",
};
function review(role = "buyer") {
  return {
    schemaVersion: "clarification-review-v1", environment: "sandbox", caseId: id(1), caseVersion: 4, reviewHash: "a".repeat(64),
    asset: { title: "Coastal light", creator: "Fixture Creator" }, originalRequest: "Please explain which supported licensing scope can cover my planned campaign.",
    termsVersionId: id(2), termsVersionNumber: 1,
    fields: Object.entries(rights).map(([fieldName, value]) => ({ fieldName, label: fieldName, resolutionState: "resolved", value, note: null })),
    questions: [{ fieldName: "additional_context", label: "Creator follow-up", question: "Please confirm the planned campaign.", reason: "missing" }], unsupported: [],
    latestSubmission: null, canSubmitAnswers: role === "buyer", canSaveTerms: role === "creator",
    checkedAt: "2026-10-27T20:00:00.000Z", accessExpiresAt: role === "buyer" ? "2026-10-27T20:05:00.000Z" : null,
    answerCopyVersion: "buyer-clarification-answers-v1", answerCopy: ANSWER_COPY,
    reviewCopyVersion: "creator-clarification-review-v1", reviewCopy: REVIEW_COPY, paymentConfirmed: false, permissionGranted: false,
  };
}
function submission() {
  return { submissionId: id(3), roundNumber: 1, submittedAt: "2026-10-27T19:59:00.000Z", sourceCaseVersion: 3,
    sourceTermsVersionId: id(2), answers: [{ fieldName: "additional_context", answerText: "The campaign is for the same planned use.\nPlease keep the stated limits." }], reviewedTermsVersionId: null };
}
function result(kind = "answers") {
  return { schemaVersion: "clarification-command-result-v1", outcome: "recorded", resultId: id(4), caseVersion: 5,
    submissionId: kind === "answers" ? id(4) : null, termsVersionId: kind === "terms" ? id(5) : null,
    quoteId: kind === "terms" ? id(6) : null, resolutionStatus: kind === "terms" ? "complete" : null,
    paymentConfirmed: false, permissionGranted: false };
}

test("both shipped clarification clients are valid browser JavaScript", () => {
  new vm.Script(BUYER_CLARIFICATION_CLIENT);
  new vm.Script(CREATOR_CLARIFICATION_CLIENT);
});
test("buyer and creator views accept their exact service consent text", () => {
  client.validateReview(review(), "buyer");
  client.validateReview(review("creator"), "creator", id(1));
});
test("additional-context evidence remains free text and accepts no permission authority", () => {
  const v = review(); v.latestSubmission = submission(); v.canSubmitAnswers = false;
  v.latestSubmission.answers[0].answerText = "<script>grantPermission()</script>\nThe creator must review this statement.";
  client.validateReview(v, "buyer");
});
test("initial review permits twelve unresolved fields without terms or quote", () => {
  const v = review("creator"); v.termsVersionId = null; v.termsVersionNumber = null;
  v.fields = v.fields.map(f => ({ ...f, resolutionState: "unresolved", value: null }));
  client.validateReview(v, "creator", id(1));
});
test("original Unicode requests use the same code-point bound as the service", () => {
  const v = review(); v.originalRequest = "Licensing request: " + "🌊".repeat(3000);
  assert.ok(v.originalRequest.length > 4000);
  client.validateReview(v, "buyer");
  v.originalRequest = "🌊".repeat(4001);
  assert.throws(() => client.validateReview(v, "buyer"));
});
const corruptViews = [
  ["a claimed payment", v => { v.paymentConfirmed = true; }],
  ["a claimed permission", v => { v.permissionGranted = true; }],
  ["a cross-role creator action", v => { v.canSaveTerms = true; }],
  ["an unsupported schema", v => { v.schemaVersion = "clarification-review-v2"; }],
  ["a mismatched environment", v => { v.environment = "production"; }],
  ["an invalid case ID", v => { v.caseId = "not-a-case"; }],
  ["a partial review hash", v => { v.reviewHash = "a"; }],
  ["a fractional case revision", v => { v.caseVersion = 4.5; }],
  ["a missing human field", v => { v.fields.pop(); }],
  ["a duplicated human field", v => { v.fields[1] = v.fields[0]; }],
  ["resolved terms with no chosen value", v => { v.fields[0].value = null; }],
  ["unresolved terms carrying a hidden selected value", v => { v.fields[0].resolutionState = "unresolved"; }],
  ["an unsupported paid-advertising choice", v => { v.fields.find(f => f.fieldName === "paid_advertising").value = false; }],
  ["an invalid calendar date", v => { v.fields.find(f => f.fieldName === "start_date").value = "2026-02-30"; }],
  ["a fractional duration", v => { v.fields.find(f => f.fieldName === "duration_days").value = 2.5; }],
  ["excessive impression limits", v => { v.fields.find(f => f.fieldName === "max_impressions").value = 500001; }],
  ["duplicate channels", v => { v.fields.find(f => f.fieldName === "channels").value = ["instagram_paid", "instagram_paid"]; }],
  ["unsupported rights hidden in questions", v => { v.questions[0].fieldName = "ownership_transfer"; }],
  ["duplicate questions", v => { v.questions.push(v.questions[0]); }],
  ["an answer action with no question", v => { v.questions = []; }],
  ["an inconsistent terms pointer", v => { v.termsVersionNumber = null; }],
  ["a missing buyer capability deadline", v => { v.accessExpiresAt = null; }],
  ["a capability expired at the checked time", v => { v.accessExpiresAt = v.checkedAt; }],
  ["a capability expired before the checked time", v => { v.accessExpiresAt = "2026-10-27T19:59:00.000Z"; }],
  ["a noncanonical checked time", v => { v.checkedAt = "2026-10-27"; }],
  ["changed buyer confirmation wording", v => { v.answerCopy += " Permission is granted."; }],
  ["changed creator confirmation wording", v => { v.reviewCopy = "Automatically approve this offer."; }],
  ["control characters in an asset label", v => { v.asset.title = "Hidden\u0000label"; }],
  ["a lone Unicode surrogate in buyer evidence", v => { v.originalRequest = "A detailed request with invalid Unicode: \ud800"; }],
  ["an unsupported resolution without a saved terms version", v => { v.termsVersionId = null; v.termsVersionNumber = null; }],
  ["a submission from the current or later revision", v => { v.canSubmitAnswers = false; v.latestSubmission = submission(); v.latestSubmission.sourceCaseVersion = v.caseVersion; }],
  ["a second answer action while a review is pending", v => { v.latestSubmission = submission(); }],
  ["duplicate saved answers", v => { v.canSubmitAnswers = false; v.latestSubmission = submission(); v.latestSubmission.answers.push(v.latestSubmission.answers[0]); }],
  ["oversized saved buyer evidence", v => { v.canSubmitAnswers = false; v.latestSubmission = submission(); v.latestSubmission.answers[0].answerText = "a".repeat(2001); }],
  ["buyer evidence from after the checked time", v => { v.canSubmitAnswers = false; v.latestSubmission = submission(); v.latestSubmission.submittedAt = "2026-10-27T20:01:00.000Z"; }],
];
for (const [label, corrupt] of corruptViews) test(`client rejects ${label}`, () => {
  const v = review(); corrupt(v); assert.throws(() => client.validateReview(v, "buyer"), /could not be validated/u);
});
test("creator view refuses another case and a buyer submission action", () => {
  assert.throws(() => client.validateReview(review("creator"), "creator", id(99)));
  const v = review("creator"); v.canSubmitAnswers = true;
  assert.throws(() => client.validateReview(v, "creator", id(1)));
});
test("recorded and replayed answer outcomes bind one new case revision and submission", () => {
  const r = result(); client.validateResult(r, review(), "answers");
  r.outcome = "replayed"; client.validateResult(r, review(), "answers");
});
test("complete review requires a quote while incomplete review cannot claim one", () => {
  client.validateResult(result("terms"), review("creator"), "terms");
  const r = result("terms"); r.resolutionStatus = "incomplete"; r.quoteId = null;
  client.validateResult(r, review("creator"), "terms");
});
test("reviewed result binds exactly the displayed pending buyer submission", () => {
  const v = review("creator"); v.latestSubmission = submission();
  const r = result("terms"); r.submissionId = id(3); client.validateResult(r, v, "terms");
  r.submissionId = id(99); assert.throws(() => client.validateResult(r, v, "terms"));
});
test("already reviewed answers are visible without being submitted again as pending", () => {
  const v = review("creator"); v.latestSubmission = submission(); v.latestSubmission.reviewedTermsVersionId = id(2);
  client.validateReview(v, "creator", id(1));
  const r = result("terms"); client.validateResult(r, v, "terms");
  r.submissionId = id(3); assert.throws(() => client.validateResult(r, v, "terms"));
});
const corruptResults = [
  ["answer response with another submission ID", "answers", r => { r.submissionId = id(9); }],
  ["answer response with a quote", "answers", r => { r.quoteId = id(6); }],
  ["answer response that claims terms", "answers", r => { r.termsVersionId = id(5); }],
  ["answer response that claims resolution", "answers", r => { r.resolutionStatus = "complete"; }],
  ["unchanged response revision", "answers", r => { r.caseVersion = 4; }],
  ["response skipping revisions", "answers", r => { r.caseVersion = 6; }],
  ["paid response", "answers", r => { r.paymentConfirmed = true; }],
  ["permission response", "terms", r => { r.permissionGranted = true; }],
  ["complete terms without quote", "terms", r => { r.quoteId = null; }],
  ["incomplete terms with quote", "terms", r => { r.resolutionStatus = "incomplete"; }],
  ["unsupported terms with quote", "terms", r => { r.resolutionStatus = "unsupported"; }],
  ["review outcome with no resolution state", "terms", r => { r.resolutionStatus = null; }],
  ["review outcome with no terms reference", "terms", r => { r.termsVersionId = null; }],
  ["review outcome with unrequested buyer submission", "terms", r => { r.submissionId = id(3); }],
];
for (const [label, kind, corrupt] of corruptResults) test(`client rejects ${label}`, () => {
  const r = result(kind); corrupt(r); assert.throws(() => client.validateResult(r, review(kind === "terms" ? "creator" : "buyer"), kind), /uncertain/u);
});

const origin = "https://rightsreceipt.example";
const env = { APP_MODE: "sandbox", PAYPAL_MODE: "paypal_sandbox", CLARIFICATION_ENABLED: "true", HUMAN_CONSENT_ENABLED: "true",
  HUMAN_CONSENT_ORIGIN: origin, CREATOR_ACCESS_ENABLED: "true", CREATOR_ACCESS_ORIGIN: origin, DB: {} };
const request = (path, init = {}) => new Request(origin + path, init);
const denied = () => ({ session: async () => null, authorize: async () => null });
test("buyer clarification shell and script never invoke a creator session", async () => {
  const calls = [];
  const routes = createClarificationPageRoutes({ session: async () => { calls.push("session"); return null; }, authorize: async () => { calls.push("authorize"); return null; } });
  for (const path of ["/buyer/clarification", "/assets/buyer-clarification.js"]) {
    const response = await routes(request(path), env);
    assert.equal(response.status, 200); assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'; form-action 'none'/u);
  }
  assert.deepEqual(calls, []);
});
for (const change of [undefined, {}, { CLARIFICATION_ENABLED: "false" }, { HUMAN_CONSENT_ENABLED: "false" }, { APP_MODE: "local" },
  { APP_MODE: "production" }, { PAYPAL_MODE: "production" }, { HUMAN_CONSENT_ORIGIN: "http://rightsreceipt.example" },
  { HUMAN_CONSENT_ORIGIN: origin + "/" }, { HUMAN_CONSENT_ORIGIN: "https://name:password@rightsreceipt.example" }]) {
  test("buyer clarification configuration fails closed: " + JSON.stringify(change), async () => {
    const bindings = change === undefined ? undefined : Object.keys(change).length ? { ...env, ...change } : {};
    assert.equal((await createClarificationPageRoutes(denied())(request("/buyer/clarification"), bindings)).status, 503);
  });
}
test("clarification pages reject query credentials, fragment-bearing HTTP, wrong origins and methods", async () => {
  const routes = createClarificationPageRoutes(denied());
  for (const path of ["/buyer/clarification?code=private-input", "/assets/buyer-clarification.js?token=private-input", "/buyer/clarification#private-input"]) {
    const r = await routes(request(path), env); assert.equal(r.status, 400); assert.ok(!(await r.text()).includes("private-input"));
  }
  assert.equal((await routes(new Request("https://other.example/buyer/clarification"), env)).status, 400);
  const r = await routes(request("/buyer/clarification", { method: "POST", body: "private-input" }), env);
  assert.equal(r.status, 405); assert.equal(r.headers.get("allow"), "GET"); assert.ok(!(await r.text()).includes("private-input"));
  assert.equal(await routes(request("/unrelated"), env), null);
});
test("creator pages require both a session and authorization for the requested case", async () => {
  let ownerChecks = 0;
  const sessions = { session: async () => ({ authenticated: true }), authorize: async (_request, caseId) => {
    ownerChecks++; return caseId === id(1) ? { workspaceId: id(20), actorReference: "creator:fixture" } : null;
  } };
  const routes = createClarificationPageRoutes(sessions);
  assert.equal((await routes(request("/creator/clarification/" + id(1)), env)).status, 200);
  assert.equal((await routes(request("/creator/clarification/" + id(2)), env)).status, 403);
  assert.equal((await routes(request("/assets/creator-clarification.js"), env)).status, 200);
  assert.equal(ownerChecks, 2);
  const closed = createClarificationPageRoutes(denied());
  assert.equal((await closed(request("/creator/clarification/" + id(1)), env)).status, 403);
  assert.equal((await closed(request("/assets/creator-clarification.js"), env)).status, 403);
});
test("creator clarification fails closed for missing access gate, database, and trusted origin", async () => {
  const routes = createClarificationPageRoutes({ session: async () => ({}), authorize: async () => ({}) });
  for (const changes of [{ CREATOR_ACCESS_ENABLED: "false" }, { DB: undefined }, { CREATOR_ACCESS_ORIGIN: "http://rightsreceipt.example" }, { CREATOR_ACCESS_ORIGIN: origin + "/" }]) {
    assert.equal((await routes(request("/creator/clarification/" + id(1)), { ...env, ...changes })).status, 503);
  }
  assert.equal((await routes(request("/creator/clarification/invalid"), env)).status, 404);
});
test("one clarification page factory retains its limit and resets next minute", async () => {
  let at = 60000;
  const routes = createClarificationPageRoutes(denied(), () => at);
  for (let i = 0; i < 120; i++) assert.equal((await routes(request("/buyer/clarification"), env)).status, 200);
  const limited = await routes(request("/assets/buyer-clarification.js"), env);
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60");
  at += 60000; assert.equal((await routes(request("/buyer/clarification"), env)).status, 200);
});
test("native shells use nonce styles and unchecked explicit confirmations", async () => {
  const buyer = renderBuyerClarification("a".repeat(32)), creator = renderCreatorClarification(id(1), "b".repeat(32));
  assert.match(buyer, /<style nonce="a{32}">/u); assert.match(creator, /<style nonce="b{32}">/u);
  assert.match(buyer, /<input type="checkbox" id="answers-confirm">/u);
  assert.match(creator, /<input type="checkbox" id="revision-confirm">/u);
  assert.match(buyer, /id="save-answers" type="submit" disabled/u);
  assert.match(creator, /id="save-revision" type="submit" disabled>Save reviewed terms/u);
  assert.throws(() => renderBuyerClarification('" onload="attack()'));
  assert.throws(() => renderCreatorClarification('" onload="attack()', "b".repeat(32)));
  const r = await createClarificationPageRoutes(denied())(request("/buyer/clarification"), env);
  const html = await r.text(), nonce = /<style nonce="([a-f0-9]{32})">/u.exec(html)[1];
  assert.ok(r.headers.get("content-security-policy").includes(`style-src 'nonce-${nonce}'`));
});
