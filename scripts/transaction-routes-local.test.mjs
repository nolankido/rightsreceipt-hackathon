import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createBuyerReviewRoutes, renderBuyerReview } from "../apps/api/src/buyer-review.ts";
import { createTransactionRoutes, configuredSandboxTransport } from "../apps/api/src/transaction-routes.ts";
import { consentFixture, ids } from "./support/human-consent-fixture.mjs";
import { legacyBuyerRequestBoundary, legacyBuyerRuntimeBoundary } from "../apps/api/src/legacy-buyer-boundary.ts";

const origin = "https://rightsreceipt.example";
const buyerEnv = { APP_MODE: "sandbox", PAYPAL_MODE: "paypal_sandbox", BUYER_REVIEW_ENABLED: "true",
  HUMAN_CONSENT_ENABLED: "true", HUMAN_CONSENT_ORIGIN: origin };
const transportEnv = { ...buyerEnv, RIGHTS_INVOICE_CONTROLS_ENABLED: "true",
  PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com", PAYPAL_SANDBOX_CLIENT_ID: "synthetic-client-035",
  PAYPAL_SANDBOX_CLIENT_SECRET: "synthetic-secret-035", PAYPAL_SANDBOX_MERCHANT_NAME: "Synthetic Creator",
  PAYPAL_SANDBOX_MERCHANT_EMAIL: "merchant@example.test" };
const req = (path, init = {}) => new Request(origin + path, init);
const denied = () => ({ session: async () => null, authorize: async () => null, authorizeAsset: async () => null, authorizeRecovery: async () => null });

test("buyer shell and script require no creator login and disclose no capability", async () => {
  let creatorCalls = 0, providerCalls = 0;
  const routes = createTransactionRoutes({ sessions: {
    session: async () => { creatorCalls++; return null; }, authorize: async () => { creatorCalls++; return null; },
  }, transport: () => { providerCalls++; throw Error("Unexpected transport configuration"); } });
  for (const path of ["/buyer/review", "/assets/buyer-review.js"]) {
    const response = await routes(req(path), buyerEnv);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(response.headers.get("set-cookie"), null);
    const content = await response.text();
    assert.ok(!content.includes("synthetic-secret-035"));
  }
  assert.equal(creatorCalls, 0); assert.equal(providerCalls, 0);
});

for (const changes of [undefined, {}, { BUYER_REVIEW_ENABLED: "false" }, { HUMAN_CONSENT_ENABLED: "false" },
  { APP_MODE: "local" }, { APP_MODE: "production" }, { PAYPAL_MODE: "fake" },
  { HUMAN_CONSENT_ORIGIN: "http://rightsreceipt.example" }, { HUMAN_CONSENT_ORIGIN: origin + "/" },
  { HUMAN_CONSENT_ORIGIN: "https://user:password@rightsreceipt.example" }]) {
  test("buyer entry fails closed for configuration " + JSON.stringify(changes), async () => {
    const env = changes === undefined ? undefined : Object.keys(changes).length === 0 ? {} : { ...buyerEnv, ...changes };
    assert.equal((await createBuyerReviewRoutes()(req("/buyer/review"), env)).status, 503);
  });
}

test("buyer shell rejects query credentials, mutations and mismatched origins", async () => {
  const routes = createBuyerReviewRoutes();
  assert.equal((await routes(req("/buyer/review?capability=never-echo-this"), buyerEnv)).status, 400);
  const response = await routes(req("/buyer/review", { method: "POST", body: "never-echo-this" }), buyerEnv);
  assert.equal(response.status, 405); assert.equal(response.headers.get("allow"), "GET");
  assert.ok(!(await response.text()).includes("never-echo-this"));
  assert.equal((await routes(new Request("https://other.example/buyer/review"), buyerEnv)).status, 400);
  assert.equal(await routes(req("/buyer/other"), buyerEnv), null);
});

test("buyer HTML has explicit unchecked consent and a nonce-bound style", () => {
  const html = renderBuyerReview("a".repeat(32));
  assert.match(html, /<input type="checkbox" id="acknowledge">/);
  assert.match(html, /id="accept" type="submit" disabled/);
  assert.match(html, /<style nonce="a{32}">/);
  assert.match(html, /src="\/assets\/buyer-review.js"/);
  assert.throws(() => renderBuyerReview('" onload="alert(1)'));
});

test("native composition retains the buyer limiter between requests", async () => {
  const routes = createTransactionRoutes({ sessions: denied(), now: () => new Date("2026-10-27T19:00:00.000Z") });
  for (let i = 0; i < 120; i++) assert.equal((await routes(req("/buyer/review"), buyerEnv)).status, 200);
  const limited = await routes(req("/buyer/review"), buyerEnv);
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60");
});

