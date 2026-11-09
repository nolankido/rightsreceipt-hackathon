#!/usr/bin/env node
/** Offline cross-artifact submission review. Local consistency is NOT public release proof. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyReleaseEvidence } from './export-public-release.mjs';
import { releaseJudgeEvidenceValid } from './support/release-judge-evidence.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'rightsreceipt-submission-candidate-v1';
const COMMIT = /^[0-9a-f]{40}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const EXTERNAL = Object.freeze([
  'paypal_provider_origin_and_actual_settlement_not_independently_verified',
  'public_github_repository_access_not_checked',
  'public_youtube_video_content_and_duration_not_checked',
  'devpost_submission_not_confirmed',
]);
const sha256 = raw => createHash('sha256').update(raw).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function githubUrl(value) {
  if (typeof value !== 'string' || value.length > 250) return false;
  try {
    const url = new URL(value);
    const path = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port
      && !url.username && !url.password && !url.search && !url.hash && path.length === 2
      && path.every(part => /^[A-Za-z0-9_.-]{1,100}$/u.test(part))
      && path.join('/').toLowerCase() !== 'nolankido/rightsreceipt'
      && !path.some(part => /^(?:owner|repo|your[-_]?repo|placeholder|example)$/iu.test(part));
  } catch { return false; }
}
function youtubeUrl(value) {
  if (typeof value !== 'string' || value.length > 300) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return false;
    if (['www.youtube.com', 'youtube.com'].includes(url.hostname) && url.pathname === '/watch') {
      const params = [...url.searchParams.entries()];
      return params.length === 1 && params[0][0] === 'v' && /^[A-Za-z0-9_-]{11}$/u.test(params[0][1]);
    }
    if (url.hostname === 'youtu.be' && !url.search) {
      return /^\/[A-Za-z0-9_-]{11}$/u.test(url.pathname);
    }
    return false;
  } catch { return false; }
}

/** All input values are treated as untrusted. No paths, URLs, IDs or raw evidence are returned. */
export function evaluateSubmissionCandidate({ manifest, release, releaseRaw, exported,
  sandboxResult, currentCommit, currentTree, cleanCheckout, releaseIntegrityVerified } = {}) {
  const errors = new Set();
  if (!object(manifest) || manifest.schemaVersion !== SCHEMA) errors.add('manifest_invalid');
  if (!COMMIT.test(currentCommit ?? '') || !COMMIT.test(currentTree ?? '') || cleanCheckout !== true) {
    errors.add('current_checkout_not_verified');
  }
  const validRelease = object(release) && release.schemaVersion === 'rightsreceipt-release-candidate-v1'
    && release.status === 'passed' && release.mode === 'full' && release.commit === currentCommit
    && /^22\.\d+\.\d+$/u.test(release.node ?? '')
    && Number(release.node.split('.')[1]) >= 13
    && release.packageManager === 'pnpm@12.8.2' && Array.isArray(release.preflightFailures)
    && release.preflightFailures.length === 0 && object(release.lockfile)
    && HASH.test(release.lockfile.sha256 ?? '')
    && COMMIT.test(release.lockfile.committedGitBlobSha ?? '')
    && release.lockfile.committedGitBlobSha === release.lockfile.workingGitBlobSha
    && Array.isArray(release.commands) && release.commands.length === 4
    && release.commands.every(item => object(item) && item.exitCode === 0
      && item.signal === null && item.spawnError === null
      && Array.isArray(item.command) && item.command.length >= 2
      && HASH.test(item.stdoutSha256 ?? '') && HASH.test(item.stderrSha256 ?? ''))
    && release.judgeEvidence?.root === 'judge';
  if (!validRelease) errors.add('full_release_verification_missing_or_mismatched');
  if (releaseIntegrityVerified !== true) errors.add('release_log_or_judge_evidence_invalid');

  const validExport = object(exported) && exported.schemaVersion === 'rightsreceipt-public-export-v1'
    && exported.status === 'passed' && exported.sourceCommit === currentCommit
    && exported.sourceTree === currentTree && exported.publicTree === currentTree
    && exported.exactTreeMatch === true && COMMIT.test(exported.publicCommit ?? '')
    && exported.publicCommit !== currentCommit
    && HASH.test(exported.releaseVerificationSha256 ?? '')
    && typeof releaseRaw === 'string'
    && exported.releaseVerificationSha256 === sha256(releaseRaw)
    && Number.isSafeInteger(exported.trackedFileCount) && exported.trackedFileCount > 0
    && Number.isSafeInteger(exported.trackedByteCount) && exported.trackedByteCount > 0
    && exported.publicAuthorName === 'nolankido'
    && exported.publicAuthorEmail === '212063387+nolankido@users.noreply.github.com'
    && HASH.test(exported.sourceSnapshotAuditSha256 ?? '')
    && HASH.test(exported.publicHistoryAuditSha256 ?? '');
  if (!validExport) errors.add('sanitized_public_export_missing_or_mismatched');

  if (!object(sandboxResult) || sandboxResult.schemaVersion !== 'rightsreceipt-paypal-acceptance-evidence-check-v1'
    || sandboxResult.status !== 'passed' || !Array.isArray(sandboxResult.errorCodes)
    || sandboxResult.errorCodes.length !== 0 || !HASH.test(sandboxResult.invoiceIdSha256 ?? '')) {
    errors.add('sandbox_internal_consistency_record_missing');
  }
  if (!githubUrl(manifest?.publicRepositoryUrl)) errors.add('public_repository_url_missing_or_invalid');
  if (!youtubeUrl(manifest?.youtubeDemoUrl)) errors.add('public_video_url_missing_or_invalid');

  const blockers = [...errors].sort();
  return Object.freeze({
    schemaVersion: 'rightsreceipt-submission-check-v1',
    status: blockers.length ? 'blocked' : 'local_records_consistent_external_checks_required',
    readyForSubmission: false,
    blockers,
    externalVerificationRequired: [...EXTERNAL],
    limitation: 'Offline records and plausible URLs are not independent proof of PayPal, GitHub visibility, video contents or Devpost submission.',
  });
}

