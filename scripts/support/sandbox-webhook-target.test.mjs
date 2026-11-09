import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectedSandboxWebhookUrl } from './sandbox-webhook-target.mjs';

const ORIGIN = 'https://rr-payments.workers.dev';
const ROUTE = '/webhooks/paypal/sandbox/capture/' + 'a'.repeat(48);
const DIRECT = ORIGIN + ROUTE;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rr-callback-target-'));
  const run = join(root, 'run-abcdef'); mkdirSync(run);
  const file = join(run, 'private-route.txt');
  writeFileSync(file, ROUTE + '\n', { mode: 0o600 });
  return { root, run, file, env: {
    PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN: ORIGIN,
    PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE: file,
  } };
}
const errorCode = (fn, code) => assert.throws(fn, e => e.code === code);

test('private route file plus public origin derives an exact callback', () => {
  const f = fixture();
  try {
    assert.equal(expectedSandboxWebhookUrl(f.env), DIRECT);
    assert.equal(readFileSync(f.file, 'utf8'), ROUTE + '\n');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('existing explicit callback URL remains supported', () => {
  assert.equal(expectedSandboxWebhookUrl({ PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL: DIRECT }), DIRECT);
});

test('mutually exclusive callback modes cannot be combined', () => {
  const f = fixture();
  try {
    errorCode(() => expectedSandboxWebhookUrl({
      ...f.env, PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL: DIRECT,
    }), 'webhook_preflight_callback_configuration_conflict');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('missing or incomplete callback configuration fails closed', () => {
  errorCode(() => expectedSandboxWebhookUrl({}), 'webhook_preflight_configuration_missing');
  errorCode(() => expectedSandboxWebhookUrl({
    PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL: '',
  }), 'webhook_preflight_configuration_missing');
  errorCode(() => expectedSandboxWebhookUrl({
    PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL: 'http://rr-payments.workers.dev/webhook',
  }), 'webhook_preflight_callback_invalid');
  errorCode(() => expectedSandboxWebhookUrl({
    PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN: ORIGIN,
  }), 'webhook_preflight_configuration_missing');
  errorCode(() => expectedSandboxWebhookUrl({
    PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE: 'private-route.txt',
  }), 'webhook_preflight_configuration_missing');
});

test('origin must be one public HTTPS host without path, credentials or query', () => {
  const f = fixture();
  try {
    for (const origin of [
      '', 'http://rr-payments.workers.dev', 'https://localhost',
      'https://example.com', 'https://127.0.0.1',
      'https://rr-payments.workers.dev/private', 'https://rr-payments.workers.dev/?secret=x',
      'https://user:pass@rr-payments.workers.dev', ' https://rr-payments.workers.dev',
      'https://rr-payments.workers.dev:8080',
    ]) {
      errorCode(() => expectedSandboxWebhookUrl({
        ...f.env, PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN: origin,
      }), 'webhook_preflight_callback_invalid');
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('an unavailable private route is never guessed or silently replaced', () => {
  const f = fixture();
  try {
    rmSync(f.file);
    errorCode(() => expectedSandboxWebhookUrl(f.env), 'webhook_preflight_route_unavailable');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('stale, malformed or extra private route bytes fail closed', () => {
  const f = fixture();
  try {
    for (const content of [
      '/webhooks/paypal/sandbox/capture/' + 'z'.repeat(48) + '\n',
      ROUTE, ROUTE + '\n\n', ROUTE + '\r\n',
      '/webhooks/paypal/sandbox/other/' + 'a'.repeat(48) + '\n',
      ROUTE + '/subpath\n',
    ]) {
      writeFileSync(f.file, content);
      errorCode(() => expectedSandboxWebhookUrl(f.env), 'webhook_preflight_route_unavailable');
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('route is required to be a regular private file under a run directory', () => {
  const f = fixture();
  try {
    const other = join(f.root, 'other.txt');
    writeFileSync(other, ROUTE + '\n');
    errorCode(() => expectedSandboxWebhookUrl({
      ...f.env, PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE: other,
    }), 'webhook_preflight_route_unavailable');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a symlink pretending to be a capture route is not followed', t => {
  const f = fixture();
  try {
    const target = join(f.root, 'source.txt');
    writeFileSync(target, ROUTE + '\n');
    rmSync(f.file);
    try { symlinkSync(target, f.file); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
        t.skip('Symlink creation is unavailable on this OS');
        return;
      }
      throw error;
    }
    errorCode(() => expectedSandboxWebhookUrl(f.env), 'webhook_preflight_route_unavailable');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('failed validation never includes the private route or configured URL', () => {
  const f = fixture();
  try {
    writeFileSync(f.file, ROUTE + '\n\n');
    try {
      expectedSandboxWebhookUrl(f.env);
      assert.fail('expected failure');
    } catch (error) {
      assert.equal(error.code, 'webhook_preflight_route_unavailable');
      assert.ok(!String(error).includes(ROUTE));
      assert.ok(!JSON.stringify(error).includes(ROUTE));
      assert.ok(!String(error).includes(ORIGIN));
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
