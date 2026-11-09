import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CALIBRATION_FIELD_ORDER, inspectLearnedRanking, verifySelectiveMarginPolicy,
} from "../packages/ai-runtime/src/calibration.ts";
import { loadVerifiedPortableModel } from "../packages/ai-runtime/src/portable-model.ts";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const json = (path) => JSON.parse(read(path));
const digest = (s) => createHash("sha256").update(s).digest("hex");
const policy = json("data/model/v1/validation-margin-gates.json");
const artifact = read("data/model/v1/artifact.json");
const h = digest(artifact);
const v = json("data/synthetic/v1/manifest.json").files["validation.jsonl"].sha256;
const verified = () => verifySelectiveMarginPolicy(policy,h,v);
const values = {
  use_purpose:"commercial",channels:["instagram_paid"],paid_advertising:true,
  territories:["US"],start_date:"2026-11-15",duration_days:90,max_impressions:500000,
  exclusivity:"non_exclusive",modification_scope:"crop_only",attribution:"required",
  sublicensing:"prohibited",ai_use:"prohibited",
};
const fake = () => ({modelId:policy.modelId,modelVersion:policy.modelVersion,
  artifactSha256:h,status:"uncalibrated_review_only",reviewRequired:true,
  quoteEligible:false,permittedActions:[],fields:CALIBRATION_FIELD_ORDER.map((name)=>({
    fieldName:name,label:{resolutionState:"resolved",normalizedValue:values[name]},
    rawScore:20,runnerUpScore:0,margin:20,confidenceBasisPoints:null,evidenceSpans:[],
  }))});
test("policy has pinned source identity, 12 margins, no authority",()=>{
  const p=verified();assert.equal(p.artifactSha256,h);assert.equal(p.validationDataSha256,v);
  assert.equal(Object.keys(p.fieldThresholds).length,12);
  assert.equal(p.automaticResolutionApproved,false);assert.deepEqual(p.permittedActions,[]);
  assert.ok(Object.isFrozen(p.fieldThresholds));
});
test("mismatched source and arbitrary extra authority keys fail",()=>{
  assert.throws(()=>verifySelectiveMarginPolicy(policy,"f".repeat(64),v));
  assert.throws(()=>verifySelectiveMarginPolicy(policy,h,"f".repeat(64)));
  assert.throws(()=>verifySelectiveMarginPolicy({...policy,confirm_payment:true},h,v));
});
test("policy cannot claim calibrated confidence or automatic resolutions",()=>{
  for(const part of [{automaticResolutionApproved:true},{quoteEligible:true},
    {confidenceIsCalibratedProbability:true},{evidenceStillRequired:false},
    {permittedActions:["approve"]}])assert.throws(()=>verifySelectiveMarginPolicy({...policy,...part},h,v));
});
test("invalid or missing/extra margin values fail",()=>{
  for(const value of [0,-1,NaN,Infinity,"99"])assert.throws(()=>
    verifySelectiveMarginPolicy({...policy,fieldThresholds:{...policy.fieldThresholds,ai_use:value}},h,v));
  const missing={...policy.fieldThresholds};delete missing.ai_use;
  assert.throws(()=>verifySelectiveMarginPolicy({...policy,fieldThresholds:missing},h,v));
  assert.throws(()=>verifySelectiveMarginPolicy({...policy,fieldThresholds:{...policy.fieldThresholds,price_cents:1}},h,v));
});
test("high-margin candidates still leave all actual rights unresolved",()=>{
  const x=inspectLearnedRanking(fake(),verified());
  assert.equal(x.status,"not_approved_for_automatic_resolution");
  assert.equal(x.quoteEligible,false);assert.equal(x.reviewRequired,true);
  assert.deepEqual(x.permittedActions,[]);
  assert.ok(x.fields.every(f=>f.gate==="candidate_unverified"
    && f.resolutionState==="unresolved"&&f.normalizedValue===null
    && f.confidenceBasisPoints===null&&f.evidenceSpans.length===0));
});
test("low margin abstains and nonresolved labels stay nonresolved",()=>{
  const a=fake();a.fields[0].margin=0.01;a.fields[0].runnerUpScore=19.99;
  a.fields[1].label={resolutionState:"unsupported",normalizedValue:null};
  const res=inspectLearnedRanking(a,verified());
  assert.equal(res.fields[0].gate,"abstained_margin");
  assert.equal(res.fields[1].gate,"abstained_nonresolved");
});
test("source or model identity mismatch and field reorder fail",()=>{
  const a=fake();a.artifactSha256="0".repeat(64);
  assert.throws(()=>inspectLearnedRanking(a,verified()));
  const b=fake();[b.fields[0],b.fields[1]]=[b.fields[1],b.fields[0]];
  assert.throws(()=>inspectLearnedRanking(b,verified()));
});
test("fabricated evidence and confidence and score inconsistencies fail",()=>{
  const a=fake();a.fields[0].evidenceSpans=[{startUtf16:0,endUtf16:5,text:"false"}];
  assert.throws(()=>inspectLearnedRanking(a,verified()));
  const b=fake();b.fields[0].confidenceBasisPoints=9999;
  assert.throws(()=>inspectLearnedRanking(b,verified()));
  const c=fake();c.fields[0].margin=NaN;
  assert.throws(()=>inspectLearnedRanking(c,verified()));
  const d=fake();d.fields[0].margin=100;
  assert.throws(()=>inspectLearnedRanking(d,verified()));
});
test("unsupported normalized rights disguised as resolved fail",()=>{
  for(const [field,value] of [["sublicensing","allowed"],["duration_days",366],
    ["territories",["worldwide"]],["ai_use","allowed"]]){
    const a=fake();a.fields.find(f=>f.fieldName===field).label.normalizedValue=value;
    assert.throws(()=>inspectLearnedRanking(a,verified()));
  }
});
test("candidate snapshot is frozen and does not alias caller input",()=>{
  const a=fake(),result=inspectLearnedRanking(a,verified());
  a.fields[0].label.normalizedValue="forged";
  assert.equal(result.fields[0].candidateLabel.normalizedValue,"commercial");
  assert.ok(Object.isFrozen(result.fields[0]));
  assert.throws(()=>{result.fields[0].resolutionState="resolved";},TypeError);
});
test("portable inference remains review-only and carries no evidence spans",async()=>{
  const model=await loadVerifiedPortableModel(artifact,h);
  const sample=json("data/model/v1/reference-predictions.json").records[0];
  const assessed=inspectLearnedRanking(model.predict(sample.inputText),verified());
  assert.equal(assessed.fields.length,12);assert.equal(assessed.quoteEligible,false);
  assert.ok(assessed.fields.every(f=>f.evidenceSpans.length===0));
});
test("three held-out diagnostic failures keep deployment blocked",()=>{
  const report=json("data/model/v1/heldout-calibration-report.json");
  assert.equal(report.incorrectAcceptedReviewCandidates,3);
  assert.equal(report.deploymentVerdict,"blocked_false_resolutions_on_heldout");
  assert.equal(policy.automaticResolutionApproved,false);
});
