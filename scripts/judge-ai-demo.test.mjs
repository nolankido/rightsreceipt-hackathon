import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runJudgeAiDemo } from './judge-ai-demo.mjs';

const fields = [
  'use_purpose', 'channels', 'paid_advertising', 'territories', 'start_date',
  'duration_days', 'max_impressions', 'exclusivity', 'modification_scope',
  'attribution', 'sublicensing', 'ai_use',
];
const artifactText = '{"modelId":"synthetic-test-model","modelVersion":"1","test":"synthetic model placeholder"}';
const hash = createHash('sha256').update(artifactText).digest('hex');
const report = { trainingArtifactSha256: hash };
const predictor = () => ({
  modelId: 'synthetic-test-model', modelVersion: '1', artifactSha256: hash,
  status: 'uncalibrated_review_only', reviewRequired: true, quoteEligible: false,
  permittedActions: [],
  fields: fields.map(fieldName => ({ fieldName, label: { resolutionState: 'unresolved', normalizedValue: null },
    confidenceBasisPoints: null, evidenceSpans: [], rawScore: 0, margin: 0 })),
});
const model = { predict: predictor };
const extract = () => fields.map(fieldName => ({ fieldName, resolutionState: 'unresolved',
  normalizedValue: null, evidenceSpans: [] }));
const args = () => ({ artifactText, trainingReport: report, loadModel: async (raw, actualHash) => {
  assert.equal(raw, artifactText);assert.equal(actualHash, hash);return model;
}, extract });

test('two actual calls to supplied diagnostic model are rendered as review-only source/model comparison', async () => {
  const demo = await runJudgeAiDemo(args());
  assert.equal(demo.caseCount, 2);
  assert.equal(demo.fieldCount, 12);
  assert.match(demo.html, /Actual local model, no payment authority/u);
  assert.match(demo.html, /Synthetic request/uim);
  assert.match(demo.html, /Contradictory synthetic request/u);
  assert.match(demo.html, /Conflicting territories: human decision required/u);
  assert.match(demo.html, /Germany only/u);
  assert.match(demo.html, /Model: <code>synthetic-test-model<\/code>/u);
  assert.equal((demo.html.match(/<tr><td>/gu) ?? []).length, 24);
  assert.match(demo.html, /Classifier margins are not calibrated probabilities/u);
  assert.match(demo.html, /injected PayPal replies/u);
  assert.match(demo.html, /default-src 'none'; script-src 'none'; style-src 'sha256-/u);
  assert.doesNotMatch(demo.html, /<script\b|<iframe\b|<img\b/iu);
});

test('the displayed model identity is bound to the artifact and requires exactly two predictions', async () => {
  const options = args();let predictions = 0;
  options.loadModel = async () => ({ predict: text => {
    predictions++;
    return predictor(text);
  } });
  const diagnostic = await runJudgeAiDemo(options);
  assert.equal(predictions, 2, 'one inference per synthetic request, no extra identity inference');
  assert.match(diagnostic.html, /Model: <code>synthetic-test-model<\/code> \(1\)/u);
});

test('model output claiming a different identity than the verified artifact fails closed', async () => {
  const options = args();
  options.loadModel = async () => ({ predict: text => ({...predictor(text), modelId:'other-model'}) });
  await assert.rejects(runJudgeAiDemo(options), /model_identity_invalid/u);
});

test('identity cannot change between the two model predictions', async () => {
  const options = args();let count = 0;
  options.loadModel = async () => ({ predict: text => ({
    ...predictor(text),modelVersion:++count===1?'1':'another-version',
  }) });
  await assert.rejects(runJudgeAiDemo(options), /model_identity_invalid/u);
});

test('the verified artifact must contain a meaningful model identity', async () => {
  const raw = '{"test":"missing identity"}';
  const options = args();
  options.artifactText = raw;
  options.trainingReport = {trainingArtifactSha256:createHash('sha256').update(raw).digest('hex')};
  await assert.rejects(runJudgeAiDemo(options), /model_integrity_invalid/u);
});

test('tampered model bytes fail closed before model loader is called', async () => {
  let calls=0;
  const options = args(); options.artifactText = '{}';options.loadModel=async()=>{calls++;return model;};
  await assert.rejects(runJudgeAiDemo(options), /model_integrity_invalid/u);
  assert.equal(calls,0);
});

test('model cannot produce a quote or claim approval and still show a passing diagnostic', async () => {
  const options=args(); options.loadModel=async()=>({ predict: text => ({...predictor(text), quoteEligible:true}) });
  await assert.rejects(runJudgeAiDemo(options), /model_authority_invalid/u);
});

test('prediction and source fields must match canonical field order', async () => {
  const options=args();options.loadModel=async()=>({ predict:text => ({...predictor(text), fields: predictor(text).fields.slice().reverse()}) });
  await assert.rejects(runJudgeAiDemo(options), /model_result_invalid/u);
});

test('out of bounds source offsets are rejected', async () => {
  const options=args();options.extract=()=>fields.map(fieldName=>({ fieldName,
    resolutionState:'resolved',normalizedValue:'something', evidenceSpans:[{startUtf16:5,endUtf16:10000}] }));
  await assert.rejects(runJudgeAiDemo(options), /invalid_source_span/u);
});

test('synthetic model labels are HTML-escaped and cannot inject executable markup', async () => {
  const options=args();
  options.loadModel=async()=>({predict: text=>{
    const result=predictor(text);
    result.fields[0].label={resolutionState:'resolved',normalizedValue:'<script>malicious()</script>'};
    return result;
  }});
  const result=await runJudgeAiDemo(options);
  assert.match(result.html,/&lt;script&gt;malicious\(\)&lt;\/script&gt;/u);
  assert.doesNotMatch(result.html,/<script>malicious\(\)<\/script>/u);
});

test('CLI --help is usable without loading model assets or calling PayPal', () => {
  const script = fileURLToPath(new URL('./judge-ai-demo.mjs', import.meta.url));
  const result=spawnSync(process.execPath,[script,'--help'],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0);
  assert.match(result.stdout,/Actual, read-only local model/u);
});
