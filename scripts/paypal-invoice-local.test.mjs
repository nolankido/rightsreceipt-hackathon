import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPayPalSandboxInvoiceAdapter, validateSandboxPaymentUrl, PROVIDER_INVOICE_STATUSES,
  SandboxDeliveryError } from "../packages/paypal/src/sandbox-invoice.ts";
import { createMemoryDeliveryJournal, createD1DeliveryJournal } from "../packages/paypal/src/delivery-journal.ts";

const uuid = n => `0000000${n}-0000-4000-8000-00000000000${n}`;
const accepted = () => ({caseId:uuid(1),assetId:uuid(2),termsVersionId:uuid(3),quoteId:uuid(4),
  creatorDecisionId:uuid(5),buyerAcceptanceId:uuid(6),amountCents:42500,currency:"USD",
  recipientEmail:"buyer@example.test",rightsSummary:"Paid social in US and Canada for 90 days, crop only.",requestId:"rr-accepted-example-v1"});
const config = () => ({APP_MODE:"sandbox",PAYPAL_MODE:"paypal_sandbox",PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
  PAYPAL_SANDBOX_CLIENT_ID:"test-client-for-unit-check",PAYPAL_SANDBOX_CLIENT_SECRET:"test-secret-never-log-this"});
const merchant = {name:"Maya Studio",email:"merchant@example.test"};
const invoiceId = "INV2-TEST-0001";
const safeLink = "https://www.sandbox.paypal.com/invoice/p/#SAFE123";
const error = code => e => e instanceof SandboxDeliveryError && e.code === code;
const response = (obj, status=200) => new Response(JSON.stringify(obj), {status,headers:{"content-type":"application/json"}});
function fixture(journal = createMemoryDeliveryJournal()) {
  let remote = null, sendMode = "normal", readCode = 200, readTransform = x => x;
  let authorized = true, authCalls = 0, time=Date.parse("2026-10-26T12:00:00Z");
  const calls = [];
  const http = async (url, init) => {
    calls.push({url,method:init.method,headers:init.headers,body:init.body,redirect:init.redirect});
    assert.equal(new URL(url).origin,"https://api-m.sandbox.paypal.com");
    assert.equal(init.redirect,"error");assert.equal(init.credentials,"omit");
    if(url.endsWith("/oauth2/token")) {
      authCalls++;
      return response({access_token:"unit-bearer-not-real",token_type:"Bearer",expires_in:300});
    }
    if(url.endsWith("/invoicing/invoices")) {
      const body=JSON.parse(init.body);
      remote={...body,id:invoiceId,status:"DRAFT",amount:{currency_code:"USD",value:"425.00"}};
      return response({id:invoiceId,status:"DRAFT"},201);
    }
    if(url.endsWith("/send")) {
      assert.deepEqual(JSON.parse(init.body),{send_to_recipient:true,send_to_invoicer:false});
      if(sendMode==="timeout-before")throw new Error("PRIVATE network internals");
      if(sendMode==="429")return response({private:"do-not-return"},429);
      if(sendMode==="500")return response({private:"do-not-return"},500);
      if(sendMode==="redirect")return new Response(null,{status:302,headers:{location:"https://evil.test"}});
      if(sendMode!=="ack-stale"){remote.status="UNPAID";remote.detail.metadata={recipient_view_url:safeLink};}
      if(sendMode==="timeout-after")throw new Error("PRIVATE uncertain internals");
      return new Response(null,{status:202});
    }
    if(init.method==="GET") {
      if(readCode!==200)return response({private:"provider diagnostics SECRET"},readCode);
      const output=readTransform(structuredClone(remote));
      return output instanceof Response ? output : response(output);
    }
    throw new Error("Unexpected test request");
  };
  const make = overrides => createPayPalSandboxInvoiceAdapter(config(),{
    fetch:http,merchant,now:()=>time,sandboxDraftTransportEnabled:true,sandboxInvoiceTransportEnabled:true,
    journal,authorize:async()=>authorized,...overrides,
  });
  const adapter=make();
  return {adapter,journal,calls,make, get remote(){return remote;},get authCalls(){return authCalls;},
    setAuth:v=>{authorized=v;},setTime:t=>{time=t;},setSend:v=>{sendMode=v;},
    setRead:c=>{readCode=c;},transform:f=>{readTransform=f;}};
}
function sqlite(path=":memory:", initialize=true) {
  const db=new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON;");
  if(initialize){
    db.exec("CREATE TABLE licensing_cases(case_id TEXT PRIMARY KEY);");
    db.prepare("INSERT INTO licensing_cases VALUES (?)").run(uuid(1));
    db.exec(readFileSync(new URL("../migrations/0003_paypal_delivery_journal.sql",import.meta.url),"utf8"));
  }
  const journal=createD1DeliveryJournal({prepare(sql){return {bind(...values){return {
    async first(){return db.prepare(sql).get(...values)??null;},
    async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:r.changes}};},
  };}};}});
  return {db,journal};
}

