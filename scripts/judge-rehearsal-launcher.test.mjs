import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRehearsal } from './judge-local-console.mjs';

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'rightsreceipt-launcher-'));
  const directory = join(base, 'run-fixture');
  mkdirSync(directory);
  const report = join(directory, 'report.html');
  const evidence = join(directory, 'evidence.json');
  writeFileSync(report, '<!doctype html><title>Offline report</title>');
  writeFileSync(evidence, '{"mode":"local_injected"}');
  const result = JSON.stringify({ status: 'passed', mode: 'local_injected',
    scenarioCount: 3, resetCount: 3, reportPath: report, evidencePath: evidence });
  return { base, report, evidence, result, close: () => rmSync(base, { recursive: true, force: true }) };
}

function childFixture(onKill = () => {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.kill = () => { onKill(); return true; };
  return child;
}

test('valid zero-exit child returns only its owned report and evidence paths', async () => {
  const f = fixture(), child = childFixture();
  try {
    const pending = runRehearsal(f.base, { spawnChild: (_binary, args, options) => {
      assert.deepEqual(args.slice(-2), ['--output', f.base]);
      assert.equal(options.windowsHide, true);
      assert.equal(options.env.PAYPAL_CLIENT_SECRET, undefined);
      return child;
    }, timeoutMs: 1000 });
    child.stdout.write(f.result);
    child.emit('close', 0);
    assert.deepEqual(await pending, { report: f.report, evidence: f.evidence });
  } finally { f.close(); }
});

test('deadline rejects late valid-looking success even if kill is followed by exit zero', async () => {
  const f = fixture();
  let kills = 0;
  const child = childFixture(() => {
    kills++;
    setImmediate(() => { child.stdout.write(f.result); child.emit('close', 0); });
  });
  try {
    const outcome = await runRehearsal(f.base, { spawnChild: () => child, timeoutMs: 10 });
    assert.equal(outcome, null);
    assert.equal(kills, 1);
    await new Promise(resolve => setTimeout(resolve, 10));
  } finally { f.close(); }
});

test('timeout failure is latched before a synchronous kill-close race can pass', async () => {
  const f = fixture();
  const child = childFixture();
  child.kill = () => { child.emit('close', 0); return true; };
  try {
    // Even a child with complete valid stdout must not pass after the timer fires.
    const pending = runRehearsal(f.base, { spawnChild: () => child, timeoutMs: 10 });
    child.stdout.write(f.result);
    assert.equal(await pending, null);
  } finally { f.close(); }
});

test('deadline settles even when a killed child never emits close', async () => {
  const f = fixture();
  let kills = 0;
  try {
    const child = childFixture(() => { kills++; });
    const started = Date.now();
    const outcome = await runRehearsal(f.base, { spawnChild: () => child, timeoutMs: 10 });
    assert.equal(outcome, null);
    assert.equal(kills, 1);
    assert.ok(Date.now() - started < 500, 'the request must settle without a close event');
  } finally { f.close(); }
});

test('oversized worker output fails immediately without waiting for close', async () => {
  const f = fixture();
  let kills = 0;
  try {
    const child = childFixture(() => { kills++; });
    const pending = runRehearsal(f.base, { spawnChild: () => child, timeoutMs: 1000 });
    child.stdout.write('x'.repeat(8193));
    assert.equal(await pending, null);
    assert.equal(kills, 1);
    child.stdout.write(f.result);
    child.emit('close', 0);
  } finally { f.close(); }
});

test('spawn failure and child error fail closed without exposing error details', async () => {
  const f = fixture();
  try {
    assert.equal(await runRehearsal(f.base, { spawnChild: () => {
      throw Error('private diagnostic');
    } }), null);
    const child = childFixture();
    const pending = runRehearsal(f.base, { spawnChild: () => child, timeoutMs: 1000 });
    child.emit('error', Error('private diagnostic'));
    assert.equal(await pending, null);
    child.emit('close', 0);
  } finally { f.close(); }
});
