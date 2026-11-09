import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { consentFixture,ids,NOW,insert } from "./support/human-consent-fixture.mjs";
import { createInvoiceCreationService } from "../packages/application/src/invoice-creation.ts";
import { createD1InvoiceCreationStore } from "../packages/persistence/src/invoice-creation.ts";
import { createSandboxInvoiceCreation } from "../apps/api/src/invoice-creation.ts";
const ACCOUNT="a".repeat(64), INVOICE="INV2-RESERVATION-TEST";
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
const noMoney=f=>{for(const t of ["payment_evidence","permissions","receipt_revisions","paypal_reconciliation_outbox"])assert.equal(f.count(t),0);};
function draft(r){return {invoiceId:INVOICE,mode:"paypal_sandbox",provider:"paypal",environment:"sandbox",caseId:r.caseId,
 quoteId:r.quoteId,termsVersionId:r.termsVersionId,buyerAcceptanceId:r.buyerAcceptanceId,amountCents:r.amountCents,
 currency:"USD",status:"DRAFT",simulated:false,authoritativePaymentEvidence:false};}
async function fixture(options={}){
 const f=consentFixture(options);if(options.initialize!==false){await f.approve();await f.accept();}
 const store=createD1InvoiceCreationStore(f.adapter),calls=[];let handler=async r=>draft(r);
 const service=()=>createInvoiceCreationService({store,accountFingerprint:ACCOUNT,authorizeCreator:f.authorize,now:f.now,
  createDraft:async r=>{calls.push(r);return handler(r);}});
 return {...f,store,calls,make:service,invoice:service(),setProvider:fn=>{handler=fn;},
  op:()=>f.db.prepare("SELECT * FROM payment_operations WHERE case_id=?").get(ids.case),
  binding:()=>f.db.prepare("SELECT * FROM invoice_bindings WHERE case_id=?").get(ids.case),
  reserve:()=>service().reserve(ids.case,f.case().row_version)};
}
test("accepted offer reserves one durable operation, binding and audit without provider access",async()=>{
 const f=await fixture();try{const version=f.case().row_version,r=await f.reserve();assert.equal(r.outcome,"reserved");
 assert.equal(f.count("payment_operations"),1);assert.equal(f.count("invoice_bindings"),1);assert.equal(f.calls.length,0);
 assert.equal(f.binding().invoice_status,"create_pending");assert.equal(f.op().attempt_count,0);assert.equal(f.case().row_version,version+1);
 assert.ok(f.op().provider_request_id.length<=38);noMoney(f);}finally{f.close();}
});
test("real consent commands lead to the exact $425 draft binding without sending or licensing",async()=>{
 const f=await fixture();try{await f.reserve();const r=await f.invoice.execute(ids.case);assert.equal(r.outcome,"draft_bound");
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].amountCents,42500);assert.equal(JSON.parse(f.calls[0].rightsSummary).ai_use,"prohibited");
 assert.equal(f.binding().provider_invoice_id,INVOICE);assert.equal(f.binding().safe_invoice_reference,INVOICE);
 assert.equal(f.binding().invoice_status,"draft");assert.equal(f.op().status,"succeeded");assert.equal(f.op().attempt_count,1);
 assert.equal(r.invoiceSentByThisCommand,false);assert.equal(r.paymentConfirmed,false);assert.equal(r.permissionGranted,false);noMoney(f);
 assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length,0);
 }finally{f.close();}
});
test("100 reserve/execute replays reuse the same operation and do not call the provider again",async()=>{
 const f=await fixture();try{const original=f.case().row_version;await f.reserve();await f.invoice.execute(ids.case);const count=f.count("audit_events");
 for(let n=0;n<100;n++){assert.equal((await f.make().reserve(ids.case,original)).outcome,"already_bound");assert.equal((await f.make().execute(ids.case)).outcome,"already_bound");}
 assert.equal(f.calls.length,1);assert.equal(f.count("audit_events"),count);assert.equal(f.count("invoice_bindings"),1);noMoney(f);
 }finally{f.close();}
});
test("eight competing reservations produce exactly one binding and operation",async()=>{
 const f=await fixture();try{const v=f.case().row_version;const rows=await Promise.all(Array.from({length:8},()=>f.make().reserve(ids.case,v)));
 assert.ok(rows.every(r=>r.outcome==="reserved"));assert.equal(f.count("invoice_bindings"),1);assert.equal(f.count("payment_operations"),1);
 assert.equal(new Set(rows.map(r=>r.bindingId)).size,1);assert.equal(f.calls.length,0);
 }finally{f.close();}
});
test("eight concurrent execution callers dispatch at most once",async()=>{
 const f=await fixture();try{await f.reserve();const rows=await Promise.all(Array.from({length:8},()=>f.make().execute(ids.case)));
 assert.equal(f.calls.length,1);assert.equal(f.op().status,"succeeded");assert.ok(rows.some(r=>r.outcome==="draft_bound"));noMoney(f);
 }finally{f.close();}
});
for(const stage of ["no_creator","no_buyer","unbacked"]){
 test(`reservation rejects ${stage} consent`,async()=>{const f=consentFixture();try{
  if(stage!=="no_creator")await f.approve();if(stage==="unbacked"){await f.accept();f.db.exec("DELETE FROM audit_events WHERE actor_type='buyer'");}
  const s=createInvoiceCreationService({store:createD1InvoiceCreationStore(f.adapter),accountFingerprint:ACCOUNT,authorizeCreator:f.authorize,now:f.now});
  await rejects(s.reserve(ids.case,f.case().row_version),"source_invalid");assert.equal(f.count("payment_operations"),0);noMoney(f);
 }finally{f.close();}});
}
for(const v of [0,-1,1.5,NaN,Infinity,"1"]){test(`invalid case revision ${v} creates nothing`,async()=>{const f=await fixture();try{
 await rejects(f.invoice.reserve(ids.case,v),"invalid_command");assert.equal(f.count("invoice_bindings"),0);}finally{f.close();}});}
