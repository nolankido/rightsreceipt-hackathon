import assert from "node:assert/strict";
import { test } from "node:test";
import { consentFixture, ids } from "./support/human-consent-fixture.mjs";

test("canonical creator approval and buyer acceptance survive reload and prepare the exact $425 invoice",async()=>{
 const f=consentFixture();try{
  const view=await f.service.reviewCreator(ids.case);assert.equal(view.amountCents,42500);assert.equal(Object.keys(view.rights).length,12);
  const a=await f.approve();assert.equal(a.outcome,"recorded");
  const b=await f.accept();assert.equal(b.outcome,"recorded");
  assert.equal(f.count("creator_decisions"),1);assert.equal(f.count("buyer_acceptances"),1);assert.equal(f.count("audit_events"),2);
  const prepared=await f.service.prepareInvoice(ids.case);assert.equal(prepared.amountCents,42500);assert.equal(prepared.recipientEmail,"buyer@example.test");
  assert.deepEqual(prepared,await f.service.prepareInvoice(ids.case));assert.equal(JSON.parse(prepared.rightsSummary).ai_use,"prohibited");
  assert.ok(Object.values(f.protected()).every(n=>n===0));assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length,0);
 }finally{f.close();}
});

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHumanConsentService } from "../packages/application/src/human-consent.ts";
import { createHumanConsentRoutes } from "../apps/api/src/human-consent-routes.ts";
import { insert, NOW } from "./support/human-consent-fixture.mjs";
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code);
const noMoney=f=>assert.ok(Object.values(f.protected()).every(n=>n===0));
const expectedMigrations=["40f57162a68ea79615f5b786fdbd8f22fcf22fbc","d2cf4ac5a4e3cedc50f94b256fca236395e75cc8",
 "205eb11bcf03ddef504d6a3761b547870576616c","4e52ec9226406bcde7a29b34c9ee574b643edeb3","781628ad6e030079eee62107eab40c69506360a8",
 "c5c154a4080af76ddae5108f14dc0d94270a4b89","ccc2b94d6bf4407e5b273335e54f7bb28696d7bb","e2b974e4c91ea17da12b62aee362ae2fff541635"];
