import assert from "node:assert/strict";
import { test } from "node:test";
import { consentFixture, ids } from "./support/human-consent-fixture.mjs";
import { createInvoiceControlRoutes } from "../apps/api/src/invoice-control-routes.ts";
import { createInvoiceRecoveryRoutes } from "../apps/api/src/invoice-recovery-routes.ts";

const ORIGIN = "https://recovery.example.test", ROOT = `/api/invoices/creator/cases/${ids.case}`;
const INVOICE = "INV2-RECOVERY-039-TEST", OTHER = "INV2-OTHER-039-TEST", LINK = "https://www.sandbox.paypal.com/invoice/p/#RECOVERY039";
const merchant = { name: "Fixture Creator", email: "merchant@example.test" };
async function fixture({ accepted = true } = {}) {
  const f = consentFixture(); if (accepted) { await f.approve(); await f.accept(); }
  const calls = [], control = { providerStatus: "DRAFT", mapped: null, failEvent: null, loseAckEvent: null,
    loseCreateReply: false, loseSendReply: false, failGet: false, get401: false, create401: false,
    onFetch: null, afterFetch: null, afterRead: null, onAuthorize: null, afterBatch: null, mutateProvider: null,
    expiresAt: Math.floor(f.now().getTime() / 1000) + 3600 };
  function statement(sql, values = []) {
    return { sql, values, bind(...v) { return statement(sql, v); },
      async first() { const r = f.db.prepare(sql).get(...values) ?? null; if (control.afterRead) await control.afterRead(sql); return r; },
      async run() { const r = f.db.prepare(sql).run(...values); return { success: true, meta: { changes: Number(r.changes) } }; } };
  }
  const database = { prepare: statement, async batch(statements) {
    const has = event => event && statements.some(s => s.values.includes(event) || s.sql.includes(`'${event}'`));
    if (has(control.failEvent)) throw Error("fixture batch unavailable");
    const result = await f.adapter.batch(statements);
    if (control.afterBatch) await control.afterBatch(statements);
    if (has(control.loseAckEvent)) throw Error("fixture committed acknowledgement lost");
    return result;
  } };
  const transport = { merchant, sandboxDraftTransportEnabled: true, now: () => f.now().getTime(),
    async fetch(url, init) {
      const stage = url.endsWith("/token") ? "oauth" : url.endsWith("/send") ? "send" : init.method === "POST" ? "create" : "get";
      calls.push({ stage, url, init }); if (control.onFetch) await control.onFetch(stage);
      let response;
      if (stage === "oauth") response = Response.json({ token_type: "Bearer", access_token: "RECOVERY_FIXTURE_NOT_A_TOKEN", expires_in: 3600 });
      else if (stage === "create") {
        if (control.create401) { control.create401 = false; return new Response("{}", { status: 401 }); }
        assert.equal(control.mapped, null, "A second external draft must never be created.");
        control.mapped = JSON.parse(init.body);
        if (control.loseCreateReply) throw Error("PRIVATE_CREATION_ACK_LOST");
        response = Response.json({ id: INVOICE, status: "DRAFT" }, { status: 201 });
      } else if (stage === "send") {
        control.providerStatus = "UNPAID";
        if (control.loseSendReply) throw Error("PRIVATE_SEND_ACK_LOST");
        response = new Response(null, { status: 202 });
      } else {
        if (control.get401) { control.get401 = false; return new Response("{}", { status: 401 }); }
        if (control.failGet) throw Error("PRIVATE_READ_FAILURE");
        const raw = { id: INVOICE, ...structuredClone(control.mapped), status: control.providerStatus,
          amount: { currency_code: "USD", value: "425.00" }, due_amount: { currency_code: "USD", value: "425.00" } };
        if (control.providerStatus !== "DRAFT") raw.detail.metadata = { recipient_view_url: LINK };
        if (control.mutateProvider) control.mutateProvider(raw);
        response = Response.json(raw);
      }
      if (control.afterFetch) await control.afterFetch(stage); return response;
    } };
  const env = { APP_MODE: "sandbox", PAYPAL_MODE: "paypal_sandbox", PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
    PAYPAL_SANDBOX_CLIENT_ID: "recovery-fixture-client", PAYPAL_SANDBOX_CLIENT_SECRET: "fixture-recovery-secret", DB: database,
    RIGHTS_INVOICE_CONTROLS_ENABLED: "true", RIGHTS_INVOICE_CREATION_ENABLED: "true", RIGHTS_INVOICE_SENDING_ENABLED: "true",
    INVOICE_RECOVERY_ENABLED: "true", HUMAN_CONSENT_ENABLED: "true", HUMAN_CONSENT_ORIGIN: ORIGIN,
    CREATOR_ACCESS_ENABLED: "true", CREATOR_ACCESS_ORIGIN: ORIGIN };
  const authorize = async (_request, caseId) => {
    if (control.onAuthorize) await control.onAuthorize();
    const p = caseId === ids.case ? await f.authorize() : null;
    return p ? { ...p, expiresAt: control.expiresAt } : null;
  };
  const deps = { authorizeCreator: authorize, transport: () => transport, now: f.now };
  const route = createInvoiceRecoveryRoutes(deps), invoices = createInvoiceControlRoutes(deps);
  function request(path, { method = "GET", data, raw, headers = {}, signal } = {}) {
    return new Request(ORIGIN + path, { method, ...(signal ? { signal } : {}),
      headers: { ...(method === "POST" ? { Origin: ORIGIN, "Content-Type": "application/json" } : {}), ...headers },
      ...(method === "POST" ? { body: raw ?? JSON.stringify(data) } : {}) });
  }
  const review = () => route(request(ROOT + "/recovery"), env);
  const create = () => invoices(request(ROOT + "/create", { method: "POST", data: { expectedCaseVersion: f.case().row_version, confirmed: true } }), env);
  const send = () => invoices(request(ROOT + "/send", { method: "POST", data: { expectedCaseVersion: f.case().row_version, invoiceId: INVOICE, confirmed: true } }), env);
  const recover = data => route(request(ROOT + "/recover", { method: "POST", data }), env);
  const cmd = v => ({ expectedCaseVersion: v.caseVersion, operationId: v.operationId, sourceHash: v.sourceHash, action: v.action, confirmed: true });
  async function pendingCreation() { control.failEvent = "invoice.create_dispatched"; await json(await create()); control.failEvent = null; return json(await review()); }
  async function retainedDraft() { control.failEvent = "invoice.draft_bound"; await json(await create()); control.failEvent = null; return json(await review()); }
  async function pendingSend() { await json(await create()); control.failEvent = "invoice.send_dispatched"; await json(await send()); control.failEvent = null; return json(await review()); }
  async function unknownSend() { await json(await create()); control.loseSendReply = true; await json(await send()); control.loseSendReply = false; return json(await review()); }
  return { ...f, env, database, transport, control, calls, deps, route, request, review, create, send, recover, cmd,
    pendingCreation, retainedDraft, pendingSend, unknownSend,
    countStage: stage => calls.filter(c => c.stage === stage).length,
    op: kind => f.db.prepare("SELECT * FROM payment_operations WHERE operation_type=?").get(kind),
    binding: () => f.db.prepare("SELECT * FROM invoice_bindings").get(),
    outbox: () => f.db.prepare("SELECT * FROM paypal_reconciliation_outbox").get(),
    noMoney() { for (const table of ["payment_evidence", "permissions", "receipt_revisions"]) assert.equal(f.count(table), 0); } };
}
async function json(response, expected = 200) { assert.equal(response.status, expected, await response.clone().text()); return response.json(); }
async function withFixture(fn, options) { const f = await fixture(options); try { await fn(f); } finally { f.close(); } }

