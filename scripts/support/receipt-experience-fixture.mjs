/** Synthetic source snapshots for the production chain/material verifier.
 * This is an in-memory receipt port, not a live D1 or PayPal fixture.
 */
import { canonicalHash, sha256Hex } from '../../packages/receipts/src/canonical.ts';
import { createReceiptService } from '../../packages/receipts/src/service.ts';
export const uuid = n => `30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const ids = {case:uuid(1),workspace:uuid(2),asset:uuid(3),terms:uuid(4),quote:uuid(5),policy:uuid(6),decision:uuid(7),acceptance:uuid(8),binding:uuid(9),permission:uuid(10),verification:uuid(11),request:uuid(12),extraction:uuid(13)};
export const publicId='AbCDeFgHiJkLmNoPqRsTuVwXyZ0123_-';
export const buyerToken='aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789_-ABCDE';
export const NOW='2026-10-27T20:00:00.000Z';
const before='2026-10-27T19:00:00.000Z';
export async function receiptExperienceFixture({state='active',title='Harbor After Rain',issued=true}={}) {
 let now=NOW;
 const start=state==='scheduled'?'2026-11-01':state==='expired'?'2026-07-01':'2026-10-27';
 const end=new Date(Date.parse(start+'T00:00:00.000Z')+90*86400000).toISOString().slice(0,10);
 const rights={use_purpose:'commercial',channels:['instagram_paid','facebook_paid'],paid_advertising:true,territories:['US','CA'],start_date:start,duration_days:90,max_impressions:500000,exclusivity:'non_exclusive',modification_scope:'crop_only',attribution:'not_required',sublicensing:'prohibited',ai_use:'prohibited'};
 const termsHash=await canonicalHash({schema_version:'rights-review-v1',fields:Object.fromEntries(Object.entries(rights).map(([k,value])=>[k,{state:'resolved',value}]))});
 const rules=JSON.stringify({currency:'USD',version:1,rules:[{code:'base_commercial_digital',amount_cents:20000},{code:'paid_social',amount_cents:10000},{code:'territory_us_ca',amount_cents:5000},{code:'duration_31_90',amount_cents:5000},{code:'crop_only',amount_cents:2500}]});
 const policyHash=await sha256Hex(rules);
 const lineItems=[['base_commercial_digital','Base commercial digital license',20000],['paid_social','Paid social advertising',10000],['territory_us_ca','United States and Canada',5000],['duration_31_90','License duration: 31 to 90 days',5000],['crop_only','Crop permission',2500]].map(([code,description,amount_cents])=>({code,description,amount_cents}));
 const calcHash=await sha256Hex(JSON.stringify({schema_version:'quote-calculation-v1',terms_version_id:ids.terms,terms_hash:termsHash,pricing_policy_id:ids.policy,pricing_policy_version:1,policy_hash:policyHash,currency:'USD',license_start_date:start,license_end_date_exclusive:end,line_items:lineItems,total_cents:42500}));
 const original='Please license this photograph for paid advertising. PRIVATE ORIGINAL BUYER REQUEST.';
 const root={
  case:{case_id:ids.case,workspace_id:ids.workspace,asset_id:ids.asset,request_submission_id:ids.request,case_outcome:'open',latest_extraction_attempt_id:ids.extraction,latest_terms_version_id:ids.terms,latest_quote_id:ids.quote,latest_creator_decision_id:ids.decision,latest_buyer_acceptance_id:ids.acceptance,invoice_binding_id:ids.binding,permission_id:ids.permission,verification_record_id:ids.verification,row_version:1},
  workspace:{workspace_id:ids.workspace,display_name:'Maya Chen',row_version:1},
  asset:{asset_id:ids.asset,workspace_id:ids.workspace,title,asset_type:'photograph',creator_display_name:'Maya Chen',fingerprint_algorithm:'sha256',fingerprint_value:'f'.repeat(64),row_version:1},
  request:{request_submission_id:ids.request,case_id:ids.case,buyer_organization:'Private Buyer Organization',intended_use_text:original,consent_acknowledged:1,submitted_at:before},
  terms:{terms_version_id:ids.terms,case_id:ids.case,version_number:1,resolution_status:'complete',use_purpose:'commercial',channels_json:JSON.stringify(rights.channels),paid_advertising:1,territories_json:JSON.stringify(rights.territories),start_date:start,duration_days:90,max_impressions:500000,exclusivity:'non_exclusive',modification_scope:'crop_only',attribution:'not_required',sublicensing:'prohibited',ai_use:'prohibited',source_kind:'human_corrected',terms_hash:termsHash,created_by_actor:'creator',created_at:before},
  quote:{quote_id:ids.quote,case_id:ids.case,terms_version_id:ids.terms,pricing_policy_id:ids.policy,pricing_policy_version:1,amount_cents:42500,currency:'USD',status:'current',calculation_hash:calcHash,created_at:before},
  policy:{pricing_policy_id:ids.policy,workspace_id:ids.workspace,version_number:1,rules_json:rules,policy_hash:policyHash,currency:'USD'},
  decision:{creator_decision_id:ids.decision,case_id:ids.case,terms_version_id:ids.terms,quote_id:ids.quote,decision:'approved',decided_at:before},
  acceptance:{buyer_acceptance_id:ids.acceptance,case_id:ids.case,terms_version_id:ids.terms,quote_id:ids.quote,creator_decision_id:ids.decision,acceptance_copy_version:'buyer-v1',accepted_at:before},
  binding:{invoice_binding_id:ids.binding,case_id:ids.case,terms_version_id:ids.terms,quote_id:ids.quote,buyer_acceptance_id:ids.acceptance,provider:'paypal',environment:'sandbox',provider_invoice_id:'INV2-PRIVATE-FIXTURE',invoice_status:state==='refunded'?'fully_refunded':'paid',row_version:1},
  permission:{permission_id:ids.permission,case_id:ids.case,invoice_binding_id:ids.binding,terms_version_id:ids.terms,permission_state:state,state_reason_code:'validated_financial_record',start_date:start,end_date_exclusive:end,state_effective_at:before,review_required:0,row_version:1},
  verification:{verification_record_id:ids.verification,case_id:ids.case,public_verification_id:publicId,current_status:'invalid',current_receipt_revision_id:null,row_version:1},
  outbox:{invoice_binding_id:ids.binding,requested_generation:1,completed_generation:1,lease_token:null,blocked_code:null},
  financial:{invoice_binding_id:ids.binding,generation:1,conclusion:state==='refunded'?'fully_refunded':'paid',paid_cents:42500,refunded_cents:state==='refunded'?42500:0,detail_sha256:'d'.repeat(64),observed_at:before},
  lines:lineItems.map((x,i)=>({quote_id:ids.quote,line_position:i+1,line_code:x.code,description:x.description,amount_cents:x.amount_cents})),
  evidence:[{payment_evidence_id:uuid(20),invoice_binding_id:ids.binding,evidence_source:'reconciliation',source_reference:'invoice-financial:INV2-PRIVATE-FIXTURE',payment_status:'paid',amount_cents:42500,currency:'USD',observed_at:before,evidence_hash:'e'.repeat(64)}],
  extractions:[{extraction_attempt_id:ids.extraction,case_id:ids.case,attempt_number:1,status:'completed',extractor_version:'rules-v1',model_id:'review-only-classifier',model_version:'v1',artifact_hash:'a'.repeat(64),input_hash:await sha256Hex(original),completed_at:before}],
  audit:[{audit_event_id:uuid(30),case_id:ids.case,aggregate_type:'permission_lifecycle',aggregate_id:ids.binding,aggregate_sequence:1,event_type:'permission.activated',actor_type:'system',actor_reference:'financial-worker',payload_json:'{"private_internal_marker":"not public"}',correlation_id:uuid(31),idempotency_key:'fixture-key',created_at:before}],
 };
 if(state==='refunded')root.evidence.push({...root.evidence[0],payment_evidence_id:uuid(21),payment_status:'fully_refunded',evidence_hash:'b'.repeat(64)});
 const chain=[];let reads=0,writes=0,onLoad=null;
 const snapshot=()=>({root:structuredClone(root),chain:structuredClone(chain),sourceJson:JSON.stringify(root),chainJson:JSON.stringify(chain)});
 const store={
  async load(caseId){reads++;if(onLoad)await onLoad(reads);return caseId===ids.case?snapshot():null;},
  async commit(input){const s=snapshot();if(s.sourceJson!==input.sourceJson||s.chainJson!==input.expectedChainJson)throw Error('stale');writes++;
   chain.push(structuredClone(input.record));root.verification.current_receipt_revision_id=input.record.id;root.verification.current_status=input.state;root.verification.row_version++;
  },
  async restore(){writes++;},async invalidate(){writes++;root.verification.current_status='invalid';},
 };
 const clock=()=>new Date(now);
 if(issued){const result=await createReceiptService(store,clock).issue(ids.case);if(result.outcome!=='issued')throw Error('Fixture issue failed '+JSON.stringify(result));}
 return {root,chain,store,clock,snapshot,setNow:value=>{now=value;},setOnLoad:value=>{onLoad=value;},get reads(){return reads;},get writes(){return writes;}};
}
