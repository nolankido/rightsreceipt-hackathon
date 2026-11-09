#!/usr/bin/env node
/** Opt-in publication of an exact, already-audited one-commit release, never private HEAD. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyReleaseEvidence } from './export-public-release.mjs';
import { checkPublicGithubDestination, checkPublishedGithubRelease,
  parsePublicRepositoryUrl } from './public-github-release-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'rightsreceipt-public-release-publish-v1';
const SHA = /^[0-9a-f]{40}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const PUBLIC_EMAIL = '212063387+nolankido@users.noreply.github.com';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** A post-push snapshot may advertise only the audited main and its matching HEAD. */
function onlyAuditedMainRefs(remoteRefs, publicCommit) {
  if (typeof remoteRefs !== 'string' || !remoteRefs.trim()) return false;
  const seen = new Set();
  for (const line of remoteRefs.trim().split(/\r?\n/u)) {
    const match = /^([0-9a-f]{40})\t(HEAD|refs\/heads\/main)$/u.exec(line);
    if (!match || match[1] !== publicCommit || seen.has(match[2])) return false;
    seen.add(match[2]);
  }
  return seen.has('refs/heads/main');
}

class PublicationError extends Error {
  constructor(code) { super('Public release handoff blocked.'); this.code = code; }
}

function inside(base, path) {
  const rel = relative(base, path);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

function privatePath(root, input, expectedFilename, directory = false) {
  try {
    if (typeof input !== 'string' || input.length > 4096 || !input) throw new Error();
    const base = realpathSync(join(root, '.data'));
    const proposed = resolve(root, input);
    const actual = realpathSync(proposed);
    const stat = lstatSync(proposed);
    if (!inside(base, actual) || stat.isSymbolicLink()
      || (directory ? !stat.isDirectory() : !stat.isFile())
      || (!directory && (stat.size < 1 || stat.size > 64 * 1024))
      || (expectedFilename && actual.split(sep).at(-1) !== expectedFilename)) throw new Error();
    return actual;
  } catch { throw new PublicationError('private_release_artifact_invalid'); }
}

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 10000,
    maxBuffer: 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.error || result.status !== 0) throw new PublicationError('release_git_state_invalid');
  return result.stdout.trim();
}

