/**
 * Validation-selected model margin gates. These are diagnostic scores,
 * not calibrated probabilities or permission to set rights.
 */
import type { LearnedLabel, PortableRightsField, UncalibratedModelRanking } from "./portable-model";

export const SELECTIVE_MARGIN_POLICY_SCHEMA = "rightsreceipt-selective-margin-gates-v1" as const;
export const CALIBRATION_FIELD_ORDER = [
  "use_purpose", "channels", "paid_advertising", "territories", "start_date",
  "duration_days", "max_impressions", "exclusivity", "modification_scope",
  "attribution", "sublicensing", "ai_use",
] as const satisfies readonly PortableRightsField[];

export interface SelectiveMarginPolicy {
  readonly schemaVersion: typeof SELECTIVE_MARGIN_POLICY_SCHEMA;
  readonly policyVersion: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly artifactSha256: string;
  readonly validationDataSha256: string;
  readonly metric: "top_minus_runner_up_raw_linear_score";
  readonly fieldThresholds: Readonly<Record<PortableRightsField, number>>;
  readonly selectionSource: "validation_only";
  readonly confidenceIsCalibratedProbability: false;
  readonly automaticResolutionApproved: false;
  readonly evidenceStillRequired: true;
  readonly reviewRequired: true;
  readonly quoteEligible: false;
  readonly permittedActions: readonly [];
}
export interface ReviewOnlyField {
  readonly fieldName: PortableRightsField;
  readonly gate: "candidate_unverified" | "abstained_margin" | "abstained_nonresolved";
  readonly candidateLabel: LearnedLabel | null;
  readonly margin: number;
  readonly requiredMargin: number;
  readonly confidenceBasisPoints: null;
  readonly resolutionState: "unresolved";
  readonly normalizedValue: null;
  readonly evidenceSpans: readonly [];
}
export interface ReviewOnlyAssessment {
  readonly status: "not_approved_for_automatic_resolution";
  readonly policyVersion: string;
  readonly artifactSha256: string;
  readonly reviewRequired: true;
  readonly quoteEligible: false;
  readonly permittedActions: readonly [];
  readonly confidenceIsCalibratedProbability: false;
  readonly fields: readonly ReviewOnlyField[];
}
const HASH = /^[0-9a-f]{64}$/u;
const VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/u;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((name) => Object.hasOwn(value, name));
}
function invalid(): never {
  throw new Error("Invalid, mismatched, or unauthorized selective model policy or prediction.");
}
function supportedLabel(field: PortableRightsField, label: LearnedLabel) {
  if (!record(label) || !exactKeys(label, ["resolutionState", "normalizedValue"])) return false;
  if (label.resolutionState !== "resolved") {
    return ["unresolved", "contradictory", "unsupported"].includes(label.resolutionState)
      && label.normalizedValue === null;
  }
  const value = label.normalizedValue;
  const uniqueList = (allowed: readonly string[]) => Array.isArray(value)
    && value.length >= 1 && value.length <= allowed.length
    && new Set(value).size === value.length
    && value.every((candidate, index) =>
      typeof candidate === "string" && allowed.includes(candidate)
        && (index === 0 || allowed.indexOf(value[index - 1]) < allowed.indexOf(candidate)));
  switch (field) {
    case "use_purpose": return value === "commercial";
    case "channels": return uniqueList(["instagram_paid", "facebook_paid"]);
    case "paid_advertising": return value === true;
    case "territories": return uniqueList(["US", "CA"]);
    case "start_date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
      const date = new Date(value + "T00:00:00.000Z");
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    case "duration_days": return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 365;
    case "max_impressions": return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 500_000;
    case "exclusivity": return value === "non_exclusive";
    case "modification_scope": return value === "none" || value === "crop_only";
    case "attribution": return value === "required" || value === "not_required";
    case "sublicensing": return value === "prohibited";
    case "ai_use": return value === "prohibited";
  }
}
export function verifySelectiveMarginPolicy(
  raw: unknown,
  expectedArtifactSha256: string,
  expectedValidationSha256: string,
): SelectiveMarginPolicy {
  if (!record(raw) || !exactKeys(raw, [
    "schemaVersion", "policyVersion", "modelId", "modelVersion", "artifactSha256",
    "validationDataSha256", "metric", "fieldThresholds", "selectionSource",
    "confidenceIsCalibratedProbability", "automaticResolutionApproved", "evidenceStillRequired",
    "reviewRequired", "quoteEligible", "permittedActions",
  ])) invalid();
  if (raw.schemaVersion !== SELECTIVE_MARGIN_POLICY_SCHEMA
    || typeof raw.policyVersion !== "string" || !VERSION.test(raw.policyVersion)
    || typeof raw.modelId !== "string" || !VERSION.test(raw.modelId)
    || typeof raw.modelVersion !== "string" || !VERSION.test(raw.modelVersion)
    || typeof raw.artifactSha256 !== "string" || !HASH.test(raw.artifactSha256)
    || raw.artifactSha256 !== expectedArtifactSha256
    || typeof raw.validationDataSha256 !== "string" || !HASH.test(raw.validationDataSha256)
    || raw.validationDataSha256 !== expectedValidationSha256
    || raw.metric !== "top_minus_runner_up_raw_linear_score"
    || raw.selectionSource !== "validation_only"
    || raw.confidenceIsCalibratedProbability !== false
    || raw.automaticResolutionApproved !== false
    || raw.evidenceStillRequired !== true || raw.reviewRequired !== true
    || raw.quoteEligible !== false || !Array.isArray(raw.permittedActions)
    || raw.permittedActions.length !== 0
    || !record(raw.fieldThresholds)
    || !exactKeys(raw.fieldThresholds, CALIBRATION_FIELD_ORDER)) invalid();
  for (const name of CALIBRATION_FIELD_ORDER) {
    const value = raw.fieldThresholds[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000) invalid();
  }
  const policy = raw as unknown as SelectiveMarginPolicy;
  return Object.freeze({
    ...policy,
    fieldThresholds: Object.freeze({ ...policy.fieldThresholds }),
    permittedActions: Object.freeze([]) as readonly [],
  });
}
/** Even a passing margin NEVER becomes an accepted rights observation. */
export function inspectLearnedRanking(
  ranking: UncalibratedModelRanking,
  policy: SelectiveMarginPolicy,
): ReviewOnlyAssessment {
  if (ranking.status !== "uncalibrated_review_only" || ranking.reviewRequired !== true
    || ranking.quoteEligible !== false || ranking.permittedActions.length !== 0
    || ranking.modelId !== policy.modelId || ranking.modelVersion !== policy.modelVersion
    || ranking.artifactSha256 !== policy.artifactSha256
    || ranking.fields.length !== CALIBRATION_FIELD_ORDER.length) invalid();
  const fields: ReviewOnlyField[] = [];
  for (let i = 0; i < CALIBRATION_FIELD_ORDER.length; i += 1) {
    const predicted = ranking.fields[i];
    const name = CALIBRATION_FIELD_ORDER[i];
    if (!predicted || !name || predicted.fieldName !== name
      || !Number.isFinite(predicted.margin) || predicted.margin < 0
      || !Number.isFinite(predicted.rawScore) || !Number.isFinite(predicted.runnerUpScore)
      || Math.abs(predicted.margin - (predicted.rawScore - predicted.runnerUpScore)) > 1e-6
      || !supportedLabel(name, predicted.label)
      || predicted.confidenceBasisPoints !== null || predicted.evidenceSpans.length !== 0) invalid();
    const threshold = policy.fieldThresholds[name];
    let gate: ReviewOnlyField["gate"] = "abstained_nonresolved";
    if (predicted.label.resolutionState === "resolved") {
      gate = predicted.margin >= threshold ? "candidate_unverified" : "abstained_margin";
    }
    const value = predicted.label.normalizedValue;
    const candidateLabel: LearnedLabel | null = gate === "candidate_unverified"
      ? Object.freeze({ resolutionState: "resolved",
          normalizedValue: Array.isArray(value) ? Object.freeze([...value]) : value }) as LearnedLabel : null;
    fields.push(Object.freeze({
      fieldName: name, gate, candidateLabel,
      margin: predicted.margin, requiredMargin: threshold,
      confidenceBasisPoints: null, resolutionState: "unresolved" as const,
      normalizedValue: null, evidenceSpans: Object.freeze([]) as readonly [],
    }));
  }
  return Object.freeze({
    status: "not_approved_for_automatic_resolution",
    policyVersion: policy.policyVersion,
    artifactSha256: policy.artifactSha256,
    reviewRequired: true, quoteEligible: false,
    permittedActions: Object.freeze([]) as readonly [],
    confidenceIsCalibratedProbability: false,
    fields: Object.freeze(fields),
  });
}
