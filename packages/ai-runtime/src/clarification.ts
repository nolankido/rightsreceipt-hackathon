/** Conservative, read-only clarification planner for the twelve P0 rights.
 * A question is not an authorization or a canonical terms revision.
 */
import type { AiEvidenceSpan, AiRightsField } from "./contract";

export const CLARIFICATION_VERSION = "rights-clarification-v1" as const;
export const CLARIFICATION_FIELDS = [
  "use_purpose", "channels", "paid_advertising", "territories",
  "start_date", "duration_days", "max_impressions", "exclusivity",
  "modification_scope", "attribution", "sublicensing", "ai_use",
] as const satisfies readonly AiRightsField[];

export type ClarificationFieldName = (typeof CLARIFICATION_FIELDS)[number];
export type ClarificationResolution = "resolved" | "unresolved" | "contradictory" | "unsupported";
export type ClarificationReason = "missing" | "ambiguous" | "low_confidence" | "contradictory";

export interface ClarificationFieldInput {
  readonly fieldName: ClarificationFieldName;
  readonly resolutionState: ClarificationResolution;
  readonly normalizedValue: unknown | null;
  readonly reasonCode?: string | null;
  readonly evidenceSpans?: readonly AiEvidenceSpan[];
}
export interface ClarificationPlannerInput {
  readonly originalText: string;
  readonly source: "human_corrected" | "deterministic_proposal";
  readonly fields: readonly ClarificationFieldInput[];
}
export interface ClarificationQuestion {
  readonly fieldName: ClarificationFieldName;
  readonly label: string;
  readonly reason: ClarificationReason;
  readonly question: string;
  readonly evidenceSpans: readonly AiEvidenceSpan[];
}
export interface ClarificationBlocker {
  readonly fieldName: ClarificationFieldName;
  readonly label: string;
  readonly reason: "unsupported_scope";
  readonly explanation: string;
}
export interface ClarificationPlan {
  readonly version: typeof CLARIFICATION_VERSION;
  readonly source: ClarificationPlannerInput["source"];
  readonly status: "questions_needed" | "unsupported_scope" | "human_confirmation_needed" | "complete_human_review";
  readonly questions: readonly ClarificationQuestion[];
  readonly unsupported: readonly ClarificationBlocker[];
  readonly resolvedFieldCount: number;
  readonly requiredFieldCount: 12;
  readonly reviewRequired: true;
  readonly quoteEligible: false;
  readonly permittedActions: readonly [];
}