test("buyer acceptance reaches real durable consent through Worker composition without creator sessions", async () => {
  const f = consentFixture(); let creatorCalls = 0, providerCalls = 0;
  try {
    await f.approve();
    const routes = createTransactionRoutes({ sessions: {
      session: async () => { creatorCalls++; return null; }, authorize: async () => { creatorCalls++; return null; },
    }, now: f.now, transport: () => { providerCalls++; throw Error("Unexpected invoice path"); } });
    const env = { ...buyerEnv, DB: f.adapter };
    const get = () => req("/api/consent/buyer/review", { headers: { Authorization: "Bearer " + f.token } });
    const offer = await (await routes(get(), env)).json();
    assert.equal(offer.stage, "awaiting_buyer");
    const input = { requestId: crypto.randomUUID(), expectedCaseVersion: offer.caseVersion, termsVersionId: offer.termsVersionId,
      quoteId: offer.quoteId, reviewHash: offer.reviewHash, creatorDecisionId: offer.creatorDecisionId,
      acknowledged: true, copyVersion: offer.buyerCopyVersion };
    const post = () => req("/api/consent/buyer/accept", { method: "POST", headers: {
      Authorization: "Bearer " + f.token, Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json",
    }, body: JSON.stringify(input) });
    const first = await routes(post(), env), again = await routes(post(), env);
    assert.equal(first.status, 200); assert.equal((await first.json()).outcome, "recorded");
    assert.equal(again.status, 200); assert.equal((await again.json()).outcome, "replayed");
    assert.equal(f.count("buyer_acceptances"), 1);
    assert.equal((await (await routes(get(), env)).json()).stage, "accepted_awaiting_invoice");
    assert.deepEqual(f.protected(), { invoice_bindings: 0, payment_operations: 0, payment_evidence: 0, permissions: 0, receipt_revisions: 0 });
    assert.equal(creatorCalls, 0); assert.equal(providerCalls, 0);
  } finally { f.close(); }
});

test("creator credentials alone cannot substitute for buyer consent", async () => {
  const f = consentFixture();
  try {
    const routes = createTransactionRoutes({ sessions: { session: async () => ({ authenticated: true }),
      authorize: async () => ({ workspaceId: ids.workspace, actorReference: "creator:fixture" }) }, now: f.now });
    const response = await routes(req("/api/consent/buyer/review", { headers: {
      "cf-access-jwt-assertion": "not-a-capability", "x-rightsreceipt-demo-role": "creator",
    } }), { ...buyerEnv, DB: f.adapter });
    assert.equal(response.status, 403); assert.equal(f.count("buyer_acceptances"), 0);
  } finally { f.close(); }
});

test("transport construction is pure, Sandbox-only and keeps merchant data server-side", () => {
  let calls = 0;
  const http = async () => { calls++; throw Error("No test should call the provider"); };
  const transport = configuredSandboxTransport(transportEnv, http);
  assert.equal(transport.fetch, http); assert.equal(transport.sandboxDraftTransportEnabled, true);
  assert.deepEqual(transport.merchant, { name: "Synthetic Creator", email: "merchant@example.test" });
  assert.equal(calls, 0);
  for (const changes of [{ RIGHTS_INVOICE_CONTROLS_ENABLED: "false" }, { APP_MODE: "production" },
    { PAYPAL_MODE: "fake" }, { PAYPAL_BASE_URL: "https://api-m.paypal.com" },
    { PAYPAL_SANDBOX_CLIENT_SECRET: "" }, { PAYPAL_SANDBOX_MERCHANT_NAME: "" },
    { PAYPAL_SANDBOX_MERCHANT_NAME: "<script>" }, { PAYPAL_SANDBOX_MERCHANT_EMAIL: "not-an-email" }]) {
    assert.equal(configuredSandboxTransport({ ...transportEnv, ...changes }, http), null);
  }
  assert.equal(calls, 0);
});

test("buyer-only transport configuration does not enable creator invoice controls", async () => {
  let providerCalls = 0, creatorCalls = 0;
  const http = async () => { providerCalls++; throw Error("Unexpected provider call"); };
  const env = { ...transportEnv, RIGHTS_INVOICE_CONTROLS_ENABLED: "false", BUYER_PAYMENT_ENABLED: "true" };
  assert.equal(configuredSandboxTransport(env, http).fetch, http);
  const routes = createTransactionRoutes({ sessions: {
    session: async () => { creatorCalls++; return null; }, authorize: async () => { creatorCalls++; return null; },
  }, transport: settings => configuredSandboxTransport(settings, http) });
  const response = await routes(req("/api/invoices/creator/cases/" + ids.case), env);
  assert.equal(response.status, 503);
  assert.equal(providerCalls, 0); assert.equal(creatorCalls, 0);
});

