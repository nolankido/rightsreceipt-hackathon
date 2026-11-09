/**
 * Browser integration with actual Worker transaction composition and all eight
 * production SQLite migrations. Playwright intercepts the fixture HTTPS origin
 * and forwards native browser requests to real Request/Response handlers.
 *
 * This is intercepted browser transport, not a listening HTTP server, deployed
 * Worker, actual Access gateway, Cloudflare D1, or genuine PayPal transaction.
 * Generated RSA assertions and provider HTTP replies are synthetic. Consent,
 * invoice commands, persistence, security headers, HTML and browser JS are real.
 *
 * node --no-warnings --experimental-strip-types \
 *   --experimental-loader ./scripts/consent-ts-test-loader.mjs \
 *   scripts/transaction-browser-check.mjs
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { transactionBrowserFixture, ORIGIN, CREATOR_PATH, INVOICE_PATH, CONSENT_PATH,
  BUYER_ACCEPT_PATH, BUYER_STATUS_PATH, BUYER_HANDOFF_PATH, FIXTURE_INVOICE } from "./support/transaction-browser-fixture.mjs";
import { ids, NOW } from "./support/human-consent-fixture.mjs";

const moduleName = process.env.RR_PLAYWRIGHT_MODULE;
const playwright = await import(moduleName ? pathToFileURL(createRequire(import.meta.url).resolve(moduleName)).href : "playwright");
const { chromium } = playwright.default ?? playwright;
const directory = resolve(process.env.RR_TRANSACTION_ARTIFACTS || join(tmpdir(), "rightsreceipt-transaction-browser"));
mkdirSync(directory, { recursive: true });
const checks = [], scenarios = [];
const report = { mode: "intercepted HTTPS browser requests to actual native Worker transaction handlers",
  limitations: ["No listening server or deployed Worker", "Generated fixture Access assertion and injected public signing keys",
    "The fixture starts with a synthetic buyer request, human-prepared terms and a deterministic quote; initial intake, extraction and term editing are not browser-tested",
    "Injected Sandbox provider HTTP only", "SQLite D1-shaped adapter, not deployed Cloudflare D1",
    "Financial paths run production reconciliation and receipt issuance against synthetic provider transaction details",
    "The deliberate Sandbox navigation is intercepted into an inert test document; no PayPal server is contacted",
    "Expiry tests advance browser time; hidden/history lifecycle events are injected"],
  runtime: process.version, passed: 0, checks, scenarios };
let scenarioName = "setup";
function check(label, condition = true) {
  assert.ok(condition, `${scenarioName}: ${label}`);
  checks.push({ scenario: scenarioName, check: label });
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function waitForHold(promise) {
  let timeout;
  try {
    return await Promise.race([promise, new Promise((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("The expected native response did not arrive.")), 15000);
    })]);
  } finally { clearTimeout(timeout); }
}

async function browserBridge(context, fixture) {
  const drops = new Map(), holds = new Map(), outstanding = new Set();
  const errors = [], unexpectedOrigins = [], pageErrors = [], sandboxNavigations = [];
  let navigationSink = null;
  context.on("page", page => page.on("pageerror", error => pageErrors.push(error.message)));
  await context.route("**/*", route => {
    const task = (async () => {
      const incoming = route.request(), url = new URL(incoming.url());
      if (url.origin !== ORIGIN) {
        if (navigationSink === url.origin + url.pathname && incoming.isNavigationRequest() && incoming.method() === "GET" && !url.search) {
          navigationSink = null;
          const h = await incoming.allHeaders();
          sandboxNavigations.push({ origin: url.origin, path: url.pathname, authorizationPresent: "authorization" in h,
            cookiePresent: "cookie" in h, referrerPresent: "referer" in h });
          await route.fulfill({ status: 200, contentType: "text/html", headers: { "Content-Security-Policy": "default-src 'none'" },
            body: "<!doctype html><title>Intercepted Sandbox handoff</title><p>Navigation intercepted by the test. No PayPal server was contacted.</p>" });
          return;
        }
        unexpectedOrigins.push(url.origin);
        await route.abort("blockedbyclient"); return;
      }
      const key = `${incoming.method()} ${url.pathname}`;
      const headers = await incoming.allHeaders();
      const body = incoming.postDataBuffer();
      const request = new Request(incoming.url(), { method: incoming.method(), headers,
        ...(body && !["GET", "HEAD"].includes(incoming.method()) ? { body } : {}) });
      const response = await fixture.dispatch(request, { browser: true });
      const held = holds.get(key);
      if (held) {
        holds.delete(key); held.arrived.resolve();
        await held.release.promise;
      }
      const remaining = drops.get(key) ?? 0;
      if (remaining > 0) {
        drops.set(key, remaining - 1);
        await route.abort("failed").catch(() => {}); return;
      }
      try {
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()) });
      } catch (error) {
        // Holding a response across expiry intentionally lets AbortController
        // cancel its browser request before the late response is released.
        if (!held) throw error;
      }
    })();
    outstanding.add(task);
    task.catch(error => errors.push(error.message)).finally(() => outstanding.delete(task));
    return task;
  });
  return { errors, unexpectedOrigins, pageErrors, sandboxNavigations,
    allowSandboxNavigationOnce(value) {
      const target = new URL(value);
      assert.equal(target.origin, "https://www.sandbox.paypal.com");
      navigationSink = target.origin + target.pathname;
    },
    dropNext(path) { drops.set(`POST ${path}`, 1); },
    holdNext(path, method = "POST") {
      const entry = { arrived: deferred(), release: deferred() };
      holds.set(`${method} ${path}`, entry);
      return { arrived: entry.arrived.promise, release: entry.release.resolve };
    },
    async settle() { await Promise.allSettled([...outstanding]); },
  };
}

