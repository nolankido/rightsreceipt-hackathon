import assert from "node:assert/strict";
import { test } from "node:test";
import { consentFixture, ids } from "./support/human-consent-fixture.mjs";
import { createInvoiceControlRoutes } from "../apps/api/src/invoice-control-routes.ts";
import { createSandboxInvoiceCreation } from "../apps/api/src/invoice-creation.ts";
import { createPayPalSandboxDraftAdapter } from "../packages/paypal/src/sandbox-draft.ts";

const ORIGIN = "https://rights.example.test", ROOT = `/api/invoices/creator/cases/${ids.case}`;
const INVOICE = "INV2-CONTROLS-035-TEST", LINK = "https://www.sandbox.paypal.com/invoice/p/#TEST035";
const merchant = { name: "Maya Chen", email: "merchant@example.test" };
const config = { APP_MODE: "sandbox", PAYPAL_MODE: "paypal_sandbox", PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
  PAYPAL_SANDBOX_CLIENT_ID: "sandbox035client", PAYPAL_SANDBOX_CLIENT_SECRET: "fixture-sandbox035secret" };

async function fixture({ accepted = true, limit } = {}) {
  const f = consentFixture();
  if (accepted) { await f.approve(); await f.accept(); }
  const calls = [], control = { status: "DRAFT", failCreate: false, failSend: false, failGet: false, post401: false, onFetch: null, onRead: null, factoryCalls: 0 };
  let mapped = null;
  function statement(sql, values = []) {
    return { sql, values, bind(...v) { return statement(sql, v); },
      async first() { const row = f.db.prepare(sql).get(...values) ?? null; if (control.onRead) await control.onRead(sql); return row; },
      async run() { const r = f.db.prepare(sql).run(...values); return { success: true, meta: { changes: Number(r.changes) } }; } };
  }
  const db = { prepare: statement, batch: s => f.adapter.batch(s) };
  const transport = { merchant, sandboxDraftTransportEnabled: true, now: () => f.now().getTime(),
    fetch: async (url, init) => {
      const stage = url.endsWith("/token") ? "oauth" : url.endsWith("/send") ? "send" : init.method === "POST" ? "create" : "get";
      calls.push({ stage, url, init }); if (control.onFetch) await control.onFetch(stage);
      if (stage === "oauth") return Response.json({ token_type: "Bearer", access_token: "TEST035_NOT_A_TOKEN", expires_in: 3600 });
      if (stage === "create") {
        if (control.post401) { control.post401 = false; return new Response("{}", { status: 401 }); }
        if (control.failCreate) throw Error("PRIVATE_PROVIDER_ERROR");
        mapped = JSON.parse(init.body); return Response.json({ id: INVOICE, status: "DRAFT" }, { status: 201 });
      }
      if (stage === "send") { if (control.failSend) throw Error("PRIVATE_SEND_ERROR"); control.status = "UNPAID"; return new Response(null, { status: 202 }); }
      if (control.failGet) throw Error("PRIVATE_READ_ERROR");
      const body = { id: INVOICE, ...structuredClone(mapped), status: control.status,
        amount: { currency_code: "USD", value: "425.00" }, due_amount: { currency_code: "USD", value: "425.00" } };
      if (control.status !== "DRAFT") body.detail.metadata = { recipient_view_url: LINK };
      return Response.json(body);
    } };
  const env = { ...config, DB: db, RIGHTS_INVOICE_CONTROLS_ENABLED: "true", RIGHTS_INVOICE_CREATION_ENABLED: "true",
    RIGHTS_INVOICE_SENDING_ENABLED: "true", HUMAN_CONSENT_ENABLED: "true", HUMAN_CONSENT_ORIGIN: ORIGIN,
    CREATOR_ACCESS_ENABLED: "true", CREATOR_ACCESS_ORIGIN: ORIGIN };
  const deps = { authorizeCreator: (_request, caseId) => caseId === ids.case ? f.authorize() : Promise.resolve(null), now: f.now,
    transport: () => { control.factoryCalls++; return transport; }, ...(limit ? { limit } : {}) };
  const routes = createInvoiceControlRoutes(deps);
  function req(path = ROOT, { method = "GET", data, headers = {}, signal, raw } = {}) {
    return new Request(ORIGIN + path, { method, ...(signal ? { signal } : {}),
      headers: { ...(method === "POST" ? { Origin: ORIGIN, "Content-Type": "application/json" } : {}), ...headers },
      ...(method === "POST" ? { body: raw ?? JSON.stringify(data) } : {}) });
  }
  const read = () => routes(req(), env);
  const createCommand = () => ({ expectedCaseVersion: f.case().row_version, confirmed: true });
  const sendCommand = () => ({ expectedCaseVersion: f.case().row_version, invoiceId: INVOICE, confirmed: true });
  const create = data => routes(req(`${ROOT}/create`, { method: "POST", data: data ?? createCommand() }), env);
  const send = data => routes(req(`${ROOT}/send`, { method: "POST", data: data ?? sendCommand() }), env);
  return { ...f, dbAdapter: db, transport, env, deps, routes, req, read, create, send, createCommand, sendCommand, calls, control,
    stageCount: stage => calls.filter(c => c.stage === stage).length,
    binding: () => f.db.prepare("SELECT * FROM invoice_bindings WHERE case_id=?").get(ids.case),
    operation: kind => f.db.prepare("SELECT * FROM payment_operations WHERE operation_type=?").get(kind),
    noMoney() { for (const table of ["payment_evidence", "permissions", "receipt_revisions"]) assert.equal(f.count(table), 0); } };
}
async function withFixture(fn, options) { const f = await fixture(options); try { await fn(f); } finally { f.close(); } }
async function json(response, status = 200) { assert.equal(response.status, status, await response.clone().text()); return response.json(); }

