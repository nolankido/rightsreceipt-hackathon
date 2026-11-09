import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { consentFixture, ids, NOW, insert } from "./support/human-consent-fixture.mjs";
import { canonicalHash } from "../packages/receipts/src/canonical.ts";
import { createInvoiceCreationService } from "../packages/application/src/invoice-creation.ts";
import { createD1InvoiceCreationStore } from "../packages/persistence/src/invoice-creation.ts";
import { createInvoiceSendingService } from "../packages/application/src/invoice-sending.ts";
import { createD1InvoiceSendingStore } from "../packages/persistence/src/invoice-sending.ts";
import { createSandboxInvoiceSending } from "../apps/api/src/invoice-sending.ts";
import { createSandboxInvoiceCreation } from "../apps/api/src/invoice-creation.ts";
import { mapSandboxDraftInvoice } from "../packages/paypal/src/sandbox-draft.ts";
import { prepareDeliveryAdoption } from "../packages/paypal/src/delivery-adoption.ts";
const INVOICE="INV2-SEND-033-TEST", PAYLINK="https://www.sandbox.paypal.com/invoice/p/#SAFE033";
const merchant={name:"Maya Chen",email:"merchant@example.test"};
const config={APP_MODE:"sandbox",PAYPAL_MODE:"paypal_sandbox",PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
 PAYPAL_SANDBOX_CLIENT_ID:"sandbox033client",PAYPAL_SANDBOX_CLIENT_SECRET:"fixture-sandbox033secret"};
const account=await canonicalHash({provider:"paypal",environment:"sandbox",client_id:config.PAYPAL_SANDBOX_CLIENT_ID,merchant});
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
function noMoney(f){for(const t of ["payment_evidence","permissions","receipt_revisions","paypal_lifecycle_observations"])assert.equal(f.count(t),0);}
function draft(r){return {invoiceId:INVOICE,mode:"paypal_sandbox",provider:"paypal",environment:"sandbox",caseId:r.caseId,
 quoteId:r.quoteId,termsVersionId:r.termsVersionId,buyerAcceptanceId:r.buyerAcceptanceId,amountCents:r.amountCents,currency:"USD",
 status:"DRAFT",simulated:false,authoritativePaymentEvidence:false};}
