import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCleanReleaseCheckout, requireCleanReleaseNode, validateCleanReleaseResult,
  validateCleanPublicExportResult, shareableReleaseSummary, prepareCleanReleaseOutput } from './clean-release-checkout.mjs';
import { releaseCommandInvocation } from './release-candidate-verify.mjs';

const script = fileURLToPath(new URL('./clean-release-checkout.mjs', import.meta.url));
const SHA = /^[0-9a-f]{40}$/u;
function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rightsreceipt-clean-clone-' + randomUUID() + '-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'fixture@example.test');
  git(root, 'config', 'user.name', 'RightsReceipt Fixture');
  writeFileSync(join(root, '.gitignore'), '.data/\n.env\n');
  writeFileSync(join(root, 'package.json'), '{"private":true}\n');
  git(root, 'add', '.gitignore', 'package.json');
  git(root, 'commit', '-qm', 'source commit');
  return root;
}

function passingFullReleaseRecord(checkout, evidencePath, commit) {
  mkdirSync(dirname(evidencePath), { recursive: true });
  const expected = [
    [process.execPath, [join(checkout, 'scripts', 'public-release-audit.mjs'), '--snapshot-only']],
    ['corepack', ['pnpm', 'install', '--frozen-lockfile']],
    ['corepack', ['pnpm', 'verify']],
    [process.execPath, [join(checkout, 'scripts', 'judge-rehearsal.mjs'),
      '--output', join(dirname(evidencePath), 'judge')]],
  ];
  return {
    schemaVersion: 'rightsreceipt-release-candidate-v1', status: 'passed', mode: 'full', commit,
    node: process.versions.node, packageManager: 'pnpm@12.8.2',
    preflightFailures: [], judgeEvidence: { root: 'judge' },
    commands: expected.map(([executable, args], index) => {
      const command = releaseCommandInvocation(executable, args);
      const stem = String(index + 1).padStart(2, '0') + '-'
        + command.executable.replace(/[^A-Za-z0-9._-]/gu, '_');
      const stdout = `synthetic stdout for stage ${index + 1}\n`;
      const stderr = index === 0 ? '' : `synthetic stderr for stage ${index + 1}\n`;
      writeFileSync(join(dirname(evidencePath), stem + '.stdout.log'), stdout);
      writeFileSync(join(dirname(evidencePath), stem + '.stderr.log'), stderr);
      return {
        command: [command.executable, ...command.args], exitCode: 0, signal: null,
        spawnError: null, durationMs: 10,
        stdoutSha256: createHash('sha256').update(stdout).digest('hex'),
        stderrSha256: createHash('sha256').update(stderr).digest('hex'),
      };
    }),
  };
}

test('runner explicitly rejects incompatible Node versions before release work', () => {
  assert.doesNotThrow(() => requireCleanReleaseNode('22.13.0'));
  assert.doesNotThrow(() => requireCleanReleaseNode('22.16.0'));
  for (const version of ['21.99.0', '22.12.9', '23.0.0', '24.22.1', 'invalid']) {
    assert.throws(() => requireCleanReleaseNode(version), error => error.code === 'node_22_required');
  }
});

test('CLI help is safe and does not require Node 22', () => {
  // Assert CLI output independently of experimental Node runtime warnings.
  const result = spawnSync(process.execPath, ['--no-warnings', script, '--help'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Requires Node 22\.13\+/u);
  assert.equal(result.stderr, '');
});

test('package script exposes the safe handoff without opting into public export', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.scripts['release:clean:shareable'],
    'node scripts/clean-release-checkout.mjs --shareable');
});

test('unsupported CLI arguments fail before any checkout is created', () => {
  const result = spawnSync(process.execPath, [script, '--unknown'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 2);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 'rightsreceipt-clean-release-checkout-v1', status: 'failed', code: 'invalid_arguments',
  });
});

test('public export option is recognized without changing the Node 22 safety gate', t => {
  if (process.versions.node.startsWith('22.')) { t.skip('Use synthetic pipeline tests on Node 22'); return; }
  const result = spawnSync(process.execPath, [script, '--export-public'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).code, 'node_22_required');
});

