import test from 'node:test';
import assert from 'node:assert/strict';
import { hasKnownSecretPrefix } from './public-audit-token-patterns.mjs';

const opaque = (prefix, count = 32) => prefix + 'A'.repeat(count);

test('all documented GitHub classic, OAuth, App and refresh token prefixes are detected', () => {
  for (const prefix of ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_']) {
    assert.equal(hasKnownSecretPrefix(opaque(prefix)), true, prefix);
  }
});

test('GitHub App installation JWT-style token containing periods is detected', () => {
  const token = 'ghs_123456_' + 'A'.repeat(26) + '.' + 'B'.repeat(28) + '.' + 'C'.repeat(28);
  assert.equal(hasKnownSecretPrefix('token: ' + token), true);
});

test('project, service-account, admin, and legacy OpenAI-shaped keys are detected', () => {
  for (const prefix of ['sk-proj-', 'sk-svcacct-', 'sk-admin-', 'sk-']) {
    assert.equal(hasKnownSecretPrefix(opaque(prefix)), true, prefix);
  }
});

test('existing provider patterns remain detected, including AWS temporary credentials', () => {
  for (const value of [
    opaque('npm_'), opaque('sk-ant-'), opaque('xoxb-'), opaque('xoxp-'),
    opaque('AKIA', 16), opaque('ASIA', 16),
    opaque('AIza'), opaque('sk_live_'), opaque('rk_test_'),
  ]) assert.equal(hasKnownSecretPrefix(value), true);
});

test('short prefixes, placeholders, and ordinary source references are not credentials', () => {
  for (const value of [
    '', null, undefined, 42, 'gho_', 'ghs_APPID_JWT', 'ghu_' + 'a'.repeat(19),
    'sk-proj-<YOUR-KEY>', 'sk-proj-', 'sk-', 'npm_123',
    'This document lists ghp_ and github_pat_ prefixes.',
  ]) assert.equal(hasKnownSecretPrefix(value), false, String(value));
});

test('credential detection is not defeated by a leading fixture marker', () => {
  for (const prefix of ['ghu_', 'ghs_', 'ghr_', 'sk-proj-']) {
    assert.equal(hasKnownSecretPrefix('fixture-' + opaque(prefix)), true);
  }
});

test('scanning is passive, without returning the sensitive matched value', () => {
  const candidate = opaque('gho_');
  assert.equal(hasKnownSecretPrefix(candidate), true);
  assert.equal(typeof hasKnownSecretPrefix(candidate), 'boolean');
});
