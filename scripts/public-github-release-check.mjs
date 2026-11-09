#!/usr/bin/env node
/** Anonymous, read-only verification of an already published sanitized GitHub release. */
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'rightsreceipt-public-github-check-v1';
const COMMIT = /^[0-9a-f]{40}$/u;
const PUBLIC_AUTHOR = '212063387+nolankido@users.noreply.github.com';
const FIXED_HEADERS = Object.freeze({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'RightsReceipt-Anonymous-Public-Release-Check',
});

class PublicationCheckError extends Error {
  constructor(code) { super('Anonymous public release verification failed.'); this.code = code; }
}

export function parsePublicRepositoryUrl(value) {
  if (typeof value !== 'string' || value.length > 250) throw new PublicationCheckError('public_repo_url_invalid');
  let url;
  try { url = new URL(value); }
  catch { throw new PublicationCheckError('public_repo_url_invalid'); }
  const path = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port
    || url.username || url.password || url.search || url.hash || path.length !== 2
    || !path.every(piece => /^[A-Za-z0-9_.-]{1,100}$/u.test(piece))
    || path.join('/').toLowerCase() === 'nolankido/rightsreceipt'
    || path.some(piece => /^(?:owner|repo|example|placeholder|your[-_]?repo)$/iu.test(piece))) {
    throw new PublicationCheckError('public_repo_url_invalid');
  }
  return Object.freeze({ owner: path[0], name: path[1], fullName: path.join('/') });
}

function verifiedExport(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.schemaVersion !== 'rightsreceipt-public-export-v1' || manifest.status !== 'passed'
    || !COMMIT.test(manifest.sourceCommit ?? '') || !COMMIT.test(manifest.sourceTree ?? '')
    || !COMMIT.test(manifest.publicCommit ?? '') || !COMMIT.test(manifest.publicTree ?? '')
    || manifest.publicCommit === manifest.sourceCommit || manifest.sourceTree !== manifest.publicTree
    || manifest.exactTreeMatch !== true || manifest.repositoryDirectory !== 'repo'
    || manifest.publicAuthorName !== 'nolankido' || manifest.publicAuthorEmail !== PUBLIC_AUTHOR) {
    throw new PublicationCheckError('public_export_manifest_invalid');
  }
}

async function githubJson(fetchImpl, url, { expectArray = false } = {}) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers: FIXED_HEADERS,
      redirect: 'manual', signal: AbortSignal.timeout(10000) });
  } catch { throw new PublicationCheckError('public_github_unavailable'); }
  if (response?.status !== 200 || response.redirected === true || response.type === 'opaqueredirect'
    || response.url !== url) throw new PublicationCheckError('public_github_unavailable');
  let raw, body;
  try {
    raw = await response.text();
    if (raw.length > 128 * 1024) throw new Error('oversized');
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body) !== expectArray) {
      throw new Error('unexpected-json-shape');
    }
  } catch { throw new PublicationCheckError('public_github_response_invalid'); }
  if (expectArray) {
    // An apparently clean first page is not proof that later pages contain no
    // hidden extra branches, tags, notes or custom advertised references.
    let link;
    try {
      if (typeof response.headers?.get !== 'function') throw new Error('missing-headers');
      link = response.headers.get('link');
    } catch { throw new PublicationCheckError('public_repository_refs_unverified'); }
    if (link) throw new PublicationCheckError('public_repository_refs_unverified');
  }
  return body;
}

/** Before any opt-in push, require a separately named, anonymously visible public destination. */
export async function checkPublicGithubDestination({ repositoryUrl, fetchImpl = fetch } = {}) {
  const target = parsePublicRepositoryUrl(repositoryUrl);
  const base = `https://api.github.com/repos/${target.owner}/${target.name}`;
  const repo = await githubJson(fetchImpl, base);
  if (repo.private !== false || repo.visibility !== 'public'
    || repo.full_name?.toLowerCase() !== target.fullName.toLowerCase()
    || repo.fork !== false || repo.disabled === true) {
    throw new PublicationCheckError('public_repository_metadata_mismatch');
  }
  // Empty new repositories are allowed during the destination-only preflight.
  // The published release gate below additionally requires GitHub to detect
  // the exported repository's committed MIT LICENSE in its About metadata.
  return Object.freeze({ ...target, defaultBranch: repo.default_branch,
    licenseSpdxId: repo.license?.spdx_id ?? null });
}