/** Check every local identity before obtaining a public destination or pushing anything. */
export function preparePublicRelease({ root = ROOT, manifestPath, releaseEvidencePath,
  repositoryUrl, releaseVerifier = verifyReleaseEvidence, gitRead = git } = {}) {
  let target;
  try { target = parsePublicRepositoryUrl(repositoryUrl); }
  catch { throw new PublicationError('public_repository_url_invalid'); }
  const source = realpathSync(root);
  const manifestFile = privatePath(source, manifestPath, 'manifest.json');
  const releaseFile = privatePath(source, releaseEvidencePath, 'verification.json');
  const exported = privatePath(source, join(dirname(manifestFile), 'repo'), 'repo', true);
  let manifest, releaseRaw;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    releaseRaw = readFileSync(releaseFile);
  } catch { throw new PublicationError('private_release_artifact_invalid'); }
  let sourceCommit, sourceTree, publicCommit, publicTree, count, refs, status, remotes, author;
  try {
    if (realpathSync(gitRead(source, ['rev-parse', '--show-toplevel'])) !== source
      || realpathSync(gitRead(exported, ['rev-parse', '--show-toplevel'])) !== exported) {
      throw new Error('incorrect_repository_root');
    }
    sourceCommit = gitRead(source, ['rev-parse', 'HEAD']);
    sourceTree = gitRead(source, ['rev-parse', 'HEAD^{tree}']);
    if (gitRead(source, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') {
      throw new Error('dirty_source');
    }
    publicCommit = gitRead(exported, ['rev-parse', 'HEAD']);
    publicTree = gitRead(exported, ['rev-parse', 'HEAD^{tree}']);
    count = gitRead(exported, ['rev-list', '--count', 'HEAD']);
    refs = gitRead(exported, ['for-each-ref', '--format=%(refname)']);
    status = gitRead(exported, ['status', '--porcelain=v1', '--untracked-files=all']);
    remotes = gitRead(exported, ['remote']);
    author = gitRead(exported, ['log', '-1', '--format=%an%x09%ae%x09%cn%x09%ce']);
  } catch { throw new PublicationError('release_git_state_invalid'); }

  if (!manifest || manifest.schemaVersion !== 'rightsreceipt-public-export-v1'
    || manifest.status !== 'passed' || manifest.repositoryDirectory !== 'repo'
    || manifest.exactTreeMatch !== true || !SHA.test(sourceCommit)
    || !SHA.test(sourceTree) || !SHA.test(publicCommit) || !SHA.test(publicTree)
    || manifest.sourceCommit !== sourceCommit || manifest.sourceTree !== sourceTree
    || manifest.publicCommit !== publicCommit || manifest.publicTree !== publicTree
    || sourceCommit === publicCommit || sourceTree !== publicTree || count !== '1'
    || refs !== 'refs/heads/main' || status !== '' || remotes !== ''
    || manifest.publicAuthorName !== 'nolankido'
    || manifest.publicAuthorEmail !== PUBLIC_EMAIL
    || author !== `nolankido\t${PUBLIC_EMAIL}\tnolankido\t${PUBLIC_EMAIL}`
    || !HASH.test(manifest.sourceSnapshotAuditSha256 ?? '')
    || !HASH.test(manifest.publicHistoryAuditSha256 ?? '')
    || !Number.isSafeInteger(manifest.trackedFileCount) || manifest.trackedFileCount < 1
    || !Number.isSafeInteger(manifest.trackedByteCount) || manifest.trackedByteCount < 1
    || manifest.releaseVerificationSha256 !== sha256(releaseRaw)) {
    throw new PublicationError('sanitized_export_identity_invalid');
  }
  try {
    const verified = releaseVerifier(releaseFile, sourceCommit);
    if (verified?.sha256 !== manifest.releaseVerificationSha256) throw new Error();
  } catch { throw new PublicationError('full_release_evidence_invalid'); }

  return Object.freeze({ schemaVersion: SCHEMA, sourceCommit, publicCommit, publicTree,
    repositoryPath: exported, repositoryUrl: `https://github.com/${target.fullName}`,
    remoteGitUrl: `https://github.com/${target.fullName}.git`, manifest });
}

/** A creation-only lease: refuses to modify an existing public main branch. */
export function pushNewPublicMain({ repositoryPath, remoteGitUrl, publicCommit,
  spawn = spawnSync } = {}) {
  if (!SHA.test(publicCommit ?? '')) throw new PublicationError('public_push_invalid');
  const options = { cwd: repositoryPath, encoding: 'utf8', windowsHide: true, timeout: 120000,
    maxBuffer: 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } };
  // Require a reference-empty remote, including notes, replace and custom refs.
  // --heads/--tags would miss these preexisting objects and incorrectly permit
  // the first push into a repository that was not actually empty.
  const existing = spawn('git', ['ls-remote', remoteGitUrl], options);
  if (existing?.error || existing?.status !== 0 || typeof existing.stdout !== 'string') {
    throw new PublicationError('public_destination_refs_unavailable');
  }
  if (existing.stdout.trim() !== '') throw new PublicationError('public_destination_not_empty');
  const result = spawn('git', [
    '-c', 'core.hooksPath=.git/disabled-publication-hooks',
    'push', '--porcelain', '--no-follow-tags', '--no-verify',
    '--force-with-lease=refs/heads/main:',
    remoteGitUrl, `${publicCommit}:refs/heads/main`,
  ], options);
  if (result?.error || result?.status !== 0) throw new PublicationError('public_push_failed');
  // A concurrent actor can introduce unrelated refs after the empty-remote
  // check. Re-read all refs after the successful write, never just heads/tags.
  // If that read fails, the push has already happened: report verification
  // pending instead of incorrectly describing the entire handoff as blocked.
  const after = spawn('git', ['ls-remote', remoteGitUrl], options);
  return Object.freeze({ postPushRefsVerified: !after?.error && after?.status === 0
    && onlyAuditedMainRefs(after.stdout, publicCommit) });
}