test("all eight original migrations stay unchanged and the full 33-table schema is exercised",()=>{
 const f=consentFixture();try{assert.deepEqual(f.migrationHashes.slice(0,8).map(x=>x.gitSha),expectedMigrations);
 assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n,33);
 assert.equal(f.db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");}finally{f.close();}
});
test("invoice preparation needs explicit canonical consent, not source text or a mock record",async()=>{
 const f=consentFixture();try{await rejects(f.service.prepareInvoice(ids.case),"approval_required");await f.approve();
 await rejects(f.service.prepareInvoice(ids.case),"approval_required");assert.equal(f.count("buyer_acceptances"),0);noMoney(f);}finally{f.close();}
});
for(const [label,change] of [["unchecked approval",{confirmed:false}],["wrong copy",{copyVersion:"old"}],
 ["extra price",{amountCents:1}],["browser actor",{actorReference:"creator"}],["paid claim",{paid:true}],
 ["unsafe request key",{requestId:"secret-token"}],["noninteger revision",{expectedCaseVersion:2.1}],
 ["invalid hash",{reviewHash:"g".repeat(64)}],["unknown decision",{decision:"paid"}],["blank rejection",{decision:"rejected",reason:null}]]) {
 test(`creator command rejects ${label} with no writes`,async()=>{const f=consentFixture();try{
 const c=await f.creatorCommand();await rejects(f.service.decideCreator(ids.case,{...c,...change}),"invalid_command");
 assert.equal(f.count("creator_decisions"),0);assert.equal(f.count("audit_events"),0);noMoney(f);}finally{f.close();}});
}
for(const [label,change] of [["unchecked acceptance",{acknowledged:false}],["wrong copy",{copyVersion:"old"}],
 ["browser amount",{amountCents:1}],["browser actor",{role:"creator"}],["missing approval ID",{creatorDecisionId:null}]]) {
 test(`buyer command rejects ${label}`,async()=>{const f=consentFixture();try{await f.approve();const c=await f.buyerCommand();
 await rejects(f.service.acceptBuyer(f.token,{...c,...change}),"invalid_command");assert.equal(f.count("buyer_acceptances"),0);noMoney(f);}finally{f.close();}});
}
for(const [label,change] of [["revoked",()=>({revoked_at:NOW})],["expired",()=>({expires_at:NOW})],
 ["not yet issued",()=>({issued_at:"2026-10-28T19:00:00.000Z"})],["receipt-only scope",()=>({allowed_actions_json:'["receipt"]'})],
 ["malformed scope",()=>({allowed_actions_json:'{"review":true}'})],["duplicate scope",()=>({allowed_actions_json:'["review","review"]'})]]){
 test(`buyer capability ${label} is denied before consent changes`,async()=>{const f=consentFixture();try{await f.approve();const c=await f.buyerCommand(),values=change();
 f.db.prepare(`UPDATE buyer_capabilities SET ${Object.keys(values).map(k=>`${k}=?`).join(",")}`).run(...Object.values(values));
 await rejects(f.service.acceptBuyer(f.token,c),"not_authorized");await rejects(f.service.reviewBuyer(f.token),"not_authorized");
 assert.equal(f.count("buyer_acceptances"),0);}finally{f.close();}});
}
test("the public verification reference and an unknown token cannot authorize acceptance",async()=>{
 const f=consentFixture();try{for(const token of ["CONSENT_TEST_NOT_A_CAPABILITY","x".repeat(43),"",123])await rejects(f.service.reviewBuyer(token),"not_authorized");}finally{f.close();}
});
for(const principal of [null,true,{workspaceId:"99999999-0000-4000-8000-000000000001",actorReference:"other"},
 {workspaceId:ids.workspace,actorReference:"person@example.test"}]){
 test(`untrusted/wrong-workspace creator principal ${JSON.stringify(principal)} cannot read or approve`,async()=>{
 const f=consentFixture();try{const c=await f.creatorCommand();f.setOwner(principal);await rejects(f.service.reviewCreator(ids.case),"not_authorized");
 await rejects(f.service.decideCreator(ids.case,c),"not_authorized");assert.equal(f.count("audit_events"),0);}finally{f.close();}});
}
test("creator authority is checked again after async verification",async()=>{
 const f=consentFixture();try{const c=await f.creatorCommand();let n=0;f.onAuth(()=>{if(++n===3)f.setOwner(null);});
 await rejects(f.service.decideCreator(ids.case,c),"not_authorized");assert.equal(f.count("audit_events"),0);}finally{f.close();}
});
test("100 identical retries produce one decision, one acceptance and two audits",async()=>{
 const f=consentFixture();try{const c=await f.creatorCommand(),first=await f.service.decideCreator(ids.case,c);
 for(let i=0;i<100;i++)assert.equal((await f.service.decideCreator(ids.case,c)).resultId,first.resultId);
 const b=await f.buyerCommand(),accepted=await f.service.acceptBuyer(f.token,b);
 for(let i=0;i<100;i++)assert.equal((await f.service.acceptBuyer(f.token,b)).resultId,accepted.resultId);
 assert.equal(f.count("audit_events"),2);assert.equal(f.count("creator_decisions"),1);assert.equal(f.count("buyer_acceptances"),1);noMoney(f);}finally{f.close();}
});
test("reusing an idempotency key with a different decision is rejected",async()=>{
 const f=consentFixture();try{const c=await f.creatorCommand();await f.service.decideCreator(ids.case,c);
 await rejects(f.service.decideCreator(ids.case,{...c,decision:"rejected",reason:"Changed"}),"idempotency_conflict");assert.equal(f.count("audit_events"),1);}finally{f.close();}
});
test("eight concurrent same-command issuers commit exactly once",async()=>{
 const f=consentFixture();try{const c=await f.creatorCommand();const results=await Promise.all(Array.from({length:8},()=>f.service.decideCreator(ids.case,c)));
 assert.equal(results.filter(r=>r.outcome==="recorded").length,1);assert.equal(new Set(results.map(r=>r.resultId)).size,1);
 const b=await f.buyerCommand();const accepted=await Promise.all(Array.from({length:8},()=>f.service.acceptBuyer(f.token,b)));
 assert.equal(accepted.filter(r=>r.outcome==="recorded").length,1);assert.equal(f.count("audit_events"),2);}finally{f.close();}
});
test("different concurrent decisions cannot both overwrite the same displayed revision",async()=>{
 const f=consentFixture();try{const a=await f.creatorCommand(),b={...a,requestId:crypto.randomUUID(),decision:"rejected",reason:"No"};
 const r=await Promise.allSettled([f.service.decideCreator(ids.case,a),f.service.decideCreator(ids.case,b)]);
 assert.equal(r.filter(x=>x.status==="fulfilled").length,1);assert.equal(f.count("creator_decisions"),1);assert.equal(f.count("audit_events"),1);}finally{f.close();}
});
for(const role of ["creator","buyer"])for(let step=0;step<(role==="creator"?4:3);step++){
 test(`${role} transaction rollback at statement ${step+1} leaves no partial consent`,async()=>{
 const f=consentFixture();try{if(role==="buyer")await f.approve();const c=await(role==="creator"?f.creatorCommand():f.buyerCommand());
 const before=f.case(),audits=f.count("audit_events");f.faults.at=step;
 await rejects(role==="creator"?f.service.decideCreator(ids.case,c):f.service.acceptBuyer(f.token,c),"storage_unavailable");
 assert.deepEqual(f.case(),before);assert.equal(f.count("audit_events"),audits);
 assert.equal(f.count(role==="creator"?"creator_decisions":"buyer_acceptances"),0);
 f.faults.at=-1;assert.equal((await(role==="creator"?f.service.decideCreator(ids.case,c):f.service.acceptBuyer(f.token,c))).outcome,"recorded");noMoney(f);
 }finally{f.close();}});
}
for(const role of ["creator","buyer"])test(`${role} lost commit acknowledgement reloads the durable result`,async()=>{
 const f=consentFixture();try{if(role==="buyer")await f.approve();const c=await(role==="creator"?f.creatorCommand():f.buyerCommand());f.faults.loseAck=true;
 const result=await(role==="creator"?f.service.decideCreator(ids.case,c):f.service.acceptBuyer(f.token,c));
 assert.equal(result.outcome,"replayed");assert.equal(f.count(role==="creator"?"creator_decisions":"buyer_acceptances"),1);}finally{f.close();}
});
test("file restart retains acceptance and idempotency evidence",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"rr-consent-")),file=join(dir,"state.sqlite");let f=consentFixture({file});
 try{await f.approve();const b=await f.buyerCommand(),first=await f.service.acceptBuyer(f.token,b),token=f.token;f.close();f=consentFixture({file,initialize:false,token});
 assert.equal((await f.service.acceptBuyer(token,b)).resultId,first.resultId);assert.equal((await f.service.prepareInvoice(ids.case)).amountCents,42500);
 assert.equal(f.count("audit_events"),2);}finally{f.close();rmSync(dir,{recursive:true,force:true});}
});
test("revoking the capability just before SQL commit prevents acceptance",async()=>{
 const f=consentFixture();try{await f.approve();const b=await f.buyerCommand();f.faults.beforeBatch=()=>f.db.prepare("UPDATE buyer_capabilities SET revoked_at=?").run(NOW);
 await rejects(f.service.acceptBuyer(f.token,b),"not_authorized");assert.equal(f.count("buyer_acceptances"),0);assert.equal(f.count("audit_events"),1);}finally{f.close();}
});
test("expiry during verification cannot grant consent",async()=>{
 const f=consentFixture();try{await f.approve();const b=await f.buyerCommand();let calls=0;
 const svc=createHumanConsentService({store:f.store,now:()=>new Date(++calls<3?NOW:"2026-10-29T19:00:00.000Z")});
 await rejects(svc.acceptBuyer(f.token,b),"not_authorized");assert.equal(f.count("buyer_acceptances"),0);}finally{f.close();}
});
test("changed quote or rights reject the old displayed review",async()=>{
 const f=consentFixture();try{const old=await f.creatorCommand();f.version({duration:30});
 await rejects(f.service.decideCreator(ids.case,old),"stale_revision");assert.equal(f.count("creator_decisions"),0);}finally{f.close();}
});
test("acceptance cannot use another creator decision ID or another quote ID",async()=>{
 const f=consentFixture();try{await f.approve();const b=await f.buyerCommand();
 await rejects(f.service.acceptBuyer(f.token,{...b,creatorDecisionId:crypto.randomUUID()}),"approval_required");
 await rejects(f.service.acceptBuyer(f.token,{...b,quoteId:crypto.randomUUID()}),"stale_revision");assert.equal(f.count("buyer_acceptances"),0);}finally{f.close();}
});
test("creator can withdraw an unaccepted approval; the old buyer review cannot accept it",async()=>{
 const f=consentFixture();try{await f.approve();const buyer=await f.buyerCommand();
 await f.service.decideCreator(ids.case,await f.creatorCommand("rejected","Use declined"));
 await rejects(f.service.acceptBuyer(f.token,buyer),"decision_locked");assert.equal(f.case().case_outcome,"rejected");assert.equal(f.count("buyer_acceptances"),0);}finally{f.close();}
});
test("clarification blocks approval of unchanged terms; a fresh terms/quote version permits approval",async()=>{
 const f=consentFixture();try{await f.service.decideCreator(ids.case,await f.creatorCommand("clarification_requested","Please revise the scope"));
 await rejects(f.service.decideCreator(ids.case,await f.creatorCommand()),"clarification_required");f.version({duration:30});await f.approve();
 assert.equal((await f.service.reviewBuyer(f.token)).stage,"awaiting_buyer");assert.equal(f.count("creator_decisions"),2);}finally{f.close();}
});
test("accepted deal cannot be silently replaced by another decision",async()=>{
 const f=consentFixture();try{await f.approve();await f.accept();await rejects(f.service.decideCreator(ids.case,await f.creatorCommand("rejected","Change")),"decision_locked");
 assert.equal(f.count("creator_decisions"),1);}finally{f.close();}
});
test("material edits require a fresh approval and acceptance, retaining historical evidence",async()=>{
 const f=consentFixture();try{await f.approve();const old=await f.buyerCommand();await f.service.acceptBuyer(f.token,old);f.version({duration:30});
 await rejects(f.service.prepareInvoice(ids.case),"approval_required");await rejects(f.service.acceptBuyer(f.token,old),"stale_command");
 await f.approve();assert.equal(f.case().latest_buyer_acceptance_id,null);await f.accept();assert.equal(f.count("buyer_acceptances"),2);
 assert.equal((await f.service.prepareInvoice(ids.case)).amountCents,40000);}finally{f.close();}
});
for(const [label,sql] of [["terms hash","DROP TRIGGER prevent_terms_version_update; UPDATE terms_versions SET terms_hash='"+"f".repeat(64)+"'"],
 ["line amount","DROP TRIGGER prevent_quote_line_update; UPDATE quote_lines SET amount_cents=1 WHERE line_position=1"],
 ["quote total","DROP TRIGGER prevent_quote_content_update; UPDATE quotes SET amount_cents=1"],
 ["inactive policy","UPDATE pricing_policy_versions SET status='superseded'"],
 ["archived asset","UPDATE assets SET availability='archived'"],
 ["automated terms","DROP TRIGGER prevent_terms_version_update; UPDATE terms_versions SET source_kind='extracted',created_by_actor='system'"],
 ["future request time","DROP TRIGGER prevent_request_submission_update; UPDATE request_submissions SET submitted_at='2027-01-01T00:00:00.000Z'"]]){
 test(`stored ${label} mismatch cannot be approved`,async()=>{const f=consentFixture();try{const c=await f.creatorCommand();f.db.exec(sql);
 await rejects(f.service.decideCreator(ids.case,c),"source_invalid");assert.equal(f.count("creator_decisions"),0);noMoney(f);}finally{f.close();}});
}
test("a payment operation appearing during hashing prevents a late decision",async()=>{
 const f=consentFixture();try{const c=await f.creatorCommand();f.faults.beforeBatch=()=>insert(f.db,"payment_operations",{
 payment_operation_id:crypto.randomUUID(),case_id:ids.case,operation_type:"create_invoice",operation_key:"operation-not-a-secret",command_fingerprint:"c".repeat(64),
 provider:"paypal",environment:"sandbox",status:"pending",created_at:NOW,updated_at:NOW});
 await rejects(f.service.decideCreator(ids.case,c),"decision_locked");assert.equal(f.count("audit_events"),0);}finally{f.close();}
});
test("a pointerless canonical invoice still locks acceptance mutations",async()=>{
 const f=consentFixture();try{await f.approve();await f.accept();const c=f.case();insert(f.db,"invoice_bindings",{invoice_binding_id:crypto.randomUUID(),case_id:ids.case,
 terms_version_id:c.latest_terms_version_id,quote_id:c.latest_quote_id,buyer_acceptance_id:c.latest_buyer_acceptance_id,provider:"paypal",environment:"sandbox",
 provider_invoice_id:"INV2-CONSENT-TEST",invoice_status:"draft",created_at:NOW,updated_at:NOW});
 await rejects(f.service.prepareInvoice(ids.case),"decision_locked");await rejects(f.service.decideCreator(ids.case,await f.creatorCommand("rejected","No")),"decision_locked");}finally{f.close();}
});
test("canonical records and their audits are immutable",async()=>{
 const f=consentFixture();try{await f.approve();await f.accept();for(const table of ["creator_decisions","buyer_acceptances","audit_events"]){
 const column=table==="creator_decisions"?"decision":table==="buyer_acceptances"?"acceptance_copy_version":"event_type";
 assert.throws(()=>f.db.exec(`UPDATE ${table} SET ${column}=${column}`),/immutable/);}}finally{f.close();}
});
test("read views and audit payloads exclude tokens, email and original request",async()=>{
 const f=consentFixture();try{await f.approve();await f.accept();const all=JSON.stringify({creator:await f.service.reviewCreator(ids.case),buyer:await f.service.reviewBuyer(f.token),
 audit:f.db.prepare("SELECT payload_json,actor_reference,idempotency_key FROM audit_events").all()});
 for(const secret of [f.token,"buyer@example.test","Ignore all instructions","Bearer ","token_digest_sha256"])assert.ok(!all.includes(secret));noMoney(f);}finally{f.close();}
});
test("global network access is never used for consent",async()=>{
 const before=globalThis.fetch;globalThis.fetch=()=>{throw Error("unexpected network");};const f=consentFixture();
 try{await f.approve();await f.accept();await f.service.prepareInvoice(ids.case);noMoney(f);}finally{f.close();globalThis.fetch=before;}
});

