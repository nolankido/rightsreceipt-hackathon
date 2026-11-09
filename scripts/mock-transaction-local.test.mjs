import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { MockTransactionService, MockTransactionError, stableJson, simulatedPermissionState, MOCK_DISCLAIMER } from "../packages/application/src/mock-transaction.ts";
import { createMemoryMockTransactionStore } from "../packages/persistence/src/memory-mock-transaction.ts";

const caseId = "10000000-0000-4000-8000-000000000001";
const quoteId = "20000000-0000-4000-8000-000000000001";
const termsId = "30000000-0000-4000-8000-000000000001";
const buyerToken = "B".repeat(43);
const publicId = "V".repeat(43);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixture() {
  let currentTime = new Date("2026-10-26T09:00:00.000Z");
  let rowVersion = 4;
  let lastQuote = quoteId;
  let quoteStatus = "quoted";
  let termsVersion = termsId;
  let expiresAt = "2026-11-02T09:00:00.000Z";
  let revokedAt = null;
  let caseOutcome = "open";
  let assetAvailability = "active";
  let allowedActions = ["submit_request", "review"];
  const store = createMemoryMockTransactionStore();
  const quote = () => ({
    caseId, caseRowVersion: rowVersion, termsVersionNumber: 1, status: quoteStatus,
    reason: "Validated quote", policy: null,
    quote: quoteStatus === "quoted" ? {
      record: { quoteId: lastQuote, caseId, termsVersionId: termsVersion,
        amountCents: 42500, currency: "USD", status: "current", calculationHash: "f".repeat(64),
        quoteVersionNumber: 1, pricingPolicyId: "00000000-0000-4000-8000-000000000002",
        pricingPolicyVersion: 1, createdAt: "2026-10-25T00:00:00.000Z" },
      lines: [{ amountCents: 20000 },{ amountCents: 10000 },{ amountCents: 5000 },{ amountCents: 5000 },{ amountCents: 2500 }],
    } : null,
    licensePeriod: quoteStatus === "quoted" ? {
      startDate: "2026-10-25", endDateExclusive: "2027-01-23", lastPermittedDate: "2027-01-22",
    } : null,
  });
  let counter = 1;
  const svc = new MockTransactionService({
    terms: { async getCaseContext(id) { return id === caseId ? {
      caseId, caseOutcome, caseRowVersion: rowVersion,
      asset: { title: "Harbor After Rain", previewReference: "/demo/harbor-after-rain.svg",
        fingerprintValue: "a".repeat(64) },
      request: { buyerOrganization: "Cedar & Tide Travel" },
    } : null; } },
    quotes: { async getQuote() { return quote(); } },
    buyerRequests: { async findByCapabilityDigest(digest) {
      return digest === sha256(buyerToken) ? {
        caseId, requestSubmissionId: "40000000-0000-4000-8000-000000000001",
        revokedAt, expiresAt, asset: { availability: assetAvailability }, allowedActions,
      } : null;
    } },
    capabilities: { digest: async (value) => sha256(value), issue: async () => ({token:publicId,digestSha256:sha256(publicId)}) },
    store,
    clock: { now: () => currentTime, todayUtc: () => currentTime.toISOString().slice(0,10) },
    identifiers: { create: () => `60000000-0000-4000-8000-${String(counter++).padStart(12,"0")}` },
    hasher: { sha256Hex: async(value) => sha256(value) },
  });
  const approveInput = () => ({ expectedCaseRowVersion:rowVersion, expectedMockRevision:0,
    quoteId:lastQuote,termsVersionId:termsVersion,decision:"approved" });
  async function approved() { return svc.decide(caseId,approveInput()); }
  async function accepted() { await approved();return svc.accept(buyerToken,{expectedMockRevision:1,quoteId:lastQuote,termsVersionId:termsVersion,accepted:true}); }
  async function paid() { await accepted();return svc.simulatePayment(caseId,{expectedMockRevision:2,quoteId:lastQuote}); }
  return {svc,store,approveInput,approved,accepted,paid, setTime:(s)=>{currentTime=new Date(s);},
    setQuote:(s)=>{lastQuote=s;rowVersion++;},setQuoteStatus:(s)=>{quoteStatus=s;},
    setTerms:(s)=>{termsVersion=s;rowVersion++;},setExpiry:(s)=>{expiresAt=s;},
    setRevoked:(s)=>{revokedAt=s;},setCaseOutcome:(s)=>{caseOutcome=s;},
    setAvailability:(s)=>{assetAvailability=s;},setActions:(x)=>{allowedActions=x;}
  };
}

async function expectError(promise, code) {
  await assert.rejects(promise, (error) => error instanceof MockTransactionError && error.code === code);
}

