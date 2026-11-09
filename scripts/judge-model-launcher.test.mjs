import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runModelDiagnostic } from './judge-local-console.mjs';

const rendered = '<!doctype html><title>Actual local AI diagnostic | RightsReceipt</title>';
function childFixture(onKill = () => {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.kill = () => { onKill(); return true; };
  return child;
}

test('successful model child returns only its stdout HTML and uses no credentials', async () => {
  const child = childFixture();
  const pending = runModelDiagnostic({ spawnChild: (_binary, args, options) => {
    assert.deepEqual(args.slice(0, 2), ['--no-warnings', '--experimental-strip-types']);
    assert.match(args[2], /judge-ai-demo\.mjs$/u);
    assert.equal(options.windowsHide, true);
    assert.equal(options.env.PAYPAL_CLIENT_SECRET, undefined);
    return child;
  }, timeoutMs: 1000 });
  child.stdout.write(rendered);
  child.emit('close', 0);
  assert.equal(await pending, rendered);
});

test('nonzero exit cannot return a successful model diagnostic', async () => {
  const child = childFixture();
  const pending = runModelDiagnostic({ spawnChild: () => child, timeoutMs: 1000 });
  child.stdout.write(rendered);
  child.emit('close', 1);
  assert.equal(await pending, null);
});

test('model timeout settles even if the child never emits close', async () => {
  let kills = 0;
  const child = childFixture(() => { kills++; });
  const started = Date.now();
  assert.equal(await runModelDiagnostic({ spawnChild: () => child, timeoutMs: 10 }), null);
  assert.equal(kills, 1);
  assert.ok(Date.now() - started < 500, 'a killed worker must not hang the HTTP route');
});

test('model timeout latches failure before a synchronous kill-close success race', async () => {
  const child = childFixture();
  child.kill = () => { child.emit('close', 0); return true; };
  const pending = runModelDiagnostic({ spawnChild: () => child, timeoutMs: 10 });
  child.stdout.write(rendered);
  assert.equal(await pending, null);
});

test('oversized model output rejects promptly and ignores late apparently valid output', async () => {
  let kills = 0;
  const child = childFixture(() => { kills++; });
  const pending = runModelDiagnostic({ spawnChild: () => child, timeoutMs: 1000 });
  child.stdout.write('x'.repeat(131073));
  assert.equal(await pending, null);
  assert.equal(kills, 1);
  child.stdout.write(rendered);
  child.emit('close', 0);
});

test('spawn and child errors settle safely with no raw diagnostic disclosure', async () => {
  assert.equal(await runModelDiagnostic({ spawnChild: () => { throw Error('private diagnostic'); } }), null);
  let kills = 0;
  const child = childFixture(() => { kills++; });
  const pending = runModelDiagnostic({ spawnChild: () => child, timeoutMs: 1000 });
  child.emit('error', Error('private diagnostic'));
  assert.equal(await pending, null);
  assert.equal(kills, 1);
  child.emit('close', 0);
});