test("read-only recovery follows consent without provider calls or private data", () => withFixture(async f => {
  let v = await json(await f.review()); assert.equal(v.state, "none"); assert.equal(v.operationId, null); assert.equal(v.action, null);
  await f.approve(); await f.accept(); v = await json(await f.review()); assert.equal(v.stage, "accepted_awaiting_invoice");
  assert.match(v.sourceHash, /^[a-f0-9]{64}$/); assert.equal(v.paymentConfirmed, false); assert.equal(v.permissionGranted, false);
  const response = await f.review(), text = await response.clone().text();
  for (const secret of [f.token, "buyer@example.test", merchant.email, "fixture-recovery-secret", "stateJson", "command_fingerprint", "rightsSummary"])
    assert.ok(!text.includes(secret));
  assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(f.calls.length, 0); f.noMoney();
}, { accepted: false }));

for (const [name, patch] of [["default off", { INVOICE_RECOVERY_ENABLED: undefined }], ["recovery false", { INVOICE_RECOVERY_ENABLED: "false" }],
  ["controls off", { RIGHTS_INVOICE_CONTROLS_ENABLED: "false" }], ["consent off", { HUMAN_CONSENT_ENABLED: "false" }],
  ["access off", { CREATOR_ACCESS_ENABLED: "false" }], ["production", { APP_MODE: "production" }], ["fake", { PAYPAL_MODE: "fake" }],
  ["no database", { DB: undefined }], ["origin mismatch", { HUMAN_CONSENT_ORIGIN: "https://other.test" }]])
  test(`recovery perimeter rejects ${name}`, () => withFixture(async f => {
    await json(await f.route(f.request(ROOT + "/recovery"), { ...f.env, ...patch }), 503); assert.equal(f.calls.length, 0);
  }));
