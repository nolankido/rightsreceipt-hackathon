import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSandboxWebhookCapture } from './sandbox-webhook-capture.mjs';
import { verifySandboxWebhookRegistration } from './support/sandbox-webhook-readiness.mjs';
import { bindSandboxCaptureInvoice } from './support/sandbox-webhook-binding.mjs';

const ORIGIN = 'https://rightsreceipt-sandbox.workers.dev';
const WEBHOOK = 'WH-COLLECTOR-099';
const envFor = app => ({
  PAYPAL_SANDBOX_CLIENT_ID: 'synthetic-client',
  PAYPAL_SANDBOX_CLIENT_SECRET: 'synthetic-secret',
  PAYPAL_SANDBOX_WEBHOOK_ID: WEBHOOK,
  PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN: ORIGIN,
  PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE: app.routeFile,
});
function fakePayPal(registeredCallback) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ path: new URL(url).pathname, method: init.method, redirect: init.redirect });
      if (url.endsWith('/v1/oauth2/token')) {
        return Response.json({ token_type: 'Bearer', access_token: 'fixture-token' });
      }
      if (url.endsWith('/v1/notifications/webhooks')) {
        return Response.json({ webhooks: [{
          id: WEBHOOK, url: registeredCallback,
          event_types: [{ name: 'INVOICING.INVOICE.PAID' }],
        }] });
      }
      throw Error('unexpected provider request');
    },
  };
}
async function withCollector(fn) {
  const output = mkdtempSync(join(tmpdir(), 'rightsreceipt-live-collector-099-'));
  let app;
  try {
    app = await startSandboxWebhookCapture({ port: 0, output, timeoutMs: 15_000 });
    await fn(app);
  } finally {
    if (app) {
      try { await app.close(); } catch { /* Closed by the test. */ }
    }
    rmSync(output, { recursive: true, force: true });
  }
}

test('actual collector passes HEAD probe, exact same-app callback and paid-event subscription', async () =>
  withCollector(async app => {
    const env = envFor(app);
    assert.equal(readFileSync(app.routeFile, 'utf8'), app.routePath + '\n');
    assert.equal(readFileSync(join(app.directory, 'private-local-origin.txt'), 'utf8'), app.origin + '\n');
    assert.ok(statSync(join(app.directory, 'private-local-origin.txt')).isFile());
    const provider = fakePayPal(ORIGIN + app.routePath);
    const result = await verifySandboxWebhookRegistration({ env, fetchImpl: provider.fetchImpl });
    assert.equal(result.status, 'passed');
    assert.equal(result.localCollectorReady, true);
    assert.equal(result.exactCallbackChecked, true);
    assert.deepEqual(provider.calls.map(c => [c.path, c.method, c.redirect]), [
      ['/v1/oauth2/token', 'POST', 'manual'],
      ['/v1/notifications/webhooks', 'GET', 'manual'],
    ]);
    assert.equal(existsSync(app.capturePath), false, 'probe must not consume the one-shot capture');
    assert.doesNotMatch(JSON.stringify(result), /\/capture\//u);
    assert.equal(JSON.stringify(result).includes(app.routePath), false);
  }));

test('actual collector rejects a different registered callback without consuming the capture', async () =>
  withCollector(async app => {
    const provider = fakePayPal(ORIGIN + '/webhooks/paypal/sandbox/capture/' + 'b'.repeat(48));
    await assert.rejects(verifySandboxWebhookRegistration({
      env: envFor(app), fetchImpl: provider.fetchImpl,
    }), error => error.code === 'webhook_preflight_callback_mismatch');
    assert.equal(provider.calls.length, 2);
    assert.equal(existsSync(app.capturePath), false);
  }));

test('actual collector rejects a stale route file after the listener closes, before OAuth', async () => {
  const output = mkdtempSync(join(tmpdir(), 'rightsreceipt-closed-collector-099-'));
  let app;
  try {
    app = await startSandboxWebhookCapture({ port: 0, output, timeoutMs: 15_000 });
    const env = envFor(app);
    const provider = fakePayPal(ORIGIN + app.routePath);
    await app.close(); app = null;
    await assert.rejects(verifySandboxWebhookRegistration({
      env, fetchImpl: provider.fetchImpl,
    }), error => error.code === 'webhook_preflight_collector_unavailable');
    assert.equal(provider.calls.length, 0, 'the stale route must fail before any Sandbox request');
  } finally {
    if (app) await app.close();
    rmSync(output, { recursive: true, force: true });
  }
});

test('read-only health probe remains available before invoice binding, never asserts payment', async () =>
  withCollector(async app => {
    const response = await fetch(app.origin + app.routePath, {
      method: 'HEAD', redirect: 'manual',
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('x-rightsreceipt-capture-ready'), 'unverified-local-v1');
    assert.equal(await response.text(), '');
    assert.equal(existsSync(app.capturePath), false);
    const provider = fakePayPal(ORIGIN + app.routePath);
    const result = await verifySandboxWebhookRegistration({
      env: envFor(app), fetchImpl: provider.fetchImpl,
    });
    assert.equal(result.localCollectorReady, true);
    assert.equal(result.exactCallbackChecked, true);
    assert.equal(existsSync(app.capturePath), false);
  }));

test('HEAD readiness does not prevent one real invoice-bound local capture', async () =>
  withCollector(async app => {
    const invoice = 'INV2-TEST-COLLECTOR-099';
    const stateDir = mkdtempSync(join(tmpdir(), 'rightsreceipt-state-099-'));
    try {
      const statePath = join(stateDir, 'state.json');
      writeFileSync(statePath, JSON.stringify({
        schemaVersion: 'rightsreceipt-paypal-sandbox-state-v1',
        phase: 'sent_checked', invoiceId: invoice,
        entry: { sendState: 'confirmed', binding: { draft: { invoiceId: invoice } } },
      }));
      const marker = await fetch(app.origin + app.routePath, { method: 'HEAD' });
      assert.equal(marker.status, 204);
      assert.equal(existsSync(app.capturePath), false);
      const binding = bindSandboxCaptureInvoice({ routeFile: app.routeFile, statePath });
      assert.equal(binding.status, 'bound');
      const body = JSON.stringify({
        id: 'WH-COLLECTOR-EVENT-099',
        event_type: 'INVOICING.INVOICE.PAID',
        resource: { id: invoice, status: 'PAID' },
      });
      const response = await fetch(app.origin + app.routePath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'paypal-transmission-id': 'f2fb3610-0123-4401-a030-abcdef099000',
          'paypal-transmission-time': new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
          'paypal-auth-algo': 'SHA256withRSA',
          'paypal-cert-url': 'https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-TEST099',
          'paypal-transmission-sig': 'a'.repeat(96),
        },
        body,
      });
      assert.equal(response.status, 200);
      const result = await app.captured;
      assert.equal(result.status, 'captured_unverified');
      assert.equal(JSON.parse(readFileSync(result.capturePath, 'utf8')).body, body);
      const provider = fakePayPal(ORIGIN + app.routePath);
      await assert.rejects(verifySandboxWebhookRegistration({
        env: envFor(app), fetchImpl: provider.fetchImpl,
      }), error => error.code === 'webhook_preflight_collector_unavailable');
      assert.equal(provider.calls.length, 0, 'captured collector cannot be reused to create a second invoice');
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  }));
