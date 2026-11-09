/**
 * Receipt body byte budgets under real browser stream reads and actual native
 * handler responses. Controlled stream faults are explicitly fixture injection.
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
const directory = resolve(process.env.RR_RECEIPT_STREAM_ARTIFACTS || join(tmpdir(), "rightsreceipt-receipt-stream"));
mkdirSync(directory, { recursive: true });
const sha = value => createHash("sha256").update(value).digest("hex");
const PAGE = "/receipts/buyer", API = "/api/receipts/buyer";
const SOURCE = ["packages/receipts/src/client.ts", "packages/receipts/src/presentation.ts", "packages/receipts/src/http.ts",
  "scripts/support/transaction-browser-fixture.mjs", "scripts/support/human-consent-fixture.mjs"];
const checks = [], scenarios = [];
const report = { mode: "bounded receipt stream browser verification through actual native handlers", runtime: process.version,
  scriptSha256: sha(readFileSync(new URL(import.meta.url))),
  sourceSha256: Object.fromEntries(SOURCE.map(name => [name, sha(readFileSync(new URL(`../${name}`, import.meta.url)))])),
  limits: { json: 262144, html: 131072 },
  limitations: ["Synthetic initial request, human-reviewed terms and quote; initial intake is outside this collection",
    "Real consent, invoice, reconciliation and receipt services prepare canonical SQLite receipts using injected provider HTTP",
    "Receipt browser actions must cause zero additional provider calls or database writes after fixture setup",
    "Different-code scenarios use isolated canonical fixtures with actual capability authorization",
    "An injected fetch wrapper reads actual handler bytes before constructing a browser ReadableStream with controlled chunk boundaries and delivery",
    "Counters measure bytes delivered to the receipt reader, not network transfer, heap usage or memory exhaustion",
    "Near-limit JSON is a synthetic receipt envelope with fixture padding and paired injected digest headers, not an actual canonical service issuance",
    "Near-limit HTML appends a comment to an otherwise unchanged actual handler document",
    "Compressed-response cases inject decoded body bytes with encoded-length metadata; they do not exercise HTTP decompression",
    "Browser clocks, hidden/history events and print are controlled locally; there is no listening server, live gateway/provider, deployed Worker or D1"],
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
    if (!window.crypto?.subtle) return;
    const actualFetch = window.fetch.bind(window), actualDigest = crypto.subtle.digest.bind(crypto.subtle);
    const active = new Map(), observations = [], digests = [], prints = [];
    const createObjectURL = URL.createObjectURL.bind(URL);
    let next = null, serial = 0, objectUrls = 0;
    URL.createObjectURL = (...args) => { objectUrls++; return createObjectURL(...args); };
    window.print = () => { prints.push(document.getElementById("rr-document")?.textContent ?? ""); };
    crypto.subtle.digest = async (...args) => {
      const result = await actualDigest(...args);
      digests.push({ bytes: args[1].byteLength, sha256: [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, "0")).join("") });
      return result;
    };
    const controls = {
      arm(spec) { if (next) throw Error("A receipt stream fault is already armed."); next = { id: ++serial, ...spec }; return serial; },
      release(id) { const entry = active.get(id); if (entry) { active.delete(id); entry.release(); } },
      releaseAll() { for (const [id] of active) controls.release(id); next = null; },
      state() { return { observations: observations.map(row => ({ ...row })), digests: digests.map(row => ({ ...row })),
        pending: [...active.keys()], prints: [...prints], objectUrls }; },
    };
    Object.defineProperty(window, "__receiptStreams", { value: controls });
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      const fault = url.pathname === "/api/receipts/buyer" && next?.format === url.searchParams.get("format") ? next : null;
      if (fault) next = null;
      const response = await actualFetch(input, fault ? { ...init, signal: undefined } : init);
      if (!fault) return response;
      const original = new Uint8Array(await response.arrayBuffer()), headers = new Headers(response.headers);
      let bytes = Object.hasOwn(fault, "body") ? new TextEncoder().encode(fault.body) : original;
      if (fault.targetBytes) {
        if (fault.format !== "html" || fault.targetBytes < bytes.byteLength + 7) throw Error("Invalid HTML padding fixture.");
        const padding = new TextEncoder().encode("<!--" + "x".repeat(fault.targetBytes - bytes.byteLength - 7) + "-->");
        const padded = new Uint8Array(fault.targetBytes); padded.set(bytes); padded.set(padding, bytes.byteLength); bytes = padded;
      }
      if (fault.digest) headers.set("x-receipt-sha256", fault.digest);
      if (Object.hasOwn(fault, "length")) {
        if (fault.length === null) headers.delete("content-length"); else headers.set("content-length", String(fault.length));
      } else headers.set("content-length", String(bytes.byteLength));
      if (fault.encoding) headers.set("content-encoding", fault.encoding); else headers.delete("content-encoding");
      const observed = { id: fault.id, format: fault.format, label: fault.label, nativeBytes: original.byteLength,
        suppliedBytes: bytes.byteLength, declaredLength: headers.get("content-length"), encoding: headers.get("content-encoding"),
        arrived: true, acquired: 0, reads: 0, deliveredBytes: 0, deliveredChunks: 0, producedBytes: 0,
        readerDone: false, completed: false, cancelCalls: 0, sourceCancelCalls: 0, releaseCalls: 0, released: false,
        convenienceCalls: 0, aborted: init.signal?.aborted ?? false, pending: false };
      observations.push(observed);
      init.signal?.addEventListener("abort", () => { observed.aborted = true; }, { once: true });
      let offset = 0, chunk = 0, canceled = false, released = false, wake = null;
      const stream = new ReadableStream({
        async pull(controller) {
          if (!released && fault.stallAfter !== undefined && offset >= fault.stallAfter) {
            observed.pending = true;
            await new Promise(done => {
              wake = done;
              active.set(fault.id, { release() {
                observed.releaseCalls++; observed.released = true; released = true; observed.pending = false; done();
              } });
            });
          }
          if (canceled) return;
          if (fault.readErrorAfter !== undefined && offset >= fault.readErrorAfter) {
            controller.error(Error("INJECTED_PRIVATE_STREAM_ERROR_046")); return;
          }
          if (offset >= bytes.byteLength) { controller.close(); return; }
          const sizes = fault.chunks || [65536], size = sizes[chunk++ % sizes.length];
          const end = Math.min(offset + size, bytes.byteLength);
          controller.enqueue(bytes.slice(offset, end)); observed.producedBytes += end - offset; offset = end;
          if (offset === bytes.byteLength && fault.stallAfter === undefined) controller.close();
        },
        cancel() { observed.sourceCancelCalls++; canceled = true; observed.pending = false; if (wake) wake(); },
      }, { highWaterMark: 0 });
      const actualGetReader = stream.getReader.bind(stream), actualCancel = stream.cancel.bind(stream);
      function cancel(action) {
        observed.cancelCalls++;
        if (fault.cancel === "ignore") return Promise.resolve();
        const pending = action();
        if (fault.cancel === "reject") { pending.catch(() => {}); return Promise.reject(Error("INJECTED_PRIVATE_CANCEL_ERROR_046")); }
        if (fault.cancel === "stall") { pending.catch(() => {}); return new Promise(() => {}); }
        return pending;
      }
      stream.cancel = reason => cancel(() => actualCancel(reason));
      stream.getReader = (...args) => {
        observed.acquired++;
        const reader = actualGetReader(...args);
        return {
          async read() {
            observed.reads++;
            const item = await reader.read();
            if (item.done) { observed.readerDone = true; observed.completed = observed.deliveredBytes === bytes.byteLength; }
            else { observed.deliveredBytes += item.value.byteLength; observed.deliveredChunks++; }
            return item;
          },
          cancel: reason => cancel(() => reader.cancel(reason)),
          releaseLock() { reader.releaseLock(); },
        };
      };
      const injected = new Response(stream, { status: response.status, headers });
      for (const method of ["text", "blob", "arrayBuffer", "json"]) injected[method] = () => {
        observed.convenienceCalls++; throw Error("A protected receipt must use bounded stream reads.");
      };
      return injected;
    };
  });
}

async function pageFor(context, fixture) {
  const page = await context.newPage(); await page.clock.install({ time: fixture.now() });
  const downloads = []; page.on("download", download => downloads.push(download));
  await page.goto(ORIGIN + PAGE, { waitUntil: "domcontentloaded" }); return { page, downloads };
}
async function open(page, code) {
  if (await page.locator("#rr-token").isHidden()) await page.locator("#rr-lock").click();
  await page.locator("#rr-token").fill(code); await page.locator("#rr-token").press("Enter");
}
async function ready(page, fixture) {
  await page.waitForFunction(hash => document.getElementById("rr-document")?.textContent.includes(hash)
    && !document.getElementById("rr-export").disabled && !document.getElementById("rr-print").disabled, fixture.receipt().payload_hash);
}
async function arm(page, spec) { return page.evaluate(value => window.__receiptStreams.arm(value), spec); }
async function state(page) { return page.evaluate(() => window.__receiptStreams.state()); }
async function observation(page, id) { return (await state(page)).observations.find(row => row.id === id); }
async function held(page, id) { await page.waitForFunction(wanted => window.__receiptStreams.state().observations.some(row => row.id === wanted && row.pending), id); }
async function release(page, id) {
  await page.evaluate(wanted => window.__receiptStreams.release(wanted), id); await page.clock.runFor(1);
  await page.evaluate(async () => { await Promise.resolve(); await Promise.resolve(); });
}
async function rejected(page) {
  await page.waitForFunction(() => document.getElementById("rr-actions").hidden && !document.getElementById("rr-access").hidden
    && document.getElementById("rr-client-status").textContent && !document.getElementById("rr-client-status").textContent.startsWith("Checking"));
}
async function emptyAccess(page, downloads) {
  await rejected(page);
  check("failure clears protected content, retained code and output authority", await page.locator("#rr-document").count() === 0
    && await page.locator("#rr-token").inputValue() === "" && await page.locator("#rr-actions").isHidden());
  const current = await state(page);
  check("failure releases no print or object URL or download", current.prints.length === 0 && current.objectUrls === 0 && downloads.length === 0);
  check("recovery uses fixed copy without stream or cancellation details", !/INJECTED_PRIVATE|Canonical JSON exported/.test(await page.locator("#rr-client-status").innerText()));
}
async function downloadBytes(download) {
  const chunks = [], stream = await download.createReadStream(); for await (const chunk of stream) chunks.push(chunk); return Buffer.concat(chunks);
}
function paddedEnvelope(canonical, size) {
  const value = { ...JSON.parse(canonical), fixture_stream_padding: "" };
  const needed = size - Buffer.byteLength(JSON.stringify(value)); assert.ok(needed >= 0);
  value.fixture_stream_padding = "x".repeat(needed);
  const bytes = Buffer.from(JSON.stringify(value)); assert.equal(bytes.byteLength, size); return bytes;
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
    for (const page of context.pages()) await page.evaluate(() => window.__receiptStreams.releaseAll());
    await routing.settle(); assert.deepEqual(routing.errors, []);
    check("receipt browser actions add no provider calls or database writes", fixtures.every((f, index) =>
      f.totalChanges() === snapshots[index].writes && f.providerCalls.length === snapshots[index].providerCalls));
    check("browser receipt requests are read-only and keep private codes out of URLs", fixtures.every(f => f.requests.filter(row => row.browser).every(row =>
      row.method === "GET" && !fixtures.some(other => row.requestUrl.includes(other.token)) && !new URL(row.requestUrl).hash)));
    for (const page of context.pages()) {
      check("private codes stay out of the page, persistent storage and cookies", !(await page.content()).match(fixtures.map(f => f.token).join("|"))
        && await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0)
        && (await context.cookies()).every(cookie => !fixtures.some(f => cookie.value.includes(f.token))));
      check("instrumented receipt reads never use a complete-body convenience method", (await state(page)).observations.every(row => row.convenienceCalls === 0));
    }
    scenarios.push({ name, receiptReads: routing.receiptReads(), browserRequests: routing.attempts.length,
      streams: await Promise.all(context.pages().map(async page => { const current = await state(page); return {
        observations: current.observations, pendingCount: current.pending.length, printCount: current.prints.length,
        objectUrlCount: current.objectUrls, digests: current.digests }; })),
      fixtures: fixtures.map((f, index) => ({ canonicalRevisions: f.count("receipt_revisions"), setupProviderCalls: snapshots[index].providerCalls,
        additionalProviderCalls: f.providerCalls.length - snapshots[index].providerCalls, additionalDatabaseWrites: f.totalChanges() - snapshots[index].writes })) });
    console.log(JSON.stringify({ scenario: name, passed: checks.filter(row => row.scenario === name).length }));
  } finally {
    for (const page of context.pages()) await page.evaluate(() => window.__receiptStreams?.releaseAll()).catch(() => {});
    await routing.settle(); await context.close(); for (const f of fixtures) f.close();
  }
}

try {
  await scenario("native_utf8_bytes_survive_irregular_stream_chunks", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f);
    const html = await arm(page, { format: "html", label: "native HTML split across UTF-8 sequences", chunks: [1,2,3,257], length: null });
    await open(page, f.token); await ready(page, f);
    check("native receipt text survives byte boundaries inside Unicode characters", (await page.locator("#rr-document").innerText()).includes("Mānoa & 海"));
    const json = await arm(page, { format: "json", label: "native JSON split across UTF-8 sequences", chunks: [1,2,3,257], length: null });
    const event = page.waitForEvent("download"); await page.locator("#rr-export").click(); const downloaded = await event, bytes = await downloadBytes(downloaded);
    check("native canonical export remains byte-exact and keeps its digest and filename", bytes.equals(Buffer.from(f.receipt().canonical_payload_json))
      && sha(bytes) === f.receipt().payload_hash && downloaded.suggestedFilename() === "rightsreceipt-sandbox.json");
    const a = await observation(page, html), b = await observation(page, json);
    check("both native streams complete through multiple bounded reads", a.completed && b.completed && a.deliveredChunks > 20 && b.deliveredChunks > 20
      && a.deliveredBytes === a.nativeBytes && b.deliveredBytes === b.nativeBytes && a.cancelCalls === 0 && b.cancelCalls === 0);
    await page.locator("#rr-print").click(); await ready(page, f); await page.waitForFunction(() => window.__receiptStreams.state().prints.length === 1);
    check("bounded export leaves a fresh independently checked print usable", downloads.length === 1 && routing.receiptReads("html").length === 2
      && (await state(page)).prints[0].includes(f.receipt().payload_hash));
  }, { title: "Harbor After Rain: Mānoa & 海" });

  await scenario("synthetic_valid_envelope_near_and_at_json_ceiling", async ({ fixture: f, context }) => {
    const { page, downloads } = await pageFor(context, f);
    for (const size of [262143,262144]) {
      const bytes = paddedEnvelope(f.receipt().canonical_payload_json, size), digest = sha(bytes);
      await arm(page, { format: "html", label: "paired synthetic size fixture digest", digest });
      await open(page, f.token); await ready(page, f);
      const id = await arm(page, { format: "json", label: `synthetic envelope of ${size} bytes`, body: bytes.toString(), digest,
        chunks: [1,8191,32768], length: size === 262143 ? null : "000262144" });
      const event = page.waitForEvent("download"); await page.locator("#rr-export").click(); const exported = await downloadBytes(await event);
      check(`${size} byte well-formed envelope survives streaming without reserialization`, exported.equals(bytes) && sha(exported) === digest);
      const observed = await observation(page, id);
      check(`${size} byte stream completes within the permitted decoded budget`, observed.completed && observed.deliveredBytes === size
        && observed.deliveredChunks > 2 && observed.cancelCalls === 0);
    }
    check("only the two deliberately requested envelope exports occur", downloads.length === 2 && (await state(page)).objectUrls === 2);
  });

  await scenario("actual_html_with_comment_padding_near_and_at_ceiling", async ({ fixture: f, context }) => {
    const { page } = await pageFor(context, f);
    for (const size of [131071,131072]) {
      const id = await arm(page, { format: "html", label: `actual HTML plus comment to ${size} bytes`, targetBytes: size,
        chunks: [13,4093,32768], length: size === 131071 ? null : size });
      await open(page, f.token); await ready(page, f);
      const observed = await observation(page, id);
      check(`${size} byte HTML completes without changing the protected receipt`, observed.completed && observed.deliveredBytes === size
        && observed.cancelCalls === 0 && (await page.locator("#rr-document").innerText()).includes(f.receipt().payload_hash));
      check(`${size} byte HTML keeps print and export available`, await page.locator("#rr-print").isEnabled() && await page.locator("#rr-export").isEnabled());
    }
  });

  await scenario("impossible_declared_lengths_cancel_before_body_reads", async ({ fixture: f, context }) => {
    const { page, downloads } = await pageFor(context, f);
    for (const format of ["html", "json"]) {
      for (const length of [0, format === "html" ? 131073 : 262145, "-1", "1.5", "1e3", "9007199254740992", "2, 2"]) {
        if (format === "json") { await open(page, f.token); await ready(page, f); }
        const id = await arm(page, { format, label: `impossible ${format} declared length ${length}`, length, chunks: [1] });
        if (format === "json") await page.locator("#rr-export").click(); else await open(page, f.token);
        await rejected(page);
        const observed = await observation(page, id);
        check(`${format} length ${length} rejects without consuming supplied body bytes`, observed.reads === 0 && observed.deliveredBytes === 0
          && observed.cancelCalls >= 1 && observed.aborted);
        check(`${format} length ${length} clears document and private code`, await page.locator("#rr-document").count() === 0
          && await page.locator("#rr-token").inputValue() === "");
      }
    }
    await emptyAccess(page, downloads);
    await open(page, f.token); await ready(page, f);
    check("declared-length rejection remains recoverable by deliberate valid access", await page.locator("#rr-export").isEnabled());
  });

  await scenario("identity_length_must_match_actual_delivered_bytes", async ({ fixture: f, context }) => {
    const { page, downloads } = await pageFor(context, f), size = Buffer.byteLength(f.receipt().canonical_payload_json);
    for (const length of [size - 1, size + 1]) {
      await open(page, f.token); await ready(page, f);
      const id = await arm(page, { format: "json", label: "identity length disagrees with actual bytes", length, chunks: [257], encoding: "identity" });
      await page.locator("#rr-export").click(); await rejected(page);
      const observed = await observation(page, id);
      check(`declared ${length} rejects before hashing or output`, observed.deliveredBytes === size && observed.cancelCalls >= 1
        && (await state(page)).digests.length === 0);
      check(`declared ${length} distinguishes extra bytes from truncated EOF`, observed.readerDone === (length > size));
    }
    await emptyAccess(page, downloads);
  });

  await scenario("encoded_length_metadata_does_not_replace_decoded_byte_budget", async ({ fixture: f, context }) => {
    const { page, downloads } = await pageFor(context, f);
    for (const length of ["0", "17", "900000"]) {
      const html = await arm(page, { format: "html", label: "decoded HTML with encoded-length metadata", encoding: "gzip", length, chunks: [1021] });
      await open(page, f.token); await ready(page, f);
      const json = await arm(page, { format: "json", label: "decoded JSON with encoded-length metadata", encoding: "br", length, chunks: [1021] });
      const event = page.waitForEvent("download"); await page.locator("#rr-export").click(); const bytes = await downloadBytes(await event);
      check(`encoded length ${length} permits exact bounded decoded canonical bytes`, bytes.equals(Buffer.from(f.receipt().canonical_payload_json))
        && (await observation(page, html)).completed && (await observation(page, json)).completed);
    }
    check("encoded-length fixtures produce exactly their three requested downloads", downloads.length === 3);
  });

  for (const format of ["html", "json"]) {
    await scenario(`chunked_${format}_overflow_cancels_before_complete_body`, async ({ fixture: f, context }) => {
      const { page, downloads } = await pageFor(context, f), limit = format === "html" ? 131072 : 262144;
      const body = format === "json" ? paddedEnvelope(f.receipt().canonical_payload_json, limit + 131073).toString() : undefined;
      const digest = body ? sha(body) : undefined;
      if (format === "json") { await arm(page, { format: "html", label: "paired oversized JSON fixture digest", digest }); await open(page, f.token); await ready(page, f); }
      const id = await arm(page, { format, label: "oversized decoded chunk stream", ...(body ? { body, digest } : { targetBytes: limit + 131073 }),
        length: format === "json" ? "17" : null, ...(format === "json" ? { encoding: "gzip" } : {}), chunks: [65536] });
      if (format === "json") await page.locator("#rr-export").click(); else await open(page, f.token);
      await emptyAccess(page, downloads);
      const observed = await observation(page, id);
      check("overflow stops at the first chunk exceeding the decoded ceiling", observed.deliveredBytes === limit + 65536
        && observed.producedBytes === observed.deliveredBytes && observed.deliveredBytes < observed.suppliedBytes && !observed.completed);
      check("overflow cancels its reader and request without later hash work", observed.cancelCalls >= 1 && observed.sourceCancelCalls === 1
        && observed.aborted && (await state(page)).digests.length === 0);
      if (format === "html") {
        await page.setViewportSize({ width: 390, height: 844 });
        check("mobile overflow recovery stays within its viewport", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: join(directory, "receipt-stream-overflow-recovery-mobile.png"), fullPage: true });
      }
      await open(page, f.token); await ready(page, f);
      check("overflow recovery leaves deliberate valid reentry usable", await page.locator("#rr-export").isEnabled());
    });
  }

  await scenario("oversized_single_chunk_is_rejected_without_more_reads", async ({ fixture: f, context }) => {
    const { page, downloads } = await pageFor(context, f);
    const id = await arm(page, { format: "html", label: "one incoming chunk above HTML cap", targetBytes: 393216, chunks: [262144], length: null });
    await open(page, f.token); await emptyAccess(page, downloads);
    const observed = await observation(page, id);
    check("an oversized incoming chunk is refused without requesting its remainder", observed.reads === 1 && observed.deliveredBytes === 262144
      && observed.producedBytes === 262144 && observed.cancelCalls >= 1 && !observed.completed);
  });

  await scenario("stalled_partial_html_shares_request_deadline", async ({ fixture: f, context, routing }) => {
    const { page, downloads } = await pageFor(context, f);
    const id = await arm(page, { format: "html", label: "partial HTML then stalled reader", chunks: [257], stallAfter: 257 });
    await open(page, f.token); await held(page, id);
    check("partial receipt content stays unavailable during a stalled body", await page.locator("#rr-document").count() === 0
      && await page.locator("#rr-lock").isEnabled() && await page.locator("#rr-export").isDisabled());
    await page.screenshot({ path: join(directory, "receipt-stream-pending-close.png"), fullPage: true });
    await page.clock.fastForward(15001); await emptyAccess(page, downloads);
    const observed = await observation(page, id);
    check("request deadline cancels an incomplete reader and retains fixed timeout copy", observed.cancelCalls >= 1 && observed.sourceCancelCalls === 1
      && observed.deliveredBytes === 257 && observed.aborted && /timed out/i.test(await page.locator("#rr-client-status").innerText()));
    await release(page, id); await page.clock.fastForward(60000);
    check("late stalled delivery causes no automatic retry or protected output", routing.receiptReads().length === 1
      && await page.locator("#rr-document").count() === 0 && (await state(page)).objectUrls === 0);
    await open(page, f.token); await ready(page, f);
  });

  await scenario("stalled_export_keeps_earlier_licensing_boundary", async ({ fixture: f, context }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const id = await arm(page, { format: "json", label: "partial JSON stalled across licensing boundary", chunks: [257], stallAfter: 257, cancel: "ignore" });
    await page.locator("#rr-export").click(); await held(page, id);
    f.setTime("2026-11-01T00:00:01.000Z"); await page.clock.fastForward(6000); await emptyAccess(page, downloads);
    const observed = await observation(page, id);
    check("the earlier licensing boundary requests reader cancellation before fifteen seconds", observed.cancelCalls >= 1 && observed.deliveredBytes === 257
      && observed.aborted && /checked again/i.test(await page.locator("#rr-client-status").innerText()));
    await release(page, id);
    check("a cancellation-ignoring source cannot hash or export its late chunk", (await observation(page, id)).producedBytes > (await observation(page, id)).deliveredBytes
      && (await state(page)).digests.length === 0 && (await state(page)).objectUrls === 0 && await page.locator("#rr-document").count() === 0);
  }, { boundary: true });

  await scenario("closed_partial_export_cannot_overwrite_new_capability", async ({ fixture: f, other, context }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const id = await arm(page, { format: "json", label: "late JSON read ignores cancel", chunks: [257], stallAfter: 257, cancel: "ignore" });
    await page.locator("#rr-export").click(); await held(page, id); await page.locator("#rr-lock").click(); await emptyAccess(page, downloads);
    await open(page, other.token); await ready(page, other); await release(page, id);
    const observed = await observation(page, id);
    check("Close requests reader cancellation even when transport ignores it", observed.cancelCalls >= 1 && observed.aborted && observed.released
      && observed.producedBytes > observed.deliveredBytes);
    check("late read cannot replace the new document or release old output", (await page.locator("#rr-document").innerText()).includes(other.receipt().payload_hash)
      && await page.locator("#rr-export").isEnabled() && (await state(page)).objectUrls === 0 && (await state(page)).digests.length === 0);
  }, { pair: true });

  await scenario("replaced_partial_html_cannot_clear_winning_receipt", async ({ fixture: f, other, context }) => {
    const { page } = await pageFor(context, f);
    const id = await arm(page, { format: "html", label: "superseded HTML read ignores cancel", chunks: [257], stallAfter: 257, cancel: "ignore" });
    await open(page, f.token); await held(page, id); await open(page, other.token); await ready(page, other); await release(page, id);
    check("code replacement cancels the old reader and retains the winning capability", (await observation(page, id)).cancelCalls >= 1
      && (await observation(page, id)).producedBytes > (await observation(page, id)).deliveredBytes
      && (await page.locator("#rr-document").innerText()).includes(other.receipt().payload_hash) && await page.locator("#rr-export").isEnabled());
    await page.locator("#rr-refresh").click(); await ready(page, other);
    check("late superseded body cannot strand later refresh", (await page.locator("#rr-document").innerText()).includes("A Different Protected Harbor"));
  }, { pair: true });

  await scenario("reader_cancellation_failures_do_not_block_private_recovery", async ({ fixture: f, context }) => {
    const { page, downloads } = await pageFor(context, f);
    for (const cancel of ["reject", "stall"]) {
      const id = await arm(page, { format: "html", label: `${cancel} reader cancellation completion`, chunks: [257], stallAfter: 257, cancel });
      await open(page, f.token); await held(page, id); await page.locator("#rr-lock").click(); await emptyAccess(page, downloads);
      check(`${cancel} cancellation completion does not retain body access`, (await observation(page, id)).cancelCalls >= 1
        && (await observation(page, id)).aborted);
      await release(page, id); await open(page, f.token); await ready(page, f);
      check(`${cancel} cancellation completion does not prevent new access`, await page.locator("#rr-export").isEnabled());
    }
  });

  await scenario("stream_error_after_partial_bytes_uses_fixed_recovery", async ({ fixture: f, context }) => {
    const { page, downloads } = await pageFor(context, f); await open(page, f.token); await ready(page, f);
    const id = await arm(page, { format: "json", label: "reader fails after partial native JSON", chunks: [257], readErrorAfter: 257 });
    await page.locator("#rr-export").click(); await emptyAccess(page, downloads);
    const observed = await observation(page, id);
    check("partial read failure cancels access before JSON parsing or digest", observed.deliveredBytes === 257 && observed.aborted
      && (await state(page)).digests.length === 0);
    await open(page, f.token); await ready(page, f);
  });
  report.completed = true;
} catch (error) { report.failure = { scenario: scenarioName, message: error.message }; throw error; }
finally {
  await browser.close(); report.passed = checks.length;
  writeFileSync(join(directory, "receipt-stream-browser-results.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ passed: report.passed, scenarios: scenarios.length, artifacts: directory }));
