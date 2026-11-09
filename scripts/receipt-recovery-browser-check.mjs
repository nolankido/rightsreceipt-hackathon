/**
 * Receipt request ownership and deliberate recovery through actual native
 * handlers, canonical SQLite services and production receipt issuance.
 * Synthetic requests, reviewed terms and quotes are initial fixture data.
 * Gateway assertions and provider replies are local fixtures; no live service.
 * Selected transport faults replay unchanged handler bytes while ignoring abort.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { transactionBrowserFixture, ORIGIN } from "./support/transaction-browser-fixture.mjs";
import { ids } from "./support/human-consent-fixture.mjs";

const moduleName = process.env.RR_PLAYWRIGHT_MODULE;
const playwright = await import(moduleName ? pathToFileURL(createRequire(import.meta.url).resolve(moduleName)).href : "playwright");
const { chromium } = playwright.default ?? playwright;
const directory = resolve(process.env.RR_RECEIPT_RECOVERY_ARTIFACTS || join(tmpdir(), "rightsreceipt-receipt-recovery"));
mkdirSync(directory, { recursive: true });
const sha = value => createHash("sha256").update(value).digest("hex");
const PAGE = "/receipts/buyer", API = "/api/receipts/buyer";
const SOURCE = ["packages/receipts/src/client.ts", "packages/receipts/src/presentation.ts", "packages/receipts/src/http.ts",
  "scripts/support/transaction-browser-fixture.mjs", "scripts/support/human-consent-fixture.mjs"];
const checks = [], scenarios = [];
const report = { mode: "receipt recovery browser verification through actual native handlers", runtime: process.version,
  scriptSha256: sha(readFileSync(new URL(import.meta.url))),
  sourceSha256: Object.fromEntries(SOURCE.map(name => [name, sha(readFileSync(new URL(`../${name}`, import.meta.url)))])),
  limitations: ["Synthetic initial request, human-reviewed terms and quote; initial intake is outside this collection",
    "Real consent, invoice, reconciliation and receipt services prepare canonical SQLite receipts using injected provider HTTP",
    "Receipt browser actions must cause zero additional provider calls or database writes after fixture setup",
    "Different-code scenarios route to two isolated canonical fixtures; each fixture independently enforces its actual capability authorization",
    "Header and body holds replay actual native handler responses through an injected fetch wrapper that deliberately ignores abort",
    "Browser clocks, hidden/history events and window.print are controlled locally; downloads use actual canonical handler bytes",
    "No listening server, real gateway, provider network, deployed Worker, Cloudflare D1 or screen-reader audit"],
  completed: false, passed: 0, checks, scenarios };
let scenarioName = "setup";
function check(label, condition = true) { assert.ok(condition, `${scenarioName}: ${label}`); checks.push({ scenario: scenarioName, check: label }); }

async function prepared({ title, boundary = false } = {}) {
  const f = transactionBrowserFixture();
  try {
    if (title) f.db.prepare("UPDATE assets SET title=? WHERE asset_id=?").run(title, ids.asset);
    await f.approve(); await f.accept(); await f.sendAccepted(); f.controls.providerStatus = "PAID";
    assert.equal((await f.reconcile()).outcomes.applied, 1);
    assert.equal((await f.issueReceipt()).outcome, "issued");
    if (boundary) {
      // Controlled fixture eligibility, so the real reader reaches the actual
      // scheduled licensing boundary while the browser request is still young.
      f.db.prepare("UPDATE buyer_capabilities SET expires_at=? WHERE buyer_capability_id=?")
        .run("2026-11-03T00:00:00.000Z", ids.capability);
      f.setTime("2026-10-31T23:59:55.000Z");
    }
    return f;
  } catch (error) { f.close(); throw error; }
}

async function bridge(context, fixtures) {
  const attempts = [], errors = [], outstanding = new Set();
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  await context.route("**/*", route => {
    const task = (async () => {
      const incoming = route.request(), url = new URL(incoming.url());
      assert.equal(url.origin, ORIGIN, "No external origin may be contacted.");
      const headers = await incoming.allHeaders();
      const selected = Math.max(0, fixtures.findIndex(f => headers.authorization === `Bearer ${f.token}`));
      const attempt = { method: incoming.method(), path: url.pathname, format: url.searchParams.get("format"), fixture: selected };
      attempts.push(attempt);
      const response = await fixtures[selected].dispatch(new Request(incoming.url(), { method: incoming.method(), headers }), { browser: true });
      attempt.status = response.status;
      try { await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }); }
      catch (error) { if (!incoming.failure()) throw error; }
    })();
    outstanding.add(task); task.catch(error => errors.push(error.message)).finally(() => outstanding.delete(task)); return task;
  });
  return { attempts, errors,
    receiptReads(format) { return attempts.filter(row => row.path === API && (!format || row.format === format)); },
    async settle() { await Promise.allSettled([...outstanding]); },
  };
}

