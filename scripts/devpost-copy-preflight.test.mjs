import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateDevpostCopy } from './devpost-copy-preflight.mjs';

const draft = readFileSync(new URL('../docs/submission/DEVPOST_DRAFT.md', import.meta.url), 'utf8');
const script = fileURLToPath(new URL('./devpost-copy-preflight.mjs', import.meta.url));
const complete = draft
  .replace('[PUBLIC_REPOSITORY_URL]', 'https://github.com/nolankido/rightsreceipt-submission')
  .replace('[PUBLIC_UNDER_3_MINUTE_VIDEO_URL]', 'https://youtu.be/AbC123xYz09');

test('actual draft remains blocked until real public links replace placeholders', () => {
  const result = evaluateDevpostCopy(draft);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, [
    'public_repository_url_missing_or_invalid',
    'public_video_url_missing_or_invalid',
    'unresolved_placeholders',
  ]);
  assert.equal(result.checks.requiredSections, 15);
  assert.ok(!JSON.stringify(result).includes('Harbor After Rain'));
});

test('complete formatted copy can pass structure without claiming submission', () => {
  const result = evaluateDevpostCopy(complete);
  assert.equal(result.status, 'copy_ready_for_manual_review');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.checks.publicRepositoryUrlPlausible, true);
  assert.equal(result.checks.publicVideoUrlPlausible, true);
  assert.match(result.limitation, /does not prove/iu);
});

test('fenced and HTML-commented examples cannot impersonate rendered Devpost sections', () => {
  for (const hidden of [
    '```markdown\n' + complete + '\n```\n',
    '~~~~markdown\n' + complete + '\n~~~~\n',
    '<!--\n' + complete + '\n-->\n',
  ]) {
    const result = evaluateDevpostCopy(hidden);
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockers.includes('required_section_missing'));
    assert.ok(result.blockers.includes('public_repository_url_missing_or_invalid'));
    assert.ok(result.blockers.includes('public_video_url_missing_or_invalid'));
  }
});

test('a repeated required heading blocks even when both copies contain plausible links', () => {
  const doubled = complete.replace('## Video\n', '## Video\nSee the full demonstration.\n\n## Video\n');
  const result = evaluateDevpostCopy(doubled);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('duplicate_required_section'));
});

test('real submission headings remain valid beside fenced Markdown examples', () => {
  const annotated = complete.replace('## Video\n',
    '````markdown\n## Video\nYouTube: https://youtu.be/AbC123xYz09\n```\n````\n\n## Video\n');
  assert.equal(evaluateDevpostCopy(annotated).status, 'copy_ready_for_manual_review');
});

test('Devpost instructions bind the real AI proof to honest simulated-payment claims', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(manifest.scripts['judge:console:verify'], /pnpm judge:ai:proof:verify && pnpm judge:ai:proof/u);
  assert.match(draft, /scripts\/judge-ai-proof\.mjs/u);
  assert.match(draft, /modelExecution: "real_local_inference"/u);
  assert.match(draft, /paymentEvidence: "none"/u);
  assert.match(draft, /Run read-only AI diagnostic/u);
  assert.match(draft, /Run application rehearsal/u);
  assert.match(draft, /genuine payment acceptance is a separate release gate/iu);
  assert.doesNotMatch(draft, /PayPal-paid invoices/iu);
});

test('plain URLs and single-link Markdown formatting are both supported', () => {
  const markdown = complete
    .replace('https://github.com/nolankido/rightsreceipt-submission',
      '[Public Source](https://github.com/nolankido/rightsreceipt-submission)')
    .replace('https://youtu.be/AbC123xYz09',
      '[Watch Demo](https://www.youtube.com/watch?v=AbC123xYz09)');
  assert.equal(evaluateDevpostCopy(markdown).status, 'copy_ready_for_manual_review');
});

test('private source repository and invalid video links cannot pass', () => {
  for (const bad of [
    'https://github.com/nolankido/rightsReceipt',
    'http://github.com/nolankido/rightsreceipt-submission',
    'https://github.com/nolankido/rightsreceipt-submission/tree/main',
    'https://github.com/owner/repo',
    'https://github.com/nolankido/rightsreceipt-submission?token=fixture',
  ]) {
    const candidate = complete.replace('https://github.com/nolankido/rightsreceipt-submission', bad);
    assert.ok(evaluateDevpostCopy(candidate).blockers.includes('public_repository_url_missing_or_invalid'));
  }
  for (const bad of [
    'https://youtu.be/AbC123xYz0',
    'https://www.youtube.com/watch?v=AbC123xYz09&t=60',
    'https://youtube.com/shorts/AbC123xYz09',
    'http://youtu.be/AbC123xYz09',
    'https://youtu.be/AbC123xYz09?si=fixture',
  ]) {
    const candidate = complete.replace('https://youtu.be/AbC123xYz09', bad);
    assert.ok(evaluateDevpostCopy(candidate).blockers.includes('public_video_url_missing_or_invalid'));
  }
});

test('omitted required sections and disclosure are separate blockers', () => {
  const missing = complete.replace(/^## How AI is used\r?\n[\s\S]*?(?=^## How PayPal is used)/mu, '');
  const result = evaluateDevpostCopy(missing);
  assert.ok(result.blockers.includes('required_section_missing'));
  assert.ok(result.blockers.includes('platform_and_ai_disclosure_missing'));
});

test('placeholder text anywhere in copy blocks even with both plausible URLs', () => {
  const result = evaluateDevpostCopy(complete + '\n\nInternal note: [TBD_PUBLIC_LINK]\n');
  assert.deepEqual(result.blockers, ['unresolved_placeholders']);
});

test('malformed, empty and oversized copy fail closed with fixed codes', () => {
  for (const input of ['', null, 'a'.repeat(66000)]) {
    const result = evaluateDevpostCopy(input);
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockers.includes('copy_invalid'));
  }
});

test('CLI emits only fixed blocker codes, no draft contents or URLs', () => {
  // Assert CLI output independently of experimental Node runtime warnings.
  const result = spawnSync(process.execPath, ['--no-warnings', script], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  const outcome = JSON.parse(result.stdout);
  assert.equal(outcome.status, 'blocked');
  assert.ok(outcome.blockers.includes('unresolved_placeholders'));
  assert.ok(!result.stdout.includes('Harbor After Rain'));
  assert.ok(!result.stdout.includes('https://'));
  assert.equal(result.stderr, '');
});

test('CLI rejects arbitrary file paths and unsupported arguments safely', () => {
  for (const args of [
    ['--file', '/tmp/secret-evidence.json'],
    ['--file', '../other-copy.md'],
    ['--no-such-argument'],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args],
      { encoding: 'utf8', windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes('/tmp/secret-evidence.json'));
    assert.ok(!result.stdout.includes('other-copy.md'));
    assert.ok(['invalid_arguments', 'copy_file_unreadable'].includes(JSON.parse(result.stdout).blockers[0]));
  }
  const help = spawnSync(process.execPath, [script, '--help'],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Offline copy structure/u);
});
