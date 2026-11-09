import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVerifiedWebhookProcessor, processVerifiedWebhookBatch, reduceNotification,
  notificationStage, NOTICE } from "../packages/paypal/src/webhook-processing.ts";
import { createD1WebhookProcessingStore } from "../packages/paypal/src/webhook-processing-store.ts";
import { runPayPalWebhookProcessing } from "../apps/api/src/paypal-webhook-processing.ts";

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const BINDING = uuid(1), CASE = uuid(2), INVOICE = "INV2-RR025-TEST";
const time = "2026-10-27T12:00:00.000Z";
// Exact existing inbox/audit columns and constraints; other parent/side-effect
// tables are minimal test fixtures, not a claim of the full D1 application schema.
const schema = `
PRAGMA foreign_keys=ON;
CREATE TABLE licensing_cases (case_id TEXT PRIMARY KEY);
CREATE TABLE invoice_bindings (
 invoice_binding_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES licensing_cases(case_id),
 provider TEXT NOT NULL CHECK(provider='paypal'), environment TEXT NOT NULL CHECK(environment IN ('simulated','sandbox')),
 provider_invoice_id TEXT, invoice_status TEXT NOT NULL DEFAULT 'draft', row_version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(provider,environment,provider_invoice_id)
) STRICT;
CREATE TABLE webhook_inbox_events (
 webhook_inbox_event_id TEXT PRIMARY KEY CHECK(length(webhook_inbox_event_id)=36),
 provider TEXT NOT NULL CHECK(provider='paypal'), environment TEXT NOT NULL CHECK(environment='sandbox'),
 provider_event_id TEXT NOT NULL CHECK(length(provider_event_id) BETWEEN 1 AND 200), transmission_id TEXT,
 invoice_binding_id TEXT REFERENCES invoice_bindings(invoice_binding_id) ON UPDATE RESTRICT ON DELETE SET NULL,
 event_type TEXT NOT NULL CHECK(length(event_type) BETWEEN 1 AND 160),
 verification_status TEXT NOT NULL CHECK(verification_status IN ('verified','rejected')),
 processing_status TEXT NOT NULL CHECK(processing_status IN ('pending','processed','failed','duplicate')),
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 verified_headers_json TEXT NOT NULL CHECK(json_valid(verified_headers_json)),
 received_at TEXT NOT NULL CHECK(length(received_at)>=20), processed_at TEXT, processing_error_code TEXT,
 UNIQUE(provider,environment,provider_event_id)
) STRICT;
CREATE TABLE audit_events (
 audit_event_id TEXT PRIMARY KEY CHECK(length(audit_event_id)=36),
 case_id TEXT NOT NULL REFERENCES licensing_cases(case_id), aggregate_type TEXT NOT NULL,
 aggregate_id TEXT NOT NULL, aggregate_sequence INTEGER NOT NULL CHECK(aggregate_sequence>=1),
 event_type TEXT NOT NULL, actor_type TEXT NOT NULL CHECK(actor_type IN ('system','creator','buyer','paypal','clock')),
 actor_reference TEXT, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 correlation_id TEXT NOT NULL, idempotency_key TEXT, created_at TEXT NOT NULL,
 UNIQUE(case_id,aggregate_type,aggregate_id,aggregate_sequence)
) STRICT;
CREATE TABLE payment_evidence (id TEXT PRIMARY KEY);
CREATE TABLE permissions (id TEXT PRIMARY KEY);
CREATE TABLE receipt_revisions (id TEXT PRIMARY KEY);
`;
function fixture({file=":memory:",initialize=true,link=true}={}) {
 const db = new DatabaseSync(file);
 db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;");
 if (initialize) {
  db.exec(schema);
  for (const f of ["0004_verified_webhook_intake.sql","0005_webhook_processing.sql"])
   db.exec(readFileSync(new URL(`../migrations/${f}`,import.meta.url),"utf8"));
  db.prepare("INSERT INTO licensing_cases VALUES (?)").run(CASE);
 }
 const controls={failAt:-1,failOnce:false,loseAcknowledgement:false,beforeBatch:null};
 const adapter={
  prepare(sql){const stmt={sql,values:[],bind(...values){return {...this,values};},
   async first(){return db.prepare(this.sql).get(...this.values)??null;},
   async all(){return {success:true,results:db.prepare(this.sql).all(...this.values)};}};return stmt;},
  async batch(statements){
   if(controls.beforeBatch){const cb=controls.beforeBatch;controls.beforeBatch=null;cb();}
   db.exec("BEGIN IMMEDIATE");let rows;
   try{rows=statements.map((s,i)=>{if(controls.failAt===i){if(controls.failOnce)controls.failAt=-1;throw Error("SECRET_SQL_FAILURE");}
     const r=db.prepare(s.sql).run(...s.values);return {success:true,meta:{changes:Number(r.changes)}};});db.exec("COMMIT");}
   catch(e){db.exec("ROLLBACK");throw e;}
   if(controls.loseAcknowledgement){controls.loseAcknowledgement=false;throw Error("LOST_ACK");}
   return rows;
  },
 };
 const store=createD1WebhookProcessingStore(adapter);
 const processor=createVerifiedWebhookProcessor(store,()=>new Date(time));
 function bind(id=BINDING,invoice=INVOICE,environment="sandbox"){
  db.prepare("INSERT INTO invoice_bindings(invoice_binding_id,case_id,provider,environment,provider_invoice_id) VALUES (?,?,'paypal',?,?)")
   .run(id,CASE,environment,invoice);
 }
 if(initialize&&link)bind();
 function add(n,kind="CREATED",status="DRAFT",changes={}){
  const row={inboxId:uuid(100+n),eventId:`WH-${n}`,invoice:INVOICE,binding:null,kind,status,
   created:`2026-10-27T10:${String(n%60).padStart(2,"0")}:00.000Z`,verification:"verified",
   method:"paypal_postback_v1",processing:"pending",hash:"a".repeat(64),...changes};
  db.prepare(`INSERT INTO webhook_inbox_events(webhook_inbox_event_id,provider,environment,provider_event_id,
   transmission_id,invoice_binding_id,event_type,verification_status,processing_status,payload_sha256,
   verified_headers_json,received_at,provider_invoice_id,event_created_at,resource_status,verification_method)
   VALUES (?,'paypal','sandbox',?,'TRANS-TEST',?,?,?,?,?,'{}',?,?,?,?,?)`).run(
    row.inboxId,row.eventId,row.binding,`INVOICING.INVOICE.${row.kind}`,row.verification,row.processing,row.hash,
    time,row.invoice,row.created,row.status,row.method);
  return row.inboxId;
 }
 const count=table=>db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
 const totals=()=>Object.fromEntries(["paypal_webhook_processing_receipts","paypal_webhook_projections",
  "paypal_reconciliation_outbox","audit_events","payment_evidence","permissions","receipt_revisions"].map(t=>[t,count(t)]));
 const project=()=>db.prepare("SELECT * FROM paypal_webhook_projections WHERE invoice_binding_id=?").get(BINDING);
 return {db,adapter,store,processor,controls,add,bind,count,totals,project,close:()=>db.close()};
}
function noAuthority(f){
 for(const table of ["payment_evidence","permissions","receipt_revisions"])assert.equal(f.count(table),0);
 const b=f.db.prepare("SELECT invoice_status,row_version FROM invoice_bindings WHERE invoice_binding_id=?").get(BINDING);
 if(b){assert.equal(b.invoice_status,"draft");assert.equal(b.row_version,1);}
}
function permutations(a){if(a.length<=1)return [a];return a.flatMap((v,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[v,...p]));}