test("read-only canonical controls follow approvals and acceptance without PayPal calls", () => withFixture(async f => {
  let v = await json(await f.read()); assert.equal(v.stage, "awaiting_creator"); assert.equal(v.canCreate, false);
  await f.approve(); v = await json(await f.read()); assert.equal(v.stage, "awaiting_buyer"); assert.equal(v.canCreate, false);
  await f.accept(); v = await json(await f.read()); assert.equal(v.stage, "accepted_awaiting_invoice"); assert.equal(v.canCreate, true);
  assert.equal(v.caseVersion, f.case().row_version); assert.equal(v.canSend, false); assert.equal(v.invoiceId, null);
  assert.equal(f.calls.length, 0); assert.equal(f.control.factoryCalls, 3); f.noMoney();
}, { accepted: false }));

test("native HTTP commands create one exact draft and explicitly send it once", () => withFixture(async f => {
  const before = f.createCommand(), created = await json(await f.create(before));
  assert.equal(created.outcome, "draft_bound"); assert.equal(created.invoiceSentByThisCommand, false);
  assert.equal(f.stageCount("create"), 1); assert.equal(f.stageCount("send"), 0);
  let v = await json(await f.read()); assert.equal(v.stage, "billing_started"); assert.equal(v.invoiceStatus, "draft");
  assert.equal(v.invoiceId, INVOICE); assert.equal(v.canCreate, false); assert.equal(v.canSend, true);
  const command = f.sendCommand(), sent = await json(await f.send(command));
  assert.equal(sent.outcome, "delivery_observed"); assert.equal(sent.paymentUrl, LINK); assert.equal(sent.paymentConfirmed, false);
  assert.equal(sent.permissionGranted, false); assert.equal(f.stageCount("send"), 1);
  v = await json(await f.read()); assert.equal(v.invoiceStatus, "sent"); assert.equal(v.canSend, false); assert.equal(v.paymentConfirmed, false);
  for (let i = 0; i < 10; i++) { await json(await f.create(before)); await json(await f.send(command)); }
  assert.equal(f.stageCount("create"), 1); assert.equal(f.stageCount("send"), 1); assert.equal(f.count("payment_operations"), 2);
  const body = JSON.parse(f.calls.find(c => c.stage === "create").init.body);
  assert.equal(body.items[0].unit_amount.value, "425.00"); assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length, 0); f.noMoney();
}));

test("GET headers and response expose only safe current metadata", () => withFixture(async f => {
  await json(await f.create()); const response = await f.read(), text = await response.clone().text();
  assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  for (const secret of [f.token, "buyer@example.test", "merchant@example.test", config.PAYPAL_SANDBOX_CLIENT_SECRET, "TEST035_NOT_A_TOKEN", "stateJson", "rightsSummary"])
    assert.ok(!text.includes(secret));
  const before = f.calls.length; await json(await f.read()); assert.equal(f.calls.length, before);
  assert.deepEqual(Object.keys(await response.json()).sort(), ["schemaVersion", "environment", "caseId", "caseVersion", "stage", "invoiceId", "invoiceStatus", "canCreate", "canSend", "paymentConfirmed", "permissionGranted"].sort());
}));