test("stale displayed version is not silently accepted",async()=>{const f=await fixture();try{await rejects(f.invoice.reserve(ids.case,1),"stale_revision");assert.equal(f.count("payment_operations"),0);}finally{f.close();}});
for(const owner of [null,{workspaceId:crypto.randomUUID(),actorReference:"creator:other"}]){
 test(`missing or cross-workspace authorization is denied ${owner?.actorReference}`,async()=>{const f=await fixture();try{f.setOwner(owner);
 await rejects(f.reserve(),"not_authorized");assert.equal(f.count("invoice_bindings"),0);}finally{f.close();}});
}
test("factory/service never substitutes a role-header or missing authorizer",async()=>{const f=await fixture();try{
 const s=createInvoiceCreationService({store:f.store,accountFingerprint:ACCOUNT,now:f.now});await rejects(s.reserve(ids.case,f.case().row_version),"not_authorized");noMoney(f);
 }finally{f.close();}});
test("a different merchant/account cannot reuse a reservation",async()=>{const f=await fixture();try{await f.reserve();const s=createInvoiceCreationService({store:f.store,
 accountFingerprint:"b".repeat(64),authorizeCreator:f.authorize,now:f.now,createDraft:async r=>draft(r)});
 await rejects(s.execute(ids.case),"invoice_conflict");assert.equal(f.op().attempt_count,0);assert.equal(f.calls.length,0);}finally{f.close();}});
test("missing transport cannot consume the durable dispatch claim",async()=>{const f=await fixture();try{await f.reserve();const s=createInvoiceCreationService({store:f.store,
 accountFingerprint:ACCOUNT,authorizeCreator:f.authorize,now:f.now});await rejects(s.execute(ids.case),"transport_unavailable");assert.equal(f.op().attempt_count,0);}finally{f.close();}});
