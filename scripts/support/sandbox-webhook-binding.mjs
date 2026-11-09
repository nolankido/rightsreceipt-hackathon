/** Private, exact-invoice binding for a one-shot Sandbox paid-webhook capture. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STATE_VERSION = 'rightsreceipt-paypal-sandbox-state-v1';
const BINDING_VERSION = 'rightsreceipt-sandbox-capture-invoice-binding-v1';
const invoicePattern = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const routePattern = /^\/webhooks\/paypal\/sandbox\/capture\/[0-9a-f]{48}\n$/u;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = code => Object.assign(new Error('Sandbox webhook invoice binding is unavailable.'), { code });

function privateFile(path, expectedName, maxBytes) {
  if (typeof path !== 'string' || !path || path.length > 4096 || basename(path) !== expectedName) {
    throw fail('capture_binding_path_invalid');
  }
  let actual, metadata;
  try {
    actual = resolve(path);
    metadata = lstatSync(actual);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > maxBytes) throw Error('invalid_file');
  } catch { throw fail('capture_binding_path_invalid'); }
  const rel = relative(root, realpathSync(actual)).split(sep).join('/');
  if (rel !== '.data' && !rel.startsWith('.data/')
    && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel)) {
    throw fail('capture_binding_path_invalid');
  }
  return actual;
}

function checkedPrivateRoute(path) {
  const actual = privateFile(path, 'private-route.txt', 256);
  if (!/^run-[A-Za-z0-9_-]+$/u.test(basename(dirname(actual)))) {
    throw fail('capture_binding_route_invalid');
  }
  let content;
  try { content = readFileSync(actual, 'utf8'); }
  catch { throw fail('capture_binding_route_invalid'); }
  if (!routePattern.test(content)) throw fail('capture_binding_route_invalid');
  return { directory: dirname(actual), routeHash: sha256(content.trim()) };
}

function checkedState(path) {
  const actual = privateFile(path, 'state.json', 256 * 1024);
  let record;
  try { record = JSON.parse(readFileSync(actual, 'utf8')); }
  catch { throw fail('capture_binding_state_invalid'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || record.schemaVersion !== STATE_VERSION || record.phase !== 'sent_checked'
    || !invoicePattern.test(record.invoiceId ?? '')
    || record.entry?.binding?.draft?.invoiceId !== record.invoiceId
    || record.entry?.sendState !== 'confirmed') {
    throw fail('capture_binding_state_invalid');
  }
  return record.invoiceId;
}

/** Called after Stage 1 and BEFORE the Sandbox buyer pays. No network calls. */
export function bindSandboxCaptureInvoice({ routeFile, statePath } = {}) {
  const { directory, routeHash } = checkedPrivateRoute(routeFile);
  const invoiceId = checkedState(statePath);
  const path = join(directory, 'invoice-binding.json');
  const record = { schemaVersion: BINDING_VERSION, invoiceId, routeSha256: routeHash };
  try { writeFileSync(path, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch { throw fail('capture_binding_already_exists'); }
  return Object.freeze({ status: 'bound', bindingPath: path, invoiceIdSha256: sha256(invoiceId) });
}

/** A missing binding must NEVER consume the one-shot capture slot. */
export function readSandboxCaptureInvoiceBinding({ directory, routePath } = {}) {
  if (typeof directory !== 'string' || typeof routePath !== 'string'
    || !routePattern.test(routePath + '\n')) throw fail('capture_binding_invalid');
  const path = join(directory, 'invoice-binding.json');
  let metadata;
  try { metadata = lstatSync(path); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw fail('capture_binding_invalid'); }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > 1024) {
    throw fail('capture_binding_invalid');
  }
  let record;
  try { record = JSON.parse(readFileSync(path, 'utf8')); }
  catch { throw fail('capture_binding_invalid'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).sort().join() !== 'invoiceId,routeSha256,schemaVersion'
    || record.schemaVersion !== BINDING_VERSION || !invoicePattern.test(record.invoiceId ?? '')
    || record.routeSha256 !== sha256(routePath)) throw fail('capture_binding_invalid');
  return Object.freeze({ invoiceId: record.invoiceId });
}