for (const [name, patch] of [
  ["controls default off", { RIGHTS_INVOICE_CONTROLS_ENABLED: undefined }], ["creator access disabled", { CREATOR_ACCESS_ENABLED: "false" }],
  ["consent disabled", { HUMAN_CONSENT_ENABLED: "false" }], ["not Sandbox", { PAYPAL_MODE: "fake" }],
  ["production", { APP_MODE: "production" }], ["missing DB", { DB: undefined }],
  ["conflicting origins", { HUMAN_CONSENT_ORIGIN: "https://other.example.test" }], ["HTTP origin", { CREATOR_ACCESS_ORIGIN: "http://rights.example.test", HUMAN_CONSENT_ORIGIN: "http://rights.example.test" }]
]) test(`default-off perimeter rejects ${name}`, () => withFixture(async f => {
  await json(await f.routes(f.req(), { ...f.env, ...patch }), 503); assert.equal(f.calls.length, 0);
}));

test("unrelated paths fall through and unsupported routes/methods/queries are bounded", () => withFixture(async f => {
  assert.equal(await f.routes(f.req("/api/other"), f.env), null);
  await json(await f.routes(f.req("/api/invoices/creator/cases/not-a-case"), f.env), 404);
  await json(await f.routes(f.req(ROOT + "?token=private"), f.env), 400);
  const method = await f.routes(f.req(ROOT + "/create"), f.env); await json(method, 405); assert.equal(method.headers.get("allow"), "POST");
  await json(await f.routes(new Request("https://other.example.test" + ROOT), f.env), 400);
  assert.equal(f.calls.length, 0);
}));
for (const headers of [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { Origin: "https://evil.test" }])
  test(`read blocks cross-origin metadata ${JSON.stringify(headers)}`, () => withFixture(async f => {
    await json(await f.routes(f.req(ROOT, { headers }), f.env), 403); assert.equal(f.calls.length, 0);
  }));
for (const headers of [{ Origin: "" }, { Origin: "null" }, { Origin: "https://evil.test" }, { "sec-fetch-site": "cross-site" }])
  test(`write blocks cross-site request ${JSON.stringify(headers)}`, () => withFixture(async f => {
    await json(await f.routes(f.req(ROOT + "/create", { method: "POST", data: f.createCommand(), headers }), f.env), 403);
    assert.equal(f.calls.length, 0); assert.equal(f.count("payment_operations"), 0);
  }));
for (const data of [null, [], {}, { expectedCaseVersion: 1, confirmed: false }, { expectedCaseVersion: 0, confirmed: true },
  { expectedCaseVersion: 1.5, confirmed: true }, { expectedCaseVersion: Number.MAX_SAFE_INTEGER, confirmed: true },
  { expectedCaseVersion: 1, confirmed: true, amountCents: 1 }, { expectedCaseVersion: 1, confirmed: true, workspaceId: ids.workspace }])
  test(`create exact command rejects ${JSON.stringify(data)}`, () => withFixture(async f => {
    await json(await f.routes(f.req(ROOT + "/create", { method: "POST", data }), f.env), 400);
    assert.equal(f.calls.length, 0); assert.equal(f.count("payment_operations"), 0);
  }));
for (const raw of ['{"expectedCaseVersion":1,"confirmed":true,"confirmed":true}', '{"expectedCaseVersion":1,"confirmed":true,"confir\\u006ded":true}', '{bad', ' '.repeat(4097)])
  test("duplicate, malformed, or oversized streamed JSON is rejected", () => withFixture(async f => {
    await json(await f.routes(f.req(ROOT + "/create", { method: "POST", raw }), f.env), 400); assert.equal(f.calls.length, 0);
  }));
for (const headers of [{ "Content-Type": "text/plain" }, { "Content-Encoding": "gzip" }, { "Content-Length": "4097" }, { "Content-Length": "banana" }])
  test(`invalid content metadata rejects ${JSON.stringify(headers)}`, () => withFixture(async f => {
    await json(await f.routes(f.req(ROOT + "/create", { method: "POST", data: f.createCommand(), headers }), f.env), 400); assert.equal(f.calls.length, 0);
  }));
