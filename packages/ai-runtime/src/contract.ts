/** Strict, model-independent safety boundary for proposed licensing terms.
 * This module does not perform extraction or authorize any side effect.
 */
export const AI_TASK_CONTRACT_VERSION = "rights-extraction-v1" as const;

export const AI_RIGHTS_FIELDS = [
  "use_purpose",
  "channels",
  "paid_advertising",
  "territories",
  "start_date",
  "duration_days",
  "max_impressions",
  "exclusivity",
  "modification_scope",
  "attribution",
  "sublicensing",
  "ai_use",
] as const;

export type AiRightsField = (typeof AI_RIGHTS_FIELDS)[number];
export type AiResolution = "resolved" | "unresolved" | "contradictory" | "unsupported";
export type AiReasonCode =
  | "explicit_evidence"
  | "not_stated"
  | "ambiguous"
  | "low_confidence"
  | "uncalibrated"
  | "extraction_failed"
  | "conflicting_evidence"
  | "out_of_scope";

export interface AiEvidenceSpan {
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly text: string;
}

export interface AiCandidateField {
  readonly fieldName: AiRightsField;
  readonly resolutionState: AiResolution;
  readonly normalizedValue: unknown | null;
  readonly evidenceSpans: readonly AiEvidenceSpan[];
  readonly reasonCode: AiReasonCode;
  readonly reasonNote: string | null;
  readonly confidenceBasisPoints: number | null;
}

export interface AiExtractorIdentity {
  readonly kind: "model" | "deterministic";
  readonly extractorVersion: string;
  readonly modelId: string | null;
  readonly modelVersion: string | null;
  readonly artifactSha256: string | null;
}

export interface AiExtractionProposal {
  readonly contractVersion: typeof AI_TASK_CONTRACT_VERSION;
  readonly inputSha256: string;
  readonly extractor: AiExtractorIdentity;
  readonly fields: readonly AiCandidateField[];
}

/** A threshold set comes from an independently evaluated model artifact, never the model itself. */
export interface AiCalibrationPolicy {
  readonly policyVersion: string;
  readonly artifactSha256: string;
  readonly minimumBasisPoints: Readonly<Record<AiRightsField, number>>;
}

export interface AiExtractionAssessment {
  readonly contractVersion: typeof AI_TASK_CONTRACT_VERSION;
  readonly inputSha256: string;
  readonly status: "review_required" | "invalid_proposal";
  readonly reviewRequired: true;
  readonly quoteEligible: false;
  readonly permittedActions: readonly [];
  readonly issueCodes: readonly string[];
  readonly extractor: AiExtractorIdentity | null;
  readonly fields: readonly AiCandidateField[];
}

export type AiValidationResult =
  | { readonly ok: true; readonly proposal: AiExtractionProposal }
  | { readonly ok: false; readonly issueCodes: readonly string[] };