async function installFaults(context) {
  await context.addInitScript(() => {
    const actualFetch = window.fetch.bind(window), active = new Map(); let next = null, serial = 0;
    const observations = [], prints = []; let objectUrls = 0;
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (...args) => { objectUrls++; return createObjectURL(...args); };
    window.print = () => { prints.push(document.getElementById("rr-document")?.textContent ?? ""); };
    const controls = {
      arm(mode, format = "html") { if (next) throw Error("A receipt fault is already armed."); next = { id: ++serial, mode, format }; return serial; },
      release(id) { const entry = active.get(id); if (entry) { active.delete(id); entry.release(); } },
      releaseAll() { for (const [id] of active) controls.release(id); next = null; },
      state() { return { observations: observations.map(row => ({ ...row })), pending: [...active.keys()], prints: [...prints], objectUrls }; },
    };
    Object.defineProperty(window, "__receiptFaults", { value: controls });
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      const fault = url.pathname === "/api/receipts/buyer" && next?.format === url.searchParams.get("format") ? next : null;
      if (fault) next = null;
      const options = fault ? { ...init, signal: undefined } : init;
      const response = await actualFetch(input, options);
      if (!fault) return response;
      const observed = { id: fault.id, mode: fault.mode, format: fault.format, status: response.status, arrived: false, released: false };
      observations.push(observed);
      if (fault.mode === "headers") {
        return new Promise(done => {
          active.set(fault.id, { release() { observed.released = true; done(response); } }); observed.arrived = true;
        });
      }
      if (fault.mode !== "body") throw Error("Unknown receipt fault.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const stream = new ReadableStream({ start(controller) {
        active.set(fault.id, { release() { observed.released = true; if (!observed.canceled) { controller.enqueue(bytes); controller.close(); } } }); observed.arrived = true;
      }, cancel() { observed.canceled = true; } });
      return new Response(stream, { status: response.status, headers: response.headers });
    };
  });
}

