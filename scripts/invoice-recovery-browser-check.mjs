/**
 * Authenticated invoice recovery in an intercepted HTTPS browser. The real
 * Worker routes, signed Access verifier, canonical services and production
 * SQLite migrations run locally. Provider HTTP and the Access gateway are
 * injected; no socket is opened and no external provider is contacted.
 *
 * Failure setup uses the actual create/send commands and transaction faults.
 * No operation, payment evidence, permission or receipt is manufactured.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { transactionBrowserFixture, ORIGIN, CREATOR_PATH, INVOICE_PATH, FIXTURE_INVOICE } from "./support/transaction-browser-fixture.mjs";
import { NOW } from "./support/human-consent-fixture.mjs";

const moduleName = process.env.RR_PLAYWRIGHT_MODULE;
const playwright = await import(moduleName ? pathToFileURL(createRequire(import.meta.url).resolve(moduleName)).href : "playwright");
const { chromium } = playwright.default ?? playwright;
const directory = resolve(process.env.RR_RECOVERY_ARTIFACTS || join(tmpdir(), "rightsreceipt-invoice-recovery-browser"));
mkdirSync(directory, { recursive: true });
const RECOVERY_READ = `${INVOICE_PATH}/recovery`, RECOVERY_COMMAND = `${INVOICE_PATH}/recover`;
const checks = [], scenarios = [];
const report = {
  mode: "intercepted HTTPS browser requests to actual authenticated invoice recovery routes",
  limitations: ["No listening server, deployed Worker, actual Access gateway or Cloudflare D1",
    "Generated RSA Access assertions and injected signing keys", "Injected Sandbox provider HTTP only",
    "Synthetic initial buyer request, prepared rights and deterministic quote",
    "Financial continuity runs real reconciliation and receipt issuance against injected transaction details",
    "Clock and private-view lifecycle changes are injected by the browser harness"],
  runtime: process.version, passed: 0, checks, scenarios,
};
let scenarioName = "setup";
function check(label, condition = true) {
  assert.ok(condition, `${scenarioName}: ${label}`);
  checks.push({ scenario: scenarioName, check: label });
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function waitForHold(promise) {
  let timer;
  try {
    await Promise.race([promise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("The expected recovery response did not arrive.")), 15000);
    })]);
  } finally { clearTimeout(timer); }
}
async function browserBridge(context, fixture) {
  const drops = new Map(), holds = new Map(), outstanding = new Set();
  const errors = [], pageErrors = [], unexpectedOrigins = [];
  context.on("page", page => page.on("pageerror", error => pageErrors.push(error.message)));
  await context.route("**/*", route => {
    const task = (async () => {
      const incoming = route.request(), url = new URL(incoming.url());
      if (url.origin !== ORIGIN) {
        unexpectedOrigins.push(url.origin);
        await route.abort("blockedbyclient"); return;
      }
      const key = `${incoming.method()} ${url.pathname}`, body = incoming.postDataBuffer();
      const response = await fixture.dispatch(new Request(incoming.url(), {
        method: incoming.method(), headers: await incoming.allHeaders(),
        ...(body && !["GET", "HEAD"].includes(incoming.method()) ? { body } : {}),
      }), { browser: true });
      const held = holds.get(key);
      if (held) { holds.delete(key); held.arrived.resolve(); await held.release.promise; }
      const remaining = drops.get(key) ?? 0;
      if (remaining > 0) { drops.set(key, remaining - 1); await route.abort("failed").catch(() => {}); return; }
      try {
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()) });
      } catch (error) {
        // A held response may arrive after the browser's expiry/visibility
        // fence deliberately aborts it. That is the expected lifecycle case.
        if (!held) throw error;
      }
    })();
    outstanding.add(task);
    task.catch(error => errors.push(error.message)).finally(() => outstanding.delete(task));
    return task;
  });
  return { errors, pageErrors, unexpectedOrigins,
    dropNext(path) { drops.set(`POST ${path}`, 1); },
    holdNext(path, method = "POST") {
      const entry = { arrived: deferred(), release: deferred() };
      holds.set(`${method} ${path}`, entry);
      return { arrived: entry.arrived.promise, release: entry.release.resolve };
    },
    async settle() { await Promise.allSettled([...outstanding]); },
  };
}
function posted(fixture) {
  return fixture.requests.filter(row => row.browser && row.method === "POST" && row.path === RECOVERY_COMMAND);
}
function createOperation(fixture) {
  return fixture.db.prepare("SELECT * FROM payment_operations WHERE case_id=? AND operation_type='create_invoice'").get(fixture.caseId);
}
function noFinancialAuthority(fixture) {
  for (const table of ["payment_evidence", "permissions", "receipt_revisions", "paypal_lifecycle_observations"]) {
    assert.equal(fixture.count(table), 0, `${table} must remain empty before financial verification`);
  }
}
async function creatorReady(page) {
  await page.waitForFunction(() => (document.getElementById("offer")?.children.length ?? 0) > 0
    && !document.getElementById("invoice-panel").hidden
    && document.getElementById("status").textContent.includes("Current offer."));
}
async function openCreator(context, fixture) {
  const writes = fixture.totalChanges(), calls = fixture.providerCalls.length, commands = posted(fixture).length;
  const page = await context.newPage();
  await page.goto(ORIGIN + CREATOR_PATH, { waitUntil: "domcontentloaded" });
  await creatorReady(page);
  check("opening the authenticated recovery view performs no SQL writes, provider HTTP or recovery command",
    fixture.totalChanges() === writes && fixture.providerCalls.length === calls && posted(fixture).length === commands);
  return page;
}
async function reloadCreator(page) {
  const ready = page.waitForResponse(response => new URL(response.url()).pathname === RECOVERY_READ
    && response.request().method() === "GET");
  await page.locator("#reload").click(); await ready; await creatorReady(page);
}
async function recoveryView(fixture) {
  const writes = fixture.totalChanges(), calls = fixture.providerCalls.length;
  const response = await fixture.native(RECOVERY_READ);
  assert.equal(response.status, 200);
  const view = await response.json();
  assert.equal(view.schemaVersion, "invoice-recovery-v1");
  assert.equal(view.paymentConfirmed, false); assert.equal(view.permissionGranted, false);
  assert.equal(fixture.totalChanges(), writes); assert.equal(fixture.providerCalls.length, calls);
  return view;
}
async function accepted(fixture) { await fixture.approve(); await fixture.accept(); }
async function create(fixture) {
  const view = await (await fixture.native(INVOICE_PATH)).json();
  const response = await fixture.native(`${INVOICE_PATH}/create`, { method: "POST",
    body: { expectedCaseVersion: view.caseVersion, confirmed: true } });
  assert.equal(response.status, 200); return response.json();
}
async function send(fixture) {
  const view = await (await fixture.native(INVOICE_PATH)).json();
  const response = await fixture.native(`${INVOICE_PATH}/send`, { method: "POST",
    body: { expectedCaseVersion: view.caseVersion, invoiceId: view.invoiceId, confirmed: true } });
  assert.equal(response.status, 200); return response.json();
}
function failBatch(fixture, event) {
  const original = fixture.adapter.batch;
  fixture.adapter.batch = async statements => {
    const matches = statements.some(statement => statement.values?.includes(event));
    const previous = fixture.faults.at;
    if (matches) fixture.faults.at = 0;
    try { return await original(statements); }
    finally { fixture.faults.at = previous; }
  };
  return () => { fixture.adapter.batch = original; };
}
function loseProviderReply(fixture, stage) {
  const original = fixture.transport.fetch;
  let remaining = 1;
  fixture.transport.fetch = async (url, init) => {
    const response = await original(url, init);
    const matches = stage === "create" ? url.endsWith("/v2/invoicing/invoices") && init.method === "POST" : url.endsWith("/send");
    if (matches && remaining-- > 0) throw new Error("Synthetic provider acknowledgement lost after provider commit.");
    return response;
  };
  return () => { fixture.transport.fetch = original; };
}
async function prepare(fixture, state) {
  await accepted(fixture);
  if (state === "creation_reserved" || state === "draft_observed") {
    const restore = failBatch(fixture, state === "creation_reserved" ? "invoice.create_dispatched" : "invoice.draft_bound");
    try { assert.equal((await create(fixture)).outcome, "retry_pending"); } finally { restore(); }
    return;
  }
  if (state === "creation_unresolved") {
    const restore = loseProviderReply(fixture, "create");
    try { assert.equal((await create(fixture)).outcome, "awaiting_reconciliation"); } finally { restore(); }
    return;
  }
  assert.equal((await create(fixture)).outcome, "draft_bound");
  const restore = state === "sending_reserved" ? failBatch(fixture, "invoice.send_dispatched") : loseProviderReply(fixture, "send");
  try { assert.equal((await send(fixture)).outcome, state === "sending_reserved" ? "retry_pending" : "awaiting_reconciliation"); }
  finally { restore(); }
}
async function assertRecoveryConfirmation(page) {
  await page.locator("#recovery-form").waitFor({ state: "visible" });
  check("recovery starts with a separate unchecked confirmation and disabled button",
    !await page.locator("#recovery-confirm").isChecked() && await page.locator("#recovery-command").isDisabled());
  check("the recovery action explains its effect before confirmation", (await page.locator("#recovery-copy").innerText()).trim().length > 30);
}
async function recover(page, { status = 200 } = {}) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === RECOVERY_COMMAND
    && response.request().method() === "POST");
  await page.locator("#recovery-confirm").check(); await page.locator("#recovery-command").click();
  const response = await pending;
  assert.equal(response.status(), status);
  const result = await response.json();
  if (status === 200) {
    assert.equal(result.schemaVersion, "invoice-recovery-result-v1");
    assert.equal(result.paymentConfirmed, false); assert.equal(result.permissionGranted, false);
    await creatorReady(page);
  } else {
    await page.waitForFunction(() => document.getElementById("offer").children.length === 0);
  }
  return result;
}
async function assertCommandIdentity(fixture, view) {
  const command = JSON.parse(posted(fixture).at(-1).body);
  check("the browser submits only the exact reviewed recovery identity and explicit confirmation",
    Object.keys(command).sort().join() === ["expectedCaseVersion", "operationId", "sourceHash", "action", "confirmed"].sort().join()
    && command.expectedCaseVersion === view.caseVersion && command.operationId === view.operationId
    && command.sourceHash === view.sourceHash && command.action === view.action && command.confirmed === true);
  check("recovery requests keep session assertions out of page-authored headers and URLs",
    posted(fixture).every(row => !row.browserAssertionPresent && !row.buyerAuthorizationPresent && !row.urlHasQuery));
}
async function assertReadOnlyReload(page, fixture) {
  const writes = fixture.totalChanges(), calls = fixture.providerCalls.length, commands = posted(fixture).length;
  await reloadCreator(page);
  check("loading and reloading recovery metadata performs no SQL writes, provider HTTP or recovery command",
    fixture.totalChanges() === writes && fixture.providerCalls.length === calls && posted(fixture).length === commands);
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.RR_CHROMIUM ? { executablePath: process.env.RR_CHROMIUM } : {}), args: ["--no-sandbox"] });
report.browser = browser.version();
async function scenario(name, run, { financial = false } = {}) {
  scenarioName = name;
  const fixture = transactionBrowserFixture();
  fixture.environment.INVOICE_RECOVERY_ENABLED = "true";
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
  context.setDefaultTimeout(10000);
  await context.addCookies([{ name: "fixture_gateway_cookie", value: "not-an-access-assertion", domain: "rightsreceipt.example",
    path: "/", httpOnly: true, secure: true, sameSite: "Strict" }]);
  const bridge = await browserBridge(context, fixture);
  try {
    assert.equal(fixture.migrationHashes.length, 9);
    await run({ fixture, context, bridge });
    await bridge.settle();
    assert.deepEqual(bridge.errors, []); assert.deepEqual(bridge.pageErrors, []); assert.deepEqual(bridge.unexpectedOrigins, []);
    if (!financial) noFinancialAuthority(fixture);
    check("real routes and browser scripts finish with no external request, script error or fabricated financial authority");
    scenarios.push({ name, financialLifecycleExecuted: financial,
      browserRequests: fixture.requests.filter(row => row.browser).length,
      generatedSignatureVerifications: "actual WebCrypto verifier", jwksReads: fixture.keyRequests.length,
      migrations: fixture.migrationHashes,
      providerCalls: Object.fromEntries(["oauth", "create", "send", "get"].map(stage => [stage, fixture.providerCount(stage)])),
      durableRows: Object.fromEntries(["creator_decisions", "buyer_acceptances", "invoice_bindings", "payment_operations",
        "payment_evidence", "permissions", "receipt_revisions"].map(table => [table, fixture.count(table)])) });
    console.log(JSON.stringify({ scenario: name, passed: checks.filter(row => row.scenario === name).length }));
  } finally {
    await context.close(); await bridge.settle(); fixture.close();
  }
}

