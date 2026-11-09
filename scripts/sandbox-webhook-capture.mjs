#!/usr/bin/env node
/** Single-use local collector for a PayPal-delivered, UNVERIFIED invoice-paid webhook. */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOneShotCaptureLifecycle } from './support/one-shot-capture-lifecycle.mjs';
import { readSandboxCaptureInvoiceBinding } from './support/sandbox-webhook-binding.mjs';
import { acceptsSandboxWebhookTransmissionTime } from './support/sandbox-webhook-transmission-window.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY_BYTES = 131_072;
const CAPTURE_VERSION = 'rightsreceipt-paypal-webhook-capture-v1';
const EVENT = 'INVOICING.INVOICE.PAID';
const HEADERS = ['paypal-transmission-id', 'paypal-transmission-time', 'paypal-auth-algo',
  'paypal-cert-url', 'paypal-transmission-sig'];

function failed(code) { return Object.assign(new Error('Private webhook capture failed.'), { code }); }
function privateBase(input) {
  const target = resolve(input);
  const relativeToProject = relative(projectRoot, target).split(sep).join('/');
  if (relativeToProject !== '.data' && !relativeToProject.startsWith('.data/')
    && relativeToProject !== '..' && !relativeToProject.startsWith('../') && !isAbsolute(relativeToProject)) {
    throw failed('unsafe_private_path');
  }
  const root = parse(target).root;
  let cursor = root;
  try {
    for (const part of target.slice(root.length).split(sep).filter(Boolean)) {
      cursor = join(cursor, part);
      try { mkdirSync(cursor, { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      const info = lstatSync(cursor);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('unsafe_path');
    }
    return target;
  } catch { throw failed('unsafe_private_path'); }
}
function checkedHeaders(incoming) {
  const result = {};
  for (const name of HEADERS) {
    const value = incoming[name];
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048
      // eslint-disable-next-line no-control-regex -- Reject ASCII control characters in untrusted PayPal transmission headers.
      || /[\x00-\x1f\x7f]/u.test(value)) throw failed('capture_headers_invalid');
    result[name] = value;
  }
  if (!/^[A-Za-z0-9-]{1,200}$/u.test(result['paypal-transmission-id'])
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(result['paypal-transmission-time'])
    || !Number.isFinite(Date.parse(result['paypal-transmission-time']))
    || !acceptsSandboxWebhookTransmissionTime(result['paypal-transmission-time'])
    || result['paypal-auth-algo'] !== 'SHA256withRSA'
    || !/^https:\/\/api(?:-m)?\.sandbox\.paypal\.com\/v1\/notifications\/certs\/CERT-[A-Za-z0-9-]{1,160}$/u.test(result['paypal-cert-url'])
    || !/^[A-Za-z0-9+/]+={0,2}$/u.test(result['paypal-transmission-sig'])
    || result['paypal-transmission-sig'].length < 64) throw failed('capture_headers_invalid');
  return result;
}
async function boundedBody(req) {
  const length = req.headers['content-length'];
  if (length !== undefined && (typeof length !== 'string' || !/^\d+$/u.test(length)
    || Number(length) > MAX_BODY_BYTES)) throw failed('capture_body_invalid');
  const chunks = [];
  let total = 0;
  try {
    for await (const part of req) {
      total += part.byteLength;
      if (total > MAX_BODY_BYTES) throw failed('capture_body_invalid');
      chunks.push(part);
    }
  } catch { throw failed('capture_body_invalid'); }
  if (total === 0 || (length !== undefined && Number(length) !== total)) throw failed('capture_body_invalid');
  let body;
  try { body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw failed('capture_body_invalid'); }
  return body;
}
function paidEvent(raw) {
  let event;
  try { event = JSON.parse(raw); } catch { throw failed('capture_body_invalid'); }
  if (!event || typeof event !== 'object' || Array.isArray(event)
    || typeof event.event_type !== 'string') throw failed('capture_body_invalid');
  if (event.event_type !== EVENT) return false;
  const invoice = event.resource?.invoice && typeof event.resource.invoice === 'object'
    ? event.resource.invoice : event.resource;
  if (!/^[A-Za-z0-9-]{1,200}$/u.test(event.id ?? '')
    || !/^INV2-[A-Za-z0-9-]{3,100}$/u.test(invoice?.id ?? '')
    || (event.resource?.invoice && event.resource?.id !== undefined && event.resource.id !== invoice.id)) {
    throw failed('capture_body_invalid');
  }
  // PayPal may emit this event type for partially paid or pending invoices.
  // Only the exact PAID state qualifies for this one-shot acceptance collector.
  return invoice.status === 'PAID' ? invoice.id : null;
}
function cleanReply(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  });
  res.end(message);
}