for(const [label,sql] of [["asset swap","UPDATE assets SET fingerprint_value='"+"f".repeat(64)+"'"],
 ["recipient swap","DROP TRIGGER prevent_request_submission_update; UPDATE request_submissions SET buyer_email='other@example.test'"],
 ["acceptance loss","UPDATE licensing_cases SET latest_buyer_acceptance_id=NULL"],
 ["closed case","UPDATE licensing_cases SET case_outcome='canceled'"],
 ["quote substitution","UPDATE quotes SET status='superseded'"]]){
 test(`${label} after reservation blocks provider dispatch`,async()=>{const f=await fixture();try{await f.reserve();f.db.exec(sql);
 await rejects(f.invoice.execute(ids.case),"source_invalid");assert.equal(f.calls.length,0);assert.equal(f.op().attempt_count,0);noMoney(f);
 }finally{f.close();}});
}
for(const point of [0,1,2,3])test(`reservation transaction failure at write ${point+1} leaves no partial records`,async()=>{
 const f=await fixture();try{const count=f.count("audit_events");f.faults.at=point;await assert.rejects(f.reserve());
 assert.equal(f.count("payment_operations"),0);assert.equal(f.count("invoice_bindings"),0);assert.equal(f.case().invoice_binding_id,null);
 assert.equal(f.count("audit_events"),count);f.faults.at=-1;assert.equal((await f.reserve()).outcome,"reserved");noMoney(f);
 }finally{f.close();}
});
test("reservation reserves a random public reference when one does not yet exist",async()=>{const f=await fixture();try{
 f.db.prepare("UPDATE licensing_cases SET verification_record_id=NULL WHERE case_id=?").run(ids.case);f.db.exec("DELETE FROM verification_records");await f.reserve();
 const v=f.db.prepare("SELECT * FROM verification_records").get();assert.match(v.public_verification_id,/^[A-Za-z0-9_-]{32}$/);assert.equal(v.current_status,"pending");
 assert.equal(f.case().verification_record_id,v.verification_record_id);noMoney(f);}finally{f.close();}});
test("lost reservation acknowledgement reloads one durable result",async()=>{const f=await fixture();try{f.faults.loseAck=true;assert.equal((await f.reserve()).outcome,"reserved");
 assert.equal(f.count("invoice_bindings"),1);assert.equal(f.count("payment_operations"),1);assert.equal(f.calls.length,0);}finally{f.close();}});
for(const point of [0,1])test(`dispatch fence failure at write ${point+1} makes no provider request`,async()=>{
 const f=await fixture();try{await f.reserve();f.faults.at=point;assert.equal((await f.invoice.execute(ids.case)).outcome,"retry_pending");
 assert.equal(f.op().attempt_count,0);assert.equal(f.calls.length,0);f.faults.at=-1;await f.invoice.execute(ids.case);assert.equal(f.calls.length,1);}finally{f.close();}
});
test("lost dispatch acknowledgement never retries a possibly started POST",async()=>{const f=await fixture();try{await f.reserve();f.faults.loseAck=true;
 assert.equal((await f.invoice.execute(ids.case)).outcome,"retry_pending");assert.equal(f.op().attempt_count,1);assert.equal(f.calls.length,0);
 for(let n=0;n<5;n++)assert.equal((await f.make().execute(ids.case)).outcome,"awaiting_reconciliation");assert.equal(f.calls.length,0);noMoney(f);}finally{f.close();}});