test("unrelated paths fall through, wrong methods and queries are bounded", () => withFixture(async f => {
  assert.equal(await f.route(f.request(ROOT), f.env), null);
  await json(await f.route(f.request(ROOT + "/recover"), f.env), 405);
  await json(await f.route(f.request(ROOT + "/recovery?secret=test"), f.env), 400); assert.equal(f.calls.length, 0);
}));
for (const headers of [{ Origin: "https://evil.test" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }])
  test(`cross-origin recovery denied ${JSON.stringify(headers)}`, () => withFixture(async f => {
    await json(await f.route(f.request(ROOT + "/recovery", { headers }), f.env), 403); assert.equal(f.calls.length, 0);
  }));
test("missing and cross-workspace principals or expired lease cannot inspect", () => withFixture(async f => {
  await json(await createInvoiceRecoveryRoutes({ transport: () => f.transport, now: f.now })(f.request(ROOT + "/recovery"), f.env), 403);
  f.setOwner({ workspaceId: crypto.randomUUID(), actorReference: "creator:other" }); await json(await f.review(), 403);
  f.setOwner({ workspaceId: ids.workspace, actorReference: "creator:fixture" }); f.control.expiresAt = Math.floor(f.now().getTime() / 1000);
  await json(await f.review(), 403); assert.equal(f.calls.length, 0);
}));
test("pending creation resumes the same original operation exactly once", () => withFixture(async f => {
  const v = await f.pendingCreation(); assert.equal(v.state, "creation_reserved"); assert.equal(v.action, "resume_creation");
  assert.equal(f.countStage("create"), 0); const command = f.cmd(v), r = await json(await f.recover(command));
  assert.equal(r.outcome, "draft_bound"); assert.equal(r.operationId, command.operationId); assert.equal(r.sourceHash, command.sourceHash);
  assert.equal(r.invoiceId, INVOICE); assert.equal(r.paymentUrl, null); assert.equal(r.paymentConfirmed, false);
  await json(await f.recover(command), 409); assert.equal(f.countStage("create"), 1); assert.equal(f.countStage("send"), 0); f.noMoney();
}));
test("retained draft binds without any provider request", () => withFixture(async f => {
  const v = await f.retainedDraft(), calls = f.calls.length;
  assert.equal(v.state, "draft_observed"); assert.equal(v.invoiceId, null); assert.equal(v.observedDraftId, INVOICE);
  assert.equal((await json(await f.recover(f.cmd(v)))).outcome, "draft_bound"); assert.equal(f.calls.length, calls);
  assert.equal(f.binding().provider_invoice_id, INVOICE); f.noMoney();
}));
test("unknown create without retained identity remains paused forever without a second POST", () => withFixture(async f => {
  f.control.loseCreateReply = true; await json(await f.create()); const v = await json(await f.review());
  assert.equal(v.state, "creation_unresolved"); assert.equal(v.action, null); assert.equal(v.observedDraftId, null);
  for (let n = 0; n < 3; n++) await json(await f.recover({ ...f.cmd(v), action: "resume_creation" }), 409);
  assert.equal(f.countStage("create"), 1); assert.equal(f.binding().provider_invoice_id, null); f.noMoney();
}));
test("pending sending resumes once and unknown send recovery only reads", () => withFixture(async f => {
  const v = await f.pendingSend(); assert.equal(v.state, "sending_reserved"); assert.equal(v.action, "resume_sending");
  const command = f.cmd(v), r = await json(await f.recover(command)); assert.equal(r.outcome, "delivery_observed"); assert.equal(r.paymentUrl, LINK);
  assert.equal(f.countStage("send"), 1); assert.equal(f.outbox().requested_generation, 1); await json(await f.recover(command), 409);
  assert.equal(f.countStage("send"), 1); assert.equal(f.outbox().requested_generation, 1); f.noMoney();
}));
test("committed send with lost provider reply recovers by GET and records only delivery", () => withFixture(async f => {
  const v = await f.unknownSend(), sends = f.countStage("send"), gets = f.countStage("get");
  assert.equal(v.state, "delivery_unresolved"); assert.equal(v.action, "check_delivery");
  const r = await json(await f.recover(f.cmd(v))); assert.equal(r.outcome, "delivery_observed");
  assert.equal(f.countStage("send"), sends); assert.equal(f.countStage("get"), gets + 1); assert.equal(f.outbox().requested_generation, 1); f.noMoney();
}));
for (const status of ["DRAFT", "UNKNOWN"]) test(`unknown delivery ${status} remains unresolved without resend`, () => withFixture(async f => {
  const v = await f.unknownSend(); f.control.providerStatus = status;
  for (let n = 0; n < 3; n++) assert.equal((await json(await f.recover(f.cmd(v)))).outcome, "awaiting_reconciliation");
  assert.equal(f.countStage("send"), 1); assert.equal(f.outbox(), undefined); f.noMoney();
}));
test("provider PAID label during recovery cannot establish money or permission", () => withFixture(async f => {
  const v = await f.unknownSend(); f.control.providerStatus = "PAID";
  const r = await json(await f.recover(f.cmd(v))); assert.equal(r.outcome, "delivery_observed"); assert.equal(r.paymentUrl, null);
  assert.equal(r.providerStatus, "PAID"); assert.equal(r.paymentConfirmed, false); assert.equal(r.permissionGranted, false); f.noMoney();
}));
for (const [name, mutate] of [["amount", raw => { raw.amount.value = "1.00"; }], ["invoice", raw => { raw.id = OTHER; }],
  ["merchant", raw => { raw.invoicer.email_address = "other@example.test"; }], ["recipient", raw => { raw.primary_recipients[0].billing_info.email_address = "other@example.test"; }],
  ["note", raw => { raw.detail.note = "different"; }], ["summary", raw => { raw.items[0].description = "different"; }]])
  test(`provider ${name} mismatch stays unresolved`, () => withFixture(async f => {
    const v = await f.unknownSend(); f.control.mutateProvider = mutate;
    assert.equal((await json(await f.recover(f.cmd(v)))).outcome, "awaiting_reconciliation"); assert.equal(f.countStage("send"), 1);
    assert.equal(f.op("send_invoice").status, "unknown"); assert.equal(f.outbox(), undefined); f.noMoney();
  }));

