/**
 * Receipt access session boundaries using the actual client in a deterministic VM.
 * The DOM, parsed receipt markup, clocks and transport below are synthetic. This
 * collection verifies client ownership, cancellation and response contracts.
 * Real SHA-256 checks byte agreement, not handler authorization, receipt-chain
 * or business-source integrity, browser layout or live network/provider behavior.
 */
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { RECEIPT_CLIENT_JS } from "../packages/receipts/src/client.ts";

const FIRST = "a".repeat(43), SECOND = "b".repeat(43), THIRD = "c".repeat(43);
const AT = Date.parse("2026-10-28T12:00:00.000Z");
const flush = () => new Promise(resolve => setImmediate(resolve));
const sha256 = value => createHash("sha256").update(value).digest("hex");
function receiptJson(change = {}) {
  const value = {
    schema_version: "rightsreceipt-receipt-v1", revision_number: 1,
    receipt_chain_id: "30000000-0000-4000-8000-000000000002", case_id: "30000000-0000-4000-8000-000000000001",
    verification_public_id: "R".repeat(32), created_at: new Date(AT).toISOString(), previous_revision_hash: null,
    material_sha256: sha256("synthetic material"), audit_anchor: { event_count: 0, root_sha256: sha256("[]"), events: [] },
    asset: { title: "Synthetic receipt", asset_type: "photograph", fingerprint_sha256: "f".repeat(64) },
    creator: { display_name: "Synthetic Creator" }, buyer: { organization_display_name: "Synthetic Buyer" },
    terms: { use_purpose: "commercial", channels: ["instagram_paid"], paid_advertising: true, territories: ["US"],
      start_date: "2026-10-28", duration_days: 1, max_impressions: 1000, exclusivity: "non_exclusive",
      modification_scope: "crop_only", attribution: "required", sublicensing: "prohibited", ai_use: "prohibited" },
    period: { start_date: "2026-10-28", last_permitted_date: "2026-10-28", end_date_exclusive: "2026-10-29" },
    quote: { amount_cents: 42500, currency: "USD", pricing_policy_version: 1, line_items: [] },
    consent: { creator_approval_at: new Date(AT).toISOString(), buyer_acceptance_at: new Date(AT).toISOString(), acceptance_copy_version: "buyer-v1" },
    ai_provenance: { extractor_version: "synthetic" }, payment: { provider: "paypal", environment: "sandbox", payment_status: "paid" },
    permission: { permission_state: "active" }, ...change,
  };
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
  return JSON.stringify(sort(value));
}
const GOOD_RECEIPT = receiptJson({ asset: { title: "Exact bytes: Hawaiʻi / café / 日本語" } });
function bytesOf(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function html(label, checkedAt = AT, boundary = AT + 3600000) {
  return `<main id="rr-document" data-checked-at="${new Date(checkedAt).toISOString()}" data-next-boundary="${boundary === null ? "" : new Date(boundary).toISOString()}">${label}</main>`;
}
// A demand-driven reader can deliberately ignore cancellation, fail cancellation
// or finish late. Metrics count chunks delivered to the client, not heap usage.
function streamBody(parts, { cancel, onRead, raw = false } = {}) {
  let index = 0;
  const metrics = { acquired: 0, reads: 0, chunks: 0, bytes: 0, canceled: 0, released: 0, ended: false };
  const reader = {
    async read() {
      metrics.reads++; onRead?.();
      if (index >= parts.length) { metrics.ended = true; return { done: true }; }
      const part = parts[index++], supplied = await (typeof part === "function" ? part() : part);
      if (raw) return supplied;
      const value = new Uint8Array(bytesOf(supplied));
      metrics.chunks++; metrics.bytes += value.byteLength;
      return { value, done: false };
    },
    cancel(reason) { metrics.canceled++; return cancel ? cancel(reason) : Promise.resolve(); },
    releaseLock() { metrics.released++; },
  };
  return { body: { getReader() { metrics.acquired++; return reader; }, cancel: reason => reader.cancel(reason) }, metrics };
}
function byteChunks(value, size = 65536) {
  const bytes = new Uint8Array(bytesOf(value)), chunks = [];
  for (let at = 0; at < bytes.byteLength; at += size) chunks.push(bytes.slice(at, at + size));
  return chunks;
}
function receiptHeaders(format, digest, extras = {}) {
  return new Headers({ "content-type": format === "json" ? "application/json" : "text/html; charset=utf-8",
    "x-receipt-sha256": digest, ...extras });
}
const LIMITS = { json: 262144, html: 131072 };
function response(value, extra = {}) {
  return { ok: true, status: 200, body: streamBody([value]).body,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    text: async () => value, blob: async () => new Blob([value], { type: "application/json" }),
    arrayBuffer: async () => extra.blob ? (await extra.blob()).arrayBuffer() : bytesOf(value), ...extra };
}
function harness({ hash = "", transport, digest, parse, receiptDigest = sha256(GOOD_RECEIPT) } = {}) {
  let wall = AT, monotonic = 0, timerId = 0, urlId = 0;
  const calls = [], timers = new Map(), events = new Map(), windowEvents = new Map(), nodes = new Map();
  const parsed = [], prints = [], downloads = [], objectUrls = new Map(), revoked = [], historyCalls = [];
  const digests = [];
  const document = { visibilityState: "visible", activeElement: null,
    getElementById(id) { return nodes.get(id) ?? null; },
    addEventListener(name, listener) { events.set(name, listener); },
    createElement(tag) { return new Node(tag); },
    importNode(node) { return node.cloneNode(true); },
  };
  class Node {
    constructor(tag = "div", id = "") {
      this.tagName = tag.toUpperCase(); this.id = id; this.value = ""; this.hidden = false;
      this.disabled = false; this.dataset = {}; this.listeners = new Map(); this.attributes = new Map();
      this.children = []; this.parentElement = null; this._text = "";
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    set textContent(value) { this._text = String(value); this.replaceChildren(); }
    get firstChild() { return this.children[0] ?? null; }
    get childElementCount() { return this.children.length; }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    focus() { document.activeElement = this; }
    append(...children) {
      for (const child of children) {
        if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(value => value !== child);
        child.parentElement = this; this.children.push(child);
      }
    }
    appendChild(child) { this.append(child); return child; }
    replaceChildren(...children) {
      for (const child of this.children) child.parentElement = null;
      this.children = []; this.append(...children);
    }
    cloneNode(deep) {
      const copy = new Node(this.tagName, this.id); copy._text = this._text; copy.dataset = { ...this.dataset };
      if (deep) copy.append(...this.children.map(child => child.cloneNode(true)));
      return copy;
    }
    click() {
      if (this.tagName === "A") downloads.push({ href: this.href, filename: this.download, blob: objectUrls.get(this.href), at: monotonic });
      return this.listeners.get("click")?.({ type: "click", target: this, preventDefault() {} });
    }
  }
  for (const id of ["rr-access-form", "rr-token", "rr-client-status", "rr-result", "rr-actions", "rr-access", "rr-refresh", "rr-lock", "rr-print", "rr-export"]) nodes.set(id, new Node(id === "rr-token" ? "input" : "div", id));
  nodes.get("rr-actions").hidden = true;
  nodes.get("rr-access").append(nodes.get("rr-access-form"));
  nodes.get("rr-access-form").append(nodes.get("rr-token"));
  for (const id of ["rr-refresh", "rr-lock", "rr-print", "rr-export"]) nodes.get("rr-actions").append(nodes.get(id));
  const window = {
    addEventListener(name, listener) { windowEvents.set(name, listener); },
    print() { prints.push({ text: nodes.get("rr-result").textContent, at: monotonic }); },
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [wall])); }
    static now() { return wall; }
  }
  const context = {
    document, window, location: { hash, pathname: "/receipts/buyer" },
    history: { replaceState(...args) { historyCalls.push(args); } },
    Date: ClockDate, performance: { now: () => monotonic }, AbortController, AbortSignal, DOMException, Error, Blob, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    crypto: { subtle: { digest(algorithm, value) {
      const row = { algorithm, bytes: bytesOf(value) }; digests.push(row);
      return digest ? digest(row, digests.length - 1) : webcrypto.subtle.digest(algorithm, row.bytes);
    } } },
    URL: { createObjectURL(blob) { const url = "blob:receipt-fixture-" + (++urlId); objectUrls.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); objectUrls.delete(url); } },
    setTimeout(fn, delay = 0) { const id = ++timerId; timers.set(id, { fn, delay, due: monotonic + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(path, init) {
      const held = deferred(), row = { path, init, ...held }; calls.push(row);
      return transport ? transport(row, calls.length - 1) : held.promise;
    },
    DOMParser: class {
      parseFromString(value) {
        parsed.push(value);
        parse?.(value);
        const mains = [];
        for (const match of value.matchAll(/<main\b([^>]*)>([\s\S]*?)<\/main>/gu)) {
          const attrs = Object.fromEntries([...match[1].matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/gu)].map(row => [row[1], row[2]]));
          if (attrs.id !== "rr-document") continue;
          const main = new Node("main", "rr-document"), child = new Node("p");
          for (const [name, value] of Object.entries(attrs)) main.setAttribute(name, value);
          if (Object.hasOwn(attrs, "data-checked-at")) main.dataset.checkedAt = attrs["data-checked-at"];
          if (Object.hasOwn(attrs, "data-next-boundary")) main.dataset.nextBoundary = attrs["data-next-boundary"];
          child.textContent = match[2]; main.append(child); mains.push(main);
        }
        return { getElementById(id) { return id === "rr-document" ? mains[0] ?? null : null; },
          querySelectorAll(selector) { return selector === "#rr-document" ? mains : []; } };
      }
    },
  };
  vm.runInNewContext(RECEIPT_CLIENT_JS, context);
  return {
    calls, timers, nodes, parsed, prints, downloads, objectUrls, revoked, historyCalls, digests,
    get text() { return nodes.get("rr-result").textContent; },
    get status() { return nodes.get("rr-client-status").textContent; },
    get now() { return wall; },
    get focused() { return document.activeElement?.id; },
    submit(value) { nodes.get("rr-token").value = value; return nodes.get("rr-access-form").listeners.get("submit")({ preventDefault() {} }); },
    click(id) { return nodes.get(id).click(); },
    hide() { document.visibilityState = "hidden"; events.get("visibilitychange")?.(); },
    show() { document.visibilityState = "visible"; events.get("visibilitychange")?.(); },
    lifecycle(name, persisted = false) { windowEvents.get(name)?.({ persisted }); },
    respond(index, value, extra = {}) {
      const json = calls[index].path.endsWith("format=json"), type = json ? "application/json" : "text/html; charset=utf-8";
      const expected = json && value ? sha256(typeof value === "string" ? value : new Uint8Array(value)) : receiptDigest;
      calls[index].resolve(response(value, { headers: new Headers({ "content-type": type, "x-receipt-sha256": expected }), ...extra }));
    },
    elapse(ms, wallDelta = ms) { monotonic += ms; wall += wallDelta; },
    async advance(ms, wallDelta = ms) {
      monotonic += ms; wall += wallDelta;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].due - b[1].due)) {
        if (timers.has(id) && timer.due <= monotonic) { timers.delete(id); timer.fn(); }
      }
      await flush();
    },
  };
}
function closed(h) {
  assert.equal(h.text, ""); assert.equal(h.nodes.get("rr-token").value, "");
  assert.equal(h.nodes.get("rr-access").hidden, false); assert.equal(h.nodes.get("rr-actions").hidden, true);
  assert.equal(h.nodes.get("rr-print").disabled, true); assert.equal(h.nodes.get("rr-export").disabled, true);
}
async function open(h, label = "Current receipt") {
  const index = h.calls.length; h.submit(FIRST); await flush();
  h.respond(index, html(label, h.now)); await flush();
  assert.equal(h.text, label); return index;
}
async function beginBody(format, value) {
  const digest = format === "json" ? sha256(typeof value === "string" ? value : new Uint8Array(value)) : sha256(GOOD_RECEIPT);
  const h = harness({ receiptDigest: digest });
  if (format === "json") await open(h); else h.submit(FIRST);
  const pending = format === "json" ? h.click("rr-export") : undefined;
  await flush(); return { h, pending, index: h.calls.length - 1, digest };
}

