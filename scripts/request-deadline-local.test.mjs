/** Deterministic request-boundary races, including transports that ignore cancellation. */
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { REQUEST_DEADLINE_CLIENT } from "../apps/web/src/request-deadline-client.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const timeoutMessage = "The outcome is uncertain. Retry only the same command.";
function response(value, extra = {}) {
  return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => value, ...extra };
}
function harness(transport) {
  let wall = 100000, monotonic = 0, nextId = 0;
  const timers = new Map(), calls = [];
  const api = vm.runInNewContext(`(() => { ${REQUEST_DEADLINE_CLIENT}; return { readJsonWithDeadline, REQUEST_TIMEOUT_MS, REQUEST_JSON_MAX_BYTES }; })()`, {
    AbortController, Error, Promise, Uint8Array, TextDecoder, Date: { now: () => wall }, performance: { now: () => monotonic },
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, due: monotonic + delay, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(path, init) { calls.push({ path, init }); return transport(path, init); },
  });
  const options = { timeoutMessage, checkResponse(value) {
    if (!value.ok) { const error = new Error("The current view is unavailable."); error.status = value.status; throw error; }
    if (!value.headers.get("content-type")?.includes("application/json")) throw new Error("A JSON response is required.");
  } };
  return {
    ...api, calls, timers, options,
    read(init = {}, config = options) { return api.readJsonWithDeadline("/api/fixture", init, config); },
    elapse(ms, wallDelta = ms) { monotonic += ms; wall += wallDelta; },
    async advance(ms) {
      monotonic += ms; wall += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].due - b[1].due)) {
        if (timers.has(id) && timer.due <= monotonic) { timers.delete(id); timer.fn(); }
      }
      await flush();
    },
  };
}
function outcome(promise) { return promise.then(value => ({ value }), error => ({ error })); }
function timedOut(result) {
  assert.equal(result.error?.code, "request_timeout"); assert.equal(result.error?.name, "TimeoutError");
  assert.equal(result.error?.message, timeoutMessage);
}

