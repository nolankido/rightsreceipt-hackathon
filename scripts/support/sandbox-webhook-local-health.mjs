/** Read-only liveness check for the exact one-shot PayPal Sandbox collector.
 * This contacts ONLY 127.0.0.1, never PayPal, a forwarding service or an
 * arbitrary host. It cannot reserve the one-shot paid webhook capture slot.
 */
import { lstatSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const ROUTE = /^\/webhooks\/paypal\/sandbox\/capture\/[0-9a-f]{48}\n$/u;
const ORIGIN = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\n$/u;
const fail = () => Object.assign(new Error('Local Sandbox webhook collector is unavailable.'),
  { code: 'webhook_preflight_collector_unavailable' });

/** Require a fresh owned file pair before any loopback request is made. */
function localProbeTarget(routeFile) {
  if (typeof routeFile !== 'string' || routeFile.length > 4096
    || !routeFile || routeFile !== routeFile.trim()
    || basename(routeFile) !== 'private-route.txt'
    || !/^run-[A-Za-z0-9_-]+$/u.test(basename(dirname(routeFile)))) throw fail();
  const absolute = resolve(routeFile);
  const originFile = resolve(dirname(absolute), 'private-local-origin.txt');
  let route, origin;
  try {
    const directory = lstatSync(dirname(absolute));
    const routeStat = lstatSync(absolute);
    const originStat = lstatSync(originFile);
    if (!directory.isDirectory() || directory.isSymbolicLink()
      || !routeStat.isFile() || routeStat.isSymbolicLink()
      || routeStat.size < 1 || routeStat.size > 256
      || !originStat.isFile() || originStat.isSymbolicLink()
      || originStat.size < 1 || originStat.size > 64) throw fail();
    route = readFileSync(absolute, 'utf8');
    origin = readFileSync(originFile, 'utf8');
  } catch { throw fail(); }
  const match = ORIGIN.exec(origin);
  if (!ROUTE.test(route) || !match || Number(match[1]) > 65535) throw fail();
  const target = origin.slice(0, -1) + route.slice(0, -1);
  return target;
}

/** Fail before OAuth when the locally owned collector is no longer listening. */
export async function verifyLocalSandboxCollector(routeFile, fetchImpl = globalThis.fetch) {
  const target = localProbeTarget(routeFile);
  if (typeof fetchImpl !== 'function') throw fail();
  let response;
  try {
    response = await fetchImpl(target, {
      method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(2500),
      headers: { Accept: '*/*' },
    });
  } catch { throw fail(); }
  if (!(response instanceof Response) || response.status !== 204 || response.redirected
    || response.headers.get('x-rightsreceipt-capture-ready') !== 'unverified-local-v1'
    || (response.url && response.url !== target)) throw fail();
  return Object.freeze({ localCollectorReady: true, collectionState: 'unverified' });
}