test("fragment access removes the URL capability and sends a protected no-store read", async () => {
  const h = harness({ hash: "#" + FIRST }); await flush();
  assert.deepEqual(h.historyCalls, [[null, "", "/receipts/buyer"]]); assert.equal(h.calls.length, 1);
  const { path, init } = h.calls[0];
  assert.equal(path, "/api/receipts/buyer?format=html"); assert.equal(init.headers.Authorization, "Bearer " + FIRST);
  for (const [key, value] of Object.entries({ cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" })) assert.equal(init[key], value);
  assert.equal(path.includes(FIRST), false); h.respond(0, html("Fragment receipt")); await flush();
  assert.equal(h.text, "Fragment receipt"); assert.equal(h.nodes.get("rr-token").value, "");
  assert.equal(h.nodes.get("rr-print").disabled, false); assert.equal(h.nodes.get("rr-export").disabled, false);
});

test("invalid access never dispatches a receipt request or grants actions", async () => {
  const h = harness(); h.submit("short"); await flush();
  assert.equal(h.calls.length, 0); assert.equal(h.text, ""); assert.match(h.status, /valid.*token/i);
  h.click("rr-print"); h.click("rr-export"); await flush();
  assert.equal(h.calls.length, 0); assert.equal(h.prints.length, 0); assert.equal(h.downloads.length, 0);
});

for (const [name, replacement] of [["same", FIRST], ["different", SECOND]]) test(`a repeated ${name} valid code replaces a held read without stranding busy`, async () => {
  const h = harness(); h.submit(FIRST); await flush();
  const old = h.calls[0]; assert.equal(h.nodes.get("rr-lock").disabled, false);
  h.submit(replacement); await flush();
  assert.equal(h.calls.length, 2); assert.equal(old.init.signal.aborted, true);
  assert.equal(h.calls[1].init.headers.Authorization, "Bearer " + replacement);
  h.respond(1, html("Replacement receipt")); await flush(); assert.equal(h.text, "Replacement receipt");
  h.respond(0, html("Late obsolete receipt")); await flush();
  assert.equal(h.text, "Replacement receipt"); assert.equal(h.parsed.length, 1);
  h.submit(THIRD); await flush(); assert.equal(h.calls.length, 3);
  h.respond(2, html("Third receipt")); await flush(); assert.equal(h.text, "Third receipt");
});

test("replacement during body consumption rejects the old body and uses the new code", async () => {
  const held = deferred(), h = harness(); h.submit(FIRST); await flush();
  h.respond(0, "", { body: streamBody([held.promise]).body }); await flush();
  h.submit(SECOND); await flush(); assert.equal(h.calls.length, 2); assert.equal(h.calls[0].init.signal.aborted, true);
  h.respond(1, html("New body")); await flush(); held.resolve(html("Late body")); await flush();
  assert.equal(h.text, "New body"); assert.equal(h.parsed.length, 1); assert.equal(h.calls.length, 2);
});

for (const kind of ["close", "hidden", "pagehide", "restored history"]) test(`${kind} cancels pending access and late completion cannot reopen it`, async () => {
  const h = harness(); h.submit(FIRST); await flush();
  if (kind === "close") h.click("rr-lock");
  else if (kind === "hidden") h.hide();
  else if (kind === "pagehide") h.lifecycle("pagehide");
  else h.lifecycle("pageshow", true);
  await flush(); assert.equal(h.calls[0].init.signal.aborted, true); closed(h);
  h.respond(0, html("Obsolete receipt")); await flush(); closed(h); assert.equal(h.parsed.length, 0);
  h.show(); h.submit(SECOND); await flush(); assert.equal(h.calls.length, 2);
  h.respond(1, html("Reopened receipt")); await flush(); assert.equal(h.text, "Reopened receipt");
});

test("an invalid replacement does not cancel the valid read already pending", async () => {
  const h = harness(); h.submit(FIRST); await flush(); h.submit("invalid"); await flush();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.signal.aborted, false);
  h.respond(0, html("Original valid read")); await flush(); assert.equal(h.text, "Original valid read");
});

test("stale completion cannot release a newer pending read or enable export and print", async () => {
  const h = harness(); h.submit(FIRST); await flush(); h.submit(SECOND); await flush();
  h.respond(0, html("Old read")); await flush();
  h.click("rr-print"); h.click("rr-export"); h.click("rr-refresh"); await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.prints.length, 0); assert.equal(h.downloads.length, 0);
  assert.equal(h.nodes.get("rr-print").disabled, true); assert.equal(h.nodes.get("rr-export").disabled, true);
  h.respond(1, html("Current read")); await flush(); assert.equal(h.text, "Current read");
});

test("unsettled headers time out, clear access and allow deliberate recovery without retrying", async () => {
  const h = harness(); h.submit(FIRST); await flush(); await h.advance(14999);
  assert.equal(h.calls[0].init.signal.aborted, false); assert.equal(h.calls.length, 1);
  await h.advance(1); closed(h); assert.equal(h.calls[0].init.signal.aborted, true); assert.match(h.status, /time|deadline/i);
  h.click("rr-refresh"); h.click("rr-print"); h.click("rr-export"); await h.advance(60000);
  assert.equal(h.calls.length, 1); assert.equal(h.prints.length, 0); assert.equal(h.downloads.length, 0);
  h.submit(SECOND); await flush(); h.respond(1, html("After timeout", h.now)); await flush();
  h.respond(0, html("Late abandoned read")); await flush(); assert.equal(h.text, "After timeout"); assert.equal(h.parsed.length, 1);
});

test("headers and body consumption share one deadline including ignored cancellation", async () => {
  const held = deferred(), h = harness(); h.submit(FIRST); await flush(); await h.advance(14000);
  h.respond(0, "", { body: streamBody([held.promise]).body }); await flush(); await h.advance(1000);
  closed(h); assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(h.calls.length, 1);
  held.resolve(html("Late text")); await flush(); closed(h); assert.equal(h.parsed.length, 0);
});

for (const stage of ["headers", "body"]) test(`a ${stage} result at the deadline is rejected even when its timeout callback is delayed`, async () => {
  const held = deferred(), h = harness(); h.submit(FIRST); await flush();
  if (stage === "body") { h.respond(0, "", { body: streamBody([held.promise]).body }); await flush(); }
  h.elapse(15000);
  if (stage === "headers") h.respond(0, html("Late response")); else held.resolve(html("Late text"));
  await flush(); closed(h); assert.equal(h.parsed.length, 0); assert.equal(h.calls[0].init.signal.aborted, true);
});

for (const [name, monotonic, wall] of [["backward wall clock", 15000, -60000], ["forward wall clock", 1, 15000]]) test(`the receipt read deadline survives a ${name} change`, async () => {
  const h = harness(); h.submit(FIRST); await flush(); h.elapse(monotonic, wall);
  h.respond(0, html("Delayed response")); await flush(); closed(h); assert.equal(h.parsed.length, 0);
});

for (const code of [404, 409, 429, 503]) test(`HTTP ${code} clears retained access and never consumes error content`, async () => {
  let consumed = 0; const h = harness(); h.submit(FIRST); await flush();
  h.respond(0, "", { ok: false, status: code,
    body: streamBody(["PRIVATE ERROR CONTENT"], { onRead() { consumed++; } }).body }); await flush();
  closed(h); assert.equal(consumed, 0); assert.equal(h.status.includes("PRIVATE ERROR"), false);
  assert.equal(h.calls[0].init.signal.aborted, true);
  h.click("rr-refresh"); await flush(); assert.equal(h.calls.length, 1);
});

test("an unexpected transport exception receives fixed recovery copy without private details", async () => {
  const h = harness(); h.submit(FIRST); await flush(); h.calls[0].reject(new Error("PRIVATE_TRANSPORT_DETAIL_044")); await flush();
  closed(h); assert.equal(h.status.includes("PRIVATE_TRANSPORT_DETAIL_044"), false); assert.equal(h.calls.length, 1);
});

for (const [name, value] of [["missing document", "<main>Unrecognized</main>"],
  ["invalid checked timestamp", '<main id="rr-document" data-checked-at="invalid" data-next-boundary="">Invalid checked time</main>'],
  ["invalid nonempty boundary", '<main id="rr-document" data-checked-at="2026-10-28T12:00:00.000Z" data-next-boundary="invalid">Invalid boundary</main>']]) test(`a receipt with ${name} cannot grant presentation authority`, async () => {
  const h = harness(); h.submit(FIRST); await flush(); h.respond(0, value); await flush(); closed(h);
  h.click("rr-print"); h.click("rr-export"); await flush(); assert.equal(h.prints.length, 0); assert.equal(h.downloads.length, 0);
});

test("print refreshes the current receipt and waits for its own successful response", async () => {
  const h = harness(); await open(h, "Earlier snapshot"); const pending = h.click("rr-print"); await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].path, "/api/receipts/buyer?format=html");
  assert.equal(h.prints.length, 0); assert.equal(h.text, "");
  h.respond(1, html("Fresh print snapshot")); await pending; await flush();
  assert.equal(h.prints.length, 1); assert.equal(h.prints[0].text, "Fresh print snapshot");
});