const SHA256 = /^[0-9a-f]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/u;
const RESOLUTIONS = ["resolved", "unresolved", "contradictory", "unsupported"] as const;
const UNRESOLVED_REASONS = [
  "not_stated", "ambiguous", "low_confidence", "uncalibrated", "extraction_failed",
] as const;
const CHANNELS = ["instagram_paid", "facebook_paid"] as const;
const TERRITORIES = ["US", "CA"] as const;

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function shortIdentifier(value: unknown): value is string {
  return typeof value === "string" && MODEL_ID.test(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function canonicalArray(value: unknown, allowed: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length >= 1 && value.length <= allowed.length
    && value.every((item) => typeof item === "string" && allowed.includes(item))
    && new Set(value).size === value.length
    && value.every((item, index) => allowed.indexOf(item) > (index === 0 ? -1 : allowed.indexOf(value[index - 1])));
}

function supportedValue(field: AiRightsField, value: unknown): boolean {
  switch (field) {
    case "use_purpose": return value === "commercial";
    case "channels": return canonicalArray(value, CHANNELS);
    case "paid_advertising": return value === true;
    case "territories": return canonicalArray(value, TERRITORIES);
    case "start_date": return validDate(value);
    case "duration_days": return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 365;
    case "max_impressions": return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 500_000;
    case "exclusivity": return value === "non_exclusive";
    case "modification_scope": return value === "none" || value === "crop_only";
    case "attribution": return value === "required" || value === "not_required";
    case "sublicensing": return value === "prohibited";
    case "ai_use": return value === "prohibited";
  }
}

function validSpans(value: unknown, original: string): value is readonly AiEvidenceSpan[] {
  if (!Array.isArray(value) || value.length > 4) return false;
  const observed = new Set<string>();
  for (const entry of value) {
    if (!record(entry) || !exactKeys(entry, ["startUtf16", "endUtf16", "text"])) return false;
    const start = entry.startUtf16;
    const end = entry.endUtf16;
    const text = entry.text;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || typeof start !== "number" || typeof end !== "number"
      || typeof text !== "string" || text.length < 1 || text.length > 600
      || start < 0 || end <= start || end > original.length
      || original.slice(start, end) !== text) return false;
    const key = `${start}:${end}`;
    if (observed.has(key)) return false;
    observed.add(key);
  }
  return true;
}

function validExtractor(value: unknown): value is AiExtractorIdentity {
  if (!record(value) || !exactKeys(value,
    ["kind", "extractorVersion", "modelId", "modelVersion", "artifactSha256"])) return false;
  if (!shortIdentifier(value.extractorVersion)) return false;
  if (value.kind === "deterministic") {
    return value.modelId === null && value.modelVersion === null && value.artifactSha256 === null;
  }
  return value.kind === "model" && shortIdentifier(value.modelId)
    && shortIdentifier(value.modelVersion)
    && typeof value.artifactSha256 === "string" && SHA256.test(value.artifactSha256);
}

function validField(value: unknown, original: string, kind: AiExtractorIdentity["kind"]): value is AiCandidateField {
  if (!record(value) || !exactKeys(value, [
    "fieldName", "resolutionState", "normalizedValue", "evidenceSpans", "reasonCode",
    "reasonNote", "confidenceBasisPoints",
  ])) return false;
  if (typeof value.fieldName !== "string"
    || !AI_RIGHTS_FIELDS.includes(value.fieldName as AiRightsField)
    || !RESOLUTIONS.includes(value.resolutionState as AiResolution)
    || !validSpans(value.evidenceSpans, original)) return false;
  const spans = value.evidenceSpans as readonly AiEvidenceSpan[];
  const note = value.reasonNote;
  const confidence = value.confidenceBasisPoints;
  if (kind === "deterministic" && confidence !== null) return false;
  if (confidence !== null && !(typeof confidence === "number"
    && Number.isInteger(confidence) && confidence >= 0 && confidence <= 10_000)) return false;
  switch (value.resolutionState) {
    case "resolved":
      return value.reasonCode === "explicit_evidence" && note === null && spans.length >= 1
        && (kind === "deterministic" || confidence !== null)
        && supportedValue(value.fieldName as AiRightsField, value.normalizedValue);
    case "unresolved":
      return value.normalizedValue === null && confidence === null && note === null
        && UNRESOLVED_REASONS.includes(value.reasonCode as (typeof UNRESOLVED_REASONS)[number])
        && (value.reasonCode !== "not_stated" || spans.length === 0);
    case "contradictory":
      return value.normalizedValue === null && confidence === null && spans.length >= 2
        && value.reasonCode === "conflicting_evidence"
        && typeof note === "string" && note.trim().length >= 1 && note.length <= 300;
    case "unsupported":
      return value.normalizedValue === null && confidence === null && spans.length >= 1
        && value.reasonCode === "out_of_scope"
        && typeof note === "string" && note.trim().length >= 1 && note.length <= 300;
    default:
      return false;
  }
}

function snapshotField(field: AiCandidateField): AiCandidateField {
  const value = Array.isArray(field.normalizedValue)
    ? Object.freeze([...field.normalizedValue]) : field.normalizedValue;
  return Object.freeze({
    ...field,
    normalizedValue: value,
    evidenceSpans: Object.freeze(field.evidenceSpans.map((span) => Object.freeze({ ...span }))),
  });
}

function snapshotProposal(proposal: AiExtractionProposal): AiExtractionProposal {
  return Object.freeze({
    ...proposal,
    extractor: Object.freeze({ ...proposal.extractor }),
    fields: Object.freeze(proposal.fields.map(snapshotField)),
  });
}

function snapshotAssessment(assessment: AiExtractionAssessment): AiExtractionAssessment {
  return Object.freeze({
    ...assessment,
    issueCodes: Object.freeze([...assessment.issueCodes]),
    permittedActions: Object.freeze([]) as readonly [],
    extractor: assessment.extractor ? Object.freeze({ ...assessment.extractor }) : null,
    fields: Object.freeze(assessment.fields.map(snapshotField)),
  });
}

/** Enforces the allowlist before any downstream code receives a candidate. */
export function validateAiExtractionProposal(
  raw: unknown,
  originalText: string,
  expectedInputSha256: string,
): AiValidationResult {
  const issues: string[] = [];
  if (typeof originalText !== "string" || Array.from(originalText).length < 40
    || Array.from(originalText).length > 4_000 || !SHA256.test(expectedInputSha256)) {
    return { ok: false, issueCodes: ["invalid_input_context"] };
  }
  if (!record(raw) || !exactKeys(raw, ["contractVersion", "inputSha256", "extractor", "fields"])) {
    return { ok: false, issueCodes: ["unauthorized_proposal_shape"] };
  }
  if (raw.contractVersion !== AI_TASK_CONTRACT_VERSION) issues.push("unsupported_contract_version");
  if (raw.inputSha256 !== expectedInputSha256) issues.push("input_hash_mismatch");
  if (!validExtractor(raw.extractor)) issues.push("invalid_extractor_identity");
  const kind = validExtractor(raw.extractor) ? raw.extractor.kind : "model";
  if (!Array.isArray(raw.fields) || raw.fields.length !== AI_RIGHTS_FIELDS.length) {
    issues.push("incomplete_field_set");
  } else {
    const names = new Set<AiRightsField>();
    for (const field of raw.fields) {
      if (record(field) && typeof field.fieldName === "string"
        && AI_RIGHTS_FIELDS.includes(field.fieldName as AiRightsField)) {
        const name = field.fieldName as AiRightsField;
        if (names.has(name)) issues.push("duplicate_field_name");
        names.add(name);
      }
      if (!validField(field, originalText, kind)) issues.push("invalid_field_observation");
    }
    if (names.size !== AI_RIGHTS_FIELDS.length
      || AI_RIGHTS_FIELDS.some((name) => !names.has(name))) issues.push("missing_field_name");
    if (raw.fields.some((field, index) => !record(field)
      || field.fieldName !== AI_RIGHTS_FIELDS[index])) issues.push("noncanonical_field_order");
  }
  if (issues.length > 0) return { ok: false, issueCodes: [...new Set(issues)] };
  return { ok: true, proposal: snapshotProposal(raw as unknown as AiExtractionProposal) };
}

function abstained(fieldName: AiRightsField, reasonCode: AiReasonCode): AiCandidateField {
  return {
    fieldName,
    resolutionState: "unresolved",
    normalizedValue: null,
    evidenceSpans: [],
    reasonCode,
    reasonNote: null,
    confidenceBasisPoints: null,
  };
}

function validCalibration(
  policy: AiCalibrationPolicy | null,
  extractor: AiExtractorIdentity,
): policy is AiCalibrationPolicy {
  if (!policy || !shortIdentifier(policy.policyVersion)
    || policy.artifactSha256 !== extractor.artifactSha256
    || !record(policy.minimumBasisPoints)
    || !exactKeys(policy.minimumBasisPoints, AI_RIGHTS_FIELDS)) return false;
  return AI_RIGHTS_FIELDS.every((field) => {
    const threshold = policy.minimumBasisPoints[field];
    return Number.isInteger(threshold) && threshold >= 0 && threshold <= 10_000;
  });
}

/** Nothing returned here is quoteable, even if all fields are supported. */
export function assessAiExtraction(
  raw: unknown,
  originalText: string,
  expectedInputSha256: string,
  calibration: AiCalibrationPolicy | null = null,
): AiExtractionAssessment {
  const validated = validateAiExtractionProposal(raw, originalText, expectedInputSha256);
  if (!validated.ok) return snapshotAssessment({
    contractVersion: AI_TASK_CONTRACT_VERSION,
    inputSha256: expectedInputSha256,
    status: "invalid_proposal",
    reviewRequired: true,
    quoteEligible: false,
    permittedActions: [],
    issueCodes: validated.issueCodes,
    extractor: null,
    fields: AI_RIGHTS_FIELDS.map((field) => abstained(field, "extraction_failed")),
  });
  const { proposal } = validated;
  const trustedCalibration = proposal.extractor.kind === "model"
    && validCalibration(calibration, proposal.extractor);
  const fields = proposal.fields.map((field): AiCandidateField => {
    if (proposal.extractor.kind !== "model" || field.resolutionState !== "resolved") return field;
    if (!trustedCalibration) return {
      ...abstained(field.fieldName, "uncalibrated"),
      evidenceSpans: field.evidenceSpans,
    };
    if (field.confidenceBasisPoints! < calibration!.minimumBasisPoints[field.fieldName]) return {
      ...abstained(field.fieldName, "low_confidence"),
      evidenceSpans: field.evidenceSpans,
    };
    return field;
  });
  return snapshotAssessment({
    contractVersion: AI_TASK_CONTRACT_VERSION,
    inputSha256: proposal.inputSha256,
    status: "review_required",
    reviewRequired: true,
    quoteEligible: false,
    permittedActions: [],
    issueCodes: [],
    extractor: proposal.extractor,
    fields,
  });
}

/** The default without a model is explicit abstention, not a fabricated prediction. */
export function abstainAllAiFields(inputSha256: string): AiExtractionAssessment {
  return snapshotAssessment({
    contractVersion: AI_TASK_CONTRACT_VERSION,
    inputSha256,
    status: "review_required",
    reviewRequired: true,
    quoteEligible: false,
    permittedActions: [],
    issueCodes: ["extractor_not_configured"],
    extractor: null,
    fields: AI_RIGHTS_FIELDS.map((field) => abstained(field, "extraction_failed")),
  });
}