test("complete draft/send/read yields validated Sandbox payer URL, no payment authority",async()=>{
  const f=fixture();const draft=await f.adapter.createDraftInvoice(accepted());
  assert.equal(draft.status,"DRAFT");const sent=await f.adapter.sendInvoice(draft.invoiceId);
  assert.equal(sent.status,"UNPAID");assert.equal(sent.paymentUrl,safeLink);
  assert.equal(sent.authoritativePaymentEvidence,false);assert.equal(sent.simulated,false);
  assert.equal(sent.requiresReconciliation,false);assert.equal(sent.environment,"sandbox");
  const text=JSON.stringify(sent);for(const secret of ["buyer@example.test","merchant@example.test","unit-bearer","test-secret"])assert.ok(!text.includes(secret));
  assert.ok(Object.isFrozen(sent));
});
test("default draft and inert adapters remain unchanged",async()=>{
  const {createPayPalSandboxAdapter}=await import("../packages/paypal/src/adapter.ts");
  const a=createPayPalSandboxAdapter(config());
  assert.equal(a.descriptor.networkEnabled,false);
  await assert.rejects(a.sendInvoice(invoiceId),{code:"sandbox_transport_pending"});
});
test("explicit lifecycle opt-in and authorization port required",()=>{
  assert.throws(()=>fixture().make({sandboxInvoiceTransportEnabled:false}),error("authorization_required"));
  assert.throws(()=>fixture().make({authorize:undefined}),error("authorization_required"));
});
test("unknown and path-injected invoice identifiers make no HTTP requests",async()=>{
  const f=fixture();for(const id of [invoiceId,"../secrets","INV2-TEST/redirect","https://evil.test"]){
    await assert.rejects(f.adapter.getInvoice(id),error("invoice_not_bound"));
  }assert.equal(f.calls.length,0);
});
test("status and accepted amount are independently read, never inferred from send acknowledgement",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());f.setSend("ack-stale");
  await assert.rejects(f.adapter.sendInvoice(invoiceId),error("reconciliation_required"));
  await assert.rejects(f.adapter.sendInvoice(invoiceId),error("reconciliation_required"));
  assert.equal(f.calls.filter(x=>x.url.endsWith("/send")).length,1);
});
test("same-instance concurrent sends coalesce and repeated sends do not repost",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());
  const results=await Promise.all(Array.from({length:8},()=>f.adapter.sendInvoice(invoiceId)));
  assert.ok(results.every(x=>x.status==="UNPAID"));await f.adapter.sendInvoice(invoiceId);
  assert.equal(f.calls.filter(x=>x.url.endsWith("/send")).length,1);
  const key=f.calls.find(x=>x.url.endsWith("/send")).headers["PayPal-Request-Id"];
  assert.match(key,/^rr-send-[a-f0-9]{30}$/);
});
test("separate adapters share a CAS journal and cannot double-send",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());const second=f.make();
  const results=await Promise.allSettled([f.adapter.sendInvoice(invoiceId),second.sendInvoice(invoiceId)]);
  assert.ok(results.some(x=>x.status==="fulfilled"));
  assert.equal(f.calls.filter(x=>x.url.endsWith("/send")).length,1);
});
test("fresh authorization denial blocks sends before provider requests",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());f.setAuth(false);const n=f.calls.length;
  await assert.rejects(f.adapter.sendInvoice(invoiceId),error("authorization_required"));assert.equal(f.calls.length,n);
});
test("timeout after remote send reconciles through GET without second POST",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());f.setSend("timeout-after");
  await assert.rejects(f.adapter.sendInvoice(invoiceId),error("unknown_send_outcome"));
  const restarted=f.make();assert.equal((await restarted.sendInvoice(invoiceId)).status,"UNPAID");
  assert.equal(f.calls.filter(x=>x.url.endsWith("/send")).length,1);
});
test("timeout before acknowledgement leaves durable started state, no blind resend",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());f.setSend("timeout-before");
  await assert.rejects(f.adapter.sendInvoice(invoiceId),error("unknown_send_outcome"));
  await assert.rejects(f.make().sendInvoice(invoiceId),error("reconciliation_required"));
  assert.equal(f.calls.filter(x=>x.url.endsWith("/send")).length,1);
});
test("send rate limit and 5xx never clear the durable send reservation",async()=>{
  for(const [mode,code] of [["429","rate_limited"],["500","unknown_send_outcome"]]){
    const f=fixture();await f.adapter.createDraftInvoice(accepted());f.setSend(mode);
    await assert.rejects(f.adapter.sendInvoice(invoiceId),error(code));
    await assert.rejects(f.make().sendInvoice(invoiceId),error("reconciliation_required"));
  }
});
test("provider 404, 403, 429 and 500 map to sanitized errors",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());
  for(const [status,code] of [[404,"invoice_not_found"],[403,"oauth_rejected"],[429,"rate_limited"],[500,"transport_unavailable"]]){
    f.setRead(status);await assert.rejects(f.adapter.getInvoice(invoiceId),e=>error(code)(e)&&!e.message.includes("SECRET"));
  }
});
test("401 permits one token refresh then fails without exposing token",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());f.setRead(401);
  await assert.rejects(f.adapter.getInvoice(invoiceId),error("oauth_rejected"));
  assert.equal(f.calls.filter(x=>x.method==="GET").length,2);
});
test("read OAuth token cache reuses and refreshes early",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());await f.adapter.getInvoice(invoiceId);
  const n=f.authCalls;await f.adapter.getInvoice(invoiceId);assert.equal(f.authCalls,n);
  f.setTime(Date.parse("2026-10-26T12:05:00Z"));await f.adapter.getInvoice(invoiceId);assert.equal(f.authCalls,n+1);
});
for(const status of PROVIDER_INVOICE_STATUSES){
  test(`provider status ${status} is preserved without permission activation`,async()=>{
    const f=fixture();await f.adapter.createDraftInvoice(accepted());
    f.remote.status=status;f.remote.detail.metadata={recipient_view_url:safeLink};
    const view=await f.adapter.getInvoice(invoiceId);assert.equal(view.status,status);
    assert.equal(view.authoritativePaymentEvidence,false);
    assert.equal(view.paymentUrl,["UNPAID","SENT","SHARED"].includes(status)?safeLink:null);
    if(["MARKED_AS_PAID","PAID_EXTERNAL","PARTIALLY_PAID","PARTIALLY_REFUNDED"].includes(status))assert.equal(view.requiresReconciliation,true);
  });
}
test("unknown provider status remains UNKNOWN with no payment link",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());f.remote.status="NEW_PROVIDER_STATUS";
  const result=await f.adapter.getInvoice(invoiceId);assert.equal(result.status,"UNKNOWN");assert.equal(result.paymentUrl,null);
  assert.equal(result.requiresReconciliation,true);await assert.rejects(f.adapter.sendInvoice(invoiceId),error("reconciliation_required"));
});
test("missing payment URL is explicit instead of fabricated",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());f.remote.status="UNPAID";
  const view=await f.adapter.getInvoice(invoiceId);assert.equal(view.paymentUrl,null);assert.equal(view.requiresReconciliation,true);
});
test("invoice identity, accepted amount, email, merchant, references and rights mismatches fail closed",async()=>{
  const modifications=[r=>r.id="INV2-OTHER",r=>r.amount.value="424.99",r=>r.amount.currency_code="EUR",
    r=>r.detail.invoice_number="foreign",r=>r.detail.reference="other-case",r=>r.detail.note="changed rights",
    r=>r.primary_recipients[0].billing_info.email_address="wrong@example.test",
    r=>r.invoicer.email_address="othermerchant@example.test",r=>r.items[0].quantity="2",
    r=>r.items[0].description="new terms",r=>r.items[0].unit_amount.value="424.99"];
  for(const modify of modifications){const f=fixture();await f.adapter.createDraftInvoice(accepted());f.transform(r=>{modify(r);return r;});
    await assert.rejects(f.adapter.getInvoice(invoiceId),error("invoice_mismatch"));}
});
test("integer cents accepts 425/425.0/425.00 but rejects fractional cents and exponent notation",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());
  for(const v of ["425","425.0","425.00"]){f.remote.amount.value=v;assert.equal((await f.adapter.getInvoice(invoiceId)).amountCents,42500);}
  for(const v of ["425.001","4.25e2","-425","425x","0425.00","Infinity",425]){f.remote.amount.value=v;
    await assert.rejects(f.adapter.getInvoice(invoiceId),error("invoice_mismatch"));}
});
test("payer URLs accept only bounded Sandbox invoice routes",()=>{
  assert.equal(validateSandboxPaymentUrl(safeLink),safeLink);
  const alternate=`https://www.sandbox.paypal.com/invoice/payerView/details/${invoiceId}`;
  assert.equal(validateSandboxPaymentUrl(alternate),alternate);
  for(const url of ["https://www.paypal.com/invoice/p/#SAFE","http://www.sandbox.paypal.com/invoice/p/#SAFE",
    "https://www.sandbox.paypal.com.evil.test/invoice/p/#SAFE","https://u:p" + "@www.sandbox.paypal.com/invoice/p/#SAFE",
    "https://www.sandbox.paypal.com:443/invoice/p/#SAFE",safeLink+"/redirect", "https://www.sandbox.paypal.com/signin",
    "https://www.sandbox.paypal.com/invoice/p/?redirect=https://evil.test", "https://www.sandbox.paypal.com/invoice/p/%2Fsecret",
    "javascript:alert(1)","https://www.sandbox.paypal.com/invoice/p/#",safeLink+"\n", "https://www.sandbox.paypal.com/invoice/p/../evil"]){
    assert.throws(()=>validateSandboxPaymentUrl(url),error("unsafe_payment_url"),url);}
});
test("malicious payment link rejected without fetching it",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());f.remote.status="UNPAID";
  f.remote.detail.metadata={recipient_view_url:"https://evil.test/pay"};
  await assert.rejects(f.adapter.getInvoice(invoiceId),error("unsafe_payment_url"));assert.ok(f.calls.every(c=>!c.url.includes("evil.test")));
});
test("malformed, oversized, streaming oversized and redirected responses fail safely",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());
  const cases=[()=>new Response("{broken",{status:200}),()=>new Response("x".repeat(65537),{status:200}),
    ()=>new Response("{}",{status:200,headers:{"content-length":"999999"}}),()=>new Response(null,{status:302}),
    ()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(65537));c.close();}}),{status:200})];
  for(const factory of cases){f.transform(factory);await assert.rejects(f.adapter.getInvoice(invoiceId),error("invalid_provider_response"));}
});
test("send redirects are not followed or treated as confirmation",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());f.setSend("redirect");
  await assert.rejects(f.adapter.sendInvoice(invoiceId),error("invalid_provider_response"));
  assert.equal((await f.journal.byInvoice(invoiceId)).sendState,"started");
});
test("changed accepted snapshots or merchant scope cannot reuse a durable binding",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());
  await assert.rejects(f.make().createDraftInvoice({...accepted(),amountCents:42600}));
  const other=f.make({merchant:{name:"Other",email:"other@example.test"}});
  await assert.rejects(other.getInvoice(invoiceId),error("invoice_not_bound"));
});
test("same case cannot create a new invoice by changing request key",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());
  await assert.rejects(f.adapter.createDraftInvoice({...accepted(),requestId:"a-different-request"}));
  assert.equal(f.calls.filter(c=>c.url.endsWith("/invoicing/invoices")).length,1);
});
test("concurrent draft creation coalesces and restart returns binding without HTTP",async()=>{
  const f=fixture();await Promise.all(Array.from({length:5},()=>f.adapter.createDraftInvoice(accepted())));
  assert.equal(f.calls.filter(c=>c.url.endsWith("/invoicing/invoices")).length,1);
  const n=f.calls.length;assert.equal((await f.make().createDraftInvoice(accepted())).invoiceId,invoiceId);assert.equal(f.calls.length,n);
});
test("pending creation reservation cannot be retried blindly after restart",async()=>{
  const f=fixture();const broken=f.make({fetch:async()=>{throw new Error("provider timeout");}});
  await assert.rejects(broken.createDraftInvoice(accepted()));
  await assert.rejects(f.make().createDraftInvoice(accepted()),error("reconciliation_required"));assert.equal(f.calls.length,0);
});
test("SQLite migration and real journal SQL support draft/send/reload",async()=>{
  const {db,journal}=sqlite();try{
    const f=fixture(journal);await f.adapter.createDraftInvoice(accepted());await f.adapter.sendInvoice(invoiceId);
    const after=await f.make().getInvoice(invoiceId);assert.equal(after.status,"UNPAID");
    assert.equal((await journal.byInvoice(invoiceId)).sendState,"confirmed");
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
    const row=db.prepare("SELECT * FROM paypal_delivery_journal").get();
    assert.ok(!JSON.stringify(row).includes("buyer@example.test"));assert.ok(!JSON.stringify(row).includes("test-secret"));
  }finally{db.close();}
});
test("file-backed journal survives DB close and restart without duplicate creation or send",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"rr-send-")),file=join(dir,"delivery.sqlite");
  let database=sqlite(file);const f=fixture(database.journal);
  try{await f.adapter.createDraftInvoice(accepted());await f.adapter.sendInvoice(invoiceId);
    database.db.close();database=sqlite(file,false);
    const restarted=f.make({journal:database.journal});
    await restarted.createDraftInvoice(accepted());assert.equal((await restarted.sendInvoice(invoiceId)).status,"UNPAID");
    assert.equal(f.calls.filter(c=>c.url.endsWith("/send")).length,1);
    assert.equal(f.calls.filter(c=>c.url.endsWith("/invoicing/invoices")).length,1);
  }finally{database.db.close();rmSync(dir,{recursive:true,force:true});}
});
test("database guards prevent identity edits and send regression",async()=>{
  const {db,journal}=sqlite();try{
    const f=fixture(journal);await f.adapter.createDraftInvoice(accepted());await f.adapter.sendInvoice(invoiceId);
    assert.throws(()=>db.prepare("UPDATE paypal_delivery_journal SET snapshot_hash=?").run("f".repeat(64)),/Immutable/);
    assert.throws(()=>db.exec("UPDATE paypal_delivery_journal SET send_state='not_started'"),/cannot regress/);
    assert.throws(()=>db.exec("UPDATE paypal_delivery_journal SET binding_json=NULL"),/Immutable/);
  }finally{db.close();}
});
test("SQLite competing clients atomically acquire one send claim",async()=>{
  const {db,journal}=sqlite();try{const f=fixture(journal);await f.adapter.createDraftInvoice(accepted());
    const result=await Promise.all([journal.claimSend(invoiceId),journal.claimSend(invoiceId)]);
    assert.deepEqual(result.sort(),[false,true]);
  }finally{db.close();}
});
test("SQLite unknown cases violate FK and do not create journal rows",async()=>{
  const {db,journal}=sqlite();try{await assert.rejects(journal.reserve({requestId:"fake-reserve-123",caseId:uuid(9),snapshotHash:"a".repeat(64),merchantHash:"b".repeat(64)}),/FOREIGN KEY/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM paypal_delivery_journal").get().n,0);
  }finally{db.close();}
});
test("memory journal snapshots are isolated from caller mutation",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());const row=await f.journal.byInvoice(invoiceId);
  row.binding.draft.amountCents=1;assert.equal((await f.journal.byInvoice(invoiceId)).binding.draft.amountCents,42500);
});
test("creator and buyer exact consent tuple is checked for draft and send, with no recipient disclosure",async()=>{
  const f=fixture();const seen=[];const a=f.make({authorize:async ctx=>{seen.push(ctx);return true;}});
  await a.createDraftInvoice(accepted());await a.sendInvoice(invoiceId);
  assert.ok(seen.length>=3);
  for(const ctx of seen){assert.equal(ctx.creatorDecisionId,accepted().creatorDecisionId);assert.equal(ctx.assetId,accepted().assetId);
    assert.equal(ctx.buyerAcceptanceId,accepted().buyerAcceptanceId);assert.equal(ctx.amountCents,42500);
    assert.ok(Object.isFrozen(ctx));assert.ok(!('recipientEmail' in ctx));}
});
test("unauthorized draft and failed authorization callback make zero HTTP requests",async()=>{
  const f=fixture();f.setAuth(false);await assert.rejects(f.adapter.createDraftInvoice(accepted()),error("authorization_required"));
  const a=f.make({authorize:async()=>{throw new Error("private authentication context");}});
  await assert.rejects(a.createDraftInvoice(accepted()),e=>error("authorization_required")(e)&&!e.message.includes("private"));
  assert.equal(f.calls.length,0);
});
test("journal failures are sanitized and no send runs without a persisted claim",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());
  const a=f.make({journal:{...f.journal,claimSend:async()=>{throw new Error("private database fields");}}});
  await assert.rejects(a.sendInvoice(invoiceId),e=>error("delivery_conflict")(e)&&!e.message.includes("private"));
  assert.equal(f.calls.filter(c=>c.url.endsWith("/send")).length,0);
});
test("case deletion resets the transport journal by cascade",async()=>{
  const {db,journal}=sqlite();try{const f=fixture(journal);await f.adapter.createDraftInvoice(accepted());
    db.exec("DELETE FROM licensing_cases");assert.equal(await journal.byInvoice(invoiceId),null);
  }finally{db.close();}
});
test("consent revoked during status preflight prevents the subsequent send",async()=>{
  const f=fixture();await f.adapter.createDraftInvoice(accepted());
  f.transform(r=>{f.setAuth(false);return r;});
  await assert.rejects(f.adapter.sendInvoice(invoiceId),error("authorization_required"));
  assert.equal(f.calls.filter(c=>c.url.endsWith("/send")).length,0);
});
