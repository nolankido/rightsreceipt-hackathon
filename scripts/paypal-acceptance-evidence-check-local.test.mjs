import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAcceptanceEvidence, readEvidenceFile } from "./paypal-acceptance-evidence-check.mjs";

const script = fileURLToPath(new URL("./paypal-acceptance-evidence-check.mjs", import.meta.url));
const ID = "INV2-EVIDENCE-053";
const HASH = "a".repeat(64);
const BASE = {
  schemaVersion: "rightsreceipt-paypal-sandbox-acceptance-v1",
  status: "passed",
  environment: "sandbox",
  provider: "paypal",
  canonicalAmountCents: 42500,
  productionEndpointUsed: false,
  credentialsPersisted: false,
};
const http = (method, path) => ({ method, path, status: 200, durationMs: 1 });

function fixture() {
  return {
    create: {
      ...BASE, mode: "create_send_check", draftStatus: "DRAFT", sendStatus: "UNPAID",
      stateSha256: HASH,
      webhookRegistration: {
        status: "passed", subscribedEvent: "INVOICING.INVOICE.PAID", webhookIdSha256: HASH, exactCallbackChecked: true,
      },
      invoice: {
        invoiceId: ID, status: "UNPAID", amountCents: 42500, currency: "USD",
        paymentUrlPresent: true, requiresReconciliation: false,
        settlement: { conclusion: "unpaid", paidCents: 0, refundedCents: 0, dueCents: 42500 },
      },
      httpCalls: [
        http("POST", "/v1/oauth2/token"),
        http("POST", "/v2/invoicing/invoices"),
        http("POST", "/v2/invoicing/invoices/" + ID + "/send"),
        http("GET", "/v2/invoicing/invoices/" + ID),
      ],
    },
    paid: {
      ...BASE, mode: "status_check", stateSha256: HASH,
      invoice: {
        invoiceId: ID, status: "PAID", amountCents: 42500, currency: "USD",
        paymentUrlPresent: false, requiresReconciliation: false,
        settlement: { conclusion: "paid", paidCents: 42500, refundedCents: 0, dueCents: 0 },
      },
      httpCalls: [http("POST", "/v1/oauth2/token"), http("GET", "/v2/invoicing/invoices/" + ID)],
    },
    webhook: {
      ...BASE, mode: "webhook_verification", captureSha256: HASH, matchedStateInvoice: true,
      webhook: {
        providerInvoiceId: ID, eventType: "INVOICING.INVOICE.PAID",
        resourceStatus: "PAID", verificationStatus: "verified",
        payloadSha256: HASH, eventIdSha256: HASH, transmissionIdSha256: HASH, webhookIdSha256: HASH,
      },
      httpCalls: [http("POST", "/v1/oauth2/token"), http("POST", "/v1/notifications/verify-webhook-signature")],
    },
  };
}

test("one exact paid invoice across all three evidence stages is consistent", () => {
  const result = evaluateAcceptanceEvidence(fixture());
  assert.equal(result.status, "passed");
  assert.deepEqual(result.errorCodes, []);
  assert.match(result.invoiceIdSha256, /^[a-f0-9]{64}$/u);
  assert.ok(!JSON.stringify(result).includes(ID));
  assert.match(result.limitation, /not independent proof/u);
});

test("paid status string without authoritative financial reconciliation fails", () => {
  const records = fixture();
  records.paid.invoice.settlement.paidCents = 0;
  assert.ok(evaluateAcceptanceEvidence(records).errorCodes.includes("settlement_not_proven"));
});

test("a mixed invoice in paid or webhook stage fails closed", () => {
  for (const stage of ["paid", "webhook"]) {
    const records = fixture();
    if (stage === "paid") records.paid.invoice.invoiceId = "INV2-DIFFERENT-053";
    else records.webhook.webhook.providerInvoiceId = "INV2-DIFFERENT-053";
    assert.ok(evaluateAcceptanceEvidence(records).errorCodes.includes("invoice_binding_mismatch"));
  }
});

test("missing genuine webhook verification, state binding or provider API call fails", () => {
  const records = fixture();
  records.webhook.webhook.verificationStatus = "unverified";
  records.webhook.matchedStateInvoice = false;
  records.webhook.httpCalls = [];
  const result = evaluateAcceptanceEvidence(records);
  assert.equal(result.status, "failed");
  assert.ok(result.errorCodes.includes("webhook_not_verified"));
  assert.ok(result.errorCodes.includes("webhook_api_trace_missing"));
});

test("missing hosted handoff and PayPal send trace fail", () => {
  const records = fixture();
  records.create.invoice.paymentUrlPresent = false;
  records.create.httpCalls = records.create.httpCalls.filter(call => !call.path.endsWith("/send"));
  const result = evaluateAcceptanceEvidence(records);
  assert.ok(result.errorCodes.includes("create_handoff_invalid"));
  assert.ok(result.errorCodes.includes("create_api_trace_missing"));
});