function privateFile(path, limit = 1024 * 1024) {
  if (typeof path !== 'string' || path.length > 4096 || !path) throw Error('invalid_input');
  const absolute = resolve(ROOT, path);
  const permitted = realpathSync(join(ROOT, '.data'));
  const actual = realpathSync(absolute);
  const rel = relative(permitted, actual);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || rel.startsWith('/') || rel.startsWith('\\')) throw Error('invalid_input');
  const st = lstatSync(absolute);
  if (!st.isFile() || st.isSymbolicLink() || st.size === 0 || st.size > limit) throw Error('invalid_input');
  return readFileSync(absolute, 'utf8');
}
function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 10000 }).trim();
}
function parseArgs(args) {
  const input = args[0] === '--' ? args.slice(1) : args;
  if (input.length === 1 && input[0] === '--help') return { help: true };
  if (input.length === 0) return { manifest: '.data/submission-candidate.json' };
  if (input.length === 2 && input[0] === '--manifest' && input[1] && !input[1].startsWith('--')) {
    return { manifest: input[1] };
  }
  return null;
}
function blocked(code) {
  return { schemaVersion: 'rightsreceipt-submission-check-v1', status: 'blocked',
    readyForSubmission: false, blockers: [code], externalVerificationRequired: [...EXTERNAL],
    limitation: 'Offline checks cannot establish submission or external provider authenticity.' };
}
export async function main(args = process.argv.slice(2)) {
  const parsed = parseArgs(args);
  if (!parsed) { process.stdout.write(JSON.stringify(blocked('invalid_arguments')) + '\n'); return 2; }
  if (parsed.help) {
    process.stdout.write('Usage: node scripts/submission-candidate-check.mjs [--manifest .data/submission-candidate.json]\n'
      + 'Read-only local evidence assembly. No network, payment, deployment or submission is performed.\n');
    return 0;
  }
  try {
    const manifest = JSON.parse(privateFile(parsed.manifest, 16 * 1024));
    if (!object(manifest) || manifest.schemaVersion !== SCHEMA
      || !object(manifest.sandboxEvidence)) throw Error('invalid_input');
    const rawRelease = privateFile(manifest.releaseVerification);
    const release = JSON.parse(rawRelease);
    const exported = JSON.parse(privateFile(manifest.publicExportManifest));
    const create = JSON.parse(privateFile(manifest.sandboxEvidence.create));
    const paid = JSON.parse(privateFile(manifest.sandboxEvidence.paid));
    const webhook = JSON.parse(privateFile(manifest.sandboxEvidence.webhook));
    const { evaluateAcceptanceEvidence } = await import('./paypal-acceptance-evidence-check.mjs');
    const sandboxResult = evaluateAcceptanceEvidence({ create, paid, webhook });
    const currentCommit = git('rev-parse', 'HEAD');
    const currentTree = git('rev-parse', 'HEAD^{tree}');
    const cleanCheckout = git('status', '--porcelain=v1', '--untracked-files=all') === '';
    let releaseIntegrityVerified = false;
    try {
      const verified = verifyReleaseEvidence(manifest.releaseVerification, currentCommit);
      releaseIntegrityVerified = verified.sha256 === sha256(rawRelease)
        && releaseJudgeEvidenceValid(join(dirname(resolve(ROOT, manifest.releaseVerification)), 'judge'),
          { commit: currentCommit, node: release?.node });
    } catch { /* Fail closed without printing paths or contents of private release evidence. */ }
    const output = evaluateSubmissionCandidate({ manifest, release, releaseRaw: rawRelease,
      exported, sandboxResult, currentCommit, currentTree, cleanCheckout, releaseIntegrityVerified });
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return output.status === 'blocked' ? 1 : 0;
  } catch {
    process.stdout.write(JSON.stringify(blocked('submission_evidence_unreadable_or_incomplete')) + '\n');
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
