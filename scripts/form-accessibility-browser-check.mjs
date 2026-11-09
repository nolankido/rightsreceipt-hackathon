/**
 * Keyboard accessibility and form recovery through actual native routes.
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
import { transactionBrowserFixture, ORIGIN } from "./support/transaction-browser-fixture.mjs";
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
const DOMAIN_TABLES = ["licensing_cases", "buyer_capabilities", "request_submissions", "verification_records", "clarification_rounds",
  "clarification_answers", "terms_versions", "quotes", "creator_decisions", "buyer_acceptances", "invoice_bindings", "payment_operations",
  "payment_evidence", "permissions", "receipt_revisions"];
const moduleName = process.env.RR_PLAYWRIGHT_MODULE;
const playwright = await import(moduleName ? pathToFileURL(createRequire(import.meta.url).resolve(moduleName)).href : "playwright");
const { chromium } = playwright.default ?? playwright;
const directory = resolve(process.env.RR_ACCESSIBILITY_ARTIFACTS || join(tmpdir(), "rightsreceipt-form-accessibility-browser"));
mkdirSync(directory, { recursive: true });
const checks = [], scenarios = [];
const report = { mode: "keyboard and form recovery browser audit using actual native handlers", runtime: process.version,
  limitations: ["No listening server, deployed Worker or Cloudflare D1", "Generated Access signing keys and injected gateway assertions",
    "Only workspace, asset and pricing policy are seeded; every transactional record comes from production handlers",
    "PayPal HTTP responses are local deterministic fixtures; no provider network or payment occurs",
    "Browser expiry advances test time; hidden/history lifecycle events are injected",
    "Chromium interception does not expose Fetch Metadata in this runtime; native route tests cover that check",
    "Targeted keyboard, semantics, focus, error and responsive checks; no screen-reader or full WCAG conformance claim"],
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
async function tabTo(page, id) {
  for (let count = 0; count < 160; count++) {
    if (await page.evaluate(wanted => document.activeElement?.id === wanted, id)) return;
    await page.keyboard.press("Tab");
  }
  assert.fail(`Keyboard could not reach ${id}`);
}
async function press(page, id) { await tabTo(page,id); await page.keyboard.press("Enter"); }
async function tick(page, id) {
  await tabTo(page,id);
  if (!await page.locator(`#${id}`).isChecked()) await page.keyboard.press("Space");
}
async function focused(page,id) { await page.waitForFunction(wanted => document.activeElement?.id === wanted,id); }
async function semantics(page,label) {
  const issues = await page.evaluate(() => {
    const problems = [];
    for (const field of document.querySelectorAll("input,select,textarea,button")) {
      if (!field.getClientRects().length || field.type === "hidden") continue;
      const name = field.getAttribute("aria-label") || [...(field.labels ?? [])].map(item => item.textContent).join(" ")
        || (field.tagName === "BUTTON" ? field.textContent : "");
      if (!name.trim()) problems.push(`Unnamed ${field.id || field.tagName}`);
      for (const id of (field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) problems.push(`Missing description ${id}`);
      }
    }
    return problems;
  });
  check(`${label} gives every visible form control a name and resolving descriptions`,issues.length === 0);
  await page.setViewportSize({width:390,height:844});
  check(`${label} fits a mobile viewport`,await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({width:1280,height:1000});
}
async function errorLinks(page,summaryId,listId) {
  await focused(page,summaryId);
  const links = page.locator(`#${listId} a`), count = await links.count();
  assert.ok(count > 0);
  check("validation focuses a keyboard-readable summary with actionable links",await page.locator(`#${summaryId}`).isVisible());
  const problems = await links.evaluateAll(nodes => nodes.flatMap(link => {
    const id = link.getAttribute("href")?.slice(1), field = document.getElementById(id), descriptions = field?.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
    return !field || field.getAttribute("aria-invalid") !== "true" || !descriptions.some(name => document.getElementById(name)?.textContent === link.textContent)
      ? [id ?? "missing"] : [];
  }));
  check("each invalid control is linked to its own inline error without losing help text",problems.length === 0);
  const target = (await links.first().getAttribute("href")).slice(1), before = page.url();
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter"); await focused(page,target);
  check("keyboard activation of the error link focuses its field without changing private-link history",page.url() === before);
  return target;
}
async function moveToMain(page) {
  await tabTo(page,"skip-link");
  const before = page.url(); await page.keyboard.press("Enter"); await focused(page,"main-content");
  check("skip navigation is keyboard available and preserves the private-link URL",page.url() === before);
}
async function nativeIntake(f) {
  await issueNative(f);
  const view = await (await f.native(BUYER_REVIEW,{buyerToken:f.token})).json();
  const saved = await f.native(BUYER_SUBMIT,{method:"POST",buyerToken:f.token,body:{requestId:crypto.randomUUID(),
    expectedCaseVersion:view.caseVersion,reviewHash:view.reviewHash,...BUYER,consentAcknowledged:true,copyVersion:view.copyVersion}});
  assert.equal(saved.status,200); return saved.json();
}
async function nativeTerms(f) {
  if (!f.caseId) await nativeIntake(f);
  const path = `/api/clarification/creator/cases/${f.caseId}`;
  const view = await (await f.native(path+"/review")).json();
  const saved = await f.native(path+"/terms",{method:"POST",body:{requestId:crypto.randomUUID(),expectedCaseVersion:view.caseVersion,
    reviewHash:view.reviewHash,submissionId:view.latestSubmission?.reviewedTermsVersionId === null ? view.latestSubmission.submissionId : null,
    fields:Object.fromEntries(Object.entries(VALUES).map(([field,value]) => [field,{state:"resolved",value}])),confirmed:true,copyVersion:view.reviewCopyVersion}});
  assert.equal(saved.status,200,JSON.stringify(await saved.clone().json())); return saved.json();
}
async function openClarification(context,f,creator = false) {
  const page = await context.newPage();
  await page.goto(ORIGIN+(creator ? `/creator/clarification/${f.caseId}` : `/buyer/clarification#${f.token}`));
  await loadedClarification(page,creator); return page;
}
async function openOffer(context,f,creator = false,{clock = false} = {}) {
  const page = await context.newPage(); if (clock) await page.clock.install({time:new Date(NOW)});
  await page.goto(ORIGIN+(creator ? `/creator/review/${f.caseId}` : `/buyer/review#${f.token}`));
  await (creator ? creatorReady(page) : buyerReady(page)); return page;
}
async function nativeCreate(f) {
  const path = `/api/invoices/creator/cases/${f.caseId}`, view = await (await f.native(path)).json();
  const response = await f.native(path+"/create",{method:"POST",body:{expectedCaseVersion:view.caseVersion,confirmed:true}});
  assert.equal(response.status,200); return response.json();
}
function loseSendReply(f) {
  const original = f.transport.fetch; let lost = false;
  f.transport.fetch = async (url,init) => {
    const response = await original(url,init);
    if (url.endsWith("/send") && !lost) { lost = true; throw Error("Injected lost send reply after provider commit."); }
    return response;
  };
  return () => { f.transport.fetch = original; };
}
async function uncertainDelivery(f) {
  await nativeTerms(f); await f.approve(); await f.accept(); assert.equal((await nativeCreate(f)).outcome,"draft_bound");
  const path = `/api/invoices/creator/cases/${f.caseId}`, view = await (await f.native(path)).json(), restore = loseSendReply(f);
  try {
    const response = await f.native(path+"/send",{method:"POST",body:{expectedCaseVersion:view.caseVersion,invoiceId:view.invoiceId,confirmed:true}});
    assert.equal(response.status,200); assert.equal((await response.json()).outcome,"awaiting_reconciliation");
  } finally { restore(); }
}
const browser = await chromium.launch({headless:true,
  ...(process.env.RR_CHROMIUM ? {executablePath:process.env.RR_CHROMIUM} : {}),args:["--no-sandbox"]});
report.browser = browser.version();
async function scenario(name,run,{provider = false} = {}) {
  scenarioName = name;
  const fixture = transactionBrowserFixture({initialCase:false}); fixture.environment.INVOICE_RECOVERY_ENABLED = "true";
  const context = await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:"block"}); context.setDefaultTimeout(10000);
  await context.addCookies([{name:"fixture_gateway_cookie",value:"not-an-access-assertion",domain:"rightsreceipt.example",path:"/",httpOnly:true,secure:true,sameSite:"Strict"}]);
  const routing = await bridge(context,fixture);
  try {
    assert.equal(fixture.count("licensing_cases"),0); assert.equal(fixture.count("request_submissions"),0);
    await run({f:fixture,context,routing}); await routing.settle();
    assert.deepEqual(routing.errors,[]); assert.deepEqual(routing.pageErrors,[]); assert.deepEqual(routing.unexpectedOrigins,[]);
    if (!provider) assert.equal(fixture.providerCalls.length,0);
    noPaymentAuthority(fixture);
    check("actual routing completed without browser errors, unexpected origins or manufactured financial authority");
    scenarios.push({name,browserRequests:fixture.requests.filter(row => row.browser).length,
      providerCalls:Object.fromEntries(["oauth","create","send","get"].map(stage => [stage,fixture.providerCount(stage)])),
      durableRows:Object.fromEntries(DOMAIN_TABLES.map(table => [table,fixture.count(table)]))});
    console.log(JSON.stringify({scenario:name,passed:checks.filter(row => row.scenario === name).length}));
  } finally {await context.close();await routing.settle();fixture.close();}
}
try {
  await scenario("private_code_errors_and_skip_navigation",async ({f,context}) => {
    for (const path of ["/buyer/request","/buyer/clarification","/buyer/review"]) {
      const page = await context.newPage(); await page.goto(ORIGIN+path); await page.locator("#access-form").waitFor();
      check(`${path} does not steal focus on passive load`,await page.evaluate(() => document.activeElement === document.body));
      await moveToMain(page); await tabTo(page,"access-code"); await page.keyboard.insertText("short");
      await page.keyboard.press("Tab"); await page.keyboard.press("Enter"); await focused(page,"access-code");
      check(`${path} associates an actionable code error`,await page.locator("#access-code").getAttribute("aria-invalid") === "true"
        && (await page.locator("#access-code").getAttribute("aria-describedby")).split(/\s+/).includes("access-error")
        && await page.locator("#access-error").isVisible());
      check(`${path} invalid code performs no private API request`,f.requests.every(row => !row.path.startsWith("/api/")));
      await semantics(page,path); await page.close();
    }
  });

  await scenario("creator_link_keyboard_retry_and_expiry",async ({f,context,routing}) => {
    const page = await creatorIntake(context,{clock:true});
    check("creator asset auto-load leaves keyboard focus undisturbed",await page.evaluate(() => document.activeElement === document.body));
    await semantics(page,"creator request link"); routing.dropNext(CREATOR_ISSUE);
    await tick(page,"issue-confirm"); await press(page,"issue-link"); await state(page,"uncertain"); await focused(page,"issue-link");
    check("uncertain issuance restores focus to the exact retry and freezes its confirmation",await page.locator("#issue-confirm").isDisabled()
      && posts(f,CREATOR_ISSUE).length === 1 && f.count("licensing_cases") === 1);
    await page.keyboard.press("Enter"); await state(page,"issued"); await focused(page,"issued-title");
    check("keyboard retry preserves the exact issued command and a single case",posts(f,CREATOR_ISSUE).length === 2
      && posts(f,CREATOR_ISSUE)[0].body === posts(f,CREATOR_ISSUE)[1].body && f.count("licensing_cases") === 1);
    await press(page,"show-link"); await focused(page,"private-link");
    check("explicit manual link reveal has a named selected copy field",await page.locator("#private-link").evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length));
    await tabTo(page,"show-link"); await page.keyboard.press("Enter"); await focused(page,"show-link");
    check("hiding the private link clears it and preserves a usable focus target",await page.locator("#private-link").inputValue() === "");
    await press(page,"show-link"); await focused(page,"private-link");
    await page.clock.fastForward(300001); await state(page,"cleared"); await focused(page,"reload");
    check("expiry clears private material and restores keyboard recovery without a new request",await page.locator("#private-link").inputValue() === ""
      && f.count("licensing_cases") === 1 && posts(f,CREATOR_ISSUE).length === 2);
  });

  await scenario("buyer_intake_linked_validation_exact_retry_and_success",async ({f,context,routing}) => {
    await issueNative(f); const page = await buyerIntake(context,f);
    check("private intake auto-load does not focus a field or confirm consent",await page.evaluate(() => document.activeElement === document.body)
      && !await page.locator("#consent-confirm").isChecked());
    await tick(page,"consent-confirm"); await press(page,"submit-request");
    await errorLinks(page,"form-errors","error-list");
    check("invalid intake remains local and records no original request",posts(f,BUYER_SUBMIT).length === 0 && f.count("request_submissions") === 0);
    await semantics(page,"invalid buyer intake"); await screenshot(page,"buyer-request-validation");
    await fillIntake(page); check("editing requires renewed explicit request confirmation",!await page.locator("#consent-confirm").isChecked());
    routing.dropNext(BUYER_SUBMIT); await tick(page,"consent-confirm"); await press(page,"submit-request");
    await state(page,"uncertain"); await focused(page,"submit-request");
    check("uncertain intake restores a reachable retry while original fields stay frozen",await page.locator("#buyer-name").isDisabled()
      && await page.locator("#consent-confirm").isDisabled() && f.count("request_submissions") === 1);
    await page.keyboard.press("Enter"); await state(page,"submitted"); await focused(page,"submitted-title");
    check("successful exact retry focuses recorded evidence without duplicate submission",posts(f,BUYER_SUBMIT).length === 2
      && posts(f,BUYER_SUBMIT)[0].body === posts(f,BUYER_SUBMIT)[1].body && f.count("request_submissions") === 1);
    await privateBoundary(page,f,context);
  });

  await scenario("buyer_intake_late_success_respects_keyboard_navigation",async ({f,context,routing}) => {
    await issueNative(f); const page = await buyerIntake(context,f); await fillIntake(page);
    const hold = routing.holdNext(BUYER_SUBMIT);
    try {
      await tick(page,"consent-confirm"); await press(page,"submit-request"); await waitForHold(hold.arrived);
      await moveToMain(page); hold.release(); await routing.settle(); await state(page,"submitted");
      check("late intake success does not steal focus after deliberate skip navigation",await page.evaluate(() => document.activeElement.id === "main-content"));
      check("keyboard navigation adds no submission or consent action",posts(f,BUYER_SUBMIT).length === 1 && f.count("request_submissions") === 1);
    } finally {hold.release();}
  });

  await scenario("buyer_clarification_linked_errors_and_saved_focus",async ({f,context}) => {
    await nativeIntake(f); const page = await openClarification(context,f);
    check("clarification auto-load preserves focus and unchecked answer confirmation",await page.evaluate(() => document.activeElement === document.body)
      && !await page.locator("#answers-confirm").isChecked());
    await tick(page,"answers-confirm"); await press(page,"save-answers"); await errorLinks(page,"answer-errors","answer-error-list");
    check("missing answers provide local guidance without an HTTP command",posts(f,BUYER_ANSWERS).length === 0 && f.count("clarification_answers") === 0);
    await semantics(page,"buyer clarification errors"); await screenshot(page,"buyer-clarification-validation");
    await fillAnswers(page); check("answer editing resets explicit confirmation",!await page.locator("#answers-confirm").isChecked());
    await tick(page,"answers-confirm"); await press(page,"save-answers"); await focused(page,"saved-answers-title");
    check("successful answer save focuses durable evidence and grants no terms or acceptance",f.count("clarification_answers") > 0
      && f.count("terms_versions") === 0 && f.count("buyer_acceptances") === 0 && await page.locator("#answer-form").isHidden());
    await privateBoundary(page,f,context);
  });

  await scenario("creator_rights_errors_and_confirmed_save",async ({f,context}) => {
    await nativeIntake(f); const page = await openClarification(context,f,true), path = `/api/clarification/creator/cases/${f.caseId}/terms`;
    check("creator rights auto-load remains read-only without focus movement",await page.evaluate(() => document.activeElement === document.body)
      && f.count("terms_versions") === 0 && !await page.locator("#revision-confirm").isChecked());
    await page.locator("#state-channels").selectOption("resolved");
    await page.locator("#state-duration_days").selectOption("resolved"); await page.locator("#value-duration_days").fill("0");
    await page.locator("#state-ai_use").selectOption("contradictory");
    await tick(page,"revision-confirm"); await press(page,"save-revision"); await errorLinks(page,"form-errors","error-list");
    check("rights-group error text remains inside its matching fieldset",await page.locator('#fields [aria-invalid="true"]').evaluateAll(nodes => nodes.every(field => {
      const group = field.closest("fieldset"), notes = (field.getAttribute("aria-describedby") || "").split(/\s+/).map(id => document.getElementById(id));
      return notes.filter(note => note?.classList.contains("field-error")).every(note => group?.contains(note));
    })));
    check("invalid rights groups and notes cannot submit or create a quote",posts(f,path).length === 0 && f.count("terms_versions") === 0 && f.count("quotes") === 0);
    await semantics(page,"creator rights validation"); await screenshot(page,"creator-rights-validation");
    await fillTerms(page); check("rights edits require fresh explicit review confirmation",!await page.locator("#revision-confirm").isChecked());
    await tick(page,"revision-confirm"); await press(page,"save-revision"); await focused(page,"review-title");
    check("valid rights save returns focus to updated evidence without approving the offer",f.count("terms_versions") === 1 && f.count("quotes") === 1
      && f.count("creator_decisions") === 0 && f.count("buyer_acceptances") === 0 && !await page.locator("#revision-confirm").isChecked());
  });

  await scenario("creator_rights_late_success_preserves_navigation",async ({f,context,routing}) => {
    await nativeIntake(f); const page = await openClarification(context,f,true); await fillTerms(page);
    const path = `/api/clarification/creator/cases/${f.caseId}/terms`, hold = routing.holdNext(path);
    try {
      await tick(page,"revision-confirm"); await press(page,"save-revision"); await waitForHold(hold.arrived); await moveToMain(page);
      hold.release(); await routing.settle(); await page.waitForFunction(() => document.getElementById("status").textContent.includes("recorded"));
      check("late rights save does not replace a user's new keyboard focus",await page.evaluate(() => document.activeElement.id === "main-content"));
      check("focus navigation creates no duplicate rights or decision",posts(f,path).length === 1 && f.count("terms_versions") === 1 && f.count("creator_decisions") === 0);
    } finally {hold.release();}
  });

  await scenario("creator_decision_reason_error_and_approval_focus",async ({f,context}) => {
    await nativeTerms(f); const page = await openOffer(context,f,true), path = `/api/consent/creator/cases/${f.caseId}/decision`;
    check("creator offer auto-load does not move focus or record decisions",await page.evaluate(() => document.activeElement === document.body)
      && f.count("creator_decisions") === 0);
    await tabTo(page,"decision"); await page.keyboard.press("ArrowDown");
    await tick(page,"confirm"); await press(page,"submit"); await errorLinks(page,"decision-errors","decision-error-list");
    check("missing revision reason yields actionable local feedback with no decision write",posts(f,path).length === 0 && f.count("creator_decisions") === 0);
    await semantics(page,"creator explicit decision");
    await page.locator("#decision").selectOption("approved"); await tick(page,"confirm"); await press(page,"submit"); await focused(page,"offer-title");
    check("explicit approval focuses the updated offer without accepting for the buyer",f.count("creator_decisions") === 1 && f.count("buyer_acceptances") === 0);
  });

  await scenario("unsaved_creator_reason_clears_on_reload_expiry_hide_and_access_loss",async ({f,context}) => {
    await nativeTerms(f); const page = await openOffer(context,f,true,{clock:true}), path = `/api/consent/creator/cases/${f.caseId}/decision`;
    const writes = f.totalChanges(), calls = f.providerCalls.length;
    async function enterReason(value) {
      await page.locator("#decision").selectOption("rejected"); await page.locator("#reason").fill(value); await tick(page,"confirm");
      assert.equal(await page.locator("#reason").inputValue(),value); assert.equal(await page.locator("#confirm").isChecked(),true);
    }
    async function erased(label) {
      check(`${label} erases the unsaved reason, confirmation and owned validation state`,await page.locator("#reason").inputValue() === ""
        && !await page.locator("#confirm").isChecked() && await page.locator("#decision-errors").isHidden()
        && await page.locator("#decision-error-list").locator("li").count() === 0
        && await page.locator("#reason").getAttribute("aria-invalid") === null
        && !((await page.locator("#reason").getAttribute("aria-describedby")) || "").includes("creator-decision-"));
      check(`${label} performs no creator decision, provider work or domain mutation`,posts(f,path).length === 0
        && f.count("creator_decisions") === 0 && f.providerCalls.length === calls && f.totalChanges() === writes);
    }
    await enterReason("Private unsaved review note before a deliberate reload.");
    await press(page,"reload"); await creatorReady(page); await focused(page,"offer-title"); await erased("Explicit reload");

    await enterReason("Private first line of an unsaved reason.\nA second line needing correction.");
    await press(page,"submit"); await focused(page,"decision-errors");
    check("malformed unsaved reason has local error state before expiry without a command",await page.locator("#reason").inputValue() !== ""
      && await page.locator("#reason").getAttribute("aria-invalid") === "true" && posts(f,path).length === 0);
    await page.clock.fastForward(300001); await page.waitForFunction(() => document.getElementById("offer").children.length === 0);
    await focused(page,"reload"); await erased("Private deadline expiry");

    await press(page,"reload"); await creatorReady(page); await focused(page,"offer-title");
    await enterReason("Private unsaved review note before the page becomes hidden.");
    await page.evaluate(() => { Object.defineProperty(document,"hidden",{configurable:true,get:() => true}); document.dispatchEvent(new Event("visibilitychange")); });
    await erased("Hidden-page clearing");
    check("hidden creator page also clears the private offer and invoice controls",await page.locator("#offer").innerText() === ""
      && await page.locator("#decision-form").isHidden() && await page.locator("#invoice-panel").isHidden());

    await page.evaluate(() => { Object.defineProperty(document,"hidden",{configurable:true,get:() => false}); });
    await press(page,"reload"); await creatorReady(page); await focused(page,"offer-title");
    await enterReason("Private unsaved review note before creator access is lost."); f.controls.gatewayActor = "none";
    await press(page,"reload"); await page.waitForFunction(() => document.getElementById("status").textContent.includes("Session unavailable"));
    await focused(page,"reload"); await erased("Lost-access reload");
  });

  await scenario("buyer_acceptance_keyboard_exact_retry",async ({f,context,routing}) => {
    await nativeTerms(f); await f.approve(); const page = await openOffer(context,f);
    check("buyer offer load preserves focus and leaves acceptance unchecked",await page.evaluate(() => document.activeElement === document.body)
      && !await page.locator("#acknowledge").isChecked());
    await semantics(page,"buyer exact acceptance"); routing.dropNext("/api/consent/buyer/accept");
    await tick(page,"acknowledge"); await press(page,"accept");
    await page.waitForFunction(() => document.getElementById("accept").textContent.includes("Retry")); await focused(page,"accept");
    check("uncertain acceptance freezes confirmation and restores exact retry focus",await page.locator("#acknowledge").isDisabled()
      && f.count("buyer_acceptances") === 1 && posts(f,"/api/consent/buyer/accept").length === 1);
    await page.keyboard.press("Enter"); await focused(page,"buyer-status-title");
    const commands = posts(f,"/api/consent/buyer/accept");
    check("acceptance retry preserves exact bytes and a single durable acceptance",commands.length === 2 && commands[0].body === commands[1].body
      && f.count("buyer_acceptances") === 1 && f.count("invoice_bindings") === 0);
    await privateBoundary(page,f,context);
  });

  await scenario("buyer_acceptance_late_success_respects_navigation",async ({f,context,routing}) => {
    await nativeTerms(f); await f.approve(); const page = await openOffer(context,f), hold = routing.holdNext("/api/consent/buyer/accept");
    try {
      await tick(page,"acknowledge"); await press(page,"accept"); await waitForHold(hold.arrived); await moveToMain(page);
      hold.release(); await routing.settle(); await page.waitForFunction(() => document.getElementById("acceptance-form").hidden);
      await buyerReady(page);
      check("late acceptance retains deliberate navigation focus",await page.evaluate(() => document.activeElement.id === "main-content"));
      check("navigation never adds another acceptance or invoice",posts(f,"/api/consent/buyer/accept").length === 1
        && f.count("buyer_acceptances") === 1 && f.count("invoice_bindings") === 0);
    } finally {hold.release();}
  });

  await scenario("creator_invoice_keyboard_recovery_and_stale_retry",async ({f,context,routing}) => {
    await nativeTerms(f); await f.approve(); await f.accept(); const page = await openOffer(context,f,true), path = `/api/invoices/creator/cases/${f.caseId}`;
    await tick(page,"create-confirm"); await press(page,"create-invoice"); await focused(page,"invoice-title");
    check("draft creation returns focus to its recorded invoice and leaves send unconfirmed",f.providerCount("create") === 1
      && f.providerCount("send") === 0 && !await page.locator("#send-confirm").isChecked());
    const restore = loseSendReply(f);
    try {await tick(page,"send-confirm"); await press(page,"send-invoice"); await page.locator("#recovery-form").waitFor();}
    finally {restore();}
    await page.waitForFunction(() => ["invoice-title","recovery-title"].includes(document.activeElement?.id));
    check("uncertain delivery offers a separate unconfirmed recovery action without another send",f.providerCount("send") === 1
      && !await page.locator("#recovery-confirm").isChecked() && await page.locator("#recovery-command").isDisabled());
    await semantics(page,"creator invoice recovery"); await screenshot(page,"creator-invoice-recovery-keyboard");
    routing.dropNext(path+"/recover"); await tick(page,"recovery-confirm"); await press(page,"recovery-command");
    await page.waitForFunction(() => document.getElementById("recovery-command").textContent.includes("Retry")); await focused(page,"recovery-command");
    const calls = f.providerCalls.length;
    check("lost recovery reply keeps the reviewed action frozen and keyboard-reachable",await page.locator("#recovery-confirm").isDisabled()
      && posts(f,path+"/recover").length === 1);
    await page.keyboard.press("Enter"); await page.waitForFunction(() => document.getElementById("offer").children.length === 0); await focused(page,"reload");
    const attempts = posts(f,path+"/recover");
    check("stale exact recovery replay clears private view and focuses reload without provider work",attempts.length === 2
      && attempts[0].body === attempts[1].body && f.providerCalls.length === calls && await page.locator("#recovery-form").isHidden());
    await page.keyboard.press("Enter"); await creatorReady(page); await focused(page,"offer-title");
    check("keyboard reload shows completed delivery with one create/send and no financial authority",f.providerCount("create") === 1
      && f.providerCount("send") === 1 && f.providerCalls.length === calls && await page.locator("#recovery-form").isHidden());
  },{provider:true});

  await scenario("creator_recovery_late_success_respects_navigation",async ({f,context,routing}) => {
    await uncertainDelivery(f); const page = await openOffer(context,f,true), path = `/api/invoices/creator/cases/${f.caseId}/recover`, hold = routing.holdNext(path);
    try {
      await tick(page,"recovery-confirm"); await press(page,"recovery-command"); await waitForHold(hold.arrived); await moveToMain(page);
      hold.release(); await routing.settle(); await creatorReady(page);
      check("late recovery success respects a user's new keyboard focus",await page.evaluate(() => document.activeElement.id === "main-content"));
      check("focus changes cannot duplicate a recovery, creation or send",posts(f,path).length === 1 && f.providerCount("create") === 1 && f.providerCount("send") === 1);
    } finally {hold.release();}
  },{provider:true});

  await scenario("creator_pending_issuance_expiry_restores_reload",async ({f,context,routing}) => {
    const page = await creatorIntake(context,{clock:true}), hold = routing.holdNext(CREATOR_ISSUE);
    try {
      await tick(page,"issue-confirm"); await press(page,"issue-link"); await waitForHold(hold.arrived);
      check("pending issuance has disabled its focused action",await page.locator("#issue-link").isDisabled());
      await page.clock.fastForward(300001); await state(page,"cleared"); await focused(page,"reload");
      hold.release(); await routing.settle();
      check("expiry restores creator recovery and late issuance cannot reveal a private link",await page.locator("#private-link").inputValue() === ""
        && await page.locator("#issued-panel").isHidden() && posts(f,CREATOR_ISSUE).length === 1 && f.count("licensing_cases") === 1);
    } finally {hold.release();}
  });

  await scenario("buyer_pending_intake_expiry_restores_code",async ({f,context,routing}) => {
    await issueNative(f); const page = await buyerIntake(context,f,{clock:true}); await fillIntake(page);
    const hold = routing.holdNext(BUYER_SUBMIT);
    try {
      await tick(page,"consent-confirm"); await press(page,"submit-request"); await waitForHold(hold.arrived);
      await page.clock.fastForward(300001); await state(page,"cleared"); await focused(page,"access-code");
      hold.release(); await routing.settle();
      check("expired pending intake restores code entry and clears all private form data",await page.locator("#buyer-name").inputValue() === ""
        && await page.locator("#buyer-email").inputValue() === "" && await page.locator("#intended-use").inputValue() === ""
        && await page.locator("#submitted-panel").isHidden() && posts(f,BUYER_SUBMIT).length === 1 && f.count("request_submissions") === 1);
      await privateBoundary(page,f,context);
    } finally {hold.release();}
  });

  await scenario("buyer_pending_expiry_preserves_deliberate_navigation",async ({f,context,routing}) => {
    await issueNative(f); const page = await buyerIntake(context,f,{clock:true}); await fillIntake(page);
    const hold = routing.holdNext(BUYER_SUBMIT);
    try {
      await tick(page,"consent-confirm"); await press(page,"submit-request"); await waitForHold(hold.arrived); await moveToMain(page);
      await page.clock.fastForward(300001); await state(page,"cleared"); hold.release(); await routing.settle();
      check("expiry and a late reply preserve the user's deliberate main-content focus",await page.evaluate(() => document.activeElement.id === "main-content")
        && await page.locator("#intake-form").isHidden() && await page.locator("#submitted-panel").isHidden());
      check("expiry navigation does not issue another request",posts(f,BUYER_SUBMIT).length === 1 && f.count("request_submissions") === 1);
    } finally {hold.release();}
  });

  await scenario("late_acceptance_cannot_restore_expired_private_state",async ({f,context,routing}) => {
    await nativeTerms(f); await f.approve(); const page = await openOffer(context,f,false,{clock:true}), hold = routing.holdNext("/api/consent/buyer/accept");
    try {
      await tick(page,"acknowledge"); await press(page,"accept"); await waitForHold(hold.arrived);
      await page.clock.fastForward(300001); await page.locator("#access-form").waitFor(); await focused(page,"access-code"); hold.release(); await routing.settle();
      check("expired private view remains clear after a late committed acceptance",await page.locator("#offer").innerText() === ""
        && await page.locator("#acceptance-form").isHidden() && await page.locator("#buyer-status-panel").isHidden()
        && await page.locator("#access-code").inputValue() === "");
      await tabTo(page,"access-code");
      check("expired view retains a named keyboard recovery path without automatic resubmission",posts(f,"/api/consent/buyer/accept").length === 1
        && f.count("buyer_acceptances") === 1 && await storageEmpty(page));
    } finally {hold.release();}
  });

  report.completed = true;
} finally {
  await browser.close(); report.passed = checks.length;
  writeFileSync(join(directory,"form-accessibility-browser-results.json"),JSON.stringify(report,null,2)+"\n");
}
