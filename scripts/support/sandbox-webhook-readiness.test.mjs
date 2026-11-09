import test from "node:test";
import assert from "node:assert/strict";
import { verifySandboxWebhookRegistration } from "./sandbox-webhook-readiness.mjs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const ID = "WH-CANONICAL-SANDBOX-071";
const CALLBACK = "https://rightsreceipt-sandbox.workers.dev/webhooks/paypal/sandbox";
const env = () => ({ PAYPAL_SANDBOX_CLIENT_ID: "fixture-client", PAYPAL_SANDBOX_CLIENT_SECRET: "fixture-secret", PAYPAL_SANDBOX_WEBHOOK_ID: ID, PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL: CALLBACK });
const ready = (overrides = {}) => ({ id: ID, url: CALLBACK, event_types: [{ name: "INVOICING.INVOICE.PAID" }], ...overrides });
const fake = (webhooks = [ready()], oauth = { token_type: "Bearer", access_token: "SENSITIVE-TEST-TOKEN", expires_in: 3600 }) => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, ...init });
    if (url.endsWith("/v1/oauth2/token")) return Response.json(oauth);
    if (url.endsWith("/v1/notifications/webhooks")) return Response.json({ webhooks });
    throw Error("Unexpected provider path");
  };
  return { fetchImpl, seen };
};
const rejects = async (value, code, source = fake()) => {
  await assert.rejects(verifySandboxWebhookRegistration({ env: value ?? env(), fetchImpl: source.fetchImpl }),
    error => error.code === code, code);
};

test("read-only check confirms the same Sandbox app, HTTPS callback and paid subscription", async () => {
  const source = fake();
  const answer = await verifySandboxWebhookRegistration({ env: env(), fetchImpl: source.fetchImpl });
  assert.equal(answer.status, "passed");
  assert.equal(answer.subscribedEvent, "INVOICING.INVOICE.PAID");
  assert.equal(answer.exactCallbackChecked, true);
  assert.equal(source.seen.length, 2);
  assert.deepEqual(source.seen.map(x => [new URL(x.url).pathname, x.method]),
    [["/v1/oauth2/token", "POST"], ["/v1/notifications/webhooks", "GET"]]);
  assert.ok(source.seen.every(x => x.redirect === "manual" && x.signal instanceof AbortSignal));
  assert.ok(source.seen[1].headers.Authorization.startsWith("Bearer "));
  assert.equal(JSON.stringify(answer).includes("SENSITIVE-TEST-TOKEN"), false);
  assert.equal(JSON.stringify(answer).includes("fixture-secret"), false);
  assert.equal(JSON.stringify(answer).includes("rightsreceipt-sandbox.workers.dev"), false);
});

test("a webhook registered to another REST app fails before any invoice", async () => {
  await rejects(env(), "webhook_preflight_registration_missing", fake([ready({ id: "WH-DIFFERENT-APP-071" })]));
});
test("subscription requires paid invoicing, not merely created or sent", async () => {
  await rejects(env(), "webhook_preflight_subscription_missing", fake([ready({ event_types: [{ name: "INVOICING.INVOICE.SENT" }] })]));
});
test("explicitly disabled paid event fails, but wildcard subscription passes", async () => {
  await rejects(env(), "webhook_preflight_subscription_missing", fake([ready({ event_types: [{ name: "INVOICING.INVOICE.PAID", status: "DISABLED" }] })]));
  const value = await verifySandboxWebhookRegistration({ env: env(), fetchImpl: fake([ready({ event_types: [{ name: "*" }] })]).fetchImpl });
  assert.equal(value.status, "passed");
});
test("missing webhook credentials or simulator ID fail before fetch", async () => {
  const missing = env(); delete missing.PAYPAL_SANDBOX_WEBHOOK_ID;
  const source = fake();
  await rejects(missing, "webhook_preflight_configuration_missing", source);
  const fakeId = env(); fakeId.PAYPAL_SANDBOX_WEBHOOK_ID = "WEBHOOK_ID";
  await rejects(fakeId, "webhook_preflight_configuration_invalid", source);
  assert.equal(source.seen.length, 0);
});
test("local, non-HTTPS, private, query and credential-bearing listeners fail", async () => {
  for (const url of ["http://rightsreceipt.example.com/webhook", "https://localhost/webhook",
    "https://127.0.0.1/webhook", "https://198.51.100.4/webhook", "https://example.com/webhook",
    "https://rightsreceipt.test/webhook", "https://user:pass@rightsreceipt.workers.dev/webhook",
    "https://rightsreceipt.workers.dev/webhook?token=abc", "https://rightsreceipt.workers.dev/"]) {
    await rejects(env(), "webhook_preflight_listener_invalid", fake([ready({ url })]));
  }
});
test("stale one-shot callback registration is blocked before creating an invoice", async () => {
  const expected = env();
  expected.PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL = CALLBACK + "/capture/" + "a".repeat(48);
  const registered = ready({ url: CALLBACK + "/capture/" + "b".repeat(48) });
  const source = fake([registered]);
  await rejects(expected, "webhook_preflight_callback_mismatch", source);
  assert.equal(source.seen.length, 2);
  assert.equal(JSON.stringify(source.seen).includes(expected.PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL), false);
});

