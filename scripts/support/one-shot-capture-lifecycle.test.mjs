import test from 'node:test';
import assert from 'node:assert/strict';
import { createOneShotCaptureLifecycle } from './one-shot-capture-lifecycle.mjs';

test('fresh lifecycle accepts exactly one capture claim', () => {
  const state = createOneShotCaptureLifecycle();
  assert.equal(state.phase, 'open');
  assert.equal(state.unavailable, false);
  assert.equal(state.claim(), true);
  assert.equal(state.phase, 'claimed');
  assert.equal(state.unavailable, true);
  assert.equal(state.claim(), false);
});
test('expiration makes the receiver permanently unavailable', () => {
  const state = createOneShotCaptureLifecycle();
  assert.equal(state.finish(), true);
  assert.equal(state.phase, 'finished');
  assert.equal(state.claim(), false);
  assert.equal(state.finish(), false);
  assert.equal(state.unavailable, true);
});
test('a claimed capture can finish exactly once', () => {
  const state = createOneShotCaptureLifecycle();
  assert.equal(state.claim(), true);
  assert.equal(state.finish(), true);
  assert.equal(state.finish(), false);
  assert.equal(state.claim(), false);
});
test('independent capture runs never share authority', () => {
  const previous = createOneShotCaptureLifecycle();
  const next = createOneShotCaptureLifecycle();
  previous.finish();
  assert.equal(previous.claim(), false);
  assert.equal(next.claim(), true);
});
test('late asynchronous handlers cannot claim after timeout', async () => {
  const state = createOneShotCaptureLifecycle();
  let continueRequest;
  const bodyReceived = new Promise(resolve => { continueRequest = resolve; });
  const handler = (async () => { await bodyReceived; return state.claim(); })();
  state.finish();
  continueRequest();
  assert.equal(await handler, false);
});
test('simultaneous pending callbacks cannot both claim a one-shot slot', async () => {
  const state = createOneShotCaptureLifecycle();
  const attempts = await Promise.all(Array.from({ length: 12 }, async () => {
    await Promise.resolve();
    return state.claim();
  }));
  assert.equal(attempts.filter(Boolean).length, 1);
});
