import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPayPalSandboxDraftAdapter,
  mapSandboxDraftInvoice,
  SANDBOX_DRAFT_INTEGRATION_VERSION,
} from "../packages/paypal/src/sandbox-draft.ts";
import { PaymentAdapterError, PAYPAL_SANDBOX_BASE_URL } from "../packages/paypal/src/adapter.ts";

const uuid = n => `0000000${n}-0000-4000-8000-00000000000${n}`;
const snap = () => ({
  caseId:uuid(1),assetId:uuid(2),termsVersionId:uuid(3),quoteId:uuid(4),
  creatorDecisionId:uuid(5),buyerAcceptanceId:uuid(6),
  amountCents:42500,currency:"USD",recipientEmail:"buyer@example.test",
  rightsSummary:"Commercial paid social US and Canada 90 days crop only; no sublicensing or AI training.",
  requestId:"rr-test-accepted-package-v1",
});
const config=()=>({
  APP_MODE:"sandbox",PAYPAL_MODE:"paypal_sandbox",PAYPAL_BASE_URL,
  PAYPAL_SANDBOX_CLIENT_ID:"sandbox-client-12345",PAYPAL_SANDBOX_CLIENT_SECRET:"sandbox-secret-12345",
});
const merchant=()=>({name:"Maya Chen Test Business",email:"merchant@example.test"});
const PAYPAL_BASE_URL=PAYPAL_SANDBOX_BASE_URL;
const okToken=(overrides={})=>Response.json({access_token:"token-private-1234",token_type:"Bearer",expires_in:3600,...overrides});
const okInvoice=(overrides={})=>Response.json({id:"INV2-TEST-ABC123",status:"DRAFT",...overrides},{status:201});
const err=code=> e=>e instanceof PaymentAdapterError&&e.code===code;
const observed=[];
function setup(overrides={}){
  const calls=[];let time=1_000_000;
  const http=overrides.fetch??(async (url,init)=>{
    calls.push({url,init});
    return url.endsWith("/v1/oauth2/token")?okToken():okInvoice();
  });
  const adapter=createPayPalSandboxDraftAdapter(overrides.config??config(),{
    fetch:http,merchant:overrides.merchant??merchant(),
    now:()=>time,sandboxDraftTransportEnabled:true,
  });
  return {adapter,calls,now:()=>time,tick:ms=>{time+=ms;}};
}

