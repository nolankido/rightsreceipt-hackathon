import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runCreate, runCheck, runWebhook } from "./paypal-sandbox-acceptance.mjs";
import { evaluateAcceptanceEvidence } from "./paypal-acceptance-evidence-check.mjs";

const INVOICE = "INV2-ACCEPTANCE-049";
const PAY = "https://www.sandbox.paypal.com/invoice/p/#SAFE049";
const env = () => ({
  PAYPAL_SANDBOX_CLIENT_ID: "acceptance-client-049",
  PAYPAL_SANDBOX_CLIENT_SECRET: "acceptance-secret-049",
  PAYPAL_SANDBOX_MERCHANT_NAME: "Maya Chen Test Studio",
  PAYPAL_SANDBOX_MERCHANT_EMAIL: "merchant@example.test",
  PAYPAL_SANDBOX_BUYER_EMAIL: "buyer@example.test",
  PAYPAL_SANDBOX_WEBHOOK_ID: "WH-ACCEPTANCE-049",
  PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL: "https://rightsreceipt-sandbox.workers.dev/webhooks/paypal/sandbox",
});

function paypalFixture() {
  let mapped = null, status = "DRAFT";
  const paymentDate = new Date().toISOString().slice(0,10);
  const money = value => ({ currency_code: "USD", value });
  function invoice() {
    const detail = { ...mapped.detail };
    if (status === "UNPAID") detail.metadata = { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/#SAFE049" };
    const value = {
      id: INVOICE,
      ...mapped,
      detail,
      status,
      amount: money("425.00"),
      due_amount: money(status === "PAID" ? "0.00" : "425.00"),
    };
    if (status === "PAID") {
      value.payments = {
        paid_amount: money("425.00"),
        transactions: [{ type: "PAYPAL", method: "PAYPAL", payment_id: "PAYTEST049", payment_date: paymentDate, amount: money("425.00") }],
      };
    }
    return value;
  }
  const fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path === "/v1/oauth2/token") {
      return Response.json({ token_type: "Bearer", access_token: "fixture-access-token", expires_in: 3600 });
    }
    if (path === "/v1/notifications/webhooks" && init.method === "GET") {
      return Response.json({ webhooks: [{
        id: "WH-ACCEPTANCE-049",
        url: "https://rightsreceipt-sandbox.workers.dev/webhooks/paypal/sandbox",
        event_types: [{ name: "INVOICING.INVOICE.PAID" }],
      }] });
    }

    if (path === "/v2/invoicing/invoices" && init.method === "POST") {
      mapped = JSON.parse(init.body);
      return Response.json({ id: INVOICE, status: "DRAFT" }, { status: 201 });
    }
    if (path === `/v2/invoicing/invoices/${INVOICE}/send` && init.method === "POST") {
      status = "UNPAID";
      return new Response("", { status: 202 });
    }
    if (path === `/v2/invoicing/invoices/${INVOICE}` && init.method === "GET") return Response.json(invoice());
    throw new Error("Unexpected PayPal fixture request");
  };
  return { fetch, paid() { status = "PAID"; } };
}

