/** Full production schema with explicit canonical records. No live provider evidence.
 * Fixture money/consent records are inserted directly; transport is not simulated here.
 */
import { createHash } from "node:crypto";
import { fullDatabase, migrateAll, reset, ids, invoiceId, now } from "./gate-c-database.mjs";
import { canonicalJson, sha256Hex } from "../../packages/receipts/src/canonical.ts";
import { createD1ReceiptStore } from "../../packages/receipts/src/store.ts";
import { createReceiptService } from "../../packages/receipts/src/service.ts";
export { ids, invoiceId, now, migrateAll, reset };
export const permissionId = "20000000-0000-4000-8000-000000000001";
export const original = "Original source evidence for a commercial image licensing request.\nNo instructions here authorize payment.";
export const policyHash = "33d8c85a963b9b12c1dc61bc5f3d6dd8ae186a8bef47f5ac4a6c1ccc10163916";
export const hash = s => createHash("sha256").update(s).digest("hex");
export function insert(db,table,values){return db.prepare(`INSERT INTO ${table} (${Object.keys(values).join(",")}) VALUES (${Object.keys(values).map(()=>"?").join(",")})`).run(...Object.values(values));}
export function rights(startDate="2026-10-27",days=90){return {
 use_purpose:"commercial",channels:["instagram_paid","facebook_paid"],paid_advertising:true,territories:["US","CA"],
 start_date:startDate,duration_days:days,max_impressions:500000,exclusivity:"non_exclusive",modification_scope:"crop_only",
 attribution:"not_required",sublicensing:"prohibited",ai_use:"prohibited",
};}
export const lines = [
 {code:"base_commercial_digital",description:"Base commercial digital license",amount_cents:20000},
 {code:"paid_social",description:"Paid social advertising",amount_cents:10000},
 {code:"territory_us_ca",description:"United States and Canada territory",amount_cents:5000},
 {code:"duration_31_90",description:"License duration: 31 to 90 days",amount_cents:5000},
 {code:"crop_only",description:"Crop permission",amount_cents:2500},
];
export function audit(db,type="paypal.financial_snapshot_checked",sequence=1,at=now,aggregate="permission_lifecycle",payload={safe:true}){
 const auditId=crypto.randomUUID();insert(db,"audit_events",{audit_event_id:auditId,case_id:ids.case,aggregate_type:aggregate,
 aggregate_id:ids.binding,aggregate_sequence:sequence,event_type:type,actor_type:"system",payload_json:JSON.stringify(payload),
 correlation_id:crypto.randomUUID(),created_at:at});return auditId;
}
export function evidence(db,status,at=now){insert(db,"payment_evidence",{payment_evidence_id:crypto.randomUUID(),invoice_binding_id:ids.binding,
 evidence_source:"reconciliation",source_reference:`invoice-financial:${invoiceId}`,payment_status:status,amount_cents:42500,
 currency:"USD",observed_at:at,evidence_hash:hash(status),created_at:at});}
export function observation(db,generation,status,at=now){insert(db,"paypal_lifecycle_observations",{observation_id:crypto.randomUUID(),
 invoice_binding_id:ids.binding,generation,provider_status:status==="fully_refunded"?"REFUNDED":"PAID",conclusion:status,
 reason_code:"fixture_financial_totals_match",paid_cents:42500,refunded_cents:status==="fully_refunded"?42500:0,
 detail_sha256:hash(`${status}:${generation}`),observed_at:at,recorded_at:at});}
