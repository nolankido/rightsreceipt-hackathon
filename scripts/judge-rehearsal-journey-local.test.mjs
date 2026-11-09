import assert from "node:assert/strict";
import test from "node:test";
import { resetSeed, seedSnapshot } from "./db-local.mjs";
import { transactionBrowserFixture } from "./support/transaction-browser-fixture.mjs";
import { JudgeJourneyError, runJudgeJourney } from "./support/judge-rehearsal-journey.mjs";

async function withFixture(run) {
  const fixture = transactionBrowserFixture({ initialCase: false });
  try { resetSeed(fixture.db); return await run(fixture); }
  finally { fixture.close(); }
}

test("ordinary judge journey uses only actual handlers and its populated database resets to the exact production seed", () => withFixture(async f => {
  const baseline = seedSnapshot(f.db).sha256, observed = [];
  const completed = await runJudgeJourney(f, { onStep: row => observed.push(row.id) });
  assert.equal(completed.result.id, "ordinary"); assert.equal(completed.result.status, "passed");
  assert.equal(observed.length, 17); assert.deepEqual(observed, completed.result.steps.map(row => row.id));
  assert.equal(completed.result.summary.quoteCents, 42500);
  assert.equal(completed.result.summary.currency, "USD");
  assert.equal(completed.result.summary.permissionState, "scheduled");
  assert.equal(completed.result.summary.receiptIntegrity, "verified");
  assert.equal(completed.result.summary.providerCalls.create, 1);
  assert.equal(completed.result.summary.providerCalls.send, 1);
  assert.equal(completed.result.summary.durableRows.payment_operations, 2);
  const beforeFinancial = completed.result.steps.find(row => row.id === "provider_paid");
  assert.equal(beforeFinancial.evidence.paymentEvidenceRows, 0);
  assert.equal(beforeFinancial.evidence.permissionRows, 0);
  assert.equal(beforeFinancial.evidence.receiptRows, 0);
  assert.ok(f.requests.filter(row => row.method === "POST").length >= 7);
  assert.ok(f.requests.every(row => !row.browserAssertionPresent));
  assert.equal(completed.assertSafeArtifacts(JSON.stringify(completed.result)), true);
  resetSeed(f.db);
  assert.equal(seedSnapshot(f.db).sha256, baseline);
  assert.deepEqual(await completed.verifyRetiredAccess(f), {
    oldCapabilityDenied: true, oldReceiptDenied: true, oldCreatorCaseDenied: true,
  });
  assert.equal(seedSnapshot(f.db).sha256, baseline);
}));

test("lost provider send reply recovers by GET, exact replay stays stale and receipt authority still requires reconciliation", () => withFixture(async f => {
  const completed = await runJudgeJourney(f, { scenario: "lost_send_reply" });
  const { result } = completed;
  assert.equal(result.id, "recovery"); assert.equal(result.steps.length, 20);
  assert.equal(result.steps.find(row => row.id === "invoice_sent").outcome, "awaiting_reconciliation");
  const read = result.steps.find(row => row.id === "recovery_review");
  const recovered = result.steps.find(row => row.id === "delivery_recovered");
  const replay = result.steps.find(row => row.id === "recovery_replay");
  assert.equal(recovered.evidence.providerReads, read.evidence.providerReads + 1);
  assert.equal(recovered.evidence.providerSends, 1); assert.equal(recovered.evidence.paymentEvidenceRows, 0);
  assert.equal(recovered.evidence.permissionRows, 0); assert.equal(replay.httpStatus, 409);
  assert.deepEqual(replay.evidence, recovered.evidence);
  assert.equal(result.summary.receiptRevision, 1); assert.equal(result.summary.permissionState, "scheduled");
  assert.equal(f.outbox().requested_generation, 1);
  const fresh = transactionBrowserFixture({ initialCase: false });
  try {
    resetSeed(fresh.db);
    assert.deepEqual(await completed.verifyRetiredAccess(fresh), {
      oldCapabilityDenied: true, oldReceiptDenied: true, oldCreatorCaseDenied: true,
    });
    assert.equal(fresh.providerCalls.length, 0);
  } finally { fresh.close(); }
}));

test("artifact safety rejects private capabilities, identities, provider references and signed credentials", () => withFixture(async f => {
  const completed = await runJudgeJourney(f);
  const rejected = [f.token, f.caseId, f.publicId(), f.binding().provider_invoice_id, f.receipt().payload_hash,
    "Jordan Lee", "jordan@example.test", encodeURIComponent("jordan@example.test"), "Cedar &amp; Tide Travel",
    f.environment.PAYPAL_SANDBOX_CLIENT_SECRET, "transaction-fixture-access", "BROWSERPAYMENT036",
    "eyJhbGciOiJSUzI1NiJ9." + "a".repeat(32) + "." + "b".repeat(64), "-----BEGIN PRIVATE KEY-----"];
  for (const text of rejected) assert.throws(() => completed.assertSafeArtifacts("Before " + text + " after"),
    error => error instanceof JudgeJourneyError && error.code === "artifact_privacy_failed");
  assert.equal(completed.assertSafeArtifacts("Verified $425.00 USD, one invoice, one send and one scheduled receipt."), true);
  assert.throws(() => completed.assertSafeArtifacts({}), error => error.code === "artifact_privacy_failed");
  await assert.rejects(() => completed.verifyRetiredAccess(f), error => error.code === "retired_access_not_denied");
}));

test("unknown scenario and non-seed state fail before creating any rehearsal transaction", () => withFixture(async f => {
  const baseline = seedSnapshot(f.db).sha256, writes = f.totalChanges();
  await assert.rejects(() => runJudgeJourney(f, { scenario: "live" }), error => error.code === "invalid_scenario");
  await assert.rejects(() => runJudgeJourney(f, { onStep: "write-a-message" }), error => error.code === "invalid_observer");
  assert.equal(seedSnapshot(f.db).sha256, baseline); assert.equal(f.totalChanges(), writes);
  const prepared = transactionBrowserFixture();
  try {
    const before = prepared.totalChanges();
    await assert.rejects(() => runJudgeJourney(prepared), error => error instanceof JudgeJourneyError && error.stepId === "baseline");
    assert.equal(prepared.totalChanges(), before); assert.equal(prepared.providerCalls.length, 0);
  } finally { prepared.close(); }
}));