try {
  await scenario("never_dispatched_creation_requires_explicit_resume", async ({ fixture: f, context }) => {
    await prepare(f, "creation_reserved");
    check("a failed actual claim retains one never-dispatched operation", createOperation(f).status === "pending"
      && createOperation(f).attempt_count === 0 && f.providerCount("create") === 0);
    const page = await openCreator(context, f), view = await recoveryView(f);
    check("saved metadata offers only the never-dispatched creation action", view.state === "creation_reserved" && view.action === "resume_creation");
    await assertRecoveryConfirmation(page); await assertReadOnlyReload(page, f);
    const result = await recover(page); await assertCommandIdentity(f, view);
    check("confirmed resume binds exactly one provider draft without sending it", result.outcome === "draft_bound"
      && f.providerCount("create") === 1 && f.providerCount("send") === 0 && f.binding().provider_invoice_id === FIXTURE_INVOICE);
    check("draft recovery reveals the separate unchecked send form", await page.locator("#send-form").isVisible()
      && !await page.locator("#send-confirm").isChecked() && await page.locator("#send-invoice").isDisabled());
  });

  await scenario("retained_provider_draft_binds_locally", async ({ fixture: f, context }) => {
    await prepare(f, "draft_observed");
    const page = await openCreator(context, f), view = await recoveryView(f);
    check("a retained actual provider response is distinguishable from an unknown creation", view.state === "draft_observed"
      && view.action === "record_draft" && view.observedDraftId === FIXTURE_INVOICE && f.binding().provider_invoice_id === null);
    await assertRecoveryConfirmation(page); await assertReadOnlyReload(page, f);
    await page.screenshot({ path: join(directory, "retained-draft-recovery-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check("mobile recovery content has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(directory, "retained-draft-recovery-mobile.png"), fullPage: true });
    const calls = f.providerCalls.length, result = await recover(page); await assertCommandIdentity(f, view);
    check("recording the retained draft makes no provider request and keeps the original invoice", result.outcome === "draft_bound"
      && f.providerCalls.length === calls && f.providerCount("create") === 1 && f.binding().provider_invoice_id === FIXTURE_INVOICE);
    check("one binding and one creation operation remain after recovery", f.count("invoice_bindings") === 1
      && f.count("payment_operations") === 1 && createOperation(f).status === "succeeded");
  });

  await scenario("unknown_creation_without_reference_remains_paused", async ({ fixture: f, context }) => {
    await prepare(f, "creation_unresolved");
    const page = await openCreator(context, f), view = await recoveryView(f);
    check("provider-committed creation with lost reply remains explicitly unresolved", view.state === "creation_unresolved"
      && view.action === null && view.observedDraftId === null && f.controls.mappedDraft !== null
      && createOperation(f).attempt_count === 1 && f.providerCount("create") === 1);
    check("the unresolved panel explains the pause without an actionable retry", await page.locator("#recovery-panel").isVisible()
      && await page.locator("#recovery-form").isHidden() && await page.locator("#create-form").isHidden()
      && (await page.locator("#recovery-status").innerText()).trim().length > 40);
    await assertReadOnlyReload(page, f);
    const writes = f.totalChanges(), calls = f.providerCalls.length;
    const forged = await f.native(RECOVERY_COMMAND, { method: "POST", body: {
      expectedCaseVersion: view.caseVersion, operationId: view.operationId, sourceHash: view.sourceHash,
      action: "resume_creation", confirmed: true,
    } });
    check("a fabricated resume action cannot bypass the unknown creation pause", forged.status === 409
      && f.totalChanges() === writes && f.providerCalls.length === calls && f.binding().provider_invoice_id === null);
    await page.screenshot({ path: join(directory, "unknown-creation-paused.png"), fullPage: true });
  });

  await scenario("never_dispatched_send_requires_explicit_resume", async ({ fixture: f, context }) => {
    await prepare(f, "sending_reserved");
    const page = await openCreator(context, f), view = await recoveryView(f);
    check("a failed actual send claim preserves a never-dispatched send", view.state === "sending_reserved" && view.action === "resume_sending"
      && f.sendOperation().status === "pending" && f.sendOperation().attempt_count === 0 && f.providerCount("send") === 0);
    await assertRecoveryConfirmation(page); await assertReadOnlyReload(page, f);
    const result = await recover(page); await assertCommandIdentity(f, view);
    check("confirmed resume sends the exact invoice once and requests one reconciliation generation", result.outcome === "delivery_observed"
      && f.providerCount("create") === 1 && f.providerCount("send") === 1 && f.sendOperation().status === "succeeded"
      && f.outbox().requested_generation === 1 && f.outbox().completed_generation === 0);
  });

  await scenario("lost_send_reply_recovers_by_get_before_financial_verification", async ({ fixture: f, context }) => {
    await prepare(f, "delivery_unresolved");
    const page = await openCreator(context, f), view = await recoveryView(f);
    check("the lost provider acknowledgement exposes a GET-only delivery check", view.state === "delivery_unresolved"
      && view.action === "check_delivery" && f.sendOperation().status === "unknown" && f.providerCount("send") === 1);
    await assertRecoveryConfirmation(page); await assertReadOnlyReload(page, f);
    f.controls.providerStatus = "PAID";
    const beforeGets = f.providerCount("get"), result = await recover(page); await assertCommandIdentity(f, view);
    check("unknown delivery recovery performs one GET and no repeat send", result.outcome === "delivery_observed"
      && f.providerCount("get") === beforeGets + 1 && f.providerCount("send") === 1 && f.providerCount("create") === 1);
    check("an observed PAID invoice stays separate from payment and permission", result.paymentUrl === null
      && f.binding().invoice_status === "reconciliation_required" && f.outbox().requested_generation === 1);
    noFinancialAuthority(f);
    const reconciliation = await f.reconcile(), issuance = await f.issueReceipt();
    check("the real financial consumer establishes evidence only after recovery", reconciliation.consumer === "financial_lifecycle"
      && reconciliation.outcomes.applied === 1 && f.count("payment_evidence") === 1 && f.count("permissions") === 1);
    check("the real receipt issuer publishes the recovered transaction's canonical revision", issuance.outcome === "issued"
      && f.count("receipt_revisions") === 1 && f.receipt().payload_hash === issuance.hash);
    const paid = await recoveryView(f);
    check("completed paid receipt metadata remains readable without another recovery action", paid.state === "complete"
      && paid.action === null && paid.invoiceStatus === "paid" && paid.operationStatus === "succeeded");
    await reloadCreator(page);
    check("the creator can still read the completed paid record with recovery controls hidden",
      await page.locator("#recovery-panel").isHidden() && await page.locator("#recovery-form").isHidden()
      && (await page.locator("#invoice-info").innerText()).includes("Payment recorded"));
    check("financial continuity never recreates or resends the invoice", f.providerCount("create") === 1 && f.providerCount("send") === 1);
  }, { financial: true });

  await scenario("invalid_provider_observation_does_not_enable_resend", async ({ fixture: f, context }) => {
    await prepare(f, "delivery_unresolved");
    const page = await openCreator(context, f);
    f.controls.mutateProvider = raw => { raw.amount.value = "999.00"; };
    let result = await recover(page);
    check("mismatched provider content leaves the delivery unresolved", result.outcome === "awaiting_reconciliation"
      && f.sendOperation().status === "unknown" && f.outbox() === undefined && f.providerCount("send") === 1);
    await assertRecoveryConfirmation(page);
    f.controls.mutateProvider = null; f.controls.providerStatus = "DRAFT";
    result = await recover(page);
    check("a DRAFT observation never justifies another send", result.outcome === "awaiting_reconciliation"
      && f.sendOperation().status === "unknown" && f.providerCount("send") === 1 && f.outbox() === undefined);
    await assertRecoveryConfirmation(page);
    f.controls.providerStatus = "UNPAID";
    result = await recover(page);
    check("a later exact sent observation can complete with one total send", result.outcome === "delivery_observed"
      && f.sendOperation().status === "succeeded" && f.providerCount("send") === 1 && f.outbox().requested_generation === 1);
  });

  await scenario("lost_browser_recovery_reply_keeps_exact_frozen_command", async ({ fixture: f, context, bridge }) => {
    await prepare(f, "delivery_unresolved");
    const page = await openCreator(context, f), view = await recoveryView(f);
    bridge.dropNext(RECOVERY_COMMAND);
    await page.locator("#recovery-confirm").check(); await page.locator("#recovery-command").click();
    await page.waitForFunction(() => document.getElementById("recovery-command").textContent === "Retry this recovery command");
    check("the uncertain browser reply retains one exact confirmed command", posted(f).length === 1
      && f.sendOperation().status === "succeeded" && f.outbox().requested_generation === 1);
    await assertCommandIdentity(f, view);
    const calls = f.providerCalls.length, writes = f.totalChanges();
    const response = page.waitForResponse(value => new URL(value.url()).pathname === RECOVERY_COMMAND && value.request().method() === "POST");
    await page.locator("#recovery-command").click();
    assert.equal((await response).status(), 409);
    await page.waitForFunction(() => document.getElementById("offer").children.length === 0);
    check("identical retry gets a stale response after success without another provider call or write", posted(f).length === 2
      && posted(f)[0].body === posted(f)[1].body && f.providerCalls.length === calls && f.totalChanges() === writes
      && f.providerCount("send") === 1 && f.outbox().requested_generation === 1);
    await reloadCreator(page);
    check("explicit reload reveals the recorded result with recovery action cleared", (await recoveryView(f)).state === "complete"
      && await page.locator("#recovery-form").isHidden() && f.outbox().requested_generation === 1);
  });

  await scenario("stale_review_and_cross_workspace_commands_clear_private_state", async ({ fixture: f, context }) => {
    await prepare(f, "draft_observed");
    const page = await openCreator(context, f);
    f.db.prepare("UPDATE licensing_cases SET row_version=row_version+1 WHERE case_id=?").run(f.caseId);
    let writes = f.totalChanges(), calls = f.providerCalls.length;
    await recover(page, { status: 409 });
    check("a stale reviewed revision cannot bind a retained invoice", f.totalChanges() === writes && f.providerCalls.length === calls
      && f.binding().provider_invoice_id === null && await page.locator("#recovery-panel").isHidden());
    await reloadCreator(page); f.controls.gatewayActor = "other";
    writes = f.totalChanges(); calls = f.providerCalls.length;
    await recover(page, { status: 403 });
    check("a different workspace cannot recover or retain private offer content", f.totalChanges() === writes && f.providerCalls.length === calls
      && f.binding().provider_invoice_id === null && await page.locator("#offer").innerText() === ""
      && await page.locator("#recovery-panel").isHidden());
  });

  await scenario("expired_session_during_oauth_prevents_provider_read", async ({ fixture: f, context }) => {
    await prepare(f, "delivery_unresolved");
    const page = await openCreator(context, f), calls = f.providerCount("get"), writes = f.totalChanges();
    const original = f.transport.fetch;
    f.transport.fetch = async (url, init) => {
      const response = await original(url, init);
      if (url.endsWith("/token")) f.setTime(new Date(Date.parse(NOW) + 1800001).toISOString());
      return response;
    };
    await recover(page, { status: 403 });
    check("verified session expiry during OAuth prevents the next provider GET and completion", f.providerCount("get") === calls
      && f.totalChanges() === writes && f.sendOperation().status === "unknown" && f.outbox() === undefined);
    check("an expired recovery clears its checkbox, invoice reference and private view", await page.locator("#offer").innerText() === ""
      && await page.locator("#recovery-info").innerText() === "" && !await page.locator("#recovery-confirm").isChecked());
  });

  await scenario("configuration_change_during_oauth_prevents_provider_read", async ({ fixture: f, context }) => {
    await prepare(f, "delivery_unresolved");
    const page = await openCreator(context, f), calls = f.providerCount("get"), writes = f.totalChanges();
    const original = f.transport.fetch;
    f.transport.fetch = async (url, init) => {
      const response = await original(url, init);
      if (url.endsWith("/token")) f.environment.INVOICE_RECOVERY_ENABLED = "false";
      return response;
    };
    const result = page.waitForResponse(value => new URL(value.url()).pathname === RECOVERY_COMMAND && value.request().method() === "POST");
    await page.locator("#recovery-confirm").check(); await page.locator("#recovery-command").click();
    const response = await result;
    check("a changed recovery configuration returns no successful recovery result", [403, 409, 503].includes(response.status()));
    check("configuration revocation during OAuth prevents provider read and durable completion", f.providerCount("get") === calls
      && f.totalChanges() === writes && f.sendOperation().status === "unknown" && f.outbox() === undefined);
  });

  await scenario("source_change_during_provider_read_cannot_complete", async ({ fixture: f, context }) => {
    await prepare(f, "delivery_unresolved");
    const page = await openCreator(context, f), calls = f.providerCount("get");
    let afterMutation = null;
    f.controls.beforeProvider = stage => {
      if (stage !== "get") return;
      f.controls.beforeProvider = null;
      f.db.prepare("UPDATE assets SET title=? WHERE asset_id=(SELECT asset_id FROM licensing_cases WHERE case_id=?)")
        .run("Changed source during recovery", f.caseId);
      afterMutation = f.totalChanges();
    };
    await recover(page, { status: 409 });
    check("a changed canonical source suppresses completion after an observed provider response", f.providerCount("get") === calls + 1
      && afterMutation !== null && f.totalChanges() === afterMutation && f.sendOperation().status === "unknown" && f.outbox() === undefined);
    check("the stale provider result cannot restore a private view or payment handoff", await page.locator("#offer").innerText() === ""
      && await page.locator("#recovery-panel").isHidden() && !(await page.content()).includes(f.controls.paymentUrl));
  });

  await scenario("late_recovery_reply_cannot_reopen_hidden_private_view", async ({ fixture: f, context, bridge }) => {
    await prepare(f, "draft_observed");
    const page = await openCreator(context, f), hold = bridge.holdNext(RECOVERY_COMMAND);
    try {
      await page.locator("#recovery-confirm").check(); await page.locator("#recovery-command").click();
      await waitForHold(hold.arrived);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } finally { hold.release(); }
    await bridge.settle();
    check("a late successful bind cannot reopen a hidden private review", f.binding().provider_invoice_id === FIXTURE_INVOICE
      && await page.locator("#offer").innerText() === "" && await page.locator("#recovery-panel").isHidden()
      && await page.locator("#recovery-info").innerText() === "");
    check("hidden recovery retains no browser storage or retry authority", await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0)
      && !await page.locator("#recovery-confirm").isChecked() && await page.locator("#recovery-command").isDisabled()
      && posted(f).length === 1 && f.providerCount("create") === 1);
  });

  report.passed = checks.length; report.status = "passed";
  writeFileSync(join(directory, "checks.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: checks.length, scenarios: scenarios.length, artifacts: directory, mode: report.mode }, null, 2));
} catch (error) {
  report.passed = checks.length; report.status = "failed";
  report.failure = { scenario: scenarioName, message: error.message };
  writeFileSync(join(directory, "checks.json"), JSON.stringify(report, null, 2) + "\n");
  throw error;
} finally { await browser.close(); }