test("replacement while print refresh is pending cancels that print even after a new view loads", async () => {
  const h = harness(); await open(h); const pending = h.click("rr-print"); await flush();
  h.submit(SECOND); await flush(); h.respond(2, html("Other receipt")); await flush();
  h.respond(1, html("Old print response")); await pending; await flush();
  assert.equal(h.prints.length, 0); assert.equal(h.text, "Other receipt"); assert.equal(h.calls[1].init.signal.aborted, true);
});

test("JSON export preserves its exact body, and concurrent print cannot use the old presentation", async () => {
  const h = harness(); await open(h, "Export snapshot"); const pending = h.click("rr-export"); await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].path, "/api/receipts/buyer?format=json");
  h.click("rr-print"); h.click("rr-export"); h.click("rr-refresh"); await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.prints.length, 0); assert.equal(h.downloads.length, 0);
  const bytes = GOOD_RECEIPT;
  h.respond(1, bytes); await pending; await flush();
  assert.equal(h.downloads.length, 1); assert.equal(await h.downloads[0].blob.text(), bytes);
  assert.equal(h.downloads[0].filename, "rightsreceipt-sandbox.json");
  await h.advance(1000); assert.deepEqual(h.revoked, [h.downloads[0].href]);
});

for (const kind of ["close", "replacement", "hidden"]) test(`${kind} prevents an old JSON body from downloading`, async () => {
  const held = deferred(), h = harness(); await open(h); const pending = h.click("rr-export"); await flush();
  h.respond(1, "", { body: streamBody([held.promise]).body }); await flush();
  if (kind === "close") h.click("rr-lock"); else if (kind === "hidden") h.hide(); else h.submit(SECOND);
  await flush(); assert.equal(h.calls[1].init.signal.aborted, true);
  if (kind === "replacement") { h.respond(2, html("Replacement while exporting")); await flush(); }
  held.resolve('{"stale":true}'); await pending; await flush();
  assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0);
  if (kind === "replacement") assert.equal(h.text, "Replacement while exporting"); else closed(h);
});

