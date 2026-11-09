/**
 * Adversarial buyer-client response validation. Every starting response comes
 * from the native transaction routes and canonical SQLite fixture. This test
 * deliberately corrupts selected response fields before delivering them to
 * the real browser client. It is separate from the unmodified integration
 * harness and does not establish deployed Worker, D1, or PayPal behavior.
 *
 * No external server is contacted. Browser HTTPS requests are intercepted.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { transactionBrowserFixture, ORIGIN, BUYER_STATUS_PATH, BUYER_HANDOFF_PATH }
  from "./support/transaction-browser-fixture.mjs";
import { NOW } from "./support/human-consent-fixture.mjs";

const moduleName = process.env.RR_PLAYWRIGHT_MODULE;
const playwright = await import(moduleName ? pathToFileURL(createRequire(import.meta.url).resolve(moduleName)).href : "playwright");
const { chromium } = playwright.default ?? playwright;
const directory = resolve(process.env.RR_BUYER_VALIDATION_ARTIFACTS || join(tmpdir(), "rightsreceipt-buyer-validation-browser"));
mkdirSync(directory, { recursive: true });
const report = { mode: "deliberately corrupted native responses in an intercepted offline browser",
  limitations: ["Response corruption is test-only and intentional", "Synthetic Access assertions and provider HTTP",
    "Real canonical SQLite services, native routes, HTML, and browser client", "No deployed Worker, Cloudflare D1, or genuine PayPal payment"],
  runtime: process.version, checks: [], passed: 0 };
function check(name, condition) { assert.ok(condition, name); report.checks.push(name); }

const browser = await chromium.launch({ headless: true,
  ...(process.env.RR_CHROMIUM ? { executablePath: process.env.RR_CHROMIUM } : {}), args: ["--no-sandbox"] });
report.browser = browser.version();

async function withPage(fixture, corruption, run) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: "block" });
  context.setDefaultTimeout(10000);
  const errors = [], requests = [], outstanding = new Set();
  await context.route("**/*", route => {
    const operation = (async () => {
      const incoming = route.request(), url = new URL(incoming.url());
      if (url.origin !== ORIGIN) throw new Error("Unexpected external browser request.");
      requests.push({ method: incoming.method(), path: url.pathname, url: incoming.url() });
      const headers = await incoming.allHeaders(), body = incoming.postDataBuffer();
      const response = await fixture.dispatch(new Request(incoming.url(), { method: incoming.method(), headers,
        ...(body && !["GET", "HEAD"].includes(incoming.method()) ? { body } : {}) }), { browser: true });
      const mutate = url.pathname === BUYER_STATUS_PATH ? corruption.status
        : url.pathname === BUYER_HANDOFF_PATH ? corruption.handoff : null;
      let bytes;
      if (mutate) {
        assert.equal(response.status, 200, "Corruption must start with a successful native response.");
        const value = await response.json(); mutate(value); bytes = Buffer.from(JSON.stringify(value));
      } else bytes = Buffer.from(await response.arrayBuffer());
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    })();
    outstanding.add(operation);
    operation.catch(async error => { errors.push(error.message); await route.abort("failed").catch(() => {}); })
      .finally(() => outstanding.delete(operation));
    return operation.catch(() => {});
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: fixture.now() });
  try {
    await page.goto(`${ORIGIN}/buyer/review#${fixture.token}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.getElementById("reload").disabled
      && !document.getElementById("buyer-status-panel").hidden);
    await run(page, requests);
    await Promise.allSettled([...outstanding]);
    assert.deepEqual(errors, []);
    assert.equal(page.url(), `${ORIGIN}/buyer/review`);
    assert.ok(!(await page.content()).includes(fixture.token));
    assert.ok(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0));
    assert.ok(requests.every(request => !request.url.includes(fixture.token)));
  } finally {
    await context.close(); await Promise.allSettled([...outstanding]);
  }
}

async function rejectedStatus(fixture, name, mutate) {
  const writes = fixture.totalChanges(), providerCalls = fixture.providerCalls.length;
  await withPage(fixture, { status: mutate }, async (page, requests) => {
    check(`${name}: no verified permission claim survives`, (await page.locator("#permission-status").innerText())
      === "No current permission status is being asserted.");
    check(`${name}: payment and receipt navigation are cleared`, await page.locator("#refresh-payment").isDisabled()
      && await page.locator("#payment-handoff").getAttribute("href") === null
      && await page.locator("#verification-link").getAttribute("href") === null
      && await page.locator("#read-receipt").isHidden() && await page.locator("#read-receipt").isDisabled());
    await page.locator("#refresh-payment").dispatchEvent("click");
    await page.locator("#read-receipt").dispatchEvent("click");
    check(`${name}: invalid state cannot dispatch a command`, requests.every(request => request.method === "GET")
      && fixture.totalChanges() === writes && fixture.providerCalls.length === providerCalls);
  });
}

async function rejectedHandoff(fixture, name, mutate) {
  const writes = fixture.totalChanges();
  await withPage(fixture, { handoff: mutate }, async page => {
    assert.ok(await page.locator("#refresh-payment").isEnabled());
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === BUYER_HANDOFF_PATH);
    await page.locator("#refresh-payment").click(); await pending;
    await page.waitForFunction(() => !document.getElementById("refresh-payment").disabled
      && !document.getElementById("payment-status").textContent.startsWith("Checking the current Sandbox invoice"));
    check(`${name}: invalid handoff never exposes a link`, await page.locator("#payment-handoff").isHidden()
      && await page.locator("#payment-handoff").getAttribute("href") === null);
    check(`${name}: provider response cannot grant payment or permission`, (await page.locator("#permission-status").innerText())
      .startsWith("Payment is not confirmed") && fixture.totalChanges() === writes
      && fixture.count("payment_evidence") === 0 && fixture.count("permissions") === 0);
  });
}

const paid = transactionBrowserFixture(), payable = transactionBrowserFixture();
try {
  await paid.approve(); await paid.accept(); await paid.sendAccepted();
  paid.controls.providerStatus = "PAID"; await paid.reconcile(); await paid.issueReceipt();
  await withPage(paid, {}, async page => {
    check("unmodified canonical scheduled receipt remains usable", (await page.locator("#permission-status").innerText())
      .startsWith("Scheduled in Sandbox") && await page.locator("#read-receipt").isVisible()
      && (await page.locator("#status-details").innerText()).includes(paid.receipt().payload_hash));
  });
  for (const state of ["active", "scheduled", "expired", "refunded", "revoked"]) {
    await rejectedStatus(paid, `${state} without verified receipt`, value => {
      value.receipt.status = state; value.receipt.integrity = "not_verified"; value.receipt.record = null;
      value.receipt.canReadPrivate = false; value.receipt.privatePath = null;
    });
  }
  await rejectedStatus(paid, "scheduled receipt with unpaid invoice", value => { value.invoiceStatus = "sent"; });
  await rejectedStatus(paid, "verified receipt without its record", value => { value.receipt.record = null; });
  await rejectedStatus(paid, "private navigation with external path", value => { value.receipt.privatePath = "https://example.invalid/receipt"; });
  await rejectedStatus(paid, "public navigation with external path", value => { value.receipt.publicVerificationPath = "https://example.invalid/verify"; });
  await rejectedStatus(paid, "receipt period different from accepted terms", value => { value.receipt.record.period.startDate = "2026-11-02"; });
  await rejectedStatus(paid, "receipt observation after status check", value => {
    value.receipt.checkedAt = new Date(Date.parse(value.checkedAt) + 1).toISOString();
  });
  paid.setTime("2026-10-27T23:59:58.000Z");
  await withPage(paid, {}, async (page, requests) => {
    check("verified status is usable immediately before the next UTC day", await page.locator("#read-receipt").isVisible());
    const reads = requests.length, providerCalls = paid.providerCalls.length;
    await page.clock.fastForward(2001);
    check("status expires at the next UTC day without waiting sixty seconds", await page.locator("#read-receipt").isHidden()
      && await page.locator("#verification-link").getAttribute("href") === null
      && (await page.locator("#permission-status").innerText()) === "No current permission status is being asserted.");
    check("UTC status expiry performs no automatic network refresh", requests.length === reads && paid.providerCalls.length === providerCalls);
  });
  paid.setTime(new Date(Date.parse(NOW) + 60000).toISOString()); paid.controls.providerStatus = "REFUNDED";
  await paid.reconcile({ requestAnotherGeneration: true }); await paid.issueReceipt();
  await withPage(paid, {}, async page => {
    check("unmodified canonical refunded receipt remains usable", (await page.locator("#permission-status").innerText())
      .startsWith("Refunded.") && await page.locator("#read-receipt").isVisible());
  });
  await rejectedStatus(paid, "refunded receipt with paid invoice", value => { value.invoiceStatus = "paid"; });

  await payable.approve(); await payable.accept(); await payable.sendAccepted();
  await rejectedHandoff(payable, "external provider origin", value => { value.paymentUrl = "https://example.invalid/invoice/p/unsafe"; });
  await rejectedHandoff(payable, "provider URL with a query", value => { value.paymentUrl = "https://www.sandbox.paypal.com/invoice/p/unsafe?token=unexpected"; });
  await rejectedHandoff(payable, "paid observation carrying a payable URL", value => { value.providerStatus = "PAID"; });
  await rejectedHandoff(payable, "handoff claiming payment authority", value => { value.paymentConfirmed = true; });
  await rejectedHandoff(payable, "handoff lifetime above thirty seconds", value => { value.expiresInMs = 30001; });
  report.status = "passed"; report.passed = report.checks.length;
} catch (error) {
  report.status = "failed"; report.error = error.message; process.exitCode = 1;
} finally {
  paid.close(); payable.close(); await browser.close();
  writeFileSync(join(directory, "checks.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: report.status, passed: report.passed, error: report.error, report: join(directory, "checks.json") }));
}