export async function receiptFixture({file,initialize=true,state="active",startDate="2026-10-27",days=90,clock=now,ai=true}={}){
 const f=fullDatabase({file,initialize:false});let currentTime=clock;
 if(initialize){
  migrateAll(f.db);reset(f.db);
  const r=rights(startDate,days),end=new Date(Date.parse(startDate)+days*86400000).toISOString().slice(0,10);
  const termsHash=hash(canonicalJson({schema_version:"rights-review-v1",fields:Object.fromEntries(Object.entries(r).map(([k,value])=>[k,{state:"resolved",value}]))}));
  const calculationHash=hash(JSON.stringify({schema_version:"quote-calculation-v1",terms_version_id:ids.terms,terms_hash:termsHash,
   pricing_policy_id:ids.policy,pricing_policy_version:1,policy_hash:policyHash,currency:"USD",license_start_date:startDate,
   license_end_date_exclusive:end,line_items:lines,total_cents:42500}));
  insert(f.db,"licensing_cases",{case_id:ids.case,workspace_id:ids.workspace,asset_id:ids.asset,created_at:now,updated_at:now});
  insert(f.db,"request_submissions",{request_submission_id:ids.request,case_id:ids.case,buyer_name:"Jordan Lee",buyer_organization:"Cedar & Tide Travel",
   buyer_email:"buyer@example.test",intended_use_text:original,consent_copy_version:"buyer-request-v1",consent_acknowledged:1,submitted_at:now});
  const terms={...r,channels_json:JSON.stringify(r.channels),territories_json:JSON.stringify(r.territories),paid_advertising:1};delete terms.channels;delete terms.territories;
  insert(f.db,"terms_versions",{terms_version_id:ids.terms,case_id:ids.case,version_number:1,resolution_status:"complete",...terms,
   source_kind:"human_corrected",terms_hash:termsHash,created_by_actor:"creator",created_at:now});
  insert(f.db,"quotes",{quote_id:ids.quote,case_id:ids.case,quote_version_number:1,terms_version_id:ids.terms,pricing_policy_id:ids.policy,
   pricing_policy_version:1,amount_cents:42500,currency:"USD",status:"current",calculation_hash:calculationHash,created_at:now});
  lines.forEach((l,i)=>insert(f.db,"quote_lines",{quote_line_id:crypto.randomUUID(),quote_id:ids.quote,line_position:i+1,line_code:l.code,
   description:l.description,amount_cents:l.amount_cents,created_at:now}));
  insert(f.db,"creator_decisions",{creator_decision_id:ids.decision,case_id:ids.case,terms_version_id:ids.terms,quote_id:ids.quote,decision:"approved",actor_reference:"fixture-creator",decided_at:now});
  insert(f.db,"buyer_acceptances",{buyer_acceptance_id:ids.acceptance,case_id:ids.case,terms_version_id:ids.terms,quote_id:ids.quote,
   creator_decision_id:ids.decision,acceptance_copy_version:"acceptance-v1",accepted_at:now});
  const status=state==="refunded"?"fully_refunded":"paid";
  insert(f.db,"invoice_bindings",{invoice_binding_id:ids.binding,case_id:ids.case,terms_version_id:ids.terms,quote_id:ids.quote,
   buyer_acceptance_id:ids.acceptance,provider:"paypal",environment:"sandbox",provider_invoice_id:invoiceId,invoice_status:status,created_at:now,updated_at:now});
  insert(f.db,"permissions",{permission_id:permissionId,case_id:ids.case,invoice_binding_id:ids.binding,terms_version_id:ids.terms,
   permission_state:state,state_reason_code:"fixture_financial_totals_match",start_date:startDate,end_date_exclusive:end,
   state_effective_at:now,created_at:now,updated_at:now});
  insert(f.db,"verification_records",{verification_record_id:ids.verification,case_id:ids.case,public_verification_id:"RECEIPT_TEST_NOT_A_CAPABILITY",current_status:"invalid",created_at:now,updated_at:now});
  insert(f.db,"paypal_reconciliation_outbox",{invoice_binding_id:ids.binding,requested_generation:1,completed_generation:1,updated_at:now});
  observation(f.db,1,status);evidence(f.db,"paid");if(state==="refunded")evidence(f.db,"fully_refunded");
  let extraction=null;
  if(ai){
   extraction=crypto.randomUUID();insert(f.db,"extraction_attempts",{extraction_attempt_id:extraction,case_id:ids.case,attempt_number:1,
    status:"completed",extractor_version:"deterministic-v1",model_id:"diagnostic-only",model_version:"test-v1",artifact_hash:"c".repeat(64),
    input_hash:await sha256Hex(original),started_at:now,completed_at:now});
  }
  f.db.prepare(`UPDATE licensing_cases SET request_submission_id=?,latest_terms_version_id=?,latest_quote_id=?,latest_creator_decision_id=?,
    latest_buyer_acceptance_id=?,invoice_binding_id=?,verification_record_id=?,permission_id=?,latest_extraction_attempt_id=? WHERE case_id=?`)
   .run(ids.request,ids.terms,ids.quote,ids.decision,ids.acceptance,ids.binding,ids.verification,permissionId,extraction,ids.case);
  audit(f.db);
 }
 const store=createD1ReceiptStore(f.adapter),service=createReceiptService(store,()=>new Date(currentTime));
 return {...f,store,service,setTime:t=>{currentTime=t;},last:()=>f.db.prepare("SELECT * FROM receipt_revisions ORDER BY revision_number DESC LIMIT 1").get(),
  verification:()=>f.db.prepare("SELECT * FROM verification_records WHERE verification_record_id=?").get(ids.verification)};
}
export function transition(f,state,at){
 const n=f.db.prepare("SELECT requested_generation n FROM paypal_reconciliation_outbox WHERE invoice_binding_id=?").get(ids.binding).n+1;
 const status=state==="refunded"?"fully_refunded":"paid";
 f.db.prepare("UPDATE permissions SET permission_state=?,state_effective_at=?,updated_at=?,row_version=row_version+1 WHERE permission_id=?").run(state,at,at,permissionId);
 f.db.prepare("UPDATE invoice_bindings SET invoice_status=?,row_version=row_version+1 WHERE invoice_binding_id=?").run(status,ids.binding);
 f.db.prepare("UPDATE licensing_cases SET row_version=row_version+1 WHERE case_id=?").run(ids.case);
 f.db.prepare("UPDATE verification_records SET current_status='invalid',row_version=row_version+1 WHERE verification_record_id=?").run(ids.verification);
 f.db.prepare("UPDATE paypal_reconciliation_outbox SET requested_generation=?,completed_generation=?,updated_at=? WHERE invoice_binding_id=?").run(n,n,at,ids.binding);
 observation(f.db,n,status,at);if(state==="refunded")evidence(f.db,"fully_refunded",at);
 audit(f.db,`permission.${state}`,n,at);f.setTime(at);
}