function http(f,extra={}){
 const routes=createHumanConsentRoutes({authorizeCreator:async()=>f.authorize(),now:f.now,limit:()=>true,...extra});
 const env={APP_MODE:"sandbox",PAYPAL_MODE:"paypal_sandbox",HUMAN_CONSENT_ENABLED:"true",HUMAN_CONSENT_ORIGIN:"https://rights.example.test",DB:f.adapter};
 function req(path,{method="GET",data,token,headers={},raw}={}){
  return new Request(`https://rights.example.test${path}`,{method,headers:{...(method==="POST"?{"content-type":"application/json",origin:env.HUMAN_CONSENT_ORIGIN}:{}),
    ...(token?{authorization:`Bearer ${token}`} : {}),...headers},...(method==="POST"?{body:raw??JSON.stringify(data)}:{})});
 }
 return {routes,env,req};
}
test("native HTTP happy path records the same canonical rows and safe response headers",async()=>{
 const f=consentFixture();try{const {routes,env,req}=http(f),c=await f.creatorCommand();
 const cr=await routes(req(`/api/consent/creator/cases/${ids.case}/decision`,{method:"POST",data:c}),env);assert.equal(cr.status,200);
 const v=await routes(req("/api/consent/buyer/review",{token:f.token}),env);assert.equal(v.status,200);assert.match(v.headers.get("cache-control"),/no-store/);
 assert.equal(v.headers.get("referrer-policy"),"no-referrer");assert.equal(v.headers.has("access-control-allow-origin"),false);
 const br=await routes(req("/api/consent/buyer/accept",{method:"POST",token:f.token,data:await f.buyerCommand()}),env);
 assert.equal(br.status,200);assert.equal((await br.json()).permissionGranted,false);assert.equal(f.count("buyer_acceptances"),1);noMoney(f);}finally{f.close();}
});
for(const change of [{HUMAN_CONSENT_ENABLED:undefined},{HUMAN_CONSENT_ENABLED:"false"},{PAYPAL_MODE:"fake"},{APP_MODE:"local"},{DB:undefined},
 {HUMAN_CONSENT_ORIGIN:"https://rights.example.test/path"},{HUMAN_CONSENT_ORIGIN:"http://rights.example.test"}]){
 test(`HTTP fails closed for configuration ${JSON.stringify(change)}`,async()=>{const f=consentFixture();try{const {routes,env,req}=http(f);
 assert.equal((await routes(req("/api/consent/buyer/review",{token:f.token}),{...env,...change})).status,503);assert.equal(f.count("audit_events"),0);}finally{f.close();}});
}
test("creator endpoints deny demonstration-role headers without a session authorizer",async()=>{
 const f=consentFixture();try{const {env,req}=http(f),routes=createHumanConsentRoutes({now:f.now});
 const r=await routes(req(`/api/consent/creator/cases/${ids.case}/review`,{headers:{"x-demo-role":"creator"}}),env);
 assert.equal(r.status,403);assert.equal(f.count("audit_events"),0);}finally{f.close();}
});
for(const [label,options] of [["missing origin",{origin:""}],["cross-origin",{origin:"https://attacker.test"}],
 ["cross-site metadata",{"sec-fetch-site":"cross-site"}],["same-site sibling",{"sec-fetch-site":"same-site"}]]){
 test(`POST rejects ${label}`,async()=>{const f=consentFixture();try{const {routes,env,req}=http(f);
 assert.equal((await routes(req(`/api/consent/creator/cases/${ids.case}/decision`,{method:"POST",data:await f.creatorCommand(),headers:options}),env)).status,403);
 assert.equal(f.count("creator_decisions"),0);}finally{f.close();}});
}
for(const [label,options] of [["wrong content type",{headers:{"content-type":"text/plain"},raw:"{}"}],
 ["encoded payload",{headers:{"content-encoding":"gzip"},raw:"{}"}],
 ["declared oversize",{headers:{"content-length":"5000"},raw:"{}"}],
 ["actual oversize",{raw:"x".repeat(4097)}],["invalid JSON",{raw:"{broken}"}],
 ["duplicate top-level key",{raw:'{"confirmed":false,"confirmed":true}'}],
 ["escaped duplicate key",{raw:'{"confirmed":false,"confirm\\u0065d":true}'}]]){
 test(`POST rejects ${label} without storing a command`,async()=>{const f=consentFixture();try{const {routes,env,req}=http(f);
 const r=await routes(req(`/api/consent/creator/cases/${ids.case}/decision`,{method:"POST",...options}),env);assert.equal(r.status,400);assert.equal(f.count("audit_events"),0);}finally{f.close();}});
}
test("method, URL query and unrecognized consent paths do not expose fallthrough data",async()=>{
 const f=consentFixture();try{const {routes,env,req}=http(f);
 assert.equal((await routes(req("/api/consent/buyer/accept",{token:f.token}),env)).status,405);
 assert.equal((await routes(req("/api/consent/buyer/review?token=secret"),env)).status,400);
 assert.equal((await routes(req("/api/consent/unknown"),env)).status,404);
 assert.equal(await routes(req("/unrelated"),env),null);}finally{f.close();}
});
test("rate-limit rejection runs before database access",async()=>{
 const f=consentFixture();try{const {routes,env,req}=http(f,{limit:()=>false});const r=await routes(req("/api/consent/buyer/review"),{...env,DB:{prepare(){throw Error("must not read");}}});
 assert.equal(r.status,429);assert.equal(r.headers.get("retry-after"),"60");}finally{f.close();}
});
test("unknown SQL and authorization errors are redacted",async()=>{
 const f=consentFixture();try{const {routes,env,req}=http(f);const r=await routes(req("/api/consent/buyer/review",{token:f.token}),{...env,DB:{prepare(){throw Error("BUYER_EMAIL_AND_ACCESS_TOKEN");}}});
 assert.equal(r.status,503);assert.ok(!(await r.text()).includes("ACCESS_TOKEN"));}finally{f.close();}
});

