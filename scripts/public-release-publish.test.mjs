import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePublicRelease, pushNewPublicMain, runPublicReleaseHandoff } from './public-release-publish.mjs';

const email = '212063387+nolankido@users.noreply.github.com';
const repositoryUrl = 'https://github.com/nolankido/rightsreceipt-public-final';
const H = 'a'.repeat(64);
const sha = value => createHash('sha256').update(value).digest('hex');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 15000 }).trim();
}

function initRepo(path, name, authorEmail) {
  mkdirSync(path, { recursive: true });
  git(path, 'init', '-q', '-b', 'main');
  git(path, 'config', 'user.name', name);
  git(path, 'config', 'user.email', authorEmail);
  git(path, 'config', 'commit.gpgsign', 'false');
  git(path, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(path, '.gitignore'), '.data/\n');
  writeFileSync(join(path, 'README.md'), 'Sanitized source fixture\n');
  git(path, 'add', '--all');
  git(path, 'commit', '-qm', 'Initial fixture');
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rr-publish-'));
  initRepo(root, 'private-owner', 'private@example.test');
  const exportRun = join(root, '.data', 'exports', 'run-a');
  const repo = join(exportRun, 'repo');
  initRepo(repo, 'nolankido', email);
  const releaseDir = join(root, '.data', 'release');
  mkdirSync(releaseDir, { recursive: true });
  const releaseEvidencePath = join(releaseDir, 'verification.json');
  const releaseRaw = '{"fixture":"release"}\n';
  writeFileSync(releaseEvidencePath, releaseRaw);
  const sourceCommit = git(root, 'rev-parse', 'HEAD');
  const sourceTree = git(root, 'rev-parse', 'HEAD^{tree}');
  const publicCommit = git(repo, 'rev-parse', 'HEAD');
  const manifest = {
    schemaVersion: 'rightsreceipt-public-export-v1', status: 'passed',
    sourceCommit, sourceTree, publicCommit,
    publicTree: git(repo, 'rev-parse', 'HEAD^{tree}'),
    repositoryDirectory: 'repo', exactTreeMatch: true,
    releaseVerificationSha256: sha(releaseRaw),
    publicAuthorName: 'nolankido', publicAuthorEmail: email,
    sourceSnapshotAuditSha256: H, publicHistoryAuditSha256: H,
    trackedFileCount: 2, trackedByteCount: 100,
  };
  const manifestPath = join(exportRun, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
  const verify = () => ({ sha256: sha(releaseRaw) });
  return { root, repo, manifestPath, releaseEvidencePath, repositoryUrl,
    manifest, sourceCommit, sourceTree, publicCommit, verify };
}

function prepare(f, replacements = {}) {
  return preparePublicRelease({ root: f.root, manifestPath: f.manifestPath,
    releaseEvidencePath: f.releaseEvidencePath, repositoryUrl: f.repositoryUrl,
    releaseVerifier: f.verify, ...replacements });
}

function withFixture(fn) {
  const f = fixture();
  try { return fn(f); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
}
async function withFixtureAsync(fn) {
  const f = fixture();
  try { return await fn(f); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
}

function mockedGithub(manifest, { metadata, branch, commit, status, refs } = {}) {
  const repo = { private: false, visibility: 'public', full_name: 'nolankido/rightsreceipt-public-final',
    fork: false, disabled: false, default_branch: 'main',
    license: { key: 'mit', spdx_id: 'MIT' }, ...metadata };
  const head = { commit: { sha: manifest.publicCommit }, ...branch };
  const gitCommit = { sha: manifest.publicCommit, tree: { sha: manifest.publicTree },
    parents: [], author: { name: 'nolankido', email },
    committer: { name: 'nolankido', email }, ...commit };
  const urls = [repositoryUrl.replace('https://github.com/', 'https://api.github.com/repos/'),
    'https://api.github.com/repos/nolankido/rightsreceipt-public-final/branches/main',
    'https://api.github.com/repos/nolankido/rightsreceipt-public-final/git/commits/' + manifest.publicCommit,
    'https://api.github.com/repos/nolankido/rightsreceipt-public-final/git/matching-refs/'];
  const bodies = [repo, head, gitCommit,
    refs ?? [{ ref: 'refs/heads/main', object: { type: 'commit', sha: manifest.publicCommit } }]];
  return async url => {
    const index = urls.indexOf(url);
    assert.notEqual(index, -1);
    return { status: status ?? 200, url, redirected: false,
      headers: { get: () => null },
      text: async () => JSON.stringify(bodies[index] ?? bodies[0]) };
  };
}

test('preflight binds exact private HEAD, export tree, root commit, audit and release bytes', () => {
  withFixture(f => {
    const result = prepare(f);
    assert.equal(result.publicCommit, f.publicCommit);
    assert.equal(result.publicTree, f.sourceTree);
    assert.equal(result.repositoryPath, f.repo);
    assert.equal(result.remoteGitUrl, repositoryUrl + '.git');
  });
});

test('malformed URLs and original private repository are refused before any network access', () => {
  withFixture(f => {
    for (const url of ['https://github.com/nolankido/rightsReceipt',
      'https://github.com.evil.test/owner/other', 'https://github.com/o/r?token=x']) {
      assert.throws(() => prepare(f, { repositoryUrl: url }), { code: 'public_repository_url_invalid' });
    }
  });
});

test('preflight refuses missing and outside-.data artifacts', () => {
  withFixture(f => {
    assert.throws(() => prepare(f, { manifestPath: join(f.root, 'README.md') }),
      { code: 'private_release_artifact_invalid' });
    assert.throws(() => prepare(f, { releaseEvidencePath: join(f.root, 'missing.json') }),
      { code: 'private_release_artifact_invalid' });
  });
});

test('manifest tampering fails closed even when exported Git objects remain intact', () => {
  for (const change of [m => { m.publicCommit = '3'.repeat(40); },
    m => { m.sourceTree = '4'.repeat(40); },
    m => { m.publicAuthorEmail = 'private@example.test'; },
    m => { m.releaseVerificationSha256 = H; },
    m => { m.sourceSnapshotAuditSha256 = 'invalid'; }]) {
    withFixture(f => {
      change(f.manifest);
      writeFileSync(f.manifestPath, JSON.stringify(f.manifest));
      assert.throws(() => prepare(f), { code: 'sanitized_export_identity_invalid' });
    });
  }
});

test('mismatched or unavailable release evidence blocks the handoff', () => {
  withFixture(f => {
    assert.throws(() => prepare(f, { releaseVerifier: () => ({ sha256: H }) }),
      { code: 'full_release_evidence_invalid' });
    assert.throws(() => prepare(f, { releaseVerifier: () => { throw new Error('private'); } }),
      { code: 'full_release_evidence_invalid' });
  });
});

test('public branch, private dirty checkout, remotes and extra history are refused', () => {
  withFixture(f => {
    writeFileSync(join(f.root, 'uncommitted.txt'), 'private');
    assert.throws(() => prepare(f), { code: 'release_git_state_invalid' });
  });
  withFixture(f => {
    git(f.repo, 'remote', 'add', 'origin', 'https://example.test/other.git');
    assert.throws(() => prepare(f), { code: 'sanitized_export_identity_invalid' });
  });
  withFixture(f => {
    git(f.repo, 'tag', 'secret-history');
    assert.throws(() => prepare(f), { code: 'sanitized_export_identity_invalid' });
  });
  withFixture(f => {
    git(f.repo, 'branch', '-m', 'not-main');
    assert.throws(() => prepare(f), { code: 'sanitized_export_identity_invalid' });
  });
  withFixture(f => {
    writeFileSync(join(f.repo, 'extra.txt'), 'unexpected source');
    git(f.repo, 'add', '.'); git(f.repo, 'commit', '-qm', 'unexpected second commit');
    assert.throws(() => prepare(f), { code: 'sanitized_export_identity_invalid' });
  });
});

test('default handoff is local only with no fetch or push', async () => {
  await withFixtureAsync(async f => {
    const prepared = prepare(f);
    const result = await runPublicReleaseHandoff({ prepared, publish: false,
      fetchImpl: () => { throw new Error('network must remain off'); },
      push: () => { throw new Error('write must remain off'); } });
    assert.equal(result.status, 'prepared_not_published');
    assert.equal(result.requiresExplicitPublish, true);
  });
});

test('explicit publish refuses private/nonexistent destinations before Git push', async () => {
  await withFixtureAsync(async f => {
    const prepared = prepare(f);
    let pushed = 0;
    await assert.rejects(() => runPublicReleaseHandoff({ prepared, publish: true,
      fetchImpl: mockedGithub(prepared.manifest, { metadata: { private: true } }),
      push: () => { pushed++; } }), { code: 'public_destination_not_anon_visible' });
    assert.equal(pushed, 0);
    await assert.rejects(() => runPublicReleaseHandoff({ prepared, publish: true,
      fetchImpl: mockedGithub(prepared.manifest, { status: 404 }),
      push: () => { pushed++; } }), { code: 'public_destination_not_anon_visible' });
    assert.equal(pushed, 0);
  });
});

test('explicit publish only pushes prepared one-commit identity and verifies anonymously', async () => {
  await withFixtureAsync(async f => {
    const prepared = prepare(f);
    let pushArguments;
    const outcome = await runPublicReleaseHandoff({ prepared, publish: true,
      fetchImpl: mockedGithub(prepared.manifest),
      push: args => { pushArguments = args; return { postPushRefsVerified: true }; } });
    assert.equal(outcome.status, 'published_and_verified');
    assert.deepEqual(pushArguments, { repositoryPath: f.repo,
      remoteGitUrl: repositoryUrl + '.git', publicCommit: f.publicCommit });
  });
});

test('verification failure after push is reported as pending, not a completed publication gate', async () => {
  await withFixtureAsync(async f => {
    const prepared = prepare(f);
    let pushCount = 0;
    const result = await runPublicReleaseHandoff({ prepared, publish: true,
      fetchImpl: mockedGithub(prepared.manifest, { branch: { commit: { sha: '7'.repeat(40) } } }),
      push: () => { pushCount++; return { postPushRefsVerified: true }; } });
    assert.equal(pushCount, 1);
    assert.equal(result.status, 'pushed_verification_pending');
    assert.equal(result.code, 'anonymous_public_source_check_failed');
  });
});

test('new unrelated GitHub refs after the push check keep the publication pending', async () => {
  await withFixtureAsync(async f => {
    const prepared = prepare(f);
    const result = await runPublicReleaseHandoff({ prepared, publish: true,
      fetchImpl: mockedGithub(prepared.manifest, { refs: [
        { ref: 'refs/heads/main', object: { type: 'commit', sha: f.publicCommit } },
        { ref: 'refs/notes/late', object: { type: 'commit', sha: f.sourceCommit } },
      ] }), push: () => ({ postPushRefsVerified: true }) });
    assert.equal(result.status, 'pushed_verification_pending');
    assert.equal(result.code, 'anonymous_public_source_check_failed');
  });
});

test('unverified remote refs after push cannot claim publication is verified', async () => {
  await withFixtureAsync(async f => {
    const prepared = prepare(f);
    let pushCount = 0;
    const result = await runPublicReleaseHandoff({ prepared, publish: true,
      fetchImpl: mockedGithub(prepared.manifest),
      push: () => { pushCount++; return { postPushRefsVerified: false }; } });
    assert.equal(pushCount, 1);
    assert.equal(result.status, 'pushed_verification_pending');
    assert.equal(result.code, 'public_post_push_refs_unverified');
  });
});

test('a push implementation with no affirmative post-push result cannot claim verification', async () => {
  await withFixtureAsync(async f => {
    const prepared = prepare(f);
    const result = await runPublicReleaseHandoff({ prepared, publish: true,
      fetchImpl: mockedGithub(prepared.manifest), push: () => undefined });
    assert.equal(result.status, 'pushed_verification_pending');
    assert.equal(result.code, 'public_post_push_refs_unverified');
  });
});

test('publish preflight permits an unlicensed empty destination but post-push MIT detection remains mandatory', async () => {
  await withFixtureAsync(async f => {
    const prepared = prepare(f);
    let pushCount = 0;
    const result = await runPublicReleaseHandoff({ prepared, publish: true,
      fetchImpl: mockedGithub(prepared.manifest, { metadata: { license: null } }),
      push: () => { pushCount++; return { postPushRefsVerified: true }; } });
    assert.equal(pushCount, 1);
    assert.equal(result.status, 'pushed_verification_pending');
    assert.equal(result.code, 'anonymous_public_source_check_failed');
  });
});

test('actual local Git push creates main once and rejects a second push or existing branch', () => {
  withFixture(f => {
    const bare = join(f.root, '.data', 'remote-bare.git');
    git(f.root, 'init', '-q', '--bare', bare);
    const outcome = pushNewPublicMain({ repositoryPath: f.repo, remoteGitUrl: bare,
      publicCommit: f.publicCommit });
    assert.deepEqual(outcome, { postPushRefsVerified: true });
    assert.equal(git(f.root, '--git-dir', bare, 'rev-parse', 'refs/heads/main'), f.publicCommit);
    assert.throws(() => pushNewPublicMain({ repositoryPath: f.repo, remoteGitUrl: bare,
      publicCommit: f.publicCommit }), { code: 'public_destination_not_empty' });
    assert.equal(git(f.root, '--git-dir', bare, 'rev-list', '--count', 'main'), '1');
  });
});

test('post-push remote ref race leaves publication verification pending', () => {
  withFixture(f => {
    const bare = join(f.root, '.data', 'remote-bare.git');
    git(f.root, 'init', '-q', '--bare', bare);
    let callCount = 0;
    const racedSpawn = (command, args, options) => {
      const result = spawnSync(command, args, options);
      if (++callCount === 2 && result.status === 0) {
        git(f.root, 'push', bare, `${f.sourceCommit}:refs/notes/late`);
      }
      return result;
    };
    const outcome = pushNewPublicMain({ repositoryPath: f.repo, remoteGitUrl: bare,
      publicCommit: f.publicCommit, spawn: racedSpawn });
    assert.deepEqual(outcome, { postPushRefsVerified: false });
    assert.equal(git(f.root, '--git-dir', bare, 'rev-parse', 'refs/heads/main'), f.publicCommit);
    assert.equal(git(f.root, '--git-dir', bare, 'rev-parse', 'refs/notes/late'), f.sourceCommit);
    assert.equal(callCount, 3);
  });
});

test('post-push remote ref read failure leaves verification pending after a successful push', () => {
  withFixture(f => {
    const bare = join(f.root, '.data', 'remote-bare.git');
    git(f.root, 'init', '-q', '--bare', bare);
    let callCount = 0;
    const failingSpawn = (command, args, options) => {
      if (++callCount === 3) return { error: new Error('remote-unavailable'), status: null };
      return spawnSync(command, args, options);
    };
    const outcome = pushNewPublicMain({ repositoryPath: f.repo, remoteGitUrl: bare,
      publicCommit: f.publicCommit, spawn: failingSpawn });
    assert.deepEqual(outcome, { postPushRefsVerified: false });
    assert.equal(git(f.root, '--git-dir', bare, 'rev-parse', 'refs/heads/main'), f.publicCommit);
    assert.equal(callCount, 3);
  });
});

test('post-push check rejects a missing main, a different commit or a conflicting HEAD', () => {
  for (const observedRefs of [
    f => `${f.publicCommit}\tHEAD\n`,
    () => `${'d'.repeat(40)}\trefs/heads/main\n`,
    f => `${'e'.repeat(40)}\tHEAD\n${f.publicCommit}\trefs/heads/main\n`,
    f => `${f.publicCommit}\trefs/heads/main\n${f.publicCommit}\trefs/heads/main\n`,
  ]) {
    withFixture(f => {
      const bare = join(f.root, '.data', 'remote-bare.git');
      git(f.root, 'init', '-q', '--bare', bare);
      let calls = 0;
      const substitutedSpawn = (command, args, options) => {
        const actual = spawnSync(command, args, options);
        if (++calls === 3) return { ...actual, stdout: observedRefs(f) };
        return actual;
      };
      assert.deepEqual(pushNewPublicMain({ repositoryPath: f.repo, remoteGitUrl: bare,
        publicCommit: f.publicCommit, spawn: substitutedSpawn }),
      { postPushRefsVerified: false });
      assert.equal(git(f.root, '--git-dir', bare, 'rev-parse', 'refs/heads/main'), f.publicCommit);
    });
  }
});

test('actual local Git push refuses preexisting remote main even if it is unrelated', () => {
  withFixture(f => {
    const bare = join(f.root, '.data', 'remote-bare.git');
    git(f.root, 'init', '-q', '--bare', bare);
    git(f.root, 'push', bare, `${f.sourceCommit}:refs/heads/main`);
    assert.throws(() => pushNewPublicMain({ repositoryPath: f.repo, remoteGitUrl: bare,
      publicCommit: f.publicCommit }), { code: 'public_destination_not_empty' });
    assert.equal(git(f.root, '--git-dir', bare, 'rev-parse', 'refs/heads/main'), f.sourceCommit);
  });
});

test('tag-only destinations are not mistaken for a fresh empty public repository', () => {
  withFixture(f => {
    const bare = join(f.root, '.data', 'remote-bare.git');
    git(f.root, 'init', '-q', '--bare', bare);
    git(f.root, 'tag', 'v0-local');
    git(f.root, 'push', bare, 'refs/tags/v0-local');
    assert.throws(() => pushNewPublicMain({ repositoryPath: f.repo, remoteGitUrl: bare,
      publicCommit: f.publicCommit }), { code: 'public_destination_not_empty' });
    assert.equal(git(f.root, '--git-dir', bare, 'rev-parse', 'refs/tags/v0-local'), f.sourceCommit);
  });
});

test('custom-ref-only destinations are not mistaken for a fresh empty public repository', () => {
  withFixture(f => {
    const bare = join(f.root, '.data', 'remote-bare.git');
    git(f.root, 'init', '-q', '--bare', bare);
    // A remote containing only a notes/replace/custom ref has no heads or tags.
    // Its preexisting objects must not be silently accepted as an empty target.
    git(f.root, 'push', bare, `${f.sourceCommit}:refs/notes/preexisting`);
    assert.equal(git(f.root, 'ls-remote', '--heads', '--tags', bare), '');
    assert.throws(() => pushNewPublicMain({ repositoryPath: f.repo, remoteGitUrl: bare,
      publicCommit: f.publicCommit }), { code: 'public_destination_not_empty' });
    assert.equal(git(f.root, '--git-dir', bare, 'rev-parse', 'refs/notes/preexisting'), f.sourceCommit);
    assert.equal(git(f.root, 'ls-remote', '--heads', bare), '');
  });
});

test('creation-only lease protects against a remote main created between read and push', () => {
  withFixture(f => {
    const bare = join(f.root, '.data', 'remote-bare.git');
    git(f.root, 'init', '-q', '--bare', bare);
    let callCount = 0;
    const racedSpawn = (command, args, options) => {
      const result = spawnSync(command, args, options);
      if (++callCount === 1) git(f.root, 'push', bare, `${f.sourceCommit}:refs/heads/main`);
      return result;
    };
    assert.throws(() => pushNewPublicMain({ repositoryPath: f.repo, remoteGitUrl: bare,
      publicCommit: f.publicCommit, spawn: racedSpawn }), { code: 'public_push_failed' });
    assert.equal(git(f.root, '--git-dir', bare, 'rev-parse', 'refs/heads/main'), f.sourceCommit);
  });
});

test('CLI help and incorrect flags never initiate a Git push', () => {
  const command = fileURLToPath(new URL('./public-release-publish.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [command, '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Default: local read-only preflight/u);
  for (const args of [[], ['--publish'], ['--manifest', '../private'],
    ['--manifest', 'a', '--manifest', 'b', '--repository', repositoryUrl]]) {
    const result = spawnSync(process.execPath, [command, ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout).code, 'invalid_arguments');
    assert.ok(!result.stdout.includes('../private'));
  }
});
