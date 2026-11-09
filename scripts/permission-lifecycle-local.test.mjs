import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assessInvoiceSettlement,isLocallyAssessedSettlement,settlementCents} from '../packages/paypal/src/settlement.ts';
import {createSandboxPermissionLifecycle,derivePermissionLifecycle,licenseEndExclusive,permissionPresentation} from '../packages/paypal/src/permission-lifecycle.ts';
import {createD1PermissionLifecycleStore,revokeSandboxPermission} from '../packages/paypal/src/permission-lifecycle-store.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const CASE=id(1), BIND=id(2), TERMS=id(3), QUOTE=id(4), BUYER=id(5), APPROVAL=id(6), INVOICE='INV2-RR027-TEST';
const AT='2026-10-27T12:00:00.000Z';
const usd=value=>({currency_code:'USD',value});
const payment=()=>({type:'PAYPAL',method:'PAYPAL',payment_id:'PAYMENT00000001',payment_date:'2026-10-27',amount:usd('425.00')});
function raw(kind='PAID') {
 const v={status:kind,amount:usd('425.00'),due_amount:usd(kind==='PAID'||kind==='REFUNDED'?'0.00':'425.00')};
 if(['PAID','REFUNDED','PARTIALLY_REFUNDED'].includes(kind))v.payments={paid_amount:usd('425.00'),transactions:[payment()]};
 if(kind==='REFUNDED')v.refunds={refund_amount:usd('425.00'),transactions:[{type:'PAYPAL',method:'PAYPAL',refund_id:'REFUND00000001',refund_date:'2026-10-27',amount:usd('425.00')}]};
 return v;
}
function assess(v=raw(),at=AT){return assessInvoiceSettlement(v,42500,at);}
const schema=`
PRAGMA foreign_keys=ON;
CREATE TABLE licensing_cases(case_id TEXT PRIMARY KEY,case_outcome TEXT NOT NULL,invoice_binding_id TEXT,
 latest_terms_version_id TEXT,latest_quote_id TEXT,latest_buyer_acceptance_id TEXT,latest_creator_decision_id TEXT,
 permission_id TEXT,updated_at TEXT,row_version INTEGER NOT NULL) STRICT;
CREATE TABLE terms_versions(terms_version_id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES licensing_cases(case_id),
 resolution_status TEXT,source_kind TEXT,created_by_actor TEXT,start_date TEXT,duration_days INTEGER) STRICT;
CREATE TABLE quotes(quote_id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES licensing_cases(case_id),terms_version_id TEXT,
 status TEXT,amount_cents INTEGER,currency TEXT) STRICT;
CREATE TABLE creator_decisions(creator_decision_id TEXT PRIMARY KEY,case_id TEXT,terms_version_id TEXT,quote_id TEXT,decision TEXT) STRICT;
CREATE TABLE buyer_acceptances(buyer_acceptance_id TEXT PRIMARY KEY,case_id TEXT,terms_version_id TEXT,quote_id TEXT,
 creator_decision_id TEXT,acceptance_copy_version TEXT,accepted_at TEXT) STRICT;
CREATE TABLE invoice_bindings(invoice_binding_id TEXT PRIMARY KEY,case_id TEXT UNIQUE NOT NULL REFERENCES licensing_cases(case_id),
 terms_version_id TEXT NOT NULL,quote_id TEXT NOT NULL,buyer_acceptance_id TEXT NOT NULL,provider TEXT,environment TEXT,
 provider_invoice_id TEXT,invoice_status TEXT CHECK(invoice_status IN ('create_pending','draft','send_pending','sent','paid','canceled','fully_refunded','reconciliation_required')),
 row_version INTEGER NOT NULL,updated_at TEXT) STRICT;
CREATE TABLE paypal_reconciliation_outbox(invoice_binding_id TEXT PRIMARY KEY REFERENCES invoice_bindings(invoice_binding_id),
 requested_generation INTEGER NOT NULL,completed_generation INTEGER NOT NULL,lease_token TEXT,lease_expires_at TEXT,
 attempt_count INTEGER NOT NULL DEFAULT 0,attempt_generation INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT,
 last_error_code TEXT,blocked_code TEXT,last_success_at TEXT,updated_at TEXT) STRICT;
CREATE TABLE paypal_reconciliation_receipts(reconciliation_receipt_id TEXT PRIMARY KEY,
 invoice_binding_id TEXT NOT NULL REFERENCES invoice_bindings(invoice_binding_id),generation INTEGER NOT NULL,
 provider_invoice_id TEXT,provider_status TEXT,local_invoice_status TEXT,
 reason_code TEXT CHECK(reason_code IN ('current_provider_state','financial_review_required','uncertain_provider_state','state_regression_blocked')),
 amount_cents INTEGER,currency TEXT,safe_payment_url TEXT,observed_at TEXT,recorded_at TEXT,UNIQUE(invoice_binding_id,generation)) STRICT;
CREATE TABLE payment_evidence(payment_evidence_id TEXT PRIMARY KEY,invoice_binding_id TEXT NOT NULL REFERENCES invoice_bindings(invoice_binding_id),
 evidence_source TEXT CHECK(evidence_source IN ('verified_webhook','reconciliation','simulated_fixture')),source_reference TEXT,
 payment_status TEXT CHECK(payment_status IN ('draft','sent','paid','canceled','fully_refunded')),amount_cents INTEGER,currency TEXT,
 observed_at TEXT,evidence_hash TEXT UNIQUE NOT NULL,created_at TEXT) STRICT;
CREATE TABLE permissions(permission_id TEXT PRIMARY KEY,case_id TEXT UNIQUE NOT NULL REFERENCES licensing_cases(case_id),
 invoice_binding_id TEXT NOT NULL REFERENCES invoice_bindings(invoice_binding_id),terms_version_id TEXT NOT NULL,
 permission_state TEXT NOT NULL CHECK(permission_state IN ('scheduled','active','expired','refunded','revoked')),
 state_reason_code TEXT NOT NULL,start_date TEXT NOT NULL,end_date_exclusive TEXT NOT NULL,state_effective_at TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,row_version INTEGER NOT NULL DEFAULT 1,CHECK(end_date_exclusive>start_date)) STRICT;
CREATE TABLE verification_records(verification_record_id TEXT PRIMARY KEY,case_id TEXT UNIQUE REFERENCES licensing_cases(case_id),
 current_status TEXT CHECK(current_status IN ('pending','scheduled','active','expired','canceled','rejected','refunded','revoked','invalid')),
 current_receipt_revision_id TEXT,updated_at TEXT,row_version INTEGER NOT NULL DEFAULT 1) STRICT;
CREATE TABLE receipt_revisions(receipt_revision_id TEXT PRIMARY KEY);
CREATE TABLE audit_events(audit_event_id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES licensing_cases(case_id),
 aggregate_type TEXT NOT NULL,aggregate_id TEXT NOT NULL,aggregate_sequence INTEGER NOT NULL,event_type TEXT,
 actor_type TEXT,actor_reference TEXT,payload_json TEXT CHECK(json_valid(payload_json)),correlation_id TEXT,idempotency_key TEXT,
 created_at TEXT,UNIQUE(case_id,aggregate_type,aggregate_id,aggregate_sequence)) STRICT;
`;
function fixture({file=':memory:',initialize=true,start='2026-10-27',days=90}={}) {
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON;');
 if(initialize){db.exec(schema);db.exec(readFileSync(new URL('../migrations/0007_permission_lifecycle.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO licensing_cases VALUES (?,?,?,?,?,?,?,NULL,?,1)').run(CASE,'open',BIND,TERMS,QUOTE,BUYER,APPROVAL,AT);
 db.prepare('INSERT INTO terms_versions VALUES (?,?,?,?,?,?,?)').run(TERMS,CASE,'complete','human_corrected','creator',start,days);
 db.prepare('INSERT INTO quotes VALUES (?,?,?,?,?,?)').run(QUOTE,CASE,TERMS,'current',42500,'USD');
 db.prepare('INSERT INTO creator_decisions VALUES (?,?,?,?,?)').run(APPROVAL,CASE,TERMS,QUOTE,'approved');
 db.prepare('INSERT INTO buyer_acceptances VALUES (?,?,?,?,?,?,?)').run(BUYER,CASE,TERMS,QUOTE,APPROVAL,'accept-v1',AT);
 db.prepare('INSERT INTO invoice_bindings VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(BIND,CASE,TERMS,QUOTE,BUYER,'paypal','sandbox',INVOICE,'sent',1,AT);
 db.prepare('INSERT INTO paypal_reconciliation_outbox(invoice_binding_id,requested_generation,completed_generation,updated_at) VALUES (?,1,0,?)').run(BIND,AT);
 db.prepare('INSERT INTO verification_records VALUES (?,?,?,NULL,?,1)').run(id(8),CASE,'pending',AT);
 }
 const state={now:AT,body:raw(),failAt:-1,beforeBatch:null,beforeRead:null,lostAck:false,calls:0,lastStatements:0,viewChange:null};
 const database={prepare(sql){return {sql,args:[],bind(...args){return {...this,args};},async first(){return db.prepare(this.sql).get(...this.args)??null;}};},
 async batch(statements){if(state.beforeBatch){const f=state.beforeBatch;state.beforeBatch=null;f();}
 state.lastStatements=statements.length;db.exec('BEGIN IMMEDIATE');let result;
 try{result=statements.map((s,i)=>{if(state.failAt===i)throw Error('PRIVATE_SQL_SECRET');const r=db.prepare(s.sql).run(...s.args);return {success:true,meta:{changes:Number(r.changes)}};});db.exec('COMMIT');}
 catch(e){db.exec('ROLLBACK');throw e;}
 if(state.lostAck){state.lostAck=false;throw Error('lost acknowledgement');}return result;}};
 const recovery={async claim(bindingId,token,now,until){
 const changed=db.prepare(`UPDATE paypal_reconciliation_outbox SET lease_token=?,lease_expires_at=?,attempt_generation=requested_generation,
 attempt_count=attempt_count+1,updated_at=? WHERE invoice_binding_id=? AND requested_generation>completed_generation AND blocked_code IS NULL
 AND (lease_token IS NULL OR lease_expires_at<=?) AND (next_attempt_at IS NULL OR next_attempt_at<=?) AND attempt_count<5`)
 .run(token,until,now,bindingId,now,now).changes;if(!changed)return null;
 return db.prepare(`SELECT b.invoice_binding_id AS bindingId,b.case_id AS caseId,b.provider_invoice_id AS invoiceId,
 b.quote_id AS quoteId,b.terms_version_id AS termsVersionId,b.buyer_acceptance_id AS buyerAcceptanceId,
 q.amount_cents AS amountCents,q.currency,b.invoice_status AS invoiceState,b.row_version AS bindingVersion,c.row_version AS caseVersion,
 CASE WHEN d.decision='approved' AND c.case_outcome='open' AND b.environment='sandbox' THEN 1 ELSE 0 END AS consentCurrent,
 o.requested_generation AS generation,o.lease_token AS token,o.attempt_count AS attemptNumber,o.updated_at AS startedAt,o.lease_expires_at AS leaseUntil
 FROM invoice_bindings b JOIN licensing_cases c ON c.case_id=b.case_id JOIN quotes q ON q.quote_id=b.quote_id
 JOIN buyer_acceptances a ON a.buyer_acceptance_id=b.buyer_acceptance_id JOIN creator_decisions d ON d.creator_decision_id=a.creator_decision_id
 JOIN paypal_reconciliation_outbox o ON o.invoice_binding_id=b.invoice_binding_id WHERE b.invoice_binding_id=?`).get(bindingId);},
 async fail(c,code,retryAt,now){const r=db.prepare(`UPDATE paypal_reconciliation_outbox SET lease_token=NULL,lease_expires_at=NULL,
 last_error_code=?,blocked_code=?,next_attempt_at=? WHERE invoice_binding_id=? AND lease_token=? AND lease_expires_at>?`)
 .run(code,retryAt===null?code:null,retryAt,c.bindingId,c.token,now);if(r.changes!==1)throw Error('lease lost');}};
 const store=createD1PermissionLifecycleStore(database);
 async function readInvoice(){state.calls++;if(state.beforeRead){const f=state.beforeRead;state.beforeRead=null;await f();}
 if(state.body instanceof Error)throw state.body;
 const v={invoiceId:INVOICE,caseId:CASE,quoteId:QUOTE,termsVersionId:TERMS,buyerAcceptanceId:BUYER,amountCents:42500,currency:'USD',
 status:state.body.status,mode:'paypal_sandbox',provider:'paypal',environment:'sandbox',simulated:false,authoritativePaymentEvidence:false,
 observedAt:state.now,settlement:assess(state.body,state.now)};return state.viewChange?state.viewChange(v):v;}
 const worker=createSandboxPermissionLifecycle({recovery,store,readInvoice,now:()=>new Date(state.now)});
 function queue(){db.prepare(`UPDATE paypal_reconciliation_outbox SET requested_generation=requested_generation+1,blocked_code=NULL,
 next_attempt_at=NULL,attempt_count=0 WHERE invoice_binding_id=?`).run(BIND);}
 const count=t=>db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n;
 return {db,state,store,recovery,worker,queue,count,database,readInvoice,run:()=>worker.reconcile(BIND),
 permission:()=>db.prepare('SELECT * FROM permissions').get(),invoice:()=>db.prepare('SELECT * FROM invoice_bindings').get(),
 outbox:()=>db.prepare('SELECT * FROM paypal_reconciliation_outbox').get(),close:()=>db.close()};
}
for(const [label,kind,conclusion] of [['paid','PAID','paid'],['full refund','REFUNDED','fully_refunded'],['unpaid cancel','CANCELLED','canceled'],['unpaid','UNPAID','unpaid']]){
 test(`strict provider detail recognizes ${label}`,()=>{assert.equal(assess(raw(kind)).conclusion,conclusion);});
}
const malformed=[
 ['missing payments',v=>delete v.payments],['missing due',v=>delete v.due_amount],
 ['external type',v=>v.payments.transactions[0].type='EXTERNAL'],['cash method',v=>v.payments.transactions[0].method='CASH'],
 ['no transaction ID',v=>delete v.payments.transactions[0].payment_id],['duplicate transaction',v=>v.payments.transactions.push(payment())],
 ['wrong aggregate',v=>v.payments.paid_amount=usd('424.00')],['wrong row total',v=>v.payments.transactions[0].amount=usd('424.00')],
 ['pending payment',v=>v.status='PAYMENT_PENDING'],['marked paid',v=>v.status='MARKED_AS_PAID'],
 ['external paid',v=>v.status='PAID_EXTERNAL'],['partial payment',v=>v.status='PARTIALLY_PAID'],
 ['nonzero due',v=>v.due_amount=usd('1.00')],['wrong invoice total',v=>v.amount=usd('426.00')],
 ['wrong currency',v=>v.payments.paid_amount.currency_code='EUR'],['negative money',v=>v.payments.paid_amount.value='-425.00'],
 ['exponent money',v=>v.payments.paid_amount.value='4.25e2'],['fractional cents',v=>v.payments.paid_amount.value='425.001'],
 ['whitespace money',v=>v.payments.paid_amount.value=' 425.00'],['NaN money',v=>v.payments.paid_amount.value='NaN'],
 ['future payment date',v=>v.payments.transactions[0].payment_date='2027-01-01'],
 ['invalid calendar',v=>v.payments.transactions[0].payment_date='2026-02-30'],
 ['no payment date',v=>delete v.payments.transactions[0].payment_date],['tip',v=>v.gratuity=usd('1.00')],
 ['conditional total',v=>v.effective_invoice_total=usd('400.00')],['conditional due',v=>v.effective_due_amount=usd('1.00')],
 ['conditional rules',v=>v.configuration={has_conditional_rule:true}],['unrecognized status',v=>v.status='APPROVED_BY_AI'],
 ['over-limit rows',v=>v.payments.transactions=Array.from({length:51},(_,i)=>({...payment(),payment_id:`PAY${i}`}))],
];
for(const [label,mutate] of malformed)test(`unsafe financial detail abstains: ${label}`,()=>{const v=raw();mutate(v);assert.equal(assess(v).conclusion,'review_required');});
for(const [label,mutate] of [
 ['missing refund IDs',v=>delete v.refunds.transactions[0].refund_id],
 ['partial refund sum',v=>{v.refunds.refund_amount=usd('100.00');v.refunds.transactions[0].amount=usd('100.00');}],
 ['external refund',v=>v.refunds.transactions[0].type='EXTERNAL'],
 ['pending refund',v=>v.status='PARTIALLY_REFUNDED'],
 ['refund predates payment',v=>v.refunds.transactions[0].refund_date='2026-10-01'],
 ['duplicate refund identity',v=>v.refunds.transactions[0].refund_id=v.payments.transactions[0].payment_id],
 ['refund without paid history',v=>delete v.payments],
])test(`unsafe refund detail abstains: ${label}`,()=>{const v=raw('REFUNDED');mutate(v);assert.equal(assess(v).conclusion,'review_required');});
test('multiple PayPal payments sum exactly and stable transaction order is canonical',()=>{
 const v=raw();v.payments.transactions=[{...payment(),payment_id:'ZPAY',amount:usd('200.00')},{...payment(),payment_id:'APAY',amount:usd('225.00')}];
 const a=assess(v);v.payments.transactions.reverse();assert.deepEqual(a,assess(v));assert.equal(a.conclusion,'paid');
});
test('financial metadata is immutable, locally constructed and redacted',()=>{
 const v=raw();v.payments.transactions[0].note='private@example.test SECRET';const f=assess(v);
 assert.equal(isLocallyAssessedSettlement(f),true);assert.equal(isLocallyAssessedSettlement({...f}),false);
 assert.throws(()=>{f.payments[0].amountCents=1;});assert.ok(!JSON.stringify(f).includes('private'));v.payments.transactions[0].amount.value='1.00';assert.equal(f.paidCents,42500);
});
test('exact integer money and UTC interval boundaries',()=>{
 assert.equal(settlementCents(usd('0.01')),1);assert.equal(settlementCents(usd('425')),42500);
 assert.equal(licenseEndExclusive('2028-02-28',2),'2028-03-01');assert.throws(()=>licenseEndExclusive('2026-02-30',90));
 assert.throws(()=>licenseEndExclusive('2026-01-01',366));assert.equal(permissionPresentation('active',true),'review_required');
});
for(const [start,days,expected] of [['2026-11-01',90,'scheduled'],['2026-10-27',1,'active'],['2026-10-26',1,'expired']]){
 test(`paid permission is ${expected} at exact UTC boundary`,async()=>{const f=fixture({start,days});try{
 const r=await f.run();assert.equal(r.outcome,'applied');assert.equal(f.permission().permission_state,expected);assert.equal(f.invoice().invoice_status,'paid');
 assert.equal(f.count('payment_evidence'),1);assert.equal(f.count('audit_events'),1);assert.equal(f.count('receipt_revisions'),0);
 assert.equal(f.db.prepare('SELECT current_status FROM verification_records').get().current_status,'invalid');
 assert.equal(f.outbox().completed_generation,1);assert.equal(r.publicReceiptReady,false);
 }finally{f.close();}});
}
test('repeated job and repeated fresh financial snapshot do not duplicate evidence or activation',async()=>{
 const f=fixture();try{await f.run();assert.equal((await f.run()).outcome,'not_ready');f.queue();await f.run();
 assert.equal(f.count('payment_evidence'),1);assert.equal(f.count('permissions'),1);assert.equal(f.permission().row_version,1);
 assert.equal(f.db.prepare("SELECT count(*) AS n FROM audit_events WHERE event_type='permission.activated'").get().n,1);
 assert.equal(f.count('paypal_lifecycle_observations'),2);
 }finally{f.close();}
});
test('paid then fully refunded transitions atomically and never reactivates',async()=>{
 const f=fixture();try{await f.run();f.queue();f.state.body=raw('REFUNDED');await f.run();assert.equal(f.permission().permission_state,'refunded');
 assert.equal(f.invoice().invoice_status,'fully_refunded');assert.equal(f.count('payment_evidence'),2);
 f.queue();f.state.body=raw();const r=await f.run();assert.equal(r.outcome,'review_required');assert.equal(f.permission().permission_state,'refunded');assert.equal(f.invoice().invoice_status,'fully_refunded');
 }finally{f.close();}
});
test('refund received before prior paid callback creates no temporary active permission',async()=>{
 const f=fixture();try{f.state.body=raw('REFUNDED');await f.run();assert.equal(f.permission().permission_state,'refunded');assert.equal(f.count('payment_evidence'),2);
 assert.equal(f.db.prepare("SELECT count(*) AS n FROM audit_events WHERE event_type='permission.activated'").get().n,0);
 }finally{f.close();}
});
test('cancel before payment creates no permission and stale paid cannot reopen',async()=>{
 const f=fixture();try{f.state.body=raw('CANCELLED');await f.run();assert.equal(f.permission(),undefined);assert.equal(f.invoice().invoice_status,'canceled');
 f.queue();f.state.body=raw();assert.equal((await f.run()).outcome,'review_required');assert.equal(f.permission(),undefined);
 }finally{f.close();}
});
test('cancel after payment becomes review and suppresses active status',async()=>{
 const f=fixture();try{await f.run();f.queue();f.state.body=raw('CANCELLED');const r=await f.run();assert.equal(r.permission,'review_required');assert.equal(f.permission().review_required,1);assert.equal(f.invoice().invoice_status,'reconciliation_required');
 }finally{f.close();}
});
test('partial refund cannot leave a clean active claim or disappear on a stale PAID read',async()=>{
 const f=fixture();try{await f.run();f.queue();const v=raw('REFUNDED');v.status='PARTIALLY_REFUNDED';v.refunds.refund_amount=usd('100.00');v.refunds.transactions[0].amount=usd('100.00');f.state.body=v;
 assert.equal((await f.run()).permission,'review_required');assert.equal(f.permission().review_required,1);assert.equal(f.count('payment_evidence'),1);
 f.queue();f.state.body=raw();assert.equal((await f.run()).permission,'review_required');assert.equal(f.permission().review_required,1);
 }finally{f.close();}
});
test('expired permission stays expired if the clock moves backward',async()=>{
 const f=fixture({start:'2026-10-26',days:1});try{await f.run();f.queue();assert.equal(f.permission().permission_state,'expired');
 // The reducer cannot rewind expiration even with otherwise current observations.
 const c=await f.recovery.claim(BIND,crypto.randomUUID(),AT,'2026-10-27T12:01:30.000Z');const x=await f.store.context(c);
 assert.equal(derivePermissionLifecycle(c,x,assess(),AT).permissionState,'expired');
 }finally{f.close();}
});
test('revoked permission never becomes refunded or active again; invoice still records refund',async()=>{
 const f=fixture();try{await f.run();f.db.exec("UPDATE permissions SET permission_state='revoked',row_version=row_version+1");
 f.queue();await f.run();assert.equal(f.permission().permission_state,'revoked');f.queue();f.state.body=raw('REFUNDED');await f.run();
 assert.equal(f.permission().permission_state,'revoked');assert.equal(f.invoice().invoice_status,'fully_refunded');
 }finally{f.close();}
});
for(const [name,sql] of [
 ['revoked creator decision',"UPDATE creator_decisions SET decision='rejected'"],
 ['changed current terms',`UPDATE licensing_cases SET latest_terms_version_id='${id(99)}'`],
 ['superseded quote',"UPDATE quotes SET status='superseded'"],
 ['changed amount',"UPDATE quotes SET amount_cents=42600"],
 ['withdrawn acceptance',`UPDATE licensing_cases SET latest_buyer_acceptance_id='${id(99)}'`],
 ['closed case',"UPDATE licensing_cases SET case_outcome='canceled'"],
 ['changed terms date',"UPDATE terms_versions SET start_date='2026-11-01'"],
 ['case version advanced',"UPDATE licensing_cases SET row_version=row_version+1"],
 ['invoice version advanced',"UPDATE invoice_bindings SET row_version=row_version+1"],
 ['new webhook while reading',"UPDATE paypal_reconciliation_outbox SET requested_generation=requested_generation+1"],
 ['lease replaced',`UPDATE paypal_reconciliation_outbox SET lease_token='${id(99)}'`],
])test(`${name} before completion prevents partial lifecycle writes`,async()=>{
 const f=fixture();try{f.state.beforeBatch=()=>f.db.exec(sql);const r=await f.run();assert.notEqual(r.outcome,'applied');
 for(const table of ['payment_evidence','permissions','paypal_lifecycle_observations','paypal_reconciliation_receipts','audit_events'])assert.equal(f.count(table),0,table);
 }finally{f.close();}
});
for(let fail=0;fail<9;fail++)test(`financial transaction failure at write ${fail+1} leaves no partial effects`,async()=>{
 const f=fixture();try{f.state.failAt=fail;const r=await f.run();assert.notEqual(r.outcome,'applied');
 for(const table of ['payment_evidence','permissions','paypal_lifecycle_observations','paypal_reconciliation_receipts','audit_events'])assert.equal(f.count(table),0,table);
 assert.equal(f.invoice().invoice_status,'sent');assert.equal(f.outbox().completed_generation,0);
 }finally{f.close();}
});
test('lost completion acknowledgement is recovered without duplicate activation',async()=>{
 const f=fixture();try{f.state.lostAck=true;assert.equal((await f.run()).outcome,'already_completed');assert.equal(f.count('payment_evidence'),1);assert.equal(f.count('permissions'),1);}finally{f.close();}
});
test('two workers share the lease and commit one permission',async()=>{
 const f=fixture();try{const r=await Promise.all([f.run(),f.run()]);assert.equal(r.filter(x=>x.outcome==='applied').length,1);assert.equal(f.count('permissions'),1);assert.equal(f.count('audit_events'),1);}finally{f.close();}
});
test('file-backed restart preserves evidence deduplication and terminal refund state',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rr027-'));const file=join(dir,'state.sqlite');let f=fixture({file});
 try{await f.run();f.queue();f.state.body=raw('REFUNDED');await f.run();f.close();f=fixture({file,initialize:false});f.queue();f.state.body=raw('REFUNDED');await f.run();
 assert.equal(f.count('payment_evidence'),2);assert.equal(f.permission().permission_state,'refunded');assert.equal(f.count('permissions'),1);
 }finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test('untrusted serialized financial objects and mismatched provider tuples fail',async()=>{
 for(const change of [v=>({...v,settlement:{...v.settlement}}),v=>({...v,simulated:true}),v=>({...v,environment:'live'}),v=>({...v,amountCents:1}),v=>({...v,quoteId:id(99)})]){
 const f=fixture();try{f.state.viewChange=change;assert.equal((await f.run()).outcome,'blocked');assert.equal(f.count('payment_evidence'),0);assert.equal(f.count('permissions'),0);}finally{f.close();}
 }
});
test('expired lease and stale provider time cannot grant permission',async()=>{
 for(const change of [v=>({...v,observedAt:'2020-01-01T00:00:00.000Z'}),v=>{return {...v,settlement:assess(raw(),'2026-10-27T11:59:59.000Z'),observedAt:'2026-10-27T11:59:59.000Z'};}]){
 const f=fixture();try{f.state.viewChange=change;assert.equal((await f.run()).outcome,'blocked');assert.equal(f.count('permissions'),0);}finally{f.close();}
 }
});
test('transport failure remains retryable with no raw error leakage',async()=>{
 const f=fixture();try{f.state.body=Error('Bearer PRIVATE_TOKEN buyer@example.test');const r=await f.run();assert.equal(r.outcome,'retry_scheduled');assert.ok(!JSON.stringify(r).includes('PRIVATE_TOKEN'));assert.equal(f.count('permissions'),0);}finally{f.close();}
});
test('database guards keep observations immutable and terminal permission from reopening',async()=>{
 const f=fixture();try{await f.run();assert.throws(()=>f.db.exec("UPDATE paypal_lifecycle_observations SET reason_code='edited'"),/immutable/);
 f.queue();f.state.body=raw('REFUNDED');await f.run();assert.throws(()=>f.db.exec("UPDATE permissions SET permission_state='active'"),/terminal/);
 assert.throws(()=>f.db.exec("UPDATE permissions SET start_date='2026-01-01'"),/identity/);
 }finally{f.close();}
});
test('audit is redacted; no rights receipt is issued by lifecycle processing',async()=>{
 const f=fixture();try{await f.run();const data=JSON.stringify(f.db.prepare('SELECT * FROM audit_events').all());
 for(const marker of ['buyer@example','access_token','Authorization','PRIVATE_TOKEN'])assert.ok(!data.includes(marker));assert.equal(f.count('receipt_revisions'),0);
 }finally{f.close();}
});

test('authenticated explicit creator revocation is atomic, replay-safe and not a refund',async()=>{
 const f=fixture();try{await f.run();const p=f.permission();const input={permissionId:p.permission_id,expectedVersion:p.row_version,actorReference:'creator-test'};
 await assert.rejects(revokeSandboxPermission(f.database,input,async()=>false,AT));assert.equal(f.permission().permission_state,'active');
 const r=await revokeSandboxPermission(f.database,input,async c=>c.caseId===CASE,AT);assert.equal(r.refundInitiated,false);assert.equal(f.permission().permission_state,'revoked');
 assert.equal(f.invoice().invoice_status,'paid');assert.equal(f.count('payment_evidence'),1);
 assert.equal((await revokeSandboxPermission(f.database,input,async()=>true,AT)).changed,false);
 assert.equal(f.db.prepare("SELECT count(*) AS n FROM audit_events WHERE event_type='permission.revoked'").get().n,1);
 }finally{f.close();}
});
for(let i=0;i<4;i++)test(`revocation failure at statement ${i+1} rolls back`,async()=>{
 const f=fixture();try{await f.run();const p=f.permission();f.state.failAt=i;
 await assert.rejects(revokeSandboxPermission(f.database,{permissionId:p.permission_id,expectedVersion:p.row_version,actorReference:'creator-test'},async()=>true,AT));
 assert.equal(f.permission().permission_state,'active');assert.equal(f.count('audit_events'),1);assert.equal(f.invoice().invoice_status,'paid');
 }finally{f.close();}
});
test('revocation rejects stale versions, expired states and authorization changes during commit',async()=>{
 const f=fixture();try{await f.run();const p=f.permission();const input={permissionId:p.permission_id,expectedVersion:p.row_version,actorReference:'creator-test'};
 await assert.rejects(revokeSandboxPermission(f.database,{...input,expectedVersion:999},async()=>true,AT));
 f.state.beforeBatch=()=>f.db.exec('UPDATE licensing_cases SET row_version=row_version+1');
 await assert.rejects(revokeSandboxPermission(f.database,input,async()=>true,AT));assert.equal(f.permission().permission_state,'active');
 f.db.exec("UPDATE permissions SET permission_state='expired'");await assert.rejects(revokeSandboxPermission(f.database,input,async()=>true,AT));
 }finally{f.close();}
});

test('clock transitions scheduled to active to expired never reopen terminal permission',async()=>{
 const f=fixture({start:'2026-10-28',days:1});try{await f.run();assert.equal(f.permission().permission_state,'scheduled');
 f.queue();f.state.now='2026-10-28T00:00:00.000Z';await f.run();assert.equal(f.permission().permission_state,'active');
 f.queue();f.state.now='2026-10-29T00:00:00.000Z';await f.run();assert.equal(f.permission().permission_state,'expired');
 assert.equal(f.count('payment_evidence'),1);assert.equal(f.permission().row_version,3);
 }finally{f.close();}
});
test('expired paid permission may become refunded but never active again',async()=>{
 const f=fixture({start:'2026-10-25',days:1});try{await f.run();assert.equal(f.permission().permission_state,'expired');
 f.queue();f.state.body=raw('REFUNDED');await f.run();assert.equal(f.permission().permission_state,'refunded');
 }finally{f.close();}
});
test('server lifecycle composition is off by default and local/fake environments stay off',async()=>{
 const {runPayPalPermissionLifecycle}=await import('../apps/api/src/paypal-permission-lifecycle.ts');
 const f=fixture();try{for(const value of [undefined,{}, {APP_MODE:'local',PAYPAL_MODE:'paypal_sandbox',PAYPAL_PERMISSION_LIFECYCLE_ENABLED:'true',DB:f.database},
 {APP_MODE:'sandbox',PAYPAL_MODE:'fake',PAYPAL_PERMISSION_LIFECYCLE_ENABLED:'true',DB:f.database},
 {APP_MODE:'sandbox',PAYPAL_MODE:'paypal_sandbox',PAYPAL_PERMISSION_LIFECYCLE_ENABLED:'true'}]){
 assert.equal((await runPayPalPermissionLifecycle(value,BIND,{recovery:f.recovery,readInvoice:f.readInvoice})).enabled,false);
 }assert.equal(f.state.calls,0);assert.equal(f.count('permissions'),0);
 }finally{f.close();}
});