/** The operator must separately forward a public HTTPS:443 URL to this loopback socket. */
export async function startSandboxWebhookCapture({ port = 8788, output = join(projectRoot, '.data', 'sandbox-webhook-capture'),
  timeoutMs = 30 * 60_000 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535 || !Number.isInteger(timeoutMs)
    || timeoutMs < 100 || timeoutMs > 60 * 60_000) throw failed('capture_arguments_invalid');
  const base = privateBase(output);
  const directory = mkdtempSync(join(base, 'run-'));
  const routePath = '/webhooks/paypal/sandbox/capture/' + randomBytes(24).toString('hex');
  const routeFile = join(directory, 'private-route.txt');
  writeFileSync(routeFile, routePath + '\n', { flag: 'wx', mode: 0o600 });
  const capturePath = join(directory, 'capture.json');
  const lifecycle = createOneShotCaptureLifecycle();
  let finishCapture;
  const captured = new Promise(resolveCapture => { finishCapture = resolveCapture; });
  let timer;
  const complete = value => {
    if (!lifecycle.finish()) return;
    clearTimeout(timer);
    finishCapture(value);
  };
  const server = createServer(async (req, res) => {
    if (lifecycle.unavailable) { cleanReply(res, 410, 'Capture closed'); return; }
    if (req.url !== routePath) { cleanReply(res, 404, 'Not found'); return; }
    // Private-route HEAD is a side-effect-free local readiness probe. It never
    // reserves a capture slot or accepts unverified payment evidence.
    if (req.method === 'HEAD') {
      res.writeHead(204, {
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
        'X-RightsReceipt-Capture-Ready': 'unverified-local-v1',
      });
      res.end();
      return;
    }
    if (req.method !== 'POST') { cleanReply(res, 405, 'Method unavailable'); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type'] ?? '')
      || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) {
      cleanReply(res, 415, 'Unsupported content'); return;
    }
    req.setTimeout(10_000, () => req.destroy());
    try {
      const headers = checkedHeaders(req.headers);
      const body = await boundedBody(req);
      if (lifecycle.unavailable) { cleanReply(res, 410, 'Capture closed'); return; }
      const invoiceId = paidEvent(body);
      if (!invoiceId) { cleanReply(res, 202, 'Ignored event'); return; }
      let binding;
      try { binding = readSandboxCaptureInvoiceBinding({ directory, routePath }); }
      catch { cleanReply(res, 503, 'Invoice binding unavailable'); return; }
      if (!binding) { cleanReply(res, 503, 'Invoice binding unavailable'); return; }
      if (invoiceId !== binding.invoiceId) { cleanReply(res, 202, 'Unrelated invoice ignored'); return; }
      if (!lifecycle.claim()) { cleanReply(res, 410, 'Capture closed'); return; }
      // Preserve the exact received UTF-8 body string, not a reserialized event.
      const data = { schemaVersion: CAPTURE_VERSION, headers, body };
      writeFileSync(capturePath, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      cleanReply(res, 200, 'Captured for later verification');
      complete({ status: 'captured_unverified', capturePath, directory });
    } catch {
      if (lifecycle.phase === 'finished') cleanReply(res, 410, 'Capture closed');
      else if (lifecycle.phase === 'claimed') {
        complete({ status: 'failed', code: 'capture_write_failed' });
        cleanReply(res, 503, 'Capture unavailable');
      } else cleanReply(res, 400, 'Invalid webhook request');
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 15_000;
  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(port, '127.0.0.1', resolveListen);
    });
  } catch { throw failed('capture_listener_unavailable'); }
  const origin = 'http://127.0.0.1:' + server.address().port;
  // Store only a loopback origin beside the private route, never the combined
  // callback URL. The preflight uses this to verify a live collector exists.
  try {
    writeFileSync(join(directory, 'private-local-origin.txt'), origin + '\n',
      { flag: 'wx', mode: 0o600 });
  } catch {
    server.close();
    throw failed('capture_listener_unavailable');
  }
  timer = setTimeout(() => complete({ status: 'failed', code: 'capture_timeout' }), timeoutMs);
  return { server, origin, directory,
    routeFile, routePath, capturePath, captured, close: () => new Promise(resolveClose => {
      clearTimeout(timer);
      complete({ status: 'failed', code: 'capture_closed' });
      server.close(() => resolveClose());
    }) };
}
function parseArgs(rawArgs) {
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const option = args[i], next = args[++i];
    if (!['--port', '--output'].includes(option) || !next || next.startsWith('--')
      || Object.hasOwn(options, option)) throw failed('capture_arguments_invalid');
    options[option] = next;
  }
  if (options['--port'] !== undefined && !/^\d{1,5}$/u.test(options['--port'])) throw failed('capture_arguments_invalid');
  return { port: options['--port'] === undefined ? 8788 : Number(options['--port']),
    output: options['--output'] };
}
export async function main(args = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(args); }
  catch { process.stderr.write('Usage: node scripts/sandbox-webhook-capture.mjs [--port PORT] [--output PRIVATE_DIRECTORY]\n'); return 2; }
  if (options.help) {
    process.stdout.write('One-shot, UNVERIFIED PayPal paid-invoice capture on 127.0.0.1. Requires an operator-provided HTTPS:443 forwarding URL.\n'
      + 'Usage: node scripts/sandbox-webhook-capture.mjs [--port PORT] [--output PRIVATE_DIRECTORY]\n');
    return 0;
  }
  let collector;
  try { collector = await startSandboxWebhookCapture(options); }
  catch (error) {
    process.stderr.write('Capture setup failed: ' + (error.code ?? 'capture_failed') + '\n'); return 1;
  }
  process.stdout.write(JSON.stringify({ status: 'listening_unverified', origin: collector.origin,
    privateRouteFile: collector.routeFile, note: 'Use a separately configured public HTTPS forwarding listener. Do not publish the private route.' }) + '\n');
  const result = await collector.captured;
  await collector.close();
  process.stdout.write(JSON.stringify(result.status === 'captured_unverified'
    ? { status: result.status, capturePath: result.capturePath,
      note: 'NOT verified. Run the existing PayPal signature checker with the captured file and the original invoice state.' }
    : { status: 'failed', code: result.code ?? 'capture_failed' }) + '\n');
  return result.status === 'captured_unverified' ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
