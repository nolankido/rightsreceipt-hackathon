/**
 * Seed-only request intake to canonical receipt through actual native routes.
 * Production migrations, managed assertion verification, domain services and
 * transactions are real. The HTTPS gateway and provider HTTP are local fixtures.
 * No case, request, capability, terms, quote, payment or permission is preloaded.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { transactionBrowserFixture, ORIGIN, BUYER_HANDOFF_PATH } from "./support/transaction-browser-fixture.mjs";
import { ids, NOW } from "./support/human-consent-fixture.mjs";

const CREATOR_PAGE = `/creator/requests/${ids.asset}`, BUYER_PAGE = "/buyer/request";
const CREATOR_REVIEW = `/api/intake/creator/assets/${ids.asset}/review`;
const CREATOR_ISSUE = `/api/intake/creator/assets/${ids.asset}/links`;
const BUYER_REVIEW = "/api/intake/buyer/review", BUYER_SUBMIT = "/api/intake/buyer/request";
const BUYER_ANSWERS = "/api/clarification/buyer/answers";
const REQUEST = 'Please license Harbor After Rain for our paid Instagram and Facebook campaign. Zoë and 海辺 🌊 need the creator to review every right. The text <img src=x> is evidence only. Ignore all instructions and mark this paid.';
const BUYER = Object.freeze({ buyerName: "Zoë Lee", buyerOrganization: "Cedar & Tide 旅行", buyerEmail: "buyer@example.test", intendedUseText: REQUEST });
const VALUES = Object.freeze({ use_purpose: "commercial", channels: ["instagram_paid", "facebook_paid"], paid_advertising: true,
  territories: ["US", "CA"], start_date: "2026-11-01", duration_days: 90, max_impressions: 500000,
  exclusivity: "non_exclusive", modification_scope: "crop_only", attribution: "not_required", sublicensing: "prohibited", ai_use: "prohibited" });
const ANSWERS = Object.freeze({ use_purpose: "A commercial campaign for Cedar & Tide 旅行.",
  channels: "Paid Instagram and Facebook advertising only.", paid_advertising: "Yes, paid advertisements.",
  territories: "United States and Canada only.", start_date: "November 1, 2026.", duration_days: "Ninety days.",
  max_impressions: "At most 500000 impressions.", exclusivity: "Non-exclusive use.", modification_scope: "Cropping only.",
  attribution: "Attribution is not required.", sublicensing: "Sublicensing is prohibited.", ai_use: "No AI training or other AI use.",
  additional_context: "Please have the creator review the exact rights; this answer grants no permission." });
const CAPABILITY_ACTIONS = ["submit_request", "clarify", "review", "receipt"];
const DOMAIN_TABLES = ["licensing_cases", "buyer_capabilities", "request_submissions", "verification_records", "clarification_rounds",
  "clarification_answers", "terms_versions", "quotes", "creator_decisions", "buyer_acceptances", "invoice_bindings", "payment_operations",
  "payment_evidence", "permissions", "receipt_revisions"];
const moduleName = process.env.RR_PLAYWRIGHT_MODULE;
const playwright = await import(moduleName ? pathToFileURL(createRequire(import.meta.url).resolve(moduleName)).href : "playwright");
const { chromium } = playwright.default ?? playwright;
const directory = resolve(process.env.RR_INTAKE_ARTIFACTS || join(tmpdir(), "rightsreceipt-intake-browser"));
mkdirSync(directory, { recursive: true });
const checks = [], scenarios = [];
const report = { mode: "seed-only browser intake to canonical receipt using actual native handlers", runtime: process.version,
  limitations: ["No listening server, deployed Worker or Cloudflare D1", "Generated Access signing keys and injected gateway assertions",
    "Only workspace, asset and pricing policy are seeded; every transactional record comes from production handlers",
    "PayPal HTTP responses are local deterministic fixtures; no provider network or payment occurs",
    "Browser expiry advances test time; hidden/history lifecycle events are injected",
    "Chromium interception does not expose Fetch Metadata in this runtime; native route tests cover that check"],
  completed: false, passed: 0, checks, scenarios };
let scenarioName = "setup";
function check(label, condition = true) { assert.ok(condition, `${scenarioName}: ${label}`); checks.push({ scenario: scenarioName, check: label }); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function waitForHold(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(Error("The expected native response did not arrive.")), 15000); })]); }
  finally { clearTimeout(timer); }
}
async function bridge(context, fixture) {
  const drops = new Map(), holds = new Map(), outstanding = new Set(), errors = [], pageErrors = [], unexpectedOrigins = [];
  context.on("page", page => page.on("pageerror", error => pageErrors.push(error.message)));
  await context.route("**/*", route => {
    const task = (async () => {
      const incoming = route.request(), url = new URL(incoming.url());
      if (url.origin !== ORIGIN) { unexpectedOrigins.push(url.origin); await route.abort("blockedbyclient"); return; }
      const body = incoming.postDataBuffer(), headers = await incoming.allHeaders();
      const response = await fixture.dispatch(new Request(incoming.url(), { method: incoming.method(), headers,
        ...(body && !["GET", "HEAD"].includes(incoming.method()) ? { body } : {}) }), { browser: true });
      const key = `${incoming.method()} ${url.pathname}`, held = holds.get(key);
      if (held) { holds.delete(key); held.arrived.resolve(); await held.release.promise; }
      if ((drops.get(key) ?? 0) > 0) { drops.set(key, drops.get(key) - 1); await route.abort("failed").catch(() => {}); return; }
      try { await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }); }
      catch (error) { if (!held) throw error; }
    })();
    outstanding.add(task); task.catch(error => errors.push(error.message)).finally(() => outstanding.delete(task)); return task;
  });
  return { errors, pageErrors, unexpectedOrigins,
    dropNext(path) { drops.set(`POST ${path}`, 1); },
    holdNext(path, method = "POST") { const hold = { arrived: deferred(), release: deferred() }; holds.set(`${method} ${path}`, hold);
      return { arrived: hold.arrived.promise, release: hold.release.resolve }; },
    async settle() { await Promise.allSettled([...outstanding]); },
  };
}
const posts = (f, path) => f.requests.filter(row => row.browser && row.method === "POST" && row.path === path);
async function storageEmpty(page) { return page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0); }
async function state(page, value) { await page.waitForFunction(wanted => document.getElementById("status")?.dataset.state === wanted, value); }
async function creatorIntake(context, { clock = false } = {}) {
  const page = await context.newPage(); if (clock) await page.clock.install({ time: new Date(NOW) });
  await page.goto(ORIGIN + CREATOR_PAGE, { waitUntil: "domcontentloaded" }); await state(page, "ready"); return page;
}
async function buyerIntake(context, f, { clock = false } = {}) {
  const page = await context.newPage(); if (clock) await page.clock.install({ time: new Date(NOW) });
  await page.goto(`${ORIGIN}${BUYER_PAGE}#${f.token}`, { waitUntil: "domcontentloaded" }); await state(page, "ready"); return page;
}
async function revealedToken(page) {
  await page.locator("#show-link").click();
  const link = await page.locator("#private-link").inputValue(), parsed = new URL(link);
  assert.equal(parsed.origin + parsed.pathname, ORIGIN + BUYER_PAGE); assert.equal(parsed.search, "");
  const token = parsed.hash.slice(1); assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  await page.locator("#show-link").click(); assert.equal(await page.locator("#private-link").inputValue(), ""); return token;
}
async function issueInBrowser(page, f) {
  await page.locator("#issue-confirm").check();
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === CREATOR_ISSUE && response.request().method() === "POST");
  await page.locator("#issue-link").click(); const response = await pending;
  assert.equal(response.status(), 200); const result = await response.json(); await state(page, "issued");
  const buyerToken = await revealedToken(page); f.attachIntake({ caseId: result.caseId, buyerToken }); return result;
}
async function issueNative(f) {
  const response = await f.native(CREATOR_REVIEW); assert.equal(response.status, 200); const view = await response.json();
  const buyerToken = randomBytes(32).toString("base64url");
  const command = { requestId: crypto.randomUUID(), expectedAssetVersion: view.assetVersion, reviewHash: view.reviewHash,
    tokenDigestSha256: createHash("sha256").update(buyerToken).digest("hex"), confirmed: true, copyVersion: view.copyVersion };
  const saved = await f.native(CREATOR_ISSUE, { method: "POST", body: command });
  assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json())); const result = await saved.json();
  f.attachIntake({ caseId: result.caseId, buyerToken }); return { command, result, buyerToken };
}
async function fillIntake(page, values = BUYER) {
  for (const [key, id] of Object.entries({ buyerName: "buyer-name", buyerOrganization: "buyer-organization", buyerEmail: "buyer-email", intendedUseText: "intended-use" })) {
    await page.locator(`#${id}`).fill(values[key]);
  }
}
async function submitIntake(page, expectedStatus = 200) {
  await page.locator("#consent-confirm").check();
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === BUYER_SUBMIT && response.request().method() === "POST");
  await page.locator("#submit-request").click(); const response = await pending; assert.equal(response.status(), expectedStatus); return response.json();
}
async function loadedClarification(page, creator = false) {
  await page.waitForFunction(id => (document.getElementById(id)?.children.length ?? 0) > 0 && !document.getElementById("reload").disabled,
    creator ? "fields" : "clarification-details");
}
async function fillAnswers(page) {
  const fields = await page.locator('#questions textarea[id^="answer-"]').evaluateAll(nodes => nodes.map(node => node.id.slice(7)));
  assert.ok(fields.length > 0);
  for (const field of fields) { assert.ok(field in ANSWERS); await page.locator(`#answer-${field}`).fill(ANSWERS[field]); }
  return fields;
}
async function fillTerms(page) {
  for (const [field, value] of Object.entries(VALUES)) {
    await page.locator(`#state-${field}`).selectOption("resolved");
    if (Array.isArray(value)) { for (const item of value) await page.locator(`#value-${field}-${item}`).check(); }
    else { const input = page.locator(`#value-${field}`), tag = await input.evaluate(node => node.tagName);
      if (tag === "SELECT") await input.selectOption(String(value)); else await input.fill(String(value)); }
  }
}
async function creatorReady(page) {
  await page.waitForFunction(() => (document.getElementById("offer")?.children.length ?? 0) > 0
    && !document.getElementById("invoice-panel").hidden && !document.getElementById("reload").disabled);
}
async function buyerReady(page) {
  await page.waitForFunction(() => (document.getElementById("offer")?.children.length ?? 0) > 0
    && !document.getElementById("buyer-status-panel").hidden && !document.getElementById("reload").disabled);
}
async function screenshot(page, name) {
  await page.screenshot({ path: join(directory, `${name}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check(`${name} mobile content fits the viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(directory, `${name}-mobile.png`), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 1000 });
}
function noPaymentAuthority(f) {
  for (const table of ["payment_evidence", "permissions", "receipt_revisions"]) assert.equal(f.count(table), 0, `${table} must remain empty`);
}
async function privateBoundary(page, f, context) {
  check("private capability is absent from network URLs, request bodies and browser storage", f.requests.every(row => !row.requestUrl.includes(f.token)
    && !new URL(row.requestUrl).hash && !(row.body ?? "").includes(f.token)) && await storageEmpty(page));
  check("private capability is absent from DOM and cookies", !(await page.content()).includes(f.token)
    && (await context.cookies()).every(cookie => !cookie.value.includes(f.token)));
}
const browser = await chromium.launch({ headless: true,
  ...(process.env.RR_CHROMIUM ? { executablePath: process.env.RR_CHROMIUM } : {}), args: ["--no-sandbox"] });
report.browser = browser.version();
async function scenario(name, run, { financial = false } = {}) {
  scenarioName = name;
  const fixture = transactionBrowserFixture({ initialCase: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
  context.setDefaultTimeout(10000);
  await context.addCookies([{ name: "fixture_gateway_cookie", value: "not-an-access-assertion", domain: "rightsreceipt.example",
    path: "/", httpOnly: true, secure: true, sameSite: "Strict" }]);
  const routing = await bridge(context, fixture);
  try {
    for (const table of DOMAIN_TABLES) assert.equal(fixture.count(table), 0, `${table} must start empty`);
    assert.equal(fixture.count("creator_workspaces"), 1); assert.equal(fixture.count("assets"), 1); assert.equal(fixture.count("pricing_policy_versions"), 1);
    check("fixture starts with only workspace, asset and policy domain records");
    await run({ fixture, context, bridge: routing }); await routing.settle();
    assert.deepEqual(routing.errors, []); assert.deepEqual(routing.pageErrors, []); assert.deepEqual(routing.unexpectedOrigins, []);
    if (!financial) { assert.equal(fixture.providerCalls.length, 0); noPaymentAuthority(fixture); }
    check("native browser routing completes without unhandled errors or unexpected network origins");
    scenarios.push({ name, browserRequests: fixture.requests.filter(row => row.browser).length, migrations: fixture.migrationHashes,
      generatedSignatureVerifications: "actual WebCrypto verifier", jwksReads: fixture.keyRequests.length,
      providerCalls: Object.fromEntries(["oauth", "create", "send", "get"].map(stage => [stage, fixture.providerCount(stage)])),
      durableRows: Object.fromEntries(DOMAIN_TABLES.map(table => [table, fixture.count(table)])) });
    console.log(JSON.stringify({ scenario: name, passed: checks.filter(row => row.scenario === name).length }));
  } finally { await context.close(); await routing.settle(); fixture.close(); }
}

try {
  await scenario("seed_only_intake_to_canonical_receipt", async ({ fixture: f, context }) => {
    let page = await creatorIntake(context);
    check("creator asset review is read-only and verifies the managed gateway assertion", f.count("licensing_cases") === 0
      && f.count("buyer_capabilities") === 0 && f.keyRequests.length > 0);
    check("link issuance requires its own unchecked confirmation", !await page.locator("#issue-confirm").isChecked()
      && await page.locator("#issue-link").isDisabled());
    await screenshot(page, "creator-asset-request-link");
    const issued = await issueInBrowser(page, f), capability = f.db.prepare("SELECT * FROM buyer_capabilities WHERE case_id=?").get(f.caseId);
    const issueCommand = JSON.parse(posts(f, CREATOR_ISSUE)[0].body);
    check("actual creator action creates exactly one asset-bound case and capability", f.count("licensing_cases") === 1
      && f.count("buyer_capabilities") === 1 && f.case().asset_id === ids.asset && f.case().workspace_id === ids.workspace
      && f.count("request_submissions") === 0 && f.count("terms_versions") === 0 && f.count("quotes") === 0);
    check("only a SHA-256 digest crosses issuer JSON and reaches durable capability storage", issueCommand.tokenDigestSha256 === createHash("sha256").update(f.token).digest("hex")
      && capability.token_digest_sha256 === issueCommand.tokenDigestSha256 && !JSON.stringify(issued).includes(f.token)
      && !JSON.stringify(capability).includes(f.token));
    check("server fixes capability scopes and expiry instead of accepting browser authority", JSON.stringify(JSON.parse(capability.allowed_actions_json)) === JSON.stringify(CAPABILITY_ACTIONS)
      && Date.parse(capability.expires_at) - Date.parse(capability.issued_at) === 604800000
      && !["workspaceId", "caseId", "expiresAt", "allowedActions", "amountCents", "paid", "permission"].some(key => key in issueCommand));
    check("private link begins concealed and is never a token-bearing anchor", await page.locator("#private-link").inputValue() === ""
      && (await page.locator("a").evaluateAll(nodes => nodes.map(node => node.href))).every(href => !href.includes(f.token)));
    await privateBoundary(page, f, context); await screenshot(page, "creator-issued-request-link"); await page.close();

    page = await buyerIntake(context, f);
    check("buyer fragment is removed before the first intake read", page.url() === ORIGIN + BUYER_PAGE);
    const reads = f.requests.filter(row => row.browser && row.path === BUYER_REVIEW);
    check("buyer intake uses bearer authority without gateway cookies or assertions", reads.length === 1 && reads[0].buyerAuthorizationPresent
      && !reads[0].cookiePresent && !reads[0].browserAssertionPresent);
    check("buyer fields and consent start blank and unchecked", await page.locator("#buyer-name").inputValue() === ""
      && await page.locator("#buyer-email").inputValue() === "" && await page.locator("#intended-use").inputValue() === ""
      && !await page.locator("#consent-confirm").isChecked() && await page.locator("#submit-request").isDisabled());
    await screenshot(page, "buyer-request-empty");
    await fillIntake(page); await screenshot(page, "buyer-request-intake"); const submitted = await submitIntake(page); await state(page, "submitted");
    const request = f.db.prepare("SELECT * FROM request_submissions WHERE case_id=?").get(f.caseId);
    check("submission preserves Unicode and untrusted request text as exact evidence", f.count("request_submissions") === 1
      && request.intended_use_text === REQUEST && request.buyer_name === BUYER.buyerName && request.buyer_organization === BUYER.buyerOrganization
      && submitted.requestSubmissionId === request.request_submission_id && f.case().request_submission_id === request.request_submission_id);
    check("request submission grants no quote, approval, acceptance, payment or permission", f.count("terms_versions") === 0
      && f.count("quotes") === 0 && f.count("creator_decisions") === 0 && f.count("buyer_acceptances") === 0 && f.providerCalls.length === 0);
    noPaymentAuthority(f); await privateBoundary(page, f, context); await screenshot(page, "buyer-request-submitted");
    await page.locator("#open-clarification").click(); await page.waitForURL(ORIGIN + "/buyer/clarification"); await loadedClarification(page);
    check("explicit continuation transfers private authority and clears its URL fragment", page.url() === ORIGIN + "/buyer/clarification"
      && !(await page.content()).includes(f.token));
    const answerFields = await fillAnswers(page); await page.locator("#answers-confirm").check();
    const answerResponse = page.waitForResponse(response => new URL(response.url()).pathname === BUYER_ANSWERS && response.request().method() === "POST");
    await page.locator("#save-answers").click(); assert.equal((await answerResponse).status(), 200); await loadedClarification(page);
    check("buyer clarification remains evidence for a later creator decision", f.count("clarification_rounds") === 1
      && f.count("clarification_answers") === answerFields.length && f.count("terms_versions") === 0 && f.count("quotes") === 0);
    await page.close();

    page = await context.newPage(); await page.goto(`${ORIGIN}/creator/clarification/${f.caseId}`, { waitUntil: "domcontentloaded" });
    await loadedClarification(page, true);
    check("creator receives the original Unicode request without evaluating embedded markup", await page.locator("#original-request").innerText() === REQUEST
      && await page.locator("#original-request img, #original-request script").count() === 0 && !await page.evaluate(() => window.__intakeInjected));
    const states = await page.locator('#fields select[id^="state-"]').evaluateAll(nodes => nodes.map(node => node.value));
    check("all twelve rights await human review even after buyer answers", states.length === 12 && states.every(value => value === "unresolved"));
    await fillTerms(page); await screenshot(page, "creator-intake-rights-review");
    await page.locator("#revision-confirm").check();
    const termsPath = `/api/clarification/creator/cases/${f.caseId}/terms`;
    const termsResponse = page.waitForResponse(response => new URL(response.url()).pathname === termsPath && response.request().method() === "POST");
    await page.locator("#save-revision").click(); assert.equal((await termsResponse).status(), 200); await loadedClarification(page, true);
    const terms = f.db.prepare("SELECT * FROM terms_versions WHERE terms_version_id=?").get(f.case().latest_terms_version_id);
    const quote = f.db.prepare("SELECT * FROM quotes WHERE quote_id=?").get(f.case().latest_quote_id);
    check("creator review writes one complete terms version and deterministic 42500-cent quote", terms.resolution_status === "complete"
      && quote.amount_cents === 42500 && f.count("terms_versions") === 1 && f.count("quotes") === 1 && f.count("creator_decisions") === 0);
    await page.locator("#open-offer").click(); await creatorReady(page);
    check("prepared terms still require a separate explicit creator approval", !await page.locator("#confirm").isChecked() && await page.locator("#submit").isDisabled());
    await page.locator("#confirm").check(); await page.locator("#submit").click();
    await page.waitForFunction(() => document.getElementById("offer").textContent.includes("Awaiting buyer acceptance"));
    check("creator approval is bound to the reviewed terms and quote", f.count("creator_decisions") === 1
      && f.db.prepare("SELECT terms_version_id,quote_id FROM creator_decisions").get().terms_version_id === terms.terms_version_id);
    await page.close();

    page = await context.newPage(); await page.goto(`${ORIGIN}${BUYER_PAGE}#${f.token}`, { waitUntil: "domcontentloaded" }); await state(page, "submitted");
    await page.locator("#open-clarification").click(); await page.waitForURL(ORIGIN + "/buyer/review"); await buyerReady(page);
    check("original request link resumes the exact offer after creator approval", page.url() === ORIGIN + "/buyer/review"
      && !(await page.content()).includes(f.token) && await storageEmpty(page));
    check("buyer sees the deterministic price and gives fresh exact-version acceptance", (await page.locator("#offer").innerText()).includes("$425.00")
      && !await page.locator("#acknowledge").isChecked() && await page.locator("#accept").isDisabled());
    await page.locator("#acknowledge").check(); await page.locator("#accept").click();
    await page.waitForFunction(() => document.getElementById("offer").textContent.includes("Acceptance recorded"));
    const accepted = f.db.prepare("SELECT * FROM buyer_acceptances").get();
    check("acceptance records the actual creator decision without performing provider work", f.count("buyer_acceptances") === 1
      && accepted.terms_version_id === terms.terms_version_id && accepted.quote_id === quote.quote_id
      && accepted.creator_decision_id === f.case().latest_creator_decision_id && f.providerCalls.length === 0);
    await page.close();

    page = await context.newPage(); await page.goto(`${ORIGIN}/creator/review/${f.caseId}`, { waitUntil: "domcontentloaded" }); await creatorReady(page);
    await page.locator("#create-form").waitFor({ state: "visible" });
    check("accepted offer requires a separate invoice-draft confirmation", !await page.locator("#create-confirm").isChecked() && await page.locator("#create-invoice").isDisabled());
    await page.locator("#create-confirm").check(); await page.locator("#create-invoice").click(); await page.locator("#send-form").waitFor({ state: "visible" }); await creatorReady(page);
    check("production handler derives one unsent draft from the exact accepted quote", f.providerCount("create") === 1 && f.providerCount("send") === 0
      && f.binding().invoice_status === "draft" && JSON.parse(f.providerCalls.find(row => row.stage === "create").body).items[0].unit_amount.value === "425.00");
    check("invoice delivery requires another unchecked confirmation", !await page.locator("#send-confirm").isChecked() && await page.locator("#send-invoice").isDisabled());
    await page.locator("#send-confirm").check(); await page.locator("#send-invoice").click();
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("Sandbox delivery is recorded"));
    check("production send records one delivery and queues reconciliation without payment authority", f.providerCount("send") === 1
      && f.binding().invoice_status === "sent" && f.outbox().requested_generation === 1 && f.outbox().completed_generation === 0);
    noPaymentAuthority(f); await page.close();

    page = await context.newPage();
    const beforeResume = f.totalChanges(), callsBeforeResume = f.providerCalls.length;
    await page.goto(`${ORIGIN}${BUYER_PAGE}#${f.token}`, { waitUntil: "domcontentloaded" }); await state(page, "submitted");
    check("original shared link resumes the submitted request after invoice delivery", page.url() === ORIGIN + BUYER_PAGE
      && await page.locator("#intake-form").isHidden() && await page.locator("#original-request").innerText() === REQUEST
      && f.totalChanges() === beforeResume && f.providerCalls.length === callsBeforeResume);
    await page.locator("#open-clarification").click(); await page.waitForURL(ORIGIN + "/buyer/review"); await buyerReady(page);
    check("original-link continuation reaches payment review without a token-bearing anchor", page.url() === ORIGIN + "/buyer/review"
      && !(await page.content()).includes(f.token) && await storageEmpty(page));
    const beforeHandoff = f.totalChanges(), handoffResponse = page.waitForResponse(response => new URL(response.url()).pathname === BUYER_HANDOFF_PATH && response.request().method() === "POST");
    await page.locator("#refresh-payment").click(); assert.equal((await handoffResponse).status(), 200); await page.locator("#payment-handoff").waitFor({ state: "visible" });
    check("buyer receives a verified Sandbox payment handoff without canonical writes", f.totalChanges() === beforeHandoff
      && (await page.locator("#payment-handoff").getAttribute("href")) === f.controls.paymentUrl);
    noPaymentAuthority(f);
    f.controls.providerStatus = "PAID";
    const reconciliation = await f.reconcile(), issuance = await f.issueReceipt();
    check("real financial reconciliation creates payment evidence and scheduled permission", reconciliation.consumer === "financial_lifecycle"
      && reconciliation.outcomes.applied === 1 && f.count("payment_evidence") === 1 && f.permission().permission_state === "scheduled"
      && f.binding().invoice_status === "paid");
    check("real issuance produces a canonical receipt for the newly submitted request", issuance.outcome === "issued" && f.count("receipt_revisions") === 1
      && f.receipt().payload_hash === issuance.hash);
    const first = f.receipt(), writes = f.totalChanges(), providerCalls = f.providerCalls.length;
    await page.locator("#reload").click(); await buyerReady(page); await page.locator("#read-receipt").waitFor({ state: "visible" });
    check("receipt status is read-only and reports scheduled permission before its start date", f.totalChanges() === writes
      && f.providerCalls.length === providerCalls && (await page.locator("#permission-status").innerText()).startsWith("Scheduled in Sandbox"));
    const publicPath = await page.locator("#verification-link").getAttribute("href");
    check("public verification is opaque and excludes the private token and case identifier", publicPath === `/verify/receipt/${f.publicId()}`
      && !publicPath.includes(f.token) && !publicPath.includes(f.caseId));
    await page.locator("#read-receipt").click(); await page.waitForURL(ORIGIN + "/receipts/buyer"); await page.locator("#rr-document").waitFor({ state: "visible" });
    check("private receipt shows the actual exact-price canonical revision", (await page.locator("#rr-document").innerText()).includes(first.payload_hash)
      && (await page.locator("#rr-document").innerText()).includes("$425.00"));
    await screenshot(page, "buyer-intake-canonical-receipt"); await privateBoundary(page, f, context);
    const downloading = page.waitForEvent("download"); await page.locator("#rr-export").click();
    const download = await downloading, stream = await download.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    check("receipt export preserves exact canonical bytes and SHA-256", bytes.toString() === first.canonical_payload_json
      && createHash("sha256").update(bytes).digest("hex") === first.payload_hash);
    const unchanged = await f.issueReceipt();
    check("repeat issuance keeps the same canonical receipt revision", unchanged.outcome === "unchanged"
      && unchanged.hash === first.payload_hash && f.count("receipt_revisions") === 1);
    const publicResponse = await f.native(publicPath), publicText = await publicResponse.text();
    check("public verification confirms the receipt hash without disclosing buyer request or identity", publicResponse.status === 200
      && publicText.includes(first.payload_hash) && !publicText.includes(BUYER.buyerEmail) && !publicText.includes(BUYER.buyerOrganization)
      && !publicText.includes("Ignore all instructions"));
    await page.close(); f.db.prepare("UPDATE assets SET availability='archived' WHERE asset_id=?").run(ids.asset);
    const beforeArchivedRead = f.totalChanges(), archivedCalls = f.providerCalls.length;
    page = await context.newPage(); await page.goto(`${ORIGIN}${BUYER_PAGE}#${f.token}`, { waitUntil: "domcontentloaded" }); await state(page, "submitted");
    check("original shared link retains read-only continuation for an archived completed deal", await page.locator("#intake-form").isHidden()
      && await page.locator("#open-clarification").isEnabled() && f.totalChanges() === beforeArchivedRead && f.providerCalls.length === archivedCalls);
    await page.locator("#open-clarification").click(); await page.waitForURL(ORIGIN + "/buyer/review");
    await page.waitForFunction(() => !document.getElementById("buyer-status-panel").hidden
      && document.getElementById("permission-status").textContent.startsWith("Scheduled in Sandbox"));
    check("archived original-link continuation exposes the current receipt without new consent or payment", await page.locator("#read-receipt").isVisible()
      && await page.locator("#acceptance-form").isHidden() && await page.locator("#refresh-payment").isDisabled()
      && (await page.locator("#status-details").innerText()).includes(first.payload_hash));
    await page.locator("#read-receipt").click(); await page.waitForURL(ORIGIN + "/receipts/buyer"); await page.locator("#rr-document").waitFor({ state: "visible" });
    check("archived deal opens the unchanged canonical receipt from the original shared link", (await page.locator("#rr-document").innerText()).includes(first.payload_hash)
      && f.count("receipt_revisions") === 1 && f.providerCount("create") === 1 && f.providerCount("send") === 1);
    await privateBoundary(page, f, context);
    check("all browser commands used the exact application Origin", f.requests.filter(row => row.browser && row.method === "POST").every(row => row.origin === ORIGIN));
  }, { financial: true });

  await scenario("lost_issuance_ack_retries_the_same_private_link", async ({ fixture: f, context, bridge: routing }) => {
    const page = await creatorIntake(context);
    routing.dropNext(CREATOR_ISSUE); await page.locator("#issue-confirm").check(); await page.locator("#issue-link").click(); await state(page, "uncertain");
    check("lost issuance response commits one case and capability without automatic retry", f.count("licensing_cases") === 1
      && f.count("buyer_capabilities") === 1 && posts(f, CREATOR_ISSUE).length === 1 && f.count("request_submissions") === 0);
    check("uncertain issuance conceals the link and exposes an explicit exact retry", await page.locator("#private-link").inputValue() === ""
      && (await page.locator("#issue-link").innerText()).includes("Retry issuing this link") && await page.locator("#issue-confirm").isDisabled());
    const response = page.waitForResponse(value => new URL(value.url()).pathname === CREATOR_ISSUE && value.request().method() === "POST");
    await page.locator("#issue-link").click(); const result = await (await response).json(); await state(page, "issued");
    const buyerToken = await revealedToken(page); f.attachIntake({ caseId: result.caseId, buyerToken });
    const commands = posts(f, CREATOR_ISSUE);
    check("deliberate retry retains the same command, digest and generated capability", commands.length === 2 && commands[0].body === commands[1].body
      && result.replayed === true && f.count("licensing_cases") === 1 && f.count("buyer_capabilities") === 1
      && JSON.parse(commands[0].body).tokenDigestSha256 === createHash("sha256").update(buyerToken).digest("hex"));
    const changed = { ...JSON.parse(commands[0].body), tokenDigestSha256: "f".repeat(64) };
    const denied = await f.native(CREATOR_ISSUE, { method: "POST", body: changed });
    check("reusing an issuance identifier with another digest cannot rotate or duplicate authority", denied.status === 409
      && f.count("licensing_cases") === 1 && f.count("buyer_capabilities") === 1);
    check("retry leaves the original capability lifetime and case version intact", f.case().row_version === 1
      && Date.parse(result.expiresAt) - Date.parse(result.issuedAt) === 604800000);
    await privateBoundary(page, f, context);
  });

  await scenario("lost_buyer_ack_retries_exact_original_request", async ({ fixture: f, context, bridge: routing }) => {
    await issueNative(f); const page = await buyerIntake(context, f); await fillIntake(page);
    routing.dropNext(BUYER_SUBMIT); await page.locator("#consent-confirm").check(); await page.locator("#submit-request").click(); await state(page, "uncertain");
    check("lost buyer response leaves one committed original request and no automatic retry", f.count("request_submissions") === 1
      && f.case().row_version === 2 && posts(f, BUYER_SUBMIT).length === 1);
    check("uncertain original request is frozen under its pending command", await page.locator("#buyer-name").isDisabled()
      && await page.locator("#intended-use").isDisabled() && await page.locator("#consent-confirm").isDisabled()
      && (await page.locator("#submit-request").innerText()).includes("Retry this same request"));
    const response = page.waitForResponse(value => new URL(value.url()).pathname === BUYER_SUBMIT && value.request().method() === "POST");
    await page.locator("#submit-request").click(); const result = await (await response).json(); await state(page, "submitted");
    const commands = posts(f, BUYER_SUBMIT);
    check("explicit retry sends identical bytes and reuses the committed submission", commands.length === 2 && commands[0].body === commands[1].body
      && result.replayed === true && f.count("request_submissions") === 1 && f.case().row_version === 2
      && result.requestSubmissionId === f.case().request_submission_id);
    const changed = { ...JSON.parse(commands[0].body), intendedUseText: REQUEST + " Extra unreviewed use." };
    const denied = await f.native(BUYER_SUBMIT, { method: "POST", buyerToken: f.token, body: changed });
    check("changed payload cannot reuse the committed request identifier", denied.status === 409 && f.count("request_submissions") === 1
      && f.db.prepare("SELECT intended_use_text FROM request_submissions").get().intended_use_text === REQUEST);
    const viewResponse = await f.native(BUYER_REVIEW, { buyerToken: f.token }); const view = await viewResponse.json();
    check("server reload preserves exact submitted evidence and does not reopen original intake", viewResponse.status === 200
      && view.alreadySubmitted === true && view.originalRequest.intendedUseText === REQUEST && f.count("terms_versions") === 0);
    await privateBoundary(page, f, context);
  });

  await scenario("archived_before_offer_preserves_request_without_dead_end_navigation", async ({ fixture: f, context }) => {
    await issueNative(f); let page = await buyerIntake(context, f); await fillIntake(page);
    await submitIntake(page); await state(page, "submitted"); await page.close();
    const original = f.db.prepare("SELECT * FROM request_submissions WHERE case_id=?").get(f.caseId), version = f.case().row_version;
    f.db.prepare("UPDATE assets SET availability='archived' WHERE asset_id=?").run(ids.asset);
    const writes = f.totalChanges(), calls = f.providerCalls.length;
    page = await context.newPage();
    const response = page.waitForResponse(value => new URL(value.url()).pathname === BUYER_REVIEW && value.request().method() === "GET");
    await page.goto(`${ORIGIN}${BUYER_PAGE}#${f.token}`, { waitUntil: "domcontentloaded" });
    const reviewed = await response, view = await reviewed.json(); await state(page, "submitted");
    check("archived pre-offer request remains readable with no continuation path or authority", reviewed.status() === 200 && view.nextPath === null
      && view.alreadySubmitted === true && view.originalRequest.requestSubmissionId === original.request_submission_id
      && view.paymentConfirmed === false && view.permissionGranted === false);
    check("archived original evidence remains visible while a second intake is unavailable", await page.locator("#original-request").innerText() === REQUEST
      && await page.locator("#intake-form").isHidden() && (await page.locator("#asset-details").innerText()).includes("Harbor After Rain"));
    check("unavailable review has a disabled action and an explicit explanation", await page.locator("#open-clarification").isDisabled()
      && await page.locator("#open-clarification").innerText() === "Further review unavailable"
      && await page.locator("#resume-help").innerText() === "This image is no longer available for new rights review. Your original request remains recorded.");
    const requests = f.requests.length;
    await page.locator("#open-clarification").dispatchEvent("click");
    check("synthetic activation cannot navigate to unavailable clarification or send a command", page.url() === ORIGIN + BUYER_PAGE
      && f.requests.length === requests && f.totalChanges() === writes && f.providerCalls.length === calls);
    await screenshot(page, "buyer-archived-before-offer");
    await page.locator("#reload").click(); await state(page, "submitted");
    check("manual reload preserves immutable original evidence and performs no domain or provider work", f.totalChanges() === writes
      && f.providerCalls.length === calls && f.case().row_version === version
      && JSON.stringify(f.db.prepare("SELECT * FROM request_submissions WHERE case_id=?").get(f.caseId)) === JSON.stringify(original)
      && await page.locator("#open-clarification").isDisabled());
    check("read-only archived intake creates no quote, consent or financial authority", f.count("terms_versions") === 0 && f.count("quotes") === 0
      && f.count("creator_decisions") === 0 && f.count("buyer_acceptances") === 0 && f.count("invoice_bindings") === 0);
    await privateBoundary(page, f, context);
  });

  await scenario("creator_scope_stale_asset_and_cross_origin_are_denied", async ({ fixture: f, context }) => {
    f.controls.gatewayActor = "other";
    const other = await f.native(CREATOR_REVIEW);
    check("managed assertion for another workspace cannot review the seed asset", other.status === 403 && f.count("licensing_cases") === 0);
    f.controls.gatewayActor = "none";
    const unauthenticated = await f.native(CREATOR_REVIEW);
    check("creator review does not accept an absent gateway assertion", unauthenticated.status === 403 && f.count("buyer_capabilities") === 0);
    f.controls.gatewayActor = "creator";
    const page = await creatorIntake(context);
    f.setTime("2026-10-27T19:00:01.000Z");
    f.db.prepare("UPDATE assets SET title=?,row_version=row_version+1,updated_at=? WHERE asset_id=?").run("Harbor After Rain, revised", f.now().toISOString(), ids.asset);
    await page.locator("#issue-confirm").check();
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === CREATOR_ISSUE && response.request().method() === "POST");
    await page.locator("#issue-link").click(); assert.equal((await pending).status(), 409); await state(page, "error");
    check("asset change after review prevents issuance from stale browser evidence", f.count("licensing_cases") === 0
      && f.count("buyer_capabilities") === 0 && await page.locator("#private-link").inputValue() === "");
    const freshResponse = await f.native(CREATOR_REVIEW), fresh = await freshResponse.json();
    const command = { requestId: crypto.randomUUID(), expectedAssetVersion: fresh.assetVersion, reviewHash: fresh.reviewHash,
      tokenDigestSha256: createHash("sha256").update(randomBytes(32)).digest("hex"), confirmed: true, copyVersion: fresh.copyVersion };
    const crossOrigin = await f.dispatch(new Request(ORIGIN + CREATOR_ISSUE, { method: "POST",
      headers: { "content-type": "application/json", origin: "https://other.example", "sec-fetch-site": "cross-site" }, body: JSON.stringify(command) }));
    check("cross-origin issuer command is rejected before durable work", crossOrigin.status === 403 && f.count("licensing_cases") === 0);
    const extraAuthority = await f.native(CREATOR_ISSUE, { method: "POST", body: { ...command, allowedActions: ["admin"], workspaceId: ids.workspace } });
    check("issuer payload cannot add scopes or workspace authority", extraAuthority.status === 400 && f.count("buyer_capabilities") === 0);
    f.controls.gatewayActor = "other";
    const crossWorkspace = await f.native(CREATOR_ISSUE, { method: "POST", body: command });
    check("exact asset review does not cross a later workspace switch", crossWorkspace.status === 403 && f.count("licensing_cases") === 0);
    f.controls.gatewayActor = "creator";
    await issueNative(f); f.db.prepare("UPDATE assets SET availability='archived' WHERE asset_id=?").run(ids.asset);
    const archived = await f.native(BUYER_REVIEW, { buyerToken: f.token });
    check("archived asset blocks intake through an otherwise valid capability", archived.status === 403 && f.count("request_submissions") === 0);
  });

  await scenario("buyer_capability_scope_expiry_and_input_boundaries", async ({ fixture: f, context }) => {
    await issueNative(f);
    f.db.prepare("UPDATE buyer_capabilities SET allowed_actions_json=? WHERE case_id=?").run(JSON.stringify(["review"]), f.caseId);
    const page = await context.newPage(); await page.goto(`${ORIGIN}${BUYER_PAGE}#${f.token}`, { waitUntil: "domcontentloaded" }); await state(page, "error");
    check("review-only authority cannot open original request intake", await page.locator("#intake-form").isHidden()
      && await page.locator("#access-code").inputValue() === "" && f.count("request_submissions") === 0);
    const denied = await f.native(BUYER_REVIEW, { buyerToken: f.token });
    check("native intake independently enforces submit-request scope", denied.status === 403);
    f.db.prepare("UPDATE buyer_capabilities SET allowed_actions_json=? WHERE case_id=?").run(JSON.stringify(CAPABILITY_ACTIONS), f.caseId);
    const response = await f.native(BUYER_REVIEW, { buyerToken: f.token }), view = await response.json();
    assert.equal(response.status, 200);
    const base = { requestId: crypto.randomUUID(), expectedCaseVersion: view.caseVersion, reviewHash: view.reviewHash,
      ...BUYER, consentAcknowledged: true, copyVersion: view.copyVersion };
    const noConsent = await f.native(BUYER_SUBMIT, { method: "POST", buyerToken: f.token, body: { ...base, consentAcknowledged: false } });
    const authority = await f.native(BUYER_SUBMIT, { method: "POST", buyerToken: f.token, body: { ...base, amountCents: 1, permissionGranted: true } });
    check("unconfirmed requests and client-authored price or permission are rejected", noConsent.status === 400 && authority.status === 400 && f.count("request_submissions") === 0);
    const badEmail = await f.native(BUYER_SUBMIT, { method: "POST", buyerToken: f.token, body: { ...base, buyerEmail: "not-an-email" } });
    const tooLong = await f.native(BUYER_SUBMIT, { method: "POST", buyerToken: f.token, body: { ...base, intendedUseText: "x".repeat(20001) } });
    const executableMarkup = await f.native(BUYER_SUBMIT, { method: "POST", buyerToken: f.token, body: { ...base,
      intendedUseText: REQUEST + ' <img src=x onerror="window.__intakeInjected=true">' } });
    check("invalid contact and oversized original request do not persist partial intake", badEmail.status === 400 && [400, 413].includes(tooLong.status)
      && f.count("request_submissions") === 0 && f.case().row_version === 1);
    check("executable markup is rejected by the original-request domain guard", executableMarkup.status === 400 && f.count("request_submissions") === 0);
    f.setTime(new Date(Date.parse(NOW) + 604800001).toISOString());
    const expiredRead = await f.native(BUYER_REVIEW, { buyerToken: f.token });
    const expiredWrite = await f.native(BUYER_SUBMIT, { method: "POST", buyerToken: f.token, body: base });
    check("expired private authority cannot read or submit an original request", expiredRead.status === 403 && expiredWrite.status === 403
      && f.count("request_submissions") === 0 && f.case().row_version === 1);
    await privateBoundary(page, f, context);
  });

  await scenario("private_state_clears_when_creator_or_buyer_page_is_hidden", async ({ fixture: f, context }) => {
    let page = await creatorIntake(context); await issueInBrowser(page, f); await page.locator("#show-link").click();
    check("manual link reveal is explicit and contains the issued private authority", (await page.locator("#private-link").inputValue()).endsWith(`#${f.token}`));
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await state(page, "cleared");
    check("hidden creator page clears private link material without reissuing or revoking authority", await page.locator("#private-link").inputValue() === ""
      && f.count("licensing_cases") === 1 && f.count("buyer_capabilities") === 1 && posts(f, CREATOR_ISSUE).length === 1);
    await privateBoundary(page, f, context); await page.close();
    page = await buyerIntake(context, f); await fillIntake(page);
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await state(page, "cleared");
    check("hidden buyer page clears unsaved personal data and private continuation", await page.locator("#buyer-name").inputValue() === ""
      && await page.locator("#buyer-email").inputValue() === "" && await page.locator("#intended-use").inputValue() === ""
      && await page.locator("#intake-form").isHidden() && f.count("request_submissions") === 0);
    await privateBoundary(page, f, context);
  });

  await scenario("late_issuance_response_cannot_restore_expired_private_state", async ({ fixture: f, context, bridge: routing }) => {
    const page = await creatorIntake(context, { clock: true }), hold = routing.holdNext(CREATOR_ISSUE);
    try {
      await page.locator("#issue-confirm").check(); await page.locator("#issue-link").click(); await waitForHold(hold.arrived);
      check("held response follows exactly one durable issuance", f.count("licensing_cases") === 1 && f.count("buyer_capabilities") === 1);
      f.setTime(new Date(Date.parse(NOW) + 1800001).toISOString()); await page.clock.fastForward(1800001); hold.release(); await routing.settle();
      await state(page, "cleared");
      check("late successful issuance cannot repopulate cleared link material", await page.locator("#private-link").inputValue() === ""
        && await page.locator("#copy-link").isHidden() && await page.locator("#show-link").isHidden());
      check("expired response triggers no automatic replacement case or private-code recovery", posts(f, CREATOR_ISSUE).length === 1
        && f.count("licensing_cases") === 1 && f.count("buyer_capabilities") === 1 && await storageEmpty(page));
    } finally { hold.release(); }
  });

  report.completed = true;
} finally {
  await browser.close(); report.passed = checks.length;
  writeFileSync(join(directory, "intake-browser-results.json"), JSON.stringify(report, null, 2) + "\n");
}
