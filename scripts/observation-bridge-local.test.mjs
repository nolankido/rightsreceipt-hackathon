import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OBSERVATION_FIELD_ORDER, evidenceRowsFromAssessment, verifySavedEvidence,
} from "../packages/ai-runtime/src/observation-bridge.ts";

const original = "Paid Instagram posts within US and Canada. No sublicensing, and AI training is forbidden.";
const fields = () => OBSERVATION_FIELD_ORDER.map(fieldName=>({
  fieldName, resolutionState:"unresolved", normalizedValue:null,
  evidenceSpans:[], reasonCode:"not_stated", reasonNote:null, confidenceBasisPoints:null,
}));
const state=(fieldName, snippets, value, resolutionState="resolved",reasonNote=null)=>({
  fieldName,resolutionState,normalizedValue:value,
  evidenceSpans:snippets.map(text=>({
    startUtf16:original.indexOf(text),endUtf16:original.indexOf(text)+text.length,text,
  })),
  reasonCode:resolutionState==="resolved"?"explicit_evidence":
    resolutionState==="contradictory"?"conflicting_evidence":"out_of_scope",
  reasonNote,confidenceBasisPoints:null,
});
const proposal=()=>({
  status:"review_required",reviewRequired:true,quoteEligible:false,permittedActions:[],
  extractor:{kind:"deterministic",extractorVersion:"rights-rule-baseline-v1"}, fields:fields(),
});
const rows=p=>evidenceRowsFromAssessment(p,original,"rights-rule-baseline-v1");

test("twelve missing fields create twelve explicit records",()=>{
  const r=rows(proposal());assert.equal(r.length,12);
  assert.ok(r.every(x=>x.provenance==="deterministic"&&x.normalizedValueJson===null&&x.evidenceText===null));
});
test("resolved field preserves exact UTF-16 offsets and JSON value",()=>{
  const p=proposal();p.fields[1]=state("channels",["Paid Instagram posts"],["instagram_paid"]);
  const r=rows(p);assert.equal(r[1].normalizedValueJson,'["instagram_paid"]');
  assert.equal(original.slice(r[1].evidenceStartUtf16,r[1].evidenceEndUtf16),r[1].evidenceText);
});
test("contradictions persist both spans",()=>{
  const p=proposal();p.fields[3]=state("territories",["US and Canada","Canada"],null,"contradictory","Two phrases conflict");
  const r=rows(p);assert.equal(r.length,13);
  assert.deepEqual(r.filter(x=>x.fieldName==="territories").map(x=>x.evidenceText),["US and Canada","Canada"]);
});
test("unsupported AI rights do not gain a positive value",()=>{
  const p=proposal();p.fields[11]=state("ai_use",["AI training"],null,"unsupported","AI use requested");
  assert.equal(rows(p)[11].normalizedValueJson,'{"note":"AI use requested"}');
});
test("forged source span fails closed",()=>{
  const p=proposal();p.fields[11]=state("ai_use",["AI training"],"prohibited");
  p.fields[11].evidenceSpans[0].startUtf16++;
  assert.throws(()=>rows(p),/Evidence offsets/);
});
test("resolved field with no citation is rejected",()=>{
  const p=proposal();p.fields[0]={...p.fields[0],resolutionState:"resolved",normalizedValue:"commercial"};
  assert.throws(()=>rows(p),/evidence/);
});
test("deterministic evidence cannot contain model confidence",()=>{
  const p=proposal();p.fields[1].confidenceBasisPoints=9900;
  assert.throws(()=>rows(p),/confidence/);
});
test("learned candidates cannot pose as deterministic observations",()=>{
  const p=proposal();p.extractor.kind="model";
  assert.throws(()=>rows(p),/deterministic/);
});
test("an extraction assessment cannot authorize a quote",()=>{
  const p=proposal();p.quoteEligible=true;
  assert.throws(()=>rows(p),/review-only/);
});
test("canonical field order is mandatory",()=>{
  const p=proposal();[p.fields[0],p.fields[1]]=[p.fields[1],p.fields[0]];
  assert.throws(()=>rows(p),/Field order/);
});
test("tampering and missing rows are detected",()=>{
  const expected=rows(proposal());assert.equal(verifySavedEvidence(expected,expected),true);
  const forged=expected.map(x=>({...x}));forged[0].resolutionState="resolved";
  assert.equal(verifySavedEvidence(expected,forged),false);
  assert.equal(verifySavedEvidence(expected,forged.slice(1)),false);
});
test("rows are frozen snapshots",()=>assert.ok(Object.isFrozen(rows(proposal())[0])));