test("missing or malformed expected callback blocks before any network activity", async () => {
  for (const expectedUrl of [undefined, "", "http://rightsreceipt-sandbox.workers.dev/hook",
    "https://rightsreceipt-sandbox.workers.dev/old?token=secret"]) {
    const configuration = env();
    if (expectedUrl === undefined) delete configuration.PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL;
    else configuration.PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL = expectedUrl;
    const source = fake();
    await rejects(configuration, expectedUrl === undefined || expectedUrl === ""
      ? "webhook_preflight_configuration_missing" : "webhook_preflight_callback_invalid", source);
    assert.equal(source.seen.length, 0);
  }
});

test("the current private collector is live before checking its registered URL", async () => {
  const base = mkdtempSync(join(tmpdir(), "rr-webhook-readiness-"));
  const folder = join(base, "run-abcdef"); mkdirSync(folder);
  const routeFile = join(folder, "private-route.txt");
  const route = "/webhooks/paypal/sandbox/capture/" + "a".repeat(48);
  writeFileSync(routeFile, route + "\n");
  const probes = [];
  const collector = createServer((req, res) => {
    probes.push({ method: req.method, route: req.url });
    if (req.method === 'HEAD' && req.url === route) {
      res.writeHead(204, { 'X-RightsReceipt-Capture-Ready': 'unverified-local-v1' });
    } else res.writeHead(404);
    res.end();
  });
  let stopped = false;
  try {
    await new Promise(done => collector.listen(0, '127.0.0.1', done));
    writeFileSync(join(folder, "private-local-origin.txt"),
      "http://127.0.0.1:" + collector.address().port + "\n");
    const config = env();
    delete config.PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL;
    config.PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN = "https://rightsreceipt-sandbox.workers.dev";
    config.PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE = routeFile;
    const source = fake([ready({url: config.PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN + route})]);
    const result = await verifySandboxWebhookRegistration({env: config, fetchImpl: source.fetchImpl});
    assert.equal(result.status, "passed");
    assert.equal(result.exactCallbackChecked, true);
    assert.equal(result.localCollectorReady, true);
    assert.equal(source.seen.length, 2);
    assert.deepEqual(probes, [{ method: 'HEAD', route }]);
    assert.ok(!JSON.stringify(result).includes(route));
    assert.ok(!JSON.stringify(source.seen).includes(route));

    const stale = fake([ready({url: config.PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN
      + "/webhooks/paypal/sandbox/capture/" + "b".repeat(48)})]);
    await rejects(config, "webhook_preflight_callback_mismatch", stale);
    assert.equal(stale.seen.length, 2);

    // A saved route and still-registered PayPal URL are not enough if the
    // local collector has stopped. No provider request should occur.
    await new Promise(done => collector.close(done));
    stopped = true;
    const stoppedProvider = fake([ready({url: config.PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN + route})]);
    await rejects(config, "webhook_preflight_collector_unavailable", stoppedProvider);
    assert.equal(stoppedProvider.seen.length, 0);
  } finally {
    if (!stopped) await new Promise(done => collector.close(done));
    rmSync(base, { recursive: true, force: true });
  }
});

test("malformed or missing private collector route fails before OAuth", async () => {
  const config = env();
  delete config.PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL;
  config.PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN = "https://rightsreceipt-sandbox.workers.dev";
  config.PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE = "/missing/run-test/private-route.txt";
  const source = fake();
  await rejects(config, "webhook_preflight_route_unavailable", source);
  assert.equal(source.seen.length, 0);
});

test("duplicate webhook registrations do not give a false ready result", async () => {
  await rejects(env(), "webhook_preflight_registration_missing", fake([ready(), ready()]));
});
test("malformed OAuth and unparseable list responses fail closed", async () => {
  await rejects(env(), "webhook_preflight_oauth_invalid", fake([ready()], { access_token: "sensitive" }));
  const fetchImpl = async (url) => url.endsWith("/v1/oauth2/token")
    ? Response.json({ token_type: "Bearer", access_token: "token" })
    : new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } });
  await rejects(env(), "webhook_preflight_response_invalid", { fetchImpl });
});
test("redirected, non-success, oversized or missing content type responses fail closed", async () => {
  for (const response of [
    new Response("", { status: 302, headers: { Location: "https://api-m.paypal.com" } }),
    new Response("", { status: 401 }),
    new Response("x".repeat(70000), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response("{}", { status: 200 }),
  ]) {
    await rejects(env(), "webhook_preflight_response_invalid", { fetchImpl: async () => response.clone() });
  }
});
test("transport errors are sanitized and never print authorization details", async () => {
  await rejects(env(), "webhook_preflight_transport_unavailable", { fetchImpl: async () => { throw Error("Bearer PRIVATE_USER_TOKEN"); } });
});