test("the JSON body deadline clears access and cannot later release a download", async () => {
  const held = deferred(), h = harness(); await open(h); const pending = h.click("rr-export"); await flush();
  await h.advance(14000); h.respond(1, "", { body: streamBody([held.promise]).body }); await flush(); await h.advance(1000);
  await pending; closed(h); assert.equal(h.calls[1].init.signal.aborted, true);
  held.resolve('{"late":true}'); await flush(); assert.equal(h.downloads.length, 0);
});

test("the licensing boundary cancels an export whose transport ignores abort", async () => {
  const held = deferred(), h = harness(); h.submit(FIRST); await flush(); h.respond(0, html("Near boundary", AT, AT + 2000)); await flush();
  const pending = h.click("rr-export"); await flush(); h.respond(1, "", { body: streamBody([held.promise]).body }); await flush();
  await h.advance(2000); await pending; closed(h); assert.equal(h.calls[1].init.signal.aborted, true);
  held.resolve('{"expired":true}'); await flush(); assert.equal(h.downloads.length, 0);
});

test("delayed freshness timers cannot let an expired JSON body download", async () => {
  const held = deferred(), h = harness(); h.submit(FIRST); await flush(); h.respond(0, html("Near boundary", AT, AT + 2000)); await flush();
  const pending = h.click("rr-export"); await flush(); h.respond(1, "", { body: streamBody([held.promise]).body }); await flush();
  h.elapse(2000); held.resolve('{"expired":true}'); await pending; await flush();
  closed(h); assert.equal(h.downloads.length, 0);
});

test("the sixty-second freshness budget begins with the HTML request, not its eventual render", async () => {
  const h = harness(); h.submit(FIRST); await flush(); await h.advance(10000);
  h.respond(0, html("Slow initial receipt")); await flush(); await h.advance(49999); assert.equal(h.calls.length, 1);
  await h.advance(1); assert.equal(h.calls.length, 2); assert.equal(h.text, "");
  h.respond(1, html("Periodic current receipt", h.now)); await flush(); assert.equal(h.text, "Periodic current receipt");
});

test("print and export cannot start from an expired view when its refresh callback has not run", async () => {
  const h = harness(); await open(h); h.elapse(60000);
  h.click("rr-print"); h.click("rr-export"); await flush(); closed(h);
  assert.equal(h.calls.length, 1); assert.equal(h.prints.length, 0); assert.equal(h.downloads.length, 0);
});
test("Close before deferred dispatch suppresses the request and returns focus to code entry", async () => {
  const h = harness(); h.submit(FIRST); h.click("rr-lock"); await flush(); closed(h);
  assert.equal(h.calls.length, 0); assert.equal(h.parsed.length, 0); assert.equal(h.focused, "rr-token");
  h.submit(SECOND); await flush(); h.respond(0, html("After early Close")); await flush(); assert.equal(h.text, "After early Close");
});

test("replacement before deferred dispatch sends only the newest code", async () => {
  const h = harness(); h.submit(FIRST); h.submit(SECOND); await flush();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.headers.Authorization, "Bearer " + SECOND);
  h.respond(0, html("Newest request")); await flush(); assert.equal(h.text, "Newest request");
});

test("UTC midnight refreshes a current receipt even when no licensing boundary remains", async () => {
  const h = harness(); const nearMidnight = Date.parse("2026-10-28T23:59:59.000Z");
  h.elapse(nearMidnight - AT); h.submit(FIRST); await flush(); h.respond(0, html("Before midnight", h.now, null)); await flush();
  assert.equal(h.text, "Before midnight"); await h.advance(999); assert.equal(h.calls.length, 1);
  await h.advance(1); assert.equal(h.calls.length, 2); assert.equal(h.text, "");
  h.respond(1, html("Current UTC date", h.now, null)); await flush(); assert.equal(h.text, "Current UTC date");
});

test("a JSON body crossing UTC midnight is rejected even with a delayed freshness timer", async () => {
  const held = deferred(), h = harness(); const nearMidnight = Date.parse("2026-10-28T23:59:59.000Z");
  h.elapse(nearMidnight - AT); h.submit(FIRST); await flush(); h.respond(0, html("Before midnight", h.now, null)); await flush();
  const pending = h.click("rr-export"); await flush(); h.respond(1, "", { body: streamBody([held.promise]).body }); await flush();
  h.elapse(1000); held.resolve('{"yesterday":true}'); await pending; await flush();
  closed(h); assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0);
});

// Response-contract fixtures are deliberately synthetic. Hashes below are real
// SHA-256 values over the exact supplied bytes, not a substitute for server
// authorization, canonical source validation or receipt-chain verification.
for (const [name, type] of [["absent", null], ["wrong", "application/json"], ["lookalike", "text/html-extra"],
  ["unsupported charset", "text/html; charset=iso-8859-1"], ["combined media types", "text/html, application/json"]]) test(`HTML ${name} Content-Type fails before consuming private content`, async () => {
  let consumed = 0; const h = harness(); h.submit(FIRST); await flush();
  const headers = new Headers({ "x-receipt-sha256": sha256(GOOD_RECEIPT), ...(type === null ? {} : { "content-type": type }) });
  h.respond(0, "", { headers,
    body: streamBody([html("Mismatched response")], { onRead() { consumed++; } }).body });
  await flush(); closed(h); assert.equal(consumed, 0); assert.equal(h.parsed.length, 0);
  assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(h.status.includes(type), false);
});

for (const [name, type] of [["absent", null], ["HTML", "text/html; charset=utf-8"], ["lookalike", "application/json-extra"],
  ["unsupported charset", "application/json; charset=utf-16"], ["combined media types", "application/json, text/html"]]) test(`JSON endpoint ${name} Content-Type cannot release a mislabeled download`, async () => {
  let consumed = 0; const h = harness(); await open(h); const pending = h.click("rr-export"); await flush();
  const headers = new Headers({ "x-receipt-sha256": sha256(GOOD_RECEIPT), ...(type === null ? {} : { "content-type": type }) });
  h.respond(1, GOOD_RECEIPT, { headers,
    body: streamBody([GOOD_RECEIPT], { onRead() { consumed++; } }).body });
  await pending; closed(h); assert.equal(consumed, 0); assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0);
  assert.equal(h.digests.length, 0); assert.equal(h.calls[1].init.signal.aborted, true);
});

for (const status of [201, 204, 206]) test(`successful HTTP ${status} is not accepted as a complete protected receipt`, async () => {
  for (const format of ["html", "json"]) {
    let consumed = 0; const h = harness(); if (format === "json") await open(h); else h.submit(FIRST);
    const pending = format === "json" ? h.click("rr-export") : undefined; await flush();
    const index = h.calls.length - 1;
    h.respond(index, format === "json" ? GOOD_RECEIPT : html("Unexpected status"), { status,
      body: streamBody([format === "json" ? GOOD_RECEIPT : html("Unexpected status")], { onRead() { consumed++; } }).body });
    await pending; await flush(); closed(h); assert.equal(consumed, 0); assert.equal(h.downloads.length, 0); assert.equal(h.parsed.length, format === "json" ? 1 : 0);
  }
});

