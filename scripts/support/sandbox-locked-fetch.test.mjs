import assert from 'node:assert/strict';
import test from 'node:test';
import { sandboxLockedFetch } from './sandbox-locked-fetch.mjs';

const URL = 'https://api-m.sandbox.paypal.com/v2/invoicing/invoices';
const failure = (code) => error => error?.code === code && !/https?:\/\//u.test(error.message);

test('manual redirect policy overrides the caller and preserves provider request metadata', async () => {
  const method = 'POST', body = JSON.stringify({ amount: '425.00' });
  let observed;
  const response = Response.json({ id: 'INV2-TEST-082' }, { status: 201 });
  const result = await sandboxLockedFetch(async (url, init) => {
    observed = { url, ...init };
    return response;
  }, URL, { method, body, redirect: 'follow', headers: { Authorization: 'Bearer synthetic-test-only' } });
  assert.equal(result, response);
  assert.deepEqual(observed, { url: URL, method, body, redirect: 'manual', headers: { Authorization: 'Bearer synthetic-test-only' } });
});

test('prevents a 302 redirect before the client can follow a production PayPal origin', async () => {
  let redirects;
  const response = Response.redirect('https://api-m.paypal.com/v2/invoicing/invoices', 302);
  await assert.rejects(sandboxLockedFetch(async (_url, init) => {
    redirects = init.redirect;
    return response;
  }, URL, { method: 'POST' }), failure('sandbox_redirect_forbidden'));
  assert.equal(redirects, 'manual');
});

test('never sends a request directly to live PayPal, a lookalike host, or URL credentials', async () => {
  let calls = 0;
  for (const target of [
    'https://api-m.paypal.com/v1/oauth2/token',
    'https://api-m.sandbox.paypal.com.evil.example/v2/invoicing/invoices',
    'https://api-m.sandbox.paypal.com' + String.fromCharCode(64) + 'api-m.paypal.com/v2/invoicing/invoices',
    'https://user:secret@api-m.sandbox.paypal.com/v2/invoicing/invoices',
    'http://api-m.sandbox.paypal.com/v2/invoicing/invoices',
    'https://api-m.sandbox.paypal.com/v2/invoicing/invoices#hidden',
    '/v2/invoicing/invoices',
  ]) {
    await assert.rejects(sandboxLockedFetch(async () => { calls++; return Response.json({}); }, target), failure('live_endpoint_forbidden'));
  }
  assert.equal(calls, 0);
});

test('rejects a followed redirect even when a fabricated fetch reports HTTP 200', async () => {
  const response = Response.json({ id: 'INV2-OTHER' });
  Object.defineProperty(response, 'redirected', { value: true });
  await assert.rejects(sandboxLockedFetch(async () => response, URL), failure('sandbox_redirect_forbidden'));
});

test('rejects a successful-looking response sourced from a different origin', async () => {
  const response = Response.json({ id: 'INV2-OTHER' });
  Object.defineProperty(response, 'url', { value: 'https://api-m.paypal.com/v2/invoicing/invoices' });
  await assert.rejects(sandboxLockedFetch(async () => response, URL), failure('sandbox_response_mismatch'));
});

test('rejects an HTTP 200 response at a different Sandbox API path', async () => {
  const response = Response.json({ id: 'INV2-OTHER' });
  Object.defineProperty(response, 'url', { value: 'https://api-m.sandbox.paypal.com/v2/invoicing/invoices/OTHER' });
  await assert.rejects(sandboxLockedFetch(async () => response, URL), failure('sandbox_response_mismatch'));
});

test('accepts an exact provider response URL and a non-redirected 202 send response', async () => {
  const response = new Response('', { status: 202 });
  Object.defineProperty(response, 'url', { value: URL });
  assert.equal((await sandboxLockedFetch(async () => response, URL, { method: 'POST' })).status, 202);
});

test('does not turn an ordinary provider 401 into a fabricated success or redirect error', async () => {
  const response = Response.json({ name: 'AUTHENTICATION_FAILURE' }, { status: 401 });
  const result = await sandboxLockedFetch(async () => response, URL);
  assert.equal(result.status, 401);
});

test('rejects an invalid response object and missing fetch implementation', async () => {
  await assert.rejects(sandboxLockedFetch(async () => ({ status: 200 }), URL), failure('sandbox_response_invalid'));
  await assert.rejects(sandboxLockedFetch(null, URL), failure('sandbox_transport_invalid'));
});

test('provider transport failures propagate for the caller to record as unavailable', async () => {
  await assert.rejects(sandboxLockedFetch(async () => { throw new Error('synthetic network error'); }, URL), /synthetic network error/u);
});
