import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateSubmissionCandidate } from './submission-candidate-check.mjs';
import { makeReleaseJudgeFixture, releaseJudgeFixtureHtml } from './support/release-judge-fixture.mjs';
import { serializeJudgeRehearsalReport } from './support/judge-rehearsal-report.mjs';

const H='a'.repeat(64),C='1'.repeat(40),T='2'.repeat(40),P='3'.repeat(40);
const releaseRaw='{"test":"release"}\n';
const sha=s=>createHash('sha256').update(s).digest('hex');
const command=()=>({command:['node','test.mjs'],exitCode:0,signal:null,spawnError:null,durationMs:1,stdoutSha256:H,stderrSha256:H});
function fixture(){return{
  currentCommit:C,currentTree:T,cleanCheckout:true,releaseRaw,releaseIntegrityVerified:true,
  manifest:{schemaVersion:'rightsreceipt-submission-candidate-v1',publicRepositoryUrl:'https://github.com/nolankido/rightsreceipt-sanitized',youtubeDemoUrl:'https://youtu.be/AbcdefghI12'},
  release:{schemaVersion:'rightsreceipt-release-candidate-v1',status:'passed',mode:'full',commit:C,node:'22.16.0',packageManager:'pnpm@12.8.2',preflightFailures:[],lockfile:{sha256:H,committedGitBlobSha:C,workingGitBlobSha:C},commands:Array.from({length:4},command),judgeEvidence:{root:'judge'}},
  exported:{schemaVersion:'rightsreceipt-public-export-v1',status:'passed',sourceCommit:C,sourceTree:T,publicTree:T,exactTreeMatch:true,publicCommit:P,releaseVerificationSha256:sha(releaseRaw),trackedFileCount:635,trackedByteCount:123456,publicAuthorName:'nolankido',publicAuthorEmail:'212063387+nolankido@users.noreply.github.com',sourceSnapshotAuditSha256:H,publicHistoryAuditSha256:H},
  sandboxResult:{schemaVersion:'rightsreceipt-paypal-acceptance-evidence-check-v1',status:'passed',errorCodes:[],invoiceIdSha256:H},
};}
const check=f=>evaluateSubmissionCandidate(f);

