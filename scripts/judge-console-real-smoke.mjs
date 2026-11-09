#!/usr/bin/env node
/** Actual offline browser-console acceptance smoke, without PayPal or external I/O. */
import { mkdirSync, mkdtempSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startJudgeConsole } from './judge-local-console.mjs';
import { judgeConsoleEvidenceValid } from './support/judge-console-evidence.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = 'rightsreceipt-judge-console-smoke-v1';
const limit = 262144;

function fail(code) {
  return Object.assign(new Error('Local functional judge smoke failed.'), { code });
}
function textBody(response) {
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > limit)) {
    throw fail('judge_smoke_artifact_invalid');
  }
  return response.text().then(text => {
    if (Buffer.byteLength(text, 'utf8') > limit) throw fail('judge_smoke_artifact_invalid');
    return text;
  });
}

/** Grounded checks of the actual browser-visible application evidence. */
export function verifyJudgeConsoleEvidence({ landing, report, evidence, reportCsp, framePolicy, cachePolicy }) {
  if (typeof landing !== 'string' || !/Simulated payment only\./u.test(landing)
    || !/<form method="post" action="\/run">/u.test(landing)) {
    throw fail('judge_smoke_landing_invalid');
  }
  if (typeof report !== 'string' || !report.includes('The local rehearsal passed.')
    || !report.includes('Local judge rehearsal | RightsReceipt')
    || !/^default-src 'none'; script-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'; base-uri 'none'; form-action 'none'$/u.test(reportCsp ?? '')
    || framePolicy !== 'DENY' || !String(cachePolicy).includes('no-store')) {
    throw fail('judge_smoke_report_invalid');
  }
  if (!judgeConsoleEvidenceValid(evidence)
    || !evidence || evidence.schemaVersion !== 'judge-rehearsal-v1'
    || evidence.status !== 'passed' || evidence.mode !== 'local_injected'
    || !Array.isArray(evidence.scenarios) || evidence.scenarios.length !== 3
    || !Array.isArray(evidence.resets) || evidence.resets.length !== 3
    || evidence.isolation?.database !== 'memory'
    || evidence.isolation?.externalRequests !== 0 || evidence.isolation?.credentialsUsed !== false
    || evidence.repeatability?.ordinaryMatchesRepeat !== true
    || evidence.resets.some(item => item.baselineMatches !== true || item.transactionsCleared !== true
      || item.oldCapabilityDenied !== true || item.oldReceiptDenied !== true
      || item.oldCreatorCaseDenied !== true)) {
    throw fail('judge_smoke_evidence_invalid');
  }
  return Object.freeze({
    schemaVersion: VERSION, status: 'passed', mode: 'local_injected',
    scenarioCount: 3, resetCount: 3, externalRequests: 0,
    paymentEvidence: 'simulated_only',
  });
}

/** The visible console must acknowledge the just-run journey, not merely expose artifacts. */
export function verifyJudgeConsoleCompletion({ html, csp, framePolicy, cachePolicy }) {
  const nonce = typeof html === 'string' ? /<style nonce="([0-9a-f]{32})">/u.exec(html)?.[1] : null;
  if (!nonce || !html.includes('Local rehearsal passed.')
    || html.includes('http-equiv="refresh"') || html.includes('Rehearsal running.')
    || !html.includes('Simulated payment only.')
    || !html.includes('not genuine Sandbox acceptance evidence.')
    || !html.includes('href="/report"') || !html.includes('href="/evidence"')
    || !html.includes('Runs this session: 1 of 5')
    || csp !== `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
    || framePolicy !== 'DENY' || !String(cachePolicy).includes('no-store')) {
    throw fail('judge_smoke_completion_invalid');
  }
}

/** Pending work must be visible and self-refreshing without a script or premature evidence links. */
export function verifyJudgeConsoleProgress({ html, csp, framePolicy, cachePolicy }) {
  const nonce = typeof html === 'string' ? /<style nonce="([0-9a-f]{32})">/u.exec(html)?.[1] : null;
  if (!nonce || !html.includes('Rehearsal running.')
    || !html.includes('<meta http-equiv="refresh" content="2">')
    || !html.includes('Checking the result every two seconds.')
    || !html.includes('Simulated payment only.')
    || !html.includes('Runs this session: 1 of 5')
    || html.includes('href="/report"') || html.includes('href="/evidence"')
    || csp !== `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
    || framePolicy !== 'DENY' || !String(cachePolicy).includes('no-store')) {
    throw fail('judge_smoke_progress_invalid');
  }
}

/** This verifies a real, separate local-model route without confusing it with payment evidence. */
export function verifyJudgeAiSurface({ html, csp, framePolicy, cachePolicy }) {
  if (typeof html !== 'string'
    || !html.includes('<title>Actual local AI diagnostic | RightsReceipt</title>')
    || !html.includes('Actual local model, no payment authority.')
    || !html.includes('Explicit synthetic request')
    || !html.includes('Contradictory synthetic request')
    || !html.includes('Conflicting territories: human decision required')
    || !html.includes('Classifier margins are not calibrated probabilities.')
    || (html.match(/<tr><td>/gu) ?? []).length !== 24
    || !/Verified artifact SHA-256: <code>[a-f0-9]{64}<\/code>/u.test(html)
    || !/^default-src 'none'; script-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'; base-uri 'none'; form-action 'none'$/u.test(csp ?? '')
    || framePolicy !== 'DENY' || !String(cachePolicy).includes('no-store')) {
    throw fail('judge_smoke_model_invalid');
  }
}