for(const code of ["sandbox_unknown_outcome","sandbox_rate_limited","sandbox_oauth_rejected","sandbox_invoice_rejected","arbitrary_secret"]){
 test(`provider failure ${code} is redacted and never blindly retried`,async()=>{const f=await fixture();try{await f.reserve();f.setProvider(async()=>{throw Object.assign(Error("PRIVATE_TOKEN"),{code});});
 const r=await f.invoice.execute(ids.case);assert.equal(r.outcome,"awaiting_reconciliation");assert.ok(!JSON.stringify(r).includes("PRIVATE"));
 await f.make().execute(ids.case);assert.equal(f.calls.length,1);assert.equal(f.op().status,"unknown");assert.equal(f.binding().provider_invoice_id,null);noMoney(f);
 }finally{f.close();}});
}
for(const [key,value] of [["status","PAID"],["environment","live"],["provider","fake"],["simulated",true],["amountCents",1],
 ["currency","EUR"],["caseId",crypto.randomUUID()],["termsVersionId",crypto.randomUUID()],["buyerAcceptanceId",crypto.randomUUID()],["quoteId",crypto.randomUUID()],
 ["invoiceId","https://evil.test"],["authoritativePaymentEvidence",true]]){
 test(`mismatched provider ${key} is not bound`,async()=>{const f=await fixture();try{await f.reserve();f.setProvider(async r=>({...draft(r),[key]:value}));
 assert.equal((await f.invoice.execute(ids.case)).outcome,"awaiting_reconciliation");assert.equal(f.binding().provider_invoice_id,null);await f.make().execute(ids.case);
 assert.equal(f.calls.length,1);noMoney(f);}finally{f.close();}});
}
for(const point of [0,1])test(`provider response persistence failure ${point+1} never binds or creates again`,async()=>{
 const f=await fixture();try{await f.reserve();f.setProvider(async r=>{f.faults.at=point;return draft(r);});
 assert.equal((await f.invoice.execute(ids.case)).outcome,"awaiting_reconciliation");assert.equal(f.op().provider_reference,null);assert.equal(f.calls.length,1);
 f.faults.at=-1;await f.make().execute(ids.case);assert.equal(f.calls.length,1);assert.equal(f.binding().provider_invoice_id,null);noMoney(f);
 }finally{f.close();}
});
for(const point of [0,1,2,3])test(`binding failure ${point+1} keeps the provider reference for safe local retry`,async()=>{
 const f=await fixture();try{await f.reserve();const base=f.store;const store={...base,bind:async(...args)=>{f.faults.at=point;return base.bind(...args);}};
 const s=createInvoiceCreationService({store,accountFingerprint:ACCOUNT,authorizeCreator:f.authorize,now:f.now,createDraft:async r=>{f.calls.push(r);return draft(r);}});
 assert.equal((await s.execute(ids.case)).outcome,"retry_pending");assert.equal(f.op().provider_reference,INVOICE);assert.equal(f.op().status,"unknown");assert.equal(f.binding().provider_invoice_id,null);
 f.faults.at=-1;assert.equal((await f.make().execute(ids.case)).outcome,"draft_bound");assert.equal(f.calls.length,1);noMoney(f);
 }finally{f.close();}
});
test("revoked creator session after provider creation retains reference but blocks binding",async()=>{const f=await fixture();try{await f.reserve();
 f.setProvider(async r=>{f.setOwner(null);return draft(r);});await rejects(f.invoice.execute(ids.case),"not_authorized");
 assert.equal(f.op().provider_reference,INVOICE);assert.equal(f.binding().provider_invoice_id,null);f.setOwner({workspaceId:ids.workspace,actorReference:"creator:fixture"});
 assert.equal((await f.make().execute(ids.case)).outcome,"draft_bound");assert.equal(f.calls.length,1);noMoney(f);}finally{f.close();}});
test("consent alteration during provider request is never finalized",async()=>{const f=await fixture();try{await f.reserve();
 f.setProvider(async r=>{f.db.exec("UPDATE licensing_cases SET latest_buyer_acceptance_id=NULL");return draft(r);});await rejects(f.invoice.execute(ids.case),"source_invalid");
 assert.equal(f.op().provider_reference,INVOICE);assert.equal(f.binding().provider_invoice_id,null);assert.equal(f.calls.length,1);noMoney(f);}finally{f.close();}});
test("exact database snapshot rejects changes between authorization and reservation commit",async()=>{const f=await fixture();try{
 f.faults.beforeBatch=()=>f.db.exec("UPDATE assets SET fingerprint_value='"+"f".repeat(64)+"'");await rejects(f.reserve(),"source_invalid");
 assert.equal(f.count("invoice_bindings"),0);assert.equal(f.count("payment_operations"),0);noMoney(f);}finally{f.close();}});