for (const [name, markup] of [
  ["missing checked timestamp", '<main id="rr-document" data-next-boundary="">Missing check</main>'],
  ["missing boundary attribute", '<main id="rr-document" data-checked-at="2026-10-28T12:00:00.000Z">Missing boundary</main>'],
  ["empty checked timestamp", '<main id="rr-document" data-checked-at="" data-next-boundary="">Empty check</main>'],
  ["noncanonical checked offset", html("Offset check").replace("2026-10-28T12:00:00.000Z", "2026-10-28T12:00:00.000+00:00")],
  ["checked timestamp without milliseconds", html("Short check").replace("2026-10-28T12:00:00.000Z", "2026-10-28T12:00:00Z")],
  ["normalized impossible checked date", html("Impossible check").replace("2026-10-28T12:00:00.000Z", "2026-02-30T12:00:00.000Z")],
  ["boundary timestamp without milliseconds", html("Short boundary").replace("2026-10-28T13:00:00.000Z", "2026-10-28T13:00:00Z")],
  ["whitespace-only boundary", html("Blank boundary").replace("2026-10-28T13:00:00.000Z", " ")],
  ["duplicate receipt documents", html("First document") + html("Second document")],
]) test(`HTML ${name} cannot authorize presentation or output`, async () => {
  const h = harness(); h.submit(FIRST); await flush(); h.respond(0, markup); await flush(); closed(h);
  h.click("rr-print"); h.click("rr-export"); await flush(); assert.equal(h.prints.length, 0); assert.equal(h.downloads.length, 0);
  assert.equal(h.calls.length, 1);
});

test("receipt parsing that completes after the request budget cannot grant a fresh view", async () => {
  let h; h = harness({ parse() { h.elapse(15000); } });
  h.submit(FIRST); await flush(); h.respond(0, html("Too late to render")); await flush(); closed(h);
  assert.equal(h.parsed.length, 1); assert.equal(h.downloads.length, 0); assert.equal(h.prints.length, 0);
  assert.equal(h.calls[0].init.signal.aborted, true);
});

for (const suffix of ['; charset=utf-8; charset=utf-8', '; charset="utf-8"; charset="utf-8"', '; version=1']) test(`receipt media parameter ${suffix} is not accepted`, async () => {
  for (const format of ["html", "json"]) {
    const h = harness(); if (format === "json") await open(h); else h.submit(FIRST);
    const pending = format === "json" ? h.click("rr-export") : undefined; await flush();
    const type = (format === "json" ? "application/json" : "text/html") + suffix;
    h.respond(h.calls.length - 1, format === "json" ? GOOD_RECEIPT : html("Invalid parameter"), {
      headers: new Headers({ "content-type": type, "x-receipt-sha256": sha256(GOOD_RECEIPT) }),
    });
    await pending; await flush(); closed(h); assert.equal(h.downloads.length, 0); assert.equal(h.digests.length, 0);
  }
});

test("case-insensitive media types and a single quoted UTF-8 charset preserve valid receipts", async () => {
  const h = harness(); h.submit(FIRST); await flush();
  h.respond(0, html("Valid media"), { headers: new Headers({ "content-type": 'Text/HTML; Charset="UTF-8"', "x-receipt-sha256": sha256(GOOD_RECEIPT) }) });
  await flush(); assert.equal(h.text, "Valid media");
  const pending = h.click("rr-export"); await flush();
  h.respond(1, GOOD_RECEIPT, { headers: new Headers({ "content-type": 'Application/JSON; Charset="UTF-8"', "x-receipt-sha256": sha256(GOOD_RECEIPT) }) });
  await pending; assert.equal(h.downloads.length, 1); assert.equal(await h.downloads[0].blob.text(), GOOD_RECEIPT);
  assert.equal(h.downloads[0].blob.type, "application/json");
  assert.equal(h.downloads[0].blob.size, new TextEncoder().encode(GOOD_RECEIPT).byteLength);
  assert.equal(h.digests.length, 1); assert.equal(h.digests[0].algorithm, "SHA-256");
  assert.deepEqual(new Uint8Array(h.digests[0].bytes), new TextEncoder().encode(GOOD_RECEIPT));
});

for (const [name, digest] of [["missing", null], ["short", "a".repeat(63)], ["nonhex", "g".repeat(64)],
  ["uppercase", "AB".repeat(32)], ["combined", "a".repeat(64) + ", " + "b".repeat(64)]]) test(`${name} receipt digest cannot establish HTML or export authority`, async () => {
  for (const format of ["html", "json"]) {
    let consumed = 0; const h = harness(); if (format === "json") await open(h); else h.submit(FIRST);
    const pending = format === "json" ? h.click("rr-export") : undefined; await flush();
    const headers = new Headers({ "content-type": format === "json" ? "application/json" : "text/html", ...(digest === null ? {} : { "x-receipt-sha256": digest }) });
    h.respond(h.calls.length - 1, format === "json" ? GOOD_RECEIPT : html("Bad digest"), { headers,
      body: streamBody([format === "json" ? GOOD_RECEIPT : html("Bad digest")], { onRead() { consumed++; } }).body });
    await pending; await flush(); closed(h); assert.equal(consumed, 0); assert.equal(h.downloads.length, 0); assert.equal(h.digests.length, 0);
  }
});

test("an export for a different receipt digest is rejected before its body is consumed", async () => {
  let consumed = 0; const h = harness(); await open(h); const pending = h.click("rr-export"); await flush();
  const other = receiptJson({ revision_number: 2, previous_revision_hash: sha256(GOOD_RECEIPT) });
  h.respond(1, other, { body: streamBody([other], { onRead() { consumed++; } }).body });
  await pending; closed(h); assert.equal(consumed, 0); assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0);
});

test("tampered export bytes cannot match the digest of the displayed receipt", async () => {
  const h = harness(); await open(h); const pending = h.click("rr-export"); await flush();
  const changed = receiptJson({ asset: { title: "Tampered synthetic title" } });
  h.respond(1, changed, { headers: new Headers({ "content-type": "application/json", "x-receipt-sha256": sha256(GOOD_RECEIPT) }) });
  await pending; closed(h); assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0); assert.equal(h.digests.length, 1);
  assert.equal(h.status.includes("Tampered synthetic title"), false);
});

for (const [name, bytes] of [["empty", ""], ["malformed JSON", "{malformed"], ["array root", "[]"], ["null root", "null"],
  ["wrong schema", receiptJson({ schema_version: "rightsreceipt-other-v1" })],
  ["numeric verification reference", receiptJson({ verification_public_id: "1".repeat(32) })],
  ["invalid chain identity", receiptJson({ receipt_chain_id: "not-a-uuid" })],
  ["invalid case identity", receiptJson({ case_id: "30000000-0000-1000-8000-000000000001" })],
  ["unsafe revision", receiptJson({ revision_number: Number.MAX_SAFE_INTEGER + 1 })],
  ["first revision with a predecessor", receiptJson({ previous_revision_hash: "a".repeat(64) })],
  ["later revision without a predecessor", receiptJson({ revision_number: 2 })],
  ["invalid material digest", receiptJson({ material_sha256: "short" })],
  ["invalid creation instant", receiptJson({ created_at: "2026-02-30T12:00:00.000Z" })],
  ["non-record material section", receiptJson({ terms: [] })],
  ["null audit anchor", receiptJson({ audit_anchor: null })],
]) test(`matching digest does not make ${name} a receipt export`, async () => {
  const h = harness({ receiptDigest: sha256(bytes) }); await open(h); const pending = h.click("rr-export"); await flush();
  h.respond(1, bytes); await pending; closed(h); assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0);
  assert.equal(h.status.includes(bytes), bytes.length === 0);
});

