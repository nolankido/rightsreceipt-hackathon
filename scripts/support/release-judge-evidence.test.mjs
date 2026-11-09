import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseJudgeEvidenceValid, releaseJudgeGate } from './release-judge-evidence.mjs';
import { makeReleaseJudgeFixture, releaseJudgeFixtureHtml } from './release-judge-fixture.mjs';
import { serializeJudgeRehearsalReport } from './judge-rehearsal-report.mjs';
import { judgeConsoleEvidenceValid } from './judge-console-evidence.mjs';

const commit = 'a'.repeat(40), node = '22.16.0', fingerprint = 'b'.repeat(64);
const evidence = () => makeReleaseJudgeFixture({ commit, node });
const html = releaseJudgeFixtureHtml;

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), 'rr-judge-evidence-'));
  const directory = join(parent, 'judge');
  mkdirSync(directory);
  const runDirectory = join(directory, 'run-abc123');
  mkdirSync(runDirectory);
  const e = evidence();
  writeFileSync(join(runDirectory, 'evidence.json'), serializeJudgeRehearsalReport(e));
  writeFileSync(join(runDirectory, 'report.html'), html(e));
  return { parent, directory, runDirectory, e };
}
const check = dir => releaseJudgeEvidenceValid(dir, { commit, node });

test('full release gate rejects missing, forged and incomplete judge records', () => {
  const f = fixture();
  try {
    assert.equal(releaseJudgeGate(f.parent, commit, node), true);
    assert.equal(releaseJudgeGate(f.parent, 'f'.repeat(40), node), false);
    assert.equal(releaseJudgeGate(f.parent, commit, '22.12.0'), false);
    assert.equal(releaseJudgeGate(join(f.parent, 'missing-release'), commit, node), false);
    rmSync(join(f.runDirectory, 'evidence.json'));
    assert.equal(releaseJudgeGate(f.parent, commit, node), false);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});

test('accepts source-bound three-journey local evidence and labeled HTML', () => {
  const f = fixture();
  try { assert.equal(check(f.directory), true); }
  finally { rmSync(f.parent, { recursive: true, force: true }); }
});
for (const [name, mutate] of [
  ['wrong checkout revision', e => { e.sourceRevision = 'f'.repeat(40); }],
  ['dirty rehearsal source', e => { e.sourceClean = false; }],
  ['wrong Node version', e => { e.runtime = 'v24.0.0'; }],
  ['failed recovery', e => { e.scenarios[1].status = 'failed'; }],
  ['invented quote', e => { e.scenarios[0].summary.quoteCents = 1; }],
  ['missing reset', e => { e.resets.pop(); }],
  ['real network requests', e => { e.isolation.externalRequests = 1; }],
  ['credentials used', e => { e.isolation.credentialsUsed = true; }],
]) {
  test('rejects ' + name, () => {
    const f = fixture();
    try {
      mutate(f.e);
      writeFileSync(join(f.runDirectory, 'evidence.json'), JSON.stringify(f.e, null, 2) + '\n');
      assert.equal(check(f.directory), false);
    } finally { rmSync(f.parent, { recursive: true, force: true }); }
  });
}
test('previous minimum console contract is insufficient for release proof', () => {
  const f = fixture();
  try {
    f.e.scenarios[0].steps = [{ id: 'complete' }];
    assert.equal(judgeConsoleEvidenceValid(f.e), true);
    writeFileSync(join(f.runDirectory, 'evidence.json'), JSON.stringify(f.e, null, 2) + '\n');
    assert.equal(check(f.directory), false);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});

for (const [name, mutate] of [
  ['abbreviated success trace', e => { e.scenarios[0].steps = [{ id: 'complete' }]; }],
  ['reordered recovery trace', e => { e.scenarios[1].steps.reverse(); }],
  ['fabricated durable row count', e => { e.scenarios[0].summary.durableRows.permissions = 99; }],
  ['unknown private data field', e => { e.scenarios[0].rawPaymentToken = 'not-real'; }],
  ['mismatched repeat outcome hash', e => { e.repeatability.normalizedOutcomeSha256 = 'f'.repeat(64); }],
  ['premature authority from provider status', e => {
    e.scenarios[0].steps.find(step => step.id === 'provider_paid').evidence.permissionRows = 1;
  }],
  ['fabricated baseline table names', e => { e.baseline.rows = Object.fromEntries(
    Array.from({ length: 33 }, (_, i) => ['fake_table_' + i, 0])); }],
]) {
  test('rejects semantically invalid ' + name, () => {
    const f = fixture();
    try {
      mutate(f.e);
      writeFileSync(join(f.runDirectory, 'evidence.json'), JSON.stringify(f.e, null, 2) + '\n');
      assert.equal(check(f.directory), false);
    } finally { rmSync(f.parent, { recursive: true, force: true }); }
  });
}
test('rejects noncanonical but parseable judge evidence', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.runDirectory, 'evidence.json'), JSON.stringify(f.e));
    assert.equal(check(f.directory), false);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});

test('rejects missing, additional, empty and oversized artifacts', () => {
  const f = fixture();
  try {
    rmSync(join(f.runDirectory, 'report.html')); assert.equal(check(f.directory), false);
    writeFileSync(join(f.runDirectory, 'report.html'), ''); assert.equal(check(f.directory), false);
    writeFileSync(join(f.runDirectory, 'report.html'), html(f.e));
    writeFileSync(join(f.runDirectory, 'extra.txt'), 'unexpected'); assert.equal(check(f.directory), false);
    rmSync(join(f.runDirectory, 'extra.txt'));
    writeFileSync(join(f.runDirectory, 'report.html'), 'x'.repeat(1024 * 1024 + 1));
    assert.equal(check(f.directory), false);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});
test('rejects HTML that omits the simulated-payment disclosure or source fingerprint', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.runDirectory, 'report.html'), html(f.e).replace('simulated locally.', 'verified paid.'));
    assert.equal(check(f.directory), false);
    writeFileSync(join(f.runDirectory, 'report.html'), html(f.e).replace(fingerprint, 'x'.repeat(64)));
    assert.equal(check(f.directory), false);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});
test('rejects appended or altered HTML even when all disclosure phrases remain', () => {
  const f = fixture();
  try {
    const original = html(f.e);
    const report = join(f.runDirectory, 'report.html');
    writeFileSync(report, original + '\n<!-- extra markup -->\n');
    assert.equal(check(f.directory), false, 'extra content must not pass');
    writeFileSync(report, original.replace('The local rehearsal passed.', 'The local rehearsal passed. But the payment failed.'));
    assert.equal(check(f.directory), false, 'modified success narrative must not pass');
    writeFileSync(report, original);
    assert.equal(check(f.directory), true, 'original producer output remains valid');
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});

test('rejects symlinked evidence file and symlinked judge directory', t => {
  const f = fixture();
  const symlink = (target, path, type) => {
    try { symlinkSync(target, path, type); return true; }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
        t.skip('Creating symlinks requires OS privileges unavailable in this test environment.');
        return false;
      }
      throw error;
    }
  };
  try {
    const source = join(f.parent, 'outside.json');
    writeFileSync(source, readFileSync(join(f.runDirectory, 'evidence.json')));
    rmSync(join(f.runDirectory, 'evidence.json'));
    if (!symlink(source, join(f.runDirectory, 'evidence.json'))) return;
    assert.equal(check(f.directory), false);
    assert.equal(check(join(f.parent, 'missing')), false);
    if (!symlink(f.directory, join(f.parent, 'linked-dir'), 'dir')) return;
    assert.equal(check(join(f.parent, 'linked-dir')), false);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});
