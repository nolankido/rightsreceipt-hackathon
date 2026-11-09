/**
 * Real native handlers and production SQLite migrations for the browser
 * integration check. Only the Access gateway/JWKS and PayPal HTTP are fixtures.
 * Nothing in this module binds a socket, contacts a provider, or emits secrets.
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { consentFixture, ids, NOW } from "./human-consent-fixture.mjs";
import { createCreatorSessionAuthorization } from "../../apps/api/src/creator-session.ts";
import { createTransactionRoutes, configuredSandboxTransport } from "../../apps/api/src/transaction-routes.ts";
import { createReceiptRoutes } from "../../apps/api/src/receipt-routes.ts";
import { runPayPalReconciliation } from "../../apps/api/src/paypal-reconciliation.ts";
import { issueSandboxReceipt } from "../../apps/api/src/receipt-issuance.ts";
import { createPayPalSandboxInvoiceAdapter } from "../../packages/paypal/src/sandbox-invoice.ts";
import { createD1DeliveryJournal } from "../../packages/paypal/src/delivery-journal.ts";
import { createD1ReconciliationStore } from "../../packages/paypal/src/reconciliation-store.ts";

export const ORIGIN = "https://rightsreceipt.example";
export const CREATOR_PATH = `/creator/review/${ids.case}`;
export const INVOICE_PATH = `/api/invoices/creator/cases/${ids.case}`;
export const CONSENT_PATH = `/api/consent/creator/cases/${ids.case}`;
export const BUYER_ACCEPT_PATH = "/api/consent/buyer/accept";
export const BUYER_STATUS_PATH = "/api/invoices/buyer/status";
export const BUYER_HANDOFF_PATH = "/api/invoices/buyer/handoff";
export const FIXTURE_INVOICE = "INV2-BROWSER-TRANSACTION-035";
const ISSUER = "https://rightsreceipt-fixture.cloudflareaccess.com";
const AUDIENCE = "a".repeat(64);
const SUBJECT = "30000000-0000-4000-8000-000000000001";
const OTHER_SUBJECT = "30000000-0000-4000-8000-000000000002";
const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000099";
const MERCHANT = Object.freeze({ name: "Browser Fixture Merchant", email: "merchant@example.test" });
const KEY_ID = "transaction-browser-fixture";
const keypair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...keypair.publicKey.export({ format: "jwk" }), kid: KEY_ID, use: "sig", alg: "RS256" };
const seconds = Date.parse(NOW) / 1000;

function assertion(subject) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = { iss: ISSUER, aud: [AUDIENCE], sub: subject, email: "creator@example.test", type: "app",
    iat: seconds - 10, nbf: seconds - 10, exp: seconds + 1800 };
  const input = `${encode({ alg: "RS256", kid: KEY_ID, typ: "JWT" })}.${encode(payload)}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), keypair.privateKey).toString("base64url")}`;
}
const assertions = new Map([["creator", assertion(SUBJECT)], ["other", assertion(OTHER_SUBJECT)]]);

function creatorPath(path) {
  return path.startsWith("/creator/") || path.startsWith("/api/creator/")
    || path.startsWith("/api/consent/creator/") || path.startsWith("/api/invoices/creator/")
    || path.startsWith("/api/clarification/creator/")
    || path.startsWith("/api/intake/creator/")
    || path === "/assets/creator-review.js" || path === "/assets/creator-clarification.js"
    || path === "/assets/creator-request-intake.js";
}

export function transactionBrowserFixture({ initialCase = true, initialTerms = true, requestText } = {}) {
  const fixture = consentFixture({ initialCase, initialTerms, ...(requestText === undefined ? {} : { requestText }) });
  let caseId = initialCase ? ids.case : null, buyerToken = initialCase ? fixture.token : null;
  if (initialCase) fixture.db.prepare("UPDATE verification_records SET public_verification_id=? WHERE verification_record_id=?")
    .run(Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url"), ids.verification);
  const requests = [], providerCalls = [], keyRequests = [];
  const controls = { gatewayActor: "creator", providerStatus: "DRAFT", mappedDraft: null,
    paymentUrl: "https://www.sandbox.paypal.com/invoice/p/#TRANSACTION_FIXTURE_035",
    beforeProvider: null, mutateProvider: null, omitFinancialDetail: false };

  // The delivery journal uses run(); all other persistence shares the existing
  // atomic D1-shaped batch adapter and the real SQLite connection.
  function statement(sql, values = []) {
    return { sql, values, bind(...next) { return statement(sql, next); },
      async first() { return fixture.db.prepare(sql).get(...values) ?? null; },
      async all() { return { success: true, results: fixture.db.prepare(sql).all(...values) }; },
      async run() {
        const result = fixture.db.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      } };
  }
  const database = { prepare: statement, batch: statements => fixture.adapter.batch(statements) };
  const environment = {
    APP_MODE: "sandbox", PAYPAL_MODE: "paypal_sandbox", PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
    PAYPAL_SANDBOX_CLIENT_ID: "transaction-fixture-client", PAYPAL_SANDBOX_CLIENT_SECRET: "fixture-transaction-secret",
    PAYPAL_SANDBOX_MERCHANT_NAME: MERCHANT.name, PAYPAL_SANDBOX_MERCHANT_EMAIL: MERCHANT.email,
    HUMAN_CONSENT_ENABLED: "true", HUMAN_CONSENT_ORIGIN: ORIGIN,
    RIGHTS_INVOICE_CONTROLS_ENABLED: "true", RIGHTS_INVOICE_CREATION_ENABLED: "true", RIGHTS_INVOICE_SENDING_ENABLED: "true",
    BUYER_PAYMENT_ENABLED: "true", RIGHTS_RECEIPT_READ_ENABLED: "true", RIGHTS_RECEIPT_PUBLIC_ORIGIN: ORIGIN,
    PAYPAL_RECONCILIATION_ENABLED: "true", PAYPAL_PERMISSION_LIFECYCLE_ENABLED: "true", RIGHTS_RECEIPT_ISSUANCE_ENABLED: "true",
    CREATOR_ACCESS_ENABLED: "true", CREATOR_ACCESS_ORIGIN: ORIGIN,
    CREATOR_ACCESS_ISSUER: ISSUER, CREATOR_ACCESS_AUDIENCE: AUDIENCE,
    CREATOR_ACCESS_PRINCIPALS: JSON.stringify([
      { subject: SUBJECT, workspaceId: ids.workspace, validAfter: seconds - 20 },
      { subject: OTHER_SUBJECT, workspaceId: OTHER_WORKSPACE, validAfter: seconds - 20 },
    ]),
    CREATOR_REVIEW_ENABLED: "true", BUYER_REVIEW_ENABLED: "true", CLARIFICATION_ENABLED: "true", REQUEST_INTAKE_ENABLED: "true", DB: database,
  };
  const now = () => fixture.now().getTime();
  const sessions = createCreatorSessionAuthorization({ now, fetch: async (url, init) => {
    assert.equal(url, `${ISSUER}/cdn-cgi/access/certs`);
    assert.equal(init.method, "GET");
    keyRequests.push({ method: init.method, path: "/cdn-cgi/access/certs" });
    return Response.json({ keys: [jwk] });
  } });

  const transport = { merchant: MERCHANT, sandboxDraftTransportEnabled: true, now, fetch: async (url, init) => {
    assert.equal(new URL(url).origin, "https://api-m.sandbox.paypal.com");
    const stage = url.endsWith("/token") ? "oauth" : url.endsWith("/send") ? "send" : init.method === "POST" ? "create" : "get";
    // Retain only synthetic request bodies and stable idempotency identifiers.
    const headers = new Headers(init.headers);
    providerCalls.push({ stage, method: init.method, path: new URL(url).pathname,
      requestId: headers.get("paypal-request-id"), body: stage === "oauth" ? null : init.body ?? null });
    if (controls.beforeProvider) await controls.beforeProvider(stage);
    if (stage === "oauth") return Response.json({ token_type: "Bearer", access_token: "transaction-fixture-access", expires_in: 3600 });
    if (stage === "create") {
      assert.equal(url, "https://api-m.sandbox.paypal.com/v2/invoicing/invoices");
      assert.equal(controls.mappedDraft, null, "The browser must not create a second draft.");
      controls.mappedDraft = JSON.parse(init.body);
      return Response.json({ id: FIXTURE_INVOICE, status: "DRAFT" }, { status: 201 });
    }
    assert.equal(url, `https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${FIXTURE_INVOICE}${stage === "send" ? "/send" : ""}`);
    assert.ok(controls.mappedDraft, "Delivery requires the actual draft created by this flow.");
    if (stage === "send") {
      assert.deepEqual(JSON.parse(init.body), { send_to_recipient: true, send_to_invoicer: false });
      controls.providerStatus = "UNPAID";
      return new Response(null, { status: 202 });
    }
    const mapped = structuredClone(controls.mappedDraft);
    const value = mapped.items[0].unit_amount.value;
    if (controls.providerStatus !== "DRAFT") mapped.detail.metadata = {
      recipient_view_url: controls.paymentUrl,
    };
    const financial = ["PAID", "REFUNDED"].includes(controls.providerStatus);
    const raw = { id: FIXTURE_INVOICE, ...mapped, status: controls.providerStatus,
      amount: { currency_code: "USD", value }, due_amount: { currency_code: "USD", value: financial ? "0.00" : value } };
    if (financial && !controls.omitFinancialDetail) raw.payments = {
      paid_amount: { currency_code: "USD", value }, transactions: [{ type: "PAYPAL", method: "PAYPAL",
        payment_id: "BROWSERPAYMENT036", payment_date: fixture.now().toISOString().slice(0, 10),
        amount: { currency_code: "USD", value } }],
    };
    if (controls.providerStatus === "REFUNDED" && !controls.omitFinancialDetail) raw.refunds = {
      refund_amount: { currency_code: "USD", value }, transactions: [{ type: "PAYPAL", method: "PAYPAL",
        refund_id: "BROWSERREFUND036", refund_date: fixture.now().toISOString().slice(0, 10),
        amount: { currency_code: "USD", value } }],
    };
    if (controls.mutateProvider) controls.mutateProvider(raw);
    return Response.json(raw);
  } };

  const transactions = createTransactionRoutes({ sessions, now: fixture.now, transport: env => {
    const configured = configuredSandboxTransport(env, transport.fetch);
    return configured ? { ...configured, now } : null;
  } });
  const receipts = createReceiptRoutes(async (request, caseId, env) => !!await sessions.authorize(request, caseId, env), fixture.now);

  async function dispatch(request, { browser = false } = {}) {
    const url = new URL(request.url);
    assert.equal(url.origin, ORIGIN, "Only the fixture application origin is routable.");
    const originalHeaders = new Headers(request.headers);
    const headers = new Headers(originalHeaders);
    // This simulates an Access edge adding its signed assertion. It is never
    // supplied to page JavaScript, cookies, or browser request headers.
    headers.delete("cf-access-jwt-assertion");
    if (creatorPath(url.pathname) && assertions.has(controls.gatewayActor)) {
      headers.set("cf-access-jwt-assertion", assertions.get(controls.gatewayActor));
    }
    const raw = request.method === "GET" || request.method === "HEAD" ? null : await request.text();
    const forwarded = new Request(request.url, { method: request.method, headers, ...(raw === null ? {} : { body: raw }) });
    const record = { browser, method: request.method, path: url.pathname, requestUrl: request.url, urlHasQuery: !!url.search,
      body: raw, origin: originalHeaders.get("origin"), fetchSite: originalHeaders.get("sec-fetch-site"),
      cookiePresent: originalHeaders.has("cookie"), buyerAuthorizationPresent: originalHeaders.has("authorization"),
      browserAssertionPresent: originalHeaders.has("cf-access-jwt-assertion"), status: null, responseHeaders: null };
    requests.push(record);
    let response = await transactions(forwarded, environment);
    response ??= await receipts(forwarded, environment);
    response ??= new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    record.status = response.status;
    record.responseHeaders = {
      cacheControl: response.headers.get("cache-control"), referrerPolicy: response.headers.get("referrer-policy"),
      contentSecurityPolicy: response.headers.get("content-security-policy"), contentType: response.headers.get("content-type"),
    };
    return response;
  }

  async function native(path, { method = "GET", body, buyerToken, headers = {} } = {}) {
    const h = { ...headers, ...(method === "GET" ? {} : { Origin: ORIGIN, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" }),
      ...(buyerToken ? { Authorization: `Bearer ${buyerToken}` } : {}) };
    return dispatch(new Request(ORIGIN + path, { method, headers: h, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  }

  async function approve() {
    const response = await native(`/api/consent/creator/cases/${caseId}/review`);
    assert.equal(response.status, 200);
    const view = await response.json();
    const saved = await native(`/api/consent/creator/cases/${caseId}/decision`, { method: "POST", body: {
      requestId: crypto.randomUUID(), expectedCaseVersion: view.caseVersion, termsVersionId: view.termsVersionId,
      quoteId: view.quoteId, reviewHash: view.reviewHash, decision: "approved", reason: null, confirmed: true,
      copyVersion: view.creatorCopyVersion,
    } });
    assert.equal(saved.status, 200);
    return saved.json();
  }

  async function accept() {
    const response = await native("/api/consent/buyer/review", { buyerToken });
    assert.equal(response.status, 200);
    const view = await response.json();
    const saved = await native(BUYER_ACCEPT_PATH, { method: "POST", buyerToken, body: {
      requestId: crypto.randomUUID(), expectedCaseVersion: view.caseVersion, termsVersionId: view.termsVersionId,
      quoteId: view.quoteId, reviewHash: view.reviewHash, creatorDecisionId: view.creatorDecisionId,
      acknowledged: true, copyVersion: view.buyerCopyVersion,
    } });
    assert.equal(saved.status, 200);
    return saved.json();
  }

  async function sendAccepted() {
    const invoicePath = `/api/invoices/creator/cases/${caseId}`;
    let response = await native(invoicePath);
    assert.equal(response.status, 200);
    let view = await response.json();
    response = await native(`${invoicePath}/create`, { method: "POST", body: { expectedCaseVersion: view.caseVersion, confirmed: true } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).outcome, "draft_bound");
    response = await native(invoicePath); view = await response.json();
    response = await native(`${invoicePath}/send`, { method: "POST", body: {
      expectedCaseVersion: view.caseVersion, invoiceId: view.invoiceId, confirmed: true,
    } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).outcome, "delivery_observed");
  }

  /** Invoke the real financial consumer using the real content-validating GET
   * adapter over injected provider HTTP. No payment row is manufactured here.
   * This helper is server-side test setup, never called by a buyer GET/button.
   */
  async function reconcile({ requestAnotherGeneration = false } = {}) {
    const configured = configuredSandboxTransport(environment, transport.fetch);
    assert.ok(configured);
    const adapter = createPayPalSandboxInvoiceAdapter(environment, { ...configured, now,
      sandboxInvoiceTransportEnabled: true, journal: createD1DeliveryJournal(database),
      authorize: async () => false });
    if (requestAnotherGeneration) {
      const binding = fixture.db.prepare("SELECT invoice_binding_id FROM invoice_bindings WHERE case_id=?").get(caseId);
      await createD1ReconciliationStore(database).request(binding.invoice_binding_id, "operator_retry", fixture.now().toISOString());
    }
    return runPayPalReconciliation(environment, id => adapter.getInvoice(id), fixture.now);
  }
  const issueReceipt = () => issueSandboxReceipt(environment, caseId, fixture.now);

  // Bind helpers only after the real intake route has created its case and
  // digest-only capability. This never creates or changes a domain row.
  function attachIntake({ caseId: nextCaseId, buyerToken: nextToken }) {
    assert.ok(fixture.db.prepare("SELECT case_id FROM licensing_cases WHERE case_id=?").get(nextCaseId));
    const digest = createHash("sha256").update(nextToken).digest("hex");
    assert.ok(fixture.db.prepare("SELECT buyer_capability_id FROM buyer_capabilities WHERE case_id=? AND token_digest_sha256=?").get(nextCaseId, digest));
    caseId = nextCaseId; buyerToken = nextToken;
  }

  const count = stage => providerCalls.filter(call => call.stage === stage).length;
  return { ...fixture, environment, controls, transport, dispatch, native, approve, accept, sendAccepted, reconcile, issueReceipt, attachIntake, requests, providerCalls, keyRequests,
    get caseId() { return caseId; }, get token() { return buyerToken; },
    case: () => fixture.db.prepare("SELECT * FROM licensing_cases WHERE case_id=?").get(caseId),
    providerCount: count, nowMs: now,
    binding: () => fixture.db.prepare("SELECT * FROM invoice_bindings WHERE case_id=?").get(caseId),
    sendOperation: () => fixture.db.prepare("SELECT * FROM payment_operations WHERE case_id=? AND operation_type='send_invoice'").get(caseId),
    outbox: () => fixture.db.prepare("SELECT * FROM paypal_reconciliation_outbox").get(),
    permission: () => fixture.db.prepare("SELECT * FROM permissions WHERE case_id=?").get(caseId),
    receipt: () => fixture.db.prepare("SELECT r.* FROM receipt_revisions r JOIN verification_records v ON v.verification_record_id=r.verification_record_id WHERE v.case_id=? ORDER BY r.revision_number DESC LIMIT 1").get(caseId),
    publicId: () => fixture.db.prepare("SELECT public_verification_id id FROM verification_records WHERE case_id=?").get(caseId)?.id,
    totalChanges: () => fixture.db.prepare("SELECT total_changes() n").get().n,
  };
}
