import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySandboxPublicForwarder } from './sandbox-webhook-public-health.mjs';

const SECRET_ROUTE = '/webhooks/paypal/sandbox/capture/' + 'a'.repeat(48);
const CALLBACK = 'https://rr-payments.workers.dev' + SECRET_ROUTE;
const MARKER = { 'X-RightsReceipt-Capture-Ready': 'unverified-local-v1' };
const code = (promise, expected) => assert.rejects(promise, error =>
  error.code === expected && !String(error).includes(SECRET_ROUTE)
  && !String(error).includes(CALLBACK));

test('only a HEAD to the exact public callback can prove forwarder liveness', async () => {
  const calls = [];
  const result = await verifySandboxPublicForwarder(CALLBACK, async (url, init) => {
    calls.push({ url, ...init });
    return new Response(null, { status: 204, headers: MARKER });
  });
  assert.deepEqual(calls.map(({ url, method, redirect, headers }) =>
    ({ url, method, redirect, headers })), [{
      url: CALLBACK, method: 'HEAD', redirect: 'manual', headers: { Accept: '*/*' },
    }]);
  assert.ok(calls[0].signal instanceof AbortSignal);
  assert.deepEqual(result, { publicForwarderReady: true, collectionState: 'unverified' });
  assert.ok(!JSON.stringify(result).includes(SECRET_ROUTE));
});

test('untrusted, credential-bearing and malformed callback URLs fail before any request', async () => {
  let requests = 0;
  const fetchImpl = () => { requests++; throw Error('unexpected external request'); };
  for (const target of [
    '', 'http://rr-payments.workers.dev' + SECRET_ROUTE,
    'https://localhost' + SECRET_ROUTE,
    'https://127.0.0.1' + SECRET_ROUTE,
    'https://example.com' + SECRET_ROUTE,
    'https://user:pass@rr-payments.workers.dev' + SECRET_ROUTE,
    'https://rr-payments.workers.dev:8443' + SECRET_ROUTE,
    CALLBACK + '?token=abc', CALLBACK + '#fragment', CALLBACK + '/extra',
    CALLBACK.replace('a'.repeat(48), 'z'.repeat(48)),
    CALLBACK + '\n', ' https://rr-payments.workers.dev' + SECRET_ROUTE,
  ]) await code(verifySandboxPublicForwarder(target, fetchImpl), 'webhook_public_probe_target_invalid');
  assert.equal(requests, 0);
});

test('wrong marker or non-204 response cannot pass', async () => {
  for (const response of [
    new Response(null, { status: 200, headers: MARKER }),
    new Response(null, { status: 302, headers: { ...MARKER, Location: '/wrong' } }),
    new Response(null, { status: 204 }),
    new Response(null, { status: 204, headers: { 'X-RightsReceipt-Capture-Ready': 'wrong' } }),
    { status: 204, headers: new Headers(MARKER), redirected: false },
  ]) await code(verifySandboxPublicForwarder(CALLBACK, async () => response),
    'webhook_public_probe_unavailable');
});

test('redirected and cross-origin response objects fail even with a readiness marker', async () => {
  const redirected = new Response(null, { status: 204, headers: MARKER });
  Object.defineProperty(redirected, 'redirected', { value: true });
  const wrongUrl = new Response(null, { status: 204, headers: MARKER });
  Object.defineProperty(wrongUrl, 'url', { value: 'https://unexpected.workers.dev' + SECRET_ROUTE });
  await code(verifySandboxPublicForwarder(CALLBACK, async () => redirected),
    'webhook_public_probe_unavailable');
  await code(verifySandboxPublicForwarder(CALLBACK, async () => wrongUrl),
    'webhook_public_probe_unavailable');
});

test('network errors are sanitized and no retry or POST occurs', async () => {
  let calls = 0;
  await code(verifySandboxPublicForwarder(CALLBACK, async () => {
    calls++;
    throw Error('private URL ' + CALLBACK);
  }), 'webhook_public_probe_transport_unavailable');
  assert.equal(calls, 1);
  await code(verifySandboxPublicForwarder(CALLBACK, null),
    'webhook_public_probe_transport_unavailable');
});
