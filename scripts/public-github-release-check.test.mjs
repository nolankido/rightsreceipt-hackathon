import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkPublicGithubDestination, checkPublishedGithubRelease,
  parsePublicRepositoryUrl } from './public-github-release-check.mjs';

const SOURCE = '1'.repeat(40), TREE = '2'.repeat(40), PUBLIC = '3'.repeat(40);
const EMAIL = '212063387+nolankido@users.noreply.github.com';
const REPO_URL = 'https://github.com/nolankido/rightsreceipt-public-demo';
const API = 'https://api.github.com/repos/nolankido/rightsreceipt-public-demo';
const REFS = API + '/git/matching-refs/';
const script = fileURLToPath(new URL('./public-github-release-check.mjs', import.meta.url));

const manifest = () => ({
  schemaVersion: 'rightsreceipt-public-export-v1', status: 'passed',
  sourceCommit: SOURCE, sourceTree: TREE, publicCommit: PUBLIC, publicTree: TREE,
  exactTreeMatch: true, repositoryDirectory: 'repo',
  publicAuthorName: 'nolankido', publicAuthorEmail: EMAIL,
});

function fixtureFetch(changes = {}) {
  const calls = [];
  const replies = {
    [API]: { private: false, visibility: 'public', full_name: 'nolankido/rightsreceipt-public-demo',
      default_branch: 'main', fork: false, disabled: false,
      license: { key: 'mit', spdx_id: 'MIT' } },
    [API + '/branches/main']: { commit: { sha: PUBLIC } },
    [API + '/git/commits/' + PUBLIC]: { sha: PUBLIC, tree: { sha: TREE }, parents: [],
      author: { name: 'nolankido', email: EMAIL }, committer: { name: 'nolankido', email: EMAIL } },
    [REFS]: [{ ref: 'refs/heads/main', object: { type: 'commit', sha: PUBLIC } }],
  };
  for (const [url, patch] of Object.entries(changes)) {
    if (patch?.override) replies[url] = patch.override;
    else if (patch?.data) replies[url] = { ...replies[url], ...patch.data };
  }
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const response = changes[url]?.response ?? {};
      return { status: response.status ?? 200, url: response.url ?? url,
        redirected: response.redirected ?? false, type: response.type ?? 'basic',
        headers: { get: name => name.toLowerCase() === 'link' ? response.link ?? null : null },
        text: async () => response.raw ?? JSON.stringify(replies[url]) };
    },
  };
}

async function assertBlocked(fetchSetup, expected) {
  await assert.rejects(checkPublishedGithubRelease({ repositoryUrl: REPO_URL, manifest: manifest(),
    fetchImpl: fetchSetup.fetchImpl }), error => error.code === expected);
}

test('public-source check verifies anonymous metadata, exact branch head, tree, root commit and noreply identity', async () => {
  const mock = fixtureFetch();
  const result = await checkPublishedGithubRelease({ repositoryUrl: REPO_URL, manifest: manifest(), fetchImpl: mock.fetchImpl });
  assert.equal(result.status, 'passed');
  assert.equal(Object.values(result.checks).every(Boolean), true);
  assert.equal(result.externalChecksRemaining.length, 3);
  assert.deepEqual(mock.calls.map(call => call.url),
    [API, API + '/branches/main', API + '/git/commits/' + PUBLIC, REFS]);
  assert.equal(result.checks.onlyAuditedMainReference, true);
  for (const call of mock.calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'manual');
    assert.equal(Object.hasOwn(call.options.headers, 'Authorization'), false);
  }
});

test('anonymous release check rejects unexpected branches, tags, notes and custom refs', async () => {
  const main = { ref: 'refs/heads/main', object: { type: 'commit', sha: PUBLIC } };
  for (const extra of [
    { ref: 'refs/heads/backup', object: { type: 'commit', sha: PUBLIC } },
    { ref: 'refs/tags/v1', object: { type: 'commit', sha: PUBLIC } },
    { ref: 'refs/notes/release', object: { type: 'commit', sha: SOURCE } },
    { ref: 'refs/custom/secret', object: { type: 'commit', sha: SOURCE } },
  ]) {
    const mock = fixtureFetch({ [REFS]: { override: [main, extra] } });
    await assertBlocked(mock, 'public_repository_refs_unverified');
    assert.equal(mock.calls.length, 4);
  }
});

test('anonymous release check refuses missing, duplicate or mismatched main refs', async () => {
  const main = { ref: 'refs/heads/main', object: { type: 'commit', sha: PUBLIC } };
  for (const refs of [[], [main, main],
    [{ ref: 'refs/heads/main', object: { type: 'commit', sha: SOURCE } }],
    [{ ref: 'refs/heads/main', object: { type: 'tag', sha: PUBLIC } }]]) {
    await assertBlocked(fixtureFetch({ [REFS]: { override: refs } }), 'public_repository_refs_unverified');
  }
});