test("successful JSON keeps request policies and command bytes while cleaning its timer", async () => {
  const parent = new AbortController(), command = '{"requestId":"same-command","confirmed":true}';
  const h = harness(async () => response({ saved: true }));
  const result = await h.read({ method: "POST", body: command, signal: parent.signal, credentials: "omit", mode: "same-origin",
    redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", headers: { Authorization: "Bearer fixture" } });
  assert.deepEqual(result, { saved: true }); assert.equal(h.calls.length, 1); assert.equal(h.REQUEST_TIMEOUT_MS, 15000);
  const sent = h.calls[0].init;
  for (const [key, value] of Object.entries({ method: "POST", body: command, credentials: "omit", mode: "same-origin", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" })) assert.equal(sent[key], value);
  assert.equal(sent.headers.Authorization, "Bearer fixture"); assert.notEqual(sent.signal, parent.signal);
  assert.equal(parent.signal.aborted, false); assert.equal(sent.signal.aborted, false); assert.equal(h.timers.size, 0);
  parent.abort(); assert.equal(sent.signal.aborted, false, "the completed request listener was removed");
});

test("a fetch that never settles is bounded without aborting the parent or retrying", async () => {
  const parent = new AbortController(), held = deferred(), h = harness(() => held.promise);
  const result = outcome(h.read({ signal: parent.signal })); await flush();
  assert.equal(h.calls.length, 1); assert.equal([...h.timers.values()][0].delay, 15000);
  await h.advance(14999); assert.equal(h.calls[0].init.signal.aborted, false);
  await h.advance(1); timedOut(await result);
  assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(parent.signal.aborted, false); assert.equal(h.timers.size, 0);
});

test("headers and JSON consumption share one deadline instead of restarting the budget", async () => {
  const headers = deferred(), body = deferred(), h = harness(() => headers.promise);
  const result = outcome(h.read()); await flush(); await h.advance(14000);
  headers.resolve(response(null, { json: () => body.promise })); await flush();
  await h.advance(1000); timedOut(await result); assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
});

test("a body completing before the deadline succeeds and cannot be timed out afterward", async () => {
  const body = deferred(), h = harness(async () => response(null, { json: () => body.promise }));
  const result = outcome(h.read()); await flush(); await h.advance(14999);
  body.resolve({ accepted: true }); await flush(); assert.deepEqual((await result).value, { accepted: true });
  await h.advance(1); assert.equal(h.calls[0].init.signal.aborted, false); assert.equal(h.timers.size, 0);
});

test("a response at the exact deadline is rejected even before its timer callback runs", async () => {
  let parsed = 0; const held = deferred(), h = harness(() => held.promise);
  const result = outcome(h.read()); await flush(); h.elapse(15000);
  held.resolve(response(null, { json: async () => { parsed++; return { late: true }; } }));
  timedOut(await result); assert.equal(parsed, 0); assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(h.timers.size, 0);
});

test("a JSON result after the deadline is rejected when the timer was delayed", async () => {
  const body = deferred(), h = harness(async () => response(null, { json: () => body.promise }));
  const result = outcome(h.read()); await flush(); h.elapse(15000); body.resolve({ late: true });
  timedOut(await result); assert.equal(h.timers.size, 0);
});

test("monotonic elapsed time prevents a backward wall-clock change from extending the deadline", async () => {
  const held = deferred(), h = harness(() => held.promise), result = outcome(h.read());
  await flush(); h.elapse(15000, -60000); held.resolve(response({ late: true })); timedOut(await result);
});

test("a forward wall-clock deadline also rejects a late result conservatively", async () => {
  const held = deferred(), h = harness(() => held.promise), result = outcome(h.read());
  await flush(); h.elapse(1, 15000); held.resolve(response({ late: true })); timedOut(await result);
});

test("an already aborted parent prevents dispatch and creates no timer", async () => {
  const parent = new AbortController(); parent.abort(); const h = harness(async () => response({}));
  const result = await outcome(h.read({ signal: parent.signal }));
  assert.equal(result.error.code, "request_aborted"); assert.equal(result.error.name, "AbortError");
  assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
});

test("parent cancellation before the scheduled dispatch suppresses the fetch", async () => {
  const parent = new AbortController(), h = harness(async () => response({}));
  const result = outcome(h.read({ signal: parent.signal })); parent.abort();
  assert.equal((await result).error.code, "request_aborted"); assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
});

for (const stage of ["headers", "body"]) test(`parent cancellation during ${stage} settles even if transport ignores it`, async () => {
  const held = deferred(), parent = new AbortController();
  const h = harness(() => stage === "headers" ? held.promise : Promise.resolve(response(null, { json: () => held.promise })));
  const result = outcome(h.read({ signal: parent.signal })); await flush(); parent.abort();
  const failed = await result; assert.equal(failed.error.code, "request_aborted"); assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(h.timers.size, 0);
  held.resolve(stage === "headers" ? response({ late: true }) : { late: true }); await flush();
  assert.equal((await result).error, failed.error); assert.equal(h.calls.length, 1);
});

test("late ignored-abort headers never reach response validation or JSON parsing", async () => {
  const held = deferred(); let checked = 0, parsed = 0; const h = harness(() => held.promise);
  const result = outcome(h.read({}, { timeoutMessage, checkResponse() { checked++; } })); await flush(); await h.advance(15000);
  timedOut(await result); held.resolve(response(null, { json: async () => { parsed++; return {}; } })); await flush();
  assert.equal(checked, 0); assert.equal(parsed, 0);
});

test("an old timed-out body cannot replace a newer deliberate result using the same parent", async () => {
  const parent = new AbortController(), held = deferred(); let request = 0;
  const h = harness(async () => ++request === 1 ? response(null, { json: () => held.promise }) : response({ current: true }));
  const old = outcome(h.read({ signal: parent.signal })); await flush(); await h.advance(15000); timedOut(await old);
  const current = await h.read({ signal: parent.signal }); held.resolve({ stale: true }); await flush();
  assert.deepEqual(current, { current: true }); timedOut(await old); assert.equal(h.calls.length, 2); assert.equal(parent.signal.aborted, false);
});

for (const status of [403, 409]) test(`HTTP ${status} preserves status and cancels its unread child response`, async () => {
  const parent = new AbortController();
  let parsed = 0; const h = harness(async () => response(null, { ok: false, status, json: async () => { parsed++; return {}; } }));
  const result = await outcome(h.read({ signal: parent.signal })); assert.equal(result.error.status, status); assert.equal(parsed, 0);
  assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(parent.signal.aborted, false);
  assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
});

test("content-type rejection prevents body parsing and does not retry", async () => {
  const parent = new AbortController();
  let parsed = 0; const h = harness(async () => response(null, { headers: new Headers({ "content-type": "text/html" }), json: async () => { parsed++; return {}; } }));
  const result = await outcome(h.read({ signal: parent.signal })); assert.match(result.error.message, /JSON response/u); assert.equal(parsed, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(parent.signal.aborted, false); assert.equal(h.calls.length, 1);
});

for (const stage of ["fetch", "JSON"]) test(`${stage} rejection is not retried and removes the timer`, async () => {
  const parent = new AbortController(), failure = new Error("Fixture rejection");
  const h = harness(async () => { if (stage === "fetch") throw failure; return response(null, { json: async () => { throw failure; } }); });
  const result = await outcome(h.read({ signal: parent.signal })); assert.equal(result.error, failure); assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
  assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(parent.signal.aborted, false);
});

test("timeout remains the outcome if an abort-aware transport rejects during cancellation", async () => {
  const h = harness((_path, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("Transport aborted")), { once: true })));
  const result = outcome(h.read()); await flush(); await h.advance(15000); timedOut(await result);
});

test("a response validator cannot extend the elapsed budget", async () => {
  let parsed = 0; const h = harness(async () => response(null, { json: async () => { parsed++; return {}; } }));
  const result = await outcome(h.read({}, { timeoutMessage, checkResponse() { h.elapse(15000); } }));
  timedOut(result); assert.equal(parsed, 0); assert.equal(h.timers.size, 0);
});

test("missing response validation fails before dispatch", async () => {
  const h = harness(async () => response({})); const result = await outcome(h.read({}, { timeoutMessage }));
  assert.match(result.error.message, /bounded request configuration/u); assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
});


test("streamed JSON is bounded and bypasses the complete-body json method", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ saved: true, source: "stream" }));
  let index = 0, jsonCalls = 0, canceled = 0;
  const parts = [bytes.subarray(0, 7), bytes.subarray(7)];
  const reader = {
    async read() { return index < parts.length ? { done: false, value: parts[index++] } : { done: true, value: undefined }; },
    async cancel() { canceled++; },
    releaseLock() {},
  };
  const h = harness(async () => ({
    ok: true, status: 200, headers: new Headers({ "content-type": "application/json", "content-length": String(bytes.byteLength) }),
    body: { getReader() { return reader; }, async cancel() { canceled++; } },
    async json() { jsonCalls++; return { wrong: true }; },
  }));
  const result = await h.read();
  assert.equal(result.saved, true); assert.equal(result.source, "stream");
  assert.equal(jsonCalls, 0); assert.equal(canceled, 0); assert.equal(h.REQUEST_JSON_MAX_BYTES, 262144);
});