for (const [name, bytes] of [["invalid UTF-8", Uint8Array.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])],
  ["UTF-8 BOM", Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(GOOD_RECEIPT)])]]) test(`a matching digest cannot authorize JSON with ${name}`, async () => {
  const h = harness({ receiptDigest: sha256(bytes) }); await open(h); const pending = h.click("rr-export"); await flush();
  h.respond(1, bytes); await pending; closed(h); assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0);
});

test("one oversized JSON chunk is canceled before hashing or reading another chunk", async () => {
  const bytes = "x".repeat(262145), stream = streamBody([bytes, "UNREAD_PRIVATE_TAIL_046"]); let buffered = 0;
  const h = harness({ receiptDigest: sha256(bytes) }); await open(h); const pending = h.click("rr-export"); await flush();
  h.respond(1, bytes, { body: stream.body, blob: async () => { buffered++; return new Blob([bytes]); },
    arrayBuffer: async () => { buffered++; return bytesOf(bytes); } }); await pending; closed(h);
  assert.equal(buffered, 0); assert.equal(stream.metrics.reads, 1); assert.equal(stream.metrics.canceled, 1);
  assert.equal(stream.metrics.ended, false); assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0);
});

test("the maximum allowed JSON byte length is verified without changing its bytes", async () => {
  const base = receiptJson({ asset: { title: "" } });
  const bytes = receiptJson({ asset: { title: "x".repeat(262144 - new TextEncoder().encode(base).byteLength) } });
  assert.equal(new TextEncoder().encode(bytes).byteLength, 262144);
  const h = harness({ receiptDigest: sha256(bytes) }); await open(h); const pending = h.click("rr-export"); await flush();
  h.respond(1, bytes); await pending; assert.equal(h.downloads.length, 1);
  assert.equal(await h.downloads[0].blob.text(), bytes); assert.equal(h.downloads[0].blob.size, 262144);
});

test("a held final JSON chunk shares the response deadline and cannot hash late bytes", async () => {
  const held = deferred(), h = harness(); await open(h); const pending = h.click("rr-export"); await flush();
  const bytes = new TextEncoder().encode(GOOD_RECEIPT), stream = streamBody([bytes.slice(0, 500), held.promise]);
  h.respond(1, GOOD_RECEIPT, { body: stream.body }); await flush();
  assert.equal(stream.metrics.bytes, 500); await h.advance(15000); await pending; closed(h);
  assert.equal(stream.metrics.canceled, 1);
  assert.equal(h.calls[1].init.signal.aborted, true); held.resolve(bytes.slice(500)); await flush();
  assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0);
});

test("an identity Content-Length shorter than the returned bytes cannot authorize an export", async () => {
  const h = harness(); await open(h); const pending = h.click("rr-export"); await flush();
  h.respond(1, GOOD_RECEIPT, { headers: new Headers({ "content-type": "application/json", "x-receipt-sha256": sha256(GOOD_RECEIPT),
    "content-length": String(new TextEncoder().encode(GOOD_RECEIPT).byteLength - 1) }) }); await pending; closed(h);
  assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0);
});

for (const kind of ["Close", "replacement", "hidden"]) test(`${kind} during SHA-256 cannot release a late verified download`, async () => {
  const held = deferred(), h = harness({ digest: () => held.promise }); await open(h);
  const pending = h.click("rr-export"); await flush(); h.respond(1, GOOD_RECEIPT); await flush();
  assert.equal(h.digests.length, 1); const digest = await webcrypto.subtle.digest(h.digests[0].algorithm, h.digests[0].bytes);
  if (kind === "Close") h.click("rr-lock"); else if (kind === "hidden") h.hide(); else h.submit(SECOND);
  await flush(); assert.equal(h.calls[1].init.signal.aborted, true);
  if (kind === "replacement") { h.respond(2, html("New view while old hash is pending")); await flush(); }
  held.resolve(digest); await pending; await flush(); assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0);
  if (kind === "replacement") assert.equal(h.text, "New view while old hash is pending"); else closed(h);
});

test("headers, JSON decoding and SHA-256 share one request budget without restarting it", async () => {
  const held = deferred(), h = harness({ digest: () => held.promise }); await open(h);
  const pending = h.click("rr-export"); await flush(); await h.advance(14000);
  h.respond(1, GOOD_RECEIPT); await flush(); assert.equal(h.digests.length, 1);
  await h.advance(999); assert.equal(h.downloads.length, 0); assert.equal(h.nodes.get("rr-lock").disabled, false);
  await h.advance(1); await pending; closed(h); assert.equal(h.calls[1].init.signal.aborted, true);
  held.resolve(await webcrypto.subtle.digest(h.digests[0].algorithm, h.digests[0].bytes)); await flush();
  assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0);
});

test("a digest result at the deadline is rejected when the timeout callback was delayed", async () => {
  const held = deferred(), h = harness({ digest: () => held.promise }); await open(h);
  const pending = h.click("rr-export"); await flush(); h.respond(1, GOOD_RECEIPT); await flush();
  assert.equal(h.digests.length, 1); const digest = await webcrypto.subtle.digest(h.digests[0].algorithm, h.digests[0].bytes);
  h.elapse(15000); held.resolve(digest); await pending; closed(h); assert.equal(h.downloads.length, 0);
  assert.equal(h.calls[1].init.signal.aborted, true);
});

test("a licensing boundary reached during hashing blocks output even without a timer callback", async () => {
  const held = deferred(), h = harness({ digest: () => held.promise }); h.submit(FIRST); await flush();
  h.respond(0, html("Near licensing boundary", AT, AT + 2000)); await flush();
  const pending = h.click("rr-export"); await flush(); h.respond(1, GOOD_RECEIPT); await flush();
  assert.equal(h.digests.length, 1); const digest = await webcrypto.subtle.digest(h.digests[0].algorithm, h.digests[0].bytes);
  h.elapse(2000); held.resolve(digest); await pending; closed(h);
  assert.equal(h.downloads.length, 0); assert.equal(h.objectUrls.size, 0); assert.equal(h.calls[1].init.signal.aborted, true);
});

test("a failed digest clears authority without reflecting cryptographic exception details", async () => {
  const h = harness({ digest: async () => { throw new Error("PRIVATE_HASH_FAILURE_045"); } }); await open(h);
  const pending = h.click("rr-export"); await flush(); h.respond(1, GOOD_RECEIPT); await pending; closed(h);
  assert.equal(h.digests.length, 1); assert.equal(h.downloads.length, 0); assert.equal(h.status.includes("PRIVATE_HASH_FAILURE_045"), false);
});

