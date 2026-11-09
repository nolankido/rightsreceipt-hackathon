/** Confirm that the current PayPal Sandbox app targets the intended HTTPS callback.
 * Compare metadata only. Never log or return the URL or private capture route.
 */
const fail = code => Object.assign(new Error('Sandbox webhook callback preflight failed.'), { code });

function validExpectedCallback(value) {
  if (typeof value !== 'string' || value.length > 2048 || value !== value.trim()
    // eslint-disable-next-line no-control-regex -- Reject ASCII controls before URL parsing can normalize them.
    || /[\x00-\x20\x7f]/u.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.port || url.username || url.password
    || url.search || url.hash || url.pathname === '/'
    || !/^[a-z0-9.-]+$/u.test(host) || !host.includes('.') || host.includes('..')
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.endsWith('.internal') || host.endsWith('.invalid') || host.endsWith('.test')
    || host.endsWith('.example') || host === 'example.com' || host.endsWith('.example.com')
    || /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(host)) return null;
  return url.href;
}

/** The registered URL is already validated by the authenticated inventory check. */
export function confirmSandboxCallback(registeredUrl, expectedUrl) {
  const expected = validExpectedCallback(expectedUrl);
  if (!expected) throw fail('webhook_preflight_callback_invalid');
  const registered = validExpectedCallback(registeredUrl);
  if (!registered || registered !== expected) throw fail('webhook_preflight_callback_mismatch');
  return Object.freeze({ exactCallbackChecked: true });
}