/** Confirm public GitHub metadata and exact root commit without any credentials. */
export async function checkPublishedGithubRelease({ repositoryUrl, manifest, fetchImpl = fetch } = {}) {
  verifiedExport(manifest);
  const target = await checkPublicGithubDestination({ repositoryUrl, fetchImpl });
  const base = `https://api.github.com/repos/${target.owner}/${target.name}`;
  // An empty destination may not yet have a default branch. After publication,
  // the exact public repository must expose its exported main branch.
  if (target.defaultBranch !== 'main') throw new PublicationCheckError('public_repository_metadata_mismatch');
  const branch = await githubJson(fetchImpl, base + '/branches/main');
  if (branch.commit?.sha !== manifest.publicCommit) {
    throw new PublicationCheckError('public_repository_head_mismatch');
  }
  const commit = await githubJson(fetchImpl, base + '/git/commits/' + manifest.publicCommit);
  if (commit.sha !== manifest.publicCommit || commit.tree?.sha !== manifest.publicTree
    || !Array.isArray(commit.parents) || commit.parents.length !== 0
    || commit.author?.name !== 'nolankido' || commit.committer?.name !== 'nolankido'
    || commit.author?.email !== PUBLIC_AUTHOR || commit.committer?.email !== PUBLIC_AUTHOR) {
    throw new PublicationCheckError('public_repository_commit_mismatch');
  }
  if (target.licenseSpdxId !== 'MIT') {
    throw new PublicationCheckError('public_repository_license_not_detected');
  }
  // GitHub's matching-refs endpoint with a trailing slash and no ref prefix
  // enumerates all advertised namespaces, including notes and custom refs.
  // This independent read keeps the public check from turning green when the
  // remote gained other history after the first-push verification snapshot.
  const refs = await githubJson(fetchImpl, base + '/git/matching-refs/', { expectArray: true });
  if (refs.length !== 1 || refs[0]?.ref !== 'refs/heads/main'
    || refs[0]?.object?.type !== 'commit' || refs[0]?.object?.sha !== manifest.publicCommit) {
    throw new PublicationCheckError('public_repository_refs_unverified');
  }
  return Object.freeze({ schemaVersion: SCHEMA, status: 'passed',
    checks: Object.freeze({ anonymousMetadata: true, publicVisibility: true,
      exactExportedHead: true, exactSanitizedTree: true, oneCommitRoot: true,
      publicAuthorIdentity: true, detectedMitLicense: true,
      onlyAuditedMainReference: true }),
    externalChecksRemaining: Object.freeze([
      'public_video_playback_duration_and_contents',
      'genuine_paypal_sandbox_payment_and_webhook',
      'devpost_submitted_confirmation',
    ]) });
}

function privateManifest(input) {
  try {
    const path = resolve(ROOT, input);
    const privateRoot = realpathSync(join(ROOT, '.data'));
    const actual = realpathSync(path);
    const rel = relative(privateRoot, actual);
    const stat = lstatSync(path);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || rel.startsWith('/')
      || rel.startsWith('\\') || !stat.isFile() || stat.isSymbolicLink()
      || stat.size === 0 || stat.size > 64 * 1024) throw new Error('invalid');
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { throw new PublicationCheckError('public_export_manifest_unavailable'); }
}

function parseArgs(args) {
  const raw = args[0] === '--' ? args.slice(1) : args;
  if (raw.length === 1 && raw[0] === '--help') return { help: true };
  if (raw.length !== 4) throw new PublicationCheckError('invalid_arguments');
  const opts = {};
  for (let i = 0; i < raw.length; i += 2) {
    if (!['--manifest', '--repository'].includes(raw[i]) || !raw[i + 1]
      || raw[i + 1].startsWith('--') || opts[raw[i]] !== undefined) {
      throw new PublicationCheckError('invalid_arguments');
    }
    opts[raw[i]] = raw[i + 1];
  }
  if (!opts['--manifest'] || !opts['--repository']) throw new PublicationCheckError('invalid_arguments');
  return { manifest: opts['--manifest'], repository: opts['--repository'] };
}

export async function main(args = process.argv.slice(2)) {
  try {
    const parsed = parseArgs(args);
    if (parsed.help) {
      process.stdout.write('Usage: node scripts/public-github-release-check.mjs --manifest .data/.../manifest.json --repository https://github.com/owner/public-repo\nChecks anonymous public source identity only. Never publishes or sends payment.\n');
      return 0;
    }
    const outcome = await checkPublishedGithubRelease({ repositoryUrl: parsed.repository,
      manifest: privateManifest(parsed.manifest) });
    process.stdout.write(JSON.stringify(outcome) + '\n');
    return 0;
  } catch (error) {
    const code = error instanceof PublicationCheckError ? error.code : 'public_github_check_failed';
    process.stdout.write(JSON.stringify({ schemaVersion: SCHEMA, status: 'failed', code }) + '\n');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