test('shareable failure summary keeps actionable stage codes but no private paths', () => {
  const secret = 'PRIVATE_CREDENTIAL_OR_USER_PATH_MUST_NOT_ESCAPE';
  const shared = shareableReleaseSummary({
    status: 'failed', code: 'release_verification_failed',
    commit: secret, checkoutPath: secret, evidencePath: secret,
    privateLogs: secret, stderr: secret,
    diagnostics: {
      failureCodes: ['release_stage_3_timed_out', secret, 'release_stage_3_timed_out'],
      unknownFailureCodesPresent: false, firstFailedStage: 3, stdout: secret,
    },
  }, { exportRequested: true });
  assert.deepEqual(shared, {
    schemaVersion: 'rightsreceipt-clean-release-handoff-v1',
    status: 'failed', code: 'release_verification_failed',
    releaseStatus: 'not_verified', publicExportStatus: 'not_verified',
    diagnostics: { failureCodes: ['release_stage_3_timed_out'],
      unknownFailureCodesPresent: true, firstFailedStage: 3 },
    limitation: 'Path-free local result only. This does not prove PayPal settlement, public GitHub or YouTube availability, or Devpost submission.',
  });
  assert.ok(!JSON.stringify(shared).includes(secret));
});

test('shareable success and export failure preserve independent gate states', () => {
  const sensitive = 'PRIVATE_SOURCE_PATH_NOT_FOR_CHAT';
  const passing = shareableReleaseSummary({
    status: 'passed', commit: sensitive, evidencePath: sensitive,
    checkoutPath: sensitive,
    publicExport: { status: 'passed', publicCommit: sensitive,
      repositoryPath: sensitive, manifestPath: sensitive },
  }, { exportRequested: true });
  assert.equal(passing.status, 'passed');
  assert.equal(passing.releaseStatus, 'passed');
  assert.equal(passing.publicExportStatus, 'passed');
  assert.equal(passing.code, null);
  assert.ok(!JSON.stringify(passing).includes(sensitive));

  const failedExport = shareableReleaseSummary({
    status: 'failed', releaseStatus: 'passed',
    code: 'public_export_result_invalid', checkoutPath: sensitive,
  }, { exportRequested: true });
  assert.equal(failedExport.status, 'failed');
  assert.equal(failedExport.releaseStatus, 'passed');
  assert.equal(failedExport.publicExportStatus, 'not_verified');
  assert.equal(failedExport.code, 'public_export_result_invalid');
  assert.equal(shareableReleaseSummary({ status: 'passed' }).publicExportStatus, 'not_requested');
  assert.equal(shareableReleaseSummary({ status: 'failed', code: sensitive }).code, 'clean_release_failed');
});