test('valid local artifact records are never reported as externally submitted',()=>{
  const r=check(fixture());assert.equal(r.status,'local_records_consistent_external_checks_required');
  assert.equal(r.readyForSubmission,false);assert.deepEqual(r.blockers,[]);
  assert.equal(r.externalVerificationRequired.length,4);
});
test('submission check fails closed when release logs or judge evidence are not verified',()=>{
  const f=fixture();f.releaseIntegrityVerified=false;
  assert.ok(check(f).blockers.includes('release_log_or_judge_evidence_invalid'));
  assert.equal(check(f).readyForSubmission,false);
});
test('missing manifest and clean checkout both block',()=>{
  const f=fixture();delete f.manifest;f.cleanCheckout=false;
  assert.ok(check(f).blockers.includes('manifest_invalid'));
  assert.ok(check(f).blockers.includes('current_checkout_not_verified'));
});
test('release must match HEAD, pinned Node and complete full command evidence',()=>{
  for(const mutation of [f=>f.release.commit=P,f=>f.release.mode='preflight',f=>f.release.node='22.12.0',f=>f.release.commands.pop(),f=>f.release.preflightFailures.push('dirty'),f=>f.release.judgeEvidence=null]){
    const f=fixture();mutation(f);assert.ok(check(f).blockers.includes('full_release_verification_missing_or_mismatched'));
  }
});
test('sanitized export requires matching source tree, distinct commit and exact release bytes',()=>{
  for(const mutation of [f=>f.exported.publicTree=P,f=>f.exported.sourceTree=P,f=>f.exported.publicCommit=C,f=>f.exported.releaseVerificationSha256=H,f=>f.exported.publicAuthorEmail='private@example.test']){
    const f=fixture();mutation(f);assert.ok(check(f).blockers.includes('sanitized_public_export_missing_or_mismatched'));
  }
});
test('private development GitHub repo, deceptive hosts and placeholders cannot pass',()=>{
  for(const url of ['https://github.com/nolankido/rightsReceipt','http://github.com/nolankido/release','https://github.com.evil.test/o/r','https://github.com/owner/repo','https://github.com/nolankido/release/tree/main']){
    const f=fixture();f.manifest.publicRepositoryUrl=url;
    assert.ok(check(f).blockers.includes('public_repository_url_missing_or_invalid'));
  }
});
test('YouTube requires canonical direct HTTPS video URL, not playlists or opaque links',()=>{
  for(const url of [null,'https://example.com/video','https://youtube.com/watch?v=short','https://youtube.com/watch?v=AbcdefghI12&list=secret','https://youtu.be/AbcdefghI12?secret=1']){
    const f=fixture();f.manifest.youtubeDemoUrl=url;
    assert.ok(check(f).blockers.includes('public_video_url_missing_or_invalid'));
  }
});
test('failed Sandbox result and multiple blockers have fixed redacted codes',()=>{
  const f=fixture();f.sandboxResult.status='failed';f.release.preflightFailures=['private-secret'];f.manifest.youtubeDemoUrl='https://example.com/private';
  const r=check(f),serialized=JSON.stringify(r);
  assert.ok(r.blockers.includes('sandbox_internal_consistency_record_missing'));
  assert.ok(!serialized.includes('private-secret'));assert.ok(!serialized.includes('example.com'));
  assert.deepEqual(r.blockers,[...r.blockers].sort());
});
test('CLI help and missing private manifest never echo paths or contact PayPal',()=>{
  const path=fileURLToPath(new URL('./submission-candidate-check.mjs',import.meta.url));
  const help=spawnSync(process.execPath,[path,'--help'],{encoding:'utf8',timeout:5000});
  assert.equal(help.status,0);assert.match(help.stdout,/Read-only/u);
  const missing=spawnSync(process.execPath,[path,'--manifest','.data/missing-private.json'],{encoding:'utf8',timeout:5000});
  assert.equal(missing.status,1);assert.equal(JSON.parse(missing.stdout).readyForSubmission,false);
  assert.ok(!missing.stdout.includes('missing-private.json'));
});
test('read-only CLI requires evidence bound to a real local Git commit and tree',()=>{
  const temp=mkdtempSync(join(tmpdir(),'rr-submission-'));
  try{
    const scripts=join(temp,'scripts'),privateFolder=join(temp,'.data');mkdirSync(scripts);mkdirSync(privateFolder);
    for(const name of ['submission-candidate-check.mjs','export-public-release.mjs','release-candidate-verify.mjs','tracked-source-identity.mjs']) {
      copyFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),join(scripts,name));
    }
    mkdirSync(join(scripts,'support'));
    for(const name of ['release-judge-evidence.mjs','judge-console-evidence.mjs','judge-rehearsal-report.mjs']) {
      copyFileSync(fileURLToPath(new URL('./support/'+name,import.meta.url)),join(scripts,'support',name));
    }
    writeFileSync(join(temp,'package.json'),'{"type":"module"}\n');writeFileSync(join(temp,'.gitignore'),'.data/\n');
    writeFileSync(join(temp,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\n");
    writeFileSync(join(scripts,'paypal-acceptance-evidence-check.mjs'),`export const evaluateAcceptanceEvidence=()=>({schemaVersion:'rightsreceipt-paypal-acceptance-evidence-check-v1',status:'passed',errorCodes:[],invoiceIdSha256:'${H}'});\n`);
    const git=(...args)=>execFileSync('git',args,{cwd:temp,encoding:'utf8'}).trim();
    git('init','-q');git('config','user.name','fixture');git('config','user.email','fixture@example.test');git('add','.');git('commit','-qm','fixture');
    const f=fixture();f.currentCommit=git('rev-parse','HEAD');f.currentTree=git('rev-parse','HEAD^{tree}');
    f.release.commit=f.currentCommit;f.exported.sourceCommit=f.currentCommit;f.exported.sourceTree=f.currentTree;f.exported.publicTree=f.currentTree;
    f.release.startedAt='2026-11-04T12:00:00.000Z';f.release.finishedAt='2026-11-04T12:05:00.000Z';
    f.release.gitStatusSha256=sha('');f.release.lockfile.exists=true;
    f.release.lockfile.sha256=sha("lockfileVersion: '9.0'\n");
    f.release.lockfile.committedGitBlobSha=git('rev-parse','HEAD:pnpm-lock.yaml');
    f.release.lockfile.workingGitBlobSha=f.release.lockfile.committedGitBlobSha;
    mkdirSync(join(privateFolder,'judge'));
    const judgeRun=join(privateFolder,'judge','run-abc123');mkdirSync(judgeRun);
    const judgeEvidence=makeReleaseJudgeFixture({commit:f.currentCommit,node:f.release.node});
    const judgePath=join(judgeRun,'evidence.json');
    writeFileSync(judgePath,serializeJudgeRehearsalReport(judgeEvidence));
    writeFileSync(join(judgeRun,'report.html'),releaseJudgeFixtureHtml(judgeEvidence));
    f.release.commands=[
      [process.execPath,join(scripts,'public-release-audit.mjs'),'--snapshot-only'],
      ['corepack','pnpm','install','--frozen-lockfile'],
      ['corepack','pnpm','verify'],
      [process.execPath,join(scripts,'judge-rehearsal.mjs'),'--output',join(privateFolder,'judge')],
    ].map((command,i)=>{
      const stem=String(i+1).padStart(2,'0')+'-'+command[0].replace(/[^A-Za-z0-9._-]/g,'_');
      const stdout='test-output-'+i+'\n',stderr='';
      writeFileSync(join(privateFolder,stem+'.stdout.log'),stdout);
      writeFileSync(join(privateFolder,stem+'.stderr.log'),stderr);
      return {command,exitCode:0,signal:null,spawnError:null,durationMs:1,stdoutSha256:sha(stdout),stderrSha256:sha(stderr)};
    });
    const releaseText=JSON.stringify(f.release)+'\n';f.exported.releaseVerificationSha256=sha(releaseText);
    writeFileSync(join(privateFolder,'verification.json'),releaseText);writeFileSync(join(privateFolder,'export.json'),JSON.stringify(f.exported));
    for(const stage of ['create','paid','webhook'])writeFileSync(join(privateFolder,stage+'.json'),'{}\n');
    f.manifest.releaseVerification='.data/verification.json';f.manifest.publicExportManifest='.data/export.json';
    f.manifest.sandboxEvidence=Object.fromEntries(['create','paid','webhook'].map(x=>[x,`.data/${x}.json`]));
    writeFileSync(join(privateFolder,'submission-candidate.json'),JSON.stringify(f.manifest));
    const p=spawnSync(process.execPath,[join(scripts,'submission-candidate-check.mjs')],{cwd:temp,encoding:'utf8',timeout:5000});
    assert.equal(p.status,0,p.stderr+' '+p.stdout);
    const response=JSON.parse(p.stdout);assert.equal(response.status,'local_records_consistent_external_checks_required');
    assert.equal(response.readyForSubmission,false);assert.ok(!p.stdout.includes(f.manifest.youtubeDemoUrl));
    writeFileSync(join(privateFolder,'02-corepack.stdout.log'),'tampered-and-possibly-sensitive\n');
    const changed=spawnSync(process.execPath,[join(scripts,'submission-candidate-check.mjs')],{cwd:temp,encoding:'utf8',timeout:5000});
    assert.equal(changed.status,1,changed.stderr+' '+changed.stdout);
    const blocked=JSON.parse(changed.stdout);
    assert.ok(blocked.blockers.includes('release_log_or_judge_evidence_invalid'));
    assert.equal(blocked.readyForSubmission,false);
    assert.ok(!changed.stdout.includes('tampered-and-possibly-sensitive'));
    writeFileSync(join(privateFolder,'02-corepack.stdout.log'),'test-output-1\n');
    writeFileSync(judgePath,JSON.stringify({...judgeEvidence,sourceRevision:'9'.repeat(40)},null,2)+'\n');
    const forgedJudge=spawnSync(process.execPath,[join(scripts,'submission-candidate-check.mjs')],{cwd:temp,encoding:'utf8',timeout:5000});
    assert.equal(forgedJudge.status,1,forgedJudge.stderr+' '+forgedJudge.stdout);
    assert.ok(JSON.parse(forgedJudge.stdout).blockers.includes('release_log_or_judge_evidence_invalid'));
    writeFileSync(judgePath,serializeJudgeRehearsalReport(judgeEvidence));
    rmSync(judgePath);
    const missingJudge=spawnSync(process.execPath,[join(scripts,'submission-candidate-check.mjs')],{cwd:temp,encoding:'utf8',timeout:5000});
    assert.equal(missingJudge.status,1,missingJudge.stderr+' '+missingJudge.stdout);
    assert.ok(JSON.parse(missingJudge.stdout).blockers.includes('release_log_or_judge_evidence_invalid'));
    writeFileSync(judgePath,serializeJudgeRehearsalReport(judgeEvidence));
    rmSync(join(privateFolder,'02-corepack.stdout.log'));
    const missingLog=spawnSync(process.execPath,[join(scripts,'submission-candidate-check.mjs')],{cwd:temp,encoding:'utf8',timeout:5000});
    assert.equal(missingLog.status,1,missingLog.stderr+' '+missingLog.stdout);
    assert.ok(JSON.parse(missingLog.stdout).blockers.includes('release_log_or_judge_evidence_invalid'));
  }finally{rmSync(temp,{recursive:true,force:true});}
});
