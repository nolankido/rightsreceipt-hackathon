import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSandboxReconciler,runReconciliationBatch,queueStaleInvoices,RECONCILIATION_LEASE_MS} from '../packages/paypal/src/reconciliation.ts';
import {createD1ReconciliationStore,inspectReconciliation} from '../packages/paypal/src/reconciliation-store.ts';
import {runPayPalReconciliation} from '../apps/api/src/paypal-reconciliation.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const B=id(1),C=id(2),T=id(3),Q=id(4),D=id(5),A=id(6),INV='INV2-RECONCILE-TEST';
const TIME='2026-10-27T12:00:00.000Z';
// Focused parent fixture with real column names and the original outbox checks.
// This is not a substitute for a full migration/seed or live D1 execution.
const DDL=`PRAGMA foreign_keys=ON;
CREATE TABLE licensing_cases(case_id TEXT PRIMARY KEY,case_outcome TEXT,invoice_binding_id TEXT,
 latest_terms_version_id TEXT,latest_quote_id TEXT,latest_buyer_acceptance_id TEXT,latest_creator_decision_id TEXT,row_version INTEGER);
CREATE TABLE terms_versions(terms_version_id TEXT PRIMARY KEY,case_id TEXT,resolution_status TEXT,source_kind TEXT,created_by_actor TEXT);
CREATE TABLE quotes(quote_id TEXT PRIMARY KEY,case_id TEXT,terms_version_id TEXT,status TEXT,amount_cents INTEGER,currency TEXT);
CREATE TABLE creator_decisions(creator_decision_id TEXT PRIMARY KEY,case_id TEXT,terms_version_id TEXT,quote_id TEXT,decision TEXT);
CREATE TABLE buyer_acceptances(buyer_acceptance_id TEXT PRIMARY KEY,case_id TEXT,terms_version_id TEXT,quote_id TEXT,creator_decision_id TEXT,acceptance_copy_version TEXT,accepted_at TEXT);
CREATE TABLE invoice_bindings(invoice_binding_id TEXT PRIMARY KEY,case_id TEXT NOT NULL,terms_version_id TEXT NOT NULL,quote_id TEXT NOT NULL,buyer_acceptance_id TEXT NOT NULL,
 provider TEXT NOT NULL,environment TEXT NOT NULL,provider_invoice_id TEXT,invoice_status TEXT NOT NULL,created_at TEXT,sent_at TEXT,updated_at TEXT NOT NULL,row_version INTEGER NOT NULL);
CREATE TABLE paypal_reconciliation_outbox(invoice_binding_id TEXT PRIMARY KEY REFERENCES invoice_bindings(invoice_binding_id) ON DELETE CASCADE,
 requested_generation INTEGER NOT NULL CHECK(requested_generation>=1),completed_generation INTEGER NOT NULL DEFAULT 0 CHECK(completed_generation>=0 AND completed_generation<=requested_generation),updated_at TEXT NOT NULL) STRICT;
CREATE TRIGGER webhook_outbox_monotonic BEFORE UPDATE ON paypal_reconciliation_outbox
WHEN NEW.invoice_binding_id IS NOT OLD.invoice_binding_id OR NEW.requested_generation<OLD.requested_generation OR NEW.completed_generation<OLD.completed_generation
BEGIN SELECT RAISE(ABORT,'reconciliation generation cannot regress'); END;
CREATE TABLE audit_events(audit_event_id TEXT PRIMARY KEY,case_id TEXT,aggregate_type TEXT,aggregate_id TEXT,aggregate_sequence INTEGER,event_type TEXT,actor_type TEXT,actor_reference TEXT,payload_json TEXT CHECK(json_valid(payload_json)),correlation_id TEXT,idempotency_key TEXT,created_at TEXT,UNIQUE(aggregate_type,aggregate_id,aggregate_sequence));
CREATE TABLE payment_evidence(id TEXT PRIMARY KEY);
CREATE TABLE permissions(id TEXT PRIMARY KEY);
CREATE TABLE receipt_revisions(id TEXT PRIMARY KEY);`;
function fixture({file=':memory:',initialize=true}={}){
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
 if(initialize){db.exec(DDL);db.exec(readFileSync(new URL('../migrations/0006_paypal_reconciliation.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO licensing_cases VALUES (?,?,?,?,?,?,?,1)').run(C,'open',B,T,Q,A,D);
 db.prepare('INSERT INTO terms_versions VALUES (?,?,?,?,?)').run(T,C,'complete','human_corrected','creator');
 db.prepare('INSERT INTO quotes VALUES (?,?,?,?,?,?)').run(Q,C,T,'current',42500,'USD');
 db.prepare('INSERT INTO creator_decisions VALUES (?,?,?,?,?)').run(D,C,T,Q,'approved');
 db.prepare('INSERT INTO buyer_acceptances VALUES (?,?,?,?,?,?,?)').run(A,C,T,Q,D,'accept-v1',TIME);
 db.prepare('INSERT INTO invoice_bindings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(B,C,T,Q,A,'paypal','sandbox',INV,'draft','2026-10-26T00:00:00.000Z',null,'2026-10-26T00:00:00.000Z',1);}
 const control={time:Date.parse(TIME),failAt:-1,lostAck:false,beforeBatch:null,calls:0,read:null};
 const now=()=>new Date(control.time),stamp=()=>now().toISOString();
 const adapter={prepare(sql){return {sql,values:[],bind(...values){return {...this,values};},async first(){return db.prepare(this.sql).get(...this.values)??null;},async all(){return {success:true,results:db.prepare(this.sql).all(...this.values)};},async run(){return {success:true,meta:{changes:Number(db.prepare(this.sql).run(...this.values).changes)}};}};},
 async batch(statements){if(control.beforeBatch){const cb=control.beforeBatch;control.beforeBatch=null;cb();}
 db.exec('BEGIN IMMEDIATE');let out;try{out=statements.map((s,i)=>{if(i===control.failAt)throw Error('PRIVATE_SQL_FAILURE');return {success:true,meta:{changes:Number(db.prepare(s.sql).run(...s.values).changes)}};});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 if(control.lostAck){control.lostAck=false;throw Error('PRIVATE_LOST_ACK');}return out;}};
 const store=createD1ReconciliationStore(adapter);
 const view=(status='UNPAID',delta={})=>({invoiceId:INV,caseId:C,quoteId:Q,termsVersionId:T,buyerAcceptanceId:A,amountCents:42500,currency:'USD',status,mode:'paypal_sandbox',provider:'paypal',environment:'sandbox',simulated:false,authoritativePaymentEvidence:false,observedAt:stamp(),paymentUrl:status==='UNPAID'?'https://www.sandbox.paypal.com/invoice/p/TEST':null,requiresReconciliation:false,...delta});
 const readInvoice=async invoice=>{assert.equal(invoice,INV);control.calls++;return control.read?control.read():view();};
 const dependencies={store,readInvoice,now,random:()=>0};const worker=createSandboxReconciler(dependencies);
 return {db,control,adapter,store,view,dependencies,worker,now,stamp,advance:ms=>{control.time+=ms;},queue:()=>store.request(B,'operator_retry',stamp()),
 row:()=>db.prepare('SELECT * FROM paypal_reconciliation_outbox').get(),binding:()=>db.prepare('SELECT * FROM invoice_bindings WHERE invoice_binding_id=?').get(B),
 count:table=>db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,close:()=>db.close()};
}
const protectedEmpty=f=>{for(const t of ['payment_evidence','permissions','receipt_revisions'])assert.equal(f.count(t),0);};
async function withFixture(run){const f=fixture();try{await run(f);}finally{f.close();}}

test('missed webhook queues one fresh read and converges draft to sent with safe link',()=>withFixture(async f=>{
 await queueStaleInvoices(f.store,f.stamp(),'2026-10-27T11:00:00.000Z');
 const r=await f.worker.reconcile(B);assert.equal(r.outcome,'reconciled');assert.equal(f.binding().invoice_status,'sent');
 assert.equal(f.row().completed_generation,1);assert.equal(f.count('paypal_reconciliation_receipts'),1);assert.equal(f.count('audit_events'),1);
 assert.equal(f.db.prepare('SELECT safe_payment_url FROM paypal_reconciliation_receipts').get().safe_payment_url,'https://www.sandbox.paypal.com/invoice/p/TEST');protectedEmpty(f);
}));
test('repeated completed requests do not repeat provider calls or writes',()=>withFixture(async f=>{
 await f.queue();await f.worker.reconcile(B);for(let i=0;i<30;i++)assert.equal((await f.worker.reconcile(B)).outcome,'not_ready');
 assert.equal(f.control.calls,1);assert.equal(f.count('audit_events'),1);
}));
test('coalescing repeated enqueue requests does not manufacture generations',()=>withFixture(async f=>{
 for(let i=0;i<10;i++)await f.queue();assert.equal(f.row().requested_generation,1);await f.worker.reconcile(B);
 await f.queue();assert.equal(f.row().requested_generation,2);
}));
for(const [status,state,review] of [['DRAFT','draft',false],['SENT','sent',false],['SHARED','sent',false],['CANCELLED','canceled',false],['AUTO_CANCELLED','canceled',false],
 ['PAID','reconciliation_required',true],['REFUNDED','reconciliation_required',true],['PARTIALLY_PAID','reconciliation_required',true],['PARTIALLY_REFUNDED','reconciliation_required',true],
 ['MARKED_AS_PAID','reconciliation_required',true],['MARKED_AS_REFUNDED','reconciliation_required',true],['PAID_EXTERNAL','reconciliation_required',true],['REFUNDED_EXTERNAL','reconciliation_required',true],
 ['PAYMENT_PENDING','reconciliation_required',true],['SCHEDULED','reconciliation_required',true],['UNKNOWN','reconciliation_required',true]]){
 test(`${status} has explicit invoice handling and never activates permission`,()=>withFixture(async f=>{
  await f.queue();f.control.read=()=>f.view(status);const r=await f.worker.reconcile(B);
  assert.equal(r.outcome,review?'review_required':'reconciled');assert.equal(f.binding().invoice_status,state);protectedEmpty(f);
 }));
}
for(const old of ['paid','fully_refunded','canceled'])test(`provider read cannot regress terminal ${old}`,()=>withFixture(async f=>{
 f.db.prepare('UPDATE invoice_bindings SET invoice_status=?').run(old);await f.queue();
 assert.equal((await f.worker.reconcile(B)).outcome,'review_required');assert.equal(f.binding().invoice_status,old);protectedEmpty(f);
}));
test('stale DRAFT cannot erase sent history or trigger a resend',()=>withFixture(async f=>{
 f.db.exec("UPDATE invoice_bindings SET invoice_status='sent'");f.control.read=()=>f.view('DRAFT');await f.queue();
 assert.equal((await f.worker.reconcile(B)).outcome,'review_required');assert.equal(f.binding().invoice_status,'sent');assert.equal(f.control.calls,1);
}));
for(const delta of [{invoiceId:'INV2-OTHER-TEST'},{caseId:id(20)},{quoteId:id(20)},{termsVersionId:id(20)},{buyerAcceptanceId:id(20)},
 {amountCents:42501},{currency:'EUR'},{simulated:true},{environment:'simulated'},{provider:'fake'},{mode:'fake'},{authoritativePaymentEvidence:true}]){
 test(`rejects provider binding mismatch ${Object.keys(delta)[0]}`,()=>withFixture(async f=>{
  await f.queue();f.control.read=()=>f.view('UNPAID',delta);const r=await f.worker.reconcile(B);assert.equal(r.outcome,'blocked');
  assert.equal(r.code,'invoice_mismatch');assert.equal(f.count('audit_events'),0);assert.equal(f.binding().invoice_status,'draft');protectedEmpty(f);
 }));
}
for(const delta of [{observedAt:'2026-10-27T11:59:59.999Z'},{observedAt:'2026-10-27T12:00:01.000Z'},
 {status:'NEW_VENDOR_STATUS'},{requiresReconciliation:'false'},{paymentUrl:'https://www.paypal.com/invoice/p/BAD'},
 {paymentUrl:'https://www.sandbox.paypal.com.evil.test/invoice/p/BAD'},{paymentUrl:'https://www.sandbox.paypal.com/invoice/p/BAD?redirect=evil'}]){
 test(`malformed or unsafe provider read ${JSON.stringify(delta)}`,()=>withFixture(async f=>{
  await f.queue();f.control.read=()=>f.view('UNPAID',delta);assert.equal((await f.worker.reconcile(B)).outcome,'blocked');assert.equal(f.count('audit_events'),0);
 }));
}
for(const sql of ["UPDATE creator_decisions SET decision='rejected'","UPDATE buyer_acceptances SET terms_version_id='other'",
 "UPDATE licensing_cases SET latest_quote_id='other'","UPDATE licensing_cases SET case_outcome='canceled'",
 "UPDATE terms_versions SET source_kind='extracted'","UPDATE quotes SET status='superseded'","UPDATE licensing_cases SET latest_creator_decision_id='other'"]){
 test(`current consent checked before I/O: ${sql}`,()=>withFixture(async f=>{
  f.db.exec(sql);await f.queue();assert.equal((await f.worker.reconcile(B)).outcome,'blocked');assert.equal(f.control.calls,0);assert.equal(f.count('audit_events'),0);
 }));
}
test('consent revoked during read rolls back every consequential write',()=>withFixture(async f=>{
 await f.queue();f.control.read=()=>{f.db.exec("UPDATE creator_decisions SET decision='rejected'");return f.view();};
 const r=await f.worker.reconcile(B);assert.equal(r.outcome,'retry_scheduled');assert.equal(r.code,'state_changed');
 assert.equal(f.count('paypal_reconciliation_receipts'),0);assert.equal(f.count('audit_events'),0);assert.equal(f.binding().invoice_status,'draft');assert.equal(f.row().completed_generation,0);
}));
test('case revision changes during provider read reject stale result',()=>withFixture(async f=>{
 await f.queue();f.control.read=()=>{f.db.exec('UPDATE licensing_cases SET row_version=row_version+1');return f.view();};
 assert.equal((await f.worker.reconcile(B)).code,'state_changed');assert.equal(f.count('audit_events'),0);
}));
test('binding revision changes at commit fence reject stale result',()=>withFixture(async f=>{
 await f.queue();f.control.beforeBatch=()=>f.db.exec('UPDATE invoice_bindings SET row_version=row_version+1');
 assert.equal((await f.worker.reconcile(B)).code,'state_changed');assert.equal(f.count('audit_events'),0);
}));
test('new notification during read remains pending after captured generation completes',()=>withFixture(async f=>{
 await f.queue();f.control.read=()=>{f.db.exec('UPDATE paypal_reconciliation_outbox SET requested_generation=requested_generation+1');return f.view();};
 await f.worker.reconcile(B);assert.equal(f.row().requested_generation,2);assert.equal(f.row().completed_generation,1);
 f.control.read=null;await f.worker.reconcile(B);assert.equal(f.row().completed_generation,2);assert.equal(f.count('audit_events'),2);
}));
test('concurrent workers perform only one provider read',()=>withFixture(async f=>{
 await f.queue();let release;const wait=new Promise(r=>{release=r;});f.control.read=async()=>{await wait;return f.view();};
 const a=f.worker.reconcile(B);await new Promise(r=>setImmediate(r));const b=await f.worker.reconcile(B);assert.equal(b.outcome,'not_ready');
 release();assert.equal((await a).outcome,'reconciled');assert.equal(f.control.calls,1);
}));
test('expired worker cannot overwrite a newer owner result',()=>withFixture(async f=>{
 await f.queue();let release;const wait=new Promise(r=>{release=r;});f.control.read=async()=>{const captured=f.view();await wait;return captured;};
 const a=f.worker.reconcile(B);await new Promise(r=>setImmediate(r));f.advance(RECONCILIATION_LEASE_MS+1);f.control.read=null;
 assert.equal((await f.worker.reconcile(B)).outcome,'reconciled');release();assert.equal((await a).outcome,'lease_lost');
 assert.equal(f.count('audit_events'),1);assert.equal(f.binding().invoice_status,'sent');
}));
for(let step=0;step<4;step++)test(`transaction failure at statement ${step+1} leaves no partial effects`,()=>withFixture(async f=>{
 await f.queue();f.control.failAt=step;assert.equal((await f.worker.reconcile(B)).outcome,'retry_scheduled');
 assert.equal(f.count('paypal_reconciliation_receipts'),0);assert.equal(f.count('audit_events'),0);assert.equal(f.row().completed_generation,0);assert.equal(f.binding().invoice_status,'draft');
 f.control.failAt=-1;f.advance(30000);assert.equal((await f.worker.reconcile(B)).outcome,'reconciled');
}));
test('lost acknowledgement discovers already committed generation',()=>withFixture(async f=>{
 await f.queue();f.control.lostAck=true;assert.equal((await f.worker.reconcile(B)).outcome,'already_completed');
 assert.equal(f.count('audit_events'),1);assert.equal(f.row().completed_generation,1);
}));
test('rate limit persists a retry, no immediate request loop',()=>withFixture(async f=>{
 await f.queue();f.control.read=()=>{throw {code:'rate_limited',message:'SECRET_ACCESS_TOKEN'};};
 const r=await f.worker.reconcile(B);assert.equal(r.outcome,'retry_scheduled');assert.equal(f.row().next_attempt_at,'2026-10-27T12:01:00.000Z');
 assert.equal((await f.worker.reconcile(B)).outcome,'not_ready');assert.equal(f.control.calls,1);assert.equal(f.row().completed_generation,0);
 f.advance(60000);f.control.read=null;assert.equal((await f.worker.reconcile(B)).outcome,'reconciled');
}));
test('bounded exponential retries stop, explicit operator retry can recover',()=>withFixture(async f=>{
 await f.queue();f.control.read=()=>{throw new Error('PRIVATE_TIMEOUT');};
 for(let n=1;n<=5;n++){const r=await f.worker.reconcile(B);assert.equal(r.outcome,n===5?'blocked':'retry_scheduled');
  if(n<5){assert.equal(Date.parse(f.row().next_attempt_at)-f.control.time,30000*2**(n-1));f.control.time=Date.parse(f.row().next_attempt_at);}}
 assert.equal(f.control.calls,5);assert.equal((await f.worker.reconcile(B)).outcome,'not_ready');
 await f.queue();f.control.read=null;assert.equal((await f.worker.reconcile(B)).outcome,'reconciled');
}));
for(const code of ['oauth_rejected','invoice_not_found','invoice_not_bound','invoice_mismatch','invalid_provider_response','authorization_required','unsafe_payment_url','provider_rejected']){
 test(`${code} blocks automatic retries with sanitized diagnostics`,()=>withFixture(async f=>{
  await f.queue();f.control.read=()=>{throw {code,message:'PRIVATE_EMAIL@example.test SECRET_TOKEN'};};const r=await f.worker.reconcile(B);
  assert.equal(r.outcome,'blocked');assert.equal(r.code,code);assert.equal(f.row().next_attempt_at,null);
  assert.ok(!JSON.stringify(await inspectReconciliation(f.adapter,B,f.stamp())).includes('PRIVATE'));assert.equal(f.row().last_error_code,code);
 }));
}
test('missed-webhook sweep is bounded, coalesced and skips fresh observations',()=>withFixture(async f=>{
 assert.equal((await queueStaleInvoices(f.store,f.stamp(),'2026-10-27T11:00:00.000Z',1)).queued,1);
 assert.equal((await queueStaleInvoices(f.store,f.stamp(),'2026-10-27T11:00:00.000Z',1)).queued,0);
 await f.worker.reconcile(B);assert.equal((await queueStaleInvoices(f.store,f.stamp(),'2026-10-27T11:00:00.000Z',1)).queued,0);
}));
test('sweep and batch reject unbounded or excessively frequent requests',()=>withFixture(async f=>{
 for(const n of [0,26,1.5,NaN]){await assert.rejects(runReconciliationBatch(f.dependencies,n));await assert.rejects(queueStaleInvoices(f.store,f.stamp(),'2026-10-27T11:00:00.000Z',n));}
 await assert.rejects(queueStaleInvoices(f.store,f.stamp(),f.stamp()));
}));
test('fake and absent provider bindings cannot acquire recovery work',()=>withFixture(async f=>{
 f.db.exec("UPDATE invoice_bindings SET environment='simulated'");await f.queue();assert.equal(f.count('paypal_reconciliation_outbox'),0);assert.equal(f.control.calls,0);
 f.db.exec("UPDATE invoice_bindings SET environment='sandbox',provider_invoice_id=NULL");await f.queue();assert.equal(f.count('paypal_reconciliation_outbox'),0);
}));
test('server batch disabled unless fully opted into Sandbox',()=>withFixture(async f=>{
 for(const env of [undefined,{}, {APP_MODE:'local',PAYPAL_MODE:'paypal_sandbox',PAYPAL_RECONCILIATION_ENABLED:'true',DB:f.adapter},
  {APP_MODE:'sandbox',PAYPAL_MODE:'fake',PAYPAL_RECONCILIATION_ENABLED:'true',DB:f.adapter}]){
  assert.equal((await runPayPalReconciliation(env,f.dependencies.readInvoice,f.now)).enabled,false);}
 const r=await runPayPalReconciliation({APP_MODE:'sandbox',PAYPAL_MODE:'paypal_sandbox',PAYPAL_RECONCILIATION_ENABLED:'true',DB:f.adapter},f.dependencies.readInvoice,f.now);
 assert.equal(r.examined,1);assert.equal(f.control.calls,1);protectedEmpty(f);
}));
test('receipt history is immutable, redacted and cleared through binding cascade',()=>withFixture(async f=>{
 await f.queue();await f.worker.reconcile(B);
 assert.throws(()=>f.db.exec("UPDATE paypal_reconciliation_receipts SET provider_status='PAID'"),/immutable/);
 const text=JSON.stringify(f.db.prepare('SELECT * FROM paypal_reconciliation_receipts').all());
 for(const s of ['@','access_token','buyerEmail','Authorization','source_text'])assert.ok(!text.includes(s));
 f.db.prepare('DELETE FROM invoice_bindings WHERE invoice_binding_id=?').run(B);assert.equal(f.count('paypal_reconciliation_receipts'),0);
 assert.equal(f.count('paypal_reconciliation_outbox'),0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
}));
test('file-backed restart retains retry deadlines and completion receipts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rr026-')),file=join(dir,'state.sqlite');let f=fixture({file});
 try{await f.queue();f.control.read=()=>{throw {code:'rate_limited'};};await f.worker.reconcile(B);f.close();f=fixture({file,initialize:false});
  assert.equal((await f.worker.reconcile(B)).outcome,'not_ready');f.advance(60000);assert.equal((await f.worker.reconcile(B)).outcome,'reconciled');
  f.close();f=fixture({file,initialize:false});assert.equal(f.count('audit_events'),1);assert.equal(f.row().completed_generation,1);
 }finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test('unknown IDs create no work and errors reveal no private payload',()=>withFixture(async f=>{
 assert.equal((await f.worker.reconcile('malicious')).outcome,'blocked');assert.equal((await f.worker.reconcile(id(99))).outcome,'not_ready');
 assert.equal(f.control.calls,0);
}));

test('real webhook store advances shared outbox counter after non-webhook recovery',()=>withFixture(async f=>{
 const {createD1WebhookProcessingStore}=await import('../packages/paypal/src/webhook-processing-store.ts');
 await f.queue();await f.worker.reconcile(B);await f.queue();await f.worker.reconcile(B);
 assert.equal(f.row().requested_generation,2);assert.equal(f.row().completed_generation,2);
 f.db.exec(`CREATE TABLE webhook_inbox_events(webhook_inbox_event_id TEXT PRIMARY KEY,provider TEXT,environment TEXT,provider_event_id TEXT,provider_invoice_id TEXT,
  invoice_binding_id TEXT,event_type TEXT,event_created_at TEXT,resource_status TEXT,verification_status TEXT,verification_method TEXT,payload_sha256 TEXT,processing_status TEXT,processed_at TEXT,processing_error_code TEXT);
 CREATE TABLE paypal_webhook_processing_receipts(processing_receipt_id TEXT PRIMARY KEY,webhook_inbox_event_id TEXT NOT NULL UNIQUE,invoice_binding_id TEXT,source_payload_sha256 TEXT,projection_version INTEGER,outcome TEXT,processed_at TEXT);
 CREATE TABLE paypal_webhook_projections(invoice_binding_id TEXT PRIMARY KEY,provider_invoice_id TEXT,signal_mask INTEGER,last_event_created_at TEXT,last_provider_event_id TEXT,last_resource_status TEXT,row_version INTEGER,updated_at TEXT);`);
 const eid=id(90),hash='a'.repeat(64);
 f.db.prepare("INSERT INTO webhook_inbox_events VALUES (?,'paypal','sandbox','WH-RECOVERY',?,NULL,'INVOICING.INVOICE.PAID',?,'PAID','verified','paypal_postback_v1',?,'pending',NULL,NULL)").run(eid,INV,TIME,hash);
 const store=createD1WebhookProcessingStore(f.adapter);
 const event=await store.loadEvent(eid),binding=await store.findBinding(INV);
 await store.commit({receiptId:id(91),auditId:id(92),processedAt:TIME,event,binding,expectedProjectionVersion:0,
  projection:{bindingId:B,providerInvoiceId:INV,signalMask:8,lastEventCreatedAt:TIME,lastProviderEventId:'WH-RECOVERY',lastResourceStatus:'PAID',rowVersion:1}});
 assert.equal(f.row().requested_generation,3);assert.equal(f.row().completed_generation,2);
 const a=JSON.parse(f.db.prepare("SELECT payload_json FROM audit_events WHERE aggregate_type='webhook_processing'").get().payload_json);
 assert.equal(a.notification_projection_version,1);assert.equal(a.reconciliation_generation,undefined);
}));
test('five crashed leases are visible as blocked and recover only through explicit retry',()=>withFixture(async f=>{
 await f.queue();for(let n=0;n<5;n++){
  const c=await f.store.claim(B,crypto.randomUUID(),f.stamp(),new Date(f.control.time+RECONCILIATION_LEASE_MS).toISOString());
  assert.ok(c);f.advance(RECONCILIATION_LEASE_MS+1);
 }
 assert.equal((await inspectReconciliation(f.adapter,B,f.stamp())).status,'blocked');
 assert.equal((await f.worker.reconcile(B)).outcome,'not_ready');await f.queue();
 assert.equal((await f.worker.reconcile(B)).outcome,'reconciled');
}));
test('observed state requesting extra review never exposes a payable handoff',()=>withFixture(async f=>{
 await f.queue();f.control.read=()=>f.view('UNPAID',{requiresReconciliation:true});
 assert.equal((await f.worker.reconcile(B)).outcome,'review_required');
 assert.equal(f.db.prepare('SELECT safe_payment_url FROM paypal_reconciliation_receipts').get().safe_payment_url,null);
}));
test('creator diagnostics do not label a PAID observation as settled or licensed',()=>withFixture(async f=>{
 await f.queue();f.control.read=()=>f.view('PAID');await f.worker.reconcile(B);
 const before=f.count('audit_events');const v=await inspectReconciliation(f.adapter,B,f.stamp());
 assert.equal(v.status,'review_required');assert.equal(v.nextAction,'review_settlement_or_conflict');
 assert.equal(v.authoritativePaymentEvidence,false);assert.equal(f.count('audit_events'),before);protectedEmpty(f);
}));