/** Run the *real* three-journey worker through the same localhost POST used by judges. */
export async function smokeJudgeConsole({ factory = startJudgeConsole } = {}) {
  const privateRoot = join(root, '.data');
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const stat = lstatSync(privateRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('judge_smoke_output_invalid');
  const base = mkdtempSync(join(privateRoot, 'judge-console-smoke-'));
  let server;
  try {
    const app = await factory({ base });
    server = app.server;
    const origin = app.origin;
    if (typeof origin !== 'string' || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/u.test(origin)) {
      throw fail('judge_smoke_origin_invalid');
    }
    const landingResponse = await fetch(origin + '/', { signal: AbortSignal.timeout(10000) });
    if (landingResponse.status !== 200) throw fail('judge_smoke_landing_invalid');
    const landing = await textBody(landingResponse);
    const token = /name="token" value="([0-9a-f]{48})"/u.exec(landing)?.[1];
    if (!token) throw fail('judge_smoke_landing_invalid');
    const runResponse = await fetch(origin + '/run', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(140000),
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    if (runResponse.status !== 303 || runResponse.headers.get('location') !== '/') {
      throw fail('judge_smoke_execution_failed');
    }
    // POST now redirects immediately while the worker runs. Verify the intermediate
    // surface before accepting the eventual completion, with a bounded wait.
    const deadline = Date.now() + 130000;
    let completionResponse, completionHtml;
    while (Date.now() < deadline) {
      const response = await fetch(origin + '/', { signal: AbortSignal.timeout(10000) });
      if (response.status !== 200 || !String(response.headers.get('content-type')).startsWith('text/html')) {
        throw fail('judge_smoke_completion_invalid');
      }
      const html = await textBody(response);
      const properties = {
        html, csp: response.headers.get('content-security-policy'),
        framePolicy: response.headers.get('x-frame-options'),
        cachePolicy: response.headers.get('cache-control'),
      };
      if (!html.includes('Rehearsal running.')) {
        completionResponse = response; completionHtml = html;
        break;
      }
      verifyJudgeConsoleProgress(properties);
      await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
    }
    if (!completionResponse) throw fail('judge_smoke_completion_timeout');
    verifyJudgeConsoleCompletion({
      html: completionHtml,
      csp: completionResponse.headers.get('content-security-policy'),
      framePolicy: completionResponse.headers.get('x-frame-options'),
      cachePolicy: completionResponse.headers.get('cache-control'),
    });
    const [reportResponse, evidenceResponse] = await Promise.all([
      fetch(origin + '/report', { signal: AbortSignal.timeout(10000) }),
      fetch(origin + '/evidence', { signal: AbortSignal.timeout(10000) }),
    ]);
    if (reportResponse.status !== 200 || evidenceResponse.status !== 200
      || !String(reportResponse.headers.get('content-type')).startsWith('text/html')
      || !String(evidenceResponse.headers.get('content-type')).startsWith('application/json')) {
      throw fail('judge_smoke_artifact_invalid');
    }
    const [report, rawEvidence] = await Promise.all([textBody(reportResponse), textBody(evidenceResponse)]);
    let evidence;
    try { evidence = JSON.parse(rawEvidence); }
    catch { throw fail('judge_smoke_evidence_invalid'); }
    const journey = verifyJudgeConsoleEvidence({
      landing, report, evidence,
      reportCsp: reportResponse.headers.get('content-security-policy'),
      framePolicy: reportResponse.headers.get('x-frame-options'),
      cachePolicy: reportResponse.headers.get('cache-control'),
    });
    const modelResponse = await fetch(origin + '/model', { signal: AbortSignal.timeout(25000) });
    if (modelResponse.status !== 200 || !String(modelResponse.headers.get('content-type')).startsWith('text/html')) {
      throw fail('judge_smoke_model_invalid');
    }
    verifyJudgeAiSurface({
      html: await textBody(modelResponse),
      csp: modelResponse.headers.get('content-security-policy'),
      framePolicy: modelResponse.headers.get('x-frame-options'),
      cachePolicy: modelResponse.headers.get('cache-control'),
    });
    return Object.freeze({ ...journey, aiEvidence: 'real_local_classifier_on_synthetic_only' });
  } catch (error) {
    if (typeof error?.code === 'string' && /^judge_smoke_[a-z_]+$/u.test(error.code)) throw error;
    throw fail('judge_smoke_execution_failed');
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolveClose => server.close(resolveClose));
    }
    rmSync(base, { recursive: true, force: true });
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node scripts/judge-console-real-smoke.mjs\nRun the actual local three-journey browser-console worker. Offline simulation only.\n');
    return 0;
  }
  if (args.length !== 0) {
    process.stdout.write(JSON.stringify({ status: 'failed', code: 'judge_smoke_arguments_invalid' }) + '\n');
    return 2;
  }
  try {
    process.stdout.write(JSON.stringify(await smokeJudgeConsole()) + '\n');
    return 0;
  } catch (error) {
    const code = typeof error?.code === 'string' && /^judge_smoke_[a-z_]+$/u.test(error.code)
      ? error.code : 'judge_smoke_execution_failed';
    process.stdout.write(JSON.stringify({ schemaVersion: VERSION, status: 'failed', code }) + '\n');
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