test("fake mode and embedded sensitive account material never pass", () => {
  const records = fixture();
  records.paid.environment = "simulated";
  records.create.buyerEmail = "personal@example.test";
  records.webhook.headers = { "paypal-transmission-sig": "private-value" };
  const result = evaluateAcceptanceEvidence(records);
  assert.ok(result.errorCodes.includes("paid_provenance_invalid"));
  assert.ok(result.errorCodes.includes("create_sensitive_content"));
  assert.ok(result.errorCodes.includes("webhook_sensitive_content"));
  assert.ok(!JSON.stringify(result).includes("personal@example.test"));
  assert.ok(!JSON.stringify(result).includes("private-value"));
});

test("a clean-looking record without the expected PayPal API footprints fails", () => {
  const records = fixture();
  records.create.httpCalls = [http("POST", "/v1/oauth2/token")];
  records.paid.httpCalls = [http("GET", "/v2/invoicing/invoices/INV2-OTHER")];
  assert.ok(evaluateAcceptanceEvidence(records).errorCodes.includes("create_api_trace_missing"));
  assert.ok(evaluateAcceptanceEvidence(records).errorCodes.includes("paid_api_trace_missing"));
});

test("CLI accepts complete local JSON triplet and refuses malformed evidence without echoing contents", () => {
  const dir = join(tmpdir(), "rr-sandbox-evidence-" + randomUUID());
  mkdirSync(dir);
  try {
    const records = fixture();
    const paths = {};
    for (const stage of ["create", "paid", "webhook"]) {
      paths[stage] = join(dir, stage + ".json");
      writeFileSync(paths[stage], JSON.stringify(records[stage]));
    }
    const args = ["--create", paths.create, "--paid", paths.paid, "--webhook", paths.webhook];
    const passed = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(JSON.parse(passed.stdout).status, "passed");
    assert.ok(!passed.stdout.includes(ID));

    writeFileSync(paths.paid, JSON.stringify({ secret: "not-for-stdout" }));
    const failed = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(failed.status, 1, failed.stderr);
    assert.equal(JSON.parse(failed.stdout).status, "failed");
    assert.ok(!failed.stdout.includes("not-for-stdout"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("unreadable, oversized and missing CLI inputs fail safely", () => {
  const dir = join(tmpdir(), "rr-sandbox-evidence-size-" + randomUUID());
  mkdirSync(dir);
  try {
    const tooLarge = join(dir, "oversized.json");
    writeFileSync(tooLarge, "x".repeat(131073));
    assert.throws(() => readEvidenceFile(tooLarge), error => error.code === "evidence_unreadable");
    const missing = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.ok(!missing.stderr.includes(dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("creation evidence without the exact callback check is not considered complete", () => {
  const records = fixture();
  delete records.create.webhookRegistration.exactCallbackChecked;
  const missing = evaluateAcceptanceEvidence(records);
  assert.equal(missing.status, "failed");
  assert.ok(missing.errorCodes.includes("webhook_registration_not_proven"));
  records.create.webhookRegistration.exactCallbackChecked = false;
  assert.ok(evaluateAcceptanceEvidence(records).errorCodes.includes("webhook_registration_not_proven"));
});

test("missing same-app paid webhook registration fails the final evidence gate", () => {
  const record = fixture();
  delete record.create.webhookRegistration;
  const outcome = evaluateAcceptanceEvidence(record);
  assert.equal(outcome.status, "failed");
  assert.ok(outcome.errorCodes.includes("webhook_registration_not_proven"));
  assert.ok(outcome.errorCodes.includes("webhook_registration_identity_mismatch"));
});
test("an authenticated paid check based on a different saved state fails", () => {
  const record = fixture();
  record.paid.stateSha256 = "b".repeat(64);
  assert.ok(evaluateAcceptanceEvidence(record).errorCodes.includes("invoice_state_identity_mismatch"));
});
test("a verified event associated with another registered webhook fails", () => {
  const record = fixture();
  record.webhook.webhook.webhookIdSha256 = "b".repeat(64);
  assert.ok(evaluateAcceptanceEvidence(record).errorCodes.includes("webhook_registration_identity_mismatch"));
});
test("a registration of a non-paid event does not satisfy the release claim", () => {
  const record = fixture();
  record.create.webhookRegistration.subscribedEvent = "INVOICING.INVOICE.CREATED";
  assert.ok(evaluateAcceptanceEvidence(record).errorCodes.includes("webhook_registration_not_proven"));
});
test("an older acceptance evidence bundle without the new link fields fails closed", () => {
  const record = fixture();
  delete record.create.stateSha256;
  delete record.webhook.webhook.webhookIdSha256;
  const errors = evaluateAcceptanceEvidence(record).errorCodes;
  assert.ok(errors.includes("invoice_state_identity_mismatch"));
  assert.ok(errors.includes("webhook_registration_identity_mismatch"));
});
