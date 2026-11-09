import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startJudgeConsole, runModelDiagnostic } from './judge-local-console.mjs';
import { judgeConsoleEvidenceFixture } from './support/judge-console-evidence-fixture.mjs';

const reportHtml = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; base-uri 'none'; form-action 'none'"></head><body><h1>Verified simulated report</h1></body></html>`;
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(),'rr069-'));
  let runs = 0;
  const runner = async () => {
    runs++;
    const d = join(root,'run-'+runs);
    mkdirSync(d);
    const report = join(d,'report.html'), evidence = join(d,'evidence.json');
    writeFileSync(report,reportHtml);
    writeFileSync(evidence, JSON.stringify(judgeConsoleEvidenceFixture()));
    return {report,evidence};
  };
  return {root,runner,get runs(){return runs;}};
};
async function hostTest(fn,options={}) {
  const f = fixture();
  const app = await startJudgeConsole({runner:f.runner,base:f.root,...options});
  try { await fn({ ...f, origin:app.origin }); }
  finally { await new Promise(resolve=>app.server.close(resolve));rmSync(f.root,{recursive:true,force:true}); }
}
function token(html){return /name="token" value="([0-9a-f]{48})"/u.exec(html)?.[1];}
function post(origin,key,extras={}){return fetch(origin+'/run',{method:'POST',redirect:'manual',headers:{Origin:extras.origin??origin,'Content-Type':extras.contentType??'application/x-www-form-urlencoded'},body:extras.body??new URLSearchParams({token:key})});}
async function settled(origin) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const page = await (await fetch(origin + '/')).text();
    if (!page.includes('Rehearsal running.')) return page;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('The local rehearsal did not settle.');
}

test('loopback console exposes a labeled local interactive run action with strict headers',async()=>hostTest(async({origin})=>{
  assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/u);
  const r=await fetch(origin+'/');const html=await r.text();
  assert.equal(r.status,200);assert.match(html,/Simulated payment only/u);assert.match(html,/injected PayPal-like/u);
  assert.ok(token(html));assert.match(html,/<form method="post" action="\/run">/u);
  assert.match(r.headers.get('content-security-policy'),/default-src 'none'/u);
  const nonce = /<style nonce="([0-9a-f]{32})">/u.exec(html)?.[1];
  assert.ok(nonce, 'The server should provide an individual style nonce');
  assert.match(r.headers.get('content-security-policy'), new RegExp("style-src 'nonce-" + nonce + "'"));
  assert.match(html, /<main class="wrap"/u);
  assert.match(html, /What the evidence covers/u);
  assert.match(html, /@media\(max-width:480px\)/u);
  assert.doesNotMatch(html, /<script\b/u);
  assert.equal(r.headers.get('x-frame-options'),'DENY');
  assert.match(r.headers.get('cache-control'),/no-store/u);
  const missing=await fetch(origin+'/report');assert.equal(missing.status,404);
}));

test('actual model diagnostic is separately labeled, cached, and never a payment flow',async()=>{
  const csp = "default-src 'none'; script-src 'none'; style-src 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; base-uri 'none'; form-action 'none'";
  const html = '<!doctype html><meta http-equiv="Content-Security-Policy" content="'+csp+'">'
    +'<title>Actual local AI diagnostic | RightsReceipt</title>'
    +'<h1>Actual local model, no payment authority.</h1>'
    +'<p>Classifier margins are not calibrated probabilities.</p>';
  let calls=0;
  await hostTest(async({origin})=>{
    const landing=await(await fetch(origin+'/')).text();
    assert.match(landing,/href="\/model"/u);
    const first=await fetch(origin+'/model');
    assert.equal(first.status,200);
    assert.equal(first.headers.get('content-security-policy'),csp);
    assert.equal(first.headers.get('x-frame-options'),'DENY');
    assert.match(await first.text(),/Actual local model, no payment authority/u);
    const second=await fetch(origin+'/model');
    assert.equal(second.status,200);
    assert.equal(calls,1);
    assert.equal((await fetch(origin+'/report')).status,404);
  },{modelRunner:async()=>{calls++;return html;}});
});

test('failed or script-bearing model diagnostics fail closed',async()=>{
  await hostTest(async({origin})=>{
    const response=await fetch(origin+'/model');
    assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/<script/u);
  },{modelRunner:async()=>'<script>unsafe()</script>'});
});

