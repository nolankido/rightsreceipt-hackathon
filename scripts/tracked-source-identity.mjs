/** Fail-closed consistency check between HEAD, the Git index and actual source bytes. */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const decode = new TextDecoder('utf-8', { fatal: true });
class IdentityFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new IdentityFailure('tracked_source_git_unavailable');
  }
  try { return decode.decode(result.stdout); }
  catch { throw new IdentityFailure('tracked_source_git_unavailable'); }
}
function entries(data, kind) {
  const result = new Map();
  for (const entry of data.split('\0').filter(Boolean)) {
    const match = kind === 'head'
      ? /^(\d{6}) (blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/u.exec(entry)
      : /^(\d{6}) ([0-9a-f]{40}) ([0-3])\t([\s\S]+)$/u.exec(entry);
    if (!match) throw new IdentityFailure('tracked_source_index_invalid');
    const mode = match[1], type = kind === 'head' ? match[2] : 'blob';
    const sha = kind === 'head' ? match[3] : match[2];
    const stage = kind === 'head' ? '0' : match[3];
    const path = match[4];
    if (stage !== '0' || type !== 'blob' || !['100644', '100755'].includes(mode)) {
      throw new IdentityFailure('tracked_source_entry_unsupported');
    }
    if (!path || result.has(path)) throw new IdentityFailure('tracked_source_index_invalid');
    result.set(path, { mode, sha });
  }
  return result;
}
/**
 * Does not trust git status, which can hide skip-worktree/assume-unchanged edits.
 * git hash-object --path applies the same Git clean filters as committed blobs.
 * Returns only fixed codes and counts, never paths or file contents.
 */
export function verifyTrackedSourceIdentity(rootInput) {
  const root = resolve(rootInput);
  try {
    const head = entries(git(root, ['ls-tree', '-r', '-z', 'HEAD']), 'head');
    const index = entries(git(root, ['ls-files', '--stage', '-z']), 'index');
    if (!head.size || head.size !== index.size) throw new IdentityFailure('tracked_source_tree_mismatch');
    for (const [path, expected] of head) {
      const actual = index.get(path);
      if (!actual || actual.mode !== expected.mode || actual.sha !== expected.sha) {
        throw new IdentityFailure('tracked_source_tree_mismatch');
      }
    }
    const flags = git(root, ['ls-files', '-v', '-z']).split('\0').filter(Boolean);
    if (flags.length !== head.size) throw new IdentityFailure('tracked_source_index_invalid');
    const seen = new Set();
    for (const entry of flags) {
      if (entry.length < 3 || entry[1] !== ' ' || !head.has(entry.slice(2))
        || seen.has(entry.slice(2))) throw new IdentityFailure('tracked_source_index_invalid');
      seen.add(entry.slice(2));
      if (entry[0] !== 'H') throw new IdentityFailure('tracked_source_hidden_index_flag');
    }
    for (const [path, expected] of head) {
      const sha = git(root, ['hash-object', '--path=' + path, '--', path]).trim();
      if (sha !== expected.sha) throw new IdentityFailure('tracked_source_worktree_mismatch');
    }
    return { status: 'passed', code: 'ok', trackedFiles: head.size };
  } catch (error) {
    const code = error instanceof IdentityFailure ? error.code : 'tracked_source_unavailable';
    return { status: 'failed', code, trackedFiles: null };
  }
}
