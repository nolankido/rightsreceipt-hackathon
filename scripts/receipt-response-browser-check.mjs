/**
 * Receipt response validation and delayed digest completion through actual native
 * handlers, canonical SQLite services and production receipt issuance.
 * Synthetic requests, reviewed terms and quotes are initial fixture data.
 * Gateway assertions and provider replies are local fixtures; no live service.
 * Successful-response faults deliberately alter headers or bytes; digest holds delay real browser WebCrypto results.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { transactionBrowserFixture, ORIGIN } from "./support/transaction-browser-fixture.mjs";
import { ids, NOW } from "./support/human-consent-fixture.mjs";

const moduleName = process.env.RR_PLAYWRIGHT_MODULE;
const playwright = await import(moduleName ? pathToFileURL(createRequire(import.meta.url).resolve(moduleName)).href : "playwright");
const { chromium } = playwright.default ?? playwright;
const directory = resolve(process.env.RR_RECEIPT_RESPONSE_ARTIFACTS || join(tmpdir(), "rightsreceipt-receipt-response"));
mkdirSync(directory, { recursive: true });
const sha = value => createHash("sha256").update(value).digest("hex");
const PAGE = "/receipts/buyer", API = "/api/receipts/buyer";
const SOURCE = ["packages/receipts/src/client.ts", "packages/receipts/src/presentation.ts", "packages/receipts/src/http.ts",
  "scripts/support/transaction-browser-fixture.mjs", "scripts/support/human-consent-fixture.mjs"];
const checks = [], scenarios = [];
const report = { mode: "receipt response browser verification through actual native handlers", runtime: process.version,
  scriptSha256: sha(readFileSync(new URL(import.meta.url))),
  sourceSha256: Object.fromEntries(SOURCE.map(name => [name, sha(readFileSync(new URL(`../${name}`, import.meta.url)))])),
  limitations: ["Synthetic initial request, human-reviewed terms and quote; initial intake is outside this collection",
    "Real consent, invoice, reconciliation and receipt services prepare canonical SQLite receipts using injected provider HTTP",
    "Receipt browser actions must cause zero additional provider calls or database writes after fixture setup",
    "Different-code scenarios route to two isolated canonical fixtures; each fixture independently enforces its actual capability authorization",
    "Successful-response faults alter actual handler status, headers or body; paired HTML digest headers isolate JSON envelope validation",
    "Delayed digest faults call actual browser WebCrypto first and then hold or reject its completion; cancellation is deliberately ignored by that wrapper",
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
    // Initial about:blank has no WebCrypto subtle API; the HTTPS fixture does.
    if (!window.crypto?.subtle) return;
    const actualFetch = window.fetch.bind(window), actualDigest = crypto.subtle.digest.bind(crypto.subtle), active = new Map();
    let next = null, nextDigest = null, serial = 0, objectUrls = 0;
    const observations = [], prints = [], createdDigests = [], createObjectURL = URL.createObjectURL.bind(URL);
    const hex = value => [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    URL.createObjectURL = (...args) => { objectUrls++; return createObjectURL(...args); };
    window.print = () => { prints.push(document.getElementById("rr-document")?.textContent ?? ""); };
    const controls = {
      arm(spec) { if (next) throw Error("A response fault is already armed."); next = { id: ++serial, ...spec }; return serial; },
      armDigest(mode = "hold") { if (nextDigest) throw Error("A digest fault is already armed."); nextDigest = { id: ++serial, mode }; return serial; },
      release(id) { const entry = active.get(id); if (entry) { active.delete(id); entry.release(); } },
      releaseAll() { for (const [id] of active) controls.release(id); next = null; nextDigest = null; },
      state() { return { observations: observations.map(row => ({ ...row })), pending: [...active.keys()], prints: [...prints], objectUrls,
        digests: createdDigests.map(row => ({ ...row })) }; },
    };
    Object.defineProperty(window, "__receiptFaults", { value: controls });
    crypto.subtle.digest = async (...args) => {
      const fault = nextDigest; nextDigest = null;
      const value = await actualDigest(...args);
      const sample = { algorithm: typeof args[0] === "string" ? args[0] : args[0].name, bytes: args[1].byteLength, sha256: hex(value) };
      createdDigests.push(sample);
      if (!fault) return value;
      const observed = { id: fault.id, kind: "digest", mode: fault.mode, arrived: true, released: false };
      observations.push(observed);
      if (fault.mode === "reject") throw Error("INJECTED_PRIVATE_DIGEST_DETAILS_045");
      return new Promise(done => active.set(fault.id, { release() { observed.released = true; done(value); } }));
    };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      const fault = url.pathname === "/api/receipts/buyer" && next?.format === url.searchParams.get("format") ? next : null;
      if (fault) next = null;
      const response = await actualFetch(input, init);
      if (!fault) return response;
      const headers = new Headers(response.headers), originalBytes = new Uint8Array(await response.arrayBuffer());
      let bytes = originalBytes;
      if (Object.hasOwn(fault, "body")) bytes = new TextEncoder().encode(fault.body);
      if (fault.rawBytes) bytes = new Uint8Array(fault.rawBytes);
      if (fault.appendNewline) bytes = new TextEncoder().encode(new TextDecoder().decode(bytes) + "\n");
      if (fault.htmlAttribute) {
        const { name, value } = fault.htmlAttribute;
        const pattern = new RegExp("\\s" + name + '="[^"]*"');
        const text = new TextDecoder().decode(bytes);
        if (!pattern.test(text)) throw Error("Expected actual receipt timing attribute.");
        bytes = new TextEncoder().encode(text.replace(pattern, value === null ? "" : " " + name + '= "' + value + '"'));
      }
      if (fault.tagName) bytes = new TextEncoder().encode(new TextDecoder().decode(bytes).replace('<main id="rr-document"', '<' + fault.tagName + ' id="rr-document"').replace('</main>', '</' + fault.tagName + '>'));
      if (fault.duplicateDocument) bytes = new TextEncoder().encode(new TextDecoder().decode(bytes).replace('</body>', '<main id="rr-document" data-checked-at="2026-10-27T19:00:00.000Z" data-next-boundary=""></main></body>'));
      if (Object.hasOwn(fault, "contentType")) {
        if (fault.contentType === null) headers.delete("content-type"); else headers.set("content-type", fault.contentType);
      }
      if (Object.hasOwn(fault, "digest")) {
        if (fault.digest === null) headers.delete("x-receipt-sha256"); else headers.set("x-receipt-sha256", fault.digest);
      }
      if (fault.rehash) headers.set("x-receipt-sha256", hex(await actualDigest("SHA-256", bytes)));
      // Isolate these format/digest fixtures from body-length validation. Stream
      // length faults have their own collection; replay the injected byte count.
      headers.set("content-length", String(bytes.byteLength));
      const status = fault.status ?? response.status;
      observations.push({ id: fault.id, kind: "response", format: fault.format, label: fault.label, arrived: true,
        nativeStatus: response.status, injectedStatus: status, nativeContentType: response.headers.get("content-type"),
        injectedContentType: headers.get("content-type"), digestHeaderPresent: headers.has("x-receipt-sha256"),
        nativeBytes: originalBytes.byteLength, injectedBytes: bytes.byteLength, bodyChanged: bytes !== originalBytes });
      return new Response([204,205,304].includes(status) ? null : bytes, { status, headers });
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
async function arm(page, spec) { return page.evaluate(value => window.__receiptFaults.arm(value), spec); }
async function armDigest(page, mode = "hold") { return page.evaluate(value => window.__receiptFaults.armDigest(value), mode); }
async function rejected(page) {
  await page.waitForFunction(() => document.getElementById("rr-actions").hidden && !document.getElementById("rr-access").hidden
    && document.getElementById("rr-client-status").textContent && !document.getElementById("rr-client-status").textContent.startsWith("Checking"));
}
async function noOutput(page, downloads, label) {
  const state = await page.evaluate(() => window.__receiptFaults.state());
  check(label, downloads.length === 0 && state.objectUrls === 0 && state.prints.length === 0);
}

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
async function scenario(name, run, { pair = false, boundary = false, title } = {}) {
  scenarioName = name;
  const fixtures = [await prepared({ boundary, title })]; if (pair) fixtures.push(await prepared({ title: "A Different Protected Harbor" }));
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
      faults: await Promise.all(context.pages().map(page => page.evaluate(() => { const state = window.__receiptFaults.state();
        return { observations: state.observations, pendingCount: state.pending.length, printCount: state.prints.length, objectUrlCount: state.objectUrls, digests: state.digests }; }))),
      fixtures: fixtures.map((f, index) => ({ canonicalRevisions: f.count("receipt_revisions"), setupProviderCalls: snapshots[index].providerCalls,
        additionalProviderCalls: f.providerCalls.length - snapshots[index].providerCalls, additionalDatabaseWrites: f.totalChanges() - snapshots[index].writes })) });
    console.log(JSON.stringify({ scenario: name, passed: checks.filter(row => row.scenario === name).length }));
  } finally {
    for (const page of context.pages()) await page.evaluate(() => window.__receiptFaults?.releaseAll()).catch(() => {});
    await routing.settle(); await context.close(); for (const f of fixtures) f.close();
  }
}

try {
  await scenario("valid_native_receipt_print_and_verified_utf8_export", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f);
    await arm(page, { format: "html", label: "valid quoted UTF-8 HTML media", contentType: 'Text/HTML; Charset="UTF-8"' });
    await open(page, f.token); await ready(page, f);
    check("actual UTF-8 receipt HTML remains usable with valid media parameters", (await page.locator("#rr-document").innerText()).includes("Mānoa & 海"));
    await page.locator("#rr-print").click(); await ready(page, f);
    await page.waitForFunction(() => window.__receiptFaults.state().prints.length === 1);
    check("valid print still requires a second actual HTML read", routing.receiptReads("html").length === 2
      && (await page.evaluate(() => window.__receiptFaults.state())).prints[0].includes(f.receipt().payload_hash));
    await arm(page, { format: "json", label: "valid mixed-case UTF-8 JSON media", contentType: "Application/JSON; charset=UTF-8" });
    const digest = await armDigest(page); await page.locator("#rr-export").click(); await held(page, digest);
    const pending = await page.evaluate(() => window.__receiptFaults.state());
    check("real browser SHA-256 covers exact canonical UTF-8 bytes before output", pending.digests.at(-1).sha256 === f.receipt().payload_hash
      && pending.digests.at(-1).bytes === Buffer.byteLength(f.receipt().canonical_payload_json) && pending.objectUrls === 0 && downloads.length === 0);
    check("digest validation keeps Close available and output disabled", await page.locator("#rr-lock").isEnabled()
      && await page.locator("#rr-export").isDisabled() && await page.locator("#rr-print").isDisabled());
    await page.screenshot({ path: join(directory, "receipt-digest-pending.png"), fullPage: true });
    const downloaded = page.waitForEvent("download"); await release(page, digest); const file = await downloaded, bytes = await downloadBytes(file);
    check("verified export preserves exact canonical bytes, digest and filename", bytes.equals(Buffer.from(f.receipt().canonical_payload_json))
      && sha(bytes) === f.receipt().payload_hash && file.suggestedFilename() === "rightsreceipt-sandbox.json");
    check("only the explicitly requested export creates output", downloads.length === 1
      && (await page.evaluate(() => window.__receiptFaults.state())).prints.length === 1 && routing.receiptReads("json").length === 1);
  }, { title: "Harbor After Rain: Mānoa & 海" });

  await scenario("html_success_response_contract_rejects_invalid_headers_and_metadata", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f);
    const variants = [
      { label: "partial successful status", status: 206 },
      { label: "missing media type", contentType: null },
      { label: "wrong media type", contentType: "application/json" },
      { label: "non-UTF-8 charset", contentType: "text/html; charset=iso-8859-1" },
      { label: "duplicate charset", contentType: "text/html; charset=utf-8; charset=utf-8" },
      { label: "missing receipt digest", digest: null },
      { label: "malformed receipt digest", digest: "not-a-receipt-digest" },
      { label: "missing check timestamp", htmlAttribute: { name: "data-checked-at", value: null } },
      { label: "missing boundary attribute", htmlAttribute: { name: "data-next-boundary", value: null } },
      { label: "noncanonical check timestamp", htmlAttribute: { name: "data-checked-at", value: "2026-10-27T19:00:00Z" } },
      { label: "impossible check date", htmlAttribute: { name: "data-checked-at", value: "2026-02-30T19:00:00.000Z" } },
      { label: "noncanonical boundary offset", htmlAttribute: { name: "data-next-boundary", value: "2026-11-01T00:00:00.000+00:00" } },
      { label: "duplicate protected document", duplicateDocument: true },
      { label: "wrong protected document element", tagName: "section" },
    ];
    for (const variant of variants) {
      const before = routing.receiptReads().length;
      await arm(page, { format: "html", ...variant });
      if (await page.locator("#rr-actions").isVisible()) await page.locator("#rr-refresh").click(); else await open(page, f.token);
      await rejected(page);
      check(`${variant.label}: the successful-response fault leaves no receipt or output authority`, await page.locator("#rr-document").count() === 0
        && await page.locator("#rr-token").inputValue() === "" && await page.locator("#rr-actions").isHidden());
      check(`${variant.label}: one actual read and no automatic fallback`, routing.receiptReads().length === before + 1
        && routing.receiptReads().at(-1).status === 200);
      await noOutput(page, downloads, `${variant.label}: no print or download escapes`);
      await open(page, f.token); await ready(page, f);
      check(`${variant.label}: deliberate reentry restores the real valid receipt`, routing.receiptReads().length === before + 2);
    }
  });

  await scenario("json_success_response_contract_rejects_invalid_headers_and_changed_bytes", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const variants = [
      { label: "unexpected successful status", status: 206 },
      { label: "missing JSON media type", contentType: null },
      { label: "HTML body from JSON endpoint", contentType: "text/html; charset=utf-8", body: "<!doctype html><h1>INJECTED_PRIVATE_BODY_045</h1>" },
      { label: "unsupported JSON charset", contentType: "application/json; charset=windows-1252" },
      { label: "combined JSON media", contentType: "application/json, text/html" },
      { label: "missing export digest", digest: null },
      { label: "malformed export digest", digest: "a".repeat(63) },
      { label: "uppercase export digest", digest: f.receipt().payload_hash.toUpperCase() },
      { label: "different current receipt digest", digest: "f".repeat(64) },
      { label: "wire bytes differ only by trailing newline", appendNewline: true },
    ];
    for (const variant of variants) {
      const before = routing.receiptReads("json").length;
      await arm(page, { format: "json", ...variant }); await page.locator("#rr-export").click(); await rejected(page);
      check(`${variant.label}: export failure clears the prior receipt and code`, await page.locator("#rr-document").count() === 0
        && await page.locator("#rr-token").inputValue() === "" && await page.locator("#rr-actions").isHidden());
      check(`${variant.label}: fixed recovery does not claim export or reflect the injected body`, !/Canonical JSON exported|INJECTED_PRIVATE/.test(await page.locator("#rr-client-status").innerText())
        && routing.receiptReads("json").length === before + 1 && routing.receiptReads("json").at(-1).status === 200);
      await noOutput(page, downloads, `${variant.label}: no object URL or download is released`);
      if (variant.label === "wire bytes differ only by trailing newline") {
        const state = await page.evaluate(() => window.__receiptFaults.state());
        check("digest mismatch uses actual incoming bytes rather than parsed/reserialized JSON", state.digests.at(-1).sha256 === sha(Buffer.from(f.receipt().canonical_payload_json + "\n"))
          && state.digests.at(-1).sha256 !== f.receipt().payload_hash);
        await page.setViewportSize({ width: 390, height: 844 });
        check("mobile response rejection remains readable without horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: join(directory, "receipt-invalid-response-recovery-mobile.png"), fullPage: true });
      }
      await open(page, f.token); await ready(page, f);
    }
  });

  await scenario("json_envelope_and_size_faults_fail_with_matching_synthetic_digest_headers", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f);
    const canonical = JSON.parse(f.receipt().canonical_payload_json);
    const wrongSchema = { ...canonical, schema_version: "unexpected-receipt-v0" };
    const missingSection = { ...canonical }; delete missingSection.quote;
    const variants = [
      { label: "invalid JSON syntax", body: '{"INJECTED_PRIVATE_JSON_045":' },
      { label: "wrong receipt schema", body: JSON.stringify(wrongSchema) },
      { label: "missing receipt material section", body: JSON.stringify(missingSection) },
      { label: "non-object JSON envelope", body: "null" },
      { label: "invalid UTF-8 bytes", rawBytes: [255,254,123,125] },
      { label: "empty canonical body", body: "" },
      { label: "body above canonical byte limit", body: " ".repeat(262145) },
    ];
    for (const variant of variants) {
      const bytes = variant.rawBytes ? Buffer.from(variant.rawBytes) : Buffer.from(variant.body), digest = sha(bytes);
      // Deliberately pair an otherwise valid native HTML view with this injected
      // digest header, isolating envelope/size rejection from view-hash mismatch.
      await arm(page, { format: "html", label: variant.label + " paired HTML digest", digest });
      await open(page, f.token); await ready(page, f);
      const before = routing.receiptReads("json").length;
      await arm(page, { format: "json", ...variant, digest }); await page.locator("#rr-export").click(); await rejected(page);
      check(`${variant.label}: matching supplied digests do not authorize malformed export content`, await page.locator("#rr-document").count() === 0
        && await page.locator("#rr-actions").isHidden() && routing.receiptReads("json").length === before + 1);
      check(`${variant.label}: recovery never reflects response content or export success`, !/INJECTED_PRIVATE|Canonical JSON exported/.test(await page.locator("#rr-client-status").innerText()));
      await noOutput(page, downloads, `${variant.label}: no malformed download is released`);
    }
    await open(page, f.token); await ready(page, f);
    check("valid native receipt access remains recoverable after all envelope faults", await page.locator("#rr-export").isEnabled());
  });

  await scenario("a_different_valid_receipt_export_requires_its_own_current_view", async ({ fixture: f, other, context }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    await arm(page, { format: "json", label: "separately valid other receipt", body: other.receipt().canonical_payload_json, digest: other.receipt().payload_hash });
    await page.locator("#rr-export").click(); await rejected(page); await noOutput(page, downloads, "another valid receipt's bytes cannot use this view's output authority");
    await open(page, other.token); await ready(page, other);
    const downloaded = page.waitForEvent("download"); await page.locator("#rr-export").click(); const bytes = await downloadBytes(await downloaded);
    check("deliberate other-code reentry authorizes that actual handler's exact receipt", bytes.equals(Buffer.from(other.receipt().canonical_payload_json))
      && sha(bytes) === other.receipt().payload_hash && downloads.length === 1);
  }, { pair: true });

  await scenario("malformed_print_refresh_cannot_print_prior_receipt", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    await arm(page, { format: "html", label: "print read missing boundary metadata", htmlAttribute: { name: "data-next-boundary", value: null } });
    await page.locator("#rr-print").click(); await rejected(page); await emptyAccess(page);
    check("Print's actual recheck fails closed on malformed receipt metadata", routing.receiptReads("html").length === 2);
    await noOutput(page, downloads, "the earlier valid document is never printed after an invalid refresh");
  });

  for (const cancel of ["close", "hidden"]) {
    await scenario(`pending_digest_${cancel}_prevents_late_download`, async ({ fixture: f, context, routing }) => {
      const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
      const digest = await armDigest(page); await page.locator("#rr-export").click(); await held(page, digest);
      if (cancel === "close") await page.locator("#rr-lock").click();
      else await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
      await emptyAccess(page); await release(page, digest); await staleActions(page, routing, downloads);
      await noOutput(page, downloads, "late real digest completion cannot restore canceled output");
      if (cancel === "hidden") await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
      await open(page, f.token); await ready(page, f);
      check("digest cancellation does not strand later deliberate access", routing.receiptReads("html").length === 2);
    });
  }

  await scenario("superseded_digest_cannot_download_or_clear_new_receipt", async ({ fixture: f, other, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const digest = await armDigest(page); await page.locator("#rr-export").click(); await held(page, digest);
    await open(page, other.token); await ready(page, other); await release(page, digest);
    await noOutput(page, downloads, "late old digest produces no output under the replacement capability");
    check("late validation cannot clear or replace the new receipt", (await page.locator("#rr-document").innerText()).includes(other.receipt().payload_hash)
      && await page.locator("#rr-export").isEnabled() && routing.receiptReads("html").at(-1).fixture === 1);
  }, { pair: true });

  await scenario("digest_completion_shares_the_original_request_deadline", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const digest = await armDigest(page); await page.locator("#rr-export").click(); await held(page, digest);
    await page.clock.fastForward(15001); await emptyAccess(page);
    check("hash validation cannot extend the request beyond fifteen seconds", /timed out|deadline|too long/i.test(await page.locator("#rr-client-status").innerText()));
    await release(page, digest); await staleActions(page, routing, downloads);
    await noOutput(page, downloads, "a late digest after request timeout cannot download");
    await open(page, f.token); await ready(page, f);
    check("timeout recovery requires a deliberate fresh receipt read", routing.receiptReads("html").length === 2 && routing.receiptReads("json").length === 1);
  });

  await scenario("digest_completion_keeps_original_view_freshness", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    f.setTime(new Date(Date.parse(NOW) + 55000).toISOString()); await page.clock.fastForward(55000);
    const digest = await armDigest(page); await page.locator("#rr-export").click(); await held(page, digest);
    f.setTime(new Date(Date.parse(NOW) + 61000).toISOString()); await page.clock.fastForward(6000); await emptyAccess(page);
    await release(page, digest); await staleActions(page, routing, downloads);
    await noOutput(page, downloads, "a fresh export request cannot extend its original view's sixty-second budget");
    check("view expiry happens before this digest request's own deadline", routing.receiptReads("json").length === 1 && routing.receiptReads("html").length === 1);
  });

  await scenario("digest_completion_keeps_the_licensing_boundary", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const digest = await armDigest(page); await page.locator("#rr-export").click(); await held(page, digest);
    f.setTime("2026-11-01T00:00:01.000Z"); await page.clock.fastForward(6000); await emptyAccess(page);
    await release(page, digest); await staleActions(page, routing, downloads);
    await noOutput(page, downloads, "hash completion after the licensing boundary releases no download");
    check("the earlier licensing boundary remains authoritative during hashing", routing.receiptReads("json").length === 1 && routing.receiptReads("html").length === 1);
  }, { boundary: true });

  await scenario("digest_failure_uses_fixed_recovery_without_raw_exception", async ({ fixture: f, context }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    await armDigest(page, "reject"); await page.locator("#rr-export").click(); await rejected(page); await emptyAccess(page);
    check("digest failure does not reflect internal validation details", !/INJECTED_PRIVATE_DIGEST_DETAILS_045|Canonical JSON exported/.test(await page.locator("#rr-client-status").innerText()));
    await noOutput(page, downloads, "failed real digest completion creates no output");
    await open(page, f.token); await ready(page, f);
  });
  report.completed = true;
} catch (error) { report.failure = { scenario: scenarioName, message: error.message }; throw error; }
finally {
  await browser.close(); report.passed = checks.length;
  writeFileSync(join(directory, "receipt-response-browser-results.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ passed: report.passed, scenarios: scenarios.length, artifacts: directory }));