async function loaded(page, target = "offer") {
  await page.waitForFunction(id => (document.getElementById(id)?.children.length ?? 0) > 0, target);
}
async function creatorReady(page) {
  await loaded(page);
  await page.waitForFunction(() => !document.getElementById("invoice-panel").hidden
    && !document.getElementById("reload").disabled);
}
async function buyerStatusReady(page) {
  await loaded(page);
  await page.waitForFunction(() => !document.getElementById("buyer-status-panel").hidden
    && !document.getElementById("reload").disabled);
}
async function paymentCheck(page) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === BUYER_HANDOFF_PATH
    && response.request().method() === "POST");
  await page.locator("#refresh-payment").click();
  const response = await pending;
  await page.waitForFunction(() => !document.getElementById("payment-status").textContent.startsWith("Checking the current Sandbox invoice"));
  return response;
}
async function browserStorageEmpty(page) {
  return page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0);
}
const rightsLabels = ["Use purpose", "Channels", "Paid advertising", "Territory", "Start date", "Duration (days)",
  "Maximum impressions", "Exclusivity", "Modifications", "Attribution", "Sublicensing", "AI use"];
async function assertRights(page) {
  const labels = await page.locator("#offer dt").allTextContents();
  check("all twelve canonical licensing fields are rendered", rightsLabels.every(label => labels.includes(label)));
  check("the canonical $425 price is rendered", (await page.locator("#offer").innerText()).includes("$425.00"));
  check("exclusive UTC licensing boundary is rendered", (await page.locator("#offer").innerText()).includes("2027-01-30"));
}
function noPaymentAuthority(fixture) {
  for (const table of ["payment_evidence", "permissions", "receipt_revisions", "paypal_lifecycle_observations"]) {
    assert.equal(fixture.count(table), 0, `${table} must remain empty`);
  }
}
function posted(fixture, path) {
  return fixture.requests.filter(row => row.browser && row.method === "POST" && row.path === path);
}
async function approveInBrowser(page, fixture) {
  await page.goto(ORIGIN + CREATOR_PATH, { waitUntil: "domcontentloaded" });
  await creatorReady(page);
  check("creator decision requires an unchecked confirmation", !await page.locator("#confirm").isChecked()
    && await page.locator("#submit").isDisabled());
  await page.locator("#confirm").check();
  await page.locator("#submit").click();
  await page.waitForFunction(() => document.getElementById("offer").textContent.includes("Awaiting buyer acceptance"));
  await creatorReady(page);
  check("creator browser command durably records approval", fixture.count("creator_decisions") === 1);
}
async function acceptedBuyer(page) {
  await page.waitForFunction(() => document.getElementById("offer").textContent.includes("Acceptance recorded"));
  assert.ok(await page.locator("#acceptance-form").isHidden());
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.RR_CHROMIUM ? { executablePath: process.env.RR_CHROMIUM } : {}), args: ["--no-sandbox"] });
report.browser = browser.version();
async function scenario(name, run, { financial = false } = {}) {
  scenarioName = name;
  const fixture = transactionBrowserFixture();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
  context.setDefaultTimeout(10000);
  await context.addCookies([{ name: "fixture_gateway_cookie", value: "not-an-access-assertion", domain: "rightsreceipt.example",
    path: "/", httpOnly: true, secure: true, sameSite: "Strict" }]);
  const bridge = await browserBridge(context, fixture);
  try {
    assert.equal(fixture.migrationHashes.length, 9);
    await run({ fixture, context, bridge });
    await bridge.settle();
    assert.deepEqual(bridge.errors, []);
    assert.deepEqual(bridge.pageErrors, []);
    assert.deepEqual(bridge.unexpectedOrigins, []);
    if (!financial) noPaymentAuthority(fixture);
    check("native routing and browser scripts complete without errors or unhandled external requests");
    scenarios.push({ name, financialLifecycleExecuted: financial, browserRequests: fixture.requests.filter(row => row.browser).length,
      interceptedSandboxNavigations: bridge.sandboxNavigations,
      generatedSignatureVerifications: "actual WebCrypto verifier", jwksReads: fixture.keyRequests.length,
      migrations: fixture.migrationHashes,
      providerCalls: Object.fromEntries(["oauth", "create", "send", "get"].map(stage => [stage, fixture.providerCount(stage)])),
      durableRows: Object.fromEntries(["creator_decisions", "buyer_acceptances", "invoice_bindings", "payment_operations",
        "payment_evidence", "permissions", "receipt_revisions"].map(table => [table, fixture.count(table)])) });
    console.log(JSON.stringify({ scenario: name, passed: checks.filter(row => row.scenario === name).length }));
  } finally {
    await context.close();
    await bridge.settle();
    fixture.close();
  }
}