test("buyer payment routes are handled before the creator invoice route family", async () => {
  let creatorCalls = 0, providerCalls = 0;
  const routes = createTransactionRoutes({ sessions: {
    session: async () => { creatorCalls++; return null; }, authorize: async () => { creatorCalls++; return null; },
  }, transport: () => { providerCalls++; throw Error("Unexpected provider call"); } });
  for (const [path, method] of [["/api/invoices/buyer/status", "GET"], ["/api/invoices/buyer/handoff", "POST"]]) {
    const response = await routes(req(path, { method }), buyerEnv);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "buyer_payment_unavailable");
  }
  assert.equal(creatorCalls, 0); assert.equal(providerCalls, 0);
});

test("recovery paths are matched before ordinary invoice controls and default off without external work", async () => {
  let creatorCalls = 0, providerCalls = 0;
  const routes = createTransactionRoutes({ sessions: {
    ...denied(), authorizeRecovery: async () => { creatorCalls++; return null; },
  }, transport: () => { providerCalls++; throw Error("Disabled recovery must not construct transport."); } });
  for (const [suffix, method] of [["recovery", "GET"], ["recover", "POST"]]) {
    const response = await routes(req(`/api/invoices/creator/cases/${ids.case}/${suffix}`, { method }), buyerEnv);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "invoice_recovery_unavailable");
  }
  assert.equal(creatorCalls, 0); assert.equal(providerCalls, 0);
});

test("enabled recovery requires the expiry-aware case authorizer through shared composition", async () => {
  const f = consentFixture(); let recoveryCalls = 0, ordinaryCalls = 0, providerCalls = 0;
  try {
    const routes = createTransactionRoutes({ now: f.now, sessions: {
      ...denied(), authorize: async () => { ordinaryCalls++; return null; },
      authorizeRecovery: async (_request, caseId) => { recoveryCalls++; assert.equal(caseId, ids.case); return null; },
    }, transport: () => { providerCalls++; throw Error("Denied recovery must not construct transport."); } });
    const env = { ...transportEnv, DB: f.adapter, INVOICE_RECOVERY_ENABLED: "true", CREATOR_ACCESS_ENABLED: "true",
      CREATOR_ACCESS_ORIGIN: origin, RIGHTS_INVOICE_CREATION_ENABLED: "true", RIGHTS_INVOICE_SENDING_ENABLED: "true" };
    for (const [suffix, method] of [["recovery", "GET"], ["recover", "POST"]]) {
      const response = await routes(req(`/api/invoices/creator/cases/${ids.case}/${suffix}`, {
        method, headers: { Origin: origin, "Content-Type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}),
      }), env);
      assert.equal(response.status, 403); assert.equal((await response.json()).error, "not_authorized");
    }
    assert.equal(recoveryCalls, 2); assert.equal(ordinaryCalls, 0); assert.equal(providerCalls, 0);
  } finally { f.close(); }
});

test("disabled optional recovery preserves normal accepted-offer invoice controls", async () => {
  const f = consentFixture(); let recoveryCalls = 0, providerCalls = 0;
  try {
    await f.approve(); await f.accept();
    const http = async () => { providerCalls++; throw Error("Invoice metadata must be local."); };
    const routes = createTransactionRoutes({ now: f.now, sessions: {
      ...denied(), authorize: () => f.authorize(), authorizeRecovery: async () => { recoveryCalls++; return null; },
    }, transport: env => configuredSandboxTransport(env, http) });
    const env = { ...transportEnv, DB: f.adapter, INVOICE_RECOVERY_ENABLED: "false", CREATOR_ACCESS_ENABLED: "true",
      CREATOR_ACCESS_ORIGIN: origin, RIGHTS_INVOICE_CREATION_ENABLED: "true", RIGHTS_INVOICE_SENDING_ENABLED: "true" };
    const response = await routes(req(`/api/invoices/creator/cases/${ids.case}`), env);
    assert.equal(response.status, 200);
    const view = await response.json(); assert.equal(view.schemaVersion, "invoice-controls-v1");
    assert.equal(view.canCreate, true); assert.equal(view.canSend, false);
    assert.equal(recoveryCalls, 0); assert.equal(providerCalls, 0); assert.equal(f.count("payment_operations"), 0);
  } finally { f.close(); }
});

test("clarification-only creator access exposes session expiry without enabling offer actions", async () => {
  const f = consentFixture();
  try {
    const env = { ...buyerEnv, DB: f.adapter, CLARIFICATION_ENABLED: "true", CREATOR_REVIEW_ENABLED: "false",
      CREATOR_ACCESS_ENABLED: "true", CREATOR_ACCESS_ORIGIN: origin };
    let authorizeCalls = 0;
    const routes = createTransactionRoutes({ now: f.now, sessions: {
      session: async () => ({ expiresAt: f.now().getTime() / 1000 + 120 }),
      authorize: async () => { authorizeCalls++; return null; },
    } });
    const response = await routes(req("/api/creator/session"), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: true, environment: "sandbox", expiresInMs: 120000 });
    for (const path of [`/creator/review/${ids.case}`, "/assets/creator-review.js"]) {
      assert.equal((await routes(req(path), env)).status, 503);
    }
    assert.equal(authorizeCalls, 0);
    assert.equal((await routes(req("/api/creator/session"), { ...env, CLARIFICATION_ENABLED: "false" })).status, 503);
    assert.equal((await routes(req("/api/creator/session"), { ...env, CREATOR_ACCESS_ENABLED: "false" })).status, 503);
    assert.equal((await createTransactionRoutes({ sessions: denied(), now: f.now })(req("/api/creator/session"), env)).status, 403);
  } finally { f.close(); }
});

