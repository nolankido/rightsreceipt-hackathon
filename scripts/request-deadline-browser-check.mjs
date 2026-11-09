/**
 * Bounded request deadlines and explicit recovery through actual native routes.
 * Production migrations, managed assertion verification, domain services and
 * transactions are real. The HTTPS gateway and provider HTTP are local fixtures.
 * No case, request, capability, terms, quote, payment or permission is preloaded.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const directory = resolve(process.env.RR_DEADLINE_ARTIFACTS || join(tmpdir(), "rightsreceipt-request-deadline-browser"));
mkdirSync(directory, { recursive: true });
const checks = [], scenarios = [];
const report = { mode: "request deadline browser audit using actual native handlers", runtime: process.version,
  sourceSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
  clientSourceSha256: Object.fromEntries(["request-deadline-client","buyer-request-intake-client","buyer-clarification-client","buyer-review-client",
    "creator-request-intake-client","creator-clarification-client","creator-review-client"].map(name => [name,
    createHash("sha256").update(readFileSync(new URL(`../apps/web/src/${name}.ts`,import.meta.url))).digest("hex")])),
  requestDeadlineMs: 15000,
  limitations: ["No listening server, deployed Worker or Cloudflare D1", "Generated Access signing keys and injected gateway assertions",
    "Only workspace, asset and pricing policy are seeded; every transactional record comes from production handlers",
    "PayPal HTTP responses are local deterministic fixtures; no provider network or payment occurs",
    "Browser clock advances request and private-view deadlines deterministically; hidden events are injected",
    "Request interception deliberately holds transport before dispatch or after the actual handler commits",
    "One actual response body is replayed as unchanged bytes through an injected ReadableStream that deliberately ignores abort",
    "Chromium interception does not expose Fetch Metadata in this runtime; native route tests cover that check",
    "Targeted deadline and focus checks; no live-service latency, screen-reader or full WCAG conformance claim"],
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
  const queued = new Map(), active = new Set(), outstanding = new Set(), errors = [], pageErrors = [], unexpectedOrigins = [], attempts = [];
  context.on("page", page => page.on("pageerror", error => pageErrors.push(error.message)));
  await context.route("**/*", route => {
    const task = (async () => {
      const incoming = route.request(), url = new URL(incoming.url());
      if (url.origin !== ORIGIN) { unexpectedOrigins.push(url.origin); await route.abort("blockedbyclient"); return; }
      const method = incoming.method(), body = incoming.postDataBuffer(), headers = await incoming.allHeaders();
      const attempt = {method,path:url.pathname,body:body?.toString() ?? null}; attempts.push(attempt);
      const key = `${method} ${url.pathname}`, held = queued.get(key);
      if (held) { queued.delete(key); active.add(held); }
      if (held?.phase === "before") {
        held.arrived.resolve(); const dispatch = await held.release.promise;
        if (!dispatch) { active.delete(held); await route.abort("failed").catch(() => {}); return; }
      }
      const response = await fixture.dispatch(new Request(incoming.url(), {method,headers,
        ...(body && !["GET","HEAD"].includes(method) ? {body} : {})}), {browser:true});
      attempt.status = response.status;
      if (held?.phase === "after") { held.arrived.resolve(); await held.release.promise; }
      try { await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())}); }
      catch (error) { if (!held) throw error; }
      finally { if (held) active.delete(held); }
    })();
    outstanding.add(task); task.catch(error => errors.push(error.message)).finally(() => outstanding.delete(task)); return task;
  });
  return {errors,pageErrors,unexpectedOrigins,attempts,
    holdNext(path,{method="POST",phase="after"}={}) {
      const key = `${method} ${path}`; assert.ok(!queued.has(key),"Only one queued transport hold per route");
      const hold = {phase,arrived:deferred(),release:deferred()}; queued.set(key,hold);
      return {arrived:hold.arrived.promise,release:(dispatch=true) => hold.release.resolve(dispatch)};
    },
    releaseAll() { for (const hold of [...queued.values(),...active]) hold.release.resolve(hold.phase !== "before"); queued.clear(); },
    async settle() { await Promise.allSettled([...outstanding]); },
    matching(path,method="GET") { return attempts.filter(row => row.path === path && row.method === method); },
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
async function openClarification(context,f,creator = false,{clock = false} = {}) {
  const page = await context.newPage(); if (clock) await page.clock.install({time:new Date(NOW)});
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
    await run({f:fixture,context,routing}); routing.releaseAll(); await routing.settle();
    assert.deepEqual(routing.errors,[]); assert.deepEqual(routing.pageErrors,[]); assert.deepEqual(routing.unexpectedOrigins,[]);
    if (!provider) assert.equal(fixture.providerCalls.length,0);
    noPaymentAuthority(fixture);
    check("actual routing completed without browser errors, unexpected origins or manufactured financial authority");
    scenarios.push({name,browserAttempts:routing.attempts.length,browserRequests:fixture.requests.filter(row => row.browser).length,
      providerCalls:Object.fromEntries(["oauth","create","send","get"].map(stage => [stage,fixture.providerCount(stage)])),
      durableRows:Object.fromEntries(DOMAIN_TABLES.map(table => [table,fixture.count(table)]))});
    console.log(JSON.stringify({scenario:name,passed:checks.filter(row => row.scenario === name).length}));
  } finally {routing.releaseAll();await routing.settle();await context.close();fixture.close();}
}
async function timedOut(page, selector = "#status") {
  await page.clock.runFor(15001);
  await page.waitForFunction(target => document.querySelector(target)?.textContent.includes("timed out"),selector);
}
async function enterCode(page,f) {
  await page.locator("#access-code").fill(f.token);
  await page.locator("#access-code").press("Enter");
}
async function newClockPage(context,url) {
  const page = await context.newPage(); await page.clock.install({time:new Date(NOW)});
  await page.goto(ORIGIN+url,{waitUntil:"domcontentloaded"}); return page;
}
async function retryReady(page,id) {
  await page.waitForFunction(target => !document.getElementById(target).disabled && document.getElementById(target).textContent.toLowerCase().includes("retry"),id);
}
function sameCommands(routing,path) {
  const rows = routing.matching(path,"POST"); return rows.length === 2 && rows[0].body === rows[1].body;
}
async function bodyGate(context,path) {
  // This is a transport fault, not a replacement endpoint: all JSON bytes came
  // from the actual handler. Playwright fulfill cannot stream a response body.
  await context.addInitScript(({path}) => {
    const original = window.fetch; let used = false;
    window.__deadlineBodyGate = {arrived:false,headersDelivered:false,release:null};
    window.fetch = async (...args) => {
      const response = await original(...args), incoming = args[0];
      const url = new URL(typeof incoming === "string" ? incoming : incoming.url,location.href);
      if (used || url.pathname !== path) return response;
      used = true;
      const bytes = new TextEncoder().encode(await response.text()), split = Math.max(1,Math.floor(bytes.length/2));
      const gate = window.__deadlineBodyGate;
      const stream = new ReadableStream({start(controller) {
        controller.enqueue(bytes.slice(0,split));
        gate.release = () => {controller.enqueue(bytes.slice(split));controller.close();};
      }});
      gate.arrived = true; gate.headersDelivered = true;
      return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
    };
  },{path});
}
try {
  const readCases = [
    {name:"initial_creator_session",setup:async()=>{},url:()=>CREATOR_PAGE,path:()=>"/api/creator/session",ready:page=>state(page,"ready"),focus:"asset-title",blocked:()=>CREATOR_REVIEW},
    {name:"creator_asset_review",setup:async()=>{},url:()=>CREATOR_PAGE,path:()=>CREATOR_REVIEW,ready:page=>state(page,"ready"),focus:"asset-title"},
    {name:"creator_rights_review",setup:nativeIntake,url:f=>`/creator/clarification/${f.caseId}`,path:f=>`/api/clarification/creator/cases/${f.caseId}/review`,ready:page=>loadedClarification(page,true),focus:"review-title"},
    {name:"creator_invoice_read",setup:nativeTerms,url:f=>`/creator/review/${f.caseId}`,path:f=>`/api/invoices/creator/cases/${f.caseId}`,ready:creatorReady,focus:"offer-title",blocked:f=>`/api/invoices/creator/cases/${f.caseId}/recovery`},
    {name:"creator_recovery_read",setup:nativeTerms,url:f=>`/creator/review/${f.caseId}`,path:f=>`/api/invoices/creator/cases/${f.caseId}/recovery`,ready:creatorReady,focus:"offer-title"},
    {name:"buyer_initial_code_read",setup:issueNative,url:f=>`${BUYER_PAGE}#${f.token}`,path:()=>BUYER_REVIEW,ready:page=>state(page,"ready"),focus:"buyer-name",buyer:true},
    {name:"buyer_questions_read",setup:nativeIntake,url:f=>`/buyer/clarification#${f.token}`,path:()=>"/api/clarification/buyer/review",ready:page=>loadedClarification(page),focus:"clarification-title",buyer:true},
    {name:"buyer_offer_read",setup:async f=>{await nativeTerms(f);await f.approve();},url:f=>`/buyer/review#${f.token}`,path:()=>"/api/consent/buyer/review",ready:buyerReady,focus:"offer-title",buyer:true,blocked:()=>"/api/invoices/buyer/status"},
    {name:"buyer_status_read",setup:async f=>{await nativeTerms(f);await f.approve();},url:f=>`/buyer/review#${f.token}`,path:()=>"/api/invoices/buyer/status",ready:buyerReady,focus:"offer-title",statusOnly:true},
  ];
  for (const item of readCases) {
    await scenario(item.name+"_deadline",async ({f,context,routing}) => {
      await item.setup(f); const path = item.path(f), hold = routing.holdNext(path,{method:"GET",phase:"before"});
      const before = f.totalChanges(), page = await newClockPage(context,item.url(f)); await waitForHold(hold.arrived);
      await timedOut(page,item.statusOnly ? "#buyer-status" : "#status");
      check("the stalled read releases its busy state at the request deadline",item.buyer
        ? await page.locator("#access-form").isVisible() && await page.locator("#access-code").inputValue() === ""
        : !await page.locator("#reload").isDisabled());
      check("one held request causes no automatic second read or domain mutation",routing.matching(path).length === 1 && f.totalChanges() === before);
      if (item.blocked) check("a timed-out prerequisite does not fall through to the next optional read",routing.matching(item.blocked(f)).length === 0);
      if (item.statusOnly) check("timed-out payment status asserts no current permission",(await page.locator("#permission-status").innerText()).includes("No current permission status"));
      check("a passive read timeout does not steal keyboard focus",await page.evaluate(() => document.activeElement === document.body));
      hold.release(false); await routing.settle();
      if (item.buyer) await enterCode(page,f); else await press(page,"reload");
      await item.ready(page);
      // Question recovery can target the first open question or its heading.
      if (item.name !== "buyer_questions_read") await focused(page,item.focus);
      check("deliberate recovery performs exactly one fresh read",routing.matching(path).length === 2);
      if (item.buyer) await privateBoundary(page,f,context);
    });
  }

  for (const phase of ["before","after"]) {
    await scenario(`creator_link_${phase}_dispatch_deadline`,async ({f,context,routing}) => {
      const page = await creatorIntake(context,{clock:true}), hold = routing.holdNext(CREATOR_ISSUE,{phase});
      await tick(page,"issue-confirm"); await press(page,"issue-link"); await waitForHold(hold.arrived);
      const committed = phase === "after" ? 1 : 0;
      check("the transport hold exposes whether the actual command committed",f.count("licensing_cases") === committed && f.count("buyer_capabilities") === committed);
      await timedOut(page); await retryReady(page,"issue-link"); await focused(page,"issue-link");
      check("issuance timeout keeps the original confirmation frozen and does not issue automatically",await page.locator("#issue-confirm").isDisabled()
        && routing.matching(CREATOR_ISSUE,"POST").length === 1 && await page.locator("#issued-panel").isHidden());
      check("issuance recovery identifies the same generated link",(await page.locator("#status").innerText()).includes("same link"));
      if (phase === "after") await page.screenshot({path:join(directory,"creator-issued-command-timeout.png"),fullPage:true});
      hold.release(phase !== "before"); await routing.settle();
      check("late transport completion cannot reveal an unconfirmed link",await page.locator("#issued-panel").isHidden() && await page.locator("#private-link").inputValue() === "");
      await press(page,"issue-link"); await state(page,"issued"); await focused(page,"issued-title");
      check("explicit issuance retry preserves every request byte and creates one case and capability",sameCommands(routing,CREATOR_ISSUE)
        && f.count("licensing_cases") === 1 && f.count("buyer_capabilities") === 1);
      check("native handler dispatch counts match the declared hold phase",posts(f,CREATOR_ISSUE).length === (phase === "before" ? 1 : 2));
    });
  }

  await scenario("buyer_request_committed_reply_deadline_and_moved_focus",async ({f,context,routing}) => {
    await issueNative(f); const page = await buyerIntake(context,f,{clock:true}); await fillIntake(page);
    const hold = routing.holdNext(BUYER_SUBMIT); await tick(page,"consent-confirm"); await press(page,"submit-request"); await waitForHold(hold.arrived);
    await moveToMain(page); await timedOut(page); await retryReady(page,"submit-request");
    check("a committed request remains uncertain until an explicit retry",f.count("request_submissions") === 1 && routing.matching(BUYER_SUBMIT,"POST").length === 1
      && await page.locator("#submitted-panel").isHidden() && await page.locator("#buyer-name").isDisabled());
    check("deadline recovery respects deliberate keyboard navigation",await page.evaluate(() => document.activeElement.id === "main-content"));
    await page.screenshot({path:join(directory,"buyer-saved-command-timeout.png"),fullPage:true});
    hold.release(); await routing.settle();
    check("late committed reply cannot replace uncertainty or move focus",await page.locator("#submitted-panel").isHidden()
      && await page.evaluate(() => document.activeElement.id === "main-content"));
    await press(page,"submit-request"); await state(page,"submitted"); await focused(page,"submitted-title");
    check("retry records no duplicate original request and preserves the entire command",sameCommands(routing,BUYER_SUBMIT) && f.count("request_submissions") === 1);
    await privateBoundary(page,f,context);
  });

  await scenario("buyer_answers_committed_reply_deadline",async ({f,context,routing}) => {
    await nativeIntake(f); const page = await openClarification(context,f,false,{clock:true}), fields = await fillAnswers(page);
    const hold = routing.holdNext(BUYER_ANSWERS); await tick(page,"answers-confirm"); await press(page,"save-answers"); await waitForHold(hold.arrived);
    await timedOut(page); await retryReady(page,"save-answers"); await focused(page,"save-answers");
    check("answer timeout preserves one committed round and frozen input",f.count("clarification_rounds") === 1 && f.count("clarification_answers") === fields.length
      && await page.locator(`#answer-${fields[0]}`).isDisabled() && routing.matching(BUYER_ANSWERS,"POST").length === 1);
    hold.release(); await routing.settle(); await press(page,"save-answers"); await loadedClarification(page);
    check("explicit answer retry replays the exact command with no duplicate round",sameCommands(routing,BUYER_ANSWERS)
      && f.count("clarification_rounds") === 1 && f.count("clarification_answers") === fields.length);
    await privateBoundary(page,f,context);
  });

  await scenario("creator_terms_committed_reply_deadline",async ({f,context,routing}) => {
    await nativeIntake(f); const page = await openClarification(context,f,true,{clock:true}); await fillTerms(page);
    const path = `/api/clarification/creator/cases/${f.caseId}/terms`, hold = routing.holdNext(path);
    await tick(page,"revision-confirm"); await press(page,"save-revision"); await waitForHold(hold.arrived);
    await timedOut(page); await retryReady(page,"save-revision"); await focused(page,"save-revision");
    check("human terms timeout keeps the exact review frozen after one actual save",f.count("terms_versions") === 1 && f.count("quotes") === 1
      && await page.locator("#state-use_purpose").isDisabled() && routing.matching(path,"POST").length === 1);
    hold.release(); await routing.settle(); await press(page,"save-revision");
    await page.waitForFunction(() => !document.getElementById("reload").disabled);
    check("retry reuses identical human terms without duplicate terms or quote rows",sameCommands(routing,path) && f.count("terms_versions") === 1 && f.count("quotes") === 1);
    if (await page.locator("#fields").evaluate(node => node.children.length === 0)) {await press(page,"reload");await loadedClarification(page,true);}
    check("the recorded human review remains recoverable",await page.locator("#fields").evaluate(node => node.children.length > 0));
  });

  await scenario("creator_decision_committed_reply_deadline",async ({f,context,routing}) => {
    await nativeTerms(f); const page = await openOffer(context,f,true,{clock:true}), path = `/api/consent/creator/cases/${f.caseId}/decision`, hold = routing.holdNext(path);
    await tick(page,"confirm"); await press(page,"submit"); await waitForHold(hold.arrived);
    await timedOut(page); await retryReady(page,"submit"); await focused(page,"submit");
    check("approval timeout leaves one actual decision without another command",f.count("creator_decisions") === 1 && routing.matching(path,"POST").length === 1
      && await page.locator("#confirm").isDisabled());
    hold.release(); await routing.settle(); await press(page,"submit"); await creatorReady(page);
    check("exact decision retry does not duplicate creator authority",sameCommands(routing,path) && f.count("creator_decisions") === 1);
  });

  await scenario("buyer_acceptance_committed_reply_deadline",async ({f,context,routing}) => {
    await nativeTerms(f); await f.approve(); const page = await openOffer(context,f,false,{clock:true}), path = "/api/consent/buyer/accept", hold = routing.holdNext(path);
    await tick(page,"acknowledge"); await press(page,"accept"); await waitForHold(hold.arrived);
    await timedOut(page); await retryReady(page,"accept"); await focused(page,"accept");
    check("acceptance timeout leaves one recorded acceptance and a frozen checkbox",f.count("buyer_acceptances") === 1 && routing.matching(path,"POST").length === 1
      && await page.locator("#acknowledge").isDisabled());
    hold.release(); await routing.settle(); await press(page,"accept"); await buyerReady(page);
    check("exact acceptance retry cannot duplicate acceptance or grant permission",sameCommands(routing,path) && f.count("buyer_acceptances") === 1
      && f.count("permissions") === 0);
    await privateBoundary(page,f,context);
  });

  await scenario("creator_invoice_create_and_send_committed_deadlines",async ({f,context,routing}) => {
    await nativeTerms(f); await f.approve(); await f.accept(); const page = await openOffer(context,f,true,{clock:true}), base = `/api/invoices/creator/cases/${f.caseId}`;
    for (const kind of ["create","send"]) {
      const path = base+"/"+kind, button = kind+"-invoice", hold = routing.holdNext(path);
      await tick(page,kind+"-confirm"); await press(page,button); await waitForHold(hold.arrived);
      await timedOut(page); await retryReady(page,button); await focused(page,button);
      check(`${kind} timeout does not initiate another provider write`,f.providerCount(kind) === 1 && routing.matching(path,"POST").length === 1);
      hold.release(); await routing.settle(); await press(page,button);
      await page.waitForFunction(() => !document.getElementById("reload").disabled);
      check(`${kind} retry sends the identical command without another provider write`,sameCommands(routing,path) && f.providerCount(kind) === 1);
      if (await page.locator("#offer").evaluate(node => node.children.length === 0)) await press(page,"reload");
      await creatorReady(page);
    }
    check("recovered invoice commands preserve one binding and one create and send operation",f.count("invoice_bindings") === 1 && f.providerCount("create") === 1 && f.providerCount("send") === 1);
  },{provider:true});

  await scenario("creator_recovery_committed_reply_deadline",async ({f,context,routing}) => {
    await uncertainDelivery(f); const page = await openOffer(context,f,true,{clock:true}), path = `/api/invoices/creator/cases/${f.caseId}/recover`, hold = routing.holdNext(path);
    await tick(page,"recovery-confirm"); await press(page,"recovery-command"); await waitForHold(hold.arrived);
    await timedOut(page); await retryReady(page,"recovery-command"); await focused(page,"recovery-command");
    const calls = f.providerCalls.length;
    check("recovery timeout keeps its confirmed command frozen without another send",await page.locator("#recovery-confirm").isDisabled()
      && routing.matching(path,"POST").length === 1 && f.providerCount("create") === 1 && f.providerCount("send") === 1);
    hold.release(); await routing.settle(); await press(page,"recovery-command"); await focused(page,"reload");
    check("stale recovery retry preserves bytes and causes no provider work",sameCommands(routing,path) && f.providerCalls.length === calls);
    await press(page,"reload"); await creatorReady(page);
    check("manual reload recovers the saved delivery state without another provider request",f.providerCalls.length === calls && await page.locator("#recovery-form").isHidden());
  },{provider:true});

  await scenario("payment_handoff_reply_deadline",async ({f,context,routing}) => {
    await nativeTerms(f); await f.approve(); await f.accept(); await f.sendAccepted();
    const page = await openOffer(context,f,false,{clock:true}), path = "/api/invoices/buyer/handoff", hold = routing.holdNext(path), before = f.providerCount("get");
    await press(page,"refresh-payment"); await waitForHold(hold.arrived); await timedOut(page,"#payment-status");
    await retryReady(page,"refresh-payment"); await focused(page,"refresh-payment");
    check("payment timeout offers deliberate recovery without revealing a URL",await page.locator("#payment-handoff").isHidden()
      && f.providerCount("get") === before+1 && routing.matching(path,"POST").length === 1);
    hold.release(); await routing.settle();
    check("a late payment reply cannot reveal a handoff link",await page.locator("#payment-handoff").isHidden());
    await press(page,"refresh-payment"); await page.locator("#payment-handoff").waitFor();
    check("explicit handoff retry repeats identical input and only performs a fresh provider read",sameCommands(routing,path)
      && f.providerCount("get") === before+2 && f.providerCount("create") === 1 && f.providerCount("send") === 1);
    await privateBoundary(page,f,context);
  },{provider:true});

  await scenario("acknowledged_request_save_then_reload_deadline",async ({f,context,routing}) => {
    await issueNative(f); const page = await buyerIntake(context,f,{clock:true}); await fillIntake(page);
    const hold = routing.holdNext(BUYER_REVIEW,{method:"GET",phase:"before"});
    await tick(page,"consent-confirm"); await press(page,"submit-request"); await waitForHold(hold.arrived); await timedOut(page);
    await page.locator("#access-form").waitFor(); await focused(page,"access-code");
    check("follow-up read timeout preserves the acknowledged successful save",(await page.locator("#status").innerText()).includes("Your request was recorded by the server.")
      && f.count("request_submissions") === 1 && routing.matching(BUYER_SUBMIT,"POST").length === 1);
    hold.release(false); await routing.settle(); await enterCode(page,f); await state(page,"submitted");
    check("manual read recovery never resubmits the saved request",f.count("request_submissions") === 1 && routing.matching(BUYER_SUBMIT,"POST").length === 1);
  });

  await scenario("acknowledged_creator_review_then_reload_deadline",async ({f,context,routing}) => {
    await nativeIntake(f); const page = await openClarification(context,f,true,{clock:true}); await fillTerms(page);
    const hold = routing.holdNext(`/api/clarification/creator/cases/${f.caseId}/review`,{method:"GET",phase:"before"});
    await tick(page,"revision-confirm"); await press(page,"save-revision"); await waitForHold(hold.arrived); await timedOut(page); await focused(page,"reload");
    check("creator reload timeout preserves the recorded human terms and quote acknowledgment",(await page.locator("#status").innerText()).includes("Human terms and the deterministic quote are recorded.")
      && f.count("terms_versions") === 1 && f.count("quotes") === 1);
    hold.release(false); await routing.settle(); await press(page,"reload"); await loadedClarification(page,true);
    check("read recovery adds no human review or quote",posts(f,`/api/clarification/creator/cases/${f.caseId}/terms`).length === 1 && f.count("terms_versions") === 1 && f.count("quotes") === 1);
  });

  await scenario("actual_json_body_deadline_and_newer_view",async ({f,context,routing}) => {
    await issueNative(f); await bodyGate(context,BUYER_REVIEW); const page = await newClockPage(context,`${BUYER_PAGE}#${f.token}`);
    await page.waitForFunction(() => window.__deadlineBodyGate.arrived); await timedOut(page); await page.locator("#access-form").waitFor();
    check("the request deadline includes JSON consumption after actual headers arrive",await page.evaluate(() => window.__deadlineBodyGate.headersDelivered)
      && routing.matching(BUYER_REVIEW).length === 1 && f.count("request_submissions") === 0);
    const view = await (await f.native(BUYER_REVIEW,{buyerToken:f.token})).json();
    const saved = await f.native(BUYER_SUBMIT,{method:"POST",buyerToken:f.token,body:{requestId:crypto.randomUUID(),expectedCaseVersion:view.caseVersion,
      reviewHash:view.reviewHash,...BUYER,consentAcknowledged:true,copyVersion:view.copyVersion}}); assert.equal(saved.status,200);
    await enterCode(page,f); await state(page,"submitted"); const current = await page.locator("#status").innerText();
    await page.evaluate(() => window.__deadlineBodyGate.release()); await page.clock.runFor(1);
    check("the late old JSON body cannot overwrite a newer submitted view",await page.locator("#status").innerText() === current
      && await page.locator("#submitted-panel").isVisible() && await page.locator("#intake-form").isHidden());
    check("a body timeout never retries a request automatically",routing.matching(BUYER_REVIEW).length === 2 && routing.matching(BUYER_SUBMIT,"POST").length === 0);
    await privateBoundary(page,f,context);
  });

  await scenario("hidden_view_cancels_pending_body_before_deadline",async ({f,context,routing}) => {
    await issueNative(f); await bodyGate(context,BUYER_REVIEW); const page = await newClockPage(context,`${BUYER_PAGE}#${f.token}`);
    await page.waitForFunction(() => window.__deadlineBodyGate.arrived);
    await page.evaluate(() => {Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));});
    await state(page,"cleared"); const cleared = await page.locator("#status").innerText();
    await page.clock.runFor(15001); await page.evaluate(() => window.__deadlineBodyGate.release()); await page.clock.runFor(1);
    check("private cancellation wins over both a later request timer and late body",await page.locator("#status").innerText() === cleared
      && await page.locator("#access-form").isVisible() && await page.locator("#intake-form").isHidden());
    check("hidden cancellation does not retry or retain private browser storage",routing.matching(BUYER_REVIEW).length === 1 && await storageEmpty(page));
    await privateBoundary(page,f,context);
  });

  await scenario("private_expiry_cancels_pending_write_before_request_deadline",async ({f,context,routing}) => {
    await issueNative(f); const page = await buyerIntake(context,f,{clock:true}); await fillIntake(page); await page.clock.runFor(290000);
    const hold = routing.holdNext(BUYER_SUBMIT); await tick(page,"consent-confirm"); await press(page,"submit-request"); await waitForHold(hold.arrived);
    await page.clock.runFor(10001); await state(page,"cleared"); await focused(page,"access-code"); const cleared = await page.locator("#status").innerText();
    await page.clock.runFor(5001); hold.release(); await routing.settle();
    check("private expiry clears pending request data before its 15-second deadline",await page.locator("#buyer-name").inputValue() === ""
      && await page.locator("#buyer-email").inputValue() === "" && await page.locator("#intended-use").inputValue() === "");
    check("expired private state is not replaced by timeout recovery or a late committed reply",await page.locator("#status").innerText() === cleared
      && await page.locator("#submitted-panel").isHidden() && f.count("request_submissions") === 1 && routing.matching(BUYER_SUBMIT,"POST").length === 1);
    await privateBoundary(page,f,context);
  });
  report.completed = true;
} finally {
  await browser.close(); report.passed = checks.length;
  writeFileSync(join(directory,"request-deadline-browser-results.json"),JSON.stringify(report,null,2)+"\n");
}
console.log(JSON.stringify({passed:report.passed,scenarios:scenarios.length,artifacts:directory}));