test("oversized declared JSON is rejected before any body read", async () => {
  let reads = 0, canceled = 0;
  const reader = { async read() { reads++; return { done: true }; }, async cancel() { canceled++; }, releaseLock() {} };
  const h = harness(async () => ({
    ok: true, status: 200, headers: new Headers({ "content-type": "application/json", "content-length": "262145" }),
    body: { getReader() { return reader; }, async cancel() { canceled++; } },
  }));
  const result = await outcome(h.read());
  assert.equal(result.error.code, "response_invalid"); assert.equal(reads, 0); assert.equal(canceled, 1);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(h.timers.size, 0);
});

test("chunked JSON overflow cancels on the first chunk that exceeds the retained budget", async () => {
  let reads = 0, canceled = 0;
  const chunk = new Uint8Array(131072); chunk.fill(32);
  const reader = {
    async read() { reads++; return { done: false, value: chunk }; },
    async cancel() { canceled++; },
    releaseLock() {},
  };
  const h = harness(async () => ({
    ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
    body: { getReader() { return reader; }, async cancel() { canceled++; } },
  }));
  const result = await outcome(h.read());
  assert.equal(result.error.code, "response_invalid"); assert.equal(reads, 3); assert.equal(canceled, 1);
  assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(h.timers.size, 0);
});

test("a streamed JSON body stalled after headers shares the original deadline", async () => {
  const held = deferred(); let canceled = 0;
  const reader = { read() { return held.promise; }, async cancel() { canceled++; }, releaseLock() {} };
  const h = harness(async () => ({
    ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
    body: { getReader() { return reader; }, async cancel() { canceled++; } },
  }));
  const result = outcome(h.read()); await flush(); await h.advance(15000);
  timedOut(await result); assert.equal(canceled, 1); assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(h.timers.size, 0);
  held.resolve({ done: true, value: undefined }); await flush();
});

test("identity content length must match the streamed decoded JSON bytes", async () => {
  const bytes = new TextEncoder().encode('{"ok":true}');
  let index = 0, canceled = 0;
  const reader = {
    async read() { return index++ === 0 ? { done: false, value: bytes } : { done: true, value: undefined }; },
    async cancel() { canceled++; },
    releaseLock() {},
  };
  const h = harness(async () => ({
    ok: true, status: 200, headers: new Headers({ "content-type": "application/json", "content-length": String(bytes.byteLength + 1) }),
    body: { getReader() { return reader; }, async cancel() { canceled++; } },
  }));
  const result = await outcome(h.read());
  assert.equal(result.error.code, "response_invalid"); assert.equal(canceled, 1);
});
