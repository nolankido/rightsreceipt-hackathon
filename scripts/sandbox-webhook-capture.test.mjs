import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, lstatSync, readFileSync, existsSync, rmSync, symlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSandboxWebhookCapture } from './sandbox-webhook-capture.mjs';
import { bindSandboxCaptureInvoice } from './support/sandbox-webhook-binding.mjs';

const invoice = 'INV2-CANONICAL-SANDBOX-072';
const signature = 'a'.repeat(96);
const headers = () => ({
  'Content-Type': 'application/json', 'paypal-transmission-id': 'f2fb3610-0123-4401-a030-abcdef072000',
  'paypal-transmission-time': new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-TEST072',
  'paypal-transmission-sig': signature,
});
function bindFixture(app, dir) {
  const folder = join(dir, 'private-invoice-state');
  mkdirSync(folder);
  const statePath = join(folder, 'state.json');
  writeFileSync(statePath, JSON.stringify({
    schemaVersion: 'rightsreceipt-paypal-sandbox-state-v1', phase: 'sent_checked',
    invoiceId: invoice, entry: { sendState: 'confirmed', binding: { draft: { invoiceId: invoice } } },
  }));
  return bindSandboxCaptureInvoice({ routeFile: app.routeFile, statePath });
}
const event = (type = 'INVOICING.INVOICE.PAID', id = invoice) => ({
  id: 'WH-CANONICAL-EVENT-072', event_type: type, create_time: new Date().toISOString(),
  resource: { id, status: 'PAID' }, note: 'Preserve literal whitespace and 日本語',
});
const post = (app, body, overrides = {}, path = app.routePath) => fetch(app.origin + path, {
  method: 'POST', redirect: 'manual', headers: { ...headers(), ...overrides }, body,
});
async function withCapture(fn, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rr072-test-'));
  let app;
  try {
    const { bind = true, ...collectorOptions } = opts;
    app = await startSandboxWebhookCapture({ port: 0, output: dir, timeoutMs: 5000, ...collectorOptions });
    if (bind) bindFixture(app, dir);
    await fn(app, dir);
  } finally {
    if (app) await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('binds only loopback with 192-bit private URL capability and owner-only file', async () => withCapture(async (app) => {
  assert.match(app.origin, /^http:\/\/127\.0\.0\.1:\d+$/u);
  assert.match(app.routePath, /^\/webhooks\/paypal\/sandbox\/capture\/[a-f0-9]{48}$/u);
  assert.equal(readFileSync(app.routeFile, 'utf8'), app.routePath + '\n');
  const localOriginFile = join(app.directory, 'private-local-origin.txt');
  assert.equal(readFileSync(localOriginFile, 'utf8'), app.origin + '\n');
  if (process.platform !== 'win32') {
    assert.equal(lstatSync(app.routeFile).mode & 0o777, 0o600);
    assert.equal(lstatSync(localOriginFile).mode & 0o777, 0o600);
    assert.equal(lstatSync(app.directory).mode & 0o777, 0o700);
  }
  assert.equal(app.server.address().address, '127.0.0.1');
  assert.equal((await fetch(app.origin + '/')).status, 404);
  assert.equal((await fetch(app.origin + app.routePath)).status, 405);
  const health = await fetch(app.origin + app.routePath, { method: 'HEAD', redirect: 'manual' });
  assert.equal(health.status, 204);
  assert.equal(health.headers.get('x-rightsreceipt-capture-ready'), 'unverified-local-v1');
  assert.equal(existsSync(app.capturePath), false);
  assert.equal((await post(app, '{}', {}, app.routePath + '?token=1')).status, 404);
}));

test('captures exact raw paid event and signed header fields without claiming verification', async () => withCapture(async app => {
  const raw = '{\n  "id": "WH-CANONICAL-EVENT-072", "event_type": "INVOICING.INVOICE.PAID",\n'
    + '  "resource": {"id":"' + invoice + '","status":"PAID"}, "note":"日本語"\n}\n';
  const response = await post(app, raw);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /later verification/u);
  const completion = await app.captured;
  assert.equal(completion.status, 'captured_unverified');
  const data = JSON.parse(readFileSync(completion.capturePath, 'utf8'));
  assert.deepEqual(Object.keys(data).sort(), ['body', 'headers', 'schemaVersion']);
  assert.equal(data.schemaVersion, 'rightsreceipt-paypal-webhook-capture-v1');
  assert.equal(data.body, raw);
  assert.equal(data.headers['paypal-transmission-sig'], signature);
  assert.equal(Object.keys(data.headers).length, 5);
  assert.equal(JSON.stringify(completion).includes(signature), false);
  assert.equal(JSON.stringify(completion).includes(invoice), false);
  assert.equal((await post(app, raw)).status, 410);
  if (process.platform !== 'win32') assert.equal(lstatSync(completion.capturePath).mode & 0o777, 0o600);
}));

test('non-paid webhook events are acknowledged as ignored, without storing their contents', async () => withCapture(async app => {
  assert.equal((await post(app, JSON.stringify(event('INVOICING.INVOICE.SENT')))).status, 202);
  assert.equal(existsSync(app.capturePath), false);
  assert.equal((await post(app, JSON.stringify(event()))).status, 200);
  assert.equal((await app.captured).status, 'captured_unverified');
}));

test('rejects missing, invalid and production certificate signature headers', async () => withCapture(async app => {
  for (const changes of [
    { 'paypal-transmission-sig': '' },
    { 'paypal-cert-url': 'https://api-m.paypal.com/v1/notifications/certs/CERT-REAL' },
    { 'paypal-auth-algo': 'SHA1withRSA' },
    { 'paypal-transmission-time': 'not-a-time' },
  ]) assert.equal((await post(app, JSON.stringify(event()), changes)).status, 400);
  assert.equal(existsSync(app.capturePath), false);
}));

test('rejects invalid JSON, wrong paid status and unsupported payloads', async () => withCapture(async app => {
  assert.equal((await post(app, '{not-json}')).status, 400);
  assert.equal((await post(app, JSON.stringify({ ...event(), resource: { id: invoice, status: 'UNPAID' } }))).status, 202);
  assert.equal((await post(app, JSON.stringify(event()), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(app, JSON.stringify(event()), { 'Content-Encoding': 'gzip' })).status, 415);
  assert.equal(existsSync(app.capturePath), false);
}));

test('bounds received bytes even without a claimed Content-Length', async () => withCapture(async app => {
  const oversized = JSON.stringify({ ...event(), filler: 'x'.repeat(132000) });
  const response = await post(app, oversized);
  assert.equal(response.status, 400);
  assert.equal(existsSync(app.capturePath), false);
}));

test('accepts the PayPal nested resource.invoice shape without rewriting the raw event', async () => withCapture(async app => {
  const raw = JSON.stringify({ ...event(), resource: { id: invoice, invoice: { id: invoice, status: 'PAID' } } });
  assert.equal((await post(app, raw)).status, 200);
  assert.equal(JSON.parse(readFileSync((await app.captured).capturePath, 'utf8')).body, raw);
}));

test('times out without writing a fake successful capture', async () => withCapture(async app => {
  const outcome = await app.captured;
  assert.deepEqual(outcome, { status: 'failed', code: 'capture_timeout' });
  assert.equal(existsSync(app.capturePath), false);
}, { timeoutMs: 125 }));

test('rejects tracked repository output and symlink output parents', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await assert.rejects(startSandboxWebhookCapture({ output: root, port: 0 }), e => e.code === 'unsafe_private_path');
  const dir = mkdtempSync(join(tmpdir(), 'rr072-path-'));
  try {
    if (process.platform !== 'win32') {
      mkdirSync(join(dir, 'real'));
      symlinkSync(join(dir, 'real'), join(dir, 'link'), 'dir');
      await assert.rejects(startSandboxWebhookCapture({ output: join(dir, 'link'), port: 0 }), e => e.code === 'unsafe_private_path');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI help describes only unverified private capture and never opens a socket', () => {
  const script = fileURLToPath(new URL('./sandbox-webhook-capture.mjs', import.meta.url));
  const processResult = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(processResult.status, 0, processResult.stderr);
  assert.match(processResult.stdout, /UNVERIFIED/u);
  assert.match(processResult.stdout, /HTTPS:443/u);
  const forwarded = spawnSync(process.execPath, [script, '--', '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(forwarded.status, 0, forwarded.stderr);
});


test('a matching paid event cannot consume the one-shot slot before private invoice binding', async () => withCapture(async (app, dir) => {
  const raw = JSON.stringify(event());
  assert.equal((await post(app, raw)).status, 503);
  assert.equal(existsSync(app.capturePath), false);
  bindFixture(app, dir);
  assert.equal((await post(app, raw)).status, 200);
  assert.equal((await app.captured).status, 'captured_unverified');
}, { bind: false }));

test('a paid event for another invoice is ignored, preserving the capture for the matching invoice', async () => withCapture(async app => {
  const other = JSON.stringify(event('INVOICING.INVOICE.PAID', 'INV2-OTHER-SANDBOX-073'));
  assert.equal((await post(app, other)).status, 202);
  assert.equal(existsSync(app.capturePath), false);
  const expected = JSON.stringify(event());
  assert.equal((await post(app, expected)).status, 200);
  assert.equal(JSON.parse(readFileSync((await app.captured).capturePath, 'utf8')).body, expected);
}));

test('too-old and implausibly future transmissions fail the verifier-aligned boundary', async () => withCapture(async app => {
  for (const seconds of [301, -(259_500 + 61)]) {
    const time = new Date(Date.now() + seconds*1000).toISOString().replace(/\.\d{3}Z$/u,'Z');
    assert.equal((await post(app, JSON.stringify(event()), { 'paypal-transmission-time': time })).status, 400);
  }
  assert.equal(existsSync(app.capturePath), false);
  assert.equal((await post(app, JSON.stringify(event()))).status, 200);
}));

test('a delayed PayPal retry remains collectable but unverified', async () => withCapture(async app => {
  const time = new Date(Date.now() - 20*60_000).toISOString().replace(/\.\d{3}Z$/u,'Z');
  assert.equal((await post(app, JSON.stringify(event()), { 'paypal-transmission-time': time })).status, 200);
  assert.equal((await app.captured).status, 'captured_unverified');
}));

test('sub-millisecond UTC transmission headers survive the collector byte-for-byte', async () => withCapture(async app => {
  const prefix = new Date().toISOString().slice(0, -1);
  const tooPrecise = prefix + '4567890Z';
  assert.equal((await post(app, JSON.stringify(event()), { 'paypal-transmission-time': tooPrecise })).status, 400);
  assert.equal(existsSync(app.capturePath), false);
  const precise = prefix + '456789Z';
  assert.equal((await post(app, JSON.stringify(event()), { 'paypal-transmission-time': precise })).status, 200);
  const saved = JSON.parse(readFileSync((await app.captured).capturePath, 'utf8'));
  assert.equal(saved.headers['paypal-transmission-time'], precise);
}));

test('partially paid and pending paid-event notifications do not consume the only capture', async () => withCapture(async app => {
  for (const status of ['PARTIALLY_PAID','PAYMENT_PENDING']) {
    assert.equal((await post(app, JSON.stringify({ ...event(), resource: { id: invoice, status } }))).status, 202);
  }
  assert.equal(existsSync(app.capturePath),false);
  assert.equal((await post(app, JSON.stringify(event()))).status,200);
}));

test('a malformed binding is not treated as an unbound wildcard invoice', async () => withCapture(async app => {
  const file = join(app.directory,'invoice-binding.json');
  writeFileSync(file, JSON.stringify({ schemaVersion: 'tampered', invoiceId: invoice }), {flag:'w'});
  assert.equal((await post(app, JSON.stringify(event()))).status,503);
  assert.equal(existsSync(app.capturePath),false);
}));


test('a webhook after the terminal timeout is rejected and no private capture is written', async () => withCapture(async app => {
  const outcome = await app.captured;
  assert.deepEqual(outcome, { status: 'failed', code: 'capture_timeout' });
  assert.equal((await post(app, JSON.stringify(event()))).status, 410);
  assert.equal(existsSync(app.capturePath), false);
}, { timeoutMs: 125 }));

test('a request begun before timeout cannot write when its body completes afterward', async () => withCapture(async app => {
  const { request } = await import('node:http');
  const raw = JSON.stringify(event());
  let sender;
  const response = new Promise((resolveResponse, rejectResponse) => {
    sender = request(app.origin + app.routePath, { method: 'POST', headers: headers() }, res => {
      res.resume();
      res.on('end', () => resolveResponse(res.statusCode));
      res.on('error', rejectResponse);
    });
    sender.on('error', rejectResponse);
    sender.write(raw.slice(0, 20));
  });
  const outcome = await app.captured;
  assert.equal(outcome.code, 'capture_timeout');
  sender.end(raw.slice(20));
  assert.equal(await response, 410);
  assert.equal(existsSync(app.capturePath), false);
}, { timeoutMs: 200 }));


test('expired receiver never parses or stores malformed late webhook bodies', async () => withCapture(async app => {
  assert.equal((await app.captured).code, 'capture_timeout');
  assert.equal((await post(app, '{definitely-not-json')).status, 410);
  assert.equal(existsSync(app.capturePath), false);
}, { timeoutMs: 125 }));
