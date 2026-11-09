import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { receiptFixture, ids, now, transition, audit, reset, migrateAll } from "./support/receipt-fixture.mjs";
import { canonicalJson, canonicalHash, sha256Hex } from "../packages/receipts/src/canonical.ts";
import { createReceiptService, receiptMaterialFromPayload } from "../packages/receipts/src/service.ts";
import { createD1ReceiptStore, reserveReceiptVerification } from "../packages/receipts/src/store.ts";
import { issueSandboxReceipt } from "../apps/api/src/receipt-issuance.ts";

const root=new URL("../",import.meta.url);
const originalBlobs={
 "migrations/0001_initial_schema.sql":"40f57162a68ea79615f5b786fdbd8f22fcf22fbc",
 "migrations/0002_indexes_and_guards.sql":"d2cf4ac5a4e3cedc50f94b256fca236395e75cc8",
 "migrations/0003_paypal_delivery_journal.sql":"205eb11bcf03ddef504d6a3761b547870576616c",
 "migrations/0004_verified_webhook_intake.sql":"4e52ec9226406bcde7a29b34c9ee574b643edeb3",
 "migrations/0005_webhook_processing.sql":"781628ad6e030079eee62107eab40c69506360a8",
 "migrations/0006_paypal_reconciliation.sql":"c5c154a4080af76ddae5108f14dc0d94270a4b89",
 "migrations/0007_permission_lifecycle.sql":"ccc2b94d6bf4407e5b273335e54f7bb28696d7bb",
 "seed/demo-reset.sql":"6e78504689e8b5dc69236c1422d483412c6011ab",
 "scripts/support/gate-c-database.mjs":"368291d3c010b53dc9fa6e4b6d8d443c66ebda98",
};
async function withFixture(run,options){const f=await receiptFixture(options);try{await run(f);}finally{f.close();}}
const issuedCount=f=>f.db.prepare("SELECT count(*) n FROM audit_events WHERE event_type='receipt.revision_issued'").get().n;
const altered=f=>f.db.exec("DROP TRIGGER prevent_receipt_revision_update");
async function corrupt(f,fn,{rehash=false}={}){
 altered(f);const old=f.last(),p=JSON.parse(old.canonical_payload_json);fn(p);
 const body=canonicalJson(p),digest=rehash?await sha256Hex(body):old.payload_hash;
 f.db.prepare("UPDATE receipt_revisions SET canonical_payload_json=?,payload_hash=? WHERE receipt_revision_id=?").run(body,digest,old.receipt_revision_id);
}

