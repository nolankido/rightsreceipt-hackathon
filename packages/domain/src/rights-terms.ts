import type { AssetRecord } from "./assets";
import type { BuyerRequestSubmissionRecord } from "./buyer-requests";

export const RIGHTS_FIELD_NAMES = [
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

export type RightsFieldName = (typeof RIGHTS_FIELD_NAMES)[number];
export type RightsResolutionState =
  | "resolved"
  | "unresolved"
  | "contradictory"
  | "unsupported";
export type ObservationProvenance = "deterministic" | "model" | "human";
export type TermsResolutionStatus =
  | "complete"
  | "incomplete"
  | "contradictory"
  | "unsupported";

export const RIGHTS_FIELD_LABELS: Readonly<Record<RightsFieldName, string>> = {
  use_purpose: "Use purpose",
  channels: "Channels",
  paid_advertising: "Paid advertising",
  territories: "Territory",
  start_date: "Start date",
  duration_days: "Duration",
  max_impressions: "Maximum impressions",
  exclusivity: "Exclusivity",
  modification_scope: "Modification scope",
  attribution: "Attribution",
  sublicensing: "Sublicensing",
  ai_use: "AI use",
};

export const CHANNEL_VALUES = ["instagram_paid", "facebook_paid"] as const;
export type ChannelValue = (typeof CHANNEL_VALUES)[number];
export const TERRITORY_VALUES = ["US", "CA"] as const;
export type TerritoryValue = (typeof TERRITORY_VALUES)[number];

export interface SupportedRightsValues {
  readonly use_purpose: "commercial";
  readonly channels: readonly ChannelValue[];
  readonly paid_advertising: true;
  readonly territories: readonly TerritoryValue[];
  readonly start_date: string;
  readonly duration_days: number;
  readonly max_impressions: number;
  readonly exclusivity: "non_exclusive";
  readonly modification_scope: "none" | "crop_only";
  readonly attribution: "required" | "not_required";
  readonly sublicensing: "prohibited";
  readonly ai_use: "prohibited";
}

export interface ResolvedRightsFieldEdit {
  readonly state: "resolved";
  readonly value: unknown;
}

export interface UnresolvedRightsFieldEdit {
  readonly state: "unresolved";
}

export interface ExceptionalRightsFieldEdit {
  readonly state: "unsupported" | "contradictory";
  readonly note: string;
}

export type RightsFieldEdit =
  | ResolvedRightsFieldEdit
  | UnresolvedRightsFieldEdit
  | ExceptionalRightsFieldEdit;

export interface ManualRightsReviewInput {
  readonly fields: Readonly<Record<RightsFieldName, RightsFieldEdit>>;
}

export interface RightsReviewIssue {
  readonly field: RightsFieldName | "fields";
  readonly code: string;
  readonly message: string;
}

export interface ExtractionAttemptRecord {
  readonly extractionAttemptId: string;
  readonly caseId: string;
  readonly attemptNumber: number;
  readonly status: "completed";
  readonly extractorVersion: "manual-review-v1";
  readonly modelId: null;
  readonly modelVersion: null;
  readonly artifactHash: null;
  readonly inputHash: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly errorCode: null;
}

export interface FieldObservationRecord {
  readonly fieldObservationId: string;
  readonly extractionAttemptId: string;
  readonly fieldName: RightsFieldName;
  readonly normalizedValueJson: string | null;
  readonly resolutionState: RightsResolutionState;
  readonly provenance: ObservationProvenance;
  readonly confidenceBasisPoints: number | null;
  readonly evidenceStartUtf16: number | null;
  readonly evidenceEndUtf16: number | null;
  readonly evidenceText: string | null;
  readonly resolverVersion: string;
  readonly createdAt: string;
}

export interface TermsVersionRecord {
  readonly termsVersionId: string;
  readonly caseId: string;
  readonly versionNumber: number;
  readonly resolutionStatus: TermsResolutionStatus;
  readonly usePurpose: "commercial" | null;
  readonly channels: readonly ChannelValue[] | null;
  readonly paidAdvertising: true | null;
  readonly territories: readonly TerritoryValue[] | null;
  readonly startDate: string | null;
  readonly durationDays: number | null;
  readonly maxImpressions: number | null;
  readonly exclusivity: "non_exclusive" | null;
  readonly modificationScope: "none" | "crop_only" | null;
  readonly attribution: "required" | "not_required" | null;
  readonly sublicensing: "prohibited" | null;
  readonly aiUse: "prohibited" | null;
  readonly sourceKind: "human_corrected";
  readonly termsHash: string;
  readonly createdByActor: "creator";
  readonly createdAt: string;
}

export interface AuditEventRecord {
  readonly auditEventId: string;
  readonly caseId: string;
  readonly aggregateType: "terms_review";
  readonly aggregateId: string;
  readonly aggregateSequence: number;
  readonly eventType: "terms.manual_revision_saved";
  readonly actorType: "creator";
  readonly actorReference: string;
  readonly payloadJson: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

export interface ManualTermsRevision {
  readonly extractionAttempt: ExtractionAttemptRecord;
  readonly observations: readonly FieldObservationRecord[];
  readonly termsVersion: TermsVersionRecord;
  readonly auditEvent: AuditEventRecord;
}

export interface RightsReviewCaseContext {
  readonly caseId: string;
  readonly workspaceId: string;
  readonly caseOutcome: "open" | "rejected" | "canceled";
  readonly caseRowVersion: number;
  readonly asset: AssetRecord;
  readonly request: BuyerRequestSubmissionRecord;
  readonly latestAttemptNumber: number;
  readonly latestTermsVersion: TermsVersionRecord | null;
  readonly latestObservations: readonly FieldObservationRecord[];
}

export interface ManualTermsRevisionContext {
  readonly caseId: string;
  readonly extractionAttemptId: string;
  readonly fieldObservationIds: Readonly<Record<RightsFieldName, string>>;
  readonly termsVersionId: string;
  readonly auditEventId: string;
  readonly attemptNumber: number;
  readonly versionNumber: number;
  readonly inputHash: string;
  readonly termsHash: string;
  readonly createdAt: string;
  readonly actorReference: string;
  readonly correlationId: string;
}

export interface RightsFieldReviewView {
  readonly fieldName: RightsFieldName;
  readonly label: string;
  readonly resolutionState: RightsResolutionState;
  readonly value: unknown | null;
  readonly note: string | null;
  readonly provenance: ObservationProvenance | "not_set";
  readonly confidenceBasisPoints: number | null;
  readonly evidenceText: string | null;
  readonly resolverVersion: string | null;
}

export class RightsReviewValidationError extends Error {
  readonly issues: readonly RightsReviewIssue[];

  constructor(issues: readonly RightsReviewIssue[]) {
    super("Rights review did not pass validation.");
    this.name = "RightsReviewValidationError";
    this.issues = issues;
  }
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoUtcInstant(value: string) {
  return value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

function isCanonicalDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function canonicalArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
): readonly T[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const unique = [...new Set(value)];
  if (unique.length !== value.length) return null;
  if (!unique.every((candidate): candidate is T =>
    typeof candidate === "string" && allowed.includes(candidate as T))) {
    return null;
  }
  return allowed.filter((candidate) => unique.includes(candidate));
}

function supportedValue(
  field: RightsFieldName,
  value: unknown,
): SupportedRightsValues[RightsFieldName] | null {
  switch (field) {
    case "use_purpose":
      return value === "commercial" ? value : null;
    case "channels":
      return canonicalArray(value, CHANNEL_VALUES);
    case "paid_advertising":
      return value === true ? true : null;
    case "territories":
      return canonicalArray(value, TERRITORY_VALUES);
    case "start_date":
      return typeof value === "string" && isCanonicalDate(value) ? value : null;
    case "duration_days":
      return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 365
        ? Number(value)
        : null;
    case "max_impressions":
      return Number.isInteger(value)
        && Number(value) >= 1
        && Number(value) <= 500_000
        ? Number(value)
        : null;
    case "exclusivity":
      return value === "non_exclusive" ? value : null;
    case "modification_scope":
      return value === "none" || value === "crop_only" ? value : null;
    case "attribution":
      return value === "required" || value === "not_required" ? value : null;
    case "sublicensing":
      return value === "prohibited" ? value : null;
    case "ai_use":
      return value === "prohibited" ? value : null;
  }
}

export function validateManualRightsReview(
  input: ManualRightsReviewInput,
): readonly RightsReviewIssue[] {
  const issues: RightsReviewIssue[] = [];
  if (!isPlainObject(input) || !isPlainObject(input.fields)) {
    return [
      {
        field: "fields",
        code: "invalid_review",
        message: "A rights review must include all material fields.",
      },
    ];
  }

  for (const field of RIGHTS_FIELD_NAMES) {
    const edit = input.fields[field];
    if (!isPlainObject(edit) || typeof edit.state !== "string") {
      issues.push({
        field,
        code: "missing_field",
        message: `${RIGHTS_FIELD_LABELS[field]} requires an explicit review state.`,
      });
      continue;
    }

    if (edit.state === "resolved") {
      const canonical = supportedValue(field, edit.value);
      if (canonical === null) {
        issues.push({
          field,
          code: "unsupported_resolved_value",
          message: `${RIGHTS_FIELD_LABELS[field]} must use a supported P0 value or be marked unresolved or unsupported.`,
        });
      }
      continue;
    }

    if (edit.state === "unresolved") continue;

    if (edit.state === "unsupported" || edit.state === "contradictory") {
      const note = typeof edit.note === "string" ? edit.note.trim() : "";
      if (note.length < 1 || note.length > 500) {
        issues.push({
          field,
          code: "explanation_required",
          message: `${RIGHTS_FIELD_LABELS[field]} requires a 1 through 500 character explanation.`,
        });
      }
      continue;
    }

    issues.push({
      field,
      code: "invalid_resolution_state",
      message: `${RIGHTS_FIELD_LABELS[field]} has an unrecognized review state.`,
    });
  }

  return issues;
}

export function canonicalizeManualRightsReview(
  input: ManualRightsReviewInput,
): ManualRightsReviewInput {
  const issues = validateManualRightsReview(input);
  if (issues.length > 0) throw new RightsReviewValidationError(issues);

  const fields = {} as Record<RightsFieldName, RightsFieldEdit>;
  for (const field of RIGHTS_FIELD_NAMES) {
    const edit = input.fields[field];
    if (edit.state === "resolved") {
      fields[field] = Object.freeze({
        state: "resolved",
        value: supportedValue(field, edit.value),
      });
    } else if (edit.state === "unresolved") {
      fields[field] = Object.freeze({ state: "unresolved" });
    } else {
      fields[field] = Object.freeze({
        state: edit.state,
        note: edit.note.trim(),
      });
    }
  }
  return Object.freeze({ fields: Object.freeze(fields) });
}

export function deriveTermsResolutionStatus(
  input: ManualRightsReviewInput,
): TermsResolutionStatus {
  const canonical = canonicalizeManualRightsReview(input);
  const states = RIGHTS_FIELD_NAMES.map((field) => canonical.fields[field].state);
  if (states.includes("unsupported")) return "unsupported";
  if (states.includes("contradictory")) return "contradictory";
  if (states.includes("unresolved")) return "incomplete";
  return "complete";
}

function canonicalizeJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJson(entry)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function manualRightsReviewCanonicalJson(
  input: ManualRightsReviewInput,
): string {
  const canonical = canonicalizeManualRightsReview(input);
  return canonicalizeJson({
    schema_version: "rights-review-v1",
    fields: Object.fromEntries(
      RIGHTS_FIELD_NAMES.map((field) => [field, canonical.fields[field]]),
    ),
  });
}

function observationJson(edit: RightsFieldEdit): string | null {
  if (edit.state === "resolved") return JSON.stringify(edit.value);
  if (edit.state === "unsupported" || edit.state === "contradictory") {
    return JSON.stringify({ note: edit.note });
  }
  return null;
}

function resolvedValue<K extends RightsFieldName>(
  input: ManualRightsReviewInput,
  field: K,
): SupportedRightsValues[K] | null {
  const edit = input.fields[field];
  if (edit.state !== "resolved") return null;
  return supportedValue(field, edit.value) as SupportedRightsValues[K] | null;
}

export function createManualTermsRevision(
  input: ManualRightsReviewInput,
  context: ManualTermsRevisionContext,
): ManualTermsRevision {
  const canonical = canonicalizeManualRightsReview(input);
  const idValues = [
    context.extractionAttemptId,
    context.termsVersionId,
    context.auditEventId,
    ...RIGHTS_FIELD_NAMES.map((field) => context.fieldObservationIds[field]),
  ];
  if (!idValues.every((value) => UUID_V4_PATTERN.test(value))) {
    throw new Error("Manual terms revision identifiers must be UUID version 4 values.");
  }
  if (!UUID_V4_PATTERN.test(context.caseId)) {
    throw new Error("Licensing case identifier must be a UUID version 4 value.");
  }
  if (!SHA256_PATTERN.test(context.inputHash) || !SHA256_PATTERN.test(context.termsHash)) {
    throw new Error("Manual terms revision hashes must be lowercase SHA-256 hexadecimal.");
  }
  if (!isIsoUtcInstant(context.createdAt)) {
    throw new Error("Manual terms revision time must be an ISO 8601 UTC instant.");
  }
  if (!Number.isInteger(context.attemptNumber) || context.attemptNumber < 1) {
    throw new Error("Attempt number must be a positive integer.");
  }
  if (!Number.isInteger(context.versionNumber) || context.versionNumber < 1) {
    throw new Error("Terms version number must be a positive integer.");
  }

  const observations = RIGHTS_FIELD_NAMES.map((field) => {
    const edit = canonical.fields[field];
    const record: FieldObservationRecord = Object.freeze({
      fieldObservationId: context.fieldObservationIds[field],
      extractionAttemptId: context.extractionAttemptId,
      fieldName: field,
      normalizedValueJson: observationJson(edit),
      resolutionState: edit.state,
      provenance: "human",
      confidenceBasisPoints: null,
      evidenceStartUtf16: null,
      evidenceEndUtf16: null,
      evidenceText: null,
      resolverVersion: "manual-review-v1",
      createdAt: context.createdAt,
    });
    return record;
  });

  const termsVersion: TermsVersionRecord = Object.freeze({
    termsVersionId: context.termsVersionId,
    caseId: context.caseId,
    versionNumber: context.versionNumber,
    resolutionStatus: deriveTermsResolutionStatus(canonical),
    usePurpose: resolvedValue(canonical, "use_purpose"),
    channels: resolvedValue(canonical, "channels"),
    paidAdvertising: resolvedValue(canonical, "paid_advertising"),
    territories: resolvedValue(canonical, "territories"),
    startDate: resolvedValue(canonical, "start_date"),
    durationDays: resolvedValue(canonical, "duration_days"),
    maxImpressions: resolvedValue(canonical, "max_impressions"),
    exclusivity: resolvedValue(canonical, "exclusivity"),
    modificationScope: resolvedValue(canonical, "modification_scope"),
    attribution: resolvedValue(canonical, "attribution"),
    sublicensing: resolvedValue(canonical, "sublicensing"),
    aiUse: resolvedValue(canonical, "ai_use"),
    sourceKind: "human_corrected",
    termsHash: context.termsHash,
    createdByActor: "creator",
    createdAt: context.createdAt,
  });

  return Object.freeze({
    extractionAttempt: Object.freeze({
      extractionAttemptId: context.extractionAttemptId,
      caseId: context.caseId,
      attemptNumber: context.attemptNumber,
      status: "completed",
      extractorVersion: "manual-review-v1",
      modelId: null,
      modelVersion: null,
      artifactHash: null,
      inputHash: context.inputHash,
      startedAt: context.createdAt,
      completedAt: context.createdAt,
      errorCode: null,
    }),
    observations: Object.freeze(observations),
    termsVersion,
    auditEvent: Object.freeze({
      auditEventId: context.auditEventId,
      caseId: context.caseId,
      aggregateType: "terms_review",
      aggregateId: context.termsVersionId,
      aggregateSequence: context.versionNumber,
      eventType: "terms.manual_revision_saved",
      actorType: "creator",
      actorReference: context.actorReference,
      payloadJson: JSON.stringify({
        terms_version_id: context.termsVersionId,
        version_number: context.versionNumber,
        resolution_status: termsVersion.resolutionStatus,
        source_kind: termsVersion.sourceKind,
      }),
      correlationId: context.correlationId,
      idempotencyKey: `terms-review:${context.caseId}:${context.termsHash}`,
      createdAt: context.createdAt,
    }),
  });
}

export function emptyRightsFieldViews(): readonly RightsFieldReviewView[] {
  return RIGHTS_FIELD_NAMES.map((fieldName) => ({
    fieldName,
    label: RIGHTS_FIELD_LABELS[fieldName],
    resolutionState: "unresolved",
    value: null,
    note: null,
    provenance: "not_set",
    confidenceBasisPoints: null,
    evidenceText: null,
    resolverVersion: null,
  }));
}

function parseObservationValue(
  observation: FieldObservationRecord,
): { value: unknown | null; note: string | null } {
  if (!observation.normalizedValueJson) return { value: null, note: null };
  try {
    const parsed: unknown = JSON.parse(observation.normalizedValueJson);
    if (
      (observation.resolutionState === "unsupported"
        || observation.resolutionState === "contradictory")
      && isPlainObject(parsed)
      && typeof parsed.note === "string"
    ) {
      return { value: null, note: parsed.note };
    }
    return { value: parsed, note: null };
  } catch {
    return { value: null, note: null };
  }
}

export function rightsFieldViewsFromObservations(
  observations: readonly FieldObservationRecord[],
): readonly RightsFieldReviewView[] {
  const byField = new Map(observations.map((observation) => [observation.fieldName, observation]));
  return RIGHTS_FIELD_NAMES.map((fieldName) => {
    const observation = byField.get(fieldName);
    if (!observation) return emptyRightsFieldViews().find((view) => view.fieldName === fieldName)!;
    const parsed = parseObservationValue(observation);
    return {
      fieldName,
      label: RIGHTS_FIELD_LABELS[fieldName],
      resolutionState: observation.resolutionState,
      value: parsed.value,
      note: parsed.note,
      provenance: observation.provenance,
      confidenceBasisPoints: observation.confidenceBasisPoints,
      evidenceText: observation.evidenceText,
      resolverVersion: observation.resolverVersion,
    };
  });
}
