/** Read-only public forwarding check for the private one-shot Sandbox collector.
 * No PayPal credentials, invoice data, cookies or webhook signature are sent.
 * A passing HEAD proves only the current public route reaches a collector marker.
 */
const ROUTE = /^\/webhooks\/paypal\/sandbox\/capture\/[a-f0-9]{48}$/u;
const MARKER = 'unverified-local-v1';

const fail = code => Object.assign(
  new Error('Public Sandbox webhook forwarding probe did not pass.'), { code },
);

function checkedTarget(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || value !== value.trim()) {
    throw fail('webhook_public_probe_target_invalid');
  }
  let url;
  try { url = new URL(value); }
  catch { throw fail('webhook_public_probe_target_invalid'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || url.search || url.hash || url.href !== value || !ROUTE.test(url.pathname)
    || !/^[a-z0-9.-]+$/u.test(host) || !host.includes('.') || host.includes('..')
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.endsWith('.internal') || host.endsWith('.invalid') || host.endsWith('.test')
    || host.endsWith('.example') || host === 'example.com' || host.endsWith('.example.com')
    || /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(host)) {
    throw fail('webhook_public_probe_target_invalid');
  }
  return value;
}

/**
 * Do not call with a general URL. Accept only the exact current callback
 * derived from the validated private collector route and public origin.
 */
export async function verifySandboxPublicForwarder(target, fetchImpl = globalThis.fetch) {
  const callback = checkedTarget(target);
  if (typeof fetchImpl !== 'function') throw fail('webhook_public_probe_transport_unavailable');
  let response;
  try {
    response = await fetchImpl(callback, {
      method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(6000),
      headers: { Accept: '*/*' },
    });
  } catch { throw fail('webhook_public_probe_transport_unavailable'); }
  if (!(response instanceof Response) || response.status !== 204 || response.redirected
    || response.headers.get('x-rightsreceipt-capture-ready') !== MARKER
    || (response.url && response.url !== callback)) {
    throw fail('webhook_public_probe_unavailable');
  }
  return Object.freeze({ publicForwarderReady: true, collectionState: 'unverified' });
}