try {
  await scenario("canonical_browser_judge_path", async ({ fixture: f, context }) => {
    let page = await context.newPage();
    await page.goto(ORIGIN + CREATOR_PATH, { waitUntil: "domcontentloaded" });
    await creatorReady(page); await assertRights(page);
    check("loading the creator offer issues no consent or invoice command", posted(f, `${CONSENT_PATH}/decision`).length === 0
      && f.count("payment_operations") === 0 && f.providerCalls.length === 0);
    check("browser uses a real secure context without a UUID shim", await page.evaluate(() => isSecureContext && typeof crypto.randomUUID === "function"));
    await approveInBrowser(page, f);
    const creatorCommand = JSON.parse(posted(f, `${CONSENT_PATH}/decision`)[0].body);
    check("creator command contains reviewed identifiers and no browser-authored price or authority", creatorCommand.confirmed === true
      && creatorCommand.reviewHash.length === 64 && !["amountCents", "workspaceId", "paid", "permission"].some(key => key in creatorCommand));
    await page.close();

    page = await context.newPage();
    await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" });
    await loaded(page); await assertRights(page);
    check("buyer capability fragment is erased before review", page.url() === `${ORIGIN}/buyer/review`);
    check("buyer token is absent from DOM and browser storage", !(await page.content()).includes(f.token)
      && await page.locator("#access-code").inputValue() === "" && await browserStorageEmpty(page));
    const buyerReads = f.requests.filter(row => row.browser && row.path === "/api/consent/buyer/review");
    check("buyer review uses bearer authority without the gateway cookie", buyerReads.length === 1
      && buyerReads[0].buyerAuthorizationPresent && !buyerReads[0].cookiePresent && !buyerReads[0].browserAssertionPresent);
    check("buyer acceptance starts unchecked and disabled", !await page.locator("#acknowledge").isChecked()
      && await page.locator("#accept").isDisabled());
    await page.screenshot({ path: join(directory, "buyer-review-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check("buyer mobile page has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(directory, "buyer-review-mobile.png"), fullPage: true });
    const beforeAcceptance = f.case();
    await page.locator("#acknowledge").check(); await page.locator("#accept").click(); await acceptedBuyer(page);
    const accepted = JSON.parse(posted(f, BUYER_ACCEPT_PATH)[0].body);
    check("buyer browser records the exact creator-approved version", f.count("buyer_acceptances") === 1
      && accepted.expectedCaseVersion === beforeAcceptance.row_version
      && accepted.creatorDecisionId === beforeAcceptance.latest_creator_decision_id && accepted.acknowledged === true);
    check("acceptance performs no provider operation and grants no payment authority", f.providerCalls.length === 0);
    await page.close();

    page = await context.newPage();
    await page.goto(ORIGIN + CREATOR_PATH, { waitUntil: "domcontentloaded" }); await creatorReady(page);
    await page.locator("#create-form").waitFor({ state: "visible" });
    check("accepted offer enables a separate unchecked draft confirmation", !await page.locator("#create-confirm").isChecked()
      && await page.locator("#create-invoice").isDisabled() && await page.locator("#send-form").isHidden());
    await page.locator("#create-confirm").check(); await page.locator("#create-invoice").click();
    await page.locator("#send-form").waitFor({ state: "visible" }); await creatorReady(page);
    check("actual canonical command creates one draft and does not send it", f.providerCount("create") === 1
      && f.providerCount("send") === 0 && f.binding().invoice_status === "draft" && f.binding().provider_invoice_id === FIXTURE_INVOICE);
    const providerDraft = JSON.parse(f.providerCalls.find(row => row.stage === "create").body);
    check("provider draft is derived from the actual accepted $425 quote", providerDraft.items[0].unit_amount.value === "425.00"
      && providerDraft.items[0].description.includes('"ai_use":"prohibited"'));
    check("sending requires another unchecked confirmation", !await page.locator("#send-confirm").isChecked()
      && await page.locator("#send-invoice").isDisabled() && await page.locator("#create-form").isHidden());
    await page.screenshot({ path: join(directory, "creator-invoice-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check("creator invoice mobile page has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(directory, "creator-invoice-mobile.png"), fullPage: true });
    const callsBeforeReload = f.providerCalls.length;
    await page.locator("#reload").click(); await page.locator("#send-form").waitFor({ state: "visible" }); await creatorReady(page);
    check("draft-state GET reload performs no provider call", f.providerCalls.length === callsBeforeReload);
    await page.locator("#send-confirm").check(); await page.locator("#send-invoice").click();
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("Sandbox delivery is recorded"));
    check("separate send command uses one dispatch and durable completion", f.providerCount("create") === 1 && f.providerCount("send") === 1
      && f.providerCount("get") === 2 && f.binding().invoice_status === "sent" && f.sendOperation().status === "succeeded");
    check("delivery enqueues one reconciliation generation without payment or license rows", f.outbox().requested_generation === 1
      && f.outbox().completed_generation === 0 && f.count("invoice_bindings") === 1 && f.count("payment_operations") === 2);
    const callsAfterSend = f.providerCalls.length;
    await page.locator("#reload").click(); await creatorReady(page);
    check("completed-state reload offers no repeat operation or stale payment link", f.providerCalls.length === callsAfterSend
      && await page.locator("#create-form").isHidden() && await page.locator("#send-form").isHidden()
      && await page.locator('a[href^="https://www.sandbox.paypal.com/"]').count() === 0);
    const browserPosts = f.requests.filter(row => row.browser && row.method === "POST");
    report.observedWriteContext = browserPosts.map(row => ({ path: row.path, origin: row.origin, fetchSite: row.fetchSite }));
    if (browserPosts.some(row => row.fetchSite === null)) report.limitations.push(
      "Chromium interception does not expose Fetch Metadata headers in this runtime; actual Origin is checked, and metadata denial is covered by native HTTP tests.");
    check("real browser POSTs carry the exact application Origin", browserPosts.length === 4
      && browserPosts.every(row => row.origin === ORIGIN));
    check("native private responses preserve no-store and no-referrer headers", f.requests.filter(row => row.browser && row.status === 200)
      .every(row => row.responseHeaders.cacheControl?.includes("no-store") && row.responseHeaders.referrerPolicy === "no-referrer"));
    check("creator assertion stays at the injected gateway boundary", f.requests.filter(row => row.browser).every(row => !row.browserAssertionPresent));
    check("transaction leaves no browser storage", await browserStorageEmpty(page));
  });

  await scenario("uncertain_response_recovery", async ({ fixture: f, context, bridge }) => {
    await f.approve();
    let page = await context.newPage();
    await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await loaded(page);
    bridge.dropNext(BUYER_ACCEPT_PATH);
    await page.locator("#acknowledge").check(); await page.locator("#accept").click();
    await page.waitForFunction(() => document.getElementById("accept").textContent.includes("Retry the same"));
    check("lost buyer response does not automatically resubmit", posted(f, BUYER_ACCEPT_PATH).length === 1 && f.count("buyer_acceptances") === 1);
    await page.locator("#accept").click(); await acceptedBuyer(page);
    const acceptanceRequests = posted(f, BUYER_ACCEPT_PATH);
    check("explicit buyer retry preserves identical command and one durable acceptance", acceptanceRequests.length === 2
      && acceptanceRequests[0].body === acceptanceRequests[1].body && f.count("buyer_acceptances") === 1);
    await page.close();
    page = await context.newPage(); await page.goto(ORIGIN + CREATOR_PATH, { waitUntil: "domcontentloaded" }); await creatorReady(page);
    bridge.dropNext(`${INVOICE_PATH}/create`);
    await page.locator("#create-confirm").check(); await page.locator("#create-invoice").click();
    await page.waitForFunction(() => document.getElementById("create-invoice").textContent.includes("retry this draft"));
    check("lost draft response retains one provider call without automatic retry", posted(f, `${INVOICE_PATH}/create`).length === 1
      && f.providerCount("create") === 1 && f.binding().invoice_status === "draft");
    await page.locator("#create-invoice").click(); await page.locator("#send-form").waitFor({ state: "visible" }); await creatorReady(page);
    const createRequests = posted(f, `${INVOICE_PATH}/create`);
    check("explicit create retry checks the same command and cannot duplicate the draft", createRequests.length === 2
      && createRequests[0].body === createRequests[1].body && f.providerCount("create") === 1 && f.count("invoice_bindings") === 1);
    bridge.dropNext(`${INVOICE_PATH}/send`);
    await page.locator("#send-confirm").check(); await page.locator("#send-invoice").click();
    await page.waitForFunction(() => document.getElementById("send-invoice").textContent.includes("retry this send"));
    check("lost send response does not automatically repeat delivery", posted(f, `${INVOICE_PATH}/send`).length === 1
      && f.providerCount("send") === 1 && f.sendOperation().status === "succeeded");
    await page.locator("#send-invoice").click();
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("Sandbox delivery is recorded"));
    const sendRequests = posted(f, `${INVOICE_PATH}/send`);
    check("explicit send retry preserves command, delivery and reconciliation counts", sendRequests.length === 2
      && sendRequests[0].body === sendRequests[1].body && f.providerCount("send") === 1 && f.outbox().requested_generation === 1);
  });

  await scenario("stale_buyer_offer", async ({ fixture: f, context }) => {
    await f.approve();
    const page = await context.newPage(); await page.clock.install({ time: new Date(NOW) });
    await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
    // A competing canonical terms revision is setup data, not an injected API
    // response. The browser still submits its previously displayed identifiers.
    f.version({ duration: 60 }); await f.approve();
    await page.locator("#acknowledge").check(); await page.locator("#accept").click();
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("offer changed"));
    check("a changed canonical offer rejects stale browser acceptance", posted(f, BUYER_ACCEPT_PATH)[0].status === 409
      && f.count("buyer_acceptances") === 0);
    check("stale acceptance clears the previous rights and action", await page.locator("#offer").innerText() === ""
      && await page.locator("#acceptance-form").isHidden() && f.providerCalls.length === 0);
    check("terminal conflict returns focus to empty code entry and disables retained-access reload", await page.locator("#access-form").isVisible()
      && await page.locator("#access-code").inputValue() === "" && await page.locator("#reload").isDisabled()
      && await page.evaluate(() => document.activeElement?.id === "access-code") && !await page.locator("#acknowledge").isChecked());
    const requests = f.requests.filter(row => row.browser).length;
    f.setTime(new Date(Date.parse(NOW) + 300001).toISOString()); await page.clock.fastForward(300001);
    await page.locator("#reload").dispatchEvent("click");
    await page.locator("#acceptance-form").dispatchEvent("submit"); await page.clock.runFor(1);
    check("stale controls cannot reuse private access after the former view lifetime", f.requests.filter(row => row.browser).length === requests
      && await page.locator("#reload").isDisabled() && await page.locator("#access-form").isVisible());
    await page.locator("#access-code").fill(f.token); await page.locator("#access-code").press("Enter"); await buyerStatusReady(page);
    check("explicit code reentry loads changed rights with fresh unchecked consent", await page.evaluate(() => [...document.querySelectorAll("#offer dt")]
      .find(node => node.textContent === "Duration (days)").nextElementSibling.textContent === "60")
      && !await page.locator("#acknowledge").isChecked() && await page.locator("#accept").isDisabled()
      && posted(f, BUYER_ACCEPT_PATH).length === 1 && f.count("buyer_acceptances") === 0 && f.providerCalls.length === 0);
  });

  await scenario("stale_creator_invoice", async ({ fixture: f, context }) => {
    await f.approve(); await f.accept();
    const page = await context.newPage(); await page.goto(ORIGIN + CREATOR_PATH, { waitUntil: "domcontentloaded" }); await creatorReady(page);
    f.db.prepare("UPDATE licensing_cases SET row_version=row_version+1 WHERE case_id=?").run(ids.case);
    await page.locator("#create-confirm").check(); await page.locator("#create-invoice").click();
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("offer changed"));
    check("stale creator version cannot reserve or create a draft", posted(f, `${INVOICE_PATH}/create`)[0].status === 409
      && f.count("payment_operations") === 0 && f.providerCalls.length === 0);
    check("stale creator response clears private review and invoice controls", await page.locator("#offer").innerText() === ""
      && await page.locator("#invoice-panel").isHidden());
  });

  await scenario("session_and_buyer_capability_isolation", async ({ fixture: f, context }) => {
    await f.approve();
    let page = await context.newPage(); await page.goto(ORIGIN + CREATOR_PATH, { waitUntil: "domcontentloaded" }); await creatorReady(page);
    f.controls.gatewayActor = "none";
    await page.locator("#reload").click();
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("Session unavailable"));
    check("a missing signed creator session clears already loaded private content", await page.locator("#offer").innerText() === ""
      && await page.locator("#invoice-panel").isHidden());
    await page.close();
    f.controls.gatewayActor = "other";
    const denied = await f.native(INVOICE_PATH);
    check("a valid signed creator in another workspace cannot read invoice controls", denied.status === 403);
    f.controls.gatewayActor = "none";
    page = await context.newPage(); await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await loaded(page);
    check("buyer review works independently of a creator session", await page.locator("#acceptance-form").isVisible());
    f.db.prepare("UPDATE buyer_capabilities SET revoked_at=? WHERE buyer_capability_id=?").run(NOW, ids.capability);
    await page.locator("#acknowledge").check(); await page.locator("#accept").click();
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("unavailable or expired"));
    check("a revoked buyer capability cannot record acceptance", posted(f, BUYER_ACCEPT_PATH)[0].status === 403
      && f.count("buyer_acceptances") === 0);
    check("denied buyer access clears token, rights and storage", await page.locator("#offer").innerText() === ""
      && await page.locator("#access-code").inputValue() === "" && await page.locator("#access-form").isVisible()
      && await browserStorageEmpty(page));
  });

  await scenario("late_buyer_response_after_expiry", async ({ fixture: f, context, bridge }) => {
    await f.approve();
    const page = await context.newPage(); await page.clock.install({ time: new Date(NOW) });
    await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await loaded(page);
    const hold = bridge.holdNext(BUYER_ACCEPT_PATH);
    try {
      await page.locator("#acknowledge").check(); await page.locator("#accept").click(); await waitForHold(hold.arrived);
      f.setTime(new Date(Date.parse(NOW) + 300001).toISOString()); await page.clock.fastForward(300001);
      check("review deadline clears buyer content while an actual write response is pending", await page.locator("#offer").innerText() === ""
        && await page.locator("#acceptance-form").isHidden());
    } finally { hold.release(); }
    await bridge.settle();
    check("late committed acceptance cannot reopen the expired review", f.count("buyer_acceptances") === 1
      && await page.locator("#offer").innerText() === "" && await page.locator("#access-form").isVisible());
  });

  await scenario("late_creator_response_after_expiry", async ({ fixture: f, context, bridge }) => {
    await f.approve(); await f.accept();
    const page = await context.newPage(); await page.clock.install({ time: new Date(NOW) });
    await page.goto(ORIGIN + CREATOR_PATH, { waitUntil: "domcontentloaded" }); await creatorReady(page);
    const hold = bridge.holdNext(`${INVOICE_PATH}/create`);
    try {
      await page.locator("#create-confirm").check(); await page.locator("#create-invoice").click(); await waitForHold(hold.arrived);
      f.setTime(new Date(Date.parse(NOW) + 300001).toISOString()); await page.clock.fastForward(300001);
      check("review deadline clears creator content during a pending draft response", await page.locator("#offer").innerText() === ""
        && await page.locator("#invoice-panel").isHidden());
    } finally { hold.release(); }
    await bridge.settle();
    check("late draft completion cannot restore expired controls or send automatically", f.providerCount("create") === 1
      && f.providerCount("send") === 0 && await page.locator("#offer").innerText() === "" && await page.locator("#invoice-panel").isHidden());
  });

  await scenario("private_lifecycle_clearing", async ({ fixture: f, context }) => {
    await f.approve();
    let page = await context.newPage(); await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await loaded(page);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    check("injected hidden-page lifecycle clears buyer rights and capability action", await page.locator("#offer").innerText() === ""
      && await page.locator("#access-form").isVisible() && await page.locator("#reload").isDisabled());
    await page.close();
    page = await context.newPage(); await page.goto(ORIGIN + CREATOR_PATH, { waitUntil: "domcontentloaded" }); await creatorReady(page);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    check("injected history restore clears creator private offer", await page.locator("#offer").innerText() === ""
      && await page.locator("#invoice-panel").isHidden() && await browserStorageEmpty(page));
    check("lifecycle clearing never creates an approval, acceptance or invoice command", f.count("buyer_acceptances") === 0
      && f.providerCalls.length === 0 && f.requests.every(row => !row.browser || row.method === "GET"));
  });

  await scenario("explicit_buyer_payment_handoff", async ({ fixture: f, context, bridge }) => {
    await f.approve(); await f.accept(); await f.sendAccepted();
    const writes = f.totalChanges(), calls = f.providerCalls.length;
    const page = await context.newPage(); await page.clock.install({ time: new Date(NOW) });
    await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
    check("saved buyer payment status performs no provider call or database write", f.totalChanges() === writes && f.providerCalls.length === calls);
    check("sent invoice offers an explicit check without an initial payment link", await page.locator("#refresh-payment").isEnabled()
      && await page.locator("#payment-handoff").isHidden() && await page.locator("#payment-handoff").getAttribute("href") === null);
    const version = f.case().row_version, response = await paymentCheck(page), result = await response.json();
    await page.locator("#payment-handoff").waitFor({ state: "visible" });
    const command = JSON.parse(posted(f, BUYER_HANDOFF_PATH)[0].body);
    check("buyer handoff command binds the exact saved case and invoice", JSON.stringify(Object.keys(command).sort()) === JSON.stringify(["confirmed", "expectedCaseVersion", "invoiceId"])
      && command.expectedCaseVersion === version && command.invoiceId === FIXTURE_INVOICE && command.confirmed === true);
    check("fresh handoff reads the bound provider invoice and never sends or pays", response.status() === 200 && f.providerCount("create") === 1
      && f.providerCount("send") === 1 && f.providerCount("get") === 3 && f.totalChanges() === writes
      && result.paymentConfirmed === false && result.permissionGranted === false);
    check("handoff remains on the buyer page until a separate navigation", page.url() === `${ORIGIN}/buyer/review`
      && result.expiresInMs > 0 && result.expiresInMs <= 30000);
    check("payment link uses the exact allowlisted Sandbox destination and safe navigation attributes",
      await page.locator("#payment-handoff").getAttribute("href") === f.controls.paymentUrl
      && (await page.locator("#payment-handoff").getAttribute("rel")).includes("noreferrer")
      && (await page.locator("#payment-handoff").getAttribute("rel")).includes("noopener"));
    await page.screenshot({ path: join(directory, "buyer-payment-handoff.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check("mobile payment controls and the current Sandbox link fit the viewport", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      && await page.locator("#payment-handoff").isVisible());
    await page.screenshot({ path: join(directory, "buyer-payment-handoff-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.clock.fastForward(30001);
    check("payment link expires within thirty seconds without an automatic provider refresh", await page.locator("#payment-handoff").isHidden()
      && await page.locator("#payment-handoff").getAttribute("href") === null && f.providerCount("get") === 3);
    await paymentCheck(page); await page.locator("#payment-handoff").waitFor({ state: "visible" });
    const beforeNavigation = f.providerCalls.length;
    bridge.allowSandboxNavigationOnce(f.controls.paymentUrl);
    const popupPending = context.waitForEvent("page");
    await page.locator("#payment-handoff").click();
    const popup = await popupPending; await popup.waitForLoadState("domcontentloaded");
    check("explicit provider navigation is safely intercepted without a network payment", popup.url() === f.controls.paymentUrl
      && bridge.sandboxNavigations.length === 1 && f.providerCalls.length === beforeNavigation);
    check("provider navigation leaks no buyer bearer, cookie or referrer", bridge.sandboxNavigations.every(row =>
      !row.authorizationPresent && !row.cookiePresent && !row.referrerPresent));
    check("buyer capability appears in neither native request URLs nor browser storage", f.requests.filter(row => row.browser).every(row =>
      !row.requestUrl.includes(f.token) && !new URL(row.requestUrl).hash) && await browserStorageEmpty(page));
    await popup.close();
  });

  await scenario("provider_paid_is_not_canonical_authority", async ({ fixture: f, context }) => {
    await f.approve(); await f.accept(); await f.sendAccepted();
    const page = await context.newPage(); await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
    const writes = f.totalChanges();
    f.controls.providerStatus = "PAID"; f.controls.omitFinancialDetail = true;
    let response = await paymentCheck(page), result = await response.json();
    check("a provider PAID label without financial details cannot supply a payment link", response.status() === 200
      && result.paymentUrl === null && await page.locator("#payment-handoff").isHidden());
    check("provider status alone does not write evidence or assert permission", result.paymentConfirmed === false && result.permissionGranted === false
      && f.totalChanges() === writes && f.count("payment_evidence") === 0 && f.count("permissions") === 0
      && (await page.locator("#permission-status").innerText()).includes("Payment is not confirmed"));
    f.controls.omitFinancialDetail = false;
    response = await paymentCheck(page); result = await response.json();
    check("even valid paid provider detail stays non-authoritative on the read-only handoff", result.paymentUrl === null
      && result.paymentConfirmed === false && result.permissionGranted === false && f.totalChanges() === writes
      && f.count("receipt_revisions") === 0 && f.binding().invoice_status === "sent");
    check("buyer wording separates provider observation from verified permission", (await page.locator("#payment-status").innerText())
      .includes("current verified receipt is still required"));
  });

  await scenario("canonical_payment_and_receipt_continuity", async ({ fixture: f, context }) => {
    await f.approve(); await f.accept(); await f.sendAccepted();
    f.controls.providerStatus = "PAID";
    const reconciliation = await f.reconcile(), issuance = await f.issueReceipt();
    check("production financial reconciliation creates the paid evidence and scheduled permission", reconciliation.consumer === "financial_lifecycle"
      && reconciliation.outcomes.applied === 1 && f.count("payment_evidence") === 1 && f.permission().permission_state === "scheduled"
      && f.binding().invoice_status === "paid");
    check("production receipt issuance publishes the first canonical revision", issuance.outcome === "issued"
      && f.count("receipt_revisions") === 1 && f.receipt().payload_hash === issuance.hash);
    const first = f.receipt(), writes = f.totalChanges(), calls = f.providerCalls.length;
    let page = await context.newPage(); await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
    await page.locator("#read-receipt").waitFor({ state: "visible" });
    check("buyer status reads the exact canonical receipt without provider calls or writes", f.totalChanges() === writes && f.providerCalls.length === calls
      && (await page.locator("#status-details").innerText()).includes(first.payload_hash));
    check("verified payment before the start date is scheduled rather than active", (await page.locator("#permission-status").innerText()).startsWith("Scheduled in Sandbox")
      && await page.locator("#refresh-payment").isDisabled() && await page.locator("#payment-handoff").isHidden());
    check("private receipt navigation stores no token-bearing href", await page.locator("#read-receipt").getAttribute("href") === null
      && !(await page.content()).includes(f.token));
    await page.screenshot({ path: join(directory, "buyer-scheduled-receipt-status.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check("mobile canonical status wraps the full receipt hash without horizontal overflow",
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(directory, "buyer-scheduled-receipt-status-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    const publicPath = await page.locator("#verification-link").getAttribute("href");
    check("public verification link is opaque and excludes the private capability", publicPath === `/verify/receipt/${f.publicId()}`
      && !publicPath.includes(f.token) && !publicPath.includes(ids.case));
    const publicPage = await context.newPage(); await publicPage.goto(ORIGIN + publicPath, { waitUntil: "domcontentloaded" });
    check("public receipt view verifies the current hash without private deal details", (await publicPage.locator("body").innerText()).includes(first.payload_hash)
      && !(await publicPage.locator("body").innerText()).includes("Cedar & Tide") && !(await publicPage.locator("body").innerText()).includes("$425.00"));
    await publicPage.close();
    // Opening a separate tab may clear private state; deliberately reopen the
    // original private link before requesting its authorized receipt.
    await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
    await page.locator("#read-receipt").click();
    await page.waitForURL(`${ORIGIN}/receipts/buyer`); await page.locator("#rr-document").waitFor({ state: "visible" });
    check("private receipt navigation reuses the capability then erases its fragment", page.url() === `${ORIGIN}/receipts/buyer`
      && !(await page.content()).includes(f.token) && await browserStorageEmpty(page));
    check("the actual receipt shell displays the current canonical revision", (await page.locator("#rr-document").innerText()).includes(first.payload_hash)
      && (await page.locator("#rr-document").innerText()).includes("$425.00"));
    await page.screenshot({ path: join(directory, "buyer-private-scheduled-receipt.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check("mobile private receipt retains its canonical content without horizontal overflow",
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(directory, "buyer-private-scheduled-receipt-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    const downloading = page.waitForEvent("download"); await page.locator("#rr-export").click();
    const download = await downloading, stream = await download.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks), payload = JSON.parse(bytes.toString());
    check("browser JSON export preserves exact canonical bytes and SHA-256", bytes.toString() === first.canonical_payload_json
      && createHash("sha256").update(bytes).digest("hex") === first.payload_hash && payload.revision_number === 1);
    const unchanged = await f.issueReceipt();
    check("unchanged receipt issuance reuses its original revision and hash", unchanged.outcome === "unchanged"
      && unchanged.hash === first.payload_hash && f.count("receipt_revisions") === 1);
    f.setTime(new Date(Date.parse(NOW) + 60000).toISOString()); f.controls.providerStatus = "REFUNDED";
    const refundReconciliation = await f.reconcile({ requestAnotherGeneration: true }), refundReceipt = await f.issueReceipt();
    const second = f.receipt();
    check("verified full refund advances the canonical receipt chain", refundReconciliation.outcomes.applied === 1
      && refundReceipt.outcome === "issued" && second.revision_number === 2 && second.previous_revision_hash === first.payload_hash
      && second.payload_hash !== first.payload_hash && f.permission().permission_state === "refunded");
    await page.locator("#rr-refresh").click();
    await page.waitForFunction(hash => document.getElementById("rr-document")?.textContent.includes(hash), second.payload_hash);
    check("private receipt refresh follows the latest verified refund revision", (await page.locator("#rr-document").innerText()).includes("Refunded")
      && !(await page.locator("#rr-document").innerText()).includes("Current permission: Active"));
    const publicResponse = await f.native(publicPath);
    check("the same public verification reference follows the new receipt revision", publicResponse.status === 200
      && (await publicResponse.text()).includes(second.payload_hash));
    check("receipt reads and export never expose the bearer in native URLs", f.requests.filter(row => row.browser).every(row =>
      !row.requestUrl.includes(f.token) && !new URL(row.requestUrl).hash));
  }, { financial: true });

  await scenario("canonical_status_scope_and_freshness", async ({ fixture: f, context }) => {
    await f.approve(); await f.accept(); await f.sendAccepted();
    f.controls.providerStatus = "PAID"; await f.reconcile(); await f.issueReceipt();
    f.db.prepare("UPDATE buyer_capabilities SET allowed_actions_json=? WHERE buyer_capability_id=?")
      .run(JSON.stringify(["review"]), ids.capability);
    const page = await context.newPage(); await page.clock.install({ time: new Date(NOW) });
    await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
    check("review-only capability can read the public proof but not private receipt navigation",
      (await page.locator("#permission-status").innerText()).startsWith("Scheduled in Sandbox")
      && await page.locator("#verification-link").isVisible() && await page.locator("#read-receipt").isHidden());
    const denied = await f.native("/api/receipts/buyer?format=json", { buyerToken: f.token });
    check("private receipt authorization independently enforces receipt scope", denied.status === 404
      && (await denied.json()).status === "not_found");
    const calls = f.providerCalls.length, writes = f.totalChanges(), statusReads = f.requests.filter(row => row.browser && row.path === BUYER_STATUS_PATH).length;
    f.setTime(new Date(Date.parse(NOW) + 60001).toISOString()); await page.clock.fastForward(60001);
    check("canonical permission status expires within sixty seconds and clears receipt links",
      (await page.locator("#permission-status").innerText()).includes("No current permission status")
      && await page.locator("#verification-link").getAttribute("href") === null
      && await page.locator("#read-receipt").isHidden() && await page.locator("#payment-handoff").getAttribute("href") === null);
    check("status expiry triggers no automatic provider or canonical operation", f.providerCalls.length === calls && f.totalChanges() === writes
      && f.requests.filter(row => row.browser && row.path === BUYER_STATUS_PATH).length === statusReads);
    await page.locator("#reload").click(); await buyerStatusReady(page);
    check("manual status reload restores a verified proof without broadening capability scope",
      (await page.locator("#permission-status").innerText()).startsWith("Scheduled in Sandbox")
      && await page.locator("#read-receipt").isHidden() && f.providerCalls.length === calls && f.totalChanges() === writes);
  }, { financial: true });

  await scenario("archived_offer_keeps_verified_receipt_readable", async ({ fixture: f, context }) => {
    await f.approve(); await f.accept(); await f.sendAccepted();
    f.controls.providerStatus = "PAID"; await f.reconcile(); await f.issueReceipt();
    const hash = f.receipt().payload_hash;
    f.db.prepare("UPDATE assets SET availability='archived' WHERE asset_id=?").run(ids.asset);
    const page = await context.newPage(); await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.getElementById("buyer-status-panel").hidden
      && document.getElementById("permission-status").textContent.startsWith("Scheduled in Sandbox"));
    check("a legacy offer no longer eligible for consent still exposes its valid receipt", await page.locator("#read-receipt").isVisible()
      && (await page.locator("#status-details").innerText()).includes(hash));
    check("status-only fallback cannot accept new terms or offer payment", await page.locator("#acceptance-form").isHidden()
      && await page.locator("#refresh-payment").isDisabled() && await page.locator("#payment-handoff").isHidden());
    await page.locator("#read-receipt").click(); await page.waitForURL(`${ORIGIN}/receipts/buyer`);
    await page.locator("#rr-document").waitFor({ state: "visible" });
    check("the unchanged issued receipt survives archived asset eligibility", (await page.locator("#rr-document").innerText()).includes(hash)
      && f.count("receipt_revisions") === 1 && f.providerCount("create") === 1 && f.providerCount("send") === 1);
  }, { financial: true });

  await scenario("unsafe_and_mismatched_payment_links", async ({ fixture: f, context }) => {
    await f.approve(); await f.accept(); await f.sendAccepted();
    const page = await context.newPage(); await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
    const writes = f.totalChanges();
    await paymentCheck(page); await page.locator("#payment-handoff").waitFor({ state: "visible" });
    f.controls.paymentUrl = "https://www.sandbox.paypal.com.evil.test/invoice/p/collect";
    const unsafe = await paymentCheck(page);
    check("an unsafe provider URL removes the prior link and cannot be handed off", unsafe.status() !== 200
      && await page.locator("#payment-handoff").isHidden() && await page.locator("#payment-handoff").getAttribute("href") === null);
    f.controls.paymentUrl = "https://www.sandbox.paypal.com/invoice/p/#TRANSACTION_FIXTURE_035";
    f.controls.mutateProvider = raw => { raw.amount.value = "426.00"; };
    await page.locator("#reload").click(); await buyerStatusReady(page);
    const mismatch = await paymentCheck(page);
    check("a provider amount differing from accepted terms cannot produce a payment link", mismatch.status() !== 200
      && await page.locator("#payment-handoff").getAttribute("href") === null);
    check("rejected handoffs remain read-only and cannot recreate or resend invoices", f.totalChanges() === writes
      && f.providerCount("create") === 1 && f.providerCount("send") === 1);
  });

  for (const loss of ["revoked", "expired"]) {
    await scenario(`buyer_capability_${loss}_during_provider_read`, async ({ fixture: f, context }) => {
      await f.approve(); await f.accept(); await f.sendAccepted();
      const page = await context.newPage(); await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
      f.controls.beforeProvider = stage => {
        if (stage !== "get") return;
        if (loss === "revoked") f.db.prepare("UPDATE buyer_capabilities SET revoked_at=? WHERE buyer_capability_id=?").run(NOW, ids.capability);
        else f.setTime(f.db.prepare("SELECT expires_at FROM buyer_capabilities WHERE buyer_capability_id=?").get(ids.capability).expires_at);
      };
      const response = await paymentCheck(page);
      check(`capability ${loss} while PayPal is in flight rejects the returned handoff`, response.status() === 403
        && await page.locator("#payment-handoff").getAttribute("href") === null);
      check("lost capability clears all private offer and payment state", await page.locator("#offer").innerText() === ""
        && await page.locator("#buyer-status-panel").isHidden() && await page.locator("#access-form").isVisible()
        && await browserStorageEmpty(page));
      check("loss of capability cannot create payment authority or repeat external effects", f.providerCount("create") === 1
        && f.providerCount("send") === 1 && f.count("payment_evidence") === 0);
    });
  }

  await scenario("changed_terms_block_buyer_handoff", async ({ fixture: f, context }) => {
    await f.approve(); await f.accept(); await f.sendAccepted();
    const page = await context.newPage(); await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
    const before = f.providerCalls.length;
    f.version({ duration: 60 });
    const response = await paymentCheck(page);
    check("a changed canonical licensing tuple blocks handoff before provider I/O", response.status() === 409
      && f.providerCalls.length === before && await page.locator("#payment-handoff").getAttribute("href") === null);
    check("stale handoff cannot record new acceptance or invoice authority", f.count("buyer_acceptances") === 1
      && f.count("invoice_bindings") === 1 && f.count("payment_evidence") === 0);
  });

  await scenario("late_payment_handoff_after_link_lifetime", async ({ fixture: f, context, bridge }) => {
    await f.approve(); await f.accept(); await f.sendAccepted();
    const page = await context.newPage(); await page.clock.install({ time: new Date(NOW) });
    await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await buyerStatusReady(page);
    const hold = bridge.holdNext(BUYER_HANDOFF_PATH);
    try {
      await page.locator("#refresh-payment").click(); await waitForHold(hold.arrived);
      f.setTime(new Date(Date.parse(NOW) + 30001).toISOString()); await page.clock.fastForward(30001);
    } finally { hold.release(); }
    await bridge.settle();
    // The request deadline precedes the link lifetime; the later reply stays unusable.
    await page.waitForFunction(() => document.getElementById("payment-status").textContent.includes("payment check timed out"));
    check("a handoff arriving after thirty seconds never exposes its expired link", await page.locator("#payment-handoff").isHidden()
      && await page.locator("#payment-handoff").getAttribute("href") === null);
    check("a late handoff starts no automatic provider retry or payment operation", posted(f, BUYER_HANDOFF_PATH).length === 1
      && f.providerCount("get") === 3 && f.providerCount("create") === 1 && f.providerCount("send") === 1);
  });

  await scenario("late_status_after_private_view_hidden", async ({ fixture: f, context, bridge }) => {
    await f.approve(); await f.accept(); await f.sendAccepted();
    const hold = bridge.holdNext(BUYER_STATUS_PATH, "GET"), page = await context.newPage();
    try {
      await page.goto(`${ORIGIN}/buyer/review#${f.token}`, { waitUntil: "domcontentloaded" }); await waitForHold(hold.arrived);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } finally { hold.release(); }
    await bridge.settle();
    check("late canonical status cannot reopen a hidden private view", await page.locator("#offer").innerText() === ""
      && await page.locator("#buyer-status-panel").isHidden() && await page.locator("#access-form").isVisible());
    check("hidden status result cannot expose payment or private receipt navigation", await page.locator("#payment-handoff").getAttribute("href") === null
      && await page.locator("#read-receipt").isHidden() && await browserStorageEmpty(page));
  });

  report.passed = checks.length;
  report.status = "passed";
  writeFileSync(join(directory, "checks.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: checks.length, scenarios: scenarios.length, artifacts: directory, mode: report.mode }, null, 2));
} catch (error) {
  report.passed = checks.length;
  report.status = "failed";
  report.failure = { scenario: scenarioName, message: error.message };
  writeFileSync(join(directory, "checks.json"), JSON.stringify(report, null, 2) + "\n");
  throw error;
} finally { await browser.close(); }
