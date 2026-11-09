import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptsSandboxWebhookTransmissionTime, SANDBOX_WEBHOOK_MAX_FUTURE_MS,
  SANDBOX_WEBHOOK_MAX_PAST_MS,
} from './sandbox-webhook-transmission-window.mjs';

const NOW = Date.parse('2026-11-03T21:00:00Z');
const time = offset => new Date(NOW + offset).toISOString();

test('exact existing verified webhook transport bounds remain pinned', () => {
  assert.equal(SANDBOX_WEBHOOK_MAX_FUTURE_MS, 300_000);
  assert.equal(SANDBOX_WEBHOOK_MAX_PAST_MS, 259_500_000);
});
test('current and one-minute-old transmissions pass preliminary capture screening', () => {
  assert.equal(acceptsSandboxWebhookTransmissionTime(time(0), NOW), true);
  assert.equal(acceptsSandboxWebhookTransmissionTime(time(-60_000), NOW), true);
});
test('legitimate retry older than five minutes is not dropped before PayPal postback', () => {
  assert.equal(acceptsSandboxWebhookTransmissionTime(time(-301_000), NOW), true);
  assert.equal(acceptsSandboxWebhookTransmissionTime(time(-20 * 60_000), NOW), true);
  assert.equal(acceptsSandboxWebhookTransmissionTime(time(-24 * 60 * 60_000), NOW), true);
});
test('past acceptance ends at the exact independently verified handler boundary', () => {
  assert.equal(acceptsSandboxWebhookTransmissionTime(time(-SANDBOX_WEBHOOK_MAX_PAST_MS), NOW), true);
  assert.equal(acceptsSandboxWebhookTransmissionTime(time(-SANDBOX_WEBHOOK_MAX_PAST_MS - 1), NOW), false);
});
test('future clock skew remains restricted to five minutes', () => {
  assert.equal(acceptsSandboxWebhookTransmissionTime(time(SANDBOX_WEBHOOK_MAX_FUTURE_MS), NOW), true);
  assert.equal(acceptsSandboxWebhookTransmissionTime(time(SANDBOX_WEBHOOK_MAX_FUTURE_MS + 1), NOW), false);
});
test('reject malformed and noncanonical UTC dates rather than accepting JS normalization', () => {
  for (const input of [
    '', null, undefined, {}, 123, '2026-11-03T21:00:00+00:00',
    '2026-11-03T21:00:00', '2026-11-03 21:00:00Z',
    '2026-02-29T00:00:00Z', '2026-11-03T24:00:00Z',
    '2026-11-03T21:00:60Z', '2026-11-03T21:00:00.1234567890Z',
    '2026-11-03T21:00:00.Z', '2026-02-29T00:00:00.123456Z',
  ]) assert.equal(acceptsSandboxWebhookTransmissionTime(input, NOW), false, String(input));
});
test('supports the verifier fractional-millisecond UTC format', () => {
  assert.equal(acceptsSandboxWebhookTransmissionTime('2026-11-03T21:00:00.1Z', NOW), true);
  assert.equal(acceptsSandboxWebhookTransmissionTime('2026-11-03T21:00:00.123Z', NOW), true);
});
test('accepts canonical UTC microsecond and nanosecond precision without changing timestamp bounds', () => {
  for (const value of ['2026-11-03T21:00:00.123456Z', '2026-11-03T21:00:00.123456789Z']) {
    assert.equal(acceptsSandboxWebhookTransmissionTime(value, NOW), true, value);
  }
});
test('cannot accidentally grant acceptability from an invalid injected clock', () => {
  for (const now of [NaN, Infinity, '2026-11-03', 0.5, null, {}]) {
    assert.equal(acceptsSandboxWebhookTransmissionTime(time(0), now), false);
  }
});
