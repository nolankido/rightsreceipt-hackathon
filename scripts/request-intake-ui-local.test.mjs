/** Native initial-request UI boundaries, consent wording, and adversarial server responses. */
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { REQUEST_INTAKE_CLIENT_COMMON } from "../apps/web/src/request-intake-client-common.ts";
import { BUYER_REQUEST_INTAKE_CLIENT } from "../apps/web/src/buyer-request-intake-client.ts";
import { CREATOR_REQUEST_INTAKE_CLIENT } from "../apps/web/src/creator-request-intake-client.ts";
import { LINK_COPY, INTAKE_ACTIONS } from "../packages/application/src/request-intake-contract.ts";
import { BUYER_REQUEST_CONSENT_COPY } from "../packages/domain/src/buyer-requests.ts";
import { createRequestIntakePageRoutes, renderBuyerRequestIntake, renderCreatorRequestIntake } from "../apps/api/src/request-intake-pages.ts";

const client = vm.runInNewContext(`(() => { ${REQUEST_INTAKE_CLIENT_COMMON}; return {validateCreatorReview,validateIssued,validateBuyerReview,validateSubmitted,inputIssues}; })()`);
const id = number => `80000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const at = "2026-10-27T20:00:00.000Z", expires = "2026-11-03T20:00:00.000Z";
const authority = { version: "request-intake-v1", paymentConfirmed: false, permissionGranted: false, checkedAt: at };
const image = { assetId: id(1), title: "Coastal light", assetType: "photograph", creatorDisplayName: "Fixture Creator",
  provenanceNote: "A controlled fixture image for licensing workflow verification.", fingerprintAlgorithm: "sha256", fingerprintValue: "a".repeat(64) };
const input = () => ({ buyerName: "Fixture Buyer", buyerOrganization: "Example Studio", buyerEmail: "buyer@example.test",
  intendedUseText: "Please consider this image for a paid campaign on our social channels for one month.", consentAcknowledged: true });
const creatorView = () => ({ ...authority, assetVersion: 1, reviewHash: "b".repeat(64), asset: { ...image }, copyVersion: "creator-request-link-v1",
  copy: LINK_COPY, capabilityLifetimeSeconds: 604800, allowedActions: [...INTAKE_ACTIONS] });
const linkCommand = () => ({ requestId: id(2), expectedAssetVersion: 1, reviewHash: "b".repeat(64), tokenDigestSha256: "c".repeat(64), confirmed: true, copyVersion: "creator-request-link-v1" });
const issued = () => ({ ...authority, outcome: "issued", requestId: id(2), caseId: id(3), buyerCapabilityId: id(4), assetId: id(1), assetVersion: 1,
  caseVersion: 1, issuedAt: at, expiresAt: expires, replayed: false, requestPath: "/buyer/request", creatorReviewPath: "/creator/clarification/" + id(3), allowedActions: [...INTAKE_ACTIONS] });
const buyerView = () => ({ ...authority, accessExpiresAt: expires, caseId: id(3), caseVersion: 1, reviewHash: "d".repeat(64), asset: { ...image },
  alreadySubmitted: false, originalRequest: null, copyVersion: "buyer-request-v1", copy: BUYER_REQUEST_CONSENT_COPY, nextPath: "/buyer/clarification" });
const requestCommand = () => ({ requestId: id(5), expectedCaseVersion: 1, reviewHash: "d".repeat(64), ...input(), copyVersion: "buyer-request-v1" });
const submitted = () => ({ ...authority, outcome: "submitted", requestId: id(5), requestSubmissionId: id(6), caseId: id(3), caseVersion: 2,
  submittedAt: at, accessExpiresAt: expires, replayed: false, nextPath: "/buyer/clarification" });
function recordedView() {
  const v = buyerView(); v.alreadySubmitted = true; v.caseVersion = 2;
  v.originalRequest = { requestSubmissionId: id(6), ...input(), submittedAt: at, consentCopyVersion: "buyer-request-v1" };
  delete v.originalRequest.consentAcknowledged;
  return v;
}

test("both native intake clients compile as browser JavaScript", () => {
  new vm.Script(BUYER_REQUEST_INTAKE_CLIENT); new vm.Script(CREATOR_REQUEST_INTAKE_CLIENT);
});
test("native response validators accept exact service copy, scope and source-bound results", () => {
  client.validateCreatorReview(creatorView(), id(1)); client.validateIssued(issued(), creatorView(), linkCommand());
  client.validateBuyerReview(buyerView()); client.validateBuyerReview(recordedView()); client.validateSubmitted(submitted(), buyerView(), requestCommand());
});
test("recorded and replayed commands retain the same result binding", () => {
  const i = issued(), s = submitted(); i.replayed = true; s.replayed = true;
  client.validateIssued(i, creatorView(), linkCommand()); client.validateSubmitted(s, buyerView(), requestCommand());
});
test("submitted intake can explicitly resume the exact current offer route", () => {
  const v = recordedView(); v.nextPath = "/buyer/review"; client.validateBuyerReview(v);
  v.alreadySubmitted = false; v.originalRequest = null;
  assert.throws(() => client.validateBuyerReview(v), /could not be validated/u);
});
test("an archived submitted request can remain readable without a continuation action", () => {
  const v = recordedView(); v.nextPath = null; client.validateBuyerReview(v);
  v.alreadySubmitted = false; v.originalRequest = null;
  assert.throws(() => client.validateBuyerReview(v), /could not be validated/u);
});
test("buyer validation preserves original whitespace and permits bounded Unicode code points", () => {
  const values = input(); values.intendedUseText = "  " + "🌊".repeat(3996) + "\n ";
  assert.equal([...values.intendedUseText].length, 4000);
  assert.ok(values.intendedUseText.length > 4000); assert.equal(client.inputIssues(values).length, 0);
  const v = recordedView(); v.originalRequest.intendedUseText = values.intendedUseText; client.validateBuyerReview(v);
  values.intendedUseText += "🌊"; assert.ok(client.inputIssues(values).some(issue => issue.field === "intendedUseText"));
});
test("buyer identity is validated without inventing identity or request text", () => {
  const empty = { buyerName: "", buyerOrganization: "", buyerEmail: "", intendedUseText: "", consentAcknowledged: false };
  assert.deepEqual(Array.from(client.inputIssues(empty), item => item.field), ["buyerName", "buyerOrganization", "buyerEmail", "intendedUseText", "consentAcknowledged"]);
});
for (const [label, value] of [["executable markup", "<script>grantPermission()</script>"], ["template syntax", "{{ approveEverything }}"],
  ["event-handler markup", "onload=grantPermission()"], ["control characters", "unsafe\u0000text"], ["lone surrogate", "broken\ud800text"]]) {
  test("buyer input rejects " + label, () => {
    const values = input(); values.intendedUseText += " " + value;
    assert.ok(client.inputIssues(values).some(issue => issue.field === "intendedUseText"));
  });
}
const creatorCorruptions = [
  ["an unsupported version", v => { v.version = "request-intake-v2"; }],
  ["payment authority", v => { v.paymentConfirmed = true; }],
  ["permission authority", v => { v.permissionGranted = true; }],
  ["another asset", v => { v.asset.assetId = id(99); }],
  ["a fractional asset version", v => { v.assetVersion = 1.5; }],
  ["a missing source hash", v => { delete v.reviewHash; }],
  ["changed consent wording", v => { v.copy += " Permission granted."; }],
  ["changed consent version", v => { v.copyVersion = "creator-request-link-v2"; }],
  ["extra capability authority", v => { v.allowedActions.push("approve"); }],
  ["missing capability scope", v => { v.allowedActions.pop(); }],
  ["duplicate capability scope", v => { v.allowedActions[3] = "review"; }],
  ["an extended capability lifetime", v => { v.capabilityLifetimeSeconds = 604801; }],
  ["an invalid asset fingerprint", v => { v.asset.fingerprintValue = "private-url"; }],
  ["control characters in metadata", v => { v.asset.title = "Image\u0000title"; }],
  ["a noncanonical time", v => { v.checkedAt = "2026-10-27"; }],
];
for (const [label, corrupt] of creatorCorruptions) test("creator client rejects " + label, () => {
  const v = creatorView(); corrupt(v); assert.throws(() => client.validateCreatorReview(v, id(1)), /could not be validated/u);
});
const issuanceCorruptions = [
  ["another issuance command", r => { r.requestId = id(99); }],
  ["another asset", r => { r.assetId = id(99); }],
  ["another asset version", r => { r.assetVersion = 2; }],
  ["an invalid case", r => { r.caseId = "../private"; }],
  ["an invalid capability reference", r => { r.buyerCapabilityId = "private-code"; }],
  ["an advanced initial case version", r => { r.caseVersion = 2; }],
  ["an off-origin buyer destination", r => { r.requestPath = "https://other.example/buyer/request"; }],
  ["a capability in the buyer path", r => { r.requestPath += "/" + "x".repeat(43); }],
  ["a capability in a query", r => { r.requestPath += "?code=" + "x".repeat(43); }],
  ["another creator review case", r => { r.creatorReviewPath = "/creator/clarification/" + id(99); }],
  ["an extra scope", r => { r.allowedActions.push("invoice"); }],
  ["an expired private link", r => { r.checkedAt = r.expiresAt; }],
  ["a link issued in the future", r => { r.issuedAt = "2026-10-27T20:01:00.000Z"; }],
  ["a longer link lifetime", r => { r.expiresAt = "2026-11-04T20:00:00.000Z"; }],
  ["an implicit replay flag", r => { delete r.replayed; }],
  ["claimed permission", r => { r.permissionGranted = true; }],
];
for (const [label, corrupt] of issuanceCorruptions) test("issuance response rejects " + label, () => {
  const r = issued(); corrupt(r); assert.throws(() => client.validateIssued(r, creatorView(), linkCommand()), /uncertain/u);
});
const buyerCorruptions = [
  ["a payment claim", v => { v.paymentConfirmed = true; }],
  ["a permission claim", v => { v.permissionGranted = true; }],
  ["missing request evidence after submission", v => { v.alreadySubmitted = true; }],
  ["hidden original evidence before submission", v => { v.originalRequest = recordedView().originalRequest; }],
  ["an invalid case", v => { v.caseId = "case-in-url"; }],
  ["an invalid source hash", v => { v.reviewHash = "partial"; }],
  ["an expired capability", v => { v.accessExpiresAt = v.checkedAt; }],
  ["an omitted capability expiry", v => { delete v.accessExpiresAt; }],
  ["a different consent version", v => { v.copyVersion = "buyer-request-v2"; }],
  ["weaker consent copy", v => { v.copy = "I agree."; }],
  ["an automatic payment destination", v => { v.nextPath = "/buyer/payment"; }],
  ["an offer destination before initial submission", v => { v.nextPath = "/buyer/review"; }],
  ["an unavailable continuation before initial submission", v => { v.nextPath = null; }],
  ["an off-origin clarification destination", v => { v.nextPath = "https://other.example/buyer/clarification"; }],
];
for (const [label, corrupt] of buyerCorruptions) test("buyer context rejects " + label, () => {
  const v = buyerView(); corrupt(v); assert.throws(() => client.validateBuyerReview(v), /could not be validated/u);
});
for (const [label, corrupt] of [
  ["a missing submission reference", v => { delete v.originalRequest.requestSubmissionId; }],
  ["a different original consent version", v => { v.originalRequest.consentCopyVersion = "buyer-request-v2"; }],
  ["a future submission time", v => { v.originalRequest.submittedAt = "2026-10-27T20:01:00.000Z"; }],
  ["oversized original input", v => { v.originalRequest.intendedUseText = "🌊".repeat(4001); }],
  ["a malformed original email", v => { v.originalRequest.buyerEmail = "no-email"; }],
  ["an off-origin saved offer destination", v => { v.nextPath = "https://other.example/buyer/review"; }],
  ["a query credential in the saved offer destination", v => { v.nextPath = "/buyer/review?code=secret"; }],
]) test("recorded buyer evidence rejects " + label, () => {
  const v = recordedView(); corrupt(v); assert.throws(() => client.validateBuyerReview(v), /could not be validated/u);
});
const submissionCorruptions = [
  ["another request command", r => { r.requestId = id(99); }],
  ["another case", r => { r.caseId = id(99); }],
  ["a missing original submission reference", r => { delete r.requestSubmissionId; }],
  ["an unchanged case version", r => { r.caseVersion = 1; }],
  ["a skipped case version", r => { r.caseVersion = 3; }],
  ["an extended access expiry", r => { r.accessExpiresAt = "2026-11-04T20:00:00.000Z"; }],
  ["an expired access expiry", r => { r.checkedAt = r.accessExpiresAt; }],
  ["a future submission", r => { r.submittedAt = "2026-10-27T20:01:00.000Z"; }],
  ["an external next path", r => { r.nextPath = "https://other.example/"; }],
  ["a claimed payment", r => { r.paymentConfirmed = true; }],
  ["a claimed permission", r => { r.permissionGranted = true; }],
];
for (const [label, corrupt] of submissionCorruptions) test("submitted response rejects " + label, () => {
  const r = submitted(); corrupt(r); assert.throws(() => client.validateSubmitted(r, buyerView(), requestCommand()), /uncertain/u);
});

const origin = "https://rightsreceipt.example";
const env = { APP_MODE: "sandbox", PAYPAL_MODE: "paypal_sandbox", REQUEST_INTAKE_ENABLED: "true", CLARIFICATION_ENABLED: "true", HUMAN_CONSENT_ENABLED: "true",
  HUMAN_CONSENT_ORIGIN: origin, CREATOR_ACCESS_ENABLED: "true", CREATOR_ACCESS_ORIGIN: origin, DB: {} };
const request = (path, init = {}) => new Request(origin + path, init);
const denied = () => ({ session: async () => null, authorize: async () => null, authorizeAsset: async () => null });
test("buyer intake shell and script never invoke creator authorization or set a cookie", async () => {
  const calls = [], auth = { session: async () => { calls.push("session"); return null; }, authorizeAsset: async () => { calls.push("asset"); return null; } };
  const routes = createRequestIntakePageRoutes(auth);
  for (const path of ["/buyer/request", "/assets/buyer-request-intake.js"]) {
    const response = await routes(request(path), env);
    assert.equal(response.status, 200); assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "no-store, private"); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-frame-options"), "DENY"); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /default-src 'none'; script-src 'self'; connect-src 'self'/u);
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'; form-action 'none'/u);
  }
  assert.deepEqual(calls, []);
});
for (const change of [undefined, {}, { REQUEST_INTAKE_ENABLED: "false" }, { CLARIFICATION_ENABLED: "false" }, { HUMAN_CONSENT_ENABLED: "false" },
  { APP_MODE: "local" }, { APP_MODE: "production" }, { PAYPAL_MODE: "production" }, { DB: undefined },
  { HUMAN_CONSENT_ORIGIN: "http://rightsreceipt.example" }, { HUMAN_CONSENT_ORIGIN: origin + "/" }, { HUMAN_CONSENT_ORIGIN: "https://name:password@rightsreceipt.example" }]) {
  test("intake pages fail closed for configuration " + JSON.stringify(change), async () => {
    const bindings = change === undefined ? undefined : Object.keys(change).length ? { ...env, ...change } : {};
    const response = await createRequestIntakePageRoutes(denied())(request("/buyer/request"), bindings);
    assert.equal(response.status, 503); assert.equal((await response.json()).error, "request_intake_unavailable");
  });
}
test("intake pages reject query credentials, fragment-bearing HTTP, wrong origin and mutation methods", async () => {
  const routes = createRequestIntakePageRoutes(denied());
  for (const path of ["/buyer/request?code=private-input", "/buyer/request#private-input", "/assets/buyer-request-intake.js?token=private-input"]) {
    const response = await routes(request(path), env); assert.equal(response.status, 400); assert.ok(!(await response.text()).includes("private-input"));
  }
  assert.equal((await routes(new Request("https://other.example/buyer/request"), env)).status, 400);
  const response = await routes(request("/buyer/request", { method: "POST", body: "private-input" }), env);
  assert.equal(response.status, 405); assert.equal(response.headers.get("allow"), "GET"); assert.ok(!(await response.text()).includes("private-input"));
  assert.equal(await routes(request("/unrelated"), env), null);
});
test("creator request page requires session and asset ownership, while the script requires session", async () => {
  let checks = 0;
  const auth = { session: async () => ({ authenticated: true }), authorizeAsset: async (_r, assetId) => { checks++; return assetId === id(1) ? { workspaceId: id(20), actorReference: "creator:fixture" } : null; } };
  const routes = createRequestIntakePageRoutes(auth);
  assert.equal((await routes(request("/creator/requests/" + id(1)), env)).status, 200);
  assert.equal((await routes(request("/creator/requests/" + id(2)), env)).status, 403);
  assert.equal((await routes(request("/assets/creator-request-intake.js"), env)).status, 200); assert.equal(checks, 2);
  const noSession = createRequestIntakePageRoutes(denied());
  assert.equal((await noSession(request("/creator/requests/" + id(1)), env)).status, 403);
  assert.equal((await noSession(request("/assets/creator-request-intake.js"), env)).status, 403);
});
test("creator intake rejects disabled Access, mismatched origins and invalid asset paths", async () => {
  const routes = createRequestIntakePageRoutes({ session: async () => ({}), authorizeAsset: async () => ({}) });
  for (const changes of [{ CREATOR_ACCESS_ENABLED: "false" }, { CREATOR_ACCESS_ORIGIN: "https://creator.example" }, { CREATOR_ACCESS_ORIGIN: origin + "/" }]) {
    assert.equal((await routes(request("/creator/requests/" + id(1)), { ...env, ...changes })).status, 503);
    assert.equal((await routes(request("/assets/creator-request-intake.js"), { ...env, ...changes })).status, 503);
  }
  assert.equal((await routes(request("/creator/requests/invalid"), env)).status, 404);
});
test("one intake page factory retains its request limit and resets next minute", async () => {
  let atMs = 60000; const routes = createRequestIntakePageRoutes(denied(), () => atMs);
  for (let i = 0; i < 120; i++) assert.equal((await routes(request("/buyer/request"), env)).status, 200);
  const limited = await routes(request("/assets/buyer-request-intake.js"), env);
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60");
  atMs += 60000; assert.equal((await routes(request("/buyer/request"), env)).status, 200);
});
test("shells are blank and hidden before authorization and require unchecked confirmations", () => {
  const buyer = renderBuyerRequestIntake("a".repeat(32)), creator = renderCreatorRequestIntake(id(1), "b".repeat(32));
  assert.match(buyer, /<form id="intake-form" hidden autocomplete="off" novalidate>/u);
  assert.match(buyer, /<input type="checkbox" id="consent-confirm">/u); assert.match(creator, /<input type="checkbox" id="issue-confirm">/u);
  assert.match(buyer, /id="submit-request" type="submit" disabled/u); assert.match(creator, /id="issue-link" type="submit" disabled/u);
  assert.match(creator, /<div id="manual-link-panel" hidden>/u); assert.match(creator, /<textarea id="private-link"[^>]*><\/textarea>/u);
  assert.ok(!/<(?:input|textarea)[^>]*\bvalue=/u.test(buyer)); assert.ok(!/<input[^>]*\bchecked\b/u.test(buyer + creator));
  assert.match(buyer, /maxlength="8000"/u); assert.match(buyer, /original request remains unchanged/u);
  assert.match(buyer, /id="open-clarification" type="button" disabled/u);
  assert.throws(() => renderBuyerRequestIntake('" onload="attack()'));
  assert.throws(() => renderCreatorRequestIntake('" onload="attack()', "b".repeat(32)));
});
test("the rendered style nonce is bound to the response policy", async () => {
  const response = await createRequestIntakePageRoutes(denied())(request("/buyer/request"), env);
  const html = await response.text(), nonce = /<style nonce="([a-f0-9]{32})">/u.exec(html)[1];
  assert.ok(response.headers.get("content-security-policy").includes(`style-src 'nonce-${nonce}'`));
});