test("invalid UTF-8 fails closed without storing commands", () => withFixture(async f => {
  const req = new Request(ORIGIN + ROOT + "/create", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: new Uint8Array([0xff]) });
  await json(await f.routes(req, f.env), 400); assert.equal(f.count("payment_operations"), 0);
}));
test("stale version, missing approval and missing acceptance never call the provider", () => withFixture(async f => {
  await json(await f.create({ expectedCaseVersion: 1, confirmed: true }), 409); assert.equal(f.calls.length, 0);
}));
test("create is blocked until matching creator and buyer decisions exist", () => withFixture(async f => {
  await json(await f.create(), 409); await f.approve(); await json(await f.create(), 409);
  assert.equal(f.calls.length, 0); assert.equal(f.count("payment_operations"), 0);
}, { accepted: false }));
test("missing creator callback and cross-workspace principal deny read and writes", () => withFixture(async f => {
  await json(await createInvoiceControlRoutes({ now: f.now })(f.req(), f.env), 403);
  f.setOwner({ workspaceId: crypto.randomUUID(), actorReference: "creator:other" });
  await json(await f.read(), 403); await json(await f.create(), 403); assert.equal(f.calls.length, 0);
}));
test("coarse limiter persists across requests", () => withFixture(async f => {
  for (let n = 0; n < 60; n++) await json(await f.read());
  const r = await f.read(); await json(r, 429); assert.equal(r.headers.get("retry-after"), "60"); assert.equal(f.calls.length, 0);
}));
test("missing transport or operation switches cause no reservation", () => withFixture(async f => {
  const route = createInvoiceControlRoutes({ ...f.deps, transport: () => null });
  assert.equal((await json(await route(f.req(), f.env))).canCreate, false);
  await json(await route(f.req(ROOT + "/create", { method: "POST", data: f.createCommand() }), f.env), 503);
  f.env.RIGHTS_INVOICE_CREATION_ENABLED = "false"; await json(await f.create(), 503);
  assert.equal(f.calls.length, 0); assert.equal(f.count("payment_operations"), 0);
}));
test("unknown draft outcome cannot cause another create POST and disables new create controls", () => withFixture(async f => {
  f.control.failCreate = true; const command = f.createCommand();
  assert.equal((await json(await f.create(command))).outcome, "awaiting_reconciliation");
  assert.equal((await json(await f.read())).canCreate, false);
  for (let i = 0; i < 5; i++) await json(await f.create(command));
  assert.equal(f.stageCount("create"), 1); assert.equal(f.count("invoice_bindings"), 1); f.noMoney();
}));
test("unknown send outcome retries only reads and never sends again", () => withFixture(async f => {
  await json(await f.create()); f.control.failSend = true; const command = f.sendCommand();
  assert.equal((await json(await f.send(command))).outcome, "awaiting_reconciliation");
  assert.equal((await json(await f.read())).canSend, false);
  for (let i = 0; i < 5; i++) await json(await f.send(command));
  assert.equal(f.stageCount("send"), 1); f.noMoney();
}));
test("wrong invoice ID and stale send version cannot dispatch", () => withFixture(async f => {
  await json(await f.create());
  await json(await f.send({ ...f.sendCommand(), invoiceId: "INV2-OTHER-TEST" }), 409);
  await json(await f.send({ ...f.sendCommand(), expectedCaseVersion: 1 }), 409);
  assert.equal(f.stageCount("send"), 0);
}));

