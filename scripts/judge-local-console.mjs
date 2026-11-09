#!/usr/bin/env node
/** Loopback-only interactive launcher for the real local handler rehearsal. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRehearsalWorkerEnvironment, requireRehearsalRuntime } from './support/judge-rehearsal-runtime.mjs';
import { renderJudgeConsolePage, judgeConsoleStylePolicy } from './support/judge-console-page.mjs';
import { judgeConsoleEvidenceValid } from './support/judge-console-evidence.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const token = () => randomBytes(24).toString('hex');
const headers = (type, csp) => ({ 'Content-Type': type, 'Cache-Control': 'private, no-store',
  'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': csp ?? "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
const send = (res, code, body, type = 'text/plain; charset=utf-8', csp) => { res.writeHead(code, headers(type, csp)); res.end(body); };
function ownedFile(base, value, filename) {
  if (typeof value !== 'string' || !value.endsWith(sep + filename)) throw Error('invalid_path');
  const resolved = realpathSync(value), rel = relative(realpathSync(base), resolved);
  if (!rel || rel.startsWith('..') || rel.split(sep).length !== 2) throw Error('invalid_path');
  const stat = statSync(resolved);
  if (!stat.isFile() || stat.size < 1 || stat.size > 262144) throw Error('invalid_size');
  return resolved;
}
/** Validate the complete pair before announcing success; serve these exact bytes. */
function acceptedArtifacts(base, candidate) {
  const reportPath = ownedFile(base, candidate?.report, 'report.html');
  const evidencePath = ownedFile(base, candidate?.evidence, 'evidence.json');
  if (dirname(reportPath) !== dirname(evidencePath)) throw Error('mixed_run_artifacts');
  const report = readFileSync(reportPath), evidence = readFileSync(evidencePath);
  if (!report.length || !evidence.length || report.length > 262144 || evidence.length > 262144) {
    throw Error('invalid_size');
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const html = decoder.decode(report), document = JSON.parse(decoder.decode(evidence));
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/u.exec(html);
  if (!meta || !/^default-src 'none'; script-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'; base-uri 'none'; form-action 'none'$/u.test(meta[1])) {
    throw Error('invalid_csp');
  }
  if (!judgeConsoleEvidenceValid(document)) throw Error('invalid_evidence');
  // No later filesystem read may replace the artifacts that authorized success.
  return Object.freeze({ report, evidence, reportCsp: meta[1] });
}
export async function runRehearsal(base, { spawnChild = spawn, timeoutMs = 120000 } = {}) {
  return new Promise(done => {
    let child;
    try {
      child = spawnChild(process.execPath, [join(root, 'scripts', 'judge-rehearsal.mjs'), '--output', base],
        { cwd: root, env: createRehearsalWorkerEnvironment(process.env),
          stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    } catch { done(null); return; }
    let out = '', settled = false;
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timeout); done(result);
    };
    const abort = () => {
      // Latch failure before kill: a child can race its final close event
      // against termination and must never turn the timeout into success.
      finish(null);
      try { child.kill(); } catch { /* A failed kill never authorizes success. */ }
    };
    // A late, apparently successful exit must never reverse a timeout or
    // oversized-output failure. Resolve without waiting for a stuck process.
    const timeout = setTimeout(abort, timeoutMs);
    child.stdout.on('data', chunk => {
      if (settled) return;
      out += chunk.toString();
      if (Buffer.byteLength(out, 'utf8') > 8192) abort();
    });
    child.on('error', () => finish(null));
    child.on('close', code => {
      if (settled) return;
      try {
        const result = JSON.parse(out);
        if (code !== 0 || result.status !== 'passed' || result.mode !== 'local_injected'
          || result.scenarioCount !== 3 || result.resetCount !== 3) throw Error('failed');
        finish({ report: ownedFile(base, result.reportPath, 'report.html'),
          evidence: ownedFile(base, result.evidencePath, 'evidence.json') });
      } catch { finish(null); }
    });
  });
}
/** Credential-free child process that runs the real bundled classifier on synthetic text. */
export async function runModelDiagnostic({ spawnChild = spawn, timeoutMs = 20_000 } = {}) {
  return new Promise(done => {
    let child;
    try {
      child = spawnChild(process.execPath,
        ['--no-warnings', '--experimental-strip-types', join(root, 'scripts', 'judge-ai-demo.mjs')],
        { cwd: root, env: createRehearsalWorkerEnvironment(process.env),
          stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    } catch { done(null); return; }
    let html = '', settled = false;
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timer); done(result);
    };
    const abort = () => {
      // Reject before sending kill. Even an immediate successful close cannot
      // convert a deadline or output-limit breach into accepted model HTML.
      finish(null);
      try { child.kill(); } catch { /* A failed kill cannot authorize a response. */ }
    };
    const timer = setTimeout(abort, timeoutMs);
    child.stdout.on('data', part => {
      if (settled) return;
      html += part.toString();
      if (Buffer.byteLength(html, 'utf8') > 131072) abort();
    });
    child.on('error', abort);
    child.on('close', code => finish(code === 0 ? html : null));
  });
}
function acceptedModelHtml(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 131072
    || !html.includes('<title>Actual local AI diagnostic | RightsReceipt</title>')
    || !html.includes('Actual local model, no payment authority.')
    || !html.includes('Classifier margins are not calibrated probabilities.')
    || /<script\b|<iframe\b|<img\b/iu.test(html)) throw Error('invalid_model_report');
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/u.exec(html)?.[1];
  if (!/^default-src 'none'; script-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'; base-uri 'none'; form-action 'none'$/u.test(csp ?? '')) {
    throw Error('invalid_model_report');
  }
  return { html, csp };
}
async function readForm(req) {
  let body = '';
  for await (const part of req) { body += part.toString(); if (body.length > 1024) throw Error('long_body'); }
  return new URLSearchParams(body);
}
/** Injected runner makes loopback behavior testable without payment/provider calls. */
export async function startJudgeConsole({ runner = runRehearsal, modelRunner = runModelDiagnostic,
  base = join(root, '.data', 'judge-console') } = {}) {
  requireRehearsalRuntime(); mkdirSync(base, { recursive: true, mode: 0o700 });
  const csrf = token(), state = { count: 0, running: false, result: null };
  let host, modelPromise = null;
  const server = createServer(async (req, res) => {
    if (req.headers.host !== host || req.url?.includes('?')) { send(res, 400, 'Invalid request'); return; }
    if (req.url === '/' && req.method === 'GET') {
      const nonce = randomBytes(16).toString('hex');
      send(res, 200, renderJudgeConsolePage({ token: csrf, nonce, state }),
        'text/html; charset=utf-8', judgeConsoleStylePolicy(nonce));
      return;
    }
    if (req.url === '/model' && req.method === 'GET') {
      if (!modelPromise) modelPromise = Promise.resolve().then(modelRunner);
      try {
        const { html, csp } = acceptedModelHtml(await modelPromise);
        send(res, 200, html, 'text/html; charset=utf-8', csp);
      } catch {
        modelPromise = null;
        send(res, 503, 'Actual local AI diagnostic unavailable');
      }
      return;
    }
    if (['/report', '/evidence'].includes(req.url) && req.method === 'GET') {
      if (!state.result) { send(res, 404, 'No completed rehearsal'); return; }
      const report = req.url === '/report';
      send(res, 200, state.result[report ? 'report' : 'evidence'],
        report ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
        report ? state.result.reportCsp : undefined);
      return;
    }
    if (req.url === '/run' && req.method === 'POST') {
      if (req.headers.origin !== `http://${host}` || !String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded')) { send(res, 403, 'Invalid request'); return; }
      let form;
      try { form = await readForm(req); } catch { send(res, 400, 'Invalid request'); return; }
      if (form.get('token') !== csrf || [...form.keys()].join() !== 'token') { send(res, 403, 'Invalid request'); return; }
      if (state.running || state.count >= 5) { send(res, state.running ? 409 : 429, 'Run unavailable'); return; }
      state.running = true; state.count++; state.result = null;
      // Send the browser back immediately. A real rehearsal may take up to two minutes,
      // and the result must only be revealed after both artifacts pass validation.
      void Promise.resolve().then(() => runner(base))
        .then(candidate => { state.result = acceptedArtifacts(base, candidate); })
        .catch(() => { state.result = null; })
        .finally(() => { state.running = false; });
      res.writeHead(303, { ...headers('text/plain; charset=utf-8'), Location: '/' }); res.end('Review results'); return;
    }
    send(res, ['/','/run'].includes(req.url) ? 405 : 404, 'Unavailable');
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  host = `127.0.0.1:${server.address().port}`;
  return { origin: `http://${host}`, server };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    process.stdout.write('Usage: node scripts/judge-local-console.mjs\nRequires Node 22.13-22.x. Opens a loopback-only browser review console.\n');
  } else if (process.argv.length !== 2) process.exitCode = 2;
  else try {
    const app = await startJudgeConsole();
    process.stdout.write(`Open ${app.origin}/ to run the local licensing demonstration. Ctrl+C to stop.\n`);
  } catch { process.stderr.write('Unable to launch loopback judge console.\n'); process.exitCode = 1; }
}
