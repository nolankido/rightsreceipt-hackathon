/** No credential-bearing PayPal acceptance request may follow an HTTP redirect. */
const ORIGIN = 'https://api-m.sandbox.paypal.com';

function reject(code) {
  return Object.assign(new Error('Sandbox API transport boundary rejected the request.'), { code });
}

/**
 * Use for real Sandbox OAuth, invoice, status and webhook verification calls.
 * An injected fetch is accepted for local tests, but the URL and result must
 * still match the intended Sandbox endpoint exactly.
 */
export async function sandboxLockedFetch(fetchImpl, url, init = {}) {
  if (typeof fetchImpl !== 'function') throw reject('sandbox_transport_invalid');
  let requested;
  try { requested = new URL(url); }
  catch { throw reject('live_endpoint_forbidden'); }
  if (requested.origin !== ORIGIN || requested.username || requested.password || requested.hash) {
    throw reject('live_endpoint_forbidden');
  }

  // Native fetch follows 30x responses by default, including for POST. Never
  // let an OAuth token or authorized payment request leave the Sandbox origin.
  const response = await fetchImpl(url, { ...init, redirect: 'manual' });
  if (!(response instanceof Response)) throw reject('sandbox_response_invalid');
  if (response.redirected || response.type === 'opaqueredirect'
    || (response.status >= 300 && response.status < 400)) {
    throw reject('sandbox_redirect_forbidden');
  }
  // A nonempty Response.url must identify the exact request, not a followed
  // hop. In-memory Response.json fixtures have an empty URL, which is fine.
  if (response.url) {
    let returned;
    try { returned = new URL(response.url); }
    catch { throw reject('sandbox_response_invalid'); }
    if (returned.href !== requested.href) throw reject('sandbox_response_mismatch');
  }
  return response;
}