test("one verified event atomically writes a receipt, projection, outbox, audit and processed marker",async()=>{
 const f=fixture();try{const id=f.add(1);const r=await f.processor.process(id);assert.equal(r.outcome,"processed");
 assert.equal(r.permissionActivated,false);assert.equal(r.authoritativePaymentEvidence,false);
 assert.equal((await f.store.loadEvent(id)).processingStatus,"processed");
 for(const t of ["paypal_webhook_processing_receipts","paypal_webhook_projections","paypal_reconciliation_outbox","audit_events"])assert.equal(f.count(t),1);
 assert.equal(f.project().signal_mask,NOTICE.created);noAuthority(f);
 }finally{f.close();}
});
test("100 replay calls never duplicate audit, outbox generation or receipts",async()=>{
 const f=fixture();try{const id=f.add(1,"PAID","PAID");await f.processor.process(id);const first=f.totals();
 for(let i=0;i<100;i++)assert.equal((await f.processor.process(id)).outcome,"duplicate");
 assert.deepEqual(f.totals(),first);assert.equal(f.project().row_version,1);noAuthority(f);
 }finally{f.close();}
});
test("concurrent workers racing one event commit once",async()=>{
 const f=fixture();try{const id=f.add(1);const other=createVerifiedWebhookProcessor(createD1WebhookProcessingStore(f.adapter));
 const all=await Promise.all([f.processor.process(id),other.process(id),f.processor.process(id),other.process(id)]);
 assert.equal(all.filter(x=>x.outcome==="processed").length,1);assert.equal(all.filter(x=>x.outcome==="duplicate").length,3);
 assert.equal(f.count("audit_events"),1);assert.equal(f.project().row_version,1);
 }finally{f.close();}
});
test("different concurrent events retry stale projection CAS without losing either signal",async()=>{
 const f=fixture();try{const a=f.add(1,"PAID","PAID"),b=f.add(2,"REFUNDED","REFUNDED");
 const other=createVerifiedWebhookProcessor(createD1WebhookProcessingStore(f.adapter));
 const rows=await Promise.all([f.processor.process(a),other.process(b)]);
 assert.ok(rows.every(r=>r.outcome==="processed"));assert.equal(f.project().row_version,2);
 assert.equal(f.project().signal_mask,NOTICE.payment|NOTICE.refund);assert.equal(f.count("audit_events"),2);
 assert.equal(f.count("paypal_reconciliation_outbox"),1);noAuthority(f);
 }finally{f.close();}
});
test("all 120 arrival permutations of created/sent/paid/canceled/refunded converge",async()=>{
 let expected;
 for(const order of permutations([0,1,2,3,4])){
  const f=fixture();try{const kinds=["CREATED","SENT","PAID","CANCELLED","REFUNDED"],states=["DRAFT","UNPAID","PAID","CANCELLED","REFUNDED"];
   const ids=kinds.map((k,i)=>f.add(i+1,k,states[i]));
   for(const i of order)assert.equal((await f.processor.process(ids[i])).outcome,"processed");
   const p=f.project(),stable={mask:p.signal_mask,last:p.last_provider_event_id,time:p.last_event_created_at,status:p.last_resource_status,version:p.row_version};
   if(!expected)expected=stable;assert.deepEqual(stable,expected);
   assert.equal(notificationStage(p.signal_mask),"conflicting_notices");assert.equal(f.count("audit_events"),5);
   assert.equal(f.count("paypal_reconciliation_outbox"),1);noAuthority(f);
  }finally{f.close();}
 }
});
test("late older SENT and CREATED notices cannot erase a refund notification",async()=>{
 const f=fixture();try{const late=f.add(3,"REFUNDED","REFUNDED"),sent=f.add(2,"SENT","UNPAID"),created=f.add(1);
 for(const id of [late,sent,created])await f.processor.process(id);
 assert.equal(notificationStage(f.project().signal_mask),"refund_notified");assert.equal(f.project().last_provider_event_id,"WH-3");
 }finally{f.close();}
});
test("equal timestamps use event ID ordering, not arrival order",async()=>{
 const result=[];for(const reverse of [false,true]){const f=fixture();try{
  const ids=[f.add(1,"CREATED","DRAFT",{created:time,eventId:"WH-A"}),f.add(2,"SENT","UNPAID",{created:time,eventId:"WH-Z"})];
  for(const id of reverse?ids.reverse():ids)await f.processor.process(id);
  result.push([f.project().signal_mask,f.project().last_provider_event_id,f.project().last_resource_status]);
 }finally{f.close();}}assert.deepEqual(result[0],result[1]);assert.equal(result[0][1],"WH-Z");
});
for(const [status,kind] of [["PARTIALLY_PAID","PAID"],["PAYMENT_PENDING","PAID"],["MARKED_AS_PAID","PAID"],
 ["PARTIALLY_REFUNDED","REFUNDED"],["MARKED_AS_REFUNDED","REFUNDED"],["ALIEN_STATE","UPDATED"],[null,"PAID"]]){
 test(`${status} queues review without claiming settled payment`,async()=>{const f=fixture();try{
  assert.equal((await f.processor.process(f.add(1,kind,status))).outcome,"processed");
  assert.ok(f.project().signal_mask&NOTICE.uncertain);noAuthority(f);
 }finally{f.close();}});
}
test("authenticated PAID with cancellation status is a conflict, never permission",async()=>{
 const f=fixture();try{await f.processor.process(f.add(1,"PAID","CANCELLED"));assert.equal(notificationStage(f.project().signal_mask),"conflicting_notices");noAuthority(f);}finally{f.close();}
});
test("missing invoice binding stays pending and processes after safe late association",async()=>{
 const f=fixture({link:false});try{const id=f.add(1);assert.equal((await f.processor.process(id)).outcome,"awaiting_binding");
 assert.equal(f.count("audit_events"),0);assert.equal((await f.store.loadEvent(id)).processingStatus,"pending");
 f.bind();assert.equal((await f.processor.process(id)).outcome,"processed");assert.equal((await f.store.loadEvent(id)).invoiceBindingId,BINDING);
 }finally{f.close();}
});
test("unmatched events do not starve a bounded batch of associated events",async()=>{
 const f=fixture();try{for(let i=1;i<=30;i++)f.add(i,"CREATED","DRAFT",{invoice:`INV2-MISSING-${i}`});
 const id=f.add(31);const r=await processVerifiedWebhookBatch(f.store,1);
 assert.equal(r.examined,1);assert.equal((await f.store.loadEvent(id)).processingStatus,"processed");assert.equal(f.count("audit_events"),1);
 }finally{f.close();}
});
test("a forged association to another binding fails without writes",async()=>{
 const f=fixture();try{f.bind(uuid(3),"INV2-OTHER-TEST");const id=f.add(1,"CREATED","DRAFT",{binding:uuid(3)});
 assert.equal((await f.processor.process(id)).outcome,"binding_mismatch");assert.equal(f.count("audit_events"),0);
 }finally{f.close();}
});
for(const [label,change] of [["rejected signature",{verification:"rejected"}], ["missing verification method",{method:null}]]){
 test(`${label} never processes`,async()=>{const f=fixture();try{const id=f.add(1,"PAID","PAID",change);
 assert.equal((await f.processor.process(id)).outcome,"rejected_unverified");assert.equal(f.count("audit_events"),0);noAuthority(f);
 }finally{f.close();}});
}
for(const [label,change] of [["unknown event",{kind:"UNKNOWN"}],["missing invoice",{invoice:null}],
 ["nonhex hash",{hash:"z".repeat(64)}],["malformed creation date",{created:"2026-02-30T10:00:00Z"}],
 ["timezone-ambiguous date",{created:"2026-10-27T10:00:00"}],["unsafe event ID",{eventId:"EVT<paid>"}]]){
 test(`${label} remains untouched`,async()=>{const f=fixture();try{const id=f.add(1,"PAID","PAID",change);
 assert.equal((await f.processor.process(id)).outcome,"invalid_event");assert.equal(f.count("audit_events"),0);
 }finally{f.close();}});
}
test("simulated environment binding cannot consume a genuine Sandbox event",async()=>{
 const f=fixture({link:false});try{f.bind(BINDING,INVOICE,"simulated");const id=f.add(1);
 assert.equal((await f.processor.process(id)).outcome,"awaiting_binding");assert.equal(f.count("audit_events"),0);
 }finally{f.close();}
});
test("processed legacy row without processing receipt is not trusted as a duplicate",async()=>{
 const f=fixture();try{const id=f.add(1,"CREATED","DRAFT",{processing:"processed"});
 assert.equal((await f.processor.process(id)).outcome,"inconsistent_history");assert.equal(f.count("audit_events"),0);
 }finally{f.close();}
});
test("previously failed verified row can be retried once safely",async()=>{
 const f=fixture();try{const id=f.add(1,"PAID","PAID",{processing:"failed"});
 assert.equal((await f.processor.process(id)).outcome,"processed");assert.equal((await f.processor.process(id)).outcome,"duplicate");
 }finally{f.close();}
});
for(let failAt=0;failAt<5;failAt++)test(`failure at transaction statement ${failAt+1} rolls back all effects`,async()=>{
 const f=fixture();try{const id=f.add(1);f.controls.failAt=failAt;
 assert.equal((await f.processor.process(id)).outcome,"retry_pending");
 assert.ok(Object.values(f.totals()).every(n=>n===0));assert.equal((await f.store.loadEvent(id)).processingStatus,"pending");
 f.controls.failAt=-1;assert.equal((await f.processor.process(id)).outcome,"processed");assert.equal(f.count("audit_events"),1);
 }finally{f.close();}
});
test("transient commit failure retries without duplicating an effect",async()=>{
 const f=fixture();try{const id=f.add(1);f.controls.failAt=3;f.controls.failOnce=true;
 assert.equal((await f.processor.process(id)).outcome,"processed");assert.equal(f.count("audit_events"),1);
 }finally{f.close();}
});
test("lost commit acknowledgement is recognized on reload as one durable completion",async()=>{
 const f=fixture();try{const id=f.add(1);f.controls.loseAcknowledgement=true;
 assert.equal((await f.processor.process(id)).outcome,"duplicate");assert.equal(f.count("audit_events"),1);assert.equal(f.project().row_version,1);
 }finally{f.close();}
});
test("binding CAS rechecks row revision at transaction time",async()=>{
 const f=fixture();try{const id=f.add(1);f.controls.beforeBatch=()=>f.db.prepare("UPDATE invoice_bindings SET row_version=2 WHERE invoice_binding_id=?").run(BINDING);
 assert.equal((await f.processor.process(id)).outcome,"processed");assert.equal(f.count("audit_events"),1);assert.equal(f.project().row_version,1);
 }finally{f.close();}
});
test("delete the association before commit and no event gets marked processed",async()=>{
 const f=fixture();try{const id=f.add(1);f.controls.beforeBatch=()=>f.db.prepare("DELETE FROM invoice_bindings WHERE invoice_binding_id=?").run(BINDING);
 assert.equal((await f.processor.process(id)).outcome,"awaiting_binding");assert.equal(f.count("audit_events"),0);
 assert.equal((await f.store.loadEvent(id)).processingStatus,"pending");
 }finally{f.close();}
});
test("file-backed restart retains processing receipts and suppresses replay",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"rr025-"));const file=join(dir,"state.sqlite");let f=fixture({file});
 try{const id=f.add(1,"PAID","PAID");await f.processor.process(id);f.close();f=fixture({file,initialize:false});
 assert.equal((await f.processor.process(id)).outcome,"duplicate");assert.equal(f.count("audit_events"),1);
 assert.equal(f.project().row_version,1);noAuthority(f);
 }finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test("processed inbox marker, receipt and accumulated facts cannot be overwritten",async()=>{
 const f=fixture();try{const id=f.add(1,"PAID","PAID");await f.processor.process(id);
 assert.throws(()=>f.db.prepare("UPDATE webhook_inbox_events SET processing_status='pending' WHERE webhook_inbox_event_id=?").run(id),/cannot reopen/);
 assert.throws(()=>f.db.exec("UPDATE paypal_webhook_processing_receipts SET outcome='queued_reconciliation'"),/immutable/);
 assert.throws(()=>f.db.exec("UPDATE paypal_webhook_projections SET signal_mask=1,row_version=2"),/cannot regress/);
 assert.throws(()=>f.db.exec("UPDATE paypal_reconciliation_outbox SET requested_generation=0"),/cannot regress|CHECK/);
 }finally{f.close();}
});
test("new notification generation does not erase a completed earlier generation",async()=>{
 const f=fixture();try{await f.processor.process(f.add(1));f.db.exec("UPDATE paypal_reconciliation_outbox SET completed_generation=1");
 await f.processor.process(f.add(2,"SENT","UNPAID"));const q=f.db.prepare("SELECT * FROM paypal_reconciliation_outbox").get();
 assert.equal(q.requested_generation,2);assert.equal(q.completed_generation,1);assert.equal(f.count("paypal_reconciliation_outbox"),1);
 }finally{f.close();}
});
test("reset order clears new child records without orphaning references",async()=>{
 const f=fixture();try{await f.processor.process(f.add(1));f.db.exec("DELETE FROM webhook_inbox_events; DELETE FROM invoice_bindings; DELETE FROM audit_events; DELETE FROM licensing_cases;");
 assert.ok(Object.values(f.totals()).every(n=>n===0));assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length,0);
 }finally{f.close();}
});
test("processing diagnostics and audit omit source text, email, signatures and secrets",async()=>{
 const f=fixture();try{const id=f.add(1);const r=await f.processor.process(id);const audit=f.db.prepare("SELECT payload_json FROM audit_events").get();
 const text=JSON.stringify({r,audit});for(const forbidden of ["buyer@example","signature","access_token","Authorization","raw_body","SECRET_SQL_FAILURE"])assert.ok(!text.includes(forbidden));
 f.controls.failAt=0;assert.ok(!JSON.stringify(await f.processor.process(f.add(2))).includes("SECRET"));
 }finally{f.close();}
});
test("pure reducer rejects a mismatched or corrupted previous projection",async()=>{
 const f=fixture();try{const id=f.add(1);const e=await f.store.loadEvent(id),b=await f.store.findBinding(INVOICE);const p=reduceNotification(null,e,b);
 assert.throws(()=>reduceNotification({...p,signalMask:-1},e,b));assert.throws(()=>reduceNotification({...p,bindingId:uuid(9)},e,b));
 assert.throws(()=>reduceNotification({...p,rowVersion:Number.MAX_SAFE_INTEGER},e,b));
 }finally{f.close();}
});
test("not-found and malformed IDs cannot create work",async()=>{
 const f=fixture();try{assert.equal((await f.processor.process(uuid(900))).outcome,"not_found");assert.equal((await f.processor.process("raw text")).outcome,"invalid_event");assert.equal(f.count("audit_events"),0);}finally{f.close();}
});
test("batch and feature opt-in are bounded and disabled by default",async()=>{
 const f=fixture();try{for(const n of [0,101,1.5,NaN])await assert.rejects(processVerifiedWebhookBatch(f.store,n));
 const bindings={APP_MODE:"sandbox",PAYPAL_MODE:"paypal_sandbox",DB:f.adapter,PAYPAL_WEBHOOK_PROCESSING_ENABLED:"true"};
 for(const change of [{PAYPAL_WEBHOOK_PROCESSING_ENABLED:undefined},{APP_MODE:"local"},{PAYPAL_MODE:"fake"},{DB:undefined}]){
  const r=await runPayPalWebhookProcessing({...bindings,...change});assert.equal(r.enabled,false);assert.equal(r.examined,0);
 }
 f.add(1);const r=await runPayPalWebhookProcessing(bindings);assert.equal(r.enabled,true);assert.equal(r.examined,1);noAuthority(f);
 }finally{f.close();}
});
test("processing never calls global fetch",async()=>{
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error("UNEXPECTED NETWORK");};const f=fixture();
 try{assert.equal((await f.processor.process(f.add(1,"PAID","PAID"))).outcome,"processed");noAuthority(f);}finally{f.close();globalThis.fetch=previous;}
});