test('one shareable export run saves an exclusive private handoff without exposing paths', () => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidencePath = join(privateBase, 'evidence', 'run-131-export', 'verification.json');
    writeFileSync(evidencePath, JSON.stringify(passingFullReleaseRecord(root, evidencePath, commit)));
    const sensitive = join(root, 'PRIVATE_INTERNAL_RELEASE_PATH');
    const outcome = {
      schemaVersion: 'rightsreceipt-clean-release-checkout-v1', status: 'passed', code: null,
      commit, evidencePath, checkoutPath: root,
      publicExport: { status: 'passed', publicCommit: 'a'.repeat(40),
        repositoryPath: sensitive, manifestPath: sensitive },
    };
    const opts = { shareableRequested: true, exportRequested: true, privateBase };
    const summary = prepareCleanReleaseOutput(outcome, opts);
    assert.equal(summary.status, 'passed');
    assert.equal(summary.releaseStatus, 'passed');
    assert.equal(summary.publicExportStatus, 'passed');
    assert.equal(summary.privateHandoffSaved, true);
    assert.ok(!JSON.stringify(summary).includes(sensitive));
    assert.ok(!JSON.stringify(summary).includes(root));
    assert.ok(!JSON.stringify(summary).includes(commit));
    const savedFiles = readdirSync(join(privateBase, 'handoffs'));
    assert.deepEqual(savedFiles, ['run-131-export.json']);
    const saved = join(privateBase, 'handoffs', savedFiles[0]);
    assert.deepEqual(JSON.parse(readFileSync(saved, 'utf8')), outcome);
    if (process.platform !== 'win32') assert.equal(statSync(saved).mode & 0o077, 0);
    assert.equal(prepareCleanReleaseOutput(outcome, opts).privateHandoffSaved, false);
    assert.deepEqual(JSON.parse(readFileSync(saved, 'utf8')), outcome);
    assert.equal(prepareCleanReleaseOutput(outcome, { ...opts, shareableRequested: false }), outcome);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a shareable handoff cannot write outside owned private release paths', t => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidencePath = join(privateBase, 'evidence', 'run-131-failed', 'verification.json');
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, '{}');
    const outcome = { schemaVersion: 'rightsreceipt-clean-release-checkout-v1',
      status: 'failed', code: 'release_verification_failed', commit, evidencePath, checkoutPath: root };
    const opts = { shareableRequested: true, privateBase };
    const unrelated = join(root, 'different', 'verification.json');
    assert.equal(prepareCleanReleaseOutput({ ...outcome, evidencePath: unrelated }, opts).privateHandoffSaved, false);
    assert.equal(prepareCleanReleaseOutput({ ...outcome, evidencePath: join(root, 'outside.json') }, opts).privateHandoffSaved, false);
    const noEvidence = prepareCleanReleaseOutput({ status: 'failed', code: 'node_22_required' }, opts);
    assert.equal(noEvidence.code, 'node_22_required');
    assert.equal('privateHandoffSaved' in noEvidence, false);
    mkdirSync(join(privateBase), { recursive: true });
    const external = join(root, 'outside');
    mkdirSync(external);
    try { symlinkSync(external, join(privateBase, 'handoffs'), 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.diagnostic('Symlinks unavailable'); return; }
      throw error;
    }
    assert.equal(prepareCleanReleaseOutput(outcome, opts).privateHandoffSaved, false);
    assert.deepEqual(readdirSync(external), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('shareable CLI refuses unsupported Node before release work without exposing paths', t => {
  if (process.versions.node.startsWith('22.')) { t.skip('Full release execution is Node 22-only'); return; }
  for (const args of [['--shareable'], ['--export-public', '--shareable']]) {
    const result = spawnSync(process.execPath, [script, ...args],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, 'rightsreceipt-clean-release-handoff-v1');
    assert.equal(report.status, 'failed');
    assert.equal(report.code, 'node_22_required');
    assert.equal(report.releaseStatus, 'not_verified');
    assert.equal(report.publicExportStatus,
      args.includes('--export-public') ? 'not_verified' : 'not_requested');
    assert.ok(!('checkoutPath' in report) && !('evidencePath' in report) && !('commit' in report));
    assert.equal(result.stderr, '');
  }
});

test('shareable CLI rejects duplicated or unknown flags before filesystem work', () => {
  for (const args of [['--shareable', '--shareable'], ['--export-public', '--unknown']]) {
    const result = spawnSync(process.execPath, [script, ...args],
      { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).code, 'invalid_arguments');
  }
});

test('local clone freezes the committed source and excludes ignored and untracked files', () => {
  const root = fixture();
  try {
    const sourceCommit = git(root, 'rev-parse', 'HEAD');
    writeFileSync(join(root, '.env'), 'PRIVATE_TOKEN=fixture-only\n');
    writeFileSync(join(root, 'untracked-note.txt'), 'not part of release\n');
    const result = createCleanReleaseCheckout(root, join(root, '.data', 'clean-release'));
    assert.match(result.commit, SHA);
    assert.equal(result.commit, sourceCommit);
    assert.equal(git(result.checkout, 'rev-parse', 'HEAD'), sourceCommit);
    assert.equal(git(result.checkout, 'status', '--porcelain=v1', '--untracked-files=all'), '');
    assert.equal(git(result.checkout, 'branch', '--show-current'), '');
    assert.equal(existsSync(join(result.checkout, '.env')), false);
    assert.equal(existsSync(join(result.checkout, 'untracked-note.txt')), false);
    assert.equal(readFileSync(join(result.checkout, 'package.json'), 'utf8'), '{"private":true}\n');
    assert.equal(existsSync(join(root, '.env')), true);
    assert.equal(existsSync(join(root, 'untracked-note.txt')), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('source must be a repository root with a committed revision', () => {
  const root = fixture();
  try {
    mkdirSync(join(root, 'subdir'));
    assert.throws(() => createCleanReleaseCheckout(join(root, 'subdir'), join(root, '.data', 'bad')),
      error => error.code === 'source_not_repository_root');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('release result is bound to the expected commit and owned evidence directory', () => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidence = join(privateBase, 'evidence', 'run-1', 'verification.json');
    mkdirSync(dirname(evidence), { recursive: true });
    writeFileSync(evidence, JSON.stringify(passingFullReleaseRecord(root, evidence, commit)));
    const summary = {schemaVersion:'rightsreceipt-release-candidate-v1',status:'passed',mode:'full',commit,evidencePath:evidence};
    const input = { result: {status:0,stdout:JSON.stringify(summary)}, commit, privateBase, checkout: root };
    assert.equal(validateCleanReleaseResult(input).status, 'passed');
    assert.equal(validateCleanReleaseResult(input).diagnostics, undefined);
    assert.equal(validateCleanReleaseResult({...input,result:{status:1,stdout:JSON.stringify(summary)}}).status, 'failed');
    assert.throws(() => validateCleanReleaseResult({...input,commit:'0'.repeat(40)}),
      error => error.code === 'release_result_invalid');
    assert.throws(() => validateCleanReleaseResult({...input,result:{status:0,stdout:'not-json'}}),
      error => error.code === 'release_result_invalid');
    assert.throws(() => validateCleanReleaseResult({...input,result:{status:0,stdout:'null'}}),
      error => error.code === 'release_result_invalid');
    assert.throws(() => validateCleanReleaseResult({...input,result:{status:0,stdout:JSON.stringify({...summary,evidencePath:join(root,'other.json')})}}),
      error => error.code === 'release_result_invalid');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a claimed passing release requires all four exact commands and judge evidence', () => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidence = join(privateBase, 'evidence', 'run-four-gates', 'verification.json');
    mkdirSync(dirname(evidence), { recursive: true });
    const summary = { schemaVersion: 'rightsreceipt-release-candidate-v1',
      status: 'passed', mode: 'full', commit, evidencePath: evidence };
    const input = { result: { status: 0, stdout: JSON.stringify(summary) },
      commit, privateBase, checkout: root };
    const valid = passingFullReleaseRecord(root, evidence, commit);
    const invalid = error => error.code === 'release_result_invalid';
    const cases = [
      { ...valid, commands: [] },
      { ...valid, commands: valid.commands.slice(0, 3) },
      { ...valid, commands: [...valid.commands, valid.commands[0]] },
      { ...valid, commands: valid.commands.map((cmd, i) => i === 1 ? { ...cmd, exitCode: 1 } : cmd) },
      { ...valid, commands: valid.commands.map((cmd, i) => i === 2 ?
        { ...cmd, command: ['corepack', 'pnpm', 'test'] } : cmd) },
      { ...valid, commands: valid.commands.map((cmd, i) => i === 3 ?
        { ...cmd, stdoutSha256: 'not-a-hash' } : cmd) },
      { ...valid, judgeEvidence: null },
      { ...valid, judgeEvidence: { root: 'unrelated' } },
      { ...valid, preflightFailures: ['checkout_not_clean'] },
      { ...valid, packageManager: 'pnpm@latest' },
      { ...valid, node: '22.0.0' },
    ];
    for (const record of cases) {
      writeFileSync(evidence, JSON.stringify(record));
      assert.throws(() => validateCleanReleaseResult(input), invalid);
    }
    writeFileSync(evidence, JSON.stringify(valid));
    assert.equal(validateCleanReleaseResult(input).status, 'passed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('passing stage hashes must match the original regular bounded log files', t => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidence = join(privateBase, 'evidence', 'run-log-hashes', 'verification.json');
    const valid = passingFullReleaseRecord(root, evidence, commit);
    const summary = { schemaVersion: valid.schemaVersion, status: 'passed', mode: 'full',
      commit, evidencePath: evidence };
    writeFileSync(evidence, JSON.stringify(valid));
    const input = { result: { status: 0, stdout: JSON.stringify(summary) },
      commit, privateBase, checkout: root };
    const invalid = error => error.code === 'release_result_invalid';
    assert.equal(validateCleanReleaseResult(input).status, 'passed');

    const stageName = valid.commands[1].command[0].replace(/[^A-Za-z0-9._-]/gu, '_');
    const log = join(dirname(evidence), '02-' + stageName + '.stdout.log');
    const original = readFileSync(log);
    writeFileSync(log, 'tampered after verifier wrote hash');
    assert.throws(() => validateCleanReleaseResult(input), invalid);
    rmSync(log);
    assert.throws(() => validateCleanReleaseResult(input), invalid);
    writeFileSync(log, original);
    assert.equal(validateCleanReleaseResult(input).status, 'passed');

    writeFileSync(log, 'x'.repeat(16 * 1024 * 1024 + 1));
    assert.throws(() => validateCleanReleaseResult(input), invalid);
    rmSync(log);
    const outside = join(root, 'unrelated.log');
    writeFileSync(outside, original);
    try { symlinkSync(outside, log, 'file'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
        t.diagnostic('Symlink test unavailable on this filesystem');
        return;
      }
      throw error;
    }
    assert.throws(() => validateCleanReleaseResult(input), invalid);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed release exposes its first stage and allowlisted failure codes without private logs', () => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidence = join(privateBase, 'evidence', 'run-failed', 'verification.json');
    mkdirSync(dirname(evidence), { recursive: true });
    writeFileSync(evidence, JSON.stringify({
      schemaVersion: 'rightsreceipt-release-candidate-v1', status: 'failed', mode: 'full', commit,
      preflightFailures: [
        'release_stage_3_timed_out', 'release_stage_3_timed_out',
        'private_PAYPAL_SECRET=must-not-be-printed',
      ],
      commands: [
        { exitCode: 0 }, { exitCode: 0 },
        { exitCode: 1, stdout: 'private-payment-details', stderr: 'private-api-token' },
      ],
    }));
    const summary = { schemaVersion: 'rightsreceipt-release-candidate-v1',
      status: 'failed', mode: 'full', commit, evidencePath: evidence };
    const outcome = validateCleanReleaseResult({
      result: { status: 1, stdout: JSON.stringify(summary) }, commit, privateBase,
    });
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.code, 'release_verification_failed');
    assert.deepEqual(outcome.diagnostics, {
      failureCodes: ['release_stage_3_timed_out'],
      unknownFailureCodesPresent: true,
      firstFailedStage: 3,
    });
    assert.doesNotMatch(JSON.stringify(outcome), /private_PAYPAL_SECRET|private-payment-details|private-api-token/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed preflight without release stages remains actionable and malformed evidence is blocked', () => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidence = join(privateBase, 'evidence', 'run-preflight', 'verification.json');
    mkdirSync(dirname(evidence), { recursive: true });
    const summary = { schemaVersion: 'rightsreceipt-release-candidate-v1',
      status: 'failed', mode: 'full', commit, evidencePath: evidence };
    const input = { result: { status: 1, stdout: JSON.stringify(summary) }, commit, privateBase };
    const failedRecord = {
      schemaVersion: summary.schemaVersion, status: 'failed', mode: 'full', commit,
      preflightFailures: ['lockfile_missing', 'unsupported_node'], commands: [],
    };
    writeFileSync(evidence, JSON.stringify(failedRecord));
    assert.deepEqual(validateCleanReleaseResult(input).diagnostics, {
      failureCodes: ['lockfile_missing', 'unsupported_node'],
      unknownFailureCodesPresent: false,
      firstFailedStage: null,
    });
    writeFileSync(evidence, 'null');
    assert.throws(() => validateCleanReleaseResult(input), error => error.code === 'release_result_invalid');
    writeFileSync(evidence, JSON.stringify({ ...failedRecord, commit: '0'.repeat(40) }));
    assert.throws(() => validateCleanReleaseResult(input), error => error.code === 'release_result_invalid');
    writeFileSync(evidence, JSON.stringify({ ...failedRecord, mode: 'preflight' }));
    assert.throws(() => validateCleanReleaseResult(input), error => error.code === 'release_result_invalid');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a symlinked verification record cannot authorize a clean release', t => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidence = join(privateBase, 'evidence', 'run-symlink', 'verification.json');
    const target = join(root, 'alternate-verification.json');
    mkdirSync(dirname(evidence), { recursive: true });
    writeFileSync(target, JSON.stringify({
      schemaVersion: 'rightsreceipt-release-candidate-v1', status: 'passed', mode: 'full', commit,
    }));
    try { symlinkSync(target, evidence, 'file'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('Symlink creation unavailable'); return; }
      throw error;
    }
    const summary = { schemaVersion: 'rightsreceipt-release-candidate-v1', status: 'passed',
      mode: 'full', commit, evidencePath: evidence };
    assert.throws(() => validateCleanReleaseResult({
      result: { status: 0, stdout: JSON.stringify(summary) }, commit, privateBase,
    }), error => error.code === 'release_result_invalid');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a symlinked evidence run directory cannot authorize a clean release', t => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidenceRoot = join(privateBase, 'evidence');
    const alternate = join(root, 'alternate-run');
    mkdirSync(evidenceRoot, { recursive: true });
    mkdirSync(alternate);
    writeFileSync(join(alternate, 'verification.json'), JSON.stringify({
      schemaVersion: 'rightsreceipt-release-candidate-v1', status: 'passed', mode: 'full', commit,
    }));
    try { symlinkSync(alternate, join(evidenceRoot, 'run-linked'), 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('Directory symlink creation unavailable'); return; }
      throw error;
    }
    const summary = { schemaVersion: 'rightsreceipt-release-candidate-v1', status: 'passed',
      mode: 'full', commit, evidencePath: join(evidenceRoot, 'run-linked', 'verification.json') };
    assert.throws(() => validateCleanReleaseResult({
      result: { status: 0, stdout: JSON.stringify(summary) }, commit, privateBase,
    }), error => error.code === 'release_result_invalid');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a symlinked private evidence root cannot authorize a clean release', t => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const alternate = join(root, 'alternate-evidence');
    const evidenceRoot = join(privateBase, 'evidence');
    const evidence = join(evidenceRoot, 'run-other', 'verification.json');
    mkdirSync(join(alternate, 'run-other'), { recursive: true });
    mkdirSync(privateBase, { recursive: true });
    writeFileSync(join(alternate, 'run-other', 'verification.json'), JSON.stringify({
      schemaVersion: 'rightsreceipt-release-candidate-v1', status: 'passed', mode: 'full', commit,
    }));
    try { symlinkSync(alternate, evidenceRoot, 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('Directory symlink creation unavailable'); return; }
      throw error;
    }
    const summary = { schemaVersion: 'rightsreceipt-release-candidate-v1', status: 'passed',
      mode: 'full', commit, evidencePath: evidence };
    assert.throws(() => validateCleanReleaseResult({
      result: { status: 0, stdout: JSON.stringify(summary) }, commit, privateBase,
    }), error => error.code === 'release_result_invalid');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('oversized, deeply nested and renamed evidence files cannot authorize a release', () => {
  const root = fixture();
  try {
    const commit = git(root, 'rev-parse', 'HEAD');
    const privateBase = join(root, '.data', 'clean-release');
    const evidence = join(privateBase, 'evidence', 'run-oversized', 'verification.json');
    mkdirSync(dirname(evidence), { recursive: true });
    writeFileSync(evidence, 'x'.repeat(512 * 1024 + 1));
    const summary = { schemaVersion: 'rightsreceipt-release-candidate-v1', status: 'passed',
      mode: 'full', commit, evidencePath: evidence };
    const input = { result: { status: 0, stdout: JSON.stringify(summary) }, commit, privateBase };
    const invalid = error => error.code === 'release_result_invalid';
    assert.throws(() => validateCleanReleaseResult(input), invalid);
    const nested = join(privateBase, 'evidence', 'run-nested', 'unexpected', 'verification.json');
    mkdirSync(dirname(nested), { recursive: true });
    writeFileSync(nested, '{}');
    assert.throws(() => validateCleanReleaseResult({ ...input,
      result: { status: 0, stdout: JSON.stringify({ ...summary, evidencePath: nested }) } }), invalid);
    const renamed = join(dirname(evidence), 'other.json');
    writeFileSync(renamed, '{}');
    assert.throws(() => validateCleanReleaseResult({ ...input,
      result: { status: 0, stdout: JSON.stringify({ ...summary, evidencePath: renamed }) } }), invalid);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function syntheticPublicExport(root) {
  const commit=git(root,'rev-parse','HEAD');
  const privateBase=join(root,'.data','clean-release');
  const evidencePath=join(privateBase,'evidence','run-1','verification.json');
  mkdirSync(dirname(evidencePath),{recursive:true});
  writeFileSync(evidencePath,JSON.stringify({schemaVersion:'rightsreceipt-release-candidate-v1',status:'passed',commit}));
  const output=join(privateBase,'exports','run-1');
  const repositoryPath=join(output,'repo');
  mkdirSync(repositoryPath,{recursive:true});
  for(const name of ['.gitignore','package.json']) copyFileSync(join(root,name),join(repositoryPath,name));
  git(repositoryPath,'init','-q','-b','main');
  git(repositoryPath,'config','user.name','nolankido');
  git(repositoryPath,'config','user.email','212063387+nolankido@users.noreply.github.com');
  git(repositoryPath,'add','.');
  git(repositoryPath,'commit','-qm','synthetic public export');
  const publicCommit=git(repositoryPath,'rev-parse','HEAD');
  const tree=git(root,'rev-parse','HEAD^{tree}');
  assert.equal(git(repositoryPath,'rev-parse','HEAD^{tree}'),tree);
  const manifestPath=join(output,'manifest.json');
  const manifest={
    schemaVersion:'rightsreceipt-public-export-v1',status:'passed',sourceCommit:commit,sourceTree:tree,
    publicCommit,publicTree:tree,exactTreeMatch:true,repositoryDirectory:'repo',
    releaseVerificationSha256:createHash('sha256').update(readFileSync(evidencePath)).digest('hex'),
    sourceSnapshotAuditSha256:'a'.repeat(64),publicHistoryAuditSha256:'b'.repeat(64),
    publicJudgeExperience:{status:'passed',mode:'offline',scenarioCount:3,resetCount:3,
      externalRequests:0,paymentEvidence:'simulated_only',aiModelExecution:'real_local_inference',
      aiSyntheticRequestCount:2,aiRightsFieldComparisons:24,aiContradictionWarningVisible:true,
      aiModelArtifactSha256:'c'.repeat(64)},
    publicAuthorName:'nolankido',publicAuthorEmail:'212063387+nolankido@users.noreply.github.com',
  };
  writeFileSync(manifestPath,JSON.stringify(manifest));
  const summary={schemaVersion:'rightsreceipt-public-export-v1',status:'passed',sourceCommit:commit,
    publicCommit,tree,repositoryPath,manifestPath};
  return {result:{status:0,stdout:JSON.stringify(summary)},commit,checkout:root,privateBase,evidencePath,
    repositoryPath,manifestPath,manifest,summary};
}

test('optional public export is bound to the same release evidence, Git tree and one-commit repository', () => {
  const root=fixture();
  try {
    const input=syntheticPublicExport(root);
    const accepted=validateCleanPublicExportResult(input);
    assert.equal(accepted.status,'passed');
    assert.equal(accepted.publicCommit,input.summary.publicCommit);
    assert.equal(accepted.publicTree,input.summary.tree);
    assert.equal(accepted.repositoryPath,input.repositoryPath);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('optional public export rejects a skipped or fabricated judge execution gate', () => {
  const root=fixture();
  try {
    const input=syntheticPublicExport(root);
    for(const publicJudgeExperience of [
      {status:'not_requested'},
      {...input.manifest.publicJudgeExperience,paymentEvidence:'paypal_paid'},
      {...input.manifest.publicJudgeExperience,aiContradictionWarningVisible:false},
    ]) {
      writeFileSync(input.manifestPath,JSON.stringify({...input.manifest,publicJudgeExperience}));
      assert.throws(()=>validateCleanPublicExportResult(input),
        error=>error.code==='public_export_result_invalid');
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('optional public export rejects failed stages, external paths and false manifest identity', () => {
  const root=fixture();
  try {
    const input=syntheticPublicExport(root);
    const invalid=error=>error.code==='public_export_result_invalid';
    assert.throws(()=>validateCleanPublicExportResult({...input,result:{status:1,stdout:input.result.stdout}}),
      error=>error.code==='public_export_failed');
    assert.throws(()=>validateCleanPublicExportResult({...input,result:{status:0,stdout:'invalid'}}),invalid);
    assert.throws(()=>validateCleanPublicExportResult({...input,result:{status:0,
      stdout:JSON.stringify({...input.summary,repositoryPath:root})}}),invalid);
    writeFileSync(input.manifestPath,JSON.stringify({...input.manifest,releaseVerificationSha256:'c'.repeat(64)}));
    assert.throws(()=>validateCleanPublicExportResult(input),invalid);
    writeFileSync(input.manifestPath,JSON.stringify(input.manifest));
    git(input.repositoryPath,'remote','add','origin','https://example.test/unpublished.git');
    assert.throws(()=>validateCleanPublicExportResult(input),invalid);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('optional public export refuses a repository whose public tree differs from verified source', () => {
  const root=fixture();
  try {
    const input=syntheticPublicExport(root);
    writeFileSync(join(input.repositoryPath,'unexpected.txt'),'modified source\n');
    git(input.repositoryPath,'add','unexpected.txt');
    git(input.repositoryPath,'commit','-qm','extra commit');
    assert.throws(()=>validateCleanPublicExportResult(input),error=>error.code==='public_export_result_invalid');
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('optional public export refuses a wrong branch name, tag or custom reference', () => {
  const root=fixture();
  try {
    const input=syntheticPublicExport(root);
    const invalid=error=>error.code==='public_export_result_invalid';
    git(input.repositoryPath,'branch','-m','not-main');
    assert.throws(()=>validateCleanPublicExportResult(input),invalid);
    git(input.repositoryPath,'branch','-m','main');
    git(input.repositoryPath,'tag','preexisting');
    assert.throws(()=>validateCleanPublicExportResult(input),invalid);
    git(input.repositoryPath,'tag','-d','preexisting');
    git(input.repositoryPath,'update-ref','refs/notes/preexisting',input.summary.publicCommit);
    assert.throws(()=>validateCleanPublicExportResult(input),invalid);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('optional public export rejects personal Git author even when manifest and tree match', () => {
  const root=fixture();
  try {
    const input=syntheticPublicExport(root);
    git(input.repositoryPath,'-c','user.name=Private Developer',
      '-c','user.email=private@example.test','commit','--amend','--no-edit','--reset-author');
    const rewritten=git(input.repositoryPath,'rev-parse','HEAD');
    writeFileSync(input.manifestPath,JSON.stringify({...input.manifest,publicCommit:rewritten}));
    const result={status:0,stdout:JSON.stringify({...input.summary,publicCommit:rewritten})};
    assert.throws(()=>validateCleanPublicExportResult({...input,result}),
      error=>error.code==='public_export_result_invalid');
  } finally { rmSync(root,{recursive:true,force:true}); }
});
