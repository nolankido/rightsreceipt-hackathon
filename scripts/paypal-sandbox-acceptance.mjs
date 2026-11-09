#!/usr/bin/env node
/** Genuine PayPal Sandbox acceptance harness. Never supports production PayPal. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createPayPalSandboxInvoiceAdapter } from "../packages/paypal/src/sandbox-invoice.ts";
import { createMemoryDeliveryJournal } from "../packages/paypal/src/delivery-journal.ts";
import { createSandboxWebhookHandler } from "../packages/paypal/src/webhook-intake.ts";
import { createMemoryWebhookInbox } from "../packages/paypal/src/webhook-inbox.ts";
import { PAYPAL_SANDBOX_BASE_URL } from "../packages/paypal/src/adapter.ts";
import { writeSandboxPaymentHandoff } from "./support/sandbox-payment-handoff.mjs";
import { verifySandboxWebhookRegistration } from "./support/sandbox-webhook-readiness.mjs";
import { sandboxLockedFetch } from "./support/sandbox-locked-fetch.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_VERSION = "rightsreceipt-paypal-sandbox-acceptance-v1";
const STATE_VERSION = "rightsreceipt-paypal-sandbox-state-v1";
const CAPTURE_VERSION = "rightsreceipt-paypal-webhook-capture-v1";
const CANONICAL_AMOUNT_CENTS = 42500;
const CANONICAL_SUMMARY = "Commercial paid Instagram and Facebook use in US and Canada for 90 days, crop only; no sublicensing or AI training.";

const usage = `RightsReceipt genuine PayPal Sandbox acceptance

Usage:
  node ... scripts/paypal-sandbox-acceptance.mjs create [--output DIRECTORY]
  node ... scripts/paypal-sandbox-acceptance.mjs check --state FILE [--output DIRECTORY]
  node ... scripts/paypal-sandbox-acceptance.mjs webhook --capture FILE --state FILE [--output DIRECTORY]

Commands:
  create   Create and send one canonical USD 425.00 Sandbox invoice, then GET it.
  check    Recheck a previously created invoice using its private state file.
  webhook  Verify one captured genuine Sandbox webhook through PayPal's verification API.

Required server-only environment for create:
  PAYPAL_SANDBOX_CLIENT_ID
  PAYPAL_SANDBOX_CLIENT_SECRET
  PAYPAL_SANDBOX_MERCHANT_NAME
  PAYPAL_SANDBOX_MERCHANT_EMAIL
  PAYPAL_SANDBOX_BUYER_EMAIL
  PAYPAL_SANDBOX_WEBHOOK_ID
  PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL (for a hosted or explicit callback)
    OR BOTH:
  PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN
  PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE (one-shot collector)

Required for check:
  PAYPAL_SANDBOX_CLIENT_ID
  PAYPAL_SANDBOX_CLIENT_SECRET
  PAYPAL_SANDBOX_MERCHANT_NAME
  PAYPAL_SANDBOX_MERCHANT_EMAIL

Webhook additionally requires the original private invoice state file and:
  PAYPAL_SANDBOX_WEBHOOK_ID

All network calls are restricted to https://api-m.sandbox.paypal.com.
Private state/captures must remain under .data or outside the repository.
No production PayPal origin is supported.
`;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function safeCode(error) {
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "acceptance_failed";
  return /^[a-z0-9_]{3,80}$/u.test(code) ? code : "acceptance_failed";
}
function required(env, key) {
  const value = env[key];
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    const error = new Error("Missing required Sandbox configuration."); error.code = "configuration_missing"; throw error;
  }
  return value;
}
function paymentConfig(env, webhook = false) {
  const config = {
    APP_MODE: "sandbox",
    PAYPAL_MODE: "paypal_sandbox",
    PAYPAL_BASE_URL: PAYPAL_SANDBOX_BASE_URL,
    PAYPAL_SANDBOX_CLIENT_ID: required(env, "PAYPAL_SANDBOX_CLIENT_ID"),
    PAYPAL_SANDBOX_CLIENT_SECRET: required(env, "PAYPAL_SANDBOX_CLIENT_SECRET"),
  };
  if (webhook) config.PAYPAL_SANDBOX_WEBHOOK_ID = required(env, "PAYPAL_SANDBOX_WEBHOOK_ID");
  return Object.freeze(config);
}
function merchant(env) {
  return Object.freeze({
    name: required(env, "PAYPAL_SANDBOX_MERCHANT_NAME"),
    email: required(env, "PAYPAL_SANDBOX_MERCHANT_EMAIL"),
  });
}
function parseArgs(args) {
  let command = null, output = null, state = null, capture = null, help = false;
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === "--help" || value === "-h") help = true;
    else if (["create","check","webhook"].includes(value) && command === null) command = value;
    else if (value === "--output" || value === "--state" || value === "--capture") {
      const next = args[++i];
      if (!next || next.startsWith("--")) throw Object.assign(new Error("Missing argument value."), { code: "invalid_arguments" });
      if (value === "--output") output = next;
      if (value === "--state") state = next;
      if (value === "--capture") capture = next;
    } else throw Object.assign(new Error("Unsupported argument."), { code: "invalid_arguments" });
  }
  if (help) return { help, command, output, state, capture };
  if (!command || (command === "check" && !state) || (command === "webhook" && (!capture || !state))) {
    throw Object.assign(new Error("Incomplete command."), { code: "invalid_arguments" });
  }
  return { help, command, output, state, capture };
}
function insideOrEqual(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}
function assertPhysicalPrivateOutput(destination) {
  const unsafe = () => {
    const error = new Error("Acceptance output must stay under .data or outside the repository.");
    error.code = "unsafe_private_path"; throw error;
  };
  let ancestor = destination;
  const missing = [];
  try {
    // Resolve the closest existing ancestor before creating anything. A lexical
    // .data path or a path outside the checkout may traverse a directory link
    // that lands inside tracked source files.
    while (!existsSync(ancestor)) {
      const parent = dirname(ancestor);
      if (parent === ancestor) unsafe();
      missing.unshift(basename(ancestor));
      ancestor = parent;
    }
    const physicalTarget = resolve(realpathSync(ancestor), ...missing);
    const physicalRoot = realpathSync(root);
    if (!insideOrEqual(physicalRoot, physicalTarget)) return;
    const allowedData = join(physicalRoot, ".data");
    if (!insideOrEqual(allowedData, physicalTarget)
      || (existsSync(allowedData) && realpathSync(allowedData) !== allowedData)) unsafe();
  } catch { unsafe(); }
}
function privateOutputBase(parent) {
  const base = resolve(root, parent ?? join(".data","paypal-sandbox-acceptance"));
  const rel = relative(root, base).split(sep).join("/");
  if (!rel.startsWith("../") && rel !== ".." && rel !== ".data" && !rel.startsWith(".data/")) {
    const error = new Error("Acceptance output must stay under .data or outside the repository.");
    error.code = "unsafe_private_path"; throw error;
  }
  assertPhysicalPrivateOutput(base);
  return base;
}
function runDirectory(parent) {
  const base = privateOutputBase(parent);
  mkdirSync(base, { recursive: true });
  // Repeat after mkdir to detect redirected ancestors present at write time.
  assertPhysicalPrivateOutput(base);
  const slug = new Date().toISOString().replace(/[:.]/gu,"-");
  const directory = join(base, `run-${slug}-${process.pid}`);
  mkdirSync(directory);
  return directory;
}
function privateInput(path) {
  const absolute = resolve(path);
  const rel = relative(root, absolute).split(sep).join("/");
  if (!rel.startsWith("../") && rel !== ".." && rel !== ".data" && !rel.startsWith(".data/")) {
    const error = new Error("Private acceptance inputs must stay under .data or outside the repository.");
    error.code = "unsafe_private_path"; throw error;
  }
  return absolute;
}
function writeJson(path, value, overwrite = false) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: overwrite ? "w" : "wx", mode: 0o600 });
}
function outputEvidence(directory, value) {
  const path = join(directory, "evidence.json");
  writeJson(path, value);
  return path;
}
function consentFromEntry(entry) {
  const binding = entry?.binding;
  if (!binding) throw Object.assign(new Error("Missing invoice binding."), { code: "state_invalid" });
  return Object.freeze({
    caseId: binding.draft.caseId,
    assetId: binding.assetId,
    quoteId: binding.draft.quoteId,
    termsVersionId: binding.draft.termsVersionId,
    creatorDecisionId: binding.creatorDecisionId,
    buyerAcceptanceId: binding.draft.buyerAcceptanceId,
    amountCents: binding.draft.amountCents,
    currency: binding.draft.currency,
  });
}
function exactConsent(expected) {
  const keys = ["caseId","assetId","quoteId","termsVersionId","creatorDecisionId","buyerAcceptanceId","amountCents","currency"];
  return async actual => keys.every(key => actual?.[key] === expected[key])
    && Object.keys(actual ?? {}).length === keys.length;
}
function snapshot(env) {
  const buyer = required(env, "PAYPAL_SANDBOX_BUYER_EMAIL");
  const seller = required(env, "PAYPAL_SANDBOX_MERCHANT_EMAIL");
  if (buyer.toLowerCase() === seller.toLowerCase()) {
    throw Object.assign(new Error("Buyer and merchant Sandbox accounts must differ."), { code: "configuration_invalid" });
  }
  return Object.freeze({
    caseId: randomUUID(),
    assetId: randomUUID(),
    termsVersionId: randomUUID(),
    quoteId: randomUUID(),
    creatorDecisionId: randomUUID(),
    buyerAcceptanceId: randomUUID(),
    amountCents: CANONICAL_AMOUNT_CENTS,
    currency: "USD",
    recipientEmail: buyer,
    rightsSummary: CANONICAL_SUMMARY,
    requestId: `rr_${randomUUID().replaceAll("-","")}`,
  });
}
function safeCalls(fetchImpl, calls) {
  return async (url, init = {}) => {
    const target = new URL(url);
    if (target.origin !== PAYPAL_SANDBOX_BASE_URL || target.username || target.password) {
      throw Object.assign(new Error("Only the PayPal Sandbox API is allowed."), { code: "live_endpoint_forbidden" });
    }
    const started = Date.now();
    try {
      const response = await sandboxLockedFetch(fetchImpl, url, init);
      calls.push(Object.freeze({ method: init.method ?? "GET", path: target.pathname, status: response.status, durationMs: Date.now() - started }));
      return response;
    } catch {
      calls.push(Object.freeze({ method: init.method ?? "GET", path: target.pathname, status: null, durationMs: Date.now() - started }));
      throw Object.assign(new Error("Sandbox network operation failed."), { code: "transport_unavailable" });
    }
  };
}
async function hydrateJournal(entry) {
  if (!entry || typeof entry !== "object" || !entry.binding || !entry.requestId || !entry.caseId
    || !entry.snapshotHash || !entry.merchantHash || !["not_started","started","confirmed"].includes(entry.sendState)) {
    throw Object.assign(new Error("Invalid private Sandbox state."), { code: "state_invalid" });
  }
  const journal = createMemoryDeliveryJournal();
  await journal.reserve({
    requestId: entry.requestId,
    caseId: entry.caseId,
    snapshotHash: entry.snapshotHash,
    merchantHash: entry.merchantHash,
  });
  await journal.complete(entry.requestId, entry.binding);
  if (entry.sendState === "started" || entry.sendState === "confirmed") {
    if (!await journal.claimSend(entry.binding.draft.invoiceId)) {
      throw Object.assign(new Error("Could not restore send journal."), { code: "state_invalid" });
    }
  }
  if (entry.sendState === "confirmed") await journal.confirmSend(entry.binding.draft.invoiceId);
  return journal;
}
function stateChecked(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
    || raw.schemaVersion !== STATE_VERSION || typeof raw.invoiceId !== "string"
    || !/^INV2-[A-Za-z0-9-]{3,100}$/u.test(raw.invoiceId)
    || !raw.entry || raw.entry.binding?.draft?.invoiceId !== raw.invoiceId) {
    throw Object.assign(new Error("Invalid private Sandbox state."), { code: "state_invalid" });
  }
  return raw;
}
function readState(path) {
  const absolute = privateInput(path);
  if (!existsSync(absolute)) throw Object.assign(new Error("State file not found."), { code: "state_missing" });
  let value;
  try { value = JSON.parse(readFileSync(absolute,"utf8")); } catch {
    throw Object.assign(new Error("State file is invalid."), { code: "state_invalid" });
  }
  return { path: absolute, value: stateChecked(value) };
}
function minimizedView(view) {
  return Object.freeze({
    invoiceId: view.invoiceId,
    status: view.status,
    amountCents: view.amountCents,
    currency: view.currency,
    paymentUrlPresent: typeof view.paymentUrl === "string",
    requiresReconciliation: view.requiresReconciliation === true,
    settlement: {
      conclusion: view.settlement?.conclusion ?? null,
      reason: view.settlement?.reason ?? null,
      paidCents: view.settlement?.paidCents ?? null,
      refundedCents: view.settlement?.refundedCents ?? null,
      dueCents: view.settlement?.dueCents ?? null,
    },
  });
}
function stateRecord(entry, invoiceId, phase) {
  return Object.freeze({
    schemaVersion: STATE_VERSION,
    updatedAt: new Date().toISOString(),
    phase,
    invoiceId,
    entry,
  });
}
function acceptanceBase(mode, calls) {
  return {
    schemaVersion: EVIDENCE_VERSION,
    generatedAt: new Date().toISOString(),
    mode,
    environment: "sandbox",
    provider: "paypal",
    canonicalAmountCents: CANONICAL_AMOUNT_CENTS,
    httpCalls: calls,
    credentialsPersisted: false,
    productionEndpointUsed: false,
  };
}

export async function runCreate({ env = process.env, fetchImpl = globalThis.fetch, output = null } = {}) {
  if (typeof fetchImpl !== "function") throw Object.assign(new Error("Fetch is unavailable."), { code: "transport_unavailable" });
  const config = paymentConfig(env), seller = merchant(env), request = snapshot(env);
  // Reject redirected private output before OAuth or webhook-registration GET.
  privateOutputBase(output);
  // Confirm the registered paid-invoice webhook belongs to these exact Sandbox
  // app credentials before creating or sending any provider invoice.
  const webhookReadiness = await verifySandboxWebhookRegistration({ env, fetchImpl });
  const directory = runDirectory(output), calls = [], journal = createMemoryDeliveryJournal();
  const expected = Object.freeze({
    caseId: request.caseId, assetId: request.assetId, quoteId: request.quoteId,
    termsVersionId: request.termsVersionId, creatorDecisionId: request.creatorDecisionId,
    buyerAcceptanceId: request.buyerAcceptanceId, amountCents: request.amountCents, currency: request.currency,
  });
  const adapter = createPayPalSandboxInvoiceAdapter(config, {
    fetch: safeCalls(fetchImpl,calls),
    merchant: seller,
    sandboxDraftTransportEnabled: true,
    sandboxInvoiceTransportEnabled: true,
    journal,
    authorize: exactConsent(expected),
  });
  let statePath = null, invoiceId = null;
  try {
    const draft = await adapter.createDraftInvoice(request);
    invoiceId = draft.invoiceId;
    const draftEntry = await journal.byInvoice(draft.invoiceId);
    if (!draftEntry?.binding) throw Object.assign(new Error("Draft journal binding unavailable."), { code: "state_invalid" });
    statePath = join(directory,"state.json");
    writeJson(statePath,stateRecord(draftEntry,draft.invoiceId,"draft_bound"));

    const sent = await adapter.sendInvoice(draft.invoiceId);
    const current = await adapter.getInvoice(draft.invoiceId);
    if (!["UNPAID","SENT","SHARED"].includes(current.status) || typeof current.paymentUrl !== "string"
      || current.requiresReconciliation || current.settlement?.conclusion !== "unpaid") {
      throw Object.assign(new Error("Sent Sandbox invoice is not safely payable."), { code: "payable_handoff_missing" });
    }
    const entry = await journal.byInvoice(draft.invoiceId);
    if (!entry?.binding) throw Object.assign(new Error("Sent journal binding unavailable."), { code: "state_invalid" });
    writeJson(statePath,stateRecord(entry,draft.invoiceId,"sent_checked"),true);
    // This link is a private payer handoff, never public evidence or console text.
    const handoffPath = writeSandboxPaymentHandoff(directory,current);

    const evidence = {
      ...acceptanceBase("create_send_check",calls),
      status: "passed",
      invoice: minimizedView(current),
      draftStatus: draft.status,
      sendStatus: sent.status,
      stateFile: "state.json",
      stateSha256: digest(readFileSync(statePath)),
      webhookRegistration: {
        status: webhookReadiness.status,
        subscribedEvent: webhookReadiness.subscribedEvent,
        webhookIdSha256: webhookReadiness.webhookIdSha256,
        exactCallbackChecked: webhookReadiness.exactCallbackChecked,
      },
      note: "Invoice creation, sending and status retrieval used the project's real Sandbox adapter. Payment is not inferred from this run.",
    };
    return { status: "passed", directory, statePath, handoffPath, evidencePath: outputEvidence(directory,evidence), evidence };
  } catch (error) {
    const errorCode = safeCode(error);
    if (statePath && invoiceId) {
      try {
        const latest = await journal.byInvoice(invoiceId);
        if (latest?.binding) writeJson(statePath,stateRecord(latest,invoiceId,`failed_${errorCode}`),true);
      } catch { /* Preserve the earlier private state rather than masking the original failure. */ }
    }
    const evidence = {
      ...acceptanceBase("create_send_check",calls),
      status: "failed",
      errorCode,
      stateFile: statePath ? "state.json" : null,
    };
    return { status: "failed", directory, statePath, evidencePath: outputEvidence(directory,evidence), evidence };
  }
}