test('stuck AI worker returns 503 promptly and a later model request can retry',async()=>{
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');
  let launches = 0, kills = 0;
  await hostTest(async({origin})=>{
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(origin + '/model', { signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 503);
      assert.match(await response.text(), /Actual local AI diagnostic unavailable/u);
    }
    assert.equal(launches, 2, 'failed cached diagnostic must be reset before retry');
    assert.equal(kills, 2);
  }, {modelRunner:()=>runModelDiagnostic({spawnChild:()=>{
    launches++;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.kill = () => { kills++; return true; };
    return child;
  },timeoutMs:10})});
});

test('same-origin CSRF token authorizes a new real-runner call with stored evidence',async()=>hostTest(async({origin})=>{
  const html=await(await fetch(origin+'/')).text();const response=await post(origin,token(html));
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/');
  await settled(origin);
  const report=await fetch(origin+'/report');assert.equal(report.status,200);
  assert.match(await report.text(),/Verified simulated report/u);
  assert.match(report.headers.get('content-security-policy'),/style-src 'sha256-/u);
  assert.doesNotMatch(report.headers.get('content-security-policy'),/nonce-/u);
  const evidence=await fetch(origin+'/evidence');assert.equal(evidence.status,200);
  assert.equal((await evidence.json()).mode,'local_injected');
  const page=await(await fetch(origin+'/')).text();assert.match(page,/Local rehearsal passed/u);
}));

test('rejects cross-origin forms, wrong tokens and unknown methods',async()=>hostTest(async({origin})=>{
  const html=await(await fetch(origin+'/')).text();const key=token(html);
  assert.equal((await post(origin,key,{origin:'https://attacker.example'})).status,403);
  assert.equal((await post(origin,'0'.repeat(48))).status,403);
  assert.equal((await post(origin,key,{body:'token='+key+'&admin=true'})).status,403);
  assert.equal((await fetch(origin+'/run')).status,405);
  assert.equal((await fetch(origin+'/?secret=1')).status,400);
  assert.equal((await fetch(origin+'/unknown')).status,404);
}));

test('maximum run count prevents unlimited local resource use',async()=>hostTest(async({origin})=>{
  const key=token(await(await fetch(origin+'/')).text());
  for (let i=0;i<5;i++) { assert.equal((await post(origin,key)).status,303); await settled(origin); }
  assert.equal((await post(origin,key)).status,429);
},{}));

test('rejects generated artifact paths outside its owned output directory',async()=>{
  const f=fixture();const outside=mkdtempSync(join(tmpdir(),'rr069-out-'));
  const file=join(outside,'report.html');writeFileSync(file,reportHtml);
  const app=await startJudgeConsole({base:f.root,runner:async()=>({report:file,evidence:file})});
  try {
    const key=token(await(await fetch(app.origin+'/')).text());
    assert.equal((await post(app.origin,key)).status,303);
    await settled(app.origin);
    assert.equal((await fetch(app.origin+'/report')).status,404);
    assert.match(await (await fetch(app.origin+'/')).text(), /last rehearsal failed/u);
  } finally {
    await new Promise(resolve=>app.server.close(resolve));
    rmSync(outside,{recursive:true,force:true});rmSync(f.root,{recursive:true,force:true});
  }
});

test('CLI help exits without binding a socket or launching the rehearsal', async()=>{
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const script = fileURLToPath(new URL('./judge-local-console.mjs', import.meta.url));
  const result = spawnSync(process.execPath,[script,'--help'],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/loopback-only browser review console/u);
});

async function rejectsArtifacts(change) {
  const f = fixture();
  const app = await startJudgeConsole({ base: f.root, runner: async () => {
    const pair = await f.runner();
    return await change(pair, f.root);
  } });
  try {
    const key = token(await (await fetch(app.origin + '/')).text());
    assert.equal((await post(app.origin, key)).status, 303);
    const page = await settled(app.origin);
    assert.doesNotMatch(page, /Local rehearsal passed/u);
    assert.match(page, /last rehearsal failed/u);
    assert.doesNotMatch(page, /href="\/(?:report|evidence)"/u);
    assert.equal((await fetch(app.origin + '/report')).status, 404);
    assert.equal((await fetch(app.origin + '/evidence')).status, 404);
  } finally {
    app.server.closeAllConnections();
    await new Promise(resolve => app.server.close(resolve));
    rmSync(f.root, { recursive: true, force: true });
  }
}

test('an unreadable report policy cannot produce a passing judge page', async () => rejectsArtifacts(pair => {
  writeFileSync(pair.report, '<!doctype html><h1>Private malformed report</h1>');
  return pair;
}));

test('an unsafe report policy cannot produce a passing judge page', async () => rejectsArtifacts(pair => {
  writeFileSync(pair.report, reportHtml.replace("script-src 'none'", "script-src 'unsafe-inline'"));
  return pair;
}));

test('invalid evidence JSON cannot produce a passing judge page', async () => rejectsArtifacts(pair => {
  writeFileSync(pair.evidence, '{private invalid JSON');
  return pair;
}));

test('a failed evidence record cannot produce a passing judge page', async () => rejectsArtifacts(pair => {
  writeFileSync(pair.evidence, JSON.stringify({ mode: 'local_injected', status: 'failed' }));
  return pair;
}));

test('artifacts from different execution directories cannot produce a passing judge page', async () => rejectsArtifacts((pair, base) => {
  const other = join(base, 'different-run');
  mkdirSync(other);
  const evidence = join(other, 'evidence.json');
  writeFileSync(evidence, JSON.stringify({ schemaVersion: 'judge-rehearsal-v1', mode: 'local_injected', status: 'passed', scenarios: [1, 2, 3], resets: [1, 2, 3] }));
  return { report: pair.report, evidence };
}));

test('failed rerun clears a prior passing report and both evidence links', async () => {
  const f = fixture();
  let count = 0;
  const app = await startJudgeConsole({ base: f.root, runner: async () => {
    const pair = await f.runner();
    if (++count === 2) writeFileSync(pair.evidence, '{private invalid JSON');
    return pair;
  } });
  try {
    const key = token(await (await fetch(app.origin + '/')).text());
    assert.equal((await post(app.origin, key)).status, 303);
    await settled(app.origin);
    assert.match(await (await fetch(app.origin + '/')).text(), /Local rehearsal passed/u);
    assert.equal((await fetch(app.origin + '/report')).status, 200);
    assert.equal((await post(app.origin, key)).status, 303);
    const page = await settled(app.origin);
    assert.match(page, /last rehearsal failed/u);
    assert.doesNotMatch(page, /href="\/(?:report|evidence)"/u);
    assert.equal((await fetch(app.origin + '/report')).status, 404);
    assert.equal((await fetch(app.origin + '/evidence')).status, 404);
  } finally {
    app.server.closeAllConnections();
    await new Promise(resolve => app.server.close(resolve));
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('wrong schema, nonlocal mode and incomplete evidence envelopes fail closed', async () => {
  for (const change of [
    { schemaVersion: 'unknown' }, { mode: 'paypal_sandbox' },
    { scenarios: [] }, { resets: [] },
  ]) {
    await rejectsArtifacts(pair => {
      const evidence = JSON.parse(readFileSync(pair.evidence, 'utf8'));
      writeFileSync(pair.evidence, JSON.stringify({ ...evidence, ...change }));
      return pair;
    });
  }
});

test('invalid UTF-8 in either artifact cannot produce a passing judge page', async () => {
  for (const name of ['report', 'evidence']) {
    await rejectsArtifacts(pair => {
      const bytes = readFileSync(pair[name]);
      writeFileSync(pair[name], Buffer.concat([bytes, Buffer.from([255])]));
      return pair;
    });
  }
});

test('report and JSON responses keep the exact accepted bytes after source files change', async () => {
  const f = fixture();
  let pair, expectedReport, expectedEvidence;
  const app = await startJudgeConsole({ base: f.root, runner: async () => {
    pair = await f.runner();
    expectedReport = readFileSync(pair.report, 'utf8');
    expectedEvidence = readFileSync(pair.evidence, 'utf8');
    return pair;
  } });
  try {
    const key = token(await (await fetch(app.origin + '/')).text());
    assert.equal((await post(app.origin, key)).status, 303);
    await settled(app.origin);
    writeFileSync(pair.report, 'REPLACED REPORT MUST NOT BE SERVED');
    writeFileSync(pair.evidence, 'REPLACED EVIDENCE MUST NOT BE SERVED');
    assert.equal(await (await fetch(app.origin + '/report')).text(), expectedReport);
    assert.equal(await (await fetch(app.origin + '/evidence')).text(), expectedEvidence);
    assert.match(await (await fetch(app.origin + '/')).text(), /Local rehearsal passed/u);
  } finally {
    app.server.closeAllConnections();
    await new Promise(resolve => app.server.close(resolve));
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('POST redirects immediately, polls safely and blocks concurrent runs until evidence is accepted', async () => {
  const f = fixture();
  let release, signalEntered;
  const waiting = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { signalEntered = resolve; });
  const app = await startJudgeConsole({ base: f.root, runner: async () => {
    signalEntered();
    await waiting;
    return f.runner();
  } });
  let pending;
  try {
    const key = token(await (await fetch(app.origin + '/')).text());
    pending = post(app.origin, key);
    assert.equal((await pending).status, 303, 'the browser must return before a slow worker completes');
    await entered;
    const runningPage = await (await fetch(app.origin + '/')).text();
    assert.match(runningPage, /Rehearsal running/u);
    assert.match(runningPage, /<meta http-equiv="refresh" content="2">/u);
    assert.match(runningPage, /Checking the result every two seconds/u);
    assert.doesNotMatch(runningPage, /href="\/(?:report|evidence)"/u);
    assert.equal((await post(app.origin, key)).status, 409);
    release();
    const finished = await settled(app.origin);
    assert.equal(f.runs, 1);
    assert.match(finished, /Local rehearsal passed/u);
    assert.doesNotMatch(finished, /http-equiv="refresh"/u);
  } finally {
    release();
    if (pending) await pending.catch(() => {});
    app.server.closeAllConnections();
    await new Promise(resolve => app.server.close(resolve));
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('existing smoke client passes through the real console with controlled rehearsal artifacts', async () => {
  const { smokeJudgeConsole } = await import('./judge-console-real-smoke.mjs');
  const result = await smokeJudgeConsole({ factory: options => startJudgeConsole({
    ...options,
    runner: async base => {
      const run = join(base, 'run-integrated');
      mkdirSync(run);
      const report = join(run, 'report.html'), evidence = join(run, 'evidence.json');
      writeFileSync(report, reportHtml.replace('Verified simulated report', 'The local rehearsal passed.')
        .replace('</head>', '<title>Local judge rehearsal | RightsReceipt</title></head>'));
      writeFileSync(evidence, JSON.stringify(judgeConsoleEvidenceFixture()));
      return { report, evidence };
    },
  }) });
  assert.equal(result.status, 'passed');
  assert.equal(result.paymentEvidence, 'simulated_only');
});


async function rejectSemanticMutation(change) {
  return rejectsArtifacts(pair => {
    const evidence = JSON.parse(readFileSync(pair.evidence, 'utf8'));
    change(evidence);
    writeFileSync(pair.evidence, JSON.stringify(evidence));
    return pair;
  });
}

test('a failed licensing journey cannot be displayed as a successful rehearsal', async () =>
  rejectSemanticMutation(x => { x.scenarios[1].status = 'failed'; }));

test('a denied receipt capability must be proved after every reset', async () =>
  rejectSemanticMutation(x => { x.resets[2].oldReceiptDenied = false; }));

test('the local rehearsal cannot claim success after an external network request', async () =>
  rejectSemanticMutation(x => { x.isolation.externalRequests = 1; }));

test('a changed seed row count cannot be reported as a clean reset', async () =>
  rejectSemanticMutation(x => { x.resets[1].rowsAfter.permissions = 1; }));

test('an unverified receipt and incorrect price cannot count as a completed journey', async () => {
  for (const change of [
    x => { x.scenarios[0].summary.receiptIntegrity = 'unverified'; },
    x => { x.scenarios[1].summary.quoteCents = 42499; },
  ]) await rejectSemanticMutation(change);
});

test('journey order and exact provider create/send counts are mandatory', async () => {
  for (const change of [
    x => { x.scenarios[0].id = 'repeat'; },
    x => { x.scenarios[2].summary.providerCalls.send = 2; },
  ]) await rejectSemanticMutation(change);
});
