import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmSandboxCallback } from './sandbox-webhook-callback.mjs';

const route = 'https://rr-payments.workers.dev/webhooks/paypal/sandbox/capture/' + 'a'.repeat(48);
const other = 'https://rr-payments.workers.dev/webhooks/paypal/sandbox/capture/' + 'b'.repeat(48);
const check = (actual, expected, code) => {
  assert.throws(() => confirmSandboxCallback(actual, expected), error => error.code === code);
};

test('exact current HTTPS callback route passes without exposing it', () => {
  assert.deepEqual(confirmSandboxCallback(route, route), { exactCallbackChecked: true });
  assert.ok(!JSON.stringify(confirmSandboxCallback(route, route)).includes('capture/'));
});
test('changed one-shot collector route is rejected before invoice creation', () => {
  check(other, route, 'webhook_preflight_callback_mismatch');
});
test('different host or different URL pathname is rejected', () => {
  check(route.replace('workers.dev', 'example.org'), route, 'webhook_preflight_callback_mismatch');
  check(route.replace('/capture/', '/old-capture/'), route, 'webhook_preflight_callback_mismatch');
});
test('invalid expected webhook URL cannot be silently ignored', () => {
  for (const candidate of ['', undefined, null, 'http://rr-payments.workers.dev/path',
    'https://localhost/path', 'https://example.com/path', 'https://127.0.0.1/path',
    'https://rr-payments.workers.dev/', 'https://rr-payments.workers.dev/path?token=x',
    'https://user:pass@rr-payments.workers.dev/path', ' https://rr-payments.workers.dev/path']) {
    check(route, candidate, 'webhook_preflight_callback_invalid');
  }
});
test('callback registration cannot use an invalid listener', () => {
  check('https://localhost/path', route, 'webhook_preflight_callback_mismatch');
});
test('URL hostname normalization is safe but path case remains significant', () => {
  assert.deepEqual(confirmSandboxCallback(route.replace('rr-payments', 'RR-PAYMENTS'), route),
    { exactCallbackChecked: true });
  check(route.replace('/capture/', '/Capture/'), route, 'webhook_preflight_callback_mismatch');
});
test('callback mismatch errors never print either private URL', () => {
  try { confirmSandboxCallback(other, route); assert.fail('expected mismatch'); }
  catch (error) {
    assert.equal(error.code, 'webhook_preflight_callback_mismatch');
    assert.ok(!JSON.stringify(error).includes('capture/'));
    assert.ok(!error.message.includes('capture/'));
  }
});