test('anonymous release check fails closed on partial ref listings and malformed ref responses', async () => {
  await assertBlocked(fixtureFetch({ [REFS]: { response: {
    link: '<https://api.github.com/repos/nolankido/rightsreceipt-public-demo/git/matching-refs/?page=2>; rel="next"',
  } } }), 'public_repository_refs_unverified');
  await assertBlocked(fixtureFetch({ [REFS]: { override: { ref: 'refs/heads/main' } } }),
    'public_github_response_invalid');
  await assertBlocked(fixtureFetch({ [REFS]: { response: { raw: 'broken json' } } }),
    'public_github_response_invalid');
});

test('URL boundary rejects the private history, deceptive origins, extra paths and query values', () => {
  for (const value of [
    'https://github.com/nolankido/rightsReceipt',
    'https://github.com.evil.test/nolankido/rightsreceipt-public-demo',
    'http://github.com/nolankido/rightsreceipt-public-demo',
    'https://github.com/nolankido/rightsreceipt-public-demo/tree/main',
    'https://github.com/nolankido/rightsreceipt-public-demo?token=x',
    'https://github.com/owner/repo',
    'https://github.com/nolankido/%2E%2E',
  ]) assert.throws(() => parsePublicRepositoryUrl(value), error => error.code === 'public_repo_url_invalid', value);
  assert.equal(parsePublicRepositoryUrl(REPO_URL).fullName, 'nolankido/rightsreceipt-public-demo');
});

test('invalid or misleading export evidence blocks before any network request', async () => {
  for (const mutate of [
    m => { m.status = 'failed'; }, m => { m.sourceTree = '4'.repeat(40); },
    m => { m.publicCommit = m.sourceCommit; }, m => { m.publicAuthorEmail = 'private@example.test'; },
  ]) {
    const mock = fixtureFetch();
    const m = manifest(); mutate(m);
    await assert.rejects(checkPublishedGithubRelease({ repositoryUrl: REPO_URL, manifest: m,
      fetchImpl: mock.fetchImpl }), error => error.code === 'public_export_manifest_invalid');
    assert.equal(mock.calls.length, 0);
  }
});

test('private repository and wrong default branch fail anonymous-public metadata check', async () => {
  for (const data of [{ private: true }, { visibility: 'private' },
    { default_branch: 'develop' }, { fork: true }, { full_name: 'other/repo' }]) {
    await assertBlocked(fixtureFetch({ [API]: { data } }), 'public_repository_metadata_mismatch');
  }
});

test('published release requires GitHub About metadata to detect the MIT license', async () => {
  for (const license of [null, undefined, {}, { spdx_id: 'NOASSERTION' },
    { spdx_id: 'Apache-2.0' }, { key: 'mit' }]) {
    const mock = fixtureFetch({ [API]: { data: { license } } });
    await assertBlocked(mock, 'public_repository_license_not_detected');
    assert.equal(mock.calls.length, 3);
  }
  const mock = fixtureFetch();
  const passed = await checkPublishedGithubRelease({ repositoryUrl: REPO_URL,
    manifest: manifest(), fetchImpl: mock.fetchImpl });
  assert.equal(passed.checks.detectedMitLicense, true);
});

test('unpopulated public destination can pass pre-push checks without a detected license', async () => {
  const mock = fixtureFetch({ [API]: { data: { default_branch: null, license: null } } });
  const result = await checkPublicGithubDestination({ repositoryUrl: REPO_URL,
    fetchImpl: mock.fetchImpl });
  assert.equal(result.defaultBranch, null);
  assert.equal(result.licenseSpdxId, null);
  assert.equal(mock.calls.length, 1);
});

test('a different public branch head is rejected before trusting the exported commit', async () => {
  const mock = fixtureFetch({ [API + '/branches/main']: { data: { commit: { sha: SOURCE } } } });
  await assertBlocked(mock, 'public_repository_head_mismatch');
  assert.equal(mock.calls.length, 2);
});

test('nonmatching source tree, nonroot history or personal author metadata blocks publication', async () => {
  const url = API + '/git/commits/' + PUBLIC;
  for (const data of [
    { tree: { sha: SOURCE } }, { parents: [{ sha: SOURCE }] },
    { author: { name: 'Private Person', email: 'private@example.test' } },
    { committer: { name: 'Private Person', email: 'private@example.test' } },
  ]) await assertBlocked(fixtureFetch({ [url]: { data } }), 'public_repository_commit_mismatch');
});

test('unavailable, redirected, oversized and malformed API responses fail closed', async () => {
  for (const response of [
    { status: 404 }, { status: 403 }, { redirected: true },
    { status: 302 }, { url: 'https://example.test/redirected' },
  ]) await assertBlocked(fixtureFetch({ [API]: { response } }), 'public_github_unavailable');
  for (const response of [{ raw: '{invalid' }, { raw: 'A'.repeat(128 * 1024 + 1) }]) {
    await assertBlocked(fixtureFetch({ [API]: { response } }), 'public_github_response_invalid');
  }
});

test('CLI help and invalid options do not make external calls', () => {
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /anonymous public source identity only/iu);
  const invalid = spawnSync(process.execPath, [script, '--unknown'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).code, 'invalid_arguments');
});