async function pageFor(context, fixture) {
  const page = await context.newPage(); await page.clock.install({ time: fixture.now() });
  const downloads = []; page.on("download", download => downloads.push(download));
  await page.goto(ORIGIN + PAGE, { waitUntil: "domcontentloaded" }); return { page, downloads };
}
async function open(page, code) { await page.locator("#rr-token").fill(code); await page.locator("#rr-token").press("Enter"); }
async function ready(page, fixture) {
  await page.waitForFunction(hash => document.getElementById("rr-document")?.textContent.includes(hash)
    && !document.getElementById("rr-export").disabled && !document.getElementById("rr-print").disabled, fixture.receipt().payload_hash);
}
async function arm(page, mode, format = "html") { return page.evaluate(({ mode, format }) => window.__receiptFaults.arm(mode, format), { mode, format }); }
async function held(page, id) { await page.waitForFunction(wanted => window.__receiptFaults.state().observations.some(row => row.id === wanted && row.arrived), id); }
async function release(page, id) {
  await page.evaluate(wanted => window.__receiptFaults.release(wanted), id); await page.clock.runFor(1);
  await page.evaluate(async () => { await Promise.resolve(); await Promise.resolve(); });
}
async function emptyAccess(page) {
  await page.locator("#rr-access").waitFor({ state: "visible" });
  check("recovery exposes empty code entry and removes the protected document", await page.locator("#rr-token").inputValue() === ""
    && await page.locator("#rr-document").count() === 0);
  check("locked recovery has no available refresh, print or export authority", await page.locator("#rr-actions").isHidden()
    || (await page.locator("#rr-refresh").isDisabled() && await page.locator("#rr-print").isDisabled() && await page.locator("#rr-export").isDisabled()));
}
async function pendingAccess(page) {
  check("pending access exposes code replacement and an enabled Close action", await page.locator("#rr-access").isVisible()
    && await page.locator("#rr-lock").isVisible() && await page.locator("#rr-lock").isEnabled());
  check("pending access disables refresh, print and export and clears prior presentation", await page.locator("#rr-refresh").isDisabled()
    && await page.locator("#rr-print").isDisabled() && await page.locator("#rr-export").isDisabled() && await page.locator("#rr-document").count() === 0);
}
async function staleActions(page, routing, downloads) {
  const reads = routing.receiptReads().length, before = await page.evaluate(() => window.__receiptFaults.state());
  await page.evaluate(() => { for (const id of ["rr-refresh", "rr-print", "rr-export"]) document.getElementById(id).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await routing.settle(); await page.clock.runFor(1);
  const after = await page.evaluate(() => window.__receiptFaults.state());
  check("programmatic unavailable actions dispatch no read, print or download", routing.receiptReads().length === reads
    && after.prints.length === before.prints.length && after.objectUrls === before.objectUrls && downloads.length === 0);
}
async function downloadBytes(download) {
  const chunks = [], stream = await download.createReadStream(); for await (const chunk of stream) chunks.push(chunk); return Buffer.concat(chunks);
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.RR_CHROMIUM ? { executablePath: process.env.RR_CHROMIUM } : {}), args: ["--no-sandbox"] });
report.browser = browser.version();
async function scenario(name, run, { pair = false, boundary = false } = {}) {
  scenarioName = name;
  const fixtures = [await prepared({ boundary })]; if (pair) fixtures.push(await prepared({ title: "A Different Protected Harbor" }));
  const snapshots = fixtures.map(f => ({ writes: f.totalChanges(), providerCalls: f.providerCalls.length }));
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true, serviceWorkers: "block" });
  context.setDefaultTimeout(10000); await installFaults(context); const routing = await bridge(context, fixtures);
  try {
    await run({ fixture: fixtures[0], other: fixtures[1], context, routing });
    for (const page of context.pages()) await page.evaluate(() => window.__receiptFaults.releaseAll());
    await routing.settle(); assert.deepEqual(routing.errors, []);
    check("receipt browser actions add no provider calls or database writes", fixtures.every((f, index) =>
      f.totalChanges() === snapshots[index].writes && f.providerCalls.length === snapshots[index].providerCalls));
    check("all browser receipt requests are read-only and keep private codes out of URLs", fixtures.every(f => f.requests.filter(row => row.browser).every(row =>
      row.method === "GET" && !fixtures.some(other => row.requestUrl.includes(other.token)) && !new URL(row.requestUrl).hash)));
    for (const page of context.pages()) {
      check("private codes stay out of the page, persistent storage and cookies", !(await page.content()).match(fixtures.map(f => f.token).join("|"))
        && await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0)
        && (await context.cookies()).every(cookie => !fixtures.some(f => cookie.value.includes(f.token))));
    }
    scenarios.push({ name, receiptReads: routing.receiptReads(), browserRequests: routing.attempts.length,
      fixtures: fixtures.map((f, index) => ({ canonicalRevisions: f.count("receipt_revisions"), setupProviderCalls: snapshots[index].providerCalls,
        additionalProviderCalls: f.providerCalls.length - snapshots[index].providerCalls, additionalDatabaseWrites: f.totalChanges() - snapshots[index].writes })) });
    console.log(JSON.stringify({ scenario: name, passed: checks.filter(row => row.scenario === name).length }));
  } finally {
    for (const page of context.pages()) await page.evaluate(() => window.__receiptFaults?.releaseAll()).catch(() => {});
    await routing.settle(); await context.close(); for (const f of fixtures) f.close();
  }
}

