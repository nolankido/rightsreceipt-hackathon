/**
 * Lossless, strict mapping from source-grounded deterministic proposals to
 * append-only field_observations rows. This is NOT a terms version.
 */
import type { AiExtractionAssessment, AiCandidateField, AiRightsField } from "./contract";

export const OBSERVATION_FIELD_ORDER = [
  "use_purpose", "channels", "paid_advertising", "territories", "start_date",
  "duration_days", "max_impressions", "exclusivity", "modification_scope",
  "attribution", "sublicensing", "ai_use",
] as const satisfies readonly AiRightsField[];

export type EvidenceRow = {
  readonly fieldName: AiRightsField;
  readonly resolutionState: AiCandidateField["resolutionState"];
  readonly normalizedValueJson: string | null;
  readonly provenance: "deterministic";
  readonly confidenceBasisPoints: null;
  readonly evidenceStartUtf16: number | null;
  readonly evidenceEndUtf16: number | null;
  readonly evidenceText: string | null;
  readonly resolverVersion: string;
};

function canonicalValue(field: AiCandidateField): string | null {
  if (field.resolutionState === "resolved") {
    if (field.normalizedValue === null) throw new Error("Resolved proposal has no supported value.");
    return JSON.stringify(field.normalizedValue);
  }
  if (field.normalizedValue !== null) throw new Error("An unresolved field must not carry a value.");
  if (field.resolutionState === "contradictory" || field.resolutionState === "unsupported") {
    if (!field.reasonNote?.trim()) throw new Error("An exceptional field requires an explanation.");
    return JSON.stringify({ note: field.reasonNote });
  }
  return null;
}

export function evidenceRowsFromAssessment(
  assessment: AiExtractionAssessment,
  originalText: string,
  resolverVersion: string,
): readonly EvidenceRow[] {
  if (assessment.status !== "review_required" || assessment.quoteEligible !== false
    || assessment.reviewRequired !== true || assessment.permittedActions.length !== 0
    || assessment.extractor?.kind !== "deterministic"
    || assessment.fields.length !== OBSERVATION_FIELD_ORDER.length
    || resolverVersion !== assessment.extractor.extractorVersion) {
    throw new Error("Only validated deterministic, review-only proposals can be persisted.");
  }
  const result: EvidenceRow[] = [];
  for (let i = 0; i < OBSERVATION_FIELD_ORDER.length; i += 1) {
    const field = assessment.fields[i];
    if (!field || field.fieldName !== OBSERVATION_FIELD_ORDER[i]
      || (field.resolutionState === "resolved" && field.evidenceSpans.length === 0)
      || (field.resolutionState === "contradictory" && field.evidenceSpans.length < 2)
      || field.confidenceBasisPoints !== null) {
      throw new Error("Field order, evidence, or confidence violates the extraction contract.");
    }
    const value = canonicalValue(field);
    for (const evidence of field.evidenceSpans.length ? field.evidenceSpans : [null]) {
      if (evidence && (!Number.isSafeInteger(evidence.startUtf16)
        || !Number.isSafeInteger(evidence.endUtf16)
        || evidence.endUtf16 <= evidence.startUtf16
        || originalText.slice(evidence.startUtf16, evidence.endUtf16) !== evidence.text)) {
        throw new Error("Evidence offsets must exactly match the unmodified buyer request.");
      }
      result.push(Object.freeze({
        fieldName: field.fieldName,
        resolutionState: field.resolutionState,
        normalizedValueJson: value,
        provenance: "deterministic" as const,
        confidenceBasisPoints: null,
        evidenceStartUtf16: evidence?.startUtf16 ?? null,
        evidenceEndUtf16: evidence?.endUtf16 ?? null,
        evidenceText: evidence?.text ?? null,
        resolverVersion,
      }));
    }
  }
  return Object.freeze(result);
}

type ComparableEvidenceRow = Omit<EvidenceRow, "provenance" | "confidenceBasisPoints"> & {
  readonly provenance: string;
  readonly confidenceBasisPoints: number | null;
};

function normalizeRow(row: ComparableEvidenceRow): string {
  return JSON.stringify([
    row.fieldName, row.resolutionState, row.normalizedValueJson,
    row.provenance, row.confidenceBasisPoints, row.evidenceStartUtf16,
    row.evidenceEndUtf16, row.evidenceText, row.resolverVersion,
  ]);
}

/** Check every stored span and value against the deterministic source replay. */
export function verifySavedEvidence(
  expected: readonly EvidenceRow[],
  saved: readonly ComparableEvidenceRow[],
): boolean {
  return expected.length === saved.length
    && expected.every((row, index) => {
      const actual = saved[index];
      return actual !== undefined && normalizeRow(row) === normalizeRow(actual);
    });
}