for (const [name, mutate] of [["stale version", c => ({ ...c, expectedCaseVersion: c.expectedCaseVersion - 1 })],
  ["wrong operation", c => ({ ...c, operationId: crypto.randomUUID() })], ["wrong source", c => ({ ...c, sourceHash: "0".repeat(64) })],
  ["wrong action", c => ({ ...c, action: "resume_sending" })]]) test(`${name} cannot retarget recovery`, () => withFixture(async f => {
    const v = await f.pendingCreation(); await json(await f.recover(mutate(f.cmd(v))), 409); assert.equal(f.countStage("create"), 0);
  }));
for (const data of [null, [], {}, { confirmed: false }, { action: ["resume_creation"] }, { action: {} }, { expectedCaseVersion: Number.MAX_SAFE_INTEGER },
  { invoiceId: OTHER }, { amountCents: 1 }, { workspaceId: ids.workspace }, { sourceHash: "invalid" }])
  test(`exact command parser rejects malformed ${JSON.stringify(data)}`, () => withFixture(async f => {
    const v = await f.pendingCreation(), c = data && !Array.isArray(data) ? { ...f.cmd(v), ...data } : data;
    // An empty patch is intentionally a missing command, not a valid original command.
    await json(await f.recover(data && !Array.isArray(data) && Object.keys(data).length === 0 ? {} : c), 400); assert.equal(f.calls.length, 0);
  }));
