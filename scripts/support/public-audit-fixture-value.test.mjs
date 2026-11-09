import test from 'node:test';
import assert from 'node:assert/strict';
import { isFixtureValue } from './public-audit-fixture-value.mjs';

test('explicit placeholders and clearly prefixed synthetic configuration remain permitted', () => {
  for (const value of [
    '<sandbox app secret>', '${ENV_TOKEN}', '...', 'xxxxxxx', '*****', 'changeme',
    'fixture-secret', 'synthetic-acceptance', 'fake-value', 'mock_private',
    'acceptance-secret-049', 'sandbox-secret-fixture', 'test-token-0123',
    'your_client_secret', 'your-client-secret', 'not-a-real-key',
    'placeholder', 'replace_this',
  ]) assert.equal(isFixtureValue(value, 'docs/demo.md'), true, value);
});

test('marker words embedded in an opaque credential do not exempt it from scanning', () => {
  for (const value of [
    'v1qX9aB3fakeF8p2y7Lp6V0s4rT1',
    'AC7D21-example-opaque-credentials-9988',
    'prod-secret-not-a-safe-example-123456',
    'live-credential-mock-string-123456789',
    'Qw3rT7y8fixtureSdkValueNeverPublic',
    'private-opaque-placeholder-abcdefgh01234',
    'client-secret-sandbox-secret-actual-98765',
  ]) assert.equal(isFixtureValue(value, 'config.txt'), false, value);
});

test('test files still need explicit fixture prefixes, not embedded words', () => {
  assert.equal(isFixtureValue('fixture-buyer-012345', 'scripts/provider.test.mjs'), true);
  assert.equal(isFixtureValue('opaque-realvaluefake-012345', 'scripts/provider.test.mjs'), false);
  assert.equal(isFixtureValue('actual-example-credential-012345', 'scripts/provider.test.mjs'), false);
});

test('empty, malformed and arbitrary real-looking values are not classified as fixtures', () => {
  for (const value of ['', null, undefined, 4, 'BearerActualVendorCredential0987654321', 'UNLABELED_SUPER_SECRET']) {
    assert.equal(isFixtureValue(value, 'docs/evidence.txt'), false);
  }
});

test('test-only fixture semantics are not applied to production files', () => {
  assert.equal(isFixtureValue('sandbox_this_is_test_123', 'server.env'), false);
  assert.equal(isFixtureValue('sandbox_this_is_test_123', 'scripts/provider.test.mjs'), true);
  assert.equal(isFixtureValue('actual-secret-value1234', 'server.env'), false);
});