const LABELS: Readonly<Record<ClarificationFieldName, string>> = Object.freeze({
  use_purpose: "Use purpose", channels: "Channels", paid_advertising: "Paid advertising",
  territories: "Territory", start_date: "Start date", duration_days: "Duration",
  max_impressions: "Impression limit", exclusivity: "Exclusivity",
  modification_scope: "Modification", attribution: "Attribution",
  sublicensing: "Sublicensing", ai_use: "AI use",
});
const PROMPTS: Readonly<Record<ClarificationFieldName, string>> = Object.freeze({
  use_purpose: "Is the proposed image use commercial advertising? State the intended purpose.",
  channels: "Which paid-social channels will use the image: Instagram, Facebook, or both?",
  paid_advertising: "Will this image be used in paid advertising rather than unpaid editorial content?",
  territories: "Which countries need the rights: the United States, Canada, or both?",
  start_date: "What exact UTC calendar date should the license start? Use YYYY-MM-DD.",
  duration_days: "How many calendar days should the license last, from 1 through 365?",
  max_impressions: "What is the maximum number of ad impressions, from 1 through 500,000?",
  exclusivity: "Are non-exclusive rights sufficient? Exclusive licensing is outside this demonstration.",
  modification_scope: "Will the image remain unchanged, or is cropping the only permitted modification?",
  attribution: "Must the image carry a creator credit, or is attribution not required?",
  sublicensing: "Can you confirm there will be no sublicensing to third parties?",
  ai_use: "Can you confirm the image will not be used for AI training or other AI model use?",
});
const BLOCKERS: Readonly<Record<ClarificationFieldName, string>> = Object.freeze({
  use_purpose: "Noncommercial or unsupported purposes are not covered by the P0 license.",
  channels: "Print, broadcast, outdoor, or other non-paid-social channels are not supported.",
  paid_advertising: "Unpaid/editorial use is outside the supported paid-advertising contract.",
  territories: "Only the United States and Canada are supported territories.",
  start_date: "An invalid or unsupported calendar date cannot be licensed.",
  duration_days: "License duration must be an exact number of days from 1 through 365.",
  max_impressions: "An impression cap above 500,000 is not supported.",
  exclusivity: "Exclusive rights cannot be issued by this P0 workflow.",
  modification_scope: "Edits other than no modification or crop-only are not supported.",
  attribution: "Conditional or unspecified credit arrangements need manual scope review.",
  sublicensing: "Sublicensing is prohibited by the P0 contract.",
  ai_use: "AI training and AI model use are prohibited by the P0 contract.",
});
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function invalid(): never {
  throw new Error("Invalid clarification source. No questions generated.");
}
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}
function supportedDate(value: unknown) {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function canonicalList(value: unknown, allowed: readonly string[]) {
  return Array.isArray(value) && value.length >= 1 && value.length <= allowed.length
    && value.every((item: unknown) => typeof item === "string" && allowed.includes(item))
    && new Set(value).size === value.length
    && value.every((item, index) => index === 0 || allowed.indexOf(value[index - 1]) < allowed.indexOf(item));
}
function supported(field: ClarificationFieldName, value: unknown): boolean {
  switch (field) {
    case "use_purpose": return value === "commercial";
    case "channels": return canonicalList(value, ["instagram_paid", "facebook_paid"]);
    case "paid_advertising": return value === true;
    case "territories": return canonicalList(value, ["US", "CA"]);
    case "start_date": return supportedDate(value);
    case "duration_days": return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 365;
    case "max_impressions": return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 500000;
    case "exclusivity": return value === "non_exclusive";
    case "modification_scope": return value === "none" || value === "crop_only";
    case "attribution": return value === "required" || value === "not_required";
    case "sublicensing": return value === "prohibited";
    case "ai_use": return value === "prohibited";
  }
}
function evidenceFor(field: ClarificationFieldInput, text: string, source: ClarificationPlannerInput["source"]): readonly AiEvidenceSpan[] {
  const raw = field.evidenceSpans ?? [];
  if (!Array.isArray(raw) || raw.length > 4) invalid();
  const seen = new Set<string>();
  const spans = raw.map((entry) => {
    if (!isObject(entry) || typeof entry.text !== "string" || entry.text.length === 0
      || entry.text.length > 600 || !Number.isSafeInteger(entry.startUtf16)
      || !Number.isSafeInteger(entry.endUtf16)
      || Number(entry.startUtf16) < 0 || Number(entry.endUtf16) <= Number(entry.startUtf16)
      || Number(entry.endUtf16) > text.length
      || text.slice(Number(entry.startUtf16), Number(entry.endUtf16)) !== entry.text) invalid();
    const key = `${entry.startUtf16}:${entry.endUtf16}`;
    if (seen.has(key)) invalid();
    seen.add(key);
    return Object.freeze({startUtf16: Number(entry.startUtf16),endUtf16: Number(entry.endUtf16),text: entry.text});
  });
  if (source === "deterministic_proposal") {
    if (field.resolutionState === "resolved" && spans.length < 1) invalid();
    if (field.resolutionState === "contradictory" && spans.length < 2) invalid();
    if (field.resolutionState === "unsupported" && spans.length < 1) invalid();
    if (field.reasonCode === "not_stated" && spans.length !== 0) invalid();
  }
  return Object.freeze(spans);
}
function reasonFor(field: ClarificationFieldInput): ClarificationReason {
  if (field.resolutionState === "contradictory") return "contradictory";
  if (field.reasonCode === "low_confidence" || field.reasonCode === "uncalibrated") return "low_confidence";
  if (field.reasonCode === "ambiguous") return "ambiguous";
  return "missing";
}

/** Fully deterministic, static templates. Never interpolate untrusted buyer instructions. */
export function buildClarificationPlan(input: ClarificationPlannerInput): ClarificationPlan {
  if (!isObject(input) || !onlyKeys(input,["source","originalText","fields"])
    || (input.source !== "human_corrected" && input.source !== "deterministic_proposal")
    || typeof input.originalText !== "string" || [...input.originalText].length < 40
    || [...input.originalText].length > 4000 || !Array.isArray(input.fields)
    || input.fields.length !== CLARIFICATION_FIELDS.length) invalid();
  const questions: ClarificationQuestion[] = [];
  const unsupported: ClarificationBlocker[] = [];
  let resolved = 0;
  for (let i = 0; i < CLARIFICATION_FIELDS.length; i++) {
    const expectedName = CLARIFICATION_FIELDS[i]!;
    const field = input.fields[i];
    if (!isObject(field) || !onlyKeys(field,["fieldName","resolutionState","normalizedValue","reasonCode","evidenceSpans"])
      || field.fieldName !== expectedName
      || !["resolved", "unresolved", "contradictory", "unsupported"].includes(String(field.resolutionState))) invalid();
    const acceptedReasons: Record<ClarificationResolution, readonly string[]> = {
      resolved: ["explicit_evidence"],
      unresolved: ["not_stated","ambiguous","low_confidence","uncalibrated","extraction_failed"],
      contradictory: ["conflicting_evidence"],
      unsupported: ["out_of_scope"],
    };
    if (field.reasonCode !== undefined && field.reasonCode !== null
      && !acceptedReasons[field.resolutionState as ClarificationResolution]!.includes(String(field.reasonCode))) invalid();
    const spans = evidenceFor(field as unknown as ClarificationFieldInput, input.originalText, input.source);
    if (field.resolutionState === "resolved") {
      if (!supported(expectedName, field.normalizedValue)) invalid();
      resolved++;
    } else if (field.normalizedValue !== null) {
      invalid();
    } else if (field.resolutionState === "unsupported") {
      unsupported.push(Object.freeze({
        fieldName: expectedName, label: LABELS[expectedName], reason: "unsupported_scope" as const,
        explanation: BLOCKERS[expectedName],
      }));
    } else {
      const reason = reasonFor(field as unknown as ClarificationFieldInput);
      const prefix = reason === "contradictory"
        ? "The request contains conflicting instructions. "
        : reason === "ambiguous" ? "This detail is ambiguous. "
          : reason === "low_confidence" ? "This detail lacks reliable evidence. " : "";
      questions.push(Object.freeze({
        fieldName: expectedName, label: LABELS[expectedName], reason,
        question: prefix + PROMPTS[expectedName], evidenceSpans: spans,
      }));
    }
  }
  const status: ClarificationPlan["status"] = unsupported.length ? "unsupported_scope"
    : questions.length ? "questions_needed"
      : input.source === "human_corrected" ? "complete_human_review" : "human_confirmation_needed";
  return Object.freeze({
    version: CLARIFICATION_VERSION, source: input.source, status,
    questions: Object.freeze(questions), unsupported: Object.freeze(unsupported),
    resolvedFieldCount: resolved, requiredFieldCount: 12 as const,
    reviewRequired: true as const, quoteEligible: false as const,
    permittedActions: Object.freeze([]) as readonly [],
  });
}
