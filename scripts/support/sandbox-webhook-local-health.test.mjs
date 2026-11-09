import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyLocalSandboxCollector } from './sandbox-webhook-local-health.mjs';

const ROUTE = '/webhooks/paypal/sandbox/capture/' + 'a'.repeat(48);
const CODE = 'webhook_preflight_collector_unavailable';

async function fixture({ respond = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'rr-local-capture-health-'));
  const run = join(base, 'run-abcdef');
  mkdirSync(run);
  const routeFile = join(run, 'private-route.txt');
  const originFile = join(run, 'private-local-origin.txt');
  writeFileSync(routeFile, ROUTE + '\n', { mode: 0o600 });
  const received = [];
  const server = createServer((req, res) => {
    received.push({ method: req.method, url: req.url });
    if (respond && req.url === ROUTE && req.method === 'HEAD') {
      res.writeHead(204, { 'X-RightsReceipt-Capture-Ready': 'unverified-local-v1' }); res.end();
    } else {
      res.writeHead(404); res.end('Not found');
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = 'http://127.0.0.1:' + server.address().port;
  writeFileSync(originFile, origin + '\n', { mode: 0o600 });
  return { base, run, routeFile, originFile, origin, server, received,
    async close() {
      server.closeAllConnections();
      await new Promise(done => server.close(done));
      rmSync(base, { recursive: true, force: true });
    } };
}
const fails = async (promise) => assert.rejects(promise, error => error.code === CODE);

test('live collector answers a private-route HEAD without consuming a webhook', async () => {
  const f = await fixture();
  try {
    const result = await verifyLocalSandboxCollector(f.routeFile);
    assert.deepEqual(result, { localCollectorReady: true, collectionState: 'unverified' });
    assert.deepEqual(f.received, [{ method: 'HEAD', url: ROUTE }]);
    assert.ok(!JSON.stringify(result).includes(ROUTE));
    assert.ok(!JSON.stringify(result).includes(f.origin));
  } finally { await f.close(); }
});
test('stale route is rejected even when a loopback server is still listening', async () => {
  const f = await fixture();
  try {
    writeFileSync(f.routeFile, ROUTE.replace('a'.repeat(48), 'b'.repeat(48)) + '\n');
    await fails(verifyLocalSandboxCollector(f.routeFile));
    assert.equal(f.received[0]?.method, 'HEAD');
  } finally { await f.close(); }
});
test('stopped collector fails closed instead of accepting a stale route file', async () => {
  const f = await fixture();
  try {
    await new Promise(done => f.server.close(done));
    await fails(verifyLocalSandboxCollector(f.routeFile));
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});
test('another local server without the collector marker cannot impersonate it', async () => {
  const f = await fixture({ respond: false });
  try { await fails(verifyLocalSandboxCollector(f.routeFile)); }
  finally { await f.close(); }
});
test('invalid, external, unbound and stale local origin files fail without making requests', async () => {
  const f = await fixture();
  try {
    for(const origin of [
      'https://127.0.0.1:8788\n', 'http://localhost:8788\n',
      'http://example.org:8788\n', 'http://127.0.0.1:65536\n',
      'http://127.0.0.1:0\n', 'http://127.0.0.1:1234/path\n',
      'http://127.0.0.1:8788?token=secret\n', 'http://127.0.0.1:8788\n\n'
    ]) {
      writeFileSync(f.originFile, origin);
      await fails(verifyLocalSandboxCollector(f.routeFile));
    }
    assert.equal(f.received.length, 0);
  } finally { await f.close(); }
});
test('missing local origin file fails before loopback HTTP', async () => {
  const f = await fixture();
  try {
    rmSync(f.originFile);
    await fails(verifyLocalSandboxCollector(f.routeFile));
    assert.equal(f.received.length, 0);
  } finally { await f.close(); }
});
test('invalid private route bytes fail before loopback HTTP', async () => {
  const f = await fixture();
  try {
    writeFileSync(f.routeFile, ROUTE + '\r\n');
    await fails(verifyLocalSandboxCollector(f.routeFile));
    assert.equal(f.received.length, 0);
  } finally { await f.close(); }
});
test('symlinked local-origin metadata is refused', async t => {
  const f = await fixture();
  try {
    const backup = join(f.run, 'outside.txt');
    writeFileSync(backup, f.origin + '\n');
    rmSync(f.originFile);
    try { symlinkSync(backup, f.originFile); }
    catch(error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Symlinks unavailable'); return; }
      throw error;
    }
    await fails(verifyLocalSandboxCollector(f.routeFile));
  } finally { await f.close(); }
});
test('unexpected private route filename is refused', async () => {
  const f = await fixture();
  try {
    await fails(verifyLocalSandboxCollector(join(f.run, 'wrong-route.txt')));
    assert.equal(f.received.length, 0);
  } finally { await f.close(); }
});
test('a redirected or unexpected HTTP response cannot claim local collector readiness', async () => {
  const f = await fixture();
  try {
    const fake = async () => new Response(null, { status: 302, headers: { Location: '/other' } });
    await fails(verifyLocalSandboxCollector(f.routeFile, fake));
    assert.equal(f.received.length, 0);
  } finally { await f.close(); }
});