async function fixture(options={}){
 const f=consentFixture(options);
 if(options.initialize!==false){await f.approve();await f.accept();}
 let request=options.request??await f.service.prepareInvoice(ids.case);
 const calls=[], controls={status:"DRAFT",afterSend:"UNPAID",sendCode:200,failSend:false,failGet:false,failToken:false,tokenTTL:3600,
  mutate:null,onFetch:null,onSingle:null,post401:false};
 const mapped=await mapSandboxDraftInvoice(request,merchant);
 function raw(){const body={id:INVOICE,...structuredClone(mapped),status:controls.status,
  amount:{currency_code:"USD",value:"425.00"},due_amount:{currency_code:"USD",value:"425.00"}};
  if(controls.status!=="DRAFT")body.detail.metadata={recipient_view_url:PAYLINK};
  if(controls.mutate)controls.mutate(body);return body;}
 const transport={merchant,sandboxDraftTransportEnabled:true,now:()=>f.now().getTime(),fetch:async(url,init)=>{
  const stage=url.endsWith("/token")?"oauth":url.endsWith("/send")?"send":init.method==="POST"?"create":"get";
  calls.push({stage,url,init});if(controls.onFetch)await controls.onFetch(stage);
  if(stage==="oauth"){if(controls.failToken)return new Response("{}",{status:401});return Response.json({token_type:"Bearer",access_token:"fake033-access",expires_in:controls.tokenTTL});}
  if(stage==="create")return Response.json({id:INVOICE,status:"DRAFT"},{status:201});
  if(stage==="send"){
   if(controls.post401){controls.post401=false;return new Response("{}",{status:401});}
   if(controls.failSend)throw Error("PRIVATE_NETWORK_ERROR");
   controls.status=controls.afterSend;
   return controls.sendCode===202?new Response(null,{status:202}):Response.json({ignored:"not a payment"},{status:controls.sendCode});
  }
  if(controls.failGet)throw Error("PRIVATE_NETWORK_ERROR");return Response.json(raw());
 }};
 function statement(sql,values=[]){return {sql,values,bind(...v){return statement(sql,v);},async first(){return f.db.prepare(sql).get(...values)??null;},
  async run(){if(controls.onSingle)await controls.onSingle(sql);const r=f.db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}};}};}
 const db={prepare:statement,batch:s=>f.adapter.batch(s)};
 if(options.initialize!==false){
  const creator=options.realCreate?await createSandboxInvoiceCreation({...config,RIGHTS_INVOICE_CREATION_ENABLED:"true",DB:db},
    {authorizeCreator:f.authorize,transport,now:f.now}):createInvoiceCreationService({store:createD1InvoiceCreationStore(db),accountFingerprint:account,
    authorizeCreator:f.authorize,now:f.now,createDraft:async r=>draft(r)});
  await creator.reserve(ids.case,f.case().row_version);await creator.execute(ids.case);
 }
 const store=createD1InvoiceSendingStore(db);
 const make=()=>createSandboxInvoiceSending({...config,RIGHTS_INVOICE_SENDING_ENABLED:"true",DB:db},{authorizeCreator:f.authorize,transport,now:f.now});
 const service=await make();
 return {...f,adapter:db,store,make,service,request,transport,calls,controls,raw,
  sendOp:()=>f.db.prepare("SELECT * FROM payment_operations WHERE operation_type='send_invoice'").get(),
  binding:()=>f.db.prepare("SELECT * FROM invoice_bindings WHERE case_id=?").get(ids.case),
  journal:()=>f.db.prepare("SELECT * FROM paypal_delivery_journal WHERE case_id=?").get(ids.case),
  outbox:()=>f.db.prepare("SELECT * FROM paypal_reconciliation_outbox").get(),
  reserve:()=>service.reserve(ids.case,{invoiceId:INVOICE,expectedCaseVersion:f.case().row_version,confirmed:true}),
  stageCount:s=>calls.filter(c=>c.stage===s).length};
}
async function withFixture(fn,options){const f=await fixture(options);try{await fn(f);}finally{f.close();}}