test("acceptance harness creates, sends, checks paid state and keeps published evidence redacted", async () => {
  const base = join(".data", `sandbox-acceptance-test-${randomUUID()}`);
  mkdirSync(base, { recursive: true });
  try {
    const provider = paypalFixture();
    const created = await runCreate({ env: env(), fetchImpl: provider.fetch, output: base });
    assert.equal(created.status, "passed");
    assert.equal(created.evidence.invoice.invoiceId, INVOICE);
    assert.equal(created.evidence.invoice.status, "UNPAID");
    assert.equal(created.evidence.invoice.paymentUrlPresent, true);
    assert.equal(created.evidence.invoice.settlement.conclusion, "unpaid");
    assert.equal(created.evidence.canonicalAmountCents, 42500);
    assert.equal(created.evidence.webhookRegistration.status, "passed");
    assert.equal(created.evidence.webhookRegistration.exactCallbackChecked, true);
    assert.match(created.evidence.stateSha256, /^[a-f0-9]{64}$/u);
    assert.equal(created.evidence.webhookRegistration.subscribedEvent, "INVOICING.INVOICE.PAID");
    assert.match(created.evidence.webhookRegistration.webhookIdSha256, /^[0-9a-f]{64}$/u);
    assert.ok(created.evidence.httpCalls.every(call => call.path.startsWith("/v")));
    assert.ok(created.handoffPath);
    assert.equal(readFileSync(created.handoffPath, "utf8"), PAY + "\n");

    const evidenceText = readFileSync(created.evidencePath, "utf8");
    const stateText = readFileSync(created.statePath, "utf8");
    assert.equal(created.evidence.stateSha256, (await import("node:crypto")).createHash("sha256").update(stateText).digest("hex"));
    assert.equal(evidenceText.includes(PAY), false);
    assert.equal(stateText.includes(PAY), false);
    for (const forbidden of [env().PAYPAL_SANDBOX_CLIENT_SECRET, env().PAYPAL_SANDBOX_BUYER_EMAIL, "fixture-access-token", "SAFE049"]) {
      assert.ok(!evidenceText.includes(forbidden));
    }
    for (const forbidden of [env().PAYPAL_SANDBOX_CLIENT_SECRET, env().PAYPAL_SANDBOX_BUYER_EMAIL, "fixture-access-token"]) {
      assert.ok(!stateText.includes(forbidden));
    }

    // An unpaid read restores a private URL without creating or resending an invoice.
    const pendingBase = join(base, "pending-check");
    mkdirSync(pendingBase);
    const pending = await runCheck({ env: env(), fetchImpl: provider.fetch, state: created.statePath, output: pendingBase });
    assert.equal(pending.status, "payment_pending");
    assert.equal(pending.evidence.status, "payment_pending");
    assert.equal(pending.evidence.errorCode, "buyer_payment_pending");
    assert.equal(pending.evidence.invoice.status, "UNPAID");
    assert.equal(readFileSync(pending.handoffPath, "utf8"), PAY + "\n");
    assert.equal(JSON.stringify(pending.evidence).includes(PAY), false);
    assert.equal(pending.evidence.httpCalls.some(call => call.path.endsWith("/send")), false);

    provider.paid();
    const checked = await runCheck({ env: env(), fetchImpl: provider.fetch, state: created.statePath, output: base });
    assert.equal(checked.status, "passed");
    assert.equal(checked.evidence.invoice.status, "PAID");
    assert.equal(checked.evidence.stateSha256, created.evidence.stateSha256);
    assert.equal(checked.handoffPath, null);
    assert.equal(existsSync(join(checked.directory, "sandbox-payment-link.txt")), false);
    assert.equal(checked.evidence.invoice.settlement.conclusion, "paid");
    assert.equal(checked.evidence.invoice.settlement.paidCents, 42500);
    assert.equal(checked.evidence.invoice.settlement.dueCents, 0);

    const capturePath = join(base, "webhook-capture.json");
    const raw = JSON.stringify({
      id: "WH-EVENT-049",
      event_type: "INVOICING.INVOICE.PAID",
      create_time: new Date().toISOString(),
      resource: { id: INVOICE, status: "PAID" },
    });
    writeFileSync(capturePath, JSON.stringify({
      schemaVersion: "rightsreceipt-paypal-webhook-capture-v1",
      headers: {
        "paypal-transmission-id": "transmission-049",
        "paypal-transmission-time": new Date().toISOString(),
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-ACCEPTANCE049",
        "paypal-transmission-sig": Buffer.alloc(64,7).toString("base64"),
      },
      body: raw,
    }, null, 2));

    const webhookFetch = async url => new URL(url).pathname === "/v1/oauth2/token"
      ? Response.json({ token_type: "Bearer", access_token: "webhook-fixture-token", expires_in: 3600 })
      : Response.json({ verification_status: "SUCCESS" });
    const webhook = await runWebhook({
      env: env(), fetchImpl: webhookFetch, capture: capturePath, state: created.statePath, output: base,
    });
    assert.equal(webhook.status, "passed");
    assert.equal(webhook.evidence.webhook.providerInvoiceId, INVOICE);
    assert.equal(webhook.evidence.webhook.eventType, "INVOICING.INVOICE.PAID");
    assert.equal(webhook.evidence.webhook.verificationStatus, "verified");
    assert.equal(webhook.evidence.webhook.webhookIdSha256, created.evidence.webhookRegistration.webhookIdSha256);
    const linked = evaluateAcceptanceEvidence({ create: created.evidence, paid: checked.evidence, webhook: webhook.evidence });
    assert.equal(linked.status, "passed", JSON.stringify(linked.errorCodes));
    const premature = evaluateAcceptanceEvidence({ create: created.evidence, paid: pending.evidence, webhook: webhook.evidence });
    assert.equal(premature.status, "failed");
    assert.ok(premature.errorCodes.includes("paid_provenance_invalid"));
    const webhookText = readFileSync(webhook.evidencePath,"utf8");
    assert.ok(!webhookText.includes("paypal-transmission-sig"));
    assert.ok(!webhookText.includes(Buffer.alloc(64,7).toString("base64")));
    assert.ok(!webhookText.includes("webhook-fixture-token"));

    const captured = JSON.parse(readFileSync(capturePath, "utf8"));
    for (const [label, eventType, resourceStatus, invoiceId, expectedCode] of [
      ["sent-event", "INVOICING.INVOICE.SENT", "UNPAID", INVOICE, "webhook_not_paid"],
      ["partial-payment", "INVOICING.INVOICE.PAID", "PARTIALLY_PAID", INVOICE, "webhook_not_paid"],
      ["other-invoice", "INVOICING.INVOICE.PAID", "PAID", "INV2-DIFFERENT-049", "invoice_mismatch"],
    ]) {
      const caseDirectory = join(base, label);
      mkdirSync(caseDirectory);
      captured.body = JSON.stringify({ id: "WH-CASE-" + label, event_type: eventType,
        create_time: new Date().toISOString(), resource: { id: invoiceId, status: resourceStatus } });
      writeFileSync(capturePath, JSON.stringify(captured));
      const attempt = await runWebhook({ env: env(), fetchImpl: webhookFetch,
        capture: capturePath, state: created.statePath, output: caseDirectory });
      assert.equal(attempt.status, "failed", label);
      assert.equal(attempt.evidence.errorCode, expectedCode, label);
      assert.equal(attempt.evidence.webhook, undefined, label);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("a PAID label with missing financial transaction proof cannot pass the paid acceptance stage", async () => {
  const base = join(".data", "sandbox-acceptance-incomplete-payment-" + randomUUID());
  mkdirSync(base, { recursive: true });
  try {
    const provider = paypalFixture();
    const created = await runCreate({ env: env(), fetchImpl: provider.fetch, output: base });
    assert.equal(created.status, "passed");
    provider.paid();
    const withoutFinancialProof = async (url, init) => {
      const response = await provider.fetch(url, init);
      if (new URL(url).pathname !== "/v2/invoicing/invoices/" + INVOICE || init?.method !== "GET") {
        return response;
      }
      const body = await response.json();
      delete body.payments;
      return Response.json(body);
    };
    const checked = await runCheck({ env: env(), fetchImpl: withoutFinancialProof,
      state: created.statePath, output: base });
    assert.equal(checked.status, "failed");
    assert.equal(checked.evidence.status, "failed");
    assert.equal(checked.evidence.errorCode, "settlement_not_proven");
    assert.equal(checked.handoffPath, null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("webhook acceptance refuses to report success without a trusted invoice state", async () => {
  let networkCalls = 0;
  await assert.rejects(() => runWebhook({ env: env(), capture: ".data/unused-capture.json",
    fetchImpl: async () => { networkCalls++; throw new Error("must not run"); } }),
  error => error.code === "state_required");
  assert.equal(networkCalls, 0);
});

test("acceptance harness fails closed before HTTP when Sandbox configuration is incomplete", async () => {
  const broken = env(); delete broken.PAYPAL_SANDBOX_CLIENT_SECRET;
  await assert.rejects(() => runCreate({ env: broken, fetchImpl: async () => { throw new Error("must not run"); } }),
    error => error.code === "configuration_missing");
});

test("private Sandbox output refuses symlink paths into tracked source before provider requests", async t => {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const sink = join(projectRoot, 'sandbox-private-sink-' + randomUUID());
  mkdirSync(sink);
  mkdirSync(join(projectRoot, '.data'), { recursive: true });
  const aliases = [join(projectRoot, '.data', 'sandbox-alias-' + randomUUID()),
    join(tmpdir(), 'sandbox-external-alias-' + randomUUID())];
  try {
    for (const alias of aliases) {
      try { symlinkSync(sink, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
      catch (error) {
        if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
          t.skip('This filesystem does not allow directory symlinks'); return;
        }
        throw error;
      }
      try {
        for (const output of [alias, join(alias, 'not-created-yet')]) {
          const provider = paypalFixture();
          let networkCalls = 0;
          const fetchImpl = async (url, init) => {
            networkCalls++;
            return provider.fetch(url, init);
          };
          await assert.rejects(runCreate({ env: env(), fetchImpl, output }),
            error => error.code === 'unsafe_private_path');
          assert.equal(networkCalls, 0, 'Unsafe output must fail before any provider request');
          assert.deepEqual(readdirSync(sink), [], 'No private evidence may reach tracked source');
        }
      } finally { unlinkSync(alias); }
    }
  } finally { rmSync(sink, { recursive: true, force: true }); }
});

test("a real external private directory remains a supported Sandbox evidence destination", async () => {
  const destination = mkdtempSync(join(tmpdir(), 'rr-sandbox-output-'));
  try {
    const created = await runCreate({ env: env(), fetchImpl: paypalFixture().fetch, output: destination });
    assert.equal(created.status, 'passed');
    assert.ok(created.evidencePath.startsWith(destination));
    assert.ok(existsSync(created.statePath));
  } finally { rmSync(destination, { recursive: true, force: true }); }
});


test("lost send acknowledgement preserves started journal state for read-only reconciliation", async () => {
  const base = join(".data", `sandbox-acceptance-uncertain-${randomUUID()}`);
  mkdirSync(base, { recursive: true });
  try {
    let mapped = null;
    const fetchImpl = async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === "/v1/oauth2/token") return Response.json({ token_type: "Bearer", access_token: "fixture-access-token", expires_in: 3600 });
      if (path === "/v1/notifications/webhooks" && init.method === "GET") {
        return Response.json({ webhooks: [{
          id: "WH-ACCEPTANCE-049",
          url: "https://rightsreceipt-sandbox.workers.dev/webhooks/paypal/sandbox",
          event_types: [{ name: "INVOICING.INVOICE.PAID" }],
        }] });
      }
      if (path === "/v2/invoicing/invoices" && init.method === "POST") {
        mapped = JSON.parse(init.body); return Response.json({ id: INVOICE, status: "DRAFT" }, { status: 201 });
      }
      if (path === `/v2/invoicing/invoices/${INVOICE}` && init.method === "GET") {
        return Response.json({ id: INVOICE, ...mapped, status: "DRAFT",
          amount: { currency_code: "USD", value: "425.00" }, due_amount: { currency_code: "USD", value: "425.00" } });
      }
      if (path === `/v2/invoicing/invoices/${INVOICE}/send` && init.method === "POST") throw new Error("lost response after provider commit");
      throw new Error("unexpected request");
    };
    const result = await runCreate({ env: env(), fetchImpl, output: base });
    assert.equal(result.status, "failed");
    assert.equal(result.evidence.errorCode, "unknown_send_outcome");
    assert.ok(result.statePath);
    assert.equal(result.handoffPath ?? null, null);
    assert.equal(existsSync(join(result.directory, "sandbox-payment-link.txt")), false);
    const state = JSON.parse(readFileSync(result.statePath,"utf8"));
    assert.equal(state.invoiceId, INVOICE);
    assert.equal(state.entry.sendState, "started");
    assert.equal(state.phase, "failed_unknown_send_outcome");
    assert.ok(!readFileSync(result.evidencePath,"utf8").includes("lost response after provider commit"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});


test("a live PayPal destination in invoice metadata cannot become a private Sandbox handoff", async () => {
  const base = join(".data", `sandbox-acceptance-hostile-link-${randomUUID()}`);
  mkdirSync(base, { recursive: true });
  try {
    const provider = paypalFixture();
    const fetchImpl = async (url, init = {}) => {
      const response = await provider.fetch(url, init);
      if (new URL(url).pathname === `/v2/invoicing/invoices/${INVOICE}` && init.method === "GET") {
        const invoice = await response.json();
        invoice.detail.metadata.recipient_view_url = "https://www.paypal.com/invoice/p/#NOT_SANDBOX";
        return Response.json(invoice);
      }
      return response;
    };
    const result = await runCreate({ env: env(), fetchImpl, output: base });
    assert.equal(result.status, "failed");
    assert.equal(result.handoffPath ?? null, null);
    assert.equal(existsSync(join(result.directory, "sandbox-payment-link.txt")), false);
    assert.equal(readFileSync(result.evidencePath, "utf8").includes("NOT_SANDBOX"), false);
    assert.ok(result.statePath, "draft/send state is retained for safe reconciliation");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});


test("a webhook registered to a different Sandbox app blocks invoice creation before the first POST", async () => {
  let invoiceRequests = 0, called = 0;
  const fetchImpl = async url => {
    called++;
    const path = new URL(url).pathname;
    if (path === "/v1/oauth2/token") {
      return Response.json({ token_type: "Bearer", access_token: "fixture-access-token", expires_in: 3600 });
    }
    if (path === "/v1/notifications/webhooks") {
      return Response.json({ webhooks: [{
        id: "WH-OTHER-APP-071",
        url: "https://rightsreceipt-sandbox.workers.dev/webhooks/paypal/sandbox",
        event_types: [{ name: "INVOICING.INVOICE.PAID" }],
      }] });
    }
    if (path.startsWith("/v2/invoicing")) invoiceRequests++;
    throw new Error("Invoice transport must not run after failed preflight");
  };
  await assert.rejects(runCreate({ env: env(), fetchImpl }),
    error => error.code === "webhook_preflight_registration_missing");
  assert.equal(called, 2);
  assert.equal(invoiceRequests, 0);
});

test("missing configured webhook prevents invoice API calls", async () => {
  let calls = 0;
  const missing = env();
  delete missing.PAYPAL_SANDBOX_WEBHOOK_ID;
  await assert.rejects(runCreate({ env: missing, fetchImpl: async () => { calls++; throw new Error("unexpected"); } }),
    error => error.code === "webhook_preflight_configuration_missing");
  assert.equal(calls, 0);
});


test("every acceptance API request stays on Sandbox and forbids automatic redirects", async () => {
  const base = join(".data", "sandbox-acceptance-redirect-082-" + randomUUID());
  mkdirSync(base, { recursive: true });
  try {
    const provider = paypalFixture();
    const paths = [];
    const fetchImpl = async (url, init = {}) => {
      const target = new URL(url);
      assert.equal(target.origin, "https://api-m.sandbox.paypal.com");
      assert.equal(init.redirect, "manual", target.pathname);
      paths.push(target.pathname);
      return provider.fetch(url, init);
    };
    const created = await runCreate({ env: env(), fetchImpl, output: base });
    assert.equal(created.status, "passed");
    provider.paid();
    const checked = await runCheck({ env: env(), fetchImpl, state: created.statePath, output: base });
    assert.equal(checked.status, "passed");
    for (const path of [
      "/v1/oauth2/token", "/v1/notifications/webhooks",
      "/v2/invoicing/invoices",
      "/v2/invoicing/invoices/" + INVOICE + "/send",
      "/v2/invoicing/invoices/" + INVOICE,
    ]) assert.ok(paths.includes(path), path);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("a redirect from invoice creation fails closed without buyer handoff or production request", async () => {
  const base = join(".data", "sandbox-acceptance-no-redirect-082-" + randomUUID());
  mkdirSync(base, { recursive: true });
  try {
    const provider = paypalFixture();
    const attempted = [];
    const fetchImpl = async (url, init = {}) => {
      const path = new URL(url).pathname;
      attempted.push({ path, redirect: init.redirect });
      if (path === "/v2/invoicing/invoices" && init.method === "POST") {
        assert.equal(init.redirect, "manual");
        return Response.redirect("https://api-m.paypal.com/v2/invoicing/invoices", 302);
      }
      return provider.fetch(url, init);
    };
    const result = await runCreate({ env: env(), fetchImpl, output: base });
    assert.equal(result.status, "failed");
    assert.equal(result.handoffPath ?? null, null);
    assert.ok(attempted.some(call => call.path === "/v2/invoicing/invoices"));
    assert.ok(attempted.every(call => call.redirect === "manual"));
    assert.ok(attempted.every(call => !call.path.includes("/v2/invoicing/invoices/INV2")));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
