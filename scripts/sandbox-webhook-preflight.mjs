#!/usr/bin/env node
/** Explicit read-only Sandbox registration check, safe to run before creating an invoice. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifySandboxWebhookRegistration } from "./support/sandbox-webhook-readiness.mjs";
import { expectedSandboxWebhookUrl } from "./support/sandbox-webhook-target.mjs";
import { verifyLocalSandboxCollector } from "./support/sandbox-webhook-local-health.mjs";
import { verifySandboxPublicForwarder } from "./support/sandbox-webhook-public-health.mjs";

const usage = `RightsReceipt Sandbox webhook registration preflight

Usage: node scripts/sandbox-webhook-preflight.mjs [--probe-public|--help]

Checks a registered Sandbox REST app webhook using OAuth and a read-only
GET /v1/notifications/webhooks from the same app as invoicing.
In private-route-file mode it first sends a side-effect-free HEAD request
ONLY to the collector on 127.0.0.1, rejecting a stopped or replaced listener.
With --probe-public in one-shot collector mode, also sends one credential-free,
redirect-locked HEAD to the exact public HTTPS callback and requires the same
unverified collector marker before contacting PayPal. Hosted callbacks do not
support this collector-specific option.
Requires PAYPAL_SANDBOX_CLIENT_ID, PAYPAL_SANDBOX_CLIENT_SECRET,
PAYPAL_SANDBOX_WEBHOOK_ID, and either an exact PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL
or both PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN and
PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE for a one-shot collector.
The exact current HTTPS callback must match its PayPal registration.
No actual private callback URL is printed. No invoice or payment is created.
Never creates an invoice or modifies webhook registrations. A public HEAD
response only proves forwarding at that moment. Does not prove that PayPal
can deliver a signed webhook, that payment occurred or future reachability.
`;
export async function main(args = process.argv.slice(2), env = process.env,
  fetchImpl = globalThis.fetch, io = process) {
  if (args.length === 1 && args[0] === "--help") { io.stdout.write(usage); return 0; }
  const probePublic = args.length === 1 && args[0] === '--probe-public';
  if (args.length !== 0 && !probePublic) {
    io.stderr.write("Invalid arguments. Use --help.\n"); return 2;
  }
  try {
    if (probePublic) {
      if (env?.PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL !== undefined
        || typeof env?.PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE !== 'string'
        || typeof env?.PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN !== 'string') {
        throw Object.assign(new Error('Collector mode required.'), {
          code: 'webhook_public_probe_collector_required',
        });
      }
      const callback = expectedSandboxWebhookUrl(env);
      await verifyLocalSandboxCollector(env.PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE);
      await verifySandboxPublicForwarder(callback, fetchImpl);
    }
    const result = await verifySandboxWebhookRegistration({ env, fetchImpl });
    const output = probePublic ? {
      ...result, publicForwarderReady: true,
      note: 'The registered callback and current public forwarding route passed read-only checks. This does not prove a signed webhook or payment.',
    } : result;
    io.stdout.write(JSON.stringify(output, null, 2) + "\n");
    return 0;
  } catch (error) {
    const code = typeof error?.code === "string"
      && /^webhook_(?:preflight|public_probe)_[a-z_]+$/u.test(error.code)
      ? error.code : "webhook_preflight_failed";
    io.stdout.write(JSON.stringify({ status: "failed", code }) + "\n");
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