for (const raw of ['{"action":"resume_creation","action":"resume_creation"}', '{bad', ' '.repeat(4097)])
  test("duplicate malformed or oversized request body is rejected", () => withFixture(async f => {
    await json(await f.route(f.request(ROOT + "/recover", { method: "POST", raw }), f.env), 400); assert.equal(f.calls.length, 0);
  }));

for (const event of ["invoice.create_dispatched", "invoice.draft_observed", "invoice.draft_bound"])
  test(`lost committed ${event} acknowledgement never repeats creation`, () => withFixture(async f => {
    const v = await f.pendingCreation(); f.control.loseAckEvent = event; await json(await f.recover(f.cmd(v))); f.control.loseAckEvent = null;
    const fresh = await json(await f.review()); if (fresh.action) await json(await f.recover(f.cmd(fresh)));
    assert.ok(f.countStage("create") <= 1); assert.equal(f.count("invoice_bindings"), 1); f.noMoney();
  }));
test("lost delivery commit acknowledgement cannot duplicate send or outbox", () => withFixture(async f => {
  const v = await f.unknownSend(); f.control.loseAckEvent = "invoice.delivery_observed";
  const r = await json(await f.recover(f.cmd(v))); assert.equal(r.outcome, "already_recorded");
  f.control.loseAckEvent = null; await json(await f.recover(f.cmd(v)), 409);
  assert.equal(f.countStage("send"), 1); assert.equal(f.outbox().requested_generation, 1); f.noMoney();
}));

for (const [name, change] of [["expiry", f => { f.control.expiresAt = Math.floor(f.now().getTime() / 1000); }],
  ["revocation", f => { f.setOwner(null); }], ["configuration", f => { f.env.INVOICE_RECOVERY_ENABLED = "false"; }],
  ["source", f => { f.db.exec("UPDATE licensing_cases SET row_version=row_version+1"); }]])
  test(`${name} during OAuth stops the following provider request`, () => withFixture(async f => {
    const v = await f.unknownSend(), before = f.countStage("get"); f.control.afterFetch = stage => { if (stage === "oauth") change(f); };
    const response = await f.recover(f.cmd(v)); assert.ok([403, 409].includes(response.status), await response.text());
    assert.equal(f.countStage("get"), before); assert.equal(f.countStage("send"), 1); assert.equal(f.outbox(), undefined); f.noMoney();
  }));
test("401 refresh rechecks source before the second GET", () => withFixture(async f => {
  const v = await f.unknownSend(), before = f.countStage("get"); f.control.get401 = true; let oauth = 0;
  f.control.afterFetch = stage => { if (stage === "oauth" && ++oauth === 2) f.db.exec("UPDATE licensing_cases SET row_version=row_version+1"); };
  await json(await f.recover(f.cmd(v)), 409); assert.equal(f.countStage("get"), before + 1); assert.equal(f.countStage("send"), 1); f.noMoney();
}));