try {
  await scenario("same_code_replacement_owns_pending_request", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f), first = await arm(page, "headers");
    await open(page, f.token); await held(page, first); await pendingAccess(page);
    const second = await arm(page, "body"); await open(page, f.token); await held(page, second);
    check("a repeated valid code starts its own authorized read", routing.receiptReads("html").length === 2);
    await release(page, first); await pendingAccess(page); await staleActions(page, routing, downloads);
    check("the old completion cannot release the newer request's busy state", await page.locator("#rr-document").count() === 0
      && (await page.evaluate(() => window.__receiptFaults.state())).pending.includes(second));
    await release(page, second); await ready(page, f);
    await page.locator("#rr-refresh").click(); await ready(page, f);
    check("the winning completion remains usable for a deliberate fresh read", routing.receiptReads("html").length === 3);
  });

  await scenario("different_code_replacement_rejects_late_old_receipt", async ({ fixture: f, other, context, routing }) => {
    const { page } = await pageFor(context, f), old = await arm(page, "headers");
    await open(page, f.token); await held(page, old); await open(page, other.token); await ready(page, other);
    check("different-code submission loads the separately authorized current receipt", routing.receiptReads("html").length === 2
      && routing.receiptReads("html")[1].fixture === 1 && (await page.locator("#rr-document").innerText()).includes("A Different Protected Harbor"));
    await release(page, old);
    check("late first-code content cannot replace the winning document", (await page.locator("#rr-document").innerText()).includes(other.receipt().payload_hash)
      && !(await page.locator("#rr-document").innerText()).includes(f.receipt().payload_hash));
    await page.locator("#rr-refresh").click(); await ready(page, other);
    check("later refresh retains the winning capability", routing.receiptReads("html").at(-1).fixture === 1);
  }, { pair: true });

  await scenario("pending_close_clears_access_and_allows_deliberate_reentry", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f), old = await arm(page, "body");
    await open(page, f.token); await held(page, old); await pendingAccess(page);
    await page.screenshot({ path: join(directory, "receipt-pending-close.png"), fullPage: true });
    await page.locator("#rr-lock").click(); await emptyAccess(page); await release(page, old);
    await emptyAccess(page); await staleActions(page, routing, downloads);
    await open(page, f.token); await ready(page, f);
    check("deliberate code reentry after Close starts a usable new request", routing.receiptReads("html").length === 2);
  });

  for (const lifecycle of ["hidden", "pagehide", "pageshow"]) {
    await scenario(`pending_${lifecycle}_cancels_old_authority`, async ({ fixture: f, context, routing }) => {
      const { page, downloads } = await pageFor(context, f), old = await arm(page, "headers");
      await open(page, f.token); await held(page, old);
      await page.evaluate(kind => {
        if (kind === "hidden") { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); }
        else window.dispatchEvent(new PageTransitionEvent(kind, { persisted: kind === "pageshow" }));
      }, lifecycle);
      await emptyAccess(page); await release(page, old); await staleActions(page, routing, downloads);
      check("late lifecycle-canceled receipt never returns to the DOM", await page.locator("#rr-document").count() === 0);
      if (lifecycle === "hidden") await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
      await open(page, f.token); await ready(page, f);
      check("returning to the page requires deliberate code reentry", routing.receiptReads("html").length === 2);
    });
  }

  for (const phase of ["headers", "body"]) {
    await scenario(`receipt_${phase}_deadline_clears_pending_access`, async ({ fixture: f, context, routing }) => {
      const { page, downloads } = await pageFor(context, f), old = await arm(page, phase);
      await open(page, f.token); await held(page, old); await page.clock.fastForward(15001); await emptyAccess(page);
      check("the complete receipt read has a bounded recovery message", /timed out|too long|deadline/i.test(await page.locator("#rr-client-status").innerText()));
      if (phase === "body") {
        await page.setViewportSize({ width: 390, height: 844 });
        check("mobile timeout recovery does not overflow horizontally", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: join(directory, "receipt-timeout-code-recovery-mobile.png"), fullPage: true });
      }
      await page.clock.fastForward(60001);
      check("timeout does not schedule an automatic retry", routing.receiptReads().length === 1);
      await release(page, old); await staleActions(page, routing, downloads);
      await open(page, f.token); await ready(page, f);
      check("reentry recovers after the late timed-out response", routing.receiptReads("html").length === 2);
    });
  }

  await scenario("print_waits_for_its_own_current_html_check", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const heldPrint = await arm(page, "body"); await page.locator("#rr-print").click(); await held(page, heldPrint);
    await pendingAccess(page); await staleActions(page, routing, downloads);
    check("Print first requests an independent current HTML receipt", routing.receiptReads("html").length === 2);
    await release(page, heldPrint); await ready(page, f);
    await page.waitForFunction(() => window.__receiptFaults.state().prints.length === 1);
    const state = await page.evaluate(() => window.__receiptFaults.state());
    check("only the successful current print request invokes print with the canonical receipt", state.prints.length === 1
      && state.prints[0].includes(f.receipt().payload_hash) && state.objectUrls === 0);
  });

  await scenario("superseded_print_cannot_print_another_codes_receipt", async ({ fixture: f, other, context }) => {
    const { page } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const old = await arm(page, "headers"); await page.locator("#rr-print").click(); await held(page, old);
    await open(page, other.token); await ready(page, other); await release(page, old);
    check("a superseded print never prints the newer code's document", (await page.evaluate(() => window.__receiptFaults.state())).prints.length === 0
      && (await page.locator("#rr-document").innerText()).includes(other.receipt().payload_hash));
    const next = await arm(page, "body"); await page.locator("#rr-print").click(); await held(page, next);
    await page.locator("#rr-lock").click(); await release(page, next); await emptyAccess(page);
    check("Close cancels pending print even when its body completes later", (await page.evaluate(() => window.__receiptFaults.state())).prints.length === 0);
  }, { pair: true });

  await scenario("pending_export_blocks_print_and_preserves_canonical_bytes", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const old = await arm(page, "body", "json"); await page.locator("#rr-export").click(); await held(page, old);
    check("pending export leaves only deliberate Close available", await page.locator("#rr-lock").isVisible() && await page.locator("#rr-lock").isEnabled()
      && await page.locator("#rr-print").isDisabled() && await page.locator("#rr-export").isDisabled() && await page.locator("#rr-refresh").isDisabled());
    await staleActions(page, routing, downloads);
    const downloaded = page.waitForEvent("download"); await release(page, old); const bytes = await downloadBytes(await downloaded);
    check("successful export preserves the exact current canonical bytes and hash", bytes.toString() === f.receipt().canonical_payload_json
      && sha(bytes) === f.receipt().payload_hash && routing.receiptReads("json").length === 1);
    check("export completion never prints an earlier receipt", (await page.evaluate(() => window.__receiptFaults.state())).prints.length === 0 && downloads.length === 1);
  });

  await scenario("pending_export_close_discards_late_download", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const old = await arm(page, "body", "json"); await page.locator("#rr-export").click(); await held(page, old);
    await page.locator("#rr-lock").click(); await emptyAccess(page); await release(page, old); await staleActions(page, routing, downloads);
    check("a canceled JSON body creates no object URL or download", (await page.evaluate(() => window.__receiptFaults.state())).objectUrls === 0 && downloads.length === 0);
    await open(page, f.token); await ready(page, f);
    check("a canceled export does not strand subsequent receipt access", routing.receiptReads("html").length === 2);
  });

  await scenario("pending_export_deadline_discards_late_download", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const old = await arm(page, "body", "json"); await page.locator("#rr-export").click(); await held(page, old);
    await page.clock.fastForward(15001); await emptyAccess(page); await release(page, old); await staleActions(page, routing, downloads);
    check("a JSON body arriving after the request deadline cannot download", (await page.evaluate(() => window.__receiptFaults.state())).objectUrls === 0
      && downloads.length === 0 && routing.receiptReads("json").length === 1);
    await open(page, f.token); await ready(page, f);
  });

  await scenario("pending_export_keeps_original_licensing_boundary", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const old = await arm(page, "body", "json"); await page.locator("#rr-export").click(); await held(page, old);
    f.setTime("2026-11-01T00:00:01.000Z"); await page.clock.fastForward(6000); await emptyAccess(page);
    await release(page, old); await staleActions(page, routing, downloads);
    check("crossing the licensing boundary invalidates the pending export before its request timeout", downloads.length === 0
      && (await page.evaluate(() => window.__receiptFaults.state())).objectUrls === 0 && routing.receiptReads("json").length === 1);
    await open(page, f.token); await emptyAccess(page);
    await page.waitForFunction(() => document.getElementById("rr-client-status").textContent.includes("requires review"));
    check("deliberate reentry uses the actual handler's current boundary rejection", routing.receiptReads("html").at(-1).status === 409
      && await page.locator("#rr-document").count() === 0);
  }, { boundary: true });

  await scenario("native_unavailable_read_locks_and_allows_deliberate_reentry", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    f.environment.RIGHTS_RECEIPT_READ_ENABLED = "false"; await page.locator("#rr-refresh").click();
    await page.waitForFunction(() => document.getElementById("rr-client-status").textContent.includes("temporarily unavailable"));
    await emptyAccess(page); await staleActions(page, routing, downloads);
    check("actual service unavailability clears retained receipt authority", routing.receiptReads("html").at(-1).status === 503);
    f.environment.RIGHTS_RECEIPT_READ_ENABLED = "true"; await open(page, f.token); await ready(page, f);
    check("restored service is read only after deliberate code reentry", routing.receiptReads("html").length === 3);
  });
  report.completed = true;
} catch (error) { report.failure = { scenario: scenarioName, message: error.message }; throw error; }
finally {
  await browser.close(); report.passed = checks.length;
  writeFileSync(join(directory, "receipt-recovery-browser-results.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ passed: report.passed, scenarios: scenarios.length, artifacts: directory }));
