#!/usr/bin/env node
/** Offline, value-free handoff before genuine PayPal Sandbox acceptance. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'rightsreceipt-sandbox-local-readiness-v1';
const COMMON = Object.freeze([
  'PAYPAL_SANDBOX_CLIENT_ID',
  'PAYPAL_SANDBOX_CLIENT_SECRET',
  'PAYPAL_SANDBOX_MERCHANT_NAME',
  'PAYPAL_SANDBOX_MERCHANT_EMAIL',
  'PAYPAL_SANDBOX_BUYER_EMAIL',
  'PAYPAL_SANDBOX_WEBHOOK_ID',
]);
const HOSTED = 'PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL';
const COLLECTOR = Object.freeze([
  'PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN',
  'PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE',
]);
const usage = `RightsReceipt genuine Sandbox local setup check

Usage: node scripts/sandbox-acceptance-readiness.mjs [--help]

Reports only fixed environment variable names and a callback-mode choice.
No environment values, tokens, account identifiers or callback URLs are printed.
No network call, PayPal invoice, webhook registration or payment is performed.
A locally configured result is not authenticated PayPal readiness; next run
the existing registered-webhook preflight with your private environment.
`;

function present(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || value !== value.trim()) return false;
  for (const char of value) {
    const point = char.codePointAt(0);
    if (point < 0x20 || point === 0x7f) return false;
  }
  return true;
}
function selected(value) {
  return typeof value === 'string' && value.length > 0;
}

/** Never copy an environment value into the result, including on failure. */
export function inspectSandboxLocalReadiness(env = {}) {
  const missingCommon = COMMON.filter(name => !present(env?.[name]));
  const hostedSelected = selected(env?.[HOSTED]);
  const collectorSelected = COLLECTOR.some(name => selected(env?.[name]));
  let callbackMode, missingCallback = [];
  if (hostedSelected && collectorSelected) {
    callbackMode = 'conflict';
  } else if (hostedSelected) {
    callbackMode = present(env[HOSTED]) ? 'hosted' : 'hosted_incomplete';
    if (callbackMode === 'hosted_incomplete') missingCallback = [HOSTED];
  } else if (collectorSelected) {
    missingCallback = COLLECTOR.filter(name => !present(env[name]));
    callbackMode = missingCallback.length ? 'collector_incomplete' : 'collector';
  } else {
    callbackMode = 'not_selected';
  }
  const configurationPresent = missingCommon.length === 0
    && (callbackMode === 'hosted' || callbackMode === 'collector');
  const nextStep = callbackMode === 'conflict' ? 'choose_one_callback_mode'
    : callbackMode === 'not_selected' ? 'choose_callback_mode'
      : !configurationPresent ? 'configure_missing_environment'
        : 'run_registered_webhook_preflight';
  return {
    schemaVersion: SCHEMA,
    status: configurationPresent ? 'configuration_present_not_verified' : 'blocked',
    callbackMode,
    missingEnvironment: [...missingCommon, ...missingCallback],
    ...(callbackMode === 'not_selected' ? {
      callbackChoices: [[HOSTED], [...COLLECTOR]],
    } : {}),
    nextStep,
    networkRequests: 0,
    limitation: 'Local variable presence only; not proof of PayPal registration, payment or a verified webhook.',
  };
}

export function main(args = process.argv.slice(2), env = process.env, io = process) {
  if (args.length === 1 && args[0] === '--help') {
    io.stdout.write(usage);
    return 0;
  }
  if (args.length !== 0) {
    io.stdout.write(JSON.stringify({ status: 'failed', code: 'invalid_arguments' }) + '\n');
    return 2;
  }
  const result = inspectSandboxLocalReadiness(env);
  io.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.status === 'configuration_present_not_verified' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