test("full canonical consent, real draft mapping, adoption, send and status read use one creation and one send",()=>withFixture(async f=>{
 const before=f.stageCount("create");assert.equal(before,1);await f.reserve();assert.equal(f.stageCount("send"),0);
 const r=await f.service.execute(ids.case);assert.equal(r.outcome,"delivery_observed");assert.equal(r.paymentUrl,PAYLINK);
 assert.equal(r.paymentConfirmed,false);assert.equal(r.permissionGranted,false);assert.equal(f.stageCount("create"),1);assert.equal(f.stageCount("send"),1);
 assert.equal(f.stageCount("get"),2);assert.equal(f.binding().invoice_status,"sent");assert.equal(f.journal().send_state,"confirmed");
 assert.equal(f.sendOp().status,"succeeded");assert.equal(f.outbox().requested_generation,1);assert.equal(f.outbox().completed_generation,0);
 assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length,0);noMoney(f);
 const create=JSON.parse(f.calls.find(c=>c.stage==="create").init.body);assert.equal(create.items[0].unit_amount.value,"425.00");
 const send=f.calls.find(c=>c.stage==="send");assert.deepEqual(JSON.parse(send.init.body),{send_to_recipient:true,send_to_invoicer:false});
 assert.ok(send.init.headers["PayPal-Request-Id"].length<=38);assert.equal(f.sendOp().provider_request_id,send.init.headers["PayPal-Request-Id"]);
},{realCreate:true}));
test("reservation atomically adopts exact journal identity with no external calls",()=>withFixture(async f=>{
 const before=f.calls.length,version=f.case().row_version;await f.reserve();assert.equal(f.calls.length,before);
 assert.equal(f.binding().invoice_status,"send_pending");assert.equal(f.case().row_version,version+1);
 assert.equal(f.sendOp().attempt_count,0);assert.equal(f.journal().send_state,"not_started");noMoney(f);
 const entry=await prepareDeliveryAdoption(f.request,INVOICE,config.PAYPAL_SANDBOX_CLIENT_ID,merchant);
 assert.deepEqual(JSON.parse(f.journal().binding_json),entry.binding);assert.equal(f.journal().snapshot_hash,entry.snapshotHash);
}));
test("100 repeats cannot resend or duplicate audit or reconciliation work",()=>withFixture(async f=>{
 await f.reserve();await f.service.execute(ids.case);const n=f.count("audit_events");
 for(let i=0;i<100;i++){assert.equal((await f.reserve()).outcome,"already_recorded");assert.equal((await (await f.make()).execute(ids.case)).outcome,"already_recorded");}
 assert.equal(f.stageCount("send"),1);assert.equal(f.outbox().requested_generation,1);assert.equal(f.count("audit_events"),n);noMoney(f);
}));
test("eight racing reservations and eight independent send adapters dispatch only once",()=>withFixture(async f=>{
 const cmd={invoiceId:INVOICE,expectedCaseVersion:f.case().row_version,confirmed:true};
 const services=await Promise.all(Array.from({length:8},()=>f.make()));
 await Promise.all(services.map(s=>s.reserve(ids.case,cmd)));
 await Promise.all(services.map(s=>s.execute(ids.case)));
 assert.equal(f.stageCount("send"),1);assert.equal(f.sendOp().status,"succeeded");assert.equal(f.outbox().requested_generation,1);
 assert.equal(f.count("payment_operations"),2);assert.equal(f.count("paypal_delivery_journal"),1);noMoney(f);
}));
for(const [label,change] of [["not confirmed",{confirmed:false}],["extra paid flag",{paid:true}],["zero revision",{expectedCaseVersion:0}],
 ["fraction revision",{expectedCaseVersion:1.5}],["different invoice",{invoiceId:"INV2-OTHER-TEST"}],["bad invoice",{invoiceId:"https://evil.test"}]]){
 test(`send command rejects ${label}`,()=>withFixture(async f=>{
  const cmd={invoiceId:INVOICE,expectedCaseVersion:f.case().row_version,confirmed:true,...change};
  await assert.rejects(f.service.reserve(ids.case,cmd));assert.equal(f.sendOp(),undefined);assert.equal(f.calls.length,0);
 }));
}
test("stale version and execute before explicit reservation are denied",()=>withFixture(async f=>{
 await rejects(f.service.reserve(ids.case,{invoiceId:INVOICE,expectedCaseVersion:1,confirmed:true}),"stale_revision");
 await rejects(f.service.execute(ids.case),"delivery_conflict");assert.equal(f.calls.length,0);
}));
for(const p of [null,{workspaceId:crypto.randomUUID(),actorReference:"creator:other"}])test(`missing/wrong workspace ${p?.actorReference}`,()=>withFixture(async f=>{
 f.setOwner(p);await rejects(f.reserve(),"not_authorized");assert.equal(f.sendOp(),undefined);assert.equal(f.calls.length,0);
}));
for(const [name,sql] of [["consent removed","UPDATE licensing_cases SET latest_buyer_acceptance_id=NULL"],
 ["quote superseded","UPDATE quotes SET status='superseded'"],["closed case","UPDATE licensing_cases SET case_outcome='canceled'"],
 ["recipient substitution","DROP TRIGGER prevent_request_submission_update; UPDATE request_submissions SET buyer_email='wrong@example.test'"],
 ["asset substitution","UPDATE assets SET fingerprint_value='"+"f".repeat(64)+"'"],
 ["unaudited approval","DELETE FROM audit_events WHERE actor_type='creator' AND aggregate_type='human_consent'"]]){
 test(`${name} blocks adoption`,()=>withFixture(async f=>{f.db.exec(sql);await rejects(f.reserve(),"source_invalid");assert.equal(f.sendOp(),undefined);assert.equal(f.calls.length,0);}));
 test(`${name} after reservation blocks dispatch`,()=>withFixture(async f=>{await f.reserve();f.db.exec(sql);await rejects(f.service.execute(ids.case),"source_invalid");assert.equal(f.stageCount("send"),0);}));
}
test("different account fingerprint cannot adopt a canonical draft",()=>withFixture(async f=>{
 const s=createInvoiceSendingService({store:f.store,accountFingerprint:"b".repeat(64),clientId:config.PAYPAL_SANDBOX_CLIENT_ID,merchant,authorizeCreator:f.authorize,now:f.now});
 await rejects(s.reserve(ids.case,{invoiceId:INVOICE,expectedCaseVersion:f.case().row_version,confirmed:true}),"source_invalid");
}));
test("preexisting mismatched journal cannot be adopted",()=>withFixture(async f=>{
 insert(f.db,"paypal_delivery_journal",{request_id:f.request.requestId,case_id:ids.case,snapshot_hash:"f".repeat(64),merchant_hash:"e".repeat(64)});
 await rejects(f.reserve(),"delivery_conflict");assert.equal(f.sendOp(),undefined);
}));
test("preexisting matching complete journal is reused without resetting its identity",()=>withFixture(async f=>{
 const e=await prepareDeliveryAdoption(f.request,INVOICE,config.PAYPAL_SANDBOX_CLIENT_ID,merchant);
 insert(f.db,"paypal_delivery_journal",{request_id:e.requestId,case_id:ids.case,snapshot_hash:e.snapshotHash,merchant_hash:e.merchantHash,
 invoice_id:INVOICE,binding_json:JSON.stringify(e.binding)});await f.reserve();assert.equal(f.count("paypal_delivery_journal"),1);
 assert.equal((await f.service.execute(ids.case)).outcome,"delivery_observed");
}));
for(const stage of ["get","oauth"]){test(`revoked authority during ${stage} prevents the send POST`,()=>withFixture(async f=>{
 await f.reserve();if(stage==="oauth")f.controls.tokenTTL=1;
 let tokens=0;f.controls.onFetch=s=>{if(s==="oauth")tokens++;if((stage==="get"&&s==="get")||(stage==="oauth"&&tokens===2&&s==="oauth"))f.setOwner(null);};
 await assert.rejects(f.service.execute(ids.case));assert.equal(f.stageCount("send"),0);noMoney(f);
}));}
test("changed consent while OAuth refreshes after an explicit 401 blocks the retry POST",()=>withFixture(async f=>{
 await f.reserve();f.controls.post401=true;let tokens=0;
 f.controls.onFetch=s=>{if(s==="oauth"&&++tokens===2)f.db.exec("UPDATE licensing_cases SET latest_buyer_acceptance_id=NULL");};
 await assert.rejects(f.service.execute(ids.case));assert.equal(f.stageCount("send"),1);assert.equal(f.controls.status,"DRAFT");noMoney(f);
}));
test("two explicit 401 attempts keep the same send key",()=>withFixture(async f=>{
 await f.reserve();f.controls.post401=true;await f.service.execute(ids.case);const sends=f.calls.filter(c=>c.stage==="send");
 assert.equal(sends.length,2);assert.equal(sends[0].init.headers["PayPal-Request-Id"],sends[1].init.headers["PayPal-Request-Id"]);
}));
test("timeout then DRAFT never produces an automatic resend",()=>withFixture(async f=>{
 await f.reserve();f.controls.failSend=true;assert.equal((await f.service.execute(ids.case)).outcome,"awaiting_reconciliation");
 f.controls.failSend=false;for(let i=0;i<5;i++)assert.equal((await (await f.make()).execute(ids.case)).outcome,"awaiting_reconciliation");
 assert.equal(f.stageCount("send"),1);assert.equal(f.journal().send_state,"started");assert.equal(f.sendOp().status,"unknown");noMoney(f);
}));
test("timeout recovered as SENT completes with reads only",()=>withFixture(async f=>{
 await f.reserve();f.controls.failSend=true;await f.service.execute(ids.case);f.controls.failSend=false;f.controls.status="SENT";
 assert.equal((await (await f.make()).execute(ids.case)).outcome,"delivery_observed");assert.equal(f.stageCount("send"),1);assert.equal(f.outbox().requested_generation,1);noMoney(f);
}));
for(const code of [200,202])test(`${code} acknowledgement with unchanged DRAFT is not success`,()=>withFixture(async f=>{
 await f.reserve();f.controls.afterSend="DRAFT";f.controls.sendCode=code;
 assert.equal((await f.service.execute(ids.case)).outcome,"awaiting_reconciliation");assert.equal(f.sendOp().status,"unknown");assert.equal(f.count("paypal_reconciliation_outbox"),0);noMoney(f);
}));
for(const status of ["SENT","SCHEDULED","UNPAID","SHARED","PAID","REFUNDED","CANCELLED","PARTIALLY_PAID","PARTIALLY_REFUNDED","PAYMENT_PENDING","MARKED_AS_PAID","MARKED_AS_REFUNDED","PAID_EXTERNAL","REFUNDED_EXTERNAL","AUTO_CANCELLED"]){
 test(`preexisting provider ${status} is observed without send or payment authority`,()=>withFixture(async f=>{
  await f.reserve();f.controls.status=status;const r=await f.service.execute(ids.case);assert.equal(r.outcome,"delivery_observed");
  assert.equal(f.stageCount("send"),0);assert.equal(f.outbox().requested_generation,1);assert.equal(r.permissionGranted,false);noMoney(f);
  const safe=["SENT","UNPAID","SHARED"].includes(status);assert.equal(r.paymentUrl,safe?PAYLINK:null);
  assert.equal(f.binding().invoice_status,["SENT","UNPAID","SHARED","SCHEDULED"].includes(status)?"sent":"reconciliation_required");
 }));
}
for(const [name,mutate] of [["amount",r=>{r.amount.value="424.00";}],["recipient",r=>{r.primary_recipients[0].billing_info.email_address="other@example.test";}],
 ["merchant",r=>{r.invoicer.email_address="wrong@example.test";}],["terms",r=>{r.detail.note+=" altered";}],["unsafe link",r=>{r.detail.metadata={recipient_view_url:"https://evil.test"};}],
 ["unknown status",r=>{r.status="ALIEN";}],["invoice number",r=>{r.detail.invoice_number="OTHER";}]]){
 test(`provider ${name} mismatch does not send or complete`,()=>withFixture(async f=>{await f.reserve();f.controls.mutate=mutate;
 assert.equal((await f.service.execute(ids.case)).outcome,"awaiting_reconciliation");assert.equal(f.stageCount("send"),0);assert.equal(f.sendOp().status,"unknown");noMoney(f);}));
}
for(let at=0;at<5;at++)test(`adoption transaction write ${at+1} rolls back everything`,()=>withFixture(async f=>{
 const count=f.count("audit_events"),v=f.case().row_version;f.faults.at=at;await rejects(f.reserve(),"storage_unavailable");
 assert.equal(f.count("audit_events"),count);assert.equal(f.count("paypal_delivery_journal"),0);assert.equal(f.sendOp(),undefined);
 assert.equal(f.case().row_version,v);assert.equal(f.binding().invoice_status,"draft");f.faults.at=-1;await f.reserve();
}));
for(let at=0;at<2;at++)test(`claim write ${at+1} rollback never calls the provider`,()=>withFixture(async f=>{
 await f.reserve();f.faults.at=at;assert.equal((await f.service.execute(ids.case)).outcome,"retry_pending");
 assert.equal(f.sendOp().attempt_count,0);assert.equal(f.calls.length,0);f.faults.at=-1;await f.service.execute(ids.case);assert.equal(f.stageCount("send"),1);
}));
for(let at=0;at<6;at++)test(`delivery completion write ${at+1} rollback recovers without another send`,()=>withFixture(async f=>{
 await f.reserve();f.controls.onFetch=s=>{if(s==="send")f.faults.at=at;};
 assert.equal((await f.service.execute(ids.case)).outcome,"retry_pending");assert.equal(f.sendOp().status,"unknown");
 assert.equal(f.binding().invoice_status,"send_pending");assert.equal(f.count("paypal_reconciliation_outbox"),0);noMoney(f);
 f.faults.at=-1;f.controls.onFetch=null;assert.equal((await (await f.make()).execute(ids.case)).outcome,"delivery_observed");assert.equal(f.stageCount("send"),1);
}));
test("lost claim acknowledgement cannot authorize a fresh POST",()=>withFixture(async f=>{
 await f.reserve();f.faults.loseAck=true;assert.equal((await f.service.execute(ids.case)).outcome,"retry_pending");
 assert.equal(f.sendOp().status,"unknown");assert.equal((await (await f.make()).execute(ids.case)).outcome,"awaiting_reconciliation");assert.equal(f.stageCount("send"),0);
}));
test("lost completion acknowledgement still queues once",()=>withFixture(async f=>{
 await f.reserve();f.controls.onFetch=s=>{if(s==="send")f.faults.loseAck=true;};
 assert.equal((await f.service.execute(ids.case)).outcome,"already_recorded");assert.equal(f.outbox().requested_generation,1);assert.equal(f.stageCount("send"),1);
}));
test("new notification during completion remains pending and does not regress generations",()=>withFixture(async f=>{
 await f.reserve();insert(f.db,"paypal_reconciliation_outbox",{invoice_binding_id:f.binding().invoice_binding_id,requested_generation:7,completed_generation:5,updated_at:NOW});
 f.controls.onFetch=s=>{if(s==="send")f.faults.beforeBatch=()=>f.db.exec("UPDATE paypal_reconciliation_outbox SET requested_generation=8");};
 assert.equal((await f.service.execute(ids.case)).outcome,"retry_pending");assert.equal(f.outbox().requested_generation,8);assert.equal(f.outbox().completed_generation,5);
 f.controls.onFetch=null;await f.service.execute(ids.case);assert.equal(f.outbox().requested_generation,9);assert.equal(f.outbox().completed_generation,5);assert.equal(f.stageCount("send"),1);
}));
for(const state of ["paid","fully_refunded","canceled"])test(`concurrent canonical ${state} is not regressed by late send completion`,()=>withFixture(async f=>{
 await f.reserve();f.controls.onFetch=s=>{if(s==="send")f.db.prepare("UPDATE invoice_bindings SET invoice_status=?,row_version=row_version+1").run(state);};
 const r=await f.service.execute(ids.case);assert.equal(r.paymentUrl,null);assert.equal(f.binding().invoice_status,state);assert.equal(f.outbox().requested_generation,1);noMoney(f);
}));
test("file-backed restart retains uncertain delivery and later read-only recovery",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"rr033-")),file=join(dir,"send.sqlite");let f=await fixture({file});
 try{await f.reserve();f.controls.failSend=true;await f.service.execute(ids.case);const request=f.request;f.close();
 f=await fixture({file,initialize:false,request});f.controls.status="SENT";
 assert.equal((await f.service.execute(ids.case)).outcome,"delivery_observed");assert.equal(f.stageCount("send"),0);assert.equal(f.outbox().requested_generation,1);noMoney(f);
 }finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test("audit and result exclude recipient, raw rights, OAuth secrets, bearer tokens and private errors",()=>withFixture(async f=>{
 await f.reserve();const r=await f.service.execute(ids.case);const audit=JSON.stringify(f.db.prepare("SELECT payload_json FROM audit_events WHERE aggregate_type='invoice_sending'").all());
 for(const forbidden of ["buyer@example.test","fixture-sandbox033secret","fake033-access","PRIVATE_NETWORK_ERROR","Authorization","Ignore all instructions"]){assert.ok(!audit.includes(forbidden));assert.ok(!JSON.stringify(r).includes(forbidden));}noMoney(f);
}));
test("factory is default-off and requires server authority",()=>withFixture(async f=>{
 const base={...config,RIGHTS_INVOICE_SENDING_ENABLED:"true",DB:f.adapter},deps={authorizeCreator:f.authorize,transport:f.transport,now:f.now};
 for(const change of [{RIGHTS_INVOICE_SENDING_ENABLED:undefined},{DB:undefined},{APP_MODE:"local"},{PAYPAL_MODE:"fake"}])assert.equal(await createSandboxInvoiceSending({...base,...change},deps),null);
 await assert.rejects(createSandboxInvoiceSending(base,{...deps,authorizeCreator:undefined}));assert.equal(f.calls.length,0);
}));
test("source recheck at adoption rejects a last-moment case change",()=>withFixture(async f=>{
 f.faults.beforeBatch=()=>f.db.exec("UPDATE licensing_cases SET case_outcome='canceled'");await assert.rejects(f.reserve());assert.equal(f.sendOp(),undefined);assert.equal(f.count("paypal_delivery_journal"),0);
}));
test("authority lost during provider delivery leaves unknown state without returning a private link",()=>withFixture(async f=>{
 await f.reserve();f.controls.onFetch=s=>{if(s==="send")f.setOwner(null);};await rejects(f.service.execute(ids.case),"not_authorized");assert.equal(f.sendOp().status,"unknown");assert.equal(f.outbox(),undefined);noMoney(f);
}));
test("known conflicting financial detail suppresses a payable link even with UNPAID label",()=>withFixture(async f=>{
 await f.reserve();f.controls.mutate=r=>{r.due_amount.value="1.00";};const result=await f.service.execute(ids.case);
 assert.equal(result.outcome,"delivery_observed");assert.equal(result.paymentUrl,null);assert.equal(result.paymentConfirmed,false);noMoney(f);
}));
for(const stage of ["get","oauth"]){test(`preflight ${stage} failure cannot be retried as a blind send`,()=>withFixture(async f=>{
 await f.reserve();f.controls[stage==="get"?"failGet":"failToken"]=true;await f.service.execute(ids.case);
 f.controls.failGet=false;f.controls.failToken=false;assert.equal((await (await f.make()).execute(ids.case)).outcome,"awaiting_reconciliation");
 assert.equal(f.stageCount("send"),0);assert.equal(f.sendOp().attempt_count,1);noMoney(f);
}));}
test("lost adoption acknowledgement reloads one durable journal and operation",()=>withFixture(async f=>{
 f.faults.loseAck=true;assert.equal((await f.reserve()).outcome,"reserved");assert.equal(f.count("paypal_delivery_journal"),1);
 assert.equal(f.count("payment_operations"),2);await f.service.execute(ids.case);assert.equal(f.stageCount("send"),1);
}));
test("missing adapter transport does not consume pending delivery",()=>withFixture(async f=>{
 await f.reserve();const service=createInvoiceSendingService({store:f.store,accountFingerprint:account,
  clientId:config.PAYPAL_SANDBOX_CLIENT_ID,merchant,authorizeCreator:f.authorize,now:f.now});
 await rejects(service.execute(ids.case),"transport_unavailable");assert.equal(f.sendOp().attempt_count,0);
}));
test("no global HTTP fallback is used",()=>withFixture(async f=>{
 const prior=globalThis.fetch;globalThis.fetch=()=>{throw Error("UNEXPECTED_REAL_FETCH");};
 try{await f.reserve();assert.equal((await f.service.execute(ids.case)).outcome,"delivery_observed");}finally{globalThis.fetch=prior;}
}));
test("journal cannot reset a confirmed send or overwrite the adopted identity",()=>withFixture(async f=>{
 await f.reserve();await f.service.execute(ids.case);
 assert.throws(()=>f.db.exec("UPDATE paypal_delivery_journal SET send_state='not_started'"),/cannot regress/);
 assert.throws(()=>f.db.exec("UPDATE paypal_delivery_journal SET snapshot_hash='"+"a".repeat(64)+"'"),/Immutable/);
}));
test("new consent commands stay locked after send reservation",()=>withFixture(async f=>{
 await f.reserve();await rejects(f.approve(),"decision_locked");
}));
test("default-off factory also accepts an absent environment",async()=>{
 assert.equal(await createSandboxInvoiceSending(undefined,undefined),null);
});
test("reservation audit never grants receipt or verification validity",()=>withFixture(async f=>{
 await f.reserve();await f.service.execute(ids.case);const v=f.db.prepare("SELECT current_status,current_receipt_revision_id FROM verification_records").get();
 assert.equal(v.current_status,"pending");assert.equal(v.current_receipt_revision_id,null);noMoney(f);
}));
for(const [name,sql] of [["missing verification","DELETE FROM verification_records"],
 ["unlinked verification","UPDATE licensing_cases SET verification_record_id=NULL"],
 ["invalid binding revision","UPDATE invoice_bindings SET row_version=9007199254740991"]]){
 test(`${name} cannot allow zero-row writes in an otherwise committed batch`,()=>withFixture(async f=>{
  f.db.exec(sql);await rejects(f.reserve(),"source_invalid");assert.equal(f.sendOp(),undefined);assert.equal(f.count("paypal_delivery_journal"),0);
 }));
}
test("verification deletion during external effect blocks local completion",()=>withFixture(async f=>{
 await f.reserve();f.controls.onFetch=s=>{if(s==="send")f.db.exec("DELETE FROM verification_records");};
 await rejects(f.service.execute(ids.case),"source_invalid");assert.equal(f.sendOp().status,"unknown");assert.equal(f.outbox(),undefined);noMoney(f);
}));