test("canonical clarification paths fail closed in composition without provider or creator work", async () => {
  let creatorCalls = 0, providerCalls = 0;
  const routes = createTransactionRoutes({ sessions: {
    session: async () => { creatorCalls++; return null; }, authorize: async () => { creatorCalls++; return null; },
  }, transport: () => { providerCalls++; throw Error("No transport belongs in clarification."); } });
  for (const path of ["/buyer/clarification", "/assets/buyer-clarification.js", "/api/clarification/buyer/review",
    "/api/clarification/buyer/answers", `/creator/clarification/${ids.case}`, `/api/clarification/creator/cases/${ids.case}/terms`]) {
    const response = await routes(req(path), buyerEnv);
    assert.equal(response.status, 503, path);
    assert.equal((await response.json()).error, "clarification_unavailable");
  }
  for (const path of ["/buyer/clarification", "/assets/buyer-clarification.js"]) {
    assert.equal((await routes(req(path), { ...buyerEnv, CLARIFICATION_ENABLED: "true" })).status, 200);
  }
  assert.equal(creatorCalls, 0); assert.equal(providerCalls, 0);
});

test("intake-only creator session expiry does not enable offer or clarification pages", async () => {
  const f = consentFixture();
  try {
    const env = { ...buyerEnv, DB: f.adapter, REQUEST_INTAKE_ENABLED: "true", CREATOR_REVIEW_ENABLED: "false",
      CLARIFICATION_ENABLED: "false", CREATOR_ACCESS_ENABLED: "true", CREATOR_ACCESS_ORIGIN: origin };
    let ownershipCalls = 0;
    const routes = createTransactionRoutes({ now: f.now, sessions: {
      session: async () => ({ expiresAt: f.now().getTime() / 1000 + 90 }),
      authorize: async () => { ownershipCalls++; return null; },
      authorizeAsset: async () => { ownershipCalls++; return null; },
    } });
    const response = await routes(req("/api/creator/session"), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: true, environment: "sandbox", expiresInMs: 90000 });
    for (const path of [`/creator/review/${ids.case}`, `/creator/clarification/${ids.case}`, "/assets/creator-review.js"])
      assert.equal((await routes(req(path), env)).status, 503);
    assert.equal(ownershipCalls, 0);
    assert.equal((await routes(req("/api/creator/session"), { ...env, REQUEST_INTAKE_ENABLED: "false" })).status, 503);
    assert.equal((await createTransactionRoutes({ now: f.now, sessions: denied() })(req("/api/creator/session"), env)).status, 403);
  } finally { f.close(); }
});

