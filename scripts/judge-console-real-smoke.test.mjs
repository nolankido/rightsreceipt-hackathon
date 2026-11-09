import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { verifyJudgeConsoleEvidence, verifyJudgeConsoleCompletion, verifyJudgeConsoleProgress, verifyJudgeAiSurface, smokeJudgeConsole, main } from './judge-console-real-smoke.mjs';
import { judgeConsoleEvidenceFixture } from './support/judge-console-evidence-fixture.mjs';

const token = 'a'.repeat(48);
const landing = `<!doctype html><p>Simulated payment only.</p><form method="post" action="/run"><input type="hidden" name="token" value="${token}"></form>`;
const report = '<!doctype html><title>Local judge rehearsal | RightsReceipt</title><h1>The local rehearsal passed.</h1>';
const csp = "default-src 'none'; script-src 'none'; style-src 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; base-uri 'none'; form-action 'none'";
const nonce = 'b'.repeat(32);
const pageCsp = `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
const completion = landing + `<style nonce="${nonce}"></style><p>Local rehearsal passed.</p>`
  + '<p>The generated transaction report is not genuine Sandbox acceptance evidence.</p>'
  + '<a href="/report">Report</a><a href="/evidence">Evidence</a><p>Runs this session: 1 of 5</p>';
const pending = landing + `<style nonce="${nonce}"></style><meta http-equiv="refresh" content="2">`
  + '<p>Rehearsal running. The report will appear when it finishes.</p>'
  + '<p>Checking the result every two seconds.</p><p>Runs this session: 1 of 5</p>';
const modelHtml = '<!doctype html><title>Actual local AI diagnostic | RightsReceipt</title>'
  + '<h1>Actual local model, no payment authority.</h1>'
  + '<p>Explicit synthetic request. Contradictory synthetic request.</p>'
  + '<p>Conflicting territories: human decision required</p>'
  + '<p>Classifier margins are not calibrated probabilities.</p>'
  + '<p>Verified artifact SHA-256: <code>' + 'a'.repeat(64) + '</code></p>'
  + '<table>' + '<tr><td>fixture</td></tr>'.repeat(24) + '</table>';
const evidence = () => judgeConsoleEvidenceFixture();
const valid = () => ({landing,report,evidence:evidence(),reportCsp:csp,framePolicy:'DENY',cachePolicy:'private, no-store'});

test('the actual judge-report shape is recognized but never described as a real payment',()=>{
  const outcome = verifyJudgeConsoleEvidence(valid());
  assert.equal(outcome.status,'passed');
  assert.equal(outcome.scenarioCount,3);
  assert.equal(outcome.resetCount,3);
  assert.equal(outcome.externalRequests,0);
  assert.equal(outcome.paymentEvidence,'simulated_only');
});
test('model surface requires source-only diagnostic and restrictive security headers',()=>{
  assert.doesNotThrow(()=>verifyJudgeAiSurface({html:modelHtml,csp,framePolicy:'DENY',cachePolicy:'no-store'}));
  assert.throws(()=>verifyJudgeAiSurface({html:modelHtml.replace('Contradictory synthetic request','Removed'),csp,framePolicy:'DENY',cachePolicy:'no-store'}),e=>e.code==='judge_smoke_model_invalid');
  assert.throws(()=>verifyJudgeAiSurface({html:modelHtml.replace('Conflicting territories: human decision required','Removed'),csp,framePolicy:'DENY',cachePolicy:'no-store'}),e=>e.code==='judge_smoke_model_invalid');
  assert.throws(()=>verifyJudgeAiSurface({html:modelHtml,csp:'unsafe-inline',framePolicy:'DENY',cachePolicy:'no-store'}),e=>e.code==='judge_smoke_model_invalid');
});

test('missing one of three real journey/reset outcomes fails closed',()=>{
  const bad=valid();bad.evidence.resets[0].oldReceiptDenied=false;
  assert.throws(()=>verifyJudgeConsoleEvidence(bad),e=>e.code==='judge_smoke_evidence_invalid');
});
test('provider network usage or credentials make this an invalid offline rehearsal',()=>{
  for(const key of ['credentialsUsed','externalRequests']){
    const bad=valid();bad.evidence.isolation[key]=key==='credentialsUsed'?true:1;
    assert.throws(()=>verifyJudgeConsoleEvidence(bad),e=>e.code==='judge_smoke_evidence_invalid');
  }
});
test('untrusted report CSP or missing frame protection fails',()=>{
  for(const key of ['reportCsp','framePolicy','cachePolicy']){
    const bad=valid();bad[key]='unsafe';
    assert.throws(()=>verifyJudgeConsoleEvidence(bad),e=>e.code==='judge_smoke_report_invalid');
  }
});
test('browser entrypoint requires a visible simulated label and real form',()=>{
  for(const body of ['<!doctype html><form method="post" action="/run"></form>', 'Simulated payment only.']){
    const bad=valid();bad.landing=body;
    assert.throws(()=>verifyJudgeConsoleEvidence(bad),e=>e.code==='judge_smoke_landing_invalid');
  }
});
test('the post-run judge page must visibly acknowledge success and expose both artifacts',()=>{
  const args = { html: completion, csp: pageCsp, framePolicy: 'DENY', cachePolicy: 'no-store' };
  assert.doesNotThrow(()=>verifyJudgeConsoleCompletion(args));
  for (const phrase of ['Local rehearsal passed.', 'href="/report"', 'href="/evidence"',
    'Simulated payment only.', 'not genuine Sandbox acceptance evidence.', 'Runs this session: 1 of 5']) {
    assert.throws(()=>verifyJudgeConsoleCompletion({...args,html:completion.replace(phrase,'removed')}),
      e=>e.code==='judge_smoke_completion_invalid');
  }
  for (const [key, value] of [['csp','unsafe-inline'], ['framePolicy','ALLOW'], ['cachePolicy','public']]) {
    assert.throws(()=>verifyJudgeConsoleCompletion({...args,[key]:value}),
      e=>e.code==='judge_smoke_completion_invalid');
  }
  assert.throws(()=>verifyJudgeConsoleCompletion({...args,html:completion.replace('1 of 5','2 of 5')}),
    e=>e.code==='judge_smoke_completion_invalid');
  assert.throws(()=>verifyJudgeConsoleCompletion({...args,html:completion+'<meta http-equiv="refresh" content="2">'}),
    e=>e.code==='judge_smoke_completion_invalid');
});
test('running state self-refreshes safely and cannot expose evidence early',()=>{
  const args = { html: pending, csp: pageCsp, framePolicy: 'DENY', cachePolicy: 'no-store' };
  assert.doesNotThrow(()=>verifyJudgeConsoleProgress(args));
  for (const html of [pending.replace('<meta http-equiv="refresh" content="2">',''),
    pending.replace('Rehearsal running.','Ready.'), pending + '<a href="/report">premature link</a>',
    pending.replace('Checking the result every two seconds.','Waiting.')]) {
    assert.throws(()=>verifyJudgeConsoleProgress({...args,html}),e=>e.code==='judge_smoke_progress_invalid');
  }
  assert.throws(()=>verifyJudgeConsoleProgress({...args,csp:'unsafe-inline'}),e=>e.code==='judge_smoke_progress_invalid');
});
test('one browser click retrieves both artifacts through localhost',async()=>{
  let runs=0, pendingReads=0;
  const factory = async()=>{
    const server=createServer(async(req,res)=>{
      if(req.url==='/'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':pageCsp,
          'X-Frame-Options':'DENY','Cache-Control':'no-store'});
        if (runs && pendingReads < 2) { pendingReads++; res.end(pending); }
        else res.end(runs ? completion : landing);
        return;
      }
      if(req.url==='/run'&&req.method==='POST'){
        let body='';for await(const part of req)body+=part.toString();
        if(!body.includes(token)) {res.writeHead(403);res.end();return;}
        runs++;res.writeHead(303,{Location:'/'});res.end();return;
      }
      if(req.url==='/report'){
        res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':csp,'X-Frame-Options':'DENY','Cache-Control':'no-store'});res.end(report);return;
      }
      if(req.url==='/evidence'){
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(evidence()));return;
      }
      if(req.url==='/model'){
        res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':csp,'X-Frame-Options':'DENY','Cache-Control':'no-store'});
        res.end(modelHtml);return;
      }
      res.writeHead(404);res.end();
    });
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
    return {server,origin:`http://127.0.0.1:${server.address().port}`};
  };
  const result=await smokeJudgeConsole({factory});
  assert.equal(result.status,'passed');assert.equal(result.paymentEvidence,'simulated_only');
  assert.equal(result.aiEvidence,'real_local_classifier_on_synthetic_only');assert.equal(runs,1);
  assert.equal(pendingReads,2,'the smoke must inspect intermediate progress');
});
test('hostile app origin is not opened',async()=>{
  const app = await smokeJudgeConsole({factory:async()=>({origin:'https://evil.example',server:null})}).then(()=>null,e=>e);
  assert.equal(app.code,'judge_smoke_origin_invalid');
});
test('incorrect CLI arguments return sanitized failure',async()=>{
  assert.equal(await main(['--bogus']),2);
});

test('smoke validation rejects failed journeys despite a passed envelope', () => {
  const bad = valid(); bad.evidence.scenarios[1].status = 'failed';
  assert.throws(() => verifyJudgeConsoleEvidence(bad), e => e.code === 'judge_smoke_evidence_invalid');
});
test('smoke validation rejects the wrong deterministic licensing price', () => {
  const bad = valid(); bad.evidence.scenarios[2].summary.quoteCents = 42499;
  assert.throws(() => verifyJudgeConsoleEvidence(bad), e => e.code === 'judge_smoke_evidence_invalid');
});