test("stable receipt JSON ignores object key order without floating-point money", () => {
  assert.equal(stableJson({b:2,a:{z:"yes",y:[1,true]}}),stableJson({a:{y:[1,true],z:"yes"},b:2}));
  assert.throws(()=>stableJson({amount:2.5}),{code:"invalid_receipt_payload"});
});
test("UTC scheduled, active, expired boundaries are half-open", () => {
  assert.equal(simulatedPermissionState("2026-10-27","2026-10-29",new Date("2026-10-26T23:59:59Z")),"simulated_scheduled");
  assert.equal(simulatedPermissionState("2026-10-27","2026-10-29",new Date("2026-10-27T00:00:00Z")),"simulated_active");
  assert.equal(simulatedPermissionState("2026-10-27","2026-10-29",new Date("2026-10-29T00:00:00Z")),"simulated_expired");
});
test("quote has to exist before approval", async()=>{
  const f=fixture(); f.setQuoteStatus("ready_for_pricing");
  assert.equal((await f.svc.getCreator(caseId)).stage,"awaiting_quote");
  await expectError(f.approved(),"stale_quote");
});
test("buyer cannot accept without creator approval",async()=>{
  const f=fixture();await expectError(f.svc.accept(buyerToken,{expectedMockRevision:0,quoteId,termsVersionId:termsId,accepted:true}),"stale_revision");
});
test("creator approval binds exactly to case, quote, and terms versions",async()=>{
  const f=fixture();await expectError(f.svc.decide(caseId,{...f.approveInput(),quoteId:"wrong"}),"stale_quote");
  const v=await f.approved();assert.equal(v.stage,"awaiting_buyer");assert.equal(v.mockRevision,1);
  assert.equal(v.approval.actor,"creator");
});
test("creator approval idempotent but new stale command fails",async()=>{
  const f=fixture();await f.approved();
  await expectError(f.approved(),"stale_revision");
  const v=await f.svc.decide(caseId,{...f.approveInput(),expectedMockRevision:1});
  assert.equal(v.mockRevision,1);
});
test("rejection requires a reason and cannot be accepted",async()=>{
  const f=fixture();await expectError(f.svc.decide(caseId,{...f.approveInput(),decision:"rejected"}),"reason_required");
  const v=await f.svc.decide(caseId,{...f.approveInput(),decision:"rejected",reason:"Outside policy"});
  assert.equal(v.stage,"rejected");
  await expectError(f.svc.accept(buyerToken,{expectedMockRevision:1,quoteId,termsVersionId:termsId,accepted:true}),"approval_required");
});
test("clarification demands a new version before re-approval",async()=>{
  const f=fixture();await f.svc.decide(caseId,{...f.approveInput(),decision:"clarification_requested",reason:"Please clarify crops"});
  await expectError(f.svc.decide(caseId,{...f.approveInput(),expectedMockRevision:1}),"clarification_required");
});
test("expired and revoked buyer tokens cannot accept",async()=>{
  const f=fixture();await f.approved();f.setExpiry("2026-10-25T00:00:00Z");
  await expectError(f.svc.getBuyer(buyerToken),"buyer_capability_invalid");
  const g=fixture();await g.approved();g.setRevoked("2026-10-26T00:00:00Z");
  await expectError(g.svc.getBuyer(buyerToken),"buyer_capability_invalid");
});
test("capability must include review permission",async()=>{
  const f=fixture();await f.approved();f.setActions(["submit_request"]);
  await expectError(f.svc.getBuyer(buyerToken),"buyer_capability_invalid");
});
test("explicit buyer acceptance matches creator quote and terms",async()=>{
  const f=fixture();await f.approved();
  await expectError(f.svc.accept(buyerToken,{expectedMockRevision:1,quoteId:"stale",termsVersionId:termsId,accepted:true}),"approval_required");
  const v=await f.svc.accept(buyerToken,{expectedMockRevision:1,quoteId,termsVersionId:termsId,accepted:true});
  assert.equal(v.stage,"awaiting_simulated_payment");assert.equal(v.acceptance.actor,"buyer");
});
test("fake payment is blocked before buyer acceptance",async()=>{
  const f=fixture();await f.approved();await expectError(f.svc.simulatePayment(caseId,{expectedMockRevision:1,quoteId}),"acceptance_required");
});
test("complete simulated flow produces correct redacted SHA-256 receipt",async()=>{
  const f=fixture();const v=await f.paid();
  assert.equal(v.stage,"simulated_active");assert.equal(v.payment.provider,"fake");
  const result=await f.svc.verify(v.publicReceiptId);
  assert.equal(result.verified,true);assert.equal(result.payload.amount_cents,42500);
  assert.equal(result.payload.mode,"simulated");assert.equal(result.payload.demonstration_only,true);
  assert.equal(result.disclaimer,MOCK_DISCLAIMER);
  assert.ok(!JSON.stringify(result).includes("jordan@example.test"));
  assert.ok(!JSON.stringify(result).includes(buyerToken));
});
test("simulated evidence never masquerades as PayPal",async()=>{
  const f=fixture();const v=await f.paid();assert.match(v.payment.reference,/^SIM-/);
  const verification=await f.svc.verify(v.publicReceiptId);
  assert.equal(verification.provider,"fake");assert.ok(!JSON.stringify(verification).includes("paypal_invoice_id"));
});
test("duplicate payment attempt cannot create another receipt",async()=>{
  const f=fixture();const first=await f.paid();
  await expectError(f.svc.simulatePayment(caseId,{expectedMockRevision:2,quoteId}),"stale_revision");
  const second=await f.svc.simulatePayment(caseId,{expectedMockRevision:3,quoteId});
  assert.equal(second.publicReceiptId,first.publicReceiptId);
  assert.equal(second.mockRevision,first.mockRevision);
});
test("tampering with stored receipt is detected without revealing payload",async()=>{
  const f=fixture();const v=await f.paid();
  const originalLookup = f.store.getByPublicId.bind(f.store);
  f.store.getByPublicId = async (id) => {
    const record = await originalLookup(id);
    return record ? { ...record, receipt: { ...record.receipt,
      canonicalJson: '{"mode":"simulated","buyer_email":"private"}' } } : null;
  };
  const verification=await f.svc.verify(v.publicReceiptId);
  assert.equal(verification.verified,false);assert.equal(verification.payload,null);
  assert.equal(verification.currentPermissionStatus,"invalid");
});
test("receipt verification cannot succeed for an unknown ID",async()=>{
  const f=fixture();await f.paid();await expectError(f.svc.verify("other"),"receipt_not_found");
});
test("old approval becomes stale when terms or quote change",async()=>{
  const f=fixture();await f.approved();f.setQuote("90000000-0000-4000-8000-000000000001");
  assert.equal((await f.svc.getCreator(caseId)).stage,"quote_changed");
  await expectError(f.svc.accept(buyerToken,{expectedMockRevision:1,quoteId,termsVersionId:termsId,accepted:true}),"approval_required");
});
test("case cannot be acted on when closed",async()=>{
  const f=fixture();f.setCaseOutcome("canceled");await expectError(f.approved(),"case_unavailable");
});
test("concurrent revision CAS fails rather than duplicating side effects",async()=>{
  const f=fixture();await f.approved();const old=await f.store.get(caseId);
  await assert.rejects(f.store.save(caseId,0,{...old,revision:1}),/revision conflict/);
  assert.equal((await f.store.get(caseId)).revision,1);
});
test("time advancement changes simulated status without changing immutable hash",async()=>{
  const f=fixture();f.setTime("2026-10-24T12:00:00Z");const v=await f.paid();
  const first=await f.svc.verify(v.publicReceiptId);assert.equal(first.currentPermissionStatus,"simulated_scheduled");
  f.setTime("2027-01-23T00:00:00Z");const last=await f.svc.verify(v.publicReceiptId);
  assert.equal(last.currentPermissionStatus,"simulated_expired");assert.equal(first.hash,last.hash);
});

