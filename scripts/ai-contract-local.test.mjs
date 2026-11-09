import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  AI_RIGHTS_FIELDS,
  AI_TASK_CONTRACT_VERSION,
  validateAiExtractionProposal,
  assessAiExtraction,
  abstainAllAiFields,
} from "../packages/ai-runtime/src/contract.ts";

const input = "We request commercial paid Instagram and Facebook ads in the US and Canada for 90 days starting 2026-11-01, maximum 500000 impressions. The permission is non-exclusive. Cropping is permitted. Attribution required. No sublicensing. No AI training. Emoji 🎨 here.";
const inputSha256 = createHash("sha256").update(input).digest("hex");
const artifactSha256 = "a".repeat(64);
const evidence = (phrase) => {
  const startUtf16 = input.indexOf(phrase);
  assert.notEqual(startUtf16, -1, phrase);
  return { startUtf16, endUtf16: startUtf16 + phrase.length, text: phrase };
};
const sourceFor = {
  use_purpose: ["commercial", "commercial"],
  channels: [["instagram_paid", "facebook_paid"], "Instagram and Facebook"],
  paid_advertising: [true, "paid Instagram"],
  territories: [["US", "CA"], "US and Canada"],
  start_date: ["2026-11-01", "2026-11-01"],
  duration_days: [90, "90 days"],
  max_impressions: [500000, "500000 impressions"],
  exclusivity: ["non_exclusive", "non-exclusive"],
  modification_scope: ["crop_only", "Cropping"],
  attribution: ["required", "Attribution required"],
  sublicensing: ["prohibited", "No sublicensing"],
  ai_use: ["prohibited", "No AI training"],
};

function proposal(kind = "model") {
  return {
    contractVersion: AI_TASK_CONTRACT_VERSION,
    inputSha256,
    extractor: {
      kind,
      extractorVersion: "extractor-v1",
      modelId: kind === "model" ? "local-model" : null,
      modelVersion: kind === "model" ? "model-v1" : null,
      artifactSha256: kind === "model" ? artifactSha256 : null,
    },
    fields: AI_RIGHTS_FIELDS.map((fieldName) => ({
      fieldName,
      resolutionState: "resolved",
      normalizedValue: sourceFor[fieldName][0],
      evidenceSpans: [evidence(sourceFor[fieldName][1])],
      reasonCode: "explicit_evidence",
      reasonNote: null,
      confidenceBasisPoints: kind === "model" ? 9200 : null,
    })),
  };
}
const calibrate = (value = 9000) => ({
  policyVersion: "calibration-v1",
  artifactSha256,
  minimumBasisPoints: Object.fromEntries(AI_RIGHTS_FIELDS.map((name) => [name, value])),
});
const checkFailed = (p, code) => {
  const result = validateAiExtractionProposal(p, input, inputSha256);
  assert.equal(result.ok, false);
  assert.ok(result.issueCodes.includes(code), JSON.stringify(result.issueCodes));
  const safe = assessAiExtraction(p, input, inputSha256);
  assert.equal(safe.status, "invalid_proposal");
  assert.equal(safe.fields.length, 12);
  assert.ok(safe.fields.every((field) => field.resolutionState === "unresolved" && field.normalizedValue === null));
  assert.equal(safe.quoteEligible, false);
  assert.deepEqual(safe.permittedActions, []);
};