export async function runCheck({ env = process.env, fetchImpl = globalThis.fetch, state, output = null } = {}) {
  if (!state) throw Object.assign(new Error("State is required."), { code: "invalid_arguments" });
  const config = paymentConfig(env), seller = merchant(env), saved = readState(state);
  const directory = runDirectory(output), calls = [], entry = saved.value.entry, journal = await hydrateJournal(entry);
  const adapter = createPayPalSandboxInvoiceAdapter(config, {
    fetch: safeCalls(fetchImpl,calls),
    merchant: seller,
    sandboxDraftTransportEnabled: true,
    sandboxInvoiceTransportEnabled: true,
    journal,
    authorize: exactConsent(consentFromEntry(entry)),
  });
  try {
    const current = await adapter.getInvoice(saved.value.invoiceId);
    // A subsequent unpaid status read can recover a private payer link without a resend.
    const handoffPath = writeSandboxPaymentHandoff(directory,current);
    const invoice = minimizedView(current);
    const fullyPaid = invoice.status === "PAID"
      && invoice.amountCents === CANONICAL_AMOUNT_CENTS && invoice.currency === "USD"
      && invoice.requiresReconciliation === false && invoice.settlement?.conclusion === "paid"
      && invoice.settlement?.paidCents === CANONICAL_AMOUNT_CENTS
      && invoice.settlement?.refundedCents === 0 && invoice.settlement?.dueCents === 0;
    const awaitingBuyer = ["UNPAID", "SENT", "SHARED"].includes(invoice.status)
      && invoice.amountCents === CANONICAL_AMOUNT_CENTS && invoice.currency === "USD"
      && invoice.paymentUrlPresent === true && handoffPath !== null
      && invoice.requiresReconciliation === false && invoice.settlement?.conclusion === "unpaid";
    const status = fullyPaid ? "passed" : awaitingBuyer ? "payment_pending" : "failed";
    const evidence = {
      ...acceptanceBase("status_check",calls),
      status,
      invoice,
      ...(fullyPaid ? {} : { errorCode: awaitingBuyer ? "buyer_payment_pending" : "settlement_not_proven" }),
      stateSha256: digest(readFileSync(saved.path)),
      note: "An authenticated Sandbox GET is not itself payment proof. A passing status requires exact settled financial transaction detail.",
    };
    return { status, directory, handoffPath, evidencePath: outputEvidence(directory,evidence), evidence };
  } catch (error) {
    const evidence = {
      ...acceptanceBase("status_check",calls),
      status: "failed",
      errorCode: safeCode(error),
      stateSha256: digest(readFileSync(saved.path)),
    };
    return { status: "failed", directory, evidencePath: outputEvidence(directory,evidence), evidence };
  }
}
function webhookCapture(path) {
  const absolute = privateInput(path);
  if (!existsSync(absolute)) throw Object.assign(new Error("Webhook capture not found."), { code: "capture_missing" });
  let raw;
  try { raw = JSON.parse(readFileSync(absolute,"utf8")); } catch {
    throw Object.assign(new Error("Webhook capture is invalid."), { code: "capture_invalid" });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.schemaVersion !== CAPTURE_VERSION
    || typeof raw.body !== "string" || !raw.body.length || raw.body.length > 131072
    || !raw.headers || typeof raw.headers !== "object" || Array.isArray(raw.headers)) {
    throw Object.assign(new Error("Webhook capture is invalid."), { code: "capture_invalid" });
  }
  const normalized = Object.fromEntries(Object.entries(raw.headers).map(([key,value]) => [key.toLowerCase(),value]));
  const requiredHeaders = ["paypal-transmission-id","paypal-transmission-time","paypal-auth-algo","paypal-cert-url","paypal-transmission-sig"];
  if (requiredHeaders.some(key => typeof normalized[key] !== "string")) {
    throw Object.assign(new Error("Webhook capture headers are incomplete."), { code: "capture_invalid" });
  }
  return { absolute, body: raw.body, headers: normalized };
}
export async function runWebhook({ env = process.env, fetchImpl = globalThis.fetch, capture, state = null, output = null } = {}) {
  if (!capture) throw Object.assign(new Error("Capture is required."), { code: "invalid_arguments" });
  if (!state) throw Object.assign(new Error("Trusted invoice state is required for webhook acceptance."), { code: "state_required" });
  const config = paymentConfig(env,true), saved = readState(state), input = webhookCapture(capture);
  const directory = runDirectory(output), calls = [], inbox = createMemoryWebhookInbox();
  const handler = createSandboxWebhookHandler(config, {
    sandboxWebhookIntakeEnabled: true,
    fetch: safeCalls(fetchImpl,calls),
    inbox,
  });
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  for (const [key,value] of Object.entries(input.headers)) {
    if (typeof value === "string") headers.set(key,value);
  }
  try {
    const response = await handler(new Request("https://rightsreceipt.invalid/webhooks/paypal/sandbox", {
      method: "POST", headers, body: input.body,
    }));
    const responseBody = await response.json();
    const rows = inbox.snapshot();
    if (response.status !== 200 || rows.length !== 1 || responseBody.status !== "accepted") {
      const error = new Error("Captured webhook was not accepted."); error.code = responseBody.code ?? "webhook_not_accepted"; throw error;
    }
    const row = rows[0];
    if (row.providerInvoiceId !== saved.value.invoiceId) {
      throw Object.assign(new Error("Webhook invoice does not match acceptance state."), { code: "invoice_mismatch" });
    }
    // PayPal emits the PAID event type for pending and partial payments too.
    // Signature verification alone must never mark the paid webhook stage green.
    if (row.eventType !== "INVOICING.INVOICE.PAID" || row.resourceStatus !== "PAID") {
      throw Object.assign(new Error("Captured webhook does not attest to a paid invoice."), { code: "webhook_not_paid" });
    }
    const evidence = {
      ...acceptanceBase("webhook_verification",calls),
      status: "passed",
      webhook: {
        eventType: row.eventType,
        providerInvoiceId: row.providerInvoiceId,
        resourceStatus: row.resourceStatus,
        payloadSha256: row.payloadSha256,
        eventIdSha256: digest(row.providerEventId),
        transmissionIdSha256: digest(row.transmissionId),
        verificationStatus: row.verificationStatus,
        webhookIdSha256: digest(config.PAYPAL_SANDBOX_WEBHOOK_ID),
        receivedAt: row.receivedAt,
      },
      captureSha256: digest(readFileSync(input.absolute)),
      matchedStateInvoice: true,
      note: "The final evidence excludes the PayPal transmission signature, OAuth token, buyer data and raw webhook body.",
    };
    return { status: "passed", directory, evidencePath: outputEvidence(directory,evidence), evidence };
  } catch (error) {
    const evidence = {
      ...acceptanceBase("webhook_verification",calls),
      status: "failed",
      errorCode: safeCode(error),
      captureSha256: digest(readFileSync(input.absolute)),
    };
    return { status: "failed", directory, evidencePath: outputEvidence(directory,evidence), evidence };
  }
}
export async function main(args = process.argv.slice(2), env = process.env) {
  let parsed;
  try { parsed = parseArgs(args); }
  catch {
    process.stderr.write("Invalid acceptance command. Use --help.\n");
    return 2;
  }
  if (parsed.help) { process.stdout.write(usage); return 0; }
  let result;
  try {
    if (parsed.command === "create") result = await runCreate({ env, output: parsed.output });
    else if (parsed.command === "check") result = await runCheck({ env, state: parsed.state, output: parsed.output });
    else result = await runWebhook({ env, capture: parsed.capture, state: parsed.state, output: parsed.output });
  } catch (error) {
    process.stderr.write(`Sandbox acceptance preflight failed: ${safeCode(error)}.\n`);
    return 1;
  }
  process.stdout.write(JSON.stringify({
    schemaVersion: EVIDENCE_VERSION,
    status: result.status,
    mode: result.evidence.mode,
    invoiceId: result.evidence.invoice?.invoiceId ?? result.evidence.webhook?.providerInvoiceId ?? null,
    providerStatus: result.evidence.invoice?.status ?? result.evidence.webhook?.resourceStatus ?? null,
    evidencePath: result.evidencePath,
    statePath: result.statePath ?? null,
    handoffPath: result.handoffPath ?? null,
    errorCode: result.evidence.errorCode ?? null,
  }, null, 2) + "\n");
  return result.status === "passed" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
