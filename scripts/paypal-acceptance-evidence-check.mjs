#!/usr/bin/env node
/** Reconcile sanitized Sandbox evidence. This cannot attest to provider origin. */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptanceLinkageErrors } from "./support/sandbox-acceptance-linkage.mjs";

const EVIDENCE_VERSION = "rightsreceipt-paypal-sandbox-acceptance-v1";
const RESULT_VERSION = "rightsreceipt-paypal-acceptance-evidence-check-v1";
const MAX_FILE_BYTES = 131072;
const EXPECTED_CENTS = 42500;
const INVOICE_ID = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const LIMITATION = "Internal consistency check only. These JSON files are not independent proof of PayPal API calls, Sandbox payment, a signed webhook or live deployment.";

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function completeHttpCall(document, method, path) {
  return Array.isArray(document?.httpCalls) && document.httpCalls.some(call =>
    isRecord(call) && call.method === method && call.path === path
    && Number.isInteger(call.status) && call.status >= 200 && call.status < 300);
}
function hasSensitiveContent(document) {
  const serialized = JSON.stringify(document) ?? "";
  return /"(?:access[_-]?token|client[_-]?secret|authorization|headers|raw[_-]?body|body|paypal-transmission-sig|recipientEmail|buyerEmail|merchantEmail|paymentUrl)"\s*:/iu.test(serialized)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(serialized)
    || /(?:Bearer\s+[A-Za-z0-9._~-]{10,}|Basic\s+[A-Za-z0-9+/=]{10,})/iu.test(serialized);
}
function common(document, mode, errors, label) {
  if (!isRecord(document)) {
    errors.add(label + "_missing");
    return false;
  }
  if (document.schemaVersion !== EVIDENCE_VERSION || document.mode !== mode
    || document.status !== "passed" || document.environment !== "sandbox"
    || document.provider !== "paypal" || document.canonicalAmountCents !== EXPECTED_CENTS
    || document.productionEndpointUsed !== false || document.credentialsPersisted !== false
    || document.simulated === true || document.authoritativePaymentEvidence === false) {
    errors.add(label + "_provenance_invalid");
  }
  if (!Array.isArray(document.httpCalls) || document.httpCalls.length === 0
    || document.httpCalls.length > 64 || document.httpCalls.some(call => !isRecord(call)
      || typeof call.path !== "string" || !/^\/v[12]\//u.test(call.path)
      || !["GET","POST"].includes(call.method))) {
    errors.add(label + "_http_trace_invalid");
  }
  if (hasSensitiveContent(document)) errors.add(label + "_sensitive_content");
  return true;
}

export function evaluateAcceptanceEvidence({ create, paid, webhook } = {}) {
  const errors = new Set();
  common(create, "create_send_check", errors, "create");
  common(paid, "status_check", errors, "paid");
  common(webhook, "webhook_verification", errors, "webhook");
  for (const code of acceptanceLinkageErrors({ create, paid, webhook })) errors.add(code);

  const createId = create?.invoice?.invoiceId;
  const paidId = paid?.invoice?.invoiceId;
  const webhookId = webhook?.webhook?.providerInvoiceId;
  if (!INVOICE_ID.test(createId ?? "") || !INVOICE_ID.test(paidId ?? "")
    || !INVOICE_ID.test(webhookId ?? "") || createId !== paidId || createId !== webhookId) {
    errors.add("invoice_binding_mismatch");
  }

  const creation = create?.invoice;
  if (!isRecord(creation) || !["UNPAID","SENT","SHARED"].includes(creation.status)
    || creation.amountCents !== EXPECTED_CENTS || creation.currency !== "USD"
    || creation.paymentUrlPresent !== true || creation.requiresReconciliation !== false
    || creation.settlement?.conclusion !== "unpaid"
    || create?.draftStatus !== "DRAFT") {
    errors.add("create_handoff_invalid");
  }

  const payment = paid?.invoice;
  if (!isRecord(payment) || payment.status !== "PAID"
    || payment.amountCents !== EXPECTED_CENTS || payment.currency !== "USD"
    || payment.requiresReconciliation !== false
    || payment.settlement?.conclusion !== "paid"
    || payment.settlement?.paidCents !== EXPECTED_CENTS
    || payment.settlement?.refundedCents !== 0
    || payment.settlement?.dueCents !== 0 || !HASH.test(paid?.stateSha256 ?? "")) {
    errors.add("settlement_not_proven");
  }

  const event = webhook?.webhook;
  if (!isRecord(event) || event.eventType !== "INVOICING.INVOICE.PAID"
    || event.resourceStatus !== "PAID" || event.verificationStatus !== "verified"
    || webhook?.matchedStateInvoice !== true || !HASH.test(event.payloadSha256 ?? "")
    || !HASH.test(event.eventIdSha256 ?? "") || !HASH.test(event.transmissionIdSha256 ?? "")
    || !HASH.test(webhook?.captureSha256 ?? "")) {
    errors.add("webhook_not_verified");
  }

  if (!INVOICE_ID.test(createId ?? "") || !completeHttpCall(create, "POST", "/v1/oauth2/token")
    || !completeHttpCall(create, "POST", "/v2/invoicing/invoices")
    || !completeHttpCall(create, "POST", "/v2/invoicing/invoices/" + createId + "/send")
    || !completeHttpCall(create, "GET", "/v2/invoicing/invoices/" + createId)) {
    errors.add("create_api_trace_missing");
  }
  if (!INVOICE_ID.test(paidId ?? "") || !completeHttpCall(paid, "GET", "/v2/invoicing/invoices/" + paidId)) {
    errors.add("paid_api_trace_missing");
  }
  if (!completeHttpCall(webhook, "POST", "/v1/notifications/verify-webhook-signature")) {
    errors.add("webhook_api_trace_missing");
  }

  const checks = [...errors].sort();
  return Object.freeze({
    schemaVersion: RESULT_VERSION,
    status: checks.length === 0 ? "passed" : "failed",
    invoiceIdSha256: checks.length === 0 ? sha256(createId) : null,
    errorCodes: checks,
    limitation: LIMITATION,
  });
}

export function readEvidenceFile(path) {
  try {
    const absolute = resolve(path);
    const stat = statSync(absolute);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_FILE_BYTES) throw new Error("invalid_size");
    return JSON.parse(readFileSync(absolute, "utf8"));
  } catch {
    throw Object.assign(new Error("Evidence unreadable or invalid."), { code: "evidence_unreadable" });
  }
}

function parseArgs(args) {
  const paths = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!["--create","--paid","--webhook"].includes(key) || paths[key] !== undefined
      || !args[i + 1] || args[i + 1].startsWith("--")) return null;
    paths[key] = args[++i];
  }
  if (Object.keys(paths).length !== 3) return null;
  return { create: paths["--create"], paid: paths["--paid"], webhook: paths["--webhook"] };
}

export function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (!options) {
    process.stderr.write("Provide --create FILE --paid FILE --webhook FILE. No Sandbox calls are made.\n");
    return 2;
  }
  let result;
  try {
    result = evaluateAcceptanceEvidence({
      create: readEvidenceFile(options.create),
      paid: readEvidenceFile(options.paid),
      webhook: readEvidenceFile(options.webhook),
    });
  } catch {
    result = {
      schemaVersion: RESULT_VERSION,
      status: "failed",
      invoiceIdSha256: null,
      errorCodes: ["evidence_unreadable"],
      limitation: LIMITATION,
    };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.status === "passed" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
