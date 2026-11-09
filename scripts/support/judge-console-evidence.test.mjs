import assert from 'node:assert/strict';
import test from 'node:test';
import { judgeConsoleEvidenceValid as valid } from './judge-console-evidence.mjs';

import { judgeConsoleEvidenceFixture as normal } from './judge-console-evidence-fixture.mjs';

test('canonical offline proof can be presented as locally passed', () => assert.equal(valid(normal()), true));
test('empty and status-only records are insufficient', () => {
  for (const value of [null, undefined, {}, { status: 'passed', scenarios: [1, 2, 3], resets: [1, 2, 3] }])
    assert.equal(valid(value), false);
});
test('a failed journey cannot be presented as passed', () => {
  const x = normal(); x.scenarios[1].status = 'failed'; assert.equal(valid(x), false);
});
test('scenario order and reset ownership cannot be swapped', () => {
  for (const mutate of [x => x.scenarios[0].id = 'repeat', x => x.resets[1].afterScenario = 'ordinary']) {
    const x = normal(); mutate(x); assert.equal(valid(x), false);
  }
});
test('every old permission, receipt and case must be denied', () => {
  for (const key of ['oldCapabilityDenied', 'oldReceiptDenied', 'oldCreatorCaseDenied']) {
    const x = normal(); x.resets[0][key] = false; assert.equal(valid(x), false, key);
  }
});
test('reset must actually restore the original seed row counts', () => {
  const x = normal(); x.resets[0].rowsAfter.permissions = 1; assert.equal(valid(x), false);
});
test('network or credential use makes evidence unsuitable for local judge claim', () => {
  for (const key of ['externalRequests', 'credentialsUsed']) {
    const x = normal(); x.isolation[key] = key === 'externalRequests' ? 1 : true;
    assert.equal(valid(x), false, key);
  }
});
test('price and license receipt invariants are required', () => {
  for (const [key, bad] of [['quoteCents', 42499], ['currency', 'EUR'],
    ['receiptIntegrity', 'invalid'], ['permissionState', 'active'],
    ['receiptRevision', 0], ['foreignKeys', 'bad'], ['integrity', 'bad']]) {
    const x = normal(); x.scenarios[2].summary[key] = bad;
    assert.equal(valid(x), false, key);
  }
});
test('provider create and send are each exactly once', () => {
  for (const key of ['create', 'send', 'get']) {
    const x = normal(); x.scenarios[1].summary.providerCalls[key] = 0;
    assert.equal(valid(x), false, key);
  }
});
test('repeatability, source fingerprint, migrations and complete resets are required', () => {
  for (const mutate of [
    x => x.repeatability.ordinaryMatchesRepeat = false,
    x => x.repeatability.normalizedOutcomeSha256 = 'wrong',
    x => x.sourceFingerprint = null,
    x => x.baseline.migrationCount = 8,
    x => x.baseline.domainTableCount = 32,
    x => x.resets[1].transactionsCleared = false,
    x => x.scenarios[0].steps = [],
  ]) { const x = normal(); mutate(x); assert.equal(valid(x), false); }
});
