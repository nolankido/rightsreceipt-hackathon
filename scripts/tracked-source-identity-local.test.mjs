import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyTrackedSourceIdentity } from './tracked-source-identity.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rr068-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'fixture@example.test');
  git(root, 'config', 'user.name', 'Fixture');
  writeFileSync(join(root, 'source.txt'), 'committed source\n');
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  return root;
}
function within(f) {
  const root = fixture();
  try { f(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
test('ordinary committed tracked files pass the exact-source gate', () => within(root => {
  assert.deepEqual(verifyTrackedSourceIdentity(root), { status:'passed', code:'ok', trackedFiles:2 });
}));
test('skip-worktree cannot hide changed non-lockfile source', () => within(root => {
  git(root, 'update-index', '--skip-worktree', 'source.txt');
  writeFileSync(join(root, 'source.txt'), 'hidden altered source\n');
  assert.equal(git(root, 'status', '--porcelain=v1'), '');
  assert.equal(verifyTrackedSourceIdentity(root).code, 'tracked_source_hidden_index_flag');
}));
test('assume-unchanged cannot hide changed non-lockfile source', () => within(root => {
  git(root, 'update-index', '--assume-unchanged', 'source.txt');
  writeFileSync(join(root, 'source.txt'), 'hidden altered source\n');
  assert.equal(git(root, 'status', '--porcelain=v1'), '');
  assert.equal(verifyTrackedSourceIdentity(root).code, 'tracked_source_hidden_index_flag');
}));
test('content differing from HEAD is rejected even without hidden index flags', () => within(root => {
  writeFileSync(join(root, 'source.txt'), 'altered source\n');
  assert.equal(verifyTrackedSourceIdentity(root).code, 'tracked_source_worktree_mismatch');
}));
test('staged change is rejected even when working file equals staged content', () => within(root => {
  writeFileSync(join(root, 'source.txt'), 'staged source\n');
  git(root, 'add', 'source.txt');
  assert.equal(verifyTrackedSourceIdentity(root).code, 'tracked_source_tree_mismatch');
}));
test('a deleted tracked file cannot match committed source', () => within(root => {
  rmSync(join(root, 'source.txt'));
  const result = verifyTrackedSourceIdentity(root);
  assert.equal(result.status, 'failed');
  assert.notEqual(result.code, 'ok');
}));
test('ignored untracked files cannot affect the committed source identity', () => within(root => {
  writeFileSync(join(root, '.gitignore'), 'ignored.txt\n');
  git(root, 'add', '.gitignore');
  git(root, 'commit', '-qm', 'ignore');
  writeFileSync(join(root, 'ignored.txt'), 'not part of source\n');
  assert.equal(verifyTrackedSourceIdentity(root).status, 'passed');
}));
test('CRLF normalization passes when Git committed equivalent LF content', () => within(root => {
  git(root, 'config', 'core.autocrlf', 'true');
  writeFileSync(join(root,'source.txt'), 'committed source\r\n');
  const result = verifyTrackedSourceIdentity(root);
  assert.equal(result.status, 'passed', JSON.stringify(result));
}));
test('tracked symlinks are never accepted as verified release source', () => within(root => {
  const blob = git(root, 'rev-parse', 'HEAD:source.txt');
  git(root, 'update-index', '--add', '--cacheinfo', '120000,'+blob+',link');
  git(root, 'commit','-qm','symlink');
  assert.equal(verifyTrackedSourceIdentity(root).code, 'tracked_source_entry_unsupported');
}));