function injectCorruptPublicRead(fixtureState, modifyPayload) {
  const originalLookup = fixtureState.store.getByPublicId.bind(fixtureState.store);
  fixtureState.store.getByPublicId = async (id) => {
    const record = await originalLookup(id);
    if (!record?.receipt) return record;
    const payload = JSON.parse(record.receipt.canonicalJson);
    modifyPayload(payload);
    const canonicalJson = stableJson(payload);
    return {
      ...record,
      receipt: { ...record.receipt, canonicalJson, sha256: sha256(canonicalJson) },
    };
  };
}

test("memory storage returns isolated copies of simulated evidence", async () => {
  const f = fixture();
  const v = await f.paid();
  const copy = await f.store.get(caseId);
  copy.receipt.canonicalJson = "CORRUPTED CALLER COPY";
  copy.approval.quoteId = "forged";
  const verification = await f.svc.verify(v.publicReceiptId);
  assert.equal(verification.verified, true);
  assert.equal((await f.store.get(caseId)).approval.quoteId, quoteId);
});

test("recomputed checksum does not legitimize a rewritten paid amount", async () => {
  const f = fixture();
  const v = await f.paid();
  injectCorruptPublicRead(f, (payload) => { payload.amount_cents = 1; });
  const verification = await f.svc.verify(v.publicReceiptId);
  assert.equal(verification.verified, false);
  assert.equal(verification.payload, null);
  assert.equal(verification.currentPermissionStatus, "invalid");
});

test("recomputed checksum cannot substitute another fake payment reference", async () => {
  const f = fixture();
  const v = await f.paid();
  injectCorruptPublicRead(f, (payload) => { payload.payment_reference = "SIM-FORGED"; });
  const verification = await f.svc.verify(v.publicReceiptId);
  assert.equal(verification.verified, false);
  assert.equal(verification.payload, null);
});

test("canonical receipt refuses altered schema and impossible calendar period", async () => {
  const f = fixture();
  const v = await f.paid();
  injectCorruptPublicRead(f, (payload) => { payload.license_start_date = "2026-02-30"; });
  const verification = await f.svc.verify(v.publicReceiptId);
  assert.equal(verification.verified, false);
  assert.equal(verification.currentPermissionStatus, "invalid");
});