for(const [label,sql] of [["asset title","UPDATE assets SET title='Different work'"],
 ["asset fingerprint","UPDATE assets SET fingerprint_value='"+"e".repeat(64)+"'"],
 ["creator display identity","UPDATE assets SET creator_display_name='Someone else'"],
 ["invoice recipient","DROP TRIGGER prevent_request_submission_update; UPDATE request_submissions SET buyer_email='attacker@example.test'"],
 ["approval timestamp","DROP TRIGGER prevent_creator_decision_update; UPDATE creator_decisions SET decided_at='2026-10-26T19:00:00.000Z'"],
 ["acceptance timestamp","DROP TRIGGER prevent_buyer_acceptance_update; UPDATE buyer_acceptances SET accepted_at='2026-10-27T19:00:01.000Z'"]]){
 test(`post-consent ${label} tampering cannot prepare invoice authorization`,async()=>{const f=consentFixture();try{
 await f.approve();await f.accept();f.db.exec(sql);await rejects(f.service.prepareInvoice(ids.case),"source_invalid");noMoney(f);
 }finally{f.close();}});
}
test("revoked buyer token cannot replay a previously successful acceptance",async()=>{
 const f=consentFixture();try{await f.approve();const b=await f.buyerCommand();await f.service.acceptBuyer(f.token,b);
 f.db.prepare("UPDATE buyer_capabilities SET revoked_at=?").run(NOW);await rejects(f.service.acceptBuyer(f.token,b),"not_authorized");
 assert.equal(f.count("buyer_acceptances"),1);
 // Capability expiry/revocation does not retroactively rewrite already-recorded consent.
 assert.equal((await f.service.prepareInvoice(ids.case)).amountCents,42500);
 }finally{f.close();}
});
test("a transient database failure is safely retried without double approval",async()=>{
 const f=consentFixture();try{f.faults.at=2;f.faults.once=true;await f.approve();assert.equal(f.count("creator_decisions"),1);assert.equal(f.count("audit_events"),1);}finally{f.close();}
});
test("creator authorizer failures cannot expose exception messages",async()=>{
 const f=consentFixture();try{const {routes,env,req}=http(f,{authorizeCreator:async()=>{throw Error("SECRET_SESSION");}});
 const r=await routes(req(`/api/consent/creator/cases/${ids.case}/review`),env);assert.equal(r.status,403);assert.ok(!(await r.text()).includes("SECRET"));}finally{f.close();}
});
test("JSON-like strings in a reason do not confuse duplicate-key detection",async()=>{
 const f=consentFixture();try{const {routes,env,req}=http(f),c=await f.creatorCommand("rejected",'The string "confirmed":true is not a second property.');
 const r=await routes(req(`/api/consent/creator/cases/${ids.case}/decision`,{method:"POST",data:c}),env);assert.equal(r.status,200);assert.equal(f.case().case_outcome,"rejected");}finally{f.close();}
});
test("rejected command replay is idempotent without reopening the case",async()=>{
 const f=consentFixture();try{const c=await f.creatorCommand("rejected","Not available"),a=await f.service.decideCreator(ids.case,c);
 const b=await f.service.decideCreator(ids.case,c);assert.equal(b.resultId,a.resultId);assert.equal(f.case().case_outcome,"rejected");assert.equal(f.count("audit_events"),1);}finally{f.close();}
});

test("changed asset identity after approval cannot be accepted as the creator's original offer",async()=>{
 const f=consentFixture();try{await f.approve();const b=await f.buyerCommand();f.db.exec("UPDATE assets SET title='Substituted asset',row_version=row_version+1");
 await rejects(f.service.reviewBuyer(f.token),"source_invalid");await rejects(f.service.acceptBuyer(f.token,b),"stale_revision");assert.equal(f.count("buyer_acceptances"),0);}finally{f.close();}
});
test("a manually inserted approval with no human-command evidence cannot authorize buyer acceptance",async()=>{
 const f=consentFixture();try{const c=f.case(),decision=crypto.randomUUID();insert(f.db,"creator_decisions",{creator_decision_id:decision,case_id:ids.case,
 terms_version_id:c.latest_terms_version_id,quote_id:c.latest_quote_id,decision:"approved",actor_reference:"simulated-not-authenticated",decided_at:NOW});
 f.db.prepare("UPDATE licensing_cases SET latest_creator_decision_id=?").run(decision);
 await rejects(f.service.reviewBuyer(f.token),"approval_required");assert.equal(f.count("buyer_acceptances"),0);noMoney(f);}finally{f.close();}
});