test("canonical intake routes remain default off without provider contact or creator authentication", async () => {
  let creatorCalls = 0, providerCalls = 0;
  const routes = createTransactionRoutes({ sessions: {
    session: async () => { creatorCalls++; return null; }, authorize: async () => { creatorCalls++; return null; },
    authorizeAsset: async () => { creatorCalls++; return null; },
  }, transport: () => { providerCalls++; throw Error("No transport belongs in intake."); } });
  for (const path of ["/buyer/request", "/assets/buyer-request-intake.js", `/creator/requests/${ids.asset}`,
    "/assets/creator-request-intake.js", `/api/intake/creator/assets/${ids.asset}/review`,
    `/api/intake/creator/assets/${ids.asset}/links`, "/api/intake/buyer/review", "/api/intake/buyer/request"]) {
    const response = await routes(req(path), buyerEnv);
    assert.equal(response.status, 503, path);
    assert.equal((await response.json()).error, "request_intake_unavailable");
  }
  assert.equal(creatorCalls, 0); assert.equal(providerCalls, 0);
});

test("legacy buyer path-token routes cannot bypass canonical intake in database, Sandbox or public runtimes", async () => {
  let authCalls = 0, providerCalls = 0;
  const routes = createTransactionRoutes({ sessions: {
    session: async () => { authCalls++; return null; }, authorize: async () => { authCalls++; return null; },
    authorizeAsset: async () => { authCalls++; return null; },
  }, transport: () => { providerCalls++; throw Error("Legacy intake must not contact a provider."); } });
  const token = "A".repeat(43);
  for (const path of [`/api/request/${token}`, `/api/request/${token}/clarify`, `/api/request/${token}/mock/accept`, `/request/${token}`,
    `/api/%72equest/${token}`, `/%61pi/request/${token}`, `/api/requ%65st/${token}`, `/%72equest/${token}`,
    `/%61%70%69/%72%65%71%75%65%73%74/${token}`, `/api%2frequest/${token}`]) {
    for (const method of ["GET", "POST"]) {
      for (const [host, env] of [[origin, undefined], [origin, { APP_MODE: "local" }],
        ["http://local.test", { APP_MODE: "local", DB: {} }], ["http://local.test", { APP_MODE: "sandbox" }],
        ["http://local.test", { APP_MODE: "judge" }]]) {
        const response = await routes(new Request(host + path, { method }), env);
        assert.equal(response.status, 403); assert.equal((await response.clone().json()).error, "private_request_route_required");
        assert.equal((await response.text()).includes(token), false);
        assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      }
      for (const host of ["http://local.test", "http://localhost:5173", "http://127.0.0.1:8787", "http://[::1]:8787"])
        assert.equal(legacyBuyerRequestBoundary(new Request(host + path, { method }), { APP_MODE: "local" }), null);
    }
  }
  assert.equal(authCalls, 0); assert.equal(providerCalls, 0);
  assert.equal(legacyBuyerRequestBoundary(req("/buyer/request"), buyerEnv), null);
  assert.equal(legacyBuyerRequestBoundary(req("/api/intake/buyer/request"), buyerEnv), null);
  // A matched Hono middleware must enforce the runtime boundary independently
  // of how its router decoded the original request path.
  assert.equal(legacyBuyerRuntimeBoundary(req("/api/%2572equest/" + token), { APP_MODE: "sandbox", DB: {} }).status, 403);
  const source = readFileSync(new URL("../apps/api/src/index.ts", import.meta.url), "utf8");
  assert.match(source, /app\.use\("\/api\/request\/\*"/); assert.match(source, /legacyBuyerRuntimeBoundary\(context\.req\.raw, context\.env\)/);
});

test("checked-in runtime remains off and native buyer routes run before asset fallback", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  for (const flag of ["BUYER_REVIEW_ENABLED", "BUYER_PAYMENT_ENABLED", "CLARIFICATION_ENABLED", "REQUEST_INTAKE_ENABLED", "INVOICE_RECOVERY_ENABLED", "RIGHTS_INVOICE_CONTROLS_ENABLED", "RIGHTS_INVOICE_CREATION_ENABLED",
    "RIGHTS_INVOICE_SENDING_ENABLED", "CREATOR_ACCESS_ENABLED", "HUMAN_CONSENT_ENABLED"]) assert.equal(config.vars[flag], "false");
  for (const path of ["/buyer/review", "/assets/buyer-review.js", "/buyer/clarification", "/creator/clarification/*",
    "/assets/buyer-clarification.js", "/assets/creator-clarification.js", "/buyer/request", "/creator/requests/*",
    "/assets/buyer-request-intake.js", "/assets/creator-request-intake.js", "/api/*", "/request/*"]) assert.ok(config.assets.run_worker_first.includes(path));
  assert.equal(config.vars.PAYPAL_SANDBOX_MERCHANT_NAME, ""); assert.equal(config.vars.PAYPAL_SANDBOX_MERCHANT_EMAIL, "");
});
