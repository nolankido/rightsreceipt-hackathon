import assert from 'node:assert/strict';
import test from 'node:test';
import {join} from 'node:path';
import { verifyPublicJudgeExperience } from './export-public-release.mjs';

const exportDir=join(process.cwd(),'public-fixture');

const smoke = Object.freeze({
  schemaVersion:'rightsreceipt-judge-console-smoke-v1', status:'passed',
  mode:'local_injected', scenarioCount:3, resetCount:3,
  externalRequests:0, paymentEvidence:'simulated_only',
  aiEvidence:'real_local_classifier_on_synthetic_only',
});
const ai = Object.freeze({
  schemaVersion:'rightsreceipt-local-ai-proof-v1', status:'passed',
  modelArtifactSha256:'a'.repeat(64), syntheticRequestCount:2,
  evaluatedRightsFields:24, contradictionWarningVisible:true,
  modelExecution:'real_local_inference', paymentEvidence:'none',
});

function fixture({smokeResult=smoke, aiResult=ai, failAt=null}={}) {
  const calls=[];
  const execute=(cwd,executable,args,options)=>{
    assert.equal(cwd,exportDir);
    assert.equal(executable,process.execPath);
    assert.equal(options.env.APP_MODE,'local');
    assert.equal(options.env.PAYPAL_MODE,'fake');
    assert.equal(options.env.PAYPAL_WEBHOOK_INTAKE_ENABLED,'false');
    const isSmoke=args[0]?.endsWith('judge-console-real-smoke.mjs');
    calls.push(isSmoke ? 'smoke' : 'ai');
    assert.deepEqual(args, isSmoke
      ? [join(exportDir,'scripts','judge-console-real-smoke.mjs')]
      : ['--no-warnings','--experimental-strip-types',join(exportDir,'scripts','judge-ai-proof.mjs')]);
    assert.equal(options.timeout,isSmoke ? 150000 : 30000);
    if (failAt === (isSmoke ? 'smoke' : 'ai')) throw new Error('private child details');
    return {status:0,signal:null,stdout:JSON.stringify(isSmoke ? smokeResult : aiResult)+'\n'};
  };
  return {calls,execute};
}

test('public judge proof executes both actual-export commands with credential-stripped local settings',()=>{
  const f=fixture();
  const value=verifyPublicJudgeExperience(exportDir,f.execute);
  assert.deepEqual(f.calls,['smoke','ai']);
  assert.equal(value.status,'passed');
  assert.equal(value.paymentEvidence,'simulated_only');
  assert.equal(value.aiModelExecution,'real_local_inference');
  assert.equal(value.aiModelArtifactSha256,'a'.repeat(64));
});

test('failed or misleading browser proof prevents the model command from running',()=>{
  for(const changed of [
    {...smoke,externalRequests:1},
    {...smoke,paymentEvidence:'paypal_paid'},
    {...smoke,scenarioCount:2},
    {...smoke,aiEvidence:'not_executed'},
  ]) {
    const f=fixture({smokeResult:changed});
    assert.throws(()=>verifyPublicJudgeExperience(exportDir,f.execute),
      e=>e.message==='public_judge_smoke_failed');
    assert.deepEqual(f.calls,['smoke']);
  }
  const f=fixture({failAt:'smoke'});
  assert.throws(()=>verifyPublicJudgeExperience(exportDir,f.execute),
    e=>e.message==='public_judge_smoke_failed');
});

test('invalid actual-model proof cannot authorize the public export',()=>{
  for(const changed of [
    {...ai,modelExecution:'not_executed'},
    {...ai,paymentEvidence:'simulated_only'},
    {...ai,contradictionWarningVisible:false},
    {...ai,modelArtifactSha256:'invalid'},
  ]) {
    const f=fixture({aiResult:changed});
    assert.throws(()=>verifyPublicJudgeExperience(exportDir,f.execute),
      e=>e.message==='public_ai_proof_failed');
    assert.deepEqual(f.calls,['smoke','ai']);
  }
  const f=fixture({failAt:'ai'});
  assert.throws(()=>verifyPublicJudgeExperience(exportDir,f.execute),
    e=>e.message==='public_ai_proof_failed');
});