test("completed bindings survive file close/reopen without another provider call",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"rr032-")),file=join(dir,"db.sqlite");let f=await fixture({file});
 try{await f.reserve();await f.invoice.execute(ids.case);f.close();f=await fixture({file,initialize:false});assert.equal((await f.invoice.execute(ids.case)).outcome,"already_bound");
 assert.equal(f.calls.length,0);assert.equal(f.count("invoice_bindings"),1);noMoney(f);}finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test("incomplete creation remains blocked after restart, regardless of elapsed time",async()=>{const dir=mkdtempSync(join(tmpdir(),"rr032-unknown-")),file=join(dir,"db.sqlite");let f=await fixture({file});
 try{await f.reserve();f.setProvider(async()=>{throw Error("timeout");});await f.invoice.execute(ids.case);f.close();f=await fixture({file,initialize:false});f.setTime("2027-01-01T00:00:00.000Z");
 assert.equal((await f.invoice.execute(ids.case)).outcome,"awaiting_reconciliation");assert.equal(f.calls.length,0);noMoney(f);}finally{f.close();rmSync(dir,{recursive:true,force:true});}});
test("operation audit contains hashes and safe IDs, not buyer email, rights, credentials or provider errors",async()=>{const f=await fixture();try{await f.reserve();await f.invoice.execute(ids.case);
 const payload=JSON.stringify(f.db.prepare("SELECT payload_json FROM audit_events WHERE aggregate_type='invoice_creation'").all());
 for(const x of ["buyer@example.test","recipientEmail","rightsSummary","access_token","client_secret","PRIVATE_"])assert.ok(!payload.includes(x));noMoney(f);}finally{f.close();}});
const config={APP_MODE:"sandbox",PAYPAL_MODE:"paypal_sandbox",PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
 PAYPAL_SANDBOX_CLIENT_ID:"sandbox_client_id_123",PAYPAL_SANDBOX_CLIENT_SECRET:"sandbox_client_secret_456",RIGHTS_INVOICE_CREATION_ENABLED:"true"};