// Body budgets apply to bytes delivered by the reader. Synthetic content at the
// maximum length exercises the client boundary, not the server's domain schema.
for (const format of ["html", "json"]) test(`${format} accepts its exact byte limit with split UTF-8 and no whole-body buffering helper`, async () => {
  const limit = LIMITS[format], label = "Hawaiʻi / café / 日本語", empty = format === "json"
    ? receiptJson({ asset: { title: label, padding: "" } }) : html(label);
  const fill = "x".repeat(limit - new TextEncoder().encode(empty).byteLength);
  const value = format === "json" ? receiptJson({ asset: { title: label, padding: fill } }) : html(label + fill);
  const bytes = new TextEncoder().encode(value), prefixEnd = bytes.findIndex(byte => byte > 127) + 1;
  assert.equal(bytes.byteLength, limit); assert.ok(prefixEnd > 0);
  const stream = streamBody([bytes.slice(0, prefixEnd), new Uint8Array(0), ...byteChunks(bytes.slice(prefixEnd), 32768)]);
  const { h, pending, index, digest } = await beginBody(format, value); let buffered = 0;
  const unexpected = async () => { buffered++; throw new Error("Whole-body method must not run"); };
  h.respond(index, value, { body: stream.body, text: unexpected, blob: unexpected, arrayBuffer: unexpected,
    headers: receiptHeaders(format, digest, { "content-length": String(limit) }) });
  await pending; await flush(); assert.equal(buffered, 0); assert.equal(stream.metrics.bytes, limit);
  assert.equal(stream.metrics.ended, true); assert.equal(stream.metrics.canceled, 0); assert.equal(stream.metrics.released, 1);
  if (format === "json") {
    assert.equal(h.downloads.length, 1); assert.deepEqual(new Uint8Array(await h.downloads[0].blob.arrayBuffer()), bytes);
    assert.deepEqual(new Uint8Array(h.digests[0].bytes), bytes);
  } else {
    assert.equal(h.text, label + fill); assert.equal(h.parsed.length, 1);
    assert.equal(h.nodes.get("rr-print").disabled, false); assert.equal(h.nodes.get("rr-export").disabled, false);
  }
});

for (const format of ["html", "json"]) test(`${format} cancels a real chunked stream on overflow without pulling its private tail`, async () => {
  const limit = LIMITS[format], chunks = [...byteChunks("x".repeat(limit)), new Uint8Array([120]), new TextEncoder().encode("UNREAD_PRIVATE_TAIL_046")];
  let delivered = 0, produced = 0, canceled = 0, ended = false;
  const body = new ReadableStream({
    pull(controller) {
      if (produced >= chunks.length) { ended = true; controller.close(); return; }
      const chunk = chunks[produced++]; delivered += chunk.byteLength; controller.enqueue(chunk);
    },
    cancel() { canceled++; },
  }, { highWaterMark: 0 });
  const { h, pending, index, digest } = await beginBody(format, GOOD_RECEIPT);
  h.respond(index, GOOD_RECEIPT, { body, headers: receiptHeaders(format, digest) });
  await pending; await flush(); closed(h);
  assert.equal(delivered, limit + 1); assert.equal(produced, chunks.length - 1); assert.equal(canceled, 1); assert.equal(ended, false);
  assert.equal(body.locked, false); assert.equal(h.digests.length, 0); assert.equal(h.parsed.length, format === "json" ? 1 : 0);
  assert.equal(h.downloads.length, 0); assert.equal(h.calls[index].init.signal.aborted, true);
  assert.equal(h.status.includes("UNREAD_PRIVATE_TAIL_046"), false);
});

for (const format of ["html", "json"]) test(`${format} rejects declared zero or over-budget identity lengths before acquiring a reader`, async () => {
  for (const length of ["0", String(LIMITS[format] + 1)]) {
    const value = format === "json" ? GOOD_RECEIPT : html("Declared body"), stream = streamBody([value]);
    const { h, pending, index, digest } = await beginBody(format, value);
    h.respond(index, value, { body: stream.body, headers: receiptHeaders(format, digest, { "content-length": length }) });
    await pending; await flush(); closed(h); assert.equal(stream.metrics.acquired, 0); assert.equal(stream.metrics.reads, 0);
    assert.equal(stream.metrics.canceled, 1); assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0);
  }
});

for (const [name, length] of [["empty", ""], ["signed", "+10"], ["negative", "-1"], ["fractional", "1.5"],
  ["exponent", "1e3"], ["nondecimal", "0x10"], ["combined", "10, 10"], ["unsafe integer", "9007199254740992"]]) test(`${name} Content-Length fails before reading either protected format`, async () => {
  for (const format of ["html", "json"]) {
    const value = format === "json" ? GOOD_RECEIPT : html("Invalid declared length"), stream = streamBody([value]);
    const { h, pending, index, digest } = await beginBody(format, value);
    h.respond(index, value, { body: stream.body, headers: receiptHeaders(format, digest, { "content-length": length }) });
    await pending; await flush(); closed(h); assert.equal(stream.metrics.reads, 0); assert.equal(stream.metrics.canceled, 1);
    assert.equal(h.downloads.length, 0); assert.equal(h.digests.length, 0);
  }
});

for (const encoding of [null, "", "identity", "Identity"]) test(`identity length ${JSON.stringify(encoding)} uses UTF-8 bytes, accepts leading zeros and rejects truncated EOF`, async () => {
  for (const longer of [false, true]) {
    const value = GOOD_RECEIPT, bytes = new TextEncoder().encode(value), stream = streamBody(byteChunks(bytes, 127));
    const { h, pending, index, digest } = await beginBody("json", value);
    h.respond(index, value, { body: stream.body, headers: receiptHeaders("json", digest, {
      "content-length": "000" + (bytes.byteLength + Number(longer)), ...(encoding === null ? {} : { "content-encoding": encoding }),
    }) });
    await pending; await flush(); assert.equal(stream.metrics.ended, true); assert.equal(stream.metrics.bytes, bytes.byteLength);
    if (longer) { closed(h); assert.equal(h.downloads.length, 0); assert.equal(h.digests.length, 0); }
    else { assert.equal(h.downloads.length, 1); assert.equal(await h.downloads[0].blob.text(), value); }
  }
});

test("a misleading short Content-Length stops as soon as a chunk exceeds it without waiting for EOF", async () => {
  const stream = streamBody(["12345678", "9", deferred().promise]);
  const { h, pending, index, digest } = await beginBody("json", GOOD_RECEIPT);
  h.respond(index, GOOD_RECEIPT, { body: stream.body, headers: receiptHeaders("json", digest, { "content-length": "8" }) });
  await pending; closed(h); assert.equal(stream.metrics.reads, 2); assert.equal(stream.metrics.bytes, 9);
  assert.equal(stream.metrics.canceled, 1); assert.equal(stream.metrics.ended, false); assert.equal(h.digests.length, 0);
});

for (const encoding of ["gzip", "br"]) test(`${encoding} Content-Length describes encoded bytes while delivered decoded bytes stay bounded`, async () => {
  for (const length of ["0", "12", String(LIMITS.json + 100)]) {
    const { h, pending, index, digest } = await beginBody("json", GOOD_RECEIPT), stream = streamBody(byteChunks(GOOD_RECEIPT, 113));
    h.respond(index, GOOD_RECEIPT, { body: stream.body,
      headers: receiptHeaders("json", digest, { "content-length": length, "content-encoding": encoding }) });
    await pending; assert.equal(h.downloads.length, 1); assert.equal(await h.downloads[0].blob.text(), GOOD_RECEIPT);
    assert.equal(stream.metrics.bytes, new TextEncoder().encode(GOOD_RECEIPT).byteLength);
  }
  const oversized = "x".repeat(LIMITS.json + 1), stream = streamBody([...byteChunks(oversized), deferred().promise]);
  const { h, pending, index, digest } = await beginBody("json", oversized);
  h.respond(index, oversized, { body: stream.body,
    headers: receiptHeaders("json", digest, { "content-length": "12", "content-encoding": encoding }) });
  await pending; closed(h); assert.equal(stream.metrics.bytes, LIMITS.json + 1); assert.equal(stream.metrics.ended, false);
  assert.equal(stream.metrics.canceled, 1); assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0);
});

