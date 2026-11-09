import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runJudgeAiDemo } from './judge-ai-demo.mjs';
import { evaluateJudgeAiProof, runJudgeAiProof, main } from './judge-ai-proof.mjs';

test('the exact checked-in model executes and produces source-bound judge evidence', async () => {
  const result = await runJudgeAiProof();
  assert.equal(result.schemaVersion, 'rightsreceipt-local-ai-proof-v1');
  assert.equal(result.status, 'passed');
  assert.match(result.modelArtifactSha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.syntheticRequestCount, 2);
  assert.equal(result.evaluatedRightsFields, 24);
  assert.equal(result.contradictionWarningVisible, true);
  assert.equal(result.modelExecution, 'real_local_inference');
  assert.equal(result.paymentEvidence, 'none');
});

test('a fabricated report without a contradiction warning fails closed', async () => {
  const actual = await (await import('./judge-ai-demo.mjs')).runJudgeAiDemo();
  const manipulated = { ...actual, html: actual.html.replace('Conflicting territories: human decision required', 'No contradiction') };
  assert.throws(() => evaluateJudgeAiProof(manipulated), error => error.code === 'ai_proof_invalid');
});

test('an inaccurate model hash or incomplete comparison table fails closed', async () => {
  const actual = await (await import('./judge-ai-demo.mjs')).runJudgeAiDemo();
  assert.throws(() => evaluateJudgeAiProof({ ...actual, modelSha256: '0'.repeat(64) }),
    error => error.code === 'ai_proof_invalid');
  assert.throws(() => evaluateJudgeAiProof({ ...actual, html: actual.html.replace('<tr><td>', '<tr><th>') }),
    error => error.code === 'ai_proof_invalid');
});

test('missing model output cannot be mistaken for evidence', async () => {
  await assert.rejects(() => runJudgeAiProof({ runner: async () => ({}) }),
    error => error.code === 'ai_proof_invalid');
  await assert.rejects(() => runJudgeAiProof({ runner: null }),
    error => error.code === 'ai_proof_invalid');
});

test('a modified bundled model cannot produce a passing proof', async () => {
  const original = readFileSync(new URL('../data/model/v1/artifact.json', import.meta.url), 'utf8');
  const altered = original.replace('"modelId"', '"alteredModelId"');
  assert.notEqual(altered, original);
  await assert.rejects(() => runJudgeAiProof({ runner: () => runJudgeAiDemo({ artifactText: altered }) }),
    /model_integrity_invalid/u);
});

test('CLI emits bounded JSON without exposing failed model data or exceptions', async () => {
  let output = '';
  assert.equal(await main([], text => { output += text; }), 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.status, 'passed');
  assert.equal(parsed.paymentEvidence, 'none');
  assert.ok(output.length < 1024);
  let failure = '';
  assert.equal(await main(['unexpected'], text => { failure += text; }), 2);
  assert.deepEqual(JSON.parse(failure), {
    schemaVersion: 'rightsreceipt-local-ai-proof-v1',
    status: 'failed',
    code: 'ai_proof_args_invalid',
  });
  assert.ok(!failure.includes('unexpected'));
});

test('AI proof CLI works as a standalone command from an unrelated directory', () => {
  const executable = fileURLToPath(new URL('./judge-ai-proof.mjs', import.meta.url));
  const result = spawnSync(process.execPath,
    ['--no-warnings', '--experimental-strip-types', executable],
    { cwd: tmpdir(), encoding: 'utf8', timeout: 15000, maxBuffer: 32768 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(result.stderr, '');
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.schemaVersion, 'rightsreceipt-local-ai-proof-v1');
  assert.equal(proof.status, 'passed');
  assert.equal(proof.modelExecution, 'real_local_inference');
  assert.equal(proof.paymentEvidence, 'none');
  assert.equal(proof.evaluatedRightsFields, 24);
});

test('normal and static release verification both require the AI proof gate', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(manifest.scripts['judge:console:verify'],
    /pnpm judge:ai:proof:verify && pnpm judge:ai:proof && pnpm judge:console:smoke/u);
  assert.match(manifest.scripts['judge:verify'], /pnpm judge:console:verify/u);
  assert.match(manifest.scripts.verify, /pnpm judge:verify/u);
  assert.match(manifest.scripts['verify:static'], /pnpm judge:verify/u);
});
