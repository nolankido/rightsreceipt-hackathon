import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceLinkageErrors } from './sandbox-acceptance-linkage.mjs';

const A = 'a'.repeat(64), B = 'b'.repeat(64);
const fixture = () => ({
  create: {
    stateSha256: A,
    webhookRegistration: { status: 'passed', subscribedEvent: 'INVOICING.INVOICE.PAID', webhookIdSha256: B, exactCallbackChecked: true },
  },
  paid: { stateSha256: A },
  webhook: { webhook: { webhookIdSha256: B } },
});

test('the same saved invoice and same registered webhook pass cross-stage linkage', () => {
  assert.deepEqual(acceptanceLinkageErrors(fixture()), []);
});
test('the callback attestation is mandatory for linked local acceptance records', () => {
  const records = fixture();
  delete records.create.webhookRegistration.exactCallbackChecked;
  assert.ok(acceptanceLinkageErrors(records).includes('webhook_registration_not_proven'));
  records.create.webhookRegistration.exactCallbackChecked = false;
  assert.ok(acceptanceLinkageErrors(records).includes('webhook_registration_not_proven'));
});

test('legacy create evidence without webhook registration does not pass silently', () => {
  const records = fixture(); delete records.create.webhookRegistration;
  assert.ok(acceptanceLinkageErrors(records).includes('webhook_registration_not_proven'));
});
test('registration requires an explicit paid invoice event subscription', () => {
  const records = fixture(); records.create.webhookRegistration.subscribedEvent = 'INVOICING.INVOICE.CREATED';
  assert.ok(acceptanceLinkageErrors(records).includes('webhook_registration_not_proven'));
});
test('a locally fabricated or malformed registered webhook ID hash fails', () => {
  const records = fixture(); records.create.webhookRegistration.webhookIdSha256 = 'NOT_A_HASH';
  const errors = acceptanceLinkageErrors(records);
  assert.ok(errors.includes('webhook_registration_not_proven'));
  assert.ok(errors.includes('webhook_registration_identity_mismatch'));
});
test('paid read of a different saved state is rejected even with the same invoice ID', () => {
  const records = fixture(); records.paid.stateSha256 = B;
  assert.ok(acceptanceLinkageErrors(records).includes('invoice_state_identity_mismatch'));
});
test('both creation and paid status require a hash of the saved state file', () => {
  for (const stage of ['create', 'paid']) {
    const records = fixture(); delete records[stage].stateSha256;
    assert.ok(acceptanceLinkageErrors(records).includes('invoice_state_identity_mismatch'));
  }
});
test('webhook verified against a different registration cannot pass release evidence', () => {
  const records = fixture(); records.webhook.webhook.webhookIdSha256 = A;
  assert.ok(acceptanceLinkageErrors(records).includes('webhook_registration_identity_mismatch'));
});
test('a missing or malformed webhook record fails closed', () => {
  for (const missing of [undefined, null, {}, { webhook: { webhookIdSha256: 'a' } }]) {
    const records = fixture(); records.webhook = missing;
    assert.ok(acceptanceLinkageErrors(records).includes('webhook_registration_identity_mismatch'));
  }
});
test('failure messages cannot contain source identifiers, invoice IDs, or private values', () => {
  const records = fixture(); records.webhook.webhook.webhookIdSha256 = 'secret-registration-123';
  records.paid.stateSha256 = 'secret-state-456';
  const encoded = JSON.stringify(acceptanceLinkageErrors(records));
  assert.ok(!encoded.includes('secret-registration-123'));
  assert.ok(!encoded.includes('secret-state-456'));
  assert.ok(!encoded.includes('INV2-'));
});
