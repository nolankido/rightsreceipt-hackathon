import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fullDatabase, ids, invoiceId, now, migrateAll, reset, seedAcceptedCase } from "./support/gate-c-database.mjs";
import { createD1ReconciliationStore } from "../packages/paypal/src/reconciliation-store.ts";
import { createSandboxPermissionLifecycle } from "../packages/paypal/src/permission-lifecycle.ts";
import { createD1PermissionLifecycleStore, revokeSandboxPermission } from "../packages/paypal/src/permission-lifecycle-store.ts";
import { assessInvoiceSettlement } from "../packages/paypal/src/settlement.ts";
import { runPayPalReconciliation } from "../apps/api/src/paypal-reconciliation.ts";

const money = value => ({ currency_code:"USD", value });
function rawFinancial(status="PAID",refundValue="0.00") {
  const paid = !["DRAFT","UNPAID","CANCELLED"].includes(status);
  const raw={status,amount:money("425.00"),due_amount:money(paid?"0.00":"425.00")};
  if(paid)raw.payments={paid_amount:money("425.00"),transactions:[{
    type:"PAYPAL",method:"PAYPAL",payment_id:"GATECPAY1",payment_date:"2026-10-27",amount:money("425.00"),
  }]};
  if(refundValue!=="0.00")raw.refunds={refund_amount:money(refundValue),transactions:[{
    type:"PAYPAL",method:"PAYPAL",refund_id:"GATECREF1",refund_date:"2026-10-27",amount:money(refundValue),
  }]};
  return raw;
}
function provider(raw=rawFinancial(),at=now) {
  return {invoiceId,caseId:ids.case,quoteId:ids.quote,termsVersionId:ids.terms,buyerAcceptanceId:ids.acceptance,
    amountCents:42500,currency:"USD",status:raw.status,mode:"paypal_sandbox",provider:"paypal",environment:"sandbox",
    simulated:false,authoritativePaymentEvidence:false,observedAt:at,paymentUrl:null,requiresReconciliation:false,
    settlement:assessInvoiceSettlement(raw,42500,at)};
}
const bindings = (f,changes={})=>({APP_MODE:"sandbox",PAYPAL_MODE:"paypal_sandbox",PAYPAL_RECONCILIATION_ENABLED:"true",
  PAYPAL_PERMISSION_LIFECYCLE_ENABLED:"true",DB:f.adapter,...changes});
