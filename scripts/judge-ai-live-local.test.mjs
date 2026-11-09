import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SAMPLE_REQUEST, runJudgeAiDemo } from './judge-ai-demo.mjs';
import { loadVerifiedPortableModel } from '../packages/ai-runtime/src/portable-model.ts';

const artifactText = readFileSync(new URL('../data/model/v1/artifact.json', import.meta.url), 'utf8');
const training = JSON.parse(readFileSync(new URL('../data/model/v1/training-report.json', import.meta.url), 'utf8'));
const expectedSha = training.trainingArtifactSha256;
const contradictoryRequest = SAMPLE_REQUEST.replace('Territory is the US and Canada.',
  'Target the US and Canada. Rights should be for Germany only.');

test('actual shipped model artifact and local TypeScript inference match their committed identity', async () => {
  assert.equal(createHash('sha256').update(artifactText).digest('hex'), expectedSha);
  const model = await loadVerifiedPortableModel(artifactText, expectedSha);
  const complete = model.predict(SAMPLE_REQUEST);
  assert.equal(complete.modelId, 'rightsreceipt-synthetic-lexical');
  assert.equal(complete.artifactSha256, expectedSha);
  assert.equal(complete.status, 'uncalibrated_review_only');
  assert.equal(complete.reviewRequired, true);
  assert.equal(complete.quoteEligible, false);
  assert.deepEqual(complete.permittedActions, []);
  assert.equal(complete.fields.length, 12);
  const territories = complete.fields.find(field => field.fieldName === 'territories');
  assert.deepEqual(territories?.label, {
    resolutionState: 'resolved', normalizedValue: ['US', 'CA'],
  });
});

test('all six frozen reference examples reproduce 72 exact field labels and decision scores', async () => {
  const reference = JSON.parse(readFileSync(new URL('../data/model/v1/reference-predictions.json', import.meta.url), 'utf8'));
  assert.equal(reference.artifactSha256, expectedSha);
  assert.equal(reference.records.length, 6);
  const model = await loadVerifiedPortableModel(artifactText, expectedSha);
  let count = 0;
  for (const record of reference.records) {
    const actual = model.predict(record.inputText);
    assert.equal(actual.fields.length, 12);
    for (const [index, expectedField] of record.fields.entries()) {
      const field = actual.fields[index];
      assert.equal(field.fieldName, expectedField.fieldName);
      assert.deepEqual(field.label, expectedField.label);
      assert.ok(Math.abs(field.rawScore - expectedField.rawScore) < 1e-9);
      assert.ok(Math.abs(field.runnerUpScore - expectedField.runnerUpScore) < 1e-9);
      assert.equal(field.confidenceBasisPoints, null);
      assert.deepEqual(field.evidenceSpans, []);
      count++;
    }
  }
  assert.equal(count, 72);
});

test('bundled model may miss territory contradiction, but the exhibit warns human review is required', async () => {
  const model = await loadVerifiedPortableModel(artifactText, expectedSha);
  const conflicting = model.predict(contradictoryRequest);
  const territories = conflicting.fields.find(field => field.fieldName === 'territories');
  assert.deepEqual(territories?.label, {
    resolutionState: 'resolved', normalizedValue: ['US', 'CA'],
  });
  assert.equal(conflicting.quoteEligible, false);
  assert.deepEqual(conflicting.permittedActions, []);
  const demo = await runJudgeAiDemo();
  assert.equal(demo.modelSha256, expectedSha);
  assert.equal(demo.caseCount, 2);
  assert.equal((demo.html.match(/<tr><td>/gu) ?? []).length, 24);
  assert.match(demo.html, /Conflicting territories: human decision required/u);
  assert.match(demo.html, /Germany only/u);
  assert.match(demo.html, /The learned model may still suggest US and Canada as resolved/u);
  assert.match(demo.html, /Classifier margins are not calibrated probabilities/u);
  assert.doesNotMatch(demo.html, /<script\b|<iframe\b|<img\b/iu);
});

test('real CLI produces the same marked-up model evidence without provider credentials', () => {
  const executable = fileURLToPath(new URL('./judge-ai-demo.mjs', import.meta.url));
  const result = spawnSync(process.execPath,
    ['--no-warnings', '--experimental-strip-types', executable],
    { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '',
        SYSTEMROOT: process.env.SYSTEMROOT ?? '', TEMP: process.env.TEMP ?? '',
        TMPDIR: process.env.TMPDIR ?? '', TZ: 'UTC' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Actual local model, no payment authority/u);
  assert.match(result.stdout, /Conflicting territories: human decision required/u);
  assert.match(result.stdout, new RegExp(expectedSha));
  assert.equal((result.stdout.match(/<tr><td>/gu) ?? []).length, 24);
});
