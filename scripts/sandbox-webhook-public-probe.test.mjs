import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './sandbox-webhook-preflight.mjs';

const ROUTE = '/webhooks/paypal/sandbox/capture/' + 'a'.repeat(48);
const ORIGIN = 'https://rightsreceipt-sandbox.workers.dev';
const CALLBACK = ORIGIN + ROUTE;
const MARKER = { 'X-RightsReceipt-Capture-Ready': 'unverified-local-v1' };
const WEBHOOK = 'WH-EXTERNAL-COLLECTOR-146';

async function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'rr-public-forwarding-146-'));
  const run = join(base, 'run-current');
  mkdirSync(run);
  const file = join(run, 'private-route.txt');
  writeFileSync(file, ROUTE + '\n', { mode: 0o600 });
  const received = [];
  const server = createServer((req, res) => {
    received.push({ method: req.method, url: req.url });
    if (req.method === 'HEAD' && req.url === ROUTE) {
      res.writeHead(204, MARKER); res.end();
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  writeFileSync(join(run, 'private-local-origin.txt'),
    'http://127.0.0.1:' + server.address().port + '\n', { mode: 0o600 });
  return {
    file, received,
    env: {
      PAYPAL_SANDBOX_CLIENT_ID: 'synthetic-client',
      PAYPAL_SANDBOX_CLIENT_SECRET: 'synthetic-secret',
      PAYPAL_SANDBOX_WEBHOOK_ID: WEBHOOK,
      PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN: ORIGIN,
      PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE: file,
    },
    async close() {
      server.closeAllConnections();
      await new Promise(done => server.close(done));
      rmSync(base, { recursive: true, force: true });
    },
  };
}

function output() {
  let stdout = '', stderr = '';
  return { io: { stdout: { write: text => { stdout += text; } },
    stderr: { write: text => { stderr += text; } } },
  get stdout() { return stdout; }, get stderr() { return stderr; } };
}

test('public probe is a prerequisite to authenticated registered-webhook preflight', async () => {
  const f = await fixture();
  try {
    const log = output(), calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url === CALLBACK) return new Response(null, { status: 204, headers: MARKER });
      if (url.endsWith('/v1/oauth2/token')) {
        return Response.json({ token_type: 'Bearer', access_token: 'synthetic-token' });
      }
      if (url.endsWith('/v1/notifications/webhooks')) {
        return Response.json({ webhooks: [{ id: WEBHOOK, url: CALLBACK,
          event_types: [{ name: 'INVOICING.INVOICE.PAID' }] }] });
      }
      throw Error('unexpected request');
    };
    assert.equal(await main(['--probe-public'], f.env, fetchImpl, log.io), 0);
    const result = JSON.parse(log.stdout);
    assert.equal(result.status, 'passed');
    assert.equal(result.publicForwarderReady, true);
    assert.equal(result.localCollectorReady, true);
    assert.equal(result.exactCallbackChecked, true);
    assert.equal(log.stderr, '');
    assert.deepEqual(calls.map(c => [c.url, c.init.method, c.init.redirect]), [
      [CALLBACK, 'HEAD', 'manual'],
      ['https://api-m.sandbox.paypal.com/v1/oauth2/token', 'POST', 'manual'],
      ['https://api-m.sandbox.paypal.com/v1/notifications/webhooks', 'GET', 'manual'],
    ]);
    assert.deepEqual(calls[0].init.headers, { Accept: '*/*' });
    assert.equal(f.received.length, 2, 'both liveness checks must use local HEAD');
    assert.ok(f.received.every(c => c.method === 'HEAD' && c.url === ROUTE));
    assert.ok(!log.stdout.includes(ROUTE));
    assert.ok(!log.stdout.includes(CALLBACK));
    assert.ok(!log.stdout.includes('synthetic-secret'));
  } finally { await f.close(); }
});

test('an unavailable forwarding route blocks before any authenticated PayPal request', async () => {
  const f = await fixture();
  try {
    const log = output(), calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, method: init.method });
      return new Response(null, { status: 404 });
    };
    assert.equal(await main(['--probe-public'], f.env, fetchImpl, log.io), 1);
    assert.deepEqual(JSON.parse(log.stdout), {
      status: 'failed', code: 'webhook_public_probe_unavailable',
    });
    assert.deepEqual(calls, [{ url: CALLBACK, method: 'HEAD' }]);
    assert.equal(f.received.length, 1);
    assert.ok(!log.stdout.includes(ROUTE));
  } finally { await f.close(); }
});

test('hosted callback mode fails the collector-specific probe without network calls', async () => {
  const log = output();
  let calls = 0;
  const code = await main(['--probe-public'], {
    PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL: CALLBACK,
  }, () => { calls++; throw Error('unexpected network'); }, log.io);
  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(log.stdout), {
    status: 'failed', code: 'webhook_public_probe_collector_required',
  });
  assert.equal(calls, 0);
});