for (const [name, change] of [
  ["revoked session", f => f.setOwner(null)],
  ["changed actor", f => f.setOwner({ workspaceId: ids.workspace, actorReference: "creator:different" })],
  ["changed workspace", f => f.setOwner({ workspaceId: crypto.randomUUID(), actorReference: "creator:fixture" })],
  ["disabled controls", f => { f.env.RIGHTS_INVOICE_CONTROLS_ENABLED = "false"; }],
  ["disabled creation", f => { f.env.RIGHTS_INVOICE_CREATION_ENABLED = "false"; }],
  ["changed source", f => f.db.exec("UPDATE licensing_cases SET row_version=row_version+1")]
]) test(`draft POST is reauthorized after OAuth: ${name}`, () => withFixture(async f => {
  f.control.onFetch = stage => { if (stage === "oauth") change(f); };
  const response = await f.create(); assert.ok([200, 403].includes(response.status));
  assert.equal(f.stageCount("oauth"), 1); assert.equal(f.stageCount("create"), 0); f.noMoney();
}));
test("explicit 401 draft retry reauthorizes after refreshed OAuth", () => withFixture(async f => {
  f.control.post401 = true;
  f.control.onFetch = stage => { if (stage === "oauth" && f.stageCount("oauth") === 2) f.setOwner(null); };
  await json(await f.create(), 403);
  assert.equal(f.stageCount("oauth"), 2); assert.equal(f.stageCount("create"), 1); assert.equal(f.binding().provider_invoice_id, null); f.noMoney();
}));
test("configuration disabled while the first authorization callback awaits cannot proceed", () => withFixture(async f => {
  f.onAuth(() => { f.env.RIGHTS_INVOICE_CONTROLS_ENABLED = "false"; });
  await json(await f.create(), 403); assert.equal(f.calls.length, 0); assert.equal(f.count("payment_operations"), 0);
}));
test("draft guard revocation during its final source read prevents the provider POST", () => withFixture(async f => {
  let reads = 0;
  f.control.onFetch = stage => {
    if (stage === "oauth") f.control.onRead = async sql => {
      if (sql.includes(" stateJson ") && ++reads === 2) {
        // Suspend after the row was observed, then revoke before it returns.
        await Promise.resolve(); f.setOwner(null);
      }
    };
  };
  await json(await f.create(), 403); assert.ok(reads >= 2); assert.equal(f.stageCount("create"), 0); f.noMoney();
}));
test("send guard revocation during the final pre-POST source read prevents delivery", () => withFixture(async f => {
  await json(await f.create()); let reads = 0;
  f.control.onRead = async sql => {
    if (sql.includes(" stateJson ") && f.db.prepare("SELECT send_state FROM paypal_delivery_journal").get()?.send_state === "started"
      && ++reads === 4) {
      // The first pair belongs to the post-claim guard. This second pair is
      // request.perform's final authorization after OAuth and immediately before POST.
      await Promise.resolve(); f.setOwner(null);
    }
  };
  await json(await f.send(), 403); assert.ok(reads >= 4); assert.equal(f.stageCount("send"), 0); f.noMoney();
}));
test("aborted request during OAuth cannot dispatch an invoice", () => withFixture(async f => {
  const controller = new AbortController();
  f.control.onFetch = stage => { if (stage === "oauth") controller.abort(); };
  await json(await f.routes(f.req(ROOT + "/create", { method: "POST", data: f.createCommand(), signal: controller.signal }), f.env), 403);
  assert.equal(f.stageCount("create"), 0);
}));
test("live canonical factory cannot replace its guard with an always-allow transport callback", () => withFixture(async f => {
  const service = await createSandboxInvoiceCreation(f.env, { authorizeCreator: f.authorize, now: f.now,
    transport: { ...f.transport, authorizeCreate: async () => true } });
  const request = await f.service.prepareInvoice(ids.case);
  assert.equal(await service.authorizeTransport(request), false);
  await service.reserve(ids.case, f.case().row_version);
  assert.equal(await service.authorizeTransport(request), false);
  f.control.onFetch = stage => { if (stage === "oauth") f.setOwner(null); };
  assert.equal((await service.execute(ids.case)).outcome, "awaiting_reconciliation");
  assert.equal(f.stageCount("create"), 0);
}));
test("standalone optional guard checks exact frozen request and refuses false or throwing authorization", () => withFixture(async f => {
  const request = await f.service.prepareInvoice(ids.case);
  for (const callback of [async r => { assert.ok(Object.isFrozen(r)); assert.deepEqual(r, request); return false; }, async () => { throw Error("PRIVATE_AUTH_ERROR"); }]) {
    const adapter = createPayPalSandboxDraftAdapter(config, { ...f.transport, authorizeCreate: callback });
    await assert.rejects(adapter.createDraftInvoice(request), e => e.code === "authorization_required" && !e.message.includes("PRIVATE"));
  }
  assert.equal(f.stageCount("create"), 0);
}));
test("source corruption fails closed before returning controls", () => withFixture(async f => {
  await json(await f.create());
  f.db.exec("UPDATE invoice_bindings SET safe_invoice_reference='INV2-OTHER-TEST'");
  await json(await f.read(), 409); assert.equal(f.stageCount("send"), 0);
}));
test("database and transport errors never expose private exception text", () => withFixture(async f => {
  const broken = { ...f.env, DB: { prepare() { throw Error("PRIVATE_SQL_DETAILS"); } } };
  const response = await f.routes(f.req(), broken); assert.ok(!(await response.clone().text()).includes("PRIVATE")); await json(response, 503);
}));
