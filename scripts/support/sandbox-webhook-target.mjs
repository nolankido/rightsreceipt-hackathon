/** Build the intended Sandbox callback from a private capture route without
 * putting its unguessable URL in shell commands, logs or committed config.
 */
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirmSandboxCallback } from './sandbox-webhook-callback.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROUTE = /^\/webhooks\/paypal\/sandbox\/capture\/[a-f0-9]{48}\n$/u;
const fail = code => Object.assign(new Error('Sandbox callback configuration is unavailable.'), { code });

function readPrivateCaptureRoute(file) {
  if (typeof file !== 'string' || !file || file !== file.trim() || file.length > 4096
    || basename(file) !== 'private-route.txt') throw fail('webhook_preflight_route_unavailable');
  let absolute, stat, parent;
  try {
    absolute = resolve(file);
    stat = lstatSync(absolute);
    parent = lstatSync(dirname(absolute));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 256
      || !parent.isDirectory() || parent.isSymbolicLink()
      || !/^run-[A-Za-z0-9_-]+$/u.test(basename(dirname(absolute)))) throw Error();
    const relativePath = relative(ROOT, realpathSync(absolute)).split(sep).join('/');
    if (relativePath !== '.data' && !relativePath.startsWith('.data/')
      && relativePath !== '..' && !relativePath.startsWith('../')
      && !isAbsolute(relativePath)) throw Error();
  } catch { throw fail('webhook_preflight_route_unavailable'); }
  let route;
  try { route = readFileSync(absolute, 'utf8'); }
  catch { throw fail('webhook_preflight_route_unavailable'); }
  if (!ROUTE.test(route)) throw fail('webhook_preflight_route_unavailable');
  return route.slice(0, -1);
}

function validPublicOrigin(raw) {
  if (typeof raw !== 'string' || !raw || raw !== raw.trim() || raw.length > 2048) {
    throw fail('webhook_preflight_callback_invalid');
  }
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw fail('webhook_preflight_callback_invalid'); }
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash
    || ![parsed.origin, parsed.origin + '/'].includes(raw)) {
    throw fail('webhook_preflight_callback_invalid');
  }
  // Reuse the same public-host checks as the registered callback verifier.
  confirmSandboxCallback(parsed.origin + '/webhooks/paypal/sandbox/preflight',
    parsed.origin + '/webhooks/paypal/sandbox/preflight');
  return parsed.origin;
}

/** Accept either an explicit URL or the safer public-origin/private-file pair. */
export function expectedSandboxWebhookUrl(env = {}) {
  const direct = env.PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL;
  const origin = env.PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN;
  const routeFile = env.PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE;
  if (direct !== undefined && (origin !== undefined || routeFile !== undefined)) {
    throw fail('webhook_preflight_callback_configuration_conflict');
  }
  if (direct !== undefined) {
    // An explicitly empty variable is a missing callback configuration,
    // not a malformed URL. Preserve that distinction before any OAuth call.
    if (direct === '') throw fail('webhook_preflight_configuration_missing');
    confirmSandboxCallback(direct, direct);
    return direct;
  }
  if (origin === undefined && routeFile === undefined) {
    throw fail('webhook_preflight_configuration_missing');
  }
  if (origin === undefined || routeFile === undefined) {
    throw fail('webhook_preflight_configuration_missing');
  }
  const publicOrigin = validPublicOrigin(origin);
  const callback = publicOrigin + readPrivateCaptureRoute(routeFile);
  confirmSandboxCallback(callback, callback);
  return callback;
}