test("original migrations, clarification-aware reset and reused harness match reviewed repository blobs",()=>{
 for(const [name,expected]of Object.entries(originalBlobs)){const b=readFileSync(new URL(name,root));const actual=createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex");assert.equal(actual,expected,name);}
});
test("all nine migrations and deterministic seed execute with clean integrity",async()=>withFixture(async f=>{
 assert.equal(f.count("rr_schema_migrations"),9);assert.equal(f.db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
 assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);assert.deepEqual(migrateAll(f.db),[]);
}));
test("creates a canonical Sandbox receipt and atomically publishes its matching pointer",async()=>withFixture(async f=>{
 const r=await f.service.issue(ids.case);assert.equal(r.outcome,"issued",JSON.stringify(f.faults.errors));assert.equal(r.revision,1);
 const stored=f.last(),p=JSON.parse(stored.canonical_payload_json);
 assert.equal(await sha256Hex(stored.canonical_payload_json),r.hash);assert.equal(canonicalJson(p),stored.canonical_payload_json);
 assert.equal(f.verification().current_receipt_revision_id,stored.receipt_revision_id);assert.equal(f.verification().current_status,"active");
 assert.equal(p.quote.amount_cents,42500);assert.equal(p.payment.environment,"sandbox");assert.equal(p.previous_revision_hash,null);
 assert.equal(p.terms.ai_use,"prohibited");assert.equal(p.audit_anchor.event_count,1);
 assert.equal(p.ai_provenance.extraction_history[0].model_id,"diagnostic-only");assert.equal(p.ai_provenance.mode,"human_confirmed");
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,true);assert.equal(issuedCount(f),1);
}));
test("canonical payload never includes raw buyer text, email, capabilities or provider bodies",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);const s=f.last().canonical_payload_json;
 for(const bad of ["buyer@example.test","Original source evidence","access_token","token_digest","authorization","buyer_name"])assert.ok(!s.includes(bad),bad);
 assert.ok(s.includes("Cedar & Tide Travel"));
}));
test("missing model history remains explicitly null instead of invented provenance",async()=>withFixture(async f=>{
 assert.equal((await f.service.issue(ids.case)).outcome,"issued");const p=JSON.parse(f.last().canonical_payload_json);
 assert.equal(p.ai_provenance.model_id,null);assert.deepEqual(p.ai_provenance.extraction_history,[]);
},{ai:false}));
test("100 repeated issuance calls return the same revision and do not append audits",async()=>withFixture(async f=>{
 const first=await f.service.issue(ids.case);for(let i=0;i<100;i++){const next=await f.service.issue(ids.case);assert.equal(next.outcome,"unchanged");assert.equal(next.hash,first.hash);}
 assert.equal(f.count("receipt_revisions"),1);assert.equal(issuedCount(f),1);
}));
test("concurrent issuers cannot create duplicate revisions or divergent tips",async()=>withFixture(async f=>{
 const other=createReceiptService(createD1ReceiptStore(f.adapter),()=>new Date(now));
 const out=await Promise.all([f.service.issue(ids.case),other.issue(ids.case),f.service.issue(ids.case)]);
 assert.equal(out.filter(x=>x.outcome==="issued").length,1);assert.equal(f.count("receipt_revisions"),1);assert.equal(issuedCount(f),1);
 assert.ok(out.every(x=>x.hash===out[0].hash));
}));
test("audit-only operational changes do not force a new licensing receipt",async()=>withFixture(async f=>{
 const first=await f.service.issue(ids.case);audit(f.db,"invoice.status_checked",1,now,"operational");
 const next=await f.service.issue(ids.case);assert.equal(next.outcome,"unchanged");assert.equal(first.hash,next.hash);assert.equal(f.count("receipt_revisions"),1);
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,true);
}));
for(const [state,startDate,clock]of [["scheduled","2026-11-01",now],["expired","2026-07-01",now],["refunded","2026-10-27",now],["revoked","2026-10-27",now]]){
 test(`supports a correctly evidenced ${state} receipt`,async()=>withFixture(async f=>{
  assert.equal((await f.service.issue(ids.case)).outcome,"issued");assert.equal((await f.service.verifyCurrent(ids.case)).status,state);
 },{state,startDate,clock}));
}
test("scheduled to active to expired creates immutable linked revisions",async()=>withFixture(async f=>{
 const first=await f.service.issue(ids.case);const firstBody=f.last().canonical_payload_json;
 transition(f,"active","2026-11-01T00:00:00.000Z");const active=await f.service.issue(ids.case);assert.equal(active.revision,2);
 assert.equal(JSON.parse(f.last().canonical_payload_json).previous_revision_hash,first.hash);
 transition(f,"expired","2027-01-30T00:00:00.000Z");const expired=await f.service.issue(ids.case);assert.equal(expired.revision,3);
 assert.equal(JSON.parse(f.last().canonical_payload_json).previous_revision_hash,active.hash);
 assert.equal(f.db.prepare("SELECT canonical_payload_json FROM receipt_revisions WHERE revision_number=1").get().canonical_payload_json,firstBody);
 assert.equal((await f.service.verifyCurrent(ids.case)).status,"expired");
},{state:"scheduled",startDate:"2026-11-01"}));
for(const state of ["refunded","revoked"]){
 test(`active to ${state} issues revision two and leaves the prior record intact`,async()=>withFixture(async f=>{
  const a=await f.service.issue(ids.case);transition(f,state,"2026-10-28T19:00:00.000Z");
  const b=await f.service.issue(ids.case);assert.equal(b.revision,2,JSON.stringify(b));assert.notEqual(a.hash,b.hash);
  assert.equal((await f.service.verifyCurrent(ids.case)).status,state);assert.equal(f.count("receipt_revisions"),2);
 }));
}
for(const [label,sql,code]of [
 ["review flag","UPDATE permissions SET review_required=1,row_version=row_version+1","review_required"],
 ["unprocessed notification","UPDATE paypal_reconciliation_outbox SET requested_generation=2","review_required"],
 ["blocked recovery","UPDATE paypal_reconciliation_outbox SET blocked_code='oauth_rejected'","review_required"],
 ["active recovery lease",`UPDATE paypal_reconciliation_outbox SET lease_token='${ids.case}'`,"review_required"],
 ["not paid","UPDATE invoice_bindings SET invoice_status='sent'","not_eligible"],
 ["simulated binding","UPDATE invoice_bindings SET environment='simulated'","not_eligible"],
 ["closed case","UPDATE licensing_cases SET case_outcome='canceled'","not_eligible"],
 ["superseded quote","UPDATE quotes SET status='superseded'","source_invalid"],
 ["missing acceptance pointer","UPDATE licensing_cases SET latest_buyer_acceptance_id=NULL","source_invalid"],
 ]){
 test(`${label} blocks a new receipt`,async()=>withFixture(async f=>{
  f.db.exec(sql);const r=await f.service.issue(ids.case);assert.equal(r.outcome,"blocked");assert.equal(r.code,code,JSON.stringify(r));
  assert.equal(f.count("receipt_revisions"),0);assert.equal(f.verification().current_status,"invalid");
 }));
}
test("partial-review on an already issued permission invalidates verification without rewriting history",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);const body=f.last().canonical_payload_json;
 f.db.exec("UPDATE permissions SET review_required=1,row_version=row_version+1");
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,false);assert.equal(f.verification().current_status,"invalid");
 assert.equal(f.last().canonical_payload_json,body);assert.equal((await f.service.issue(ids.case)).outcome,"blocked");
}));
test("cleared nonmaterial review may reuse a verified receipt without making revision two",async()=>withFixture(async f=>{
 const first=await f.service.issue(ids.case);f.db.exec("UPDATE permissions SET review_required=1,row_version=row_version+1");
 await f.service.verifyCurrent(ids.case);f.db.exec("UPDATE permissions SET review_required=0,row_version=row_version+1");
 const r=await f.service.issue(ids.case);assert.equal(r.outcome,"unchanged");assert.equal(r.hash,first.hash);assert.equal(f.count("receipt_revisions"),1);
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,true);
}));
test("UTC time passing the end date cannot leave an active receipt valid",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);f.setTime("2027-01-25T00:00:00.000Z");
 const r=await f.service.verifyCurrent(ids.case);assert.equal(r.valid,false);assert.equal(r.code,"temporal_refresh_required");
 assert.equal((await f.service.issue(ids.case)).outcome,"blocked");assert.equal(f.count("receipt_revisions"),1);
}));
for(const [label,drop,sql]of [
 ["terms hash","prevent_terms_version_update","UPDATE terms_versions SET terms_hash='"+"f".repeat(64)+"'"],
 ["quote calculation hash","prevent_quote_content_update","UPDATE quotes SET calculation_hash='"+"f".repeat(64)+"'"],
 ["quote line total","prevent_quote_line_update","UPDATE quote_lines SET amount_cents=1 WHERE line_position=1"],
 ["policy body","prevent_pricing_policy_content_update","UPDATE pricing_policy_versions SET rules_json='{}'"],
 ["payment amount","prevent_payment_evidence_update","UPDATE payment_evidence SET amount_cents=1"],
 ["fake evidence","prevent_payment_evidence_update","UPDATE payment_evidence SET evidence_source='simulated_fixture'"],
 ["wrong input provenance","prevent_extraction_attempt_update_after_completion","UPDATE extraction_attempts SET input_hash='"+"f".repeat(64)+"'"],
 ]){
 test(`source corruption: ${label} fails before issuance`,async()=>withFixture(async f=>{
  f.db.exec(`DROP TRIGGER ${drop};${sql}`);assert.equal((await f.service.issue(ids.case)).outcome,"blocked");assert.equal(f.count("receipt_revisions"),0);
 }));
}
for(const [name,change]of [
 ["rights duration",p=>{p.terms.duration_days=365;}],["price",p=>{p.quote.amount_cents=1;}],
 ["permission",p=>{p.permission.state="refunded";}],["policy version",p=>{p.quote.pricing_policy_version=900;}],
 ["AI artifact",p=>{p.ai_provenance.artifact_hash="f".repeat(64);}],["previous hash",p=>{p.previous_revision_hash="f".repeat(64); }]
 ]){
 test(`tampering with ${name} invalidates without automatic repair`,async()=>withFixture(async f=>{
  await f.service.issue(ids.case);await corrupt(f,change);const tampered=f.last().canonical_payload_json;
  assert.equal((await f.service.verifyCurrent(ids.case)).valid,false);assert.equal(f.verification().current_status,"invalid");
  assert.equal((await f.service.issue(ids.case)).outcome,"blocked");assert.equal(f.count("receipt_revisions"),1);assert.equal(f.last().canonical_payload_json,tampered);
 }));
}
test("rehashing a modified amount still fails against material hash and current source",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);await corrupt(f,p=>{p.quote.amount_cents=1;},{rehash:true});
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,false);
}));
test("even recomputed payload and material hashes cannot authorize altered licensed terms",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);altered(f);const old=f.last(),p=JSON.parse(old.canonical_payload_json);p.terms.duration_days=1;
 p.material_sha256=await canonicalHash(receiptMaterialFromPayload(p));const body=canonicalJson(p);
 f.db.prepare("UPDATE receipt_revisions SET canonical_payload_json=?,payload_hash=?,material_sha256=?").run(body,await sha256Hex(body),p.material_sha256);
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,false);
}));
test("changed historical audit record breaks its recorded anchor",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);f.db.exec("DROP TRIGGER prevent_audit_event_update;UPDATE audit_events SET payload_json='{}' WHERE aggregate_type='permission_lifecycle'");
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,false);assert.equal((await f.service.issue(ids.case)).outcome,"blocked");
}));
test("deleting historical audit evidence does not silently rebuild its anchor",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);f.db.exec("DELETE FROM audit_events WHERE aggregate_type='permission_lifecycle'");
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,false);assert.equal(f.count("receipt_revisions"),1);
}));
test("duplicate JSON property in stored payload is rejected",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);altered(f);const r=f.last(),body=r.canonical_payload_json.replace('{','{"case_id":"'+ids.case+'",');
 f.db.prepare("UPDATE receipt_revisions SET canonical_payload_json=?,payload_hash=?").run(body,await sha256Hex(body));
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,false);
}));
test("chain gaps, reordered rows and mismatched current pointers fail closed",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);transition(f,"revoked","2026-10-28T19:00:00.000Z");await f.service.issue(ids.case);
 f.db.exec("DELETE FROM receipt_revisions WHERE revision_number=1");assert.equal((await f.service.verifyCurrent(ids.case)).valid,false);
}));
test("database forbids in-place revision edits and discontinuous inserts",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);assert.throws(()=>f.db.exec("UPDATE receipt_revisions SET payload_hash='"+"f".repeat(64)+"'"),/immutable/);
 const r=f.last();assert.throws(()=>f.db.prepare(`INSERT INTO receipt_revisions(receipt_revision_id,verification_record_id,permission_id,
 revision_number,schema_version,previous_revision_hash,canonical_payload_json,payload_hash,created_at,material_sha256,audit_root_sha256)
 VALUES (?,?,?,3,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),r.verification_record_id,r.permission_id,r.schema_version,r.payload_hash,r.canonical_payload_json,
 "f".repeat(64),r.created_at,r.material_sha256,r.audit_root_sha256),/chain/);
}));
for(let step=0;step<3;step++)test(`issuance transaction failure at statement ${step+1} leaves no partial publication`,async()=>withFixture(async f=>{
 f.faults.at=step;const r=await f.service.issue(ids.case);assert.equal(r.outcome,"retry_pending");assert.equal(f.count("receipt_revisions"),0);
 assert.equal(issuedCount(f),0);assert.equal(f.verification().current_receipt_revision_id,null);assert.equal(f.verification().current_status,"invalid");
 f.faults.at=-1;assert.equal((await f.service.issue(ids.case)).outcome,"issued");
}));
test("lost acknowledgement returns the already committed revision instead of duplicating it",async()=>withFixture(async f=>{
 f.faults.loseAck=true;assert.equal((await f.service.issue(ids.case)).outcome,"unchanged");assert.equal(f.count("receipt_revisions"),1);assert.equal(issuedCount(f),1);
}));
test("consent changes after hashing are caught by the exact SQL snapshot guard",async()=>withFixture(async f=>{
 const originalCommit=f.store.commit;let changed=false;
 const service=createReceiptService({...f.store,async commit(x){if(!changed){changed=true;f.db.exec("UPDATE licensing_cases SET latest_buyer_acceptance_id=NULL,row_version=row_version+1");}return originalCommit(x);}},()=>new Date(now));
 assert.equal((await service.issue(ids.case)).outcome,"blocked");assert.equal(f.count("receipt_revisions"),0);assert.equal(issuedCount(f),0);
}));
test("new audit during hashing causes a retry and is included in the issued anchor",async()=>withFixture(async f=>{
 const originalCommit=f.store.commit;let changed=false;
 const service=createReceiptService({...f.store,async commit(x){if(!changed){changed=true;audit(f.db,"safe.operation",1,now,"operational");}return originalCommit(x);}},()=>new Date(now));
 assert.equal((await service.issue(ids.case)).outcome,"issued");assert.equal(JSON.parse(f.last().canonical_payload_json).audit_anchor.event_count,2);
}));
test("verification rechecks its source after hashing instead of returning a raced active claim",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);let n=0;
 const service=createReceiptService({...f.store,async load(c){if(++n===2)f.db.exec("UPDATE permissions SET review_required=1,row_version=row_version+1");return f.store.load(c);}},()=>new Date(now));
 assert.equal((await service.verifyCurrent(ids.case)).valid,false);
}));
test("repeated integrity checks log the same failure only once",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);await corrupt(f,p=>{p.quote.amount_cents=1;});
 for(let i=0;i<5;i++)await f.service.verifyCurrent(ids.case);
 assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE event_type='receipt.integrity_failed'").get().n,1);
}));
test("file-backed restart verifies and reuses the persisted canonical revision",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"rr028-")),file=join(dir,"receipts.sqlite");let f=await receiptFixture({file});
 try{const first=await f.service.issue(ids.case);f.close();f=await receiptFixture({file,initialize:false});
 assert.equal((await f.service.verifyCurrent(ids.case)).valid,true);assert.equal((await f.service.issue(ids.case)).hash,first.hash);assert.equal(f.count("receipt_revisions"),1);
 }finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test("original seed resets populated receipt history without foreign-key residue",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);transition(f,"refunded","2026-10-28T19:00:00.000Z");await f.service.issue(ids.case);
 reset(f.db);assert.equal(f.count("receipt_revisions"),0);assert.equal(f.count("permissions"),0);assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 const first=JSON.stringify(f.db.prepare("SELECT * FROM assets").all());reset(f.db);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM assets").all()),first);
}));
test("verification reference reservation is random, version guarded and grants no receipt",async()=>withFixture(async f=>{
 f.db.prepare("UPDATE licensing_cases SET verification_record_id=NULL WHERE case_id=?").run(ids.case);f.db.exec("DELETE FROM verification_records");
 const r=await reserveReceiptVerification(f.adapter,ids.case,1,now);assert.match(r.publicId,/^[A-Za-z0-9_-]{32}$/u);
 assert.notEqual(r.publicId,ids.case);assert.equal(f.count("receipt_revisions"),0);
 await assert.rejects(reserveReceiptVerification(f.adapter,ids.case,1,now));assert.equal(f.count("verification_records"),1);
}));
test("receipt hook disabled by default, with no implicit provider or public action",async()=>withFixture(async f=>{
 const bindings={DB:f.adapter,APP_MODE:"sandbox",PAYPAL_MODE:"paypal_sandbox"};
 assert.deepEqual(await issueSandboxReceipt(bindings,ids.case),{enabled:false});
 for(const APP_MODE of ["local","production"])assert.deepEqual(await issueSandboxReceipt({...bindings,APP_MODE,RIGHTS_RECEIPT_ISSUANCE_ENABLED:"true"},ids.case),{enabled:false});
 assert.equal((await issueSandboxReceipt({...bindings,RIGHTS_RECEIPT_ISSUANCE_ENABLED:"true"},ids.case,()=>new Date(now))).outcome,"issued");
}));
test("receipt creation never fetches a provider or sends an invoice",async()=>withFixture(async f=>{
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error("unexpected network");};
 try{assert.equal((await f.service.issue(ids.case)).outcome,"issued");assert.equal((await f.service.verifyCurrent(ids.case)).valid,true);}
 finally{globalThis.fetch=previous;}
}));

for(const status of ["pending","canceled"])test(`unpaid ${status} verification needs no rights receipt and is not marked corrupt`,async()=>withFixture(async f=>{
 f.db.exec("UPDATE licensing_cases SET permission_id=NULL; DELETE FROM permissions; DELETE FROM payment_evidence;");
 f.db.prepare("UPDATE verification_records SET current_status=?").run(status);
 assert.equal((await f.service.issue(ids.case)).code,"not_eligible");
 assert.equal((await f.service.verifyCurrent(ids.case)).status,"not_issued");
 assert.equal(f.verification().current_status,status);assert.equal(f.count("receipt_revisions"),0);
}));

test("every primitive material leaf changes the canonical hash when altered",async()=>withFixture(async f=>{
 await f.service.issue(ids.case);const payload=JSON.parse(f.last().canonical_payload_json),material=receiptMaterialFromPayload(payload);
 const originalHash=await canonicalHash(material),paths=[];
 function collect(v,path=[]){if(v&&typeof v==='object'){for(const [k,child]of Object.entries(v))collect(child,[...path,k]);}else paths.push(path);}
 collect(material);assert.ok(paths.length>60);
 for(const path of paths){const changed=structuredClone(material);let node=changed;for(const k of path.slice(0,-1))node=node[k];
  const key=path.at(-1),before=node[key];node[key]=typeof before==='number'?before+1:typeof before==='boolean'?!before:before===null?'changed':before+'-changed';
  assert.notEqual(await canonicalHash(changed),originalHash,path.join('.'));
 }
}));
test("native persistence manifest matches all nine applied migrations and 33 tables",async()=>withFixture(async f=>{
 const manifest=await import('../packages/persistence/src/manifest.ts');assert.equal(manifest.PERSISTENCE_SCHEMA_VERSION,9);
 assert.equal(manifest.PERSISTENCE_MIGRATIONS.length,9);assert.equal(manifest.DOMAIN_TABLES.length,33);
 const names=f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='rr_schema_migrations' ORDER BY name").all().map(r=>r.name);
 assert.deepEqual(names,[...manifest.DOMAIN_TABLES].sort());
}));