export async function runPublicReleaseHandoff({ prepared, publish = false, fetchImpl = fetch,
  push = pushNewPublicMain } = {}) {
  if (!publish) return Object.freeze({ schemaVersion: SCHEMA,
    status: 'prepared_not_published', publicCommit: prepared.publicCommit,
    requiresExplicitPublish: true });
  try {
    await checkPublicGithubDestination({ repositoryUrl: prepared.repositoryUrl, fetchImpl });
  } catch { throw new PublicationError('public_destination_not_anon_visible'); }
  // This is the only network write. Its refspec names exactly the vetted commit
  // and the creation-only lease refuses even a fast-forward of an existing main.
  const pushed = push({ repositoryPath: prepared.repositoryPath, remoteGitUrl: prepared.remoteGitUrl,
    publicCommit: prepared.publicCommit });
  if (pushed?.postPushRefsVerified !== true) {
    return Object.freeze({ schemaVersion: SCHEMA, status: 'pushed_verification_pending',
      code: 'public_post_push_refs_unverified', publicCommit: prepared.publicCommit });
  }
  try {
    await checkPublishedGithubRelease({ repositoryUrl: prepared.repositoryUrl,
      manifest: prepared.manifest, fetchImpl });
  } catch {
    return Object.freeze({ schemaVersion: SCHEMA, status: 'pushed_verification_pending',
      code: 'anonymous_public_source_check_failed', publicCommit: prepared.publicCommit });
  }
  return Object.freeze({ schemaVersion: SCHEMA, status: 'published_and_verified',
    publicCommit: prepared.publicCommit, sourceVerifiedAnonymously: true });
}

function parseArgs(raw) {
  const args = raw[0] === '--' ? raw.slice(1) : raw;
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const result = { publish: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--publish' && result.publish === false) result.publish = true;
    else if (['--manifest', '--release-evidence', '--repository'].includes(key)
      && result[key] === undefined && args[i + 1] && !args[i + 1].startsWith('--')) {
      result[key] = args[++i];
    } else throw new PublicationError('invalid_arguments');
  }
  if (!result['--manifest'] || !result['--release-evidence'] || !result['--repository']) {
    throw new PublicationError('invalid_arguments');
  }
  return result;
}

export async function main(args = process.argv.slice(2)) {
  try {
    const opts = parseArgs(args);
    if (opts.help) {
      process.stdout.write('Usage: node scripts/public-release-publish.mjs --manifest .data/.../manifest.json --release-evidence .data/.../verification.json --repository https://github.com/owner/new-public-repo [--publish]\nDefault: local read-only preflight. --publish requires an existing, anonymously public GitHub repository and pushes only the audited one-commit main with a creation-only lease. Never creates the GitHub repository.\n');
      return 0;
    }
    const prepared = preparePublicRelease({ manifestPath: opts['--manifest'],
      releaseEvidencePath: opts['--release-evidence'], repositoryUrl: opts['--repository'] });
    const outcome = await runPublicReleaseHandoff({ prepared, publish: opts.publish });
    process.stdout.write(JSON.stringify(outcome) + '\n');
    return outcome.status === 'pushed_verification_pending' ? 1 : 0;
  } catch (error) {
    const code = error instanceof PublicationError ? error.code : 'publication_handoff_failed';
    process.stdout.write(JSON.stringify({ schemaVersion: SCHEMA, status: 'blocked', code }) + '\n');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
