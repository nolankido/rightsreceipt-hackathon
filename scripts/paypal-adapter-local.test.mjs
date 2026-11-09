import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createFakePaymentAdapter, createPayPalSandboxAdapter, createPaymentAdapter,
  inspectPaymentConfiguration, PaymentAdapterError, PAYPAL_SANDBOX_BASE_URL,
  PAYPAL_OAUTH_TOKEN_PATH, PAYPAL_INVOICES_PATH, PAYMENT_ADAPTERS,
  validateAuthorizedInvoiceSnapshot,
} from "../packages/paypal/src/adapter.ts";

const uuid = n => `0000000${n}-0000-4000-8000-00000000000${n}`;
const request = () => ({
  caseId: uuid(1), assetId: uuid(2), termsVersionId: uuid(3), quoteId: uuid(4),
  creatorDecisionId: uuid(5), buyerAcceptanceId: uuid(6),
  amountCents: 42500, currency: "USD", recipientEmail: "buyer@example.test",
  rightsSummary: "Commercial paid social in the US and Canada for 90 days; crop only.",
  requestId: "rr-test-acceptance-v1",
});
const sandbox = () => ({
  APP_MODE: "sandbox", PAYPAL_MODE: "paypal_sandbox", PAYPAL_BASE_URL,
  PAYPAL_SANDBOX_CLIENT_ID: "test-sandbox-client-12345",
  PAYPAL_SANDBOX_CLIENT_SECRET: "fixture-sandbox-secret-67890",
});
const errorCode = code => error => error instanceof PaymentAdapterError && error.code === code;

// The actual hostname comes from a trusted static import, not a test-mutated variable.
const PAYPAL_BASE_URL = PAYPAL_SANDBOX_BASE_URL;