const merchant={name:"Demo Creator",email:"merchant@example.test"};
for(const changes of [{RIGHTS_INVOICE_CREATION_ENABLED:undefined},{RIGHTS_INVOICE_CREATION_ENABLED:"false"},{APP_MODE:"local"},{PAYPAL_MODE:"fake"},{DB:undefined}]){
 test(`server creation gate disabled ${JSON.stringify(changes)}`,async()=>{const f=await fixture();try{const s=await createSandboxInvoiceCreation({...config,DB:f.adapter,...changes},
 {authorizeCreator:f.authorize,transport:{sandboxDraftTransportEnabled:true,merchant,fetch:async()=>{throw Error("must not call");}}});assert.equal(s,null);noMoney(f);}finally{f.close();}});
}
for(const shape of ["id","minimal","links"]){test(`actual OAuth/draft adapter binds ${shape} response under the durable operation`,async()=>{
 const f=await fixture();const calls=[];try{const service=await createSandboxInvoiceCreation({...config,DB:f.adapter},{authorizeCreator:f.authorize,now:f.now,
 transport:{sandboxDraftTransportEnabled:true,merchant,now:()=>f.now().getTime(),fetch:async(url,init)=>{calls.push({url,init});
 if(url.endsWith("/token"))return Response.json({access_token:"test_bearer",expires_in:3600,token_type:"Bearer"});
 const link={href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${INVOICE}`,rel:"self",method:"GET"};
 return Response.json(shape==="minimal"?link:shape==="links"?{links:[link]}:{id:INVOICE,status:"DRAFT"},{status:201});}}});
 await service.reserve(ids.case,f.case().row_version);assert.equal((await service.execute(ids.case)).outcome,"draft_bound");
 assert.equal(calls.length,2);const post=calls[1].init;assert.ok(post.headers["PayPal-Request-Id"].length<=38);
 assert.equal(post.headers.Prefer,"return=representation");assert.equal(JSON.parse(post.body).items[0].unit_amount.value,"425.00");
 await service.execute(ids.case);assert.equal(calls.length,2);noMoney(f);
 }finally{f.close();}
});}
test("a draft candidate survives process restart and binds without another create call",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"rr032-candidate-")),file=join(dir,"db.sqlite");let f=await fixture({file});
 try{await f.reserve();const store={...f.store,bind:async()=>{throw Error("offline");}};
 const s=createInvoiceCreationService({store,accountFingerprint:ACCOUNT,authorizeCreator:f.authorize,now:f.now,createDraft:async r=>draft(r)});
 assert.equal((await s.execute(ids.case)).outcome,"retry_pending");assert.equal(f.op().provider_reference,INVOICE);
 f.close();f=await fixture({file,initialize:false});assert.equal((await f.invoice.execute(ids.case)).outcome,"draft_bound");assert.equal(f.calls.length,0);noMoney(f);
 }finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test("lost candidate-save acknowledgement is resolved without another POST",async()=>{const f=await fixture();try{await f.reserve();
 f.setProvider(async r=>{f.faults.loseAck=true;return draft(r);});assert.equal((await f.invoice.execute(ids.case)).outcome,"draft_bound");
 assert.equal(f.calls.length,1);assert.equal(f.op().status,"succeeded");assert.equal(f.count("audit_events"),6);noMoney(f);}finally{f.close();}});
test("lost final-bind acknowledgement reloads the completed binding once",async()=>{const f=await fixture();try{await f.reserve();
 const store={...f.store,bind:async(...args)=>{f.faults.loseAck=true;return f.store.bind(...args);}};
 const s=createInvoiceCreationService({store,accountFingerprint:ACCOUNT,authorizeCreator:f.authorize,now:f.now,createDraft:async r=>{f.calls.push(r);return draft(r);}});
 assert.equal((await s.execute(ids.case)).outcome,"already_bound");assert.equal(f.calls.length,1);assert.equal(f.count("audit_events"),6);noMoney(f);
 }finally{f.close();}});
test("a provider ID already bound to another case cannot be reassigned",async()=>{const f=await fixture();try{
 const other=crypto.randomUUID(),b=crypto.randomUUID(),c=f.case();insert(f.db,"licensing_cases",{case_id:other,workspace_id:ids.workspace,asset_id:ids.asset,created_at:NOW,updated_at:NOW});
 insert(f.db,"invoice_bindings",{invoice_binding_id:b,case_id:other,terms_version_id:c.latest_terms_version_id,quote_id:c.latest_quote_id,
 buyer_acceptance_id:c.latest_buyer_acceptance_id,provider:"paypal",environment:"sandbox",provider_invoice_id:INVOICE,invoice_status:"draft",created_at:NOW,updated_at:NOW});
 await f.reserve();assert.equal((await f.invoice.execute(ids.case)).outcome,"retry_pending");assert.equal(f.binding().provider_invoice_id,null);
 assert.equal(f.op().provider_reference,INVOICE);await f.make().execute(ids.case);assert.equal(f.calls.length,1);noMoney(f);
 }finally{f.close();}});
for(let n=0;n<5;n++)test(`new public-reference reservation rolls back every write ${n+1}`,async()=>{const f=await fixture();try{
 f.db.exec("UPDATE licensing_cases SET verification_record_id=NULL; DELETE FROM verification_records");f.faults.at=n;await assert.rejects(f.reserve());
 assert.equal(f.count("verification_records"),0);assert.equal(f.count("payment_operations"),0);assert.equal(f.count("invoice_bindings"),0);
 assert.equal(f.case().verification_record_id,null);noMoney(f);}finally{f.close();}});
test("ordinary consent preparation still refuses an already reserved case",async()=>{const f=await fixture();try{await f.reserve();
 await rejects(f.service.prepareInvoice(ids.case),"decision_locked");await rejects(f.service.decideCreator(ids.case,await f.creatorCommand("rejected","No longer approved")),"decision_locked");noMoney(f);
 }finally{f.close();}});
test("unchanged accepted consent remains valid after its buyer link expires",async()=>{const f=await fixture();try{await f.reserve();
 f.setTime("2026-10-30T00:00:00.000Z");assert.equal((await f.invoice.execute(ids.case)).outcome,"draft_bound");assert.equal(f.calls.length,1);noMoney(f);
 }finally{f.close();}});
const badLinks=[
 {href:`https://api-m.paypal.com/v2/invoicing/invoices/${INVOICE}`,rel:"self",method:"GET"},
 {href:`https://api-m.sandbox.paypal.com.evil.test/v2/invoicing/invoices/${INVOICE}`,rel:"self",method:"GET"},
 {href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${INVOICE}?token=SECRET`,rel:"self",method:"GET"},
 {href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${INVOICE}/send`,rel:"self",method:"POST"},
 {href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${INVOICE}#x`,rel:"self",method:"GET"},
 {href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${INVOICE}%2Fsend`,rel:"self",method:"GET"},
 {id:"INV2-OTHER-REFERENCE",href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${INVOICE}`,rel:"self",method:"GET"},
 {href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${INVOICE}`,rel:"payer-view",method:"GET"},
];
for(const [n,body] of badLinks.entries())test(`minimal response rejects unsafe or contradictory link ${n+1}`,async()=>{const f=await fixture();let posts=0;try{
 const s=await createSandboxInvoiceCreation({...config,DB:f.adapter},{authorizeCreator:f.authorize,now:f.now,
 transport:{sandboxDraftTransportEnabled:true,merchant,fetch:async url=>{
 if(url.endsWith("/token"))return Response.json({access_token:"test_bearer",expires_in:3600,token_type:"Bearer"});posts++;return Response.json(body,{status:201});}}});
 await s.reserve(ids.case,f.case().row_version);assert.equal((await s.execute(ids.case)).outcome,"awaiting_reconciliation");await s.execute(ids.case);
 assert.equal(posts,1);assert.equal(f.op().provider_reference,null);assert.equal(f.binding().provider_invoice_id,null);noMoney(f);
 }finally{f.close();}});
test("an internal UUID cannot be reused as a public verification reference",async()=>{const f=await fixture();try{
 f.db.prepare("UPDATE verification_records SET public_verification_id=?").run(ids.case);await rejects(f.reserve(),"invoice_conflict");assert.equal(f.count("invoice_bindings"),0);noMoney(f);
 }finally{f.close();}});
test("final source guard rejects a consent change immediately before provider binding",async()=>{const f=await fixture();try{await f.reserve();
 const store={...f.store,bind:async(...args)=>{f.faults.beforeBatch=()=>f.db.exec("UPDATE licensing_cases SET latest_buyer_acceptance_id=NULL");return f.store.bind(...args);}};
 const s=createInvoiceCreationService({store,accountFingerprint:ACCOUNT,authorizeCreator:f.authorize,now:f.now,createDraft:async r=>draft(r)});
 await rejects(s.execute(ids.case),"source_invalid");assert.equal(f.op().provider_reference,INVOICE);assert.equal(f.op().status,"unknown");assert.equal(f.binding().provider_invoice_id,null);noMoney(f);
 }finally{f.close();}});
test("revocation immediately after dispatch claim prevents the provider invocation",async()=>{const f=await fixture();try{await f.reserve();
 const store={...f.store,claim:async(...args)=>{await f.store.claim(...args);f.setOwner(null);}};
 const s=createInvoiceCreationService({store,accountFingerprint:ACCOUNT,authorizeCreator:f.authorize,now:f.now,createDraft:async r=>{f.calls.push(r);return draft(r);}});
 await rejects(s.execute(ids.case),"not_authorized");assert.equal(f.calls.length,0);assert.equal(f.op().status,"unknown");noMoney(f);
 }finally{f.close();}});
test("a canonical binding changed to paid is not regressed by creation replay",async()=>{const f=await fixture();try{await f.reserve();await f.invoice.execute(ids.case);
 f.db.exec("UPDATE invoice_bindings SET invoice_status='paid',row_version=row_version+1");
 assert.equal((await f.make().execute(ids.case)).outcome,"already_bound");assert.equal(f.binding().invoice_status,"paid");assert.equal(f.calls.length,1);noMoney(f);
 }finally{f.close();}});
