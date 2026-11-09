/**
 * Buyer private-access cleanup through actual transaction handlers.
 * The fixture begins with a synthetic request, reviewed terms and quote.
 * HTTP 409 follows a competing canonical revision. HTTP 400 is produced by
 * deliberately corrupting one outgoing command before the real handler.
 * A labeled one-shot DOM fault reaches the defensive outer load boundary.
 * No live gateway, provider, deployed Worker or Cloudflare D1 is exercised.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { transactionBrowserFixture, ORIGIN, BUYER_ACCEPT_PATH } from "./support/transaction-browser-fixture.mjs";
import { NOW } from "./support/human-consent-fixture.mjs";

const moduleName = process.env.RR_PLAYWRIGHT_MODULE;
const playwright = await import(moduleName ? pathToFileURL(createRequire(import.meta.url).resolve(moduleName)).href : "playwright");
const { chromium } = playwright.default ?? playwright;
const directory = resolve(process.env.RR_BUYER_BOUNDARY_ARTIFACTS || join(tmpdir(), "rightsreceipt-buyer-private-boundary"));
mkdirSync(directory, { recursive: true });
const sha = value => createHash("sha256").update(value).digest("hex");
const checks = [], scenarios = [];
const report = { mode: "buyer private-boundary browser verification through actual native handlers", runtime: process.version,
  scriptSha256: sha(readFileSync(new URL(import.meta.url))),
  clientSourceSha256: Object.fromEntries(["buyer-review-client", "request-deadline-client", "form-accessibility-client"].map(name =>
    [name, sha(readFileSync(new URL(`../apps/web/src/${name}.ts`, import.meta.url)))])),
  limitations: ["Synthetic initial request, human-reviewed terms and quote; initial intake is outside this suite",
    "Actual signed-assertion verifier, native handlers, SQLite migrations and command services; gateway/provider transport is injected",
    "One outgoing acceptance is intentionally corrupted before the actual handler to produce HTTP 400",
    "The generic load-failure scenarios inject a one-shot status-render exception after real reads complete",
    "Browser time and delayed transport are controlled locally; no live gateway, provider, Worker or D1",
    "Targeted private-state, command and focus verification; no screen-reader or full accessibility claim"],
  completed: false, passed: 0, checks, scenarios };
let scenarioName = "setup";
function check(label, condition = true) { assert.ok(condition, `${scenarioName}: ${label}`); checks.push({ scenario: scenarioName, check: label }); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function arrived(promise) {
  let timer;
  try { await Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(Error("Expected held response did not arrive.")), 15000); })]); }
  finally { clearTimeout(timer); }
}
async function bridge(context, fixture) {
  const attempts = [], errors = [], pending = new Set(), active = new Set();
  let corrupt = false, hold = null;
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  await context.route("**/*", route => {
    const task = (async () => {
      const incoming = route.request(), url = new URL(incoming.url());
      assert.equal(url.origin, ORIGIN, "No external origin may be contacted.");
      const headers = await incoming.allHeaders(), original = incoming.postDataBuffer();
      const attempt = { method: incoming.method(), path: url.pathname, body: original?.toString() ?? null };
      attempts.push(attempt);
      let body = original;
      if (corrupt && incoming.method() === "POST" && url.pathname === BUYER_ACCEPT_PATH) {
        corrupt = false; body = Buffer.from(JSON.stringify({ ...JSON.parse(body.toString()), acknowledged: false }));
        delete headers["content-length"]; attempt.injectedMalformedCommand = true;
      }
      const response = await fixture.dispatch(new Request(incoming.url(), { method: incoming.method(), headers,
        ...(body && !["GET", "HEAD"].includes(incoming.method()) ? { body } : {}) }), { browser: true });
      attempt.status = response.status;
      const held = incoming.method() === "POST" && url.pathname === BUYER_ACCEPT_PATH ? hold : null;
      if (held) { hold = null; active.add(held); held.arrived.resolve(); await held.release.promise; }
      try { await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }); }
      catch (error) { if (!held) throw error; }
      finally { if (held) active.delete(held); }
    })();
    pending.add(task); task.catch(error => errors.push(error.message)).finally(() => pending.delete(task)); return task;
  });
  return { attempts, errors,
    corruptNextAcceptance() { corrupt = true; },
    holdNextAcceptance() {
      assert.equal(hold, null); hold = { arrived: deferred(), release: deferred() }; const entry = hold;
      return { arrived: entry.arrived.promise, release: entry.release.resolve };
    },
    releaseAll() { hold?.release.resolve(); hold = null; for (const entry of active) entry.release.resolve(); },
    async settle() { await Promise.allSettled([...pending]); },
  };
}
const posts = (routing) => routing.attempts.filter(row => row.method === "POST" && row.path === BUYER_ACCEPT_PATH);
async function ready(page) {
  await page.waitForFunction(() => document.getElementById("offer").children.length > 0
    && !document.getElementById("reload").disabled && !document.getElementById("buyer-status-panel").hidden);
}
async function open(context, fixture) {
  const page = await context.newPage(); await page.clock.install({ time: new Date(NOW) });
  await page.goto(`${ORIGIN}/buyer/review#${fixture.token}`, { waitUntil: "domcontentloaded" }); await ready(page); return page;
}
async function submit(page) { await page.locator("#acknowledge").check(); await page.locator("#accept").click(); }
async function focused(page, id) { await page.waitForFunction(wanted => document.activeElement?.id === wanted, id); }
async function reenter(page, fixture) {
  await page.locator("#access-code").fill(fixture.token); await page.locator("#access-code").press("Enter"); await ready(page);
}
async function privateStorage(page, fixture, context) {
  check("private access remains absent from URLs, DOM, storage and cookies", page.url() === ORIGIN + "/buyer/review"
    && !(await page.content()).includes(fixture.token)
    && await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0)
    && (await context.cookies()).every(cookie => !cookie.value.includes(fixture.token))
    && fixture.requests.every(row => !row.requestUrl.includes(fixture.token) && !(row.body ?? "").includes(fixture.token)));
}
async function locked(page) {
  await page.locator("#access-form").waitFor({ state: "visible" });
  check("terminal cleanup exposes empty code entry and disables retained-access Reload", await page.locator("#access-code").inputValue() === ""
    && await page.locator("#reload").isDisabled());
  check("terminal cleanup erases rights, confirmation and financial navigation", await page.locator("#offer").innerText() === ""
    && await page.locator("#consent-copy").innerText() === "" && await page.locator("#acceptance-form").isHidden()
    && !await page.locator("#acknowledge").isChecked() && await page.locator("#acknowledge").isDisabled()
    && await page.locator("#accept").isDisabled() && await page.locator("#buyer-status-panel").isHidden()
    && await page.locator("#refresh-payment").isDisabled() && await page.locator("#read-receipt").isDisabled()
    && await page.locator("#payment-handoff").getAttribute("href") === null && await page.locator("#verification-link").getAttribute("href") === null);
}
async function proveNoRetainedDispatch(page, fixture, routing, { beyondLifetime = false } = {}) {
  const count = routing.attempts.length, writes = fixture.totalChanges(), provider = fixture.providerCalls.length, address = page.url();
  if (beyondLifetime) {
    fixture.setTime(new Date(Date.parse(NOW) + 300001).toISOString()); await page.clock.fastForward(300001);
    check("the cleared page stays locked beyond the former private lifetime", await page.locator("#access-form").isVisible()
      && await page.locator("#reload").isDisabled() && routing.attempts.length === count);
  }
  await page.evaluate(() => {
    for (const id of ["reload", "refresh-payment", "read-receipt", "open-clarification"]) {
      document.getElementById(id).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
    document.getElementById("acceptance-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await routing.settle(); await page.clock.runFor(1);
  check("programmatic stale controls cannot reuse the bearer or dispatch authority", routing.attempts.length === count
    && fixture.totalChanges() === writes && fixture.providerCalls.length === provider && page.url() === address);
}
async function oneShotCompletionFailure(page, prefix) {
  await page.evaluate(value => {
    const target = document.getElementById("status"), descriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    let armed = true;
    Object.defineProperty(target, "textContent", { configurable: true, get() { return descriptor.get.call(this); }, set(text) {
      if (armed && String(text).startsWith(value)) { armed = false; throw new Error("INJECTED_PRIVATE_DETAILS_043"); }
      descriptor.set.call(this, text);
    } });
  }, prefix);
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.RR_CHROMIUM ? { executablePath: process.env.RR_CHROMIUM } : {}), args: ["--no-sandbox"] });
report.browser = browser.version();
async function scenario(name, run) {
  scenarioName = name;
  const fixture = transactionBrowserFixture(), context = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: "block" });
  context.setDefaultTimeout(10000); const routing = await bridge(context, fixture);
  try {
    await fixture.approve(); await run({ fixture, context, routing }); routing.releaseAll(); await routing.settle();
    assert.deepEqual(routing.errors, []); assert.equal(fixture.providerCalls.length, 0);
    for (const table of ["payment_operations", "payment_evidence", "permissions", "receipt_revisions"]) assert.equal(fixture.count(table), 0);
    check("native routing finishes without browser errors, provider calls or manufactured payment authority");
    scenarios.push({ name, browserRequests: routing.attempts.length, acceptanceAttempts: posts(routing).map(row => ({
      status: row.status, injectedMalformedCommand: row.injectedMalformedCommand === true })),
      durableAcceptances: fixture.count("buyer_acceptances"), providerCalls: fixture.providerCalls.length });
    console.log(JSON.stringify({ scenario: name, passed: checks.filter(row => row.scenario === name).length }));
  } finally { routing.releaseAll(); await routing.settle(); await context.close(); fixture.close(); }
}
try {
  await scenario("native_conflict_clears_access_beyond_lifetime", async ({ fixture: f, context, routing }) => {
    const page = await open(context, f); f.version({ duration: 60 }); await f.approve(); await submit(page);
    await locked(page); await focused(page, "access-code");
    check("the actual handler rejects the stale command without recording acceptance", posts(routing).length === 1
      && posts(routing)[0].status === 409 && f.count("buyer_acceptances") === 0);
    await page.screenshot({ path: join(directory, "buyer-stale-offer-code-recovery.png"), fullPage: true });
    await proveNoRetainedDispatch(page, f, routing, { beyondLifetime: true });
    const attempts = posts(routing).length; await reenter(page, f);
    check("deliberate code reentry loads changed rights with fresh unchecked confirmation", await page.evaluate(() => [...document.querySelectorAll("#offer dt")]
      .find(node => node.textContent === "Duration (days)").nextElementSibling.textContent === "60")
      && !await page.locator("#acknowledge").isChecked() && await page.locator("#accept").isDisabled());
    check("code reentry is read-only and does not reuse the rejected command", posts(routing).length === attempts && f.count("buyer_acceptances") === 0);
    await privateStorage(page, f, context);
  });

  await scenario("native_bad_command_clears_pending_identity", async ({ fixture: f, context, routing }) => {
    const page = await open(context, f); routing.corruptNextAcceptance(); await submit(page); await locked(page); await focused(page, "access-code");
    check("the actual handler rejects the injected malformed command as HTTP 400", posts(routing)[0].status === 400 && f.count("buyer_acceptances") === 0);
    const first = JSON.parse(posts(routing)[0].body); await proveNoRetainedDispatch(page, f, routing); await reenter(page, f);
    check("reentry alone does not accept and leaves confirmation unchecked", posts(routing).length === 1 && f.count("buyer_acceptances") === 0
      && !await page.locator("#acknowledge").isChecked());
    await submit(page); await page.waitForFunction(() => document.getElementById("status").textContent.includes("Acceptance recorded by the server.")); await ready(page);
    const next = JSON.parse(posts(routing)[1].body);
    check("a separately confirmed action uses a fresh command identity", posts(routing).length === 2 && first.requestId !== next.requestId
      && first.reviewHash === next.reviewHash && f.count("buyer_acceptances") === 1);
    await privateStorage(page, f, context);
  });

  await scenario("held_conflict_respects_moved_keyboard_focus", async ({ fixture: f, context, routing }) => {
    const page = await open(context, f); f.version({ duration: 60 }); await f.approve(); const hold = routing.holdNextAcceptance();
    try {
      await submit(page); await arrived(hold.arrived);
      await page.locator("#skip-link").focus(); await page.locator("#skip-link").press("Enter"); await focused(page, "main-content");
    } finally { hold.release(); }
    await routing.settle(); await locked(page);
    check("a delayed conflict does not take focus back after keyboard navigation", await page.evaluate(() => document.activeElement.id === "main-content"));
    check("the delayed rejection does not retry acceptance", posts(routing).length === 1 && posts(routing)[0].status === 409 && f.count("buyer_acceptances") === 0);
    await privateStorage(page, f, context);
  });

  await scenario("unexpected_load_completion_failure_locks_private_access", async ({ fixture: f, context, routing }) => {
    const page = await open(context, f); await oneShotCompletionFailure(page, "Review every right"); await page.locator("#reload").click();
    await locked(page); await focused(page, "access-code");
    check("generic recovery does not reflect the injected internal failure text", !(await page.locator("#status").innerText()).includes("INJECTED_PRIVATE_DETAILS_043"));
    await proveNoRetainedDispatch(page, f, routing, { beyondLifetime: true }); await reenter(page, f);
    check("deliberate recovery after a generic load failure performs no acceptance", posts(routing).length === 0 && f.count("buyer_acceptances") === 0
      && !await page.locator("#acknowledge").isChecked());
    await privateStorage(page, f, context);
  });

  await scenario("acknowledged_acceptance_survives_load_completion_failure", async ({ fixture: f, context, routing }) => {
    const page = await open(context, f); await oneShotCompletionFailure(page, "Acceptance recorded by the server."); await submit(page);
    await locked(page); await focused(page, "access-code");
    const message = await page.locator("#status").innerText();
    check("generic refresh failure retains the real save acknowledgement without internal details", message.includes("Acceptance recorded by the server.")
      && !message.includes("INJECTED_PRIVATE_DETAILS_043") && f.count("buyer_acceptances") === 1);
    await proveNoRetainedDispatch(page, f, routing); await reenter(page, f);
    check("code reentry reads the accepted state without resubmitting", posts(routing).length === 1 && f.count("buyer_acceptances") === 1
      && await page.locator("#acceptance-form").isHidden());
    await privateStorage(page, f, context);
  });

  await scenario("native_unavailable_write_keeps_exact_deliberate_retry", async ({ fixture: f, context, routing }) => {
    const page = await open(context, f); f.environment.HUMAN_CONSENT_ENABLED = "false"; await submit(page);
    await page.waitForFunction(() => document.getElementById("accept").textContent.includes("Retry the same acceptance"));
    check("a native service-unavailable response keeps a bounded uncertain command", posts(routing).length === 1 && posts(routing)[0].status === 503
      && f.count("buyer_acceptances") === 0 && await page.locator("#access-form").isHidden()
      && await page.locator("#acknowledge").isDisabled() && await page.locator("#reload").isEnabled());
    f.environment.HUMAN_CONSENT_ENABLED = "true"; await page.locator("#accept").click();
    await page.waitForFunction(() => document.getElementById("status").textContent.includes("Acceptance recorded by the server.")); await ready(page);
    check("the explicit nonterminal retry keeps identical bytes and records one acceptance", posts(routing).length === 2
      && posts(routing)[0].body === posts(routing)[1].body && f.count("buyer_acceptances") === 1);
    await privateStorage(page, f, context);
  });
  report.completed = true;
} catch (error) { report.failure = { scenario: scenarioName, message: error.message }; throw error; }
finally {
  await browser.close(); report.passed = checks.length;
  writeFileSync(join(directory, "buyer-private-boundary-browser-results.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ passed: report.passed, scenarios: scenarios.length, artifacts: directory }));