test("all constants are Sandbox Invoicing v2, not production", () => {
  assert.equal(PAYPAL_SANDBOX_BASE_URL, "https://api-m.sandbox.paypal.com");
  assert.equal(PAYPAL_OAUTH_TOKEN_PATH, "/v1/oauth2/token");
  assert.equal(PAYPAL_INVOICES_PATH, "/v2/invoicing/invoices");
});
test("no credentials and no mode select an offline fake only in local environment", () => {
  assert.deepEqual(inspectPaymentConfiguration({APP_MODE:"local"}), {
    mode:"fake", environment:"simulated", endpoint:"none", operational:true,
    explanation:"Offline fake adapter only. No PayPal requests or real payment evidence.",
  });
  assert.equal(createPaymentAdapter({}).descriptor.createsRealInvoice,false);
});
test("fake adapter refuses judge and sandbox configurations", () => {
  for (const APP_MODE of ["judge", "sandbox"]) {
    assert.throws(()=>inspectPaymentConfiguration({APP_MODE,PAYPAL_MODE:"fake"}),errorCode("invalid_configuration"));
  }
});
test("explicit mode required outside local", () => {
  assert.throws(()=>inspectPaymentConfiguration({APP_MODE:"judge"}), errorCode("invalid_configuration"));
});
test("rejects live URLs, http downgrade, whitespace, origin bypasses, and credentials-in-URL", () => {
  for(const PAYPAL_BASE_URL of ["https://api-m.paypal.com", "https://api.paypal.com", "http://api-m.sandbox.paypal.com", "https://api-m.sandbox.paypal.com.evil.test", "https://api-m.sandbox.paypal.com/", "https://api-m.sandbox.paypal.com?x=1", "https://username:pass@api-m.sandbox.paypal.com", " https://api-m.sandbox.paypal.com", "https://evil.test"]) {
    assert.throws(()=>inspectPaymentConfiguration({...sandbox(), PAYPAL_BASE_URL}), error=>error instanceof PaymentAdapterError && (error.code==="live_endpoint_forbidden"||error.code==="invalid_configuration"), PAYPAL_BASE_URL);
  }
});
test("sandbox rejects absent, blank, placeholder, and duplicated credentials", () => {
  for(const changes of [{PAYPAL_SANDBOX_CLIENT_ID:undefined},{PAYPAL_SANDBOX_CLIENT_SECRET:undefined},{PAYPAL_SANDBOX_CLIENT_SECRET:String.fromCharCode(32,32,32)},{PAYPAL_SANDBOX_CLIENT_ID:"YOUR_CLIENT_ID"},{PAYPAL_SANDBOX_CLIENT_ID:"x"},{PAYPAL_SANDBOX_CLIENT_SECRET:"PLACEHOLDER"}]) {
    assert.throws(()=>createPayPalSandboxAdapter({...sandbox(),...changes}),error=>error instanceof PaymentAdapterError);
  }
  assert.throws(()=>createPayPalSandboxAdapter({...sandbox(),PAYPAL_SANDBOX_CLIENT_SECRET:sandbox().PAYPAL_SANDBOX_CLIENT_ID}),errorCode("invalid_configuration"));
});
test("secrets are never allowed in public VITE namespace",()=>{
  assert.throws(()=>inspectPaymentConfiguration({...sandbox(),VITE_PAYPAL_SANDBOX_CLIENT_SECRET:"leaked-secret"}),errorCode("invalid_configuration"));
});
test("fake mode rejects preconfigured Sandbox secrets",()=>{
  assert.throws(()=>inspectPaymentConfiguration({APP_MODE:"local",PAYPAL_MODE:"fake",PAYPAL_SANDBOX_CLIENT_SECRET:"fixture-sensitive"}),errorCode("invalid_configuration"));
});
test("Sandbox configuration is redacted and not operational",()=>{
  const c = inspectPaymentConfiguration(sandbox());
  assert.equal(c.endpoint,PAYPAL_SANDBOX_BASE_URL);
  assert.equal(c.operational,false);
  assert.ok(!JSON.stringify(c).includes("fixture-sandbox-secret-67890"));
});
test("Sandbox adapter is inert even with credentials and cannot contact any host",async()=>{
  const adapter=createPayPalSandboxAdapter(sandbox());
  assert.equal(adapter.descriptor.networkEnabled,false);
  assert.equal(adapter.descriptor.status,"sandbox_transport_pending");
  await assert.rejects(adapter.createDraftInvoice(request()),errorCode("sandbox_transport_pending"));
  await assert.rejects(adapter.sendInvoice("INV2-123"),errorCode("sandbox_transport_pending"));
  await assert.rejects(adapter.getInvoice("INV2-123"),errorCode("sandbox_transport_pending"));
});
test("fake creates exactly one draft and never returns buyer email or secret",async()=>{
  const adapter=createFakePaymentAdapter();
  const a=await adapter.createDraftInvoice(request());
  const b=await adapter.createDraftInvoice(request());
  assert.deepEqual(a,b);
  assert.equal(a.invoiceId,"SIM-INV-000001");
  assert.equal(a.provider,"fake");
  assert.equal(a.environment,"simulated");
  assert.equal(a.simulated,true);
  assert.equal(a.authoritativePaymentEvidence,false);
  assert.ok(!JSON.stringify(a).includes("buyer@example.test"));
});
test("complete offline fake flow includes paid/refunded status but never real permission",async()=>{
  const adapter=createFakePaymentAdapter();
  const draft=await adapter.createDraftInvoice(request());
  assert.equal(draft.status,"DRAFT");
  await assert.rejects(adapter.simulatePaidForTests(draft.invoiceId),errorCode("invalid_invoice_state"));
  const sent=await adapter.sendInvoice(draft.invoiceId);
  assert.equal(sent.status,"UNPAID");
  assert.deepEqual(await adapter.sendInvoice(draft.invoiceId),sent);
  const paid=await adapter.simulatePaidForTests(draft.invoiceId);
  assert.equal(paid.status,"PAID");
  assert.equal(paid.authoritativePaymentEvidence,false);
  const refunded=await adapter.simulateRefundForTests(draft.invoiceId);
  assert.equal(refunded.status,"REFUNDED");
  await assert.rejects(adapter.sendInvoice(draft.invoiceId),errorCode("invalid_invoice_state"));
});
test("cancelled fake invoice cannot be paid",async()=>{
  const adapter=createFakePaymentAdapter();
  const draft=await adapter.createDraftInvoice(request());
  assert.equal((await adapter.simulateCancelForTests(draft.invoiceId)).status,"CANCELLED");
  await assert.rejects(adapter.simulatePaidForTests(draft.invoiceId),errorCode("invalid_invoice_state"));
});
test("one idempotency key cannot change amount, consent version or recipient",async()=>{
  const adapter=createFakePaymentAdapter();
  await adapter.createDraftInvoice(request());
  for(const delta of [{amountCents:42000},{termsVersionId:uuid(9)},{buyerAcceptanceId:uuid(9)},{recipientEmail:"new@example.test"}]) {
    await assert.rejects(adapter.createDraftInvoice({...request(),...delta}),errorCode("invoice_conflict"));
  }
});
test("a new request key cannot create another invoice for identical accepted package",async()=>{
  const adapter=createFakePaymentAdapter();
  await adapter.createDraftInvoice(request());
  await assert.rejects(adapter.createDraftInvoice({...request(),requestId:"rr-another-key-1234"}),errorCode("invoice_conflict"));
});
test("amounts must be positive integer cents and currency USD",()=>{
  for(const amountCents of [0,-1,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(()=>validateAuthorizedInvoiceSnapshot({...request(),amountCents}),errorCode("invalid_invoice_request"));
  }
  assert.throws(()=>validateAuthorizedInvoiceSnapshot({...request(),currency:"EUR"}),errorCode("invalid_invoice_request"));
});
test("invalid IDs, injected text, unknown keys, and buyer-proposed decisions are rejected",()=>{
  const variants=[{quoteId:"wrong"},{rightsSummary:"PayPal<paid>"},{recipientEmail:"evil\n@example.test"},{extraPaymentConfirmation:true},{confirmPayment:true},{buyerAcceptanceId:""},{requestId:"too short"}];
  for(const variant of variants)assert.throws(()=>validateAuthorizedInvoiceSnapshot({...request(),...variant}),errorCode("invalid_invoice_request"));
});
test("different accepted package receives separate simulated invoice",async()=>{
  const adapter=createFakePaymentAdapter();
  await adapter.createDraftInvoice(request());
  const b=await adapter.createDraftInvoice({...request(),quoteId:uuid(8),buyerAcceptanceId:uuid(7),requestId:"rr-other-acceptance"});
  assert.equal(b.invoiceId,"SIM-INV-000002");
});
test("unknown invoice does not produce fake or real payment evidence",async()=>{
  const adapter=createFakePaymentAdapter();
  await assert.rejects(adapter.getInvoice("SIM-INV-missing"),errorCode("invoice_not_found"));
});
test("snapshots cannot be altered after read or input mutation",async()=>{
  const adapter=createFakePaymentAdapter();
  const input=request();
  const result=await adapter.createDraftInvoice(input);
  assert.ok(Object.isFrozen(result));
  input.amountCents=1;
  assert.equal((await adapter.getInvoice(result.invoiceId)).amountCents,42500);
});
test("reset is local-only, deterministic, and does not imply payment or durable invoices",async()=>{
  const adapter=createFakePaymentAdapter();
  await adapter.createDraftInvoice(request());
  adapter.resetForTests();
  assert.equal((await adapter.createDraftInvoice(request())).invoiceId,"SIM-INV-000001");
});
test("published descriptors truthfully mark Sandbox adapter unimplemented",()=>{
  assert.equal(PAYMENT_ADAPTERS[0].implemented,true);
  assert.equal(PAYMENT_ADAPTERS[1].implemented,false);
});