test("compressed bodies still reject malformed declared lengths before reading", async () => {
  const stream = streamBody([GOOD_RECEIPT]), { h, pending, index, digest } = await beginBody("json", GOOD_RECEIPT);
  h.respond(index, GOOD_RECEIPT, { body: stream.body,
    headers: receiptHeaders("json", digest, { "content-length": "1.5", "content-encoding": "gzip" }) });
  await pending; closed(h); assert.equal(stream.metrics.reads, 0); assert.equal(stream.metrics.canceled, 1);
});

for (const [name, body] of [["absent", undefined], ["null", null], ["unreadable", {}],
  ["locked", { getReader() { throw new TypeError("PRIVATE_LOCKED_BODY_046"); } }]]) test(`${name} response body fails closed without a whole-body fallback`, async () => {
  for (const format of ["html", "json"]) {
    const value = format === "json" ? GOOD_RECEIPT : html("Unsupported body"), { h, pending, index } = await beginBody(format, value);
    let buffered = 0; const fallback = async () => { buffered++; return value; };
    h.respond(index, value, { body, text: fallback, blob: fallback, arrayBuffer: fallback });
    await pending; await flush(); closed(h); assert.equal(buffered, 0); assert.equal(h.downloads.length, 0);
    assert.equal(h.calls[index].init.signal.aborted, true); assert.equal(h.status.includes("PRIVATE_LOCKED_BODY_046"), false);
  }
});

for (const [name, result] of [["string chunk", { done: false, value: "not bytes" }],
  ["ArrayBuffer chunk", { done: false, value: bytesOf("not a Uint8Array") }],
  ["missing chunk", { done: false }]]) test(`${name} is canceled before parsing or hashing`, async () => {
  const stream = streamBody([result, { done: true }], { raw: true });
  const { h, pending, index } = await beginBody("json", GOOD_RECEIPT);
  h.respond(index, GOOD_RECEIPT, { body: stream.body }); await pending; closed(h);
  assert.equal(stream.metrics.reads, 1); assert.equal(stream.metrics.canceled, 1);
  assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0);
});

test("empty EOF and streams of empty chunks cannot establish receipt authority", async () => {
  for (const format of ["html", "json"]) for (const chunks of [[], [new Uint8Array(0), new Uint8Array(0)]]) {
    const stream = streamBody(chunks), { h, pending, index } = await beginBody(format, "");
    h.respond(index, "", { body: stream.body }); await pending; await flush(); closed(h);
    assert.equal(stream.metrics.bytes, 0); assert.equal(stream.metrics.ended, true);
    assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0);
  }
});

test("a reader failure after a private prefix clears access without reflecting its exception", async () => {
  const stream = streamBody(["PRIVATE_PARTIAL_046", () => { throw new Error("PRIVATE_READER_FAILURE_046"); }]);
  const { h, pending, index } = await beginBody("json", GOOD_RECEIPT);
  h.respond(index, GOOD_RECEIPT, { body: stream.body }); await pending; closed(h);
  assert.equal(stream.metrics.canceled, 1); assert.equal(stream.metrics.released, 1); assert.equal(h.digests.length, 0);
  assert.equal(h.status.includes("PRIVATE_PARTIAL_046"), false); assert.equal(h.status.includes("PRIVATE_READER_FAILURE_046"), false);
});

for (const [name, cancel] of [["throws", () => { throw new Error("PRIVATE_CANCEL_THROW_046"); }],
  ["rejects", () => Promise.reject(new Error("PRIVATE_CANCEL_REJECT_046"))],
  ["never settles", () => deferred().promise]]) test(`reader cancellation that ${name} cannot hold the UI or restore late bytes`, async () => {
  const held = deferred(), stream = streamBody(["PRIVATE_PREFIX_046", held.promise], { cancel });
  const { h, pending, index } = await beginBody("json", GOOD_RECEIPT); let settled = false;
  pending.then(() => { settled = true; });
  h.respond(index, GOOD_RECEIPT, { body: stream.body }); await flush(); h.click("rr-lock"); await flush();
  assert.equal(settled, true); closed(h); assert.equal(stream.metrics.canceled, 1);
  assert.equal(h.calls[index].init.signal.aborted, true); h.submit(SECOND); await flush();
  h.respond(index + 1, html("Recovered while old cancellation is unresolved")); await flush();
  held.resolve("LATE_PRIVATE_TAIL_046"); await flush();
  assert.equal(h.text, "Recovered while old cancellation is unresolved"); assert.equal(h.downloads.length, 0); assert.equal(h.digests.length, 0);
  assert.equal(h.status.includes("PRIVATE_"), false);
});

test("a stream stalled after a bounded prefix is canceled at the original shared deadline", async () => {
  const held = deferred(), bytes = new TextEncoder().encode(GOOD_RECEIPT), stream = streamBody([bytes.slice(0, 100), held.promise]);
  const { h, pending, index } = await beginBody("json", GOOD_RECEIPT); await h.advance(14000);
  h.respond(index, GOOD_RECEIPT, { body: stream.body }); await flush(); await h.advance(999);
  assert.equal(stream.metrics.bytes, 100); assert.equal(stream.metrics.canceled, 0);
  await h.advance(1); await pending; closed(h); assert.equal(stream.metrics.canceled, 1);
  held.resolve(bytes.slice(100)); await flush(); assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0);
});

test("fatal UTF-8 decoding rejects malformed HTML while a valid UTF-8 BOM remains compatible", async () => {
  const invalid = Uint8Array.from([0xc3, 0x28, ...new TextEncoder().encode(html("Invalid UTF-8"))]);
  const first = await beginBody("html", invalid); first.h.respond(first.index, invalid); await flush(); closed(first.h);
  assert.equal(first.h.parsed.length, 0);
  const valid = Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(html("Valid BOM"))]);
  const second = await beginBody("html", valid); second.h.respond(second.index, valid); await flush();
  assert.equal(second.h.text, "Valid BOM"); assert.equal(second.h.nodes.get("rr-print").disabled, false);
});

for (const format of ["html", "json"]) test(`late ${format} headers are canceled before a reader can acquire obsolete private bytes`, async () => {
  const value = format === "json" ? GOOD_RECEIPT : html("Obsolete private receipt");
  const stream = streamBody([value]), { h, pending, index } = await beginBody(format, value);
  h.submit(SECOND); await flush(); h.respond(index + 1, html("Replacement owns the receipt")); await flush();
  h.respond(index, value, { body: stream.body }); await pending; await flush();
  assert.equal(h.text, "Replacement owns the receipt"); assert.equal(stream.metrics.acquired, 0);
  assert.equal(stream.metrics.reads, 0); assert.equal(stream.metrics.canceled, 1); assert.equal(h.downloads.length, 0);
  assert.equal(h.nodes.get("rr-print").disabled, false); assert.equal(h.nodes.get("rr-export").disabled, false);
});

test("Close releases a real reader stalled after one chunk even when underlying cancellation never settles", async () => {
  let pulls = 0, canceled = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulls++;
      if (pulls === 1) controller.enqueue(new TextEncoder().encode("PRIVATE_PREFIX_046"));
    },
    cancel() { canceled++; return deferred().promise; },
  }, { highWaterMark: 0 });
  const { h, pending, index } = await beginBody("json", GOOD_RECEIPT); let settled = false;
  pending.then(() => { settled = true; }); h.respond(index, GOOD_RECEIPT, { body }); await flush();
  assert.equal(pulls, 2); assert.equal(body.locked, true);
  h.click("rr-lock"); await flush(); closed(h); assert.equal(settled, true); assert.equal(canceled, 1);
  assert.equal(body.locked, false); assert.equal(h.digests.length, 0); assert.equal(h.downloads.length, 0);
});
