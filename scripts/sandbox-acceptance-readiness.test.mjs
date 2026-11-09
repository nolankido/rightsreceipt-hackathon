import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectSandboxLocalReadiness, main } from './sandbox-acceptance-readiness.mjs';

const complete = () => ({
  PAYPAL_SANDBOX_CLIENT_ID: 'sandbox-client-id-private',
  PAYPAL_SANDBOX_CLIENT_SECRET: 'sandbox-secret-private',
  PAYPAL_SANDBOX_MERCHANT_NAME: 'fixture-test-merchant',
  PAYPAL_SANDBOX_MERCHANT_EMAIL: 'fixture-merchant@example.test',
  PAYPAL_SANDBOX_BUYER_EMAIL: 'fixture-buyer@example.test',
  PAYPAL_SANDBOX_WEBHOOK_ID: 'sandbox-webhook-private',
});
const hosted = () => ({
  ...complete(),
  PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL: 'https://sandbox-webhooks.example.test/secret-route',
});
function capture(args, env) {
  let stdout = '';
  let stderr = '';
  const code = main(args, env, {
    stdout: { write: value => { stdout += value; } },
    stderr: { write: value => { stderr += value; } },
  });
  return { code, stdout, stderr };
}

test('missing local configuration is explicit and never attempts network access', () => {
  const result = inspectSandboxLocalReadiness({});
  assert.equal(result.status, 'blocked');
  assert.equal(result.callbackMode, 'not_selected');
  assert.equal(result.nextStep, 'choose_callback_mode');
  assert.equal(result.networkRequests, 0);
  assert.deepEqual(result.missingEnvironment, Object.keys(complete()));
  assert.deepEqual(result.callbackChoices, [
    ['PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL'],
    ['PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN', 'PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE'],
  ]);
});

test('hosted callback configuration reports only local presence, not provider verification', () => {
  const result = inspectSandboxLocalReadiness(hosted());
  assert.equal(result.status, 'configuration_present_not_verified');
  assert.equal(result.callbackMode, 'hosted');
  assert.deepEqual(result.missingEnvironment, []);
  assert.equal(result.nextStep, 'run_registered_webhook_preflight');
  assert.equal(result.networkRequests, 0);
});

test('collector mode requires both origin and private-route file', () => {
  const result = inspectSandboxLocalReadiness({
    ...complete(),
    PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN: 'https://forwarder.example.test',
  });
  assert.equal(result.callbackMode, 'collector_incomplete');
  assert.deepEqual(result.missingEnvironment, ['PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE']);
  assert.equal(result.status, 'blocked');
  const ready = inspectSandboxLocalReadiness({
    ...complete(),
    PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN: 'https://forwarder.example.test',
    PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE: '.data/private-route.txt',
  });
  assert.equal(ready.callbackMode, 'collector');
  assert.equal(ready.status, 'configuration_present_not_verified');
});

test('mixed hosted and collector settings fail with a fixed conflict code', () => {
  const result = inspectSandboxLocalReadiness({
    ...hosted(), PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN: 'https://forwarder.example.test',
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.callbackMode, 'conflict');
  assert.equal(result.nextStep, 'choose_one_callback_mode');
});

test('blank, control-character and oversized values cannot appear configured', () => {
  const env = complete();
  env.PAYPAL_SANDBOX_CLIENT_ID = '  ';
  env.PAYPAL_SANDBOX_CLIENT_SECRET = 'bad\nsecret';
  env.PAYPAL_SANDBOX_WEBHOOK_ID = 'x'.repeat(2049);
  const result = inspectSandboxLocalReadiness(env);
  assert.deepEqual(result.missingEnvironment, [
    'PAYPAL_SANDBOX_CLIENT_ID',
    'PAYPAL_SANDBOX_CLIENT_SECRET',
    'PAYPAL_SANDBOX_WEBHOOK_ID',
  ]);
  assert.equal(result.status, 'blocked');
});

test('CLI output never includes any configured value or private callback path', () => {
  const env = hosted();
  const result = capture([], env);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).status, 'configuration_present_not_verified');
  for (const value of Object.values(env)) assert.ok(!result.stdout.includes(value));
  const blocked = capture([], { ...env, PAYPAL_SANDBOX_CLIENT_SECRET: '' });
  assert.equal(blocked.code, 1);
  assert.equal(JSON.parse(blocked.stdout).status, 'blocked');
  for (const value of Object.values(env)) assert.ok(!blocked.stdout.includes(value));
});

test('invalid arguments reveal no CLI input, while help needs no configuration', () => {
  const unknown = capture(['--secret', 'do-not-print-me'], hosted());
  assert.equal(unknown.code, 2);
  assert.deepEqual(JSON.parse(unknown.stdout), { status: 'failed', code: 'invalid_arguments' });
  assert.ok(!unknown.stdout.includes('do-not-print-me'));
  const help = capture(['--help'], {});
  assert.equal(help.code, 0);
  assert.match(help.stdout, /No network call/u);
  assert.equal(help.stderr, '');
});

test('unrelated inherited environment values cannot enter the report', () => {
  const result = capture([], {
    ...hosted(), OPENAI_API_KEY: 'fixture-unrelated-private-value',
    PAYPAL_SECRET_EXTRA: 'should-never-print',
  });
  assert.equal(result.code, 0);
  assert.ok(!result.stdout.includes('unrelated-private-value'));
  assert.ok(!result.stdout.includes('should-never-print'));
});
