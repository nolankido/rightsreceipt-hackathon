import assert from "node:assert/strict";
import { test } from "node:test";
import { beginExplicitResolution, fieldsAwaitingExplicitChoice, REVIEW_FIELD_ORDER } from "../apps/web/src/review-draft.ts";

const supported = Object.freeze({
  use_purpose: "commercial", channels: ["instagram_paid", "facebook_paid"],
  paid_advertising: true, territories: ["US", "CA"], start_date: "2026-11-01",
  duration_days: 90, max_impressions: 500000, exclusivity: "non_exclusive",
  modification_scope: "crop_only", attribution: "required", sublicensing: "prohibited", ai_use: "prohibited",
});
const baseline = () => Object.fromEntries(REVIEW_FIELD_ORDER.map(name => [name, {state: "resolved", value: supported[name]}]));

test("opening a supported-value editor does not fill in example rights", () => {
  const draft = beginExplicitResolution();
  assert.deepEqual(draft, {state:"resolved",value:null});
  assert.notEqual(draft.value,"2026-11-01");
  assert.notEqual(draft.value,90);
  assert.notEqual(draft.value,500000);
});
test("all twelve material rights require a deliberate choice", () => {
  for (const name of REVIEW_FIELD_ORDER) {
    const draft = baseline(); draft[name]=beginExplicitResolution();
    assert.deepEqual(fieldsAwaitingExplicitChoice(draft),[name],name);
  }
});
test("an empty or missing array, date, numeric field or boolean does not pass as a choice", () => {
  const draft = baseline();
  draft.channels={state:"resolved",value:[]};
  draft.territories={state:"resolved",value:[]};
  draft.start_date={state:"resolved",value:""};
  draft.duration_days={state:"resolved"};
  draft.max_impressions={state:"resolved",value:null};
  draft.paid_advertising={state:"resolved"};
  assert.deepEqual(fieldsAwaitingExplicitChoice(draft),
    ["channels","paid_advertising","territories","start_date","duration_days","max_impressions"]);
});
test("unsupported, contradictory and unresolved are never converted to authorized values", () => {
  const draft=baseline();
  draft.ai_use={state:"unsupported",note:"Buyer requested training"};
  draft.territories={state:"contradictory",note:"Two regions"};
  draft.start_date={state:"unresolved"};
  assert.deepEqual(fieldsAwaitingExplicitChoice(draft),[]);
  assert.equal(draft.ai_use.value,undefined);
});
test("the full explicit canonical choice set has no missing selections",()=>{
  assert.deepEqual(fieldsAwaitingExplicitChoice(baseline()),[]);
});
test("unsupported scope values remain server-validation responsibility, not UI defaults",()=>{
  const draft=baseline();draft.territories={state:"resolved",value:["worldwide"]};
  assert.deepEqual(fieldsAwaitingExplicitChoice(draft),[]);
  assert.equal(draft.territories.value[0],"worldwide");
});
