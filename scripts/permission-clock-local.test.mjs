import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { effectivePermissionState,licenseInterval,licenseTiming,timingMessage } from '../packages/receipts/src/temporal.ts';
import { createPermissionClock,runPermissionClockBatch } from '../packages/receipts/src/temporal-service.ts';
import { createReceiptReader } from '../packages/receipts/src/experience.ts';
import { renderPublicVerification,renderPrivateReceipt } from '../packages/receipts/src/presentation.ts';
import { runPermissionClock } from '../apps/api/src/permission-clock.ts';
import { temporalDatabase,ids,publicId } from './support/temporal-database.mjs';
const start='2026-11-01',end='2027-01-30',START=start+'T00:00:00.000Z',END=end+'T00:00:00.000Z';
const activeEnd='2027-01-25T00:00:00.000Z';
const state=(f)=>createPermissionClock(f.store,f.clock);
const publicRead=(f)=>createReceiptReader(f.store.receipts,f.clock).read(ids.case,publicId);
function protectedFacts(f){return JSON.stringify({binding:f.db.prepare('SELECT * FROM invoice_bindings').all(),evidence:f.db.prepare('SELECT * FROM payment_evidence').all(),outbox:f.db.prepare('SELECT * FROM paypal_reconciliation_outbox').all(),financial:f.db.prepare('SELECT * FROM paypal_lifecycle_observations').all()});}
for(const [at,want] of [['2026-10-31T23:59:59.999Z','scheduled'],[START,'active'],['2027-01-29T23:59:59.999Z','active'],[END,'expired'],['2027-02-01T00:00:00.000Z','expired']])test(`UTC boundary ${at} -> ${want}`,()=>{
 assert.equal(effectivePermissionState('scheduled',start,end,at),want);
});
test('one-day and leap-day licenses use an exclusive UTC end',()=>{
 assert.equal(licenseInterval('2028-02-29','2028-03-01').days,1);
 assert.equal(licenseInterval('2028-02-28','2028-03-01').days,2);
 assert.equal(licenseInterval('2026-12-31','2027-01-01').lastPermittedDate,'2026-12-31');
});
test('DST transition days are still exactly 86400000 milliseconds in the UTC contract',()=>{
 for(const [a,b] of [['2026-03-08','2026-03-09'],['2026-11-01','2026-11-02']])assert.equal(licenseInterval(a,b).end-licenseInterval(a,b).start,86400000);
});
for(const [a,b] of [['2027-02-29','2027-03-01'],['2026-02-30','2026-03-02'],['2026-13-01','2027-01-01'],['2026-01-01','2026-01-01'],['2026-01-02','2026-01-01'],['2026-01-01','2027-01-02'],['2026-1-1','2026-01-02']])test(`malformed interval ${a}/${b} is rejected`,()=>assert.throws(()=>licenseInterval(a,b)));
for(const at of ['2026-11-01','2026-11-01T00:00:00Z','2026-11-01T00:00:00.000-10:00','2026-02-30T00:00:00.000Z','invalid'])test(`ambiguous/invalid clock ${at} is rejected`,()=>assert.throws(()=>licenseTiming('scheduled',start,end,at)));
for(const terminal of ['expired','refunded','revoked'])test(`${terminal} never reactivates on a backward clock`,()=>assert.equal(effectivePermissionState(terminal,start,end,'2026-10-01T00:00:00.000Z'),terminal));
test('active state cannot rewind into scheduled',()=>assert.throws(()=>effectivePermissionState('active',start,end,'2026-10-01T00:00:00.000Z')));
for(const [at,notice,days] of [['2027-01-22T23:59:59.999Z','in_effect',8],['2027-01-23T00:00:00.000Z','expires_soon',7],['2027-01-29T00:00:00.000Z','last_day',1],['2027-01-29T23:59:59.999Z','last_day',1],[END,'ended',0]])test(`expiration warning at ${at}`,()=>{
 const t=licenseTiming('active',start,end,at);assert.equal(t.notice,notice);assert.equal(t.daysRemaining,days);assert.equal(t.expiresAt,END);assert.ok(timingMessage(t).includes(END));
});
test('scheduled and revoked records have no misleading days-left countdown',()=>{
 assert.equal(licenseTiming('scheduled',start,end,'2026-10-27T20:00:00.000Z').daysRemaining,null);
 for(const s of ['refunded','revoked']){const t=licenseTiming(s,start,end,START);assert.equal(t.notice,'not_active');assert.equal(t.daysRemaining,null);}
});
test('all 365 supported durations transition on exact millisecond boundaries',()=>{
 for(let days=1;days<=365;days++){const a='2028-01-01',b=new Date(Date.parse(a+'T00:00:00.000Z')+days*86400000).toISOString().slice(0,10),e=b+'T00:00:00.000Z';
  assert.equal(effectivePermissionState('active',a,b,new Date(Date.parse(e)-1).toISOString()),'active');assert.equal(effectivePermissionState('active',a,b,e),'expired');}
});
test('scheduled permission stays untouched before its first permitted instant',async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.setNow('2026-10-31T23:59:59.999Z');const n=f.count('audit_events');
 assert.equal((await state(f).refresh(ids.case)).outcome,'unchanged');assert.equal(f.permission().permission_state,'scheduled');assert.equal(f.count('audit_events'),n);assert.equal(f.receipts().length,1);
 }finally{f.close();}
});
test('midnight activation atomically records the clock transition and publishes linked receipt 2',async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{const facts=protectedFacts(f),first=f.receipts()[0];f.setNow(START);
 const r=await state(f).refresh(ids.case);assert.equal(r.outcome,'refreshed');assert.equal(r.status,'active');assert.equal(r.receiptReady,true);
 assert.equal(f.permission().state_effective_at,START);assert.equal(f.permission().state_reason_code,'utc_start_reached');assert.equal(f.receipts()[1].previous_revision_hash,first.payload_hash);
 assert.equal((await publicRead(f)).publicView.status,'active');assert.equal(protectedFacts(f),facts);
 const audit=f.db.prepare("SELECT * FROM audit_events WHERE aggregate_type='permission_clock'").get();assert.equal(audit.actor_type,'clock');assert.equal(audit.event_type,'permission.activated');
 }finally{f.close();}
});
test('active permission expires exactly at exclusive end, not one millisecond early',async()=>{
 const f=await temporalDatabase();try{f.setNow('2027-01-24T23:59:59.999Z');assert.equal((await state(f).refresh(ids.case)).outcome,'unchanged');
 f.setNow(activeEnd);assert.equal((await state(f).refresh(ids.case)).status,'expired');const v=(await publicRead(f)).publicView;assert.equal(v.status,'expired');assert.equal(v.integrity,'verified');assert.equal(v.receipt.timing.notice,'ended');
 }finally{f.close();}
});
test('delayed scheduled refresh jumps directly to expired without a temporary active claim',async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.setNow('2027-02-01T18:00:00.000Z');const r=await state(f).refresh(ids.case);assert.equal(r.status,'expired');
 assert.equal(f.permission().state_effective_at,END);assert.equal(f.receipts().length,2);assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE event_type='permission.activated'").get().n,1);
 const event=JSON.parse(f.db.prepare("SELECT payload_json FROM audit_events WHERE aggregate_type='permission_clock'").get().payload_json);assert.equal(event.previous_state,'scheduled');assert.equal(event.state,'expired');assert.equal(event.effective_at,END);
 }finally{f.close();}
});
test('scheduled -> active -> expired yields three immutable linked receipts',async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{const old=f.receipts()[0].canonical_payload_json;f.setNow(START);await state(f).refresh(ids.case);f.setNow(END);await state(f).refresh(ids.case);
 const rows=f.receipts();assert.equal(rows.length,3);assert.equal(rows[0].canonical_payload_json,old);for(let i=1;i<3;i++)assert.equal(rows[i].previous_revision_hash,rows[i-1].payload_hash);
 assert.equal((await publicRead(f)).publicView.status,'expired');
 }finally{f.close();}
});
test('100 repeated refreshes create no extra clock audits or receipt revisions',async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.setNow(START);await state(f).refresh(ids.case);const audits=f.count('audit_events');
 for(let i=0;i<100;i++)assert.equal((await state(f).refresh(ids.case)).outcome,'unchanged');assert.equal(f.count('audit_events'),audits);assert.equal(f.receipts().length,2);
 }finally{f.close();}
});
test('eight competing workers cannot duplicate a transition or fork the receipt chain',async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.setNow(START);const results=await Promise.all(Array.from({length:8},()=>state(f).refresh(ids.case)));
 assert.ok(results.some(r=>r.outcome==='refreshed'));assert.equal(f.receipts().length,2);assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE aggregate_type='permission_clock'").get().n,1);
 assert.equal((await publicRead(f)).publicView.status,'active');
 }finally{f.close();}
});
for(const terminal of ['refunded','revoked'])test(`clock leaves ${terminal} financial/lifecycle state alone`,async()=>{
 const f=await temporalDatabase({state:terminal});try{const facts=protectedFacts(f),audits=f.count('audit_events');f.setNow('2027-06-01T00:00:00.000Z');
 assert.equal((await state(f).refresh(ids.case)).status,terminal);assert.equal(f.count('audit_events'),audits);assert.equal(protectedFacts(f),facts);assert.equal(f.receipts().length,1);
 }finally{f.close();}
});
const blocks=[['review flag',"UPDATE permissions SET review_required=1"],['pending provider work',"UPDATE paypal_reconciliation_outbox SET requested_generation=2"],['blocked provider work',"UPDATE paypal_reconciliation_outbox SET blocked_code='authorization_required'"],['active lease',"UPDATE paypal_reconciliation_outbox SET lease_token='busy'"],['missing paid evidence','DELETE FROM payment_evidence'],['wrong amount','UPDATE quotes SET amount_cents=42501'],['simulated invoice',"UPDATE invoice_bindings SET environment='simulated'"],['canceled invoice',"UPDATE invoice_bindings SET invoice_status='canceled'"],['canceled case',"UPDATE licensing_cases SET case_outcome='canceled'"],['stale consent',"UPDATE licensing_cases SET latest_quote_id=NULL"],['corrupt source terms',"UPDATE terms_versions SET max_impressions=1"],['missing audit anchor','DELETE FROM audit_events']];
for(const [label,sql] of blocks)test(`${label} cannot be hidden by a clock refresh`,async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.db.exec(sql);f.setNow(START);assert.equal((await state(f).refresh(ids.case)).outcome,'blocked');assert.equal(f.permission().permission_state,'scheduled');assert.equal(f.receipts().length,1);
 }finally{f.close();}
});
for(let step=0;step<4;step++)test(`failure at temporal write ${step+1} rolls back every transition effect`,async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.setNow(START);const before={permission:f.permission(),verification:f.verification(),audits:f.count('audit_events')};f.faults.at=step;f.faults.kind='clock';
 assert.equal((await state(f).refresh(ids.case)).outcome,'retry_pending');assert.deepEqual(f.permission(),before.permission);assert.deepEqual(f.verification(),before.verification);assert.equal(f.count('audit_events'),before.audits);assert.equal(f.receipts().length,1);
 f.faults.at=-1;assert.equal((await state(f).refresh(ids.case)).outcome,'refreshed');
 }finally{f.close();}
});
for(let step=0;step<3;step++)test(`receipt write ${step+1} failure leaves invalid verification and recovers without replaying time`,async()=>{
 const f=await temporalDatabase();try{f.setNow(activeEnd);f.faults.at=step;f.faults.kind='receipt';const r=await state(f).refresh(ids.case);assert.equal(r.outcome,'receipt_pending');assert.equal(f.permission().permission_state,'expired');assert.equal(f.verification().current_status,'invalid');
 assert.notEqual((await publicRead(f)).publicView.status,'active');assert.equal(f.receipts().length,1);f.faults.at=-1;
 const retry=await state(f).refresh(ids.case);assert.equal(retry.receiptReady,true);assert.equal(f.receipts().length,2);assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE aggregate_type='permission_clock'").get().n,1);
 }finally{f.close();}
});
for(const kind of ['clock','receipt'])test(`lost ${kind} acknowledgement does not duplicate state or receipt`,async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.setNow(START);f.faults.loseAck=true;f.faults.kind=kind;const r=await state(f).refresh(ids.case);assert.equal(r.receiptReady,true);assert.equal(f.receipts().length,2);assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE aggregate_type='permission_clock'").get().n,1);
 }finally{f.close();}
});
for(const [label,sql] of [['review',"UPDATE permissions SET review_required=1,row_version=row_version+1"],['new financial work',"UPDATE paypal_reconciliation_outbox SET requested_generation=2"],['revocation',"UPDATE permissions SET permission_state='revoked',row_version=row_version+1"],['consent',"UPDATE licensing_cases SET latest_creator_decision_id=NULL,row_version=row_version+1"]])test(`concurrent ${label} wins over a stale time transition`,async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.setNow(START);f.faults.beforeBatch=()=>f.db.exec(sql);const r=await state(f).refresh(ids.case);assert.notEqual(r.outcome,'refreshed');assert.equal(f.receipts().length,1);assert.notEqual(f.permission().permission_state,'active');
 }finally{f.close();}
});
test('file-backed restart resumes a pending expired receipt safely',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rr030-')),file=join(dir,'state.sqlite');let f=await temporalDatabase({file});
 try{f.setNow(activeEnd);f.faults.at=0;f.faults.kind='receipt';await state(f).refresh(ids.case);f.close();f=await temporalDatabase({file,initialize:false});f.setNow(activeEnd);
 assert.equal((await state(f).refresh(ids.case)).receiptReady,true);assert.equal(f.receipts().length,2);assert.equal((await publicRead(f)).publicView.status,'expired');
 }finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test('forward clock jump while hashing retries rather than publishing yesterday state',async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.setNow(START);let calls=0;const clock=()=>new Date(++calls===1?START:END);
 const r=await createPermissionClock(f.store,clock).refresh(ids.case);assert.equal(r.status,'expired');assert.equal(f.permission().permission_state,'expired');
 }finally{f.close();}
});
test('backward clock cannot revive an already expired permission',async()=>{
 const f=await temporalDatabase();try{f.setNow(activeEnd);await state(f).refresh(ids.case);f.setNow('2026-10-28T00:00:00.000Z');assert.equal((await state(f).refresh(ids.case)).outcome,'blocked');assert.equal(f.permission().permission_state,'expired');
 }finally{f.close();}
});
test('due selector skips future/terminal states and includes unfinished clock receipt',async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{assert.deepEqual(await f.store.listDue('2026-10-31T23:59:59.999Z',25),[]);assert.deepEqual(await f.store.listDue(START,25),[ids.case]);f.setNow(START);f.faults.at=0;f.faults.kind='receipt';await state(f).refresh(ids.case);
 assert.deepEqual(await f.store.listDue(START,25),[ids.case]);f.faults.at=-1;await state(f).refresh(ids.case);assert.deepEqual(await f.store.listDue(START,25),[]);
 }finally{f.close();}
});
test('server job requires both explicit flags, correct environment and a database',async()=>{
 const f=await temporalDatabase({state:'scheduled'});try{f.setNow(START);const env={APP_MODE:'sandbox',PAYPAL_MODE:'paypal_sandbox',RIGHTS_PERMISSION_CLOCK_ENABLED:'true',RIGHTS_RECEIPT_ISSUANCE_ENABLED:'true',DB:f.adapter};
 for(const change of [{RIGHTS_PERMISSION_CLOCK_ENABLED:undefined},{RIGHTS_PERMISSION_CLOCK_ENABLED:'1'},{RIGHTS_RECEIPT_ISSUANCE_ENABLED:'false'},{APP_MODE:'local'},{PAYPAL_MODE:'fake'},{DB:undefined}])assert.equal((await runPermissionClock({...env,...change},f.clock)).enabled,false);
 const r=await runPermissionClock(env,f.clock);assert.equal(r.enabled,true);assert.equal(r.examined,1);assert.equal(r.paymentOperations,0);
 }finally{f.close();}
});
test('batch limit and source identifiers are checked before work',async()=>{
 const f=await temporalDatabase();try{for(const n of [0,-1,101,1.5,NaN])await assert.rejects(runPermissionClockBatch(f.store,f.clock,n));assert.equal((await state(f).refresh('not-a-case')).outcome,'blocked');
 }finally{f.close();}
});
test('public and protected warnings share the same exact deadline without new receipt hashes',async()=>{
 const f=await temporalDatabase();try{f.setNow('2027-01-19T00:00:00.000Z');const first=f.receipts()[0].payload_hash;const r=await publicRead(f);assert.equal(r.publicView.receipt.timing.notice,'expires_soon');
 for(const html of [renderPublicVerification(r.publicView),renderPrivateReceipt(r.payload,r.publicView,'https://rightsreceipt.example/verify/receipt/'+publicId)]){assert.ok(html.includes('Expires soon'));assert.ok(html.includes(activeEnd));assert.ok(html.includes('Licensing time status'));}
 f.setNow('2027-01-24T23:00:00.000Z');const later=await publicRead(f);assert.equal(later.publicView.receipt.timing.notice,'last_day');assert.equal(later.record.hash,first);assert.equal(f.receipts().length,1);
 }finally{f.close();}
});
test('no GET writes or expiry warning exposes private financial data',async()=>{
 const f=await temporalDatabase();try{f.setNow('2027-01-24T23:00:00.000Z');const before=f.count('audit_events'),r=await publicRead(f);const body=JSON.stringify(r.publicView);
 for(const secret of ['42500','Private Buyer',ids.case,ids.permission,'INV2-PRIVATE','audit_anchor'])assert.ok(!body.includes(secret));assert.equal(f.count('audit_events'),before);
 }finally{f.close();}
});
test('clock and receipt publication do not call a network or payment API',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('NETWORK NOT ALLOWED');};const f=await temporalDatabase({state:'scheduled'});
 try{const facts=protectedFacts(f);f.setNow(START);assert.equal((await state(f).refresh(ids.case)).receiptReady,true);assert.equal(protectedFacts(f),facts);}finally{f.close();globalThis.fetch=old;}
});