for (const [name, change] of [["expiry", f => { f.control.expiresAt = Math.floor(f.now().getTime() / 1000); }],
  ["configuration", f => { f.env.INVOICE_RECOVERY_ENABLED = "false"; }],
  ["source", f => { f.db.exec("UPDATE licensing_cases SET row_version=row_version+1"); }]])
  test(`returned valid draft ID survives ${name} after create without binding or disclosure`, () => withFixture(async f => {
    const v = await f.pendingCreation(); f.control.afterFetch = stage => { if (stage === "create") change(f); };
    const response = await f.recover(f.cmd(v)); assert.ok([403, 409].includes(response.status), await response.text());
    assert.equal(f.op("create_invoice").provider_reference, INVOICE); assert.equal(f.op("create_invoice").error_code, "draft_observed");
    assert.equal(f.binding().provider_invoice_id, null); assert.equal(f.countStage("create"), 1); assert.equal(f.countStage("send"), 0); f.noMoney();
  }));
test("retained reference swap after frozen inspection cannot bind a different draft", () => withFixture(async f => {
  const v = await f.retainedDraft(); let reads = 0, changed = false;
  f.control.afterRead = sql => { if (sql.startsWith("SELECT json_object('consent'") && ++reads === 3) {
    f.db.prepare("UPDATE payment_operations SET provider_reference=? WHERE operation_type='create_invoice'").run(OTHER); changed = true;
  } };
  const response = await f.recover(f.cmd(v)); assert.equal(response.status, 409, await response.text());
  assert.equal(changed, true); assert.equal(f.binding().provider_invoice_id, null); assert.equal(f.countStage("create"), 1); f.noMoney();
}));
test("same-dispatch retained ID swap before bind cannot replace the returned provider reference", () => withFixture(async f => {
  const v = await f.pendingCreation();
  f.control.afterBatch = statements => { if (statements.some(s => s.sql.includes("'invoice.draft_observed'")))
    f.db.prepare("UPDATE payment_operations SET provider_reference=? WHERE operation_type='create_invoice'").run(OTHER); };
  await json(await f.recover(f.cmd(v)), 409); assert.equal(f.binding().provider_invoice_id, null); assert.equal(f.countStage("create"), 1); f.noMoney();
}));

for (const [name, change] of [["verified expiry", f => { f.setTime(new Date(f.control.expiresAt * 1000).toISOString()); }],
  ["configuration", f => { f.env.INVOICE_RECOVERY_ENABLED = "false"; }],
  ["database identity", f => { f.env.DB = { ...f.database }; }]])
  test(`final disclosure read checks ${name} synchronously`, () => withFixture(async f => {
    await f.pendingCreation(); let reads = 0, changed = false;
    f.control.afterRead = sql => { if (sql.startsWith("SELECT json_object('creation'") && ++reads === 2) { change(f); changed = true; } };
    await json(await f.review(), 403); assert.equal(changed, true); assert.equal(f.calls.length, 0); f.noMoney();
  }));
test("source change in final authorization is caught by the final aggregate read", () => withFixture(async f => {
  await f.pendingCreation(); let reads = 0, armed = false, changed = false;
  f.control.afterRead = sql => { if (sql.startsWith("SELECT json_object('consent'") && ++reads === 2) armed = true; };
  f.control.onAuthorize = () => { if (armed && !changed) { f.db.exec("UPDATE licensing_cases SET row_version=row_version+1"); changed = true; } };
  await json(await f.review(), 409); assert.equal(changed, true); assert.equal(f.calls.length, 0); f.noMoney();
}));
for (const [name, change] of [["expiry", f => { f.control.expiresAt = Math.floor(f.now().getTime() / 1000); }],
  ["account identity", f => { f.env.PAYPAL_SANDBOX_CLIENT_ID = "different-client"; }],
  ["database identity", f => { f.env.DB = { ...f.database }; }]])
  test(`401 refresh fences ${name} before its second provider GET`, () => withFixture(async f => {
    const v = await f.unknownSend(), before = f.countStage("get"); f.control.get401 = true; let oauth = 0;
    f.control.afterFetch = stage => { if (stage === "oauth" && ++oauth === 2) change(f); };
    await json(await f.recover(f.cmd(v)), 403); assert.equal(oauth, 2); assert.equal(f.countStage("get"), before + 1);
    assert.equal(f.countStage("send"), 1); assert.equal(f.outbox(), undefined); f.noMoney();
  }));