test("all twelve canonical fields in the exact contract order", () => {
  const p = proposal();
  const result = validateAiExtractionProposal(p, input, inputSha256);
  assert.equal(result.ok, true);
  assert.deepEqual(result.proposal.fields.map((field) => field.fieldName), AI_RIGHTS_FIELDS);
});
test("unconfigured model scores abstain, not auto-fill consequential terms", () => {
  const a = assessAiExtraction(proposal(), input, inputSha256);
  assert.equal(a.status, "review_required");
  assert.equal(a.reviewRequired, true);
  assert.equal(a.quoteEligible, false);
  assert.deepEqual(a.permittedActions, []);
  assert.ok(a.fields.every((f) => f.resolutionState === "unresolved" && f.reasonCode === "uncalibrated"));
});
test("trusted matching per-field calibration allows proposals only", () => {
  const a = assessAiExtraction(proposal(), input, inputSha256, calibrate());
  assert.equal(a.fields.filter((f) => f.resolutionState === "resolved").length, 12);
  assert.equal(a.quoteEligible, false);
  assert.equal(a.reviewRequired, true);
});
test("per-field confidence lower than threshold abstains", () => {
  const p = proposal(); p.fields[0].confidenceBasisPoints = 8700;
  const a = assessAiExtraction(p, input, inputSha256, calibrate(9000));
  assert.equal(a.fields[0].resolutionState, "unresolved");
  assert.equal(a.fields[0].reasonCode, "low_confidence");
  assert.equal(a.fields[0].normalizedValue, null);
  assert.equal(a.fields[1].resolutionState, "resolved");
});
test("calibration for a different model cannot authorize proposals", () => {
  const policy = calibrate(); policy.artifactSha256 = "b".repeat(64);
  assert.ok(assessAiExtraction(proposal(), input, inputSha256, policy).fields.every((f) => f.reasonCode === "uncalibrated"));
});
test("incomplete calibration cannot authorize proposals", () => {
  const p = calibrate(); delete p.minimumBasisPoints.ai_use;
  assert.ok(assessAiExtraction(proposal(), input, inputSha256, p).fields.every((f) => f.reasonCode === "uncalibrated"));
});
test("deterministic proposals use null numeric confidence", () => {
  const a = assessAiExtraction(proposal("deterministic"), input, inputSha256);
  assert.ok(a.fields.every((f) => f.resolutionState === "resolved" && f.confidenceBasisPoints === null));
  assert.equal(a.quoteEligible, false);
});
test("does not mistake emoji codepoints for UTF-16 offsets", () => {
  const p = proposal();
  p.fields[0].evidenceSpans[0] = evidence("Emoji 🎨 here");
  assert.equal(validateAiExtractionProposal(p, input, inputSha256).ok, true);
  p.fields[0].evidenceSpans[0].endUtf16 -= 1;
  checkFailed(p, "invalid_field_observation");
});
test("rejects invented evidence not present verbatim in original", () => {
  const p = proposal(); p.fields[0].evidenceSpans[0].text = "commercial use is approved";
  checkFailed(p, "invalid_field_observation");
});
test("rejects UTF-16 offsets that do not exactly match excerpt", () => {
  const p = proposal(); p.fields[0].evidenceSpans[0].startUtf16 += 1;
  checkFailed(p, "invalid_field_observation");
});
test("rejects missing evidence for purported resolved field", () => {
  const p = proposal(); p.fields[0].evidenceSpans = [];
  checkFailed(p, "invalid_field_observation");
});
test("never accepts extra quote/payment/approval authority fields", () => {
  for (const key of ["price_cents", "confirm_payment", "approve", "permission_status", "tool_calls"]) {
    const p = proposal(); p[key] = true;
    checkFailed(p, "unauthorized_proposal_shape");
  }
});
test("forbids unauthorized keys inside individual fields", () => {
  const p = proposal(); p.fields[0].paymentState = "paid";
  checkFailed(p, "invalid_field_observation");
});
test("rejects input-binding mismatch", () => {
  const p = proposal(); p.inputSha256 = "f".repeat(64);
  checkFailed(p, "input_hash_mismatch");
});
test("rejects wrong contract version", () => {
  const p = proposal(); p.contractVersion = "rights-extraction-v2";
  checkFailed(p, "unsupported_contract_version");
});
test("rejects missing and duplicate rights fields", () => {
  const missing = proposal(); missing.fields.pop();
  checkFailed(missing, "incomplete_field_set");
  const duplicate = proposal(); duplicate.fields[1].fieldName = "use_purpose";
  checkFailed(duplicate, "duplicate_field_name");
});
test("rejects reordered fields because canonical order is binding", () => {
  const p = proposal(); [p.fields[0],p.fields[1]] = [p.fields[1],p.fields[0]];
  checkFailed(p, "noncanonical_field_order");
});
test("rejects unsupported field values masquerading as resolved", () => {
  for (const [name,value] of [
    ["exclusivity", "exclusive"], ["territories", ["worldwide"]],
    ["ai_use", "allowed"], ["sublicensing", "allowed"],
    ["duration_days", 366], ["max_impressions", 500001],
    ["paid_advertising", false], ["start_date", "2026-02-30"],
  ]) {
    const p = proposal(); p.fields.find((f)=>f.fieldName === name).normalizedValue = value;
    checkFailed(p, "invalid_field_observation");
  }
});
test("rejects reversed and repeated multi-valued labels", () => {
  for (const value of [["facebook_paid","instagram_paid"], ["instagram_paid","instagram_paid"]]) {
    const p = proposal(); p.fields[1].normalizedValue = value;
    checkFailed(p, "invalid_field_observation");
  }
});
test("unresolved omissions are explicit null abstentions", () => {
  const p = proposal(); p.fields[2] = {
    fieldName: "paid_advertising", resolutionState: "unresolved", normalizedValue: null,
    evidenceSpans: [], reasonCode: "not_stated", reasonNote: null, confidenceBasisPoints: null,
  };
  const result = assessAiExtraction(p, input, inputSha256, calibrate());
  assert.equal(result.fields[2].resolutionState, "unresolved");
  assert.equal(result.quoteEligible, false);
});
test("omitted terms cannot silently become defaults", () => {
  const p=proposal(); p.fields[11].normalizedValue = "prohibited"; p.fields[11].evidenceSpans = [];
  checkFailed(p, "invalid_field_observation");
});
test("contradictory observations require multiple exact spans", () => {
  const p = proposal(); p.fields[3] = {
    fieldName: "territories", resolutionState: "contradictory", normalizedValue: null,
    evidenceSpans: [evidence("US and Canada"), evidence("Canada")],
    reasonCode: "conflicting_evidence", reasonNote: "Locations conflict", confidenceBasisPoints: null,
  };
  assert.equal(validateAiExtractionProposal(p, input, inputSha256).ok, true);
  p.fields[3].evidenceSpans.pop();
  checkFailed(p, "invalid_field_observation");
});
test("unsupported state preserves explanation without coercing into a value", () => {
  const p=proposal(); p.fields[11] = {
    fieldName: "ai_use", resolutionState: "unsupported", normalizedValue: null,
    evidenceSpans: [evidence("AI training")], reasonCode: "out_of_scope",
    reasonNote: "Buyer requests model training", confidenceBasisPoints: null,
  };
  const a = assessAiExtraction(p,input,inputSha256,calibrate());
  assert.equal(a.fields[11].resolutionState,"unsupported");
  assert.equal(a.fields[11].normalizedValue,null);
  assert.equal(a.quoteEligible,false);
});
test("rejects fabricated model identity or unversioned model artifact", () => {
  const p=proposal(); p.extractor.artifactSha256=null;
  checkFailed(p,"invalid_extractor_identity");
});
test("deterministic evidence cannot contain invented numerical confidence", () => {
  const p=proposal("deterministic");p.fields[3].confidenceBasisPoints=9900;
  checkFailed(p,"invalid_field_observation");
});
test("invalid proposal falls back to twelve unresolved fields and sanitized reasons", () => {
  const a=assessAiExtraction({price:1},input,inputSha256);
  assert.equal(a.issueCodes[0],"unauthorized_proposal_shape");
  assert.equal(a.fields.length,12);
  assert.ok(a.fields.every(f=>f.reasonCode==="extraction_failed"));
  assert.ok(!JSON.stringify(a).includes(input));
});
test("no configured extractor returns explicit all-abstain result", () => {
  const a=abstainAllAiFields(inputSha256);
  assert.equal(a.quoteEligible,false);
  assert.equal(a.reviewRequired,true);
  assert.deepEqual(a.permittedActions,[]);
  assert.equal(a.fields.filter(f=>f.normalizedValue!==null).length,0);
});

test("accepted proposals and assessed fields are snapshots, not mutable model objects", () => {
  const raw=proposal();
  const validation=validateAiExtractionProposal(raw,input,inputSha256);
  assert.equal(validation.ok,true);
  raw.fields[0].normalizedValue="exclusive";
  assert.equal(validation.proposal.fields[0].normalizedValue,"commercial");
  assert.ok(Object.isFrozen(validation.proposal.fields[0]));
  assert.throws(()=>{validation.proposal.fields[0].normalizedValue="exclusive";},TypeError);
  const assessment=assessAiExtraction(proposal(),input,inputSha256,calibrate());
  assert.ok(Object.isFrozen(assessment));
  assert.ok(Object.isFrozen(assessment.fields[0].evidenceSpans[0]));
  assert.throws(()=>{assessment.fields[0].evidenceSpans[0].text="forged";},TypeError);
});