test("opt-in sandbox draft adapter does not call HTTP at construction",()=>{
  const f=setup();assert.equal(f.calls.length,0);
  assert.equal(f.adapter.integrationVersion,SANDBOX_DRAFT_INTEGRATION_VERSION);
  assert.equal(f.adapter.descriptor.mode,"paypal_sandbox");
  assert.equal(f.adapter.descriptor.networkEnabled,true);
  assert.equal(f.adapter.descriptor.authoritativePaymentEvidence,false);
});
test("sandbox transport opt-in is mandatory",()=>{
  assert.throws(()=>createPayPalSandboxDraftAdapter(config(),{fetch:async()=>okToken(),merchant:merchant()}),err("invalid_configuration"));
});
test("missing and production credentials reject constructor before any HTTP",()=>{
  for(const change of [{PAYPAL_BASE_URL:"https://api-m.paypal.com"},{PAYPAL_SANDBOX_CLIENT_SECRET:undefined},{PAYPAL_MODE:"fake"}]){
    assert.throws(()=>setup({config:{...config(),...change}}),e=>e instanceof PaymentAdapterError);
  }
});
test("invoicer identity must be a trusted valid bounded Sandbox merchant",()=>{
  for(const changes of [{name:"<script>"},{name:"x"},{email:"invalid"},{email:"evil\n" + "@test.com"}]){
    assert.throws(()=>setup({merchant:{...merchant(),...changes}}),err("invalid_configuration"));
  }
});
test("exact $425 invoice mapping includes accepted ids and PayPal v2 fields",async()=>{
  const p=await mapSandboxDraftInvoice(snap(),merchant());
  assert.equal(p.detail.currency_code,"USD");
  assert.match(p.detail.invoice_number,/^RR-[0-9A-F]{20}$/u);
  assert.equal(p.detail.reference,`RR-${snap().caseId}`);
  assert.equal(p.detail.payment_term.term_type,"DUE_ON_RECEIPT");
  assert.equal(p.invoicer.email_address,"merchant@example.test");
  assert.equal(p.primary_recipients[0].billing_info.email_address,"buyer@example.test");
  assert.equal(p.items[0].unit_amount.value,"425.00");
  assert.equal(p.items[0].unit_measure,undefined);
  assert.equal(p.items[0].unit_of_measure,"QUANTITY");
  assert.equal(p.items[0].quantity,"1");
  assert.match(p.detail.note,/no sublicensing or AI training/u);
});
test("integer cent mapping never rounds or accepts fractional cents",async()=>{
  for(const amount of [1,9,101,10005,42500]){
    const p=await mapSandboxDraftInvoice({...snap(),amountCents:amount},merchant());
    assert.equal(p.items[0].unit_amount.value,`${Math.floor(amount/100)}.${String(amount%100).padStart(2,"0")}`);
  }
  await assert.rejects(mapSandboxDraftInvoice({...snap(),amountCents:1.5},merchant()),err("invalid_invoice_request"));
});
test("OAuth request only targets exact Sandbox host and sends client credentials privately",async()=>{
  const {adapter,calls}=setup();const v=await adapter.createDraftInvoice(snap());
  assert.equal(calls.length,2);
  assert.equal(calls[0].url,"https://api-m.sandbox.paypal.com/v1/oauth2/token");
  assert.equal(calls[1].url,"https://api-m.sandbox.paypal.com/v2/invoicing/invoices");
  assert.equal(calls[0].init.method,"POST");assert.equal(calls[0].init.body,"grant_type=client_credentials");
  assert.equal(calls[0].init.redirect,"error");assert.equal(calls[0].init.credentials,"omit");
  const basic=new Headers(calls[0].init.headers).get("authorization");
  assert.ok(basic.startsWith("Basic "));
  assert.equal(atob(basic.slice(6)),`${config().PAYPAL_SANDBOX_CLIENT_ID}:${config().PAYPAL_SANDBOX_CLIENT_SECRET}`);
  assert.equal(new Headers(calls[1].init.headers).get("authorization"),"Bearer token-private-1234");
  assert.equal(new Headers(calls[1].init.headers).get("PayPal-Request-Id"),snap().requestId);
  assert.equal(calls[1].init.redirect,"error");
  assert.equal(v.invoiceId,"INV2-TEST-ABC123");
  assert.equal(v.environment,"sandbox");assert.equal(v.simulated,false);
  assert.equal(v.authoritativePaymentEvidence,false);assert.equal(v.status,"DRAFT");
  assert.equal(Object.isFrozen(v),true);
  assert.ok(!JSON.stringify(v).includes("buyer@example.test"));
});
test("one exact request caches draft invoice without duplicate provider POST",async()=>{
  const f=setup();const a=await f.adapter.createDraftInvoice(snap());
  const b=await f.adapter.createDraftInvoice(snap());assert.deepEqual(a,b);
  assert.equal(f.calls.filter(x=>x.url.includes("/invoices")).length,1);
});
test("distinct requests reuse the token while valid",async()=>{
  const f=setup();await f.adapter.createDraftInvoice(snap());
  await f.adapter.createDraftInvoice({...snap(),quoteId:uuid(7),buyerAcceptanceId:uuid(8),requestId:"second-accepted-quote-v1"});
  assert.equal(f.calls.filter(x=>x.url.includes("/oauth2/")).length,1);
  assert.equal(f.calls.filter(x=>x.url.includes("/invoices")).length,2);
});
test("token refreshes before expiry and not on every request",async()=>{
  const f=setup();await f.adapter.createDraftInvoice(snap());f.tick(3_000_000);
  await f.adapter.createDraftInvoice({...snap(),quoteId:uuid(7),buyerAcceptanceId:uuid(8),requestId:"second-accepted-quote-v1"});
  assert.equal(f.calls.filter(x=>x.url.includes("/oauth2/")).length,1);
  f.tick(600_000);
  await f.adapter.createDraftInvoice({...snap(),quoteId:uuid(8),buyerAcceptanceId:uuid(9),requestId:"third-accepted-quote-v1"});
  assert.equal(f.calls.filter(x=>x.url.includes("/oauth2/")).length,2);
});
test("concurrent creates share one OAuth request",async()=>{
  const f=setup();await Promise.all([
    f.adapter.createDraftInvoice(snap()),
    f.adapter.createDraftInvoice({...snap(),quoteId:uuid(7),buyerAcceptanceId:uuid(8),requestId:"second-accepted-quote-v1"}),
  ]);
  assert.equal(f.calls.filter(x=>x.url.includes("/oauth2/")).length,1);
  assert.equal(f.calls.filter(x=>x.url.includes("/invoices")).length,2);
});
test("concurrent same accepted tuple generates exactly one draft",async()=>{
  const f=setup();const r=await Promise.all(Array.from({length:12},()=>f.adapter.createDraftInvoice(snap())));
  assert.deepEqual(r.every(x=>x.invoiceId===r[0].invoiceId),true);
  assert.equal(f.calls.filter(x=>x.url.includes("/invoices")).length,1);
});
test("same request id may not change amount, terms, or recipient",async()=>{
  const f=setup();await f.adapter.createDraftInvoice(snap());
  for(const changes of [{amountCents:42501},{termsVersionId:uuid(7)},{recipientEmail:"other@example.test"}]){
    await assert.rejects(f.adapter.createDraftInvoice({...snap(),...changes}),err("invoice_conflict"));
  }
  assert.equal(f.calls.length,2);
});
test("new key for same accepted version is rejected before network",async()=>{
  const f=setup();await f.adapter.createDraftInvoice(snap());
  await assert.rejects(f.adapter.createDraftInvoice({...snap(),requestId:"changed-idempotency-id"}),err("invoice_conflict"));
  assert.equal(f.calls.length,2);
});
test("a network timeout leaves an unknown outcome retryable with identical provider key",async()=>{
  let n=0;const calls=[];const f=setup({fetch:async (url,init)=>{
    calls.push({url,init});if(url.endsWith("/token"))return okToken();
    if(++n===1)throw Error(`network broken with secret ${config().PAYPAL_SANDBOX_CLIENT_SECRET}`);
    return okInvoice();
  }});
  await assert.rejects(f.adapter.createDraftInvoice(snap()),err("sandbox_unknown_outcome"));
  const result=await f.adapter.createDraftInvoice(snap());assert.equal(result.status,"DRAFT");
  assert.equal(n,2);const posts=calls.filter(x=>x.url.includes("/invoices"));
  assert.equal(new Headers(posts[0].init.headers).get("PayPal-Request-Id"),new Headers(posts[1].init.headers).get("PayPal-Request-Id"));
});
test("HTTP 503 yields unknown outcome and safe retry semantics",async()=>{
  let n=0;const f=setup({fetch:async url=>url.endsWith("/token")?okToken():++n===1?Response.json({message:"private message"},{status:503}):okInvoice()});
  await assert.rejects(f.adapter.createDraftInvoice(snap()),e=>err("sandbox_unknown_outcome")(e)&&!e.message.includes("private message"));
  assert.equal((await f.adapter.createDraftInvoice(snap())).status,"DRAFT");
});
test("401 invoice response refreshes OAuth token once and reuses request id",async()=>{
  let tokens=0,posts=0;const auths=[],keys=[];
  const f=setup({fetch:async (url,init)=>{
    if(url.endsWith("/token")){tokens++;return okToken({access_token:`new-token-${tokens}`})}
    posts++;auths.push(new Headers(init.headers).get("authorization"));keys.push(new Headers(init.headers).get("PayPal-Request-Id"));
    return posts===1?Response.json({}, {status:401}):okInvoice();
  }});
  assert.equal((await f.adapter.createDraftInvoice(snap())).status,"DRAFT");
  assert.equal(tokens,2);assert.equal(posts,2);
  assert.deepEqual(auths,["Bearer new-token-1","Bearer new-token-2"]);
  assert.deepEqual(keys,[snap().requestId,snap().requestId]);
});
test("repeated 401 and 403 cannot be treated as successful draft",async()=>{
  for(const status of [401,403]){
    const f=setup({fetch:async url=>url.endsWith("/token")?okToken():Response.json({message:"payment attempted"},{status})});
    await assert.rejects(f.adapter.createDraftInvoice(snap()),err("sandbox_oauth_rejected"));
  }
});
test("OAuth errors are sanitized without a call to invoice endpoint",async()=>{
  let invoices=0;const f=setup({fetch:async url=>{
    if(url.includes("/invoices"))invoices++;
    return Response.json({error:"invalid_client",client_secret:"secret-private"},{status:401});
  }});
  await assert.rejects(f.adapter.createDraftInvoice(snap()),e=>err("sandbox_oauth_rejected")(e)&&!e.message.includes("secret-private"));
  assert.equal(invoices,0);
});
test("OAuth returns invalid token payload: fail closed without invoice",async()=>{
  for(const item of [null,{}, {token_type:"bearer",access_token:"ok",expires_in:3600},
    {access_token:"abc",token_type:"Bearer",expires_in:0},
    {access_token:"a b",token_type:"Bearer",expires_in:3600},
    {access_token:"abc",token_type:"Bearer",expires_in:"3600"}]){
    let count=0;const f=setup({fetch:async url=>{count++;return url.endsWith("/token")?Response.json(item):okInvoice()}});
    await assert.rejects(f.adapter.createDraftInvoice(snap()),err("sandbox_oauth_invalid_response"));
    assert.equal(count,1);
  }
});
test("OAuth rate limit and network interruption are recoverable and sanitized",async()=>{
  const f=setup({fetch:async()=>Response.json({error:"secret-data"},{status:429})});
  await assert.rejects(f.adapter.createDraftInvoice(snap()),err("sandbox_rate_limited"));
  const g=setup({fetch:async()=>{throw Error("very secret network error")}});
  await assert.rejects(g.adapter.createDraftInvoice(snap()),e=>err("sandbox_transport_unavailable")(e)&&!e.message.includes("secret"));
});
test("invoice rejection 422 and rate limit 429 are never treated as paid",async()=>{
  for(const [status,code] of [[422,"sandbox_invoice_rejected"],[429,"sandbox_rate_limited"]]){
    const f=setup({fetch:async url=>url.endsWith("/token")?okToken():Response.json({message:"secret"},{status})});
    await assert.rejects(f.adapter.createDraftInvoice(snap()),err(code));
  }
});
test("invalid provider invoice id, payment status, or JSON fail closed",async()=>{
  for(const response of [okInvoice({id:"SIM-INV-0001"}),okInvoice({id:"INV2-TEST-ABC123",status:"PAID"}),new Response("not json",{status:201})]){
    const f=setup({fetch:async url=>url.endsWith("/token")?okToken():response.clone()});
    await assert.rejects(f.adapter.createDraftInvoice(snap()),err("sandbox_invoice_invalid_response"));
  }
});
test("redirect is forbidden and no external URL is followed",async()=>{
  const f=setup({fetch:async (url,init)=>{
    assert.equal(init.redirect,"error");
    return url.endsWith("/token")?Response.redirect("https://api-m.paypal.com/something",302):okInvoice();
  }});
  await assert.rejects(f.adapter.createDraftInvoice(snap()),err("sandbox_oauth_rejected"));
});
test("invalid or forged invoice payload never reaches transport",async()=>{
  const f=setup();
  for(const change of [{currency:"EUR"},{amountCents:0},{approval:true},{requestId:"bad"}]){
    await assert.rejects(f.adapter.createDraftInvoice({...snap(),...change}),err("invalid_invoice_request"));
  }
  assert.equal(f.calls.length,0);
});
test("get and send are still pending until Turn 023 and cannot imply paid state",async()=>{
  const f=setup();await f.adapter.createDraftInvoice(snap());
  await assert.rejects(f.adapter.sendInvoice("INV2-TEST-ABC123"),err("sandbox_transport_pending"));
  await assert.rejects(f.adapter.getInvoice("INV2-TEST-ABC123"),err("sandbox_transport_pending"));
  assert.equal(f.calls.length,2);
});
test("no secrets, tokens or buyer emails leak from error objects or public invoice views",async()=>{
  const f=setup();const view=await f.adapter.createDraftInvoice(snap());
  const text=JSON.stringify({view,adapterDescriptor:f.adapter.descriptor});
  assert.ok(!text.includes(config().PAYPAL_SANDBOX_CLIENT_SECRET));
  assert.ok(!text.includes("buyer@example.test"));
  assert.ok(!text.includes("token-private-1234"));
  observed.push(view.invoiceId);
});
