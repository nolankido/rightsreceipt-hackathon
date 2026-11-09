import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ids, NOW } from "./support/human-consent-fixture.mjs";
import { transactionBrowserFixture, ORIGIN, INVOICE_PATH, BUYER_STATUS_PATH, BUYER_HANDOFF_PATH, FIXTURE_INVOICE } from "./support/transaction-browser-fixture.mjs";
import { createBuyerPaymentRoutes } from "../apps/api/src/buyer-payment-routes.ts";
import { configuredSandboxTransport } from "../apps/api/src/transaction-routes.ts";

const LINK = "https://www.sandbox.paypal.com/invoice/p/#TRANSACTION_FIXTURE_035";
const keys = value => Object.keys(value).sort();
async function json(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
async function withFixture(fn, { sent = true } = {}) {
  const f = transactionBrowserFixture();
  try {
    if (sent) { await f.approve(); await f.accept(); await f.sendAccepted(); }
    await fn(f);
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { f.close(); }
}
const command = f => ({ expectedCaseVersion: f.case().row_version, invoiceId: FIXTURE_INVOICE, confirmed: true });
const status = f => f.native(BUYER_STATUS_PATH, { buyerToken: f.token });
const handoff = f => f.native(BUYER_HANDOFF_PATH, { method: "POST", buyerToken: f.token, body: command(f) });
function direct(f, { fetch = f.transport.fetch, now = f.now, limit, transport } = {}) {
  const routes = createBuyerPaymentRoutes({ now, ...(limit ? { limit } : {}), transport: transport ?? (env => {
    const t = configuredSandboxTransport(env, fetch); return t ? { ...t, now: f.nowMs } : null;
  }) });
  function req(path = BUYER_STATUS_PATH, { method = "GET", data, raw, token = f.token, headers = {}, signal } = {}) {
    return new Request(ORIGIN + path, { method, ...(signal ? { signal } : {}),
      headers: { Authorization: `Bearer ${token}`, "Sec-Fetch-Site": "same-origin",
        ...(method === "POST" ? { Origin: ORIGIN, "Content-Type": "application/json" } : {}), ...headers },
      ...(method === "POST" ? { body: raw ?? JSON.stringify(data ?? command(f)) } : {}) });
  }
  return { routes, req, read: () => routes(req(), f.environment),
    handoff: options => routes(req(BUYER_HANDOFF_PATH, { method: "POST", ...options }), f.environment) };
}
function hookReads(f, { before, after } = {}) {
  const underlying = f.environment.DB;
  function wrap(sql, statement) {
    return { ...statement, bind(...values) { return wrap(sql, statement.bind(...values)); },
      async first(...args) {
        if (before) await before(sql);
        const result = await statement.first(...args);
        if (after) await after(sql);
        return result;
      } };
  }
  f.environment.DB = { prepare: sql => wrap(sql, underlying.prepare(sql)),
    batch: () => { throw Error("Read-only buyer routes must never write a batch."); } };
}
const fence = sql => sql.startsWith("SELECT 1 AS ok FROM licensing_cases c");
const revoke = f => f.db.prepare("UPDATE buyer_capabilities SET revoked_at=? WHERE buyer_capability_id=?").run(f.now().toISOString(), ids.capability);
const scope = (f, actions) => f.db.prepare("UPDATE buyer_capabilities SET allowed_actions_json=? WHERE buyer_capability_id=?").run(JSON.stringify(actions), ids.capability);
const lifetime = (f, expires) => f.db.prepare("UPDATE buyer_capabilities SET expires_at=? WHERE buyer_capability_id=?").run(expires, ids.capability);
function assertPrivateAbsent(text, f) {
  for (const secret of [f.token, "buyer@example.test", "merchant@example.test", "fixture-transaction-secret", "transaction-fixture-access",
    "stateJson", "sourceJson", "allowed_actions_json", "intended_use_text", "rightsSummary", "recipientEmail", "token_digest_sha256"])
    assert.ok(!text.includes(secret), `Unexpected private field ${secret}`);
}
async function paidReceipt(f) {
  f.controls.providerStatus = "PAID";
  await f.reconcile(); await f.issueReceipt();
  assert.equal(f.binding().invoice_status, "paid"); assert.equal(f.permission().permission_state, "scheduled");
  assert.equal(f.receipt().revision_number, 1);
}

test("local buyer status follows the actual consent and invoice lifecycle without provider reads or writes", () => withFixture(async f => {
  const read = async expected => {
    const before = f.totalChanges(), calls = f.providerCalls.length, v = await json(await status(f));
    assert.equal(v.stage, expected); assert.equal(v.caseVersion, f.case().row_version);
    assert.equal(v.canRequestPaymentLink, false); assert.equal(f.totalChanges(), before); assert.equal(f.providerCalls.length, calls);
    return v;
  };
  assert.equal((await read("awaiting_creator")).invoiceId, null);
  await f.approve(); await read("awaiting_buyer");
  await f.accept(); await read("accepted_awaiting_invoice");
  await json(await f.native(`${INVOICE_PATH}/create`, { method: "POST", body: { expectedCaseVersion: f.case().row_version, confirmed: true } }));
  assert.equal((await read("billing_started")).invoiceStatus, "draft");
  assert.equal(f.providerCount("create"), 1); assert.equal(f.providerCount("send"), 0);
}, { sent: false }));

test("sent status is a safe local allowlist and repeated refreshes have no external I/O", () => withFixture(async f => {
  const calls = f.providerCalls.length, changes = f.totalChanges();
  for (let i = 0; i < 3; i++) {
    const response = await status(f), text = await response.clone().text(), v = await json(response);
    assert.deepEqual(keys(v), ["schemaVersion", "environment", "caseId", "caseVersion", "stage", "invoiceId", "invoiceStatus", "canRequestPaymentLink", "checkedAt", "receipt"].sort());
    assert.deepEqual(keys(v.receipt), ["status", "integrity", "checkedAt", "canReadPrivate", "privatePath", "publicVerificationPath", "record"].sort());
    assert.equal(v.schemaVersion, "buyer-invoice-status-v1"); assert.equal(v.environment, "sandbox");
    assert.equal(v.caseId, ids.case); assert.equal(v.stage, "billing_started"); assert.equal(v.invoiceId, FIXTURE_INVOICE);
    assert.equal(v.invoiceStatus, "sent"); assert.equal(v.canRequestPaymentLink, true);
    assert.equal(v.receipt.status, "pending_payment"); assert.equal(v.receipt.canReadPrivate, false);
    assert.equal(v.receipt.privatePath, null); assert.equal(v.receipt.record, null);
    assert.equal(v.receipt.publicVerificationPath, `/verify/receipt/${f.publicId()}`);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer"); assert.match(response.headers.get("cache-control"), /no-store/u);
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin"); assert.equal(response.headers.get("vary"), "Authorization");
    assertPrivateAbsent(text, f);
  }
  assert.equal(f.providerCalls.length, calls); assert.equal(f.totalChanges(), changes);
}));

test("explicit fresh handoff uses only OAuth and bound invoice GET, with no authority or canonical mutation", () => withFixture(async f => {
  const changes = f.totalChanges(), calls = f.providerCalls.length;
  for (let i = 0; i < 2; i++) {
    const response = await handoff(f), v = await json(response);
    assert.deepEqual(keys(v), ["schemaVersion", "environment", "caseId", "caseVersion", "invoiceId", "providerStatus", "observedAt", "paymentUrl", "expiresInMs", "requiresReconciliation", "paymentConfirmed", "permissionGranted"].sort());
    assert.equal(v.schemaVersion, "buyer-payment-handoff-v1"); assert.equal(v.paymentUrl, LINK);
    assert.equal(v.providerStatus, "UNPAID"); assert.equal(v.expiresInMs, 30000); assert.equal(v.requiresReconciliation, false);
    assert.equal(v.paymentConfirmed, false); assert.equal(v.permissionGranted, false); assert.equal(v.caseVersion, f.case().row_version);
    assertPrivateAbsent(JSON.stringify(v), f);
  }
  assert.deepEqual(f.providerCalls.slice(calls).map(c => c.stage), ["oauth", "get", "oauth", "get"]);
  assert.ok(f.providerCalls.slice(calls).every(c => c.stage === "oauth" || c.path === `/v2/invoicing/invoices/${FIXTURE_INVOICE}`));
  assert.equal(f.totalChanges(), changes); assert.equal(f.count("permissions"), 0); assert.equal(f.count("receipt_revisions"), 0);
  assert.equal(f.providerCount("create"), 1); assert.equal(f.providerCount("send"), 1);
}));

for (const providerStatus of ["PAID", "REFUNDED", "CANCELLED", "AUTO_CANCELLED", "MARKED_AS_PAID", "MARKED_AS_REFUNDED", "PAID_EXTERNAL", "REFUNDED_EXTERNAL", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "PAYMENT_PENDING", "SCHEDULED", "DRAFT", "UNRECOGNIZED"])
  test(`provider ${providerStatus} never grants a payment handoff or changes canonical authority`, () => withFixture(async f => {
    f.controls.providerStatus = providerStatus; const changes = f.totalChanges();
    const v = await json(await handoff(f));
    assert.equal(v.paymentUrl, null); assert.equal(v.expiresInMs, 0); assert.equal(v.requiresReconciliation, true);
    assert.equal(v.paymentConfirmed, false); assert.equal(v.permissionGranted, false);
    assert.equal(f.binding().invoice_status, "sent"); assert.equal(f.count("permissions"), 0); assert.equal(f.count("receipt_revisions"), 0);
    assert.equal(f.totalChanges(), changes);
  }));

for (const providerStatus of ["SENT", "SHARED"])
  test(`validated ${providerStatus} with exactly unpaid settlement permits only the short link`, () => withFixture(async f => {
    f.controls.providerStatus = providerStatus; assert.equal((await json(await handoff(f))).paymentUrl, LINK);
  }));

for (const [name, mutate] of [
  ["invoice ID", raw => { raw.id = "INV2-DIFFERENT-036"; }],
  ["amount", raw => { raw.amount.value = "424.00"; }],
  ["currency", raw => { raw.amount.currency_code = "EUR"; }],
  ["merchant", raw => { raw.invoicer.email_address = "other@example.test"; }],
  ["recipient", raw => { raw.primary_recipients[0].billing_info.email_address = "other@example.test"; }],
  ["invoice number", raw => { raw.detail.invoice_number = "OTHER"; }],
  ["reference", raw => { raw.detail.reference = "RR-OTHER"; }],
  ["rights note", raw => { raw.detail.note += " altered"; }],
  ["item amount", raw => { raw.items[0].unit_amount.value = "1.00"; }],
  ["rights summary", raw => { raw.items[0].description += " altered"; }],
  ["quantity", raw => { raw.items[0].quantity = "2"; }],
]) test(`handoff rejects provider ${name} mismatch`, () => withFixture(async f => {
  f.controls.mutateProvider = mutate; const changes = f.totalChanges();
  assert.deepEqual(await json(await handoff(f), 503), { error: "payment_handoff_unavailable" });
  assert.equal(f.totalChanges(), changes);
}));

for (const [name, mutate] of [
  ["missing due", raw => { delete raw.due_amount; }],
  ["partial due", raw => { raw.due_amount.value = "100.00"; }],
  ["already paid detail", raw => { raw.payments = { paid_amount: { currency_code: "USD", value: "425.00" } }; }],
  ["external paid detail", raw => { raw.payments = { paid_amount: { currency_code: "USD", value: "1.00" }, transactions: [{ type: "EXTERNAL", method: "CASH", amount: { currency_code: "USD", value: "1.00" } }] }; }],
  ["missing recipient link", raw => { delete raw.detail.metadata; }],
]) test(`unpaid-looking provider invoice with ${name} has no link`, () => withFixture(async f => {
  f.controls.mutateProvider = mutate; const v = await json(await handoff(f));
  assert.equal(v.paymentUrl, null); assert.equal(v.requiresReconciliation, true); assert.equal(f.count("permissions"), 0);
}));

for (const url of ["https://www.paypal.com/invoice/p/#LIVE", "https://evil.test/invoice/p/#BAD", "https://www.sandbox.paypal.com.evil.test/invoice/p/#BAD", "javascript:alert(1)", "https://www.sandbox.paypal.com/invoice/p/#BAD?secret", "https://www.sandbox.paypal.com/invoice/p/?token=secret", "https://www.sandbox.paypal.com/invoice/p/#BAD%20LINK"])
  test(`unsafe payment URL is rejected: ${url}`, () => withFixture(async f => {
    f.controls.paymentUrl = url; await json(await handoff(f), 503);
  }));

test("validated payment reconciliation and receipt issuance provide separate canonical status", () => withFixture(async f => {
  f.controls.providerStatus = "PAID";
  const providerOnly = await json(await handoff(f)); assert.equal(providerOnly.paymentConfirmed, false);
  assert.equal((await json(await status(f))).receipt.status, "pending_payment");
  await f.reconcile();
  let v = await json(await status(f)); assert.equal(v.invoiceStatus, "paid"); assert.equal(v.receipt.status, "pending_receipt");
  assert.equal(v.canRequestPaymentLink, false); assert.equal(v.receipt.canReadPrivate, false);
  await f.issueReceipt(); const calls = f.providerCalls.length, changes = f.totalChanges();
  v = await json(await status(f));
  assert.equal(v.receipt.status, "scheduled"); assert.equal(v.receipt.integrity, "verified");
  assert.equal(v.receipt.canReadPrivate, true); assert.equal(v.receipt.privatePath, "/receipts/buyer");
  assert.equal(v.receipt.record.revision, 1); assert.equal(v.receipt.record.asset.title, "Harbor After Rain");
  assert.equal(v.receipt.record.timing.phase, "scheduled"); assert.equal(v.canRequestPaymentLink, false);
  assert.equal(f.providerCalls.length, calls); assert.equal(f.totalChanges(), changes); assertPrivateAbsent(JSON.stringify(v), f);
  await json(await handoff(f), 409); assert.equal(f.providerCalls.length, calls);
}));

test("receipt action is independently required even with a valid review capability and canonical receipt", () => withFixture(async f => {
  await paidReceipt(f); scope(f, ["review"]);
  const v = await json(await status(f));
  assert.equal(v.receipt.integrity, "verified"); assert.equal(v.receipt.record.revision, 1);
  assert.equal(v.receipt.canReadPrivate, false); assert.equal(v.receipt.privatePath, null);
  assert.equal(v.receipt.publicVerificationPath, `/verify/receipt/${f.publicId()}`);
  scope(f, ["receipt"]); await json(await status(f), 403); await json(await handoff(f), 403);
}));

test("refunded canonical receipts remain visible independently of offer validity", () => withFixture(async f => {
  await paidReceipt(f); f.controls.providerStatus = "REFUNDED";
  await f.reconcile({ requestAnotherGeneration: true }); await f.issueReceipt();
  assert.equal(f.permission().permission_state, "refunded");
  f.db.exec("UPDATE assets SET availability='archived'; UPDATE pricing_policy_versions SET status='superseded'");
  const before = f.totalChanges(), calls = f.providerCalls.length, v = await json(await status(f));
  assert.equal(v.invoiceStatus, "fully_refunded"); assert.equal(v.receipt.status, "refunded");
  assert.equal(v.receipt.integrity, "verified"); assert.equal(v.receipt.canReadPrivate, true);
  assert.equal(v.receipt.record.revision, 2); assert.equal(v.canRequestPaymentLink, false);
  assert.equal(f.totalChanges(), before); assert.equal(f.providerCalls.length, calls);
}));

test("paid historical receipt survives an archived asset or inactive pricing policy while handoff remains blocked", () => withFixture(async f => {
  await paidReceipt(f);
  f.db.exec("UPDATE assets SET availability='archived'; UPDATE pricing_policy_versions SET status='superseded'");
  const review = await f.native("/api/consent/buyer/review", { buyerToken: f.token }); assert.equal(review.status, 409);
  const v = await json(await status(f)); assert.equal(v.receipt.status, "scheduled"); assert.equal(v.receipt.canReadPrivate, true);
  assert.equal(v.canRequestPaymentLink, false); await json(await handoff(f), 409);
}));

test("receipt integrity failures expose no record or private navigation", () => withFixture(async f => {
  await paidReceipt(f);
  // A changed asset fingerprint differs from the hashed receipt material and must
  // invalidate its current presentation, without modifying immutable evidence.
  f.db.exec("UPDATE assets SET fingerprint_value='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'");
  const v = await json(await status(f)); assert.equal(v.receipt.integrity, "not_verified");
  assert.equal(v.receipt.canReadPrivate, false); assert.equal(v.receipt.privatePath, null); assert.equal(v.receipt.record, null);
}));

test("receipt disabled or mismatched public origin exposes no receipt link, with one consistent final timestamp", () => withFixture(async f => {
  f.environment.RIGHTS_RECEIPT_READ_ENABLED = "false";
  let tick = f.nowMs(); const d = direct(f, { now: () => new Date(tick++) });
  const v = await json(await d.read()); assert.equal(v.receipt.status, "unavailable");
  assert.equal(v.receipt.checkedAt, v.checkedAt); assert.equal(v.receipt.publicVerificationPath, null); assert.equal(v.canRequestPaymentLink, true);
  f.environment.RIGHTS_RECEIPT_READ_ENABLED = "true"; f.environment.RIGHTS_RECEIPT_PUBLIC_ORIGIN = "https://other.example";
  assert.equal((await json(await status(f))).receipt.publicVerificationPath, null);
}));

for (const [name, sql] of [
  ["blocked reconciliation", "UPDATE paypal_reconciliation_outbox SET blocked_code='financial_review_required'"],
  ["reconciliation lease", "UPDATE paypal_reconciliation_outbox SET lease_token='fixture-lease',lease_expires_at='2026-10-27T19:01:00.000Z'"],
  ["uncertain send", "UPDATE payment_operations SET status='unknown' WHERE operation_type='send_invoice'"],
  ["missing journal", "DELETE FROM paypal_delivery_journal"],
]) test(`existing ${name} suppresses handoff without a provider request`, () => withFixture(async f => {
  f.db.exec(sql); const calls = f.providerCalls.length;
  assert.equal((await json(await status(f))).canRequestPaymentLink, false); await json(await handoff(f), 409);
  assert.equal(f.providerCalls.length, calls);
}));

test("current invoice account identity is bound to configured merchant and client", () => withFixture(async f => {
  for (const [key, value] of [["PAYPAL_SANDBOX_CLIENT_ID", "different-client"], ["PAYPAL_SANDBOX_MERCHANT_EMAIL", "other@example.test"], ["PAYPAL_SANDBOX_MERCHANT_NAME", "Different Merchant"]]) {
    const old = f.environment[key]; f.environment[key] = value;
    assert.equal((await json(await status(f))).canRequestPaymentLink, false); await json(await handoff(f), 409);
    f.environment[key] = old;
  }
  assert.equal(f.providerCount("create"), 1); assert.equal(f.providerCount("send"), 1);
}));

for (const [name, patch] of [
  ["default off", { BUYER_PAYMENT_ENABLED: undefined }], ["consent disabled", { HUMAN_CONSENT_ENABLED: "false" }],
  ["production", { APP_MODE: "production" }], ["fake mode", { PAYPAL_MODE: "fake" }], ["missing database", { DB: undefined }],
  ["HTTP application origin", { HUMAN_CONSENT_ORIGIN: "http://rightsreceipt.example" }],
]) test(`buyer perimeter is closed for ${name}`, () => withFixture(async f => {
  const d = direct(f), calls = f.providerCalls.length;
  assert.deepEqual(await json(await d.routes(d.req(), { ...f.environment, ...patch }), 503), { error: "buyer_payment_unavailable" });
  assert.equal(f.providerCalls.length, calls);
}));

test("unrelated routes pass through; methods, queries and foreign request origins are rejected", () => withFixture(async f => {
  const d = direct(f), calls = f.providerCalls.length;
  assert.equal(await d.routes(d.req("/api/other"), f.environment), null);
  await json(await d.routes(d.req("/api/invoices/buyer/unknown"), f.environment), 404);
  await json(await d.routes(d.req(BUYER_STATUS_PATH + "?token=PRIVATE"), f.environment), 400);
  const wrongMethod = await d.routes(d.req(BUYER_HANDOFF_PATH), f.environment);
  await json(wrongMethod, 405); assert.equal(wrongMethod.headers.get("allow"), "POST");
  await json(await d.routes(new Request("https://other.example" + BUYER_STATUS_PATH), f.environment), 400);
  assert.equal(f.providerCalls.length, calls);
}));

for (const headers of [{ Origin: "https://other.example" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }, { "Sec-Fetch-Site": "none" }])
  test(`status and handoff reject cross-origin metadata ${JSON.stringify(headers)}`, () => withFixture(async f => {
    const d = direct(f), calls = f.providerCalls.length;
    await json(await d.routes(d.req(BUYER_STATUS_PATH, { headers }), f.environment), 403);
    await json(await d.handoff({ headers }), 403); assert.equal(f.providerCalls.length, calls);
  }));

test("handoff requires exact Origin and status permits an absent same-origin Origin header", () => withFixture(async f => {
  const d = direct(f); await json(await d.read());
  for (const value of ["", "null"]) await json(await d.handoff({ headers: { Origin: value } }), 403);
  const request = d.req(BUYER_HANDOFF_PATH, { method: "POST" }); request.headers.delete("origin");
  await json(await d.routes(request, f.environment), 403);
}));

for (const [name, change] of [
  ["revoked", revoke], ["expired", f => lifetime(f, NOW)],
  ["future issuance", f => f.db.prepare("UPDATE buyer_capabilities SET issued_at=?").run("2026-10-28T00:00:00.000Z")],
  ["missing review", f => scope(f, ["clarify", "receipt"])], ["duplicate actions", f => scope(f, ["review", "review"])],
  ["unknown action", f => scope(f, ["review", "payment"])], ["nonsensical action shape", f => scope(f, { review: true })],
]) test(`capability is denied when ${name}`, () => withFixture(async f => {
  change(f); const calls = f.providerCalls.length;
  await json(await status(f), 403); await json(await handoff(f), 403); assert.equal(f.providerCalls.length, calls);
}));

test("unknown capabilities, public receipt IDs and missing bearer never authorize payment reads", () => withFixture(async f => {
  const d = direct(f), calls = f.providerCalls.length;
  for (const token of ["", "a".repeat(43), f.publicId(), ids.case]) await json(await d.routes(d.req(BUYER_STATUS_PATH, { token }), f.environment), 403);
  const request = d.req(); request.headers.delete("authorization"); await json(await d.routes(request, f.environment), 403);
  assert.equal(f.providerCalls.length, calls);
}));

for (const data of [null, [], {}, { expectedCaseVersion: 1, invoiceId: FIXTURE_INVOICE, confirmed: false },
  { expectedCaseVersion: 0, invoiceId: FIXTURE_INVOICE, confirmed: true }, { expectedCaseVersion: 1.5, invoiceId: FIXTURE_INVOICE, confirmed: true },
  { expectedCaseVersion: Number.MAX_SAFE_INTEGER, invoiceId: FIXTURE_INVOICE, confirmed: true },
  { expectedCaseVersion: 1, invoiceId: "unsafe", confirmed: true },
  { expectedCaseVersion: 1, invoiceId: FIXTURE_INVOICE, confirmed: true, paymentUrl: LINK },
  { expectedCaseVersion: 1, invoiceId: FIXTURE_INVOICE, confirmed: true, amountCents: 1 }])
  test(`handoff rejects non-exact command ${JSON.stringify(data)}`, () => withFixture(async f => {
    const d = direct(f), calls = f.providerCalls.length;
    await json(await d.handoff({ raw: JSON.stringify(data) }), 400); assert.equal(f.providerCalls.length, calls);
  }));

test("stale version or different invoice cannot start a provider read", () => withFixture(async f => {
  const d = direct(f), calls = f.providerCalls.length;
  await json(await d.handoff({ data: { ...command(f), expectedCaseVersion: 1 } }), 409);
  await json(await d.handoff({ data: { ...command(f), invoiceId: "INV2-OTHER-036" } }), 409);
  assert.equal(f.providerCalls.length, calls);
}));

test("duplicate JSON keys, escaped duplicates, invalid UTF-8 and bounded body metadata fail closed", () => withFixture(async f => {
  const d = direct(f), calls = f.providerCalls.length;
  for (const raw of [`{"expectedCaseVersion":8,"invoiceId":"${FIXTURE_INVOICE}","confirmed":true,"confirmed":true}`,
    `{"expectedCaseVersion":8,"invoiceId":"${FIXTURE_INVOICE}","confirmed":true,"confir\\u006ded":true}`, "{bad", " ".repeat(4097), new Uint8Array([0xff])])
    await json(await d.handoff({ raw }), 400);
  for (const headers of [{ "Content-Type": "text/plain" }, { "Content-Encoding": "gzip" }, { "Content-Length": "4097" }, { "Content-Length": "wrong" }])
    await json(await d.handoff({ headers }), 400);
  assert.equal(f.providerCalls.length, calls);
}));

test("route limiter persists and missing merchant transport cannot enable payment", () => withFixture(async f => {
  const d = direct(f, { transport: () => null }), calls = f.providerCalls.length;
  for (let i = 0; i < 60; i++) assert.equal((await json(await d.read())).canRequestPaymentLink, false);
  const limited = await d.read(); await json(limited, 429); assert.equal(limited.headers.get("retry-after"), "60");
  await json(await direct(f, { transport: () => null }).handoff(), 503); assert.equal(f.providerCalls.length, calls);
}));

for (const providerStage of ["oauth", "get"])
  for (const [name, change, expected] of [
    ["revocation", revoke, 403], ["expiry", f => f.setTime("2026-10-29T19:00:00.000Z"), 403],
    ["scope removal", f => scope(f, ["receipt"]), 403],
    ["rotation", f => f.db.exec("UPDATE buyer_capabilities SET rotation_number=rotation_number+1"), 409],
    ["source revision", f => f.db.exec("UPDATE licensing_cases SET row_version=row_version+1"), 409],
    ["disabled flag", f => { f.environment.BUYER_PAYMENT_ENABLED = "false"; }, 403],
    ["changed client", f => { f.environment.PAYPAL_SANDBOX_CLIENT_ID = "different-client"; }, 403],
    ["changed merchant", f => { f.environment.PAYPAL_SANDBOX_MERCHANT_EMAIL = "other@example.test"; }, 403],
  ]) test(`${name} during ${providerStage} prevents handoff and preserves public error classification`, () => withFixture(async f => {
    const before = f.providerCalls.length;
    f.controls.beforeProvider = stage => { if (stage === providerStage) change(f); };
    await json(await handoff(f), expected);
    const stages = f.providerCalls.slice(before).map(c => c.stage);
    assert.deepEqual(stages, providerStage === "oauth" ? ["oauth"] : ["oauth", "get"]);
    assert.equal(f.count("permissions"), 0);
  }));

test("capability token rotation after invoice response headers denies the original bearer", () => withFixture(async f => {
  f.controls.beforeProvider = stage => {
    if (stage === "get") f.db.prepare("UPDATE buyer_capabilities SET token_digest_sha256=?").run(createHash("sha256").update("b".repeat(43)).digest("hex"));
  };
  await json(await handoff(f), 403);
}));

for (const [name, change, expected] of [
  ["revocation", revoke, 403], ["source revision", f => f.db.exec("UPDATE licensing_cases SET row_version=row_version+1"), 409],
]) test(`${name} during streamed invoice response body is checked before a link returns`, () => withFixture(async f => {
  const d = direct(f, { fetch: async (url, init) => {
    const response = await f.transport.fetch(url, init); if (init.method !== "GET") return response;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(bytes.slice(0, 1)); },
      async pull(controller) { await Promise.resolve(); change(f); controller.enqueue(bytes.slice(1)); controller.close(); },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  await json(await d.handoff(), expected);
}));

test("request abort during OAuth and during final SQL blocks the handoff", () => withFixture(async f => {
  for (const boundary of ["oauth", "final-sql"]) {
    const abort = new AbortController(); let afterGet = false;
    f.controls.beforeProvider = stage => { if (stage === "oauth" && boundary === "oauth") abort.abort(); if (stage === "get") afterGet = true; };
    let count = 0;
    if (boundary === "final-sql") hookReads(f, { after: async sql => { if (afterGet && fence(sql) && ++count === 2) abort.abort(); } });
    const d = direct(f); await json(await d.handoff({ signal: abort.signal }), 403);
  }
}));

test("capability revocation during the final combined SQL query prevents a status disclosure", () => withFixture(async f => {
  hookReads(f, { before: async sql => { if (fence(sql)) { await Promise.resolve(); revoke(f); } } });
  await json(await status(f), 403);
}));

test("changed source during the final handoff SQL fence invalidates the observed provider URL", () => withFixture(async f => {
  let afterGet = false, count = 0;
  f.controls.beforeProvider = stage => { if (stage === "get") afterGet = true; };
  hookReads(f, { before: async sql => {
    if (afterGet && fence(sql) && ++count === 2) { await Promise.resolve(); f.db.exec("UPDATE licensing_cases SET row_version=row_version+1"); }
  } });
  assert.deepEqual(await json(await handoff(f), 409), { error: "stale_revision" });
}));

test("capability expiry while the final SQL result is pending is checked synchronously afterwards", () => withFixture(async f => {
  lifetime(f, "2026-10-27T19:00:10.000Z"); let afterGet = false, count = 0;
  f.controls.beforeProvider = stage => { if (stage === "get") afterGet = true; };
  hookReads(f, { after: async sql => { if (afterGet && fence(sql) && ++count === 2) { await Promise.resolve(); f.setTime("2026-10-27T19:00:10.000Z"); } } });
  await json(await handoff(f), 403);
}));

test("handoff freshness is measured from request start, not delayed provider response receipt", () => withFixture(async f => {
  f.controls.beforeProvider = stage => { if (stage === "get") f.setTime("2026-10-27T19:00:31.000Z"); };
  const v = await json(await handoff(f)); assert.equal(v.paymentUrl, null); assert.equal(v.expiresInMs, 0);
  assert.equal(v.paymentConfirmed, false); assert.equal(v.permissionGranted, false);
}));

test("remaining handoff lifetime shrinks for network time and capability expiry", () => withFixture(async f => {
  lifetime(f, "2026-10-27T19:00:20.000Z");
  f.controls.beforeProvider = stage => { if (stage === "get") f.setTime("2026-10-27T19:00:07.000Z"); };
  const v = await json(await handoff(f)); assert.equal(v.paymentUrl, LINK); assert.equal(v.expiresInMs, 13000);
}));

test("license end bounds handoff expiry, including the final SQL delay across midnight", () => withFixture(async f => {
  lifetime(f, "2027-12-31T23:59:59.000Z"); f.setTime("2027-01-29T23:59:50.000Z");
  const first = await json(await handoff(f)); assert.equal(first.paymentUrl, LINK); assert.equal(first.expiresInMs, 10000);
  let afterGet = false, count = 0;
  f.controls.beforeProvider = stage => { if (stage === "get") afterGet = true; };
  hookReads(f, { after: async sql => { if (afterGet && fence(sql) && ++count === 2) f.setTime("2027-01-30T00:00:00.000Z"); } });
  const v = await json(await handoff(f)); assert.equal(v.paymentUrl, null); assert.equal(v.expiresInMs, 0);
  assert.equal((await json(await status(f))).canRequestPaymentLink, false);
}));

test("status rejects a receipt whose UTC day changes during the final combined read", () => withFixture(async f => {
  await paidReceipt(f); f.setTime("2026-10-27T23:59:59.999Z");
  hookReads(f, { after: async sql => { if (fence(sql)) { await Promise.resolve(); f.setTime("2026-10-28T00:00:00.000Z"); } } });
  assert.deepEqual(await json(await status(f), 409), { error: "stale_revision" });
}));

test("failed provider reads are safe retryable errors and never leak exception text", () => withFixture(async f => {
  const d = direct(f, { fetch: async () => { throw Error("PRIVATE_TRANSPORT_ERROR buyer@example.test"); } });
  const changes = f.totalChanges(); assert.deepEqual(await json(await d.handoff(), 503), { error: "payment_handoff_unavailable" });
  assert.equal(f.totalChanges(), changes); assert.equal((await json(await status(f))).canRequestPaymentLink, true);
}));
