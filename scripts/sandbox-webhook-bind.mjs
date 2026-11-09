#!/usr/bin/env node
/** One-time private invoice binding after Sandbox invoice send, before buyer payment. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindSandboxCaptureInvoice } from './support/sandbox-webhook-binding.mjs';

const usage = 'Usage: node scripts/sandbox-webhook-bind.mjs --route-file PRIVATE_ROUTE_FILE --state PRIVATE_INVOICE_STATE\n'
  + 'Read-only invoice state; writes an exclusive local binding, no PayPal API calls or private invoice ID output.\n';
export function parseArgs(raw) {
  const args = raw[0] === '--' ? raw.slice(1) : raw;
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.length !== 4) return null;
  const seen = new Map();
  for (let i=0;i<4;i+=2) {
    if (!['--route-file','--state'].includes(args[i]) || !args[i+1] || args[i+1].startsWith('--') || seen.has(args[i])) return null;
    seen.set(args[i],args[i+1]);
  }
  if (seen.size !== 2) return null;
  return { routeFile:seen.get('--route-file'), statePath:seen.get('--state') };
}
export function main(args = process.argv.slice(2)) {
  const parsed = parseArgs(args);
  if (!parsed) { process.stderr.write(usage); return 2; }
  if (parsed.help) { process.stdout.write(usage); return 0; }
  try {
    const result = bindSandboxCaptureInvoice(parsed);
    process.stdout.write(JSON.stringify({ ...result, note:'A private, unverified invoice match is required for the next matching paid webhook. Signature verification remains separate.' },null,2)+'\n');
    return 0;
  } catch (error) {
    const code = typeof error?.code === 'string' && /^capture_binding_[a-z_]+$/u.test(error.code)
      ? error.code : 'capture_binding_failed';
    process.stdout.write(JSON.stringify({status:'failed',code})+'\n');
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