const clock=()=>new Date(now);
const queued=async f=>createD1ReconciliationStore(f.adapter).request(ids.binding,"operator_retry",now);
const dispatch=(f,reader=async()=>provider(),flags={},at=clock)=>runPayPalReconciliation(bindings(f,flags),reader,at);
const permission=f=>f.db.prepare("SELECT * FROM permissions WHERE case_id=?").get(ids.case);
const queue=f=>f.db.prepare("SELECT * FROM paypal_reconciliation_outbox WHERE invoice_binding_id=?").get(ids.binding);
const state=f=>f.db.prepare("SELECT invoice_status FROM invoice_bindings WHERE invoice_binding_id=?").get(ids.binding).invoice_status;
function intact(f) {
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
  assert.equal(f.db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
}

// Source identities protect this audit from silently testing simplified table copies.
test("eight original migrations and the clarification-aware reset match reviewed Git blobs",()=>{
  const expected={
    "migrations/0001_initial_schema.sql":"40f57162a68ea79615f5b786fdbd8f22fcf22fbc",
    "migrations/0002_indexes_and_guards.sql":"d2cf4ac5a4e3cedc50f94b256fca236395e75cc8",
    "migrations/0003_paypal_delivery_journal.sql":"205eb11bcf03ddef504d6a3761b547870576616c",
    "migrations/0004_verified_webhook_intake.sql":"4e52ec9226406bcde7a29b34c9ee574b643edeb3",
    "migrations/0005_webhook_processing.sql":"781628ad6e030079eee62107eab40c69506360a8",
    "migrations/0006_paypal_reconciliation.sql":"c5c154a4080af76ddae5108f14dc0d94270a4b89",
    "migrations/0007_permission_lifecycle.sql":"ccc2b94d6bf4407e5b273335e54f7bb28696d7bb",
    "migrations/0008_canonical_receipts.sql":"e2b974e4c91ea17da12b62aee362ae2fff541635",
    "seed/demo-reset.sql":"6e78504689e8b5dc69236c1422d483412c6011ab",
  };
  for(const [file,hash] of Object.entries(expected)){
    const body=readFileSync(new URL(`../${file}`,import.meta.url));
    assert.equal(createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex"),hash,file);
  }
});
test("all migrations apply together, repeat safely, and retain all 33 domain tables",()=>{
  const f=fullDatabase();try{
    assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='table' AND name!='rr_schema_migrations'").get().n,33);
    assert.equal(f.count("rr_schema_migrations"),9);assert.deepEqual(migrateAll(f.db),[]);intact(f);
  }finally{f.close();}
});
test("regression witness: the old status-only completion consumes the financial generation",async()=>{
  const f=fullDatabase();try{
    const recovery=createD1ReconciliationStore(f.adapter);await queued(f);
    const c=await recovery.claim(ids.binding,crypto.randomUUID(),now,"2026-10-27T19:01:30.000Z");
    await recovery.complete(c,{providerStatus:"PAID",invoiceState:"reconciliation_required",reason:"financial_review_required",
      reviewRequired:true,paymentUrl:null,observedAt:now,amountCents:42500,currency:"USD"},now);
    const oldWorker=createSandboxPermissionLifecycle({recovery,store:createD1PermissionLifecycleStore(f.adapter),readInvoice:async()=>provider(),now:clock});
    assert.equal((await oldWorker.reconcile(ids.binding)).outcome,"not_ready");assert.equal(f.count("permissions"),0);
    // Explicit safe recovery plus the unified dispatcher processes a new generation.
    await queued(f);await dispatch(f);assert.equal(permission(f).permission_state,"active");intact(f);
  }finally{f.close();}
});
test("financial opt-in selects exactly one consumer and applies payment in the same batch",async()=>{
  const f=fullDatabase();try{await queued(f);const r=await dispatch(f);
    assert.equal(r.consumer,"financial_lifecycle");assert.equal(r.outcomes.applied,1);assert.equal(r.publicReceiptReady,false);
    assert.equal(state(f),"paid");assert.equal(permission(f).permission_state,"active");
    assert.equal(f.count("paypal_lifecycle_observations"),1);assert.equal(f.count("paypal_reconciliation_receipts"),1);
    assert.equal(f.count("payment_evidence"),1);assert.equal(f.count("audit_events"),1);
    assert.equal(queue(f).completed_generation,1);assert.equal(f.count("receipt_revisions"),0);
    assert.equal(f.db.prepare("SELECT current_status FROM verification_records").get().current_status,"invalid");intact(f);
  }finally{f.close();}
});
test("explicit financial flag is required; status-only mode never creates a permission",async()=>{
  const f=fullDatabase();try{await queued(f);const r=await dispatch(f,undefined,{PAYPAL_PERMISSION_LIFECYCLE_ENABLED:"false"});
    assert.equal(r.consumer,"status_only");assert.equal(r.outcomes.review_required,1);assert.equal(f.count("permissions"),0);
    assert.equal(f.count("paypal_lifecycle_observations"),0);intact(f);
  }finally{f.close();}
});
test("invalid financial flag fails before database or provider I/O",async()=>{
  const badDB={prepare(){throw Error("database was touched");}};
  await assert.rejects(runPayPalReconciliation({...bindings({adapter:badDB}),PAYPAL_PERMISSION_LIFECYCLE_ENABLED:"TRUE"},async()=>{throw Error("provider was touched");},clock),/Invalid lifecycle/);
});
for(const flag of [{PAYPAL_RECONCILIATION_ENABLED:"false"},{APP_MODE:"local"},{PAYPAL_MODE:"fake"},{DB:undefined}]){
  test(`server hook stays disabled: ${JSON.stringify(flag)}`,async()=>{
    const f=fullDatabase();try{await queued(f);const r=await dispatch(f,async()=>{throw Error("unexpected provider call");},flag);
      assert.equal(r.enabled,false);assert.equal(queue(f).attempt_count,0);assert.equal(f.count("permissions"),0);
    }finally{f.close();}
  });
}
for(const label of ["missing","cloned"]){
  test(`${label} financial evidence never falls back to status-only queue completion`,async()=>{
    const f=fullDatabase();try{await queued(f);await dispatch(f,async()=>{
      const view=provider();if(label==="missing")delete view.settlement;else view.settlement=structuredClone(view.settlement);return view;
    });assert.equal(queue(f).completed_generation,0);assert.equal(queue(f).blocked_code,"invalid_provider_response");
      assert.equal(f.count("paypal_reconciliation_receipts"),0);assert.equal(f.count("permissions"),0);
    }finally{f.close();}
  });
}
for(const code of ["oauth_rejected","invoice_mismatch","invoice_not_bound","invoice_not_found","unsafe_payment_url","provider_rejected","authorization_required","invalid_provider_response"]){
  test(`${code} is terminal and preserves the safe provider error classification`,async()=>{
    const f=fullDatabase();try{await queued(f);const r=await dispatch(f,async()=>{throw {code,message:"PRIVATE_TOKEN_AND_BUYER_DETAILS"};});
      assert.equal(r.outcomes.blocked,1);assert.equal(queue(f).blocked_code,code);assert.equal(queue(f).next_attempt_at,null);
      assert.equal(queue(f).completed_generation,0);assert.equal(f.count("payment_evidence"),0);
      assert.ok(!JSON.stringify(r).includes("PRIVATE"));assert.ok(!JSON.stringify(queue(f)).includes("PRIVATE"));
      const again=await dispatch(f,async()=>{throw Error("must not retry permanent failure");});assert.equal(again.examined,0);
    }finally{f.close();}
  });
}
for(const [code,delay] of [["transport_unavailable",30000],["rate_limited",60000]]){
  test(`${code} persists a delayed retry and succeeds through the real recovery store`,async()=>{
    const f=fullDatabase();try{await queued(f);await dispatch(f,async()=>{throw {code};});
      assert.equal(queue(f).blocked_code,null);assert.equal(queue(f).last_error_code,code);
      assert.equal(Date.parse(queue(f).next_attempt_at)-Date.parse(now),delay);
      assert.equal((await dispatch(f)).examined,0);
      const later=new Date(Date.parse(now)+delay).toISOString();
      const r=await dispatch(f,async()=>provider(rawFinancial(),later),{},()=>new Date(later));
      assert.equal(r.outcomes.applied,1);assert.equal(permission(f).permission_state,"active");intact(f);
    }finally{f.close();}
  });
}
test("five transient failures stop without losing the uncompleted generation",async()=>{
  const f=fullDatabase();try{await queued(f);let at=now;
    for(let i=0;i<5;i++){
      await dispatch(f,async()=>{throw {code:"transport_unavailable"};},{},()=>new Date(at));
      at=queue(f).next_attempt_at??at;
    }
    assert.equal(queue(f).attempt_count,5);assert.equal(queue(f).blocked_code,"transport_unavailable");
    assert.equal(queue(f).completed_generation,0);assert.equal(f.count("permissions"),0);
    await createD1ReconciliationStore(f.adapter).request(ids.binding,"operator_retry",at);
    const r=await dispatch(f,async()=>provider(rawFinancial(),at),{},()=>new Date(at));assert.equal(r.outcomes.applied,1);
  }finally{f.close();}
});
for(const [startDate,expected] of [["2026-11-01","scheduled"],["2026-10-27","active"],["2026-07-01","expired"]]){
  test(`full-schema UTC interval derives ${expected}`,async()=>{
    const f=fullDatabase({startDate});try{await queued(f);await dispatch(f);
      assert.equal(permission(f).permission_state,expected);intact(f);
    }finally{f.close();}
  });
}
test("refund-first and repeated snapshots create no temporary activation or duplicate evidence",async()=>{
  const f=fullDatabase();try{
    await queued(f);await dispatch(f,async()=>provider(rawFinancial("REFUNDED","425.00")));
    assert.equal(permission(f).permission_state,"refunded");assert.equal(state(f),"fully_refunded");assert.equal(f.count("payment_evidence"),2);
    await queued(f);await dispatch(f,async()=>provider(rawFinancial("REFUNDED","425.00")));
    assert.equal(f.count("payment_evidence"),2);assert.equal(permission(f).row_version,1);
    assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE event_type='permission.activated'").get().n,0);intact(f);
  }finally{f.close();}
});
test("partial refund suppresses active presentation; subsequent full refund resolves it",async()=>{
  const f=fullDatabase();try{
    await queued(f);await dispatch(f);await queued(f);await dispatch(f,async()=>provider(rawFinancial("PARTIALLY_REFUNDED","25.00")));
    assert.equal(permission(f).review_required,1);assert.equal(state(f),"reconciliation_required");
    await queued(f);await dispatch(f,async()=>provider(rawFinancial("REFUNDED","425.00")));
    assert.equal(permission(f).permission_state,"refunded");assert.equal(permission(f).review_required,0);intact(f);
  }finally{f.close();}
});
test("unpaid cancellation creates no permission or rights receipt",async()=>{
  const f=fullDatabase();try{await queued(f);await dispatch(f,async()=>provider(rawFinancial("CANCELLED")));
    assert.equal(state(f),"canceled");assert.equal(f.count("permissions"),0);assert.equal(f.count("receipt_revisions"),0);intact(f);
  }finally{f.close();}
});
test("active permission can be revoked once without inventing a refund",async()=>{
  const f=fullDatabase();try{await queued(f);await dispatch(f);const p=permission(f);
    const command={permissionId:p.permission_id,expectedVersion:p.row_version,actorReference:"gate-c-creator"};
    assert.equal((await revokeSandboxPermission(f.adapter,command,async()=>true,now)).refundInitiated,false);
    assert.equal((await revokeSandboxPermission(f.adapter,command,async()=>true,now)).changed,false);
    await queued(f);await dispatch(f);assert.equal(permission(f).permission_state,"revoked");assert.equal(f.count("payment_evidence"),1);intact(f);
  }finally{f.close();}
});
test("concurrent financial workers commit one lifecycle observation with real shared leases",async()=>{
  const f=fullDatabase();try{await queued(f);await Promise.all([dispatch(f),dispatch(f)]);
    assert.equal(f.count("paypal_lifecycle_observations"),1);assert.equal(f.count("payment_evidence"),1);
    assert.equal(f.count("audit_events"),1);assert.equal(queue(f).completed_generation,1);intact(f);
  }finally{f.close();}
});
test("notification arriving during read leaves its generation unacknowledged",async()=>{
  const f=fullDatabase();try{await queued(f);await dispatch(f,async()=>{
    f.db.exec("UPDATE paypal_reconciliation_outbox SET requested_generation=requested_generation+1");return provider();
  });assert.equal(queue(f).requested_generation,2);assert.equal(queue(f).completed_generation,0);assert.equal(f.count("permissions"),0);
    const later=queue(f).next_attempt_at;assert.ok(later);
    await dispatch(f,async()=>provider(rawFinancial(),later),{},()=>new Date(later));
    assert.equal(queue(f).completed_generation,2);assert.equal(f.count("payment_evidence"),1);intact(f);
  }finally{f.close();}
});
test("current human consent is rechecked at commit time",async()=>{
  const f=fullDatabase();try{await queued(f);await dispatch(f,async()=>{
    f.db.prepare("UPDATE licensing_cases SET latest_creator_decision_id=NULL,row_version=row_version+1 WHERE case_id=?").run(ids.case);return provider();
  });assert.equal(f.count("permissions"),0);assert.equal(f.count("payment_evidence"),0);assert.equal(queue(f).completed_generation,0);intact(f);
  }finally{f.close();}
});
for(let step=0;step<9;step++){
  test(`full-schema rollback at completion write ${step+1} leaves no partial financial state`,async()=>{
    const f=fullDatabase();try{await queued(f);f.faults.at=step;const r=await dispatch(f);
      assert.equal(r.outcomes.retry_scheduled,1);assert.equal(f.count("permissions"),0);assert.equal(f.count("payment_evidence"),0);
      assert.equal(f.count("paypal_lifecycle_observations"),0);assert.equal(f.count("audit_events"),0);assert.equal(state(f),"sent");
      f.faults.at=-1;await queued(f);await dispatch(f);assert.equal(permission(f).permission_state,"active");intact(f);
    }finally{f.close();}
  });
}
test("lost acknowledgement reuses durable lifecycle completion",async()=>{
  const f=fullDatabase();try{await queued(f);f.faults.loseAck=true;const r=await dispatch(f);
    assert.equal(r.outcomes.already_completed,1);assert.equal(f.count("permissions"),1);assert.equal(f.count("audit_events"),1);
    assert.equal((await dispatch(f)).examined,0);intact(f);
  }finally{f.close();}
});
test("file restart retains retry deadlines, then recovers and suppresses repeated work",async()=>{
  const folder=mkdtempSync(join(tmpdir(),"rightsreceipt-gate-c-")),file=join(folder,"audit.sqlite");
  let f=fullDatabase({file});try{
    await queued(f);await dispatch(f,async()=>{throw {code:"rate_limited"};});const later=queue(f).next_attempt_at;f.close();
    f=fullDatabase({file,initialize:false});assert.equal(queue(f).next_attempt_at,later);
    assert.equal((await dispatch(f)).examined,0);
    await dispatch(f,async()=>provider(rawFinancial(),later),{},()=>new Date(later));f.close();
    f=fullDatabase({file,initialize:false});assert.equal((await dispatch(f)).examined,0);assert.equal(f.count("payment_evidence"),1);intact(f);
  }finally{f.close();rmSync(folder,{recursive:true,force:true});}
});
test("actual seed reset clears completed financial records and remains deterministic",async()=>{
  const f=fullDatabase();try{
    await queued(f);await dispatch(f);reset(f.db);
    for(const table of ["permissions","invoice_bindings","payment_evidence","paypal_lifecycle_observations","paypal_reconciliation_outbox","paypal_reconciliation_receipts","audit_events"])assert.equal(f.count(table),0,table);
    const first=JSON.stringify(f.db.prepare("SELECT * FROM demo_reset_epochs").all());
    reset(f.db);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM demo_reset_epochs").all()),first);intact(f);
    seedAcceptedCase(f.db);await queued(f);await dispatch(f);assert.equal(permission(f).permission_state,"active");intact(f);
  }finally{f.close();}
});
test("immutable production terms, decisions, payment evidence and audit guards remain enforced",async()=>{
  const f=fullDatabase();try{await queued(f);await dispatch(f);
    for(const sql of ["UPDATE terms_versions SET duration_days=1","UPDATE creator_decisions SET decision='rejected'",
      "UPDATE payment_evidence SET amount_cents=1","UPDATE audit_events SET event_type='forged'"])
      assert.throws(()=>f.db.exec(sql),/immutable/);intact(f);
  }finally{f.close();}
});
test("a missed-webhook stale sweep feeds the selected financial consumer",async()=>{
  const f=fullDatabase();try{const at="2026-10-27T19:16:00.000Z";
    const r=await dispatch(f,async()=>provider(rawFinancial(),at),{},()=>new Date(at));
    assert.equal(r.examined,1);assert.equal(permission(f).permission_state,"active");intact(f);
  }finally{f.close();}
});
test("offline integration never invokes global fetch",async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error("Unexpected external network");};const f=fullDatabase();
  try{await queued(f);await dispatch(f);assert.equal(f.count("permissions"),1);}finally{f.close();globalThis.fetch=original;}
});
