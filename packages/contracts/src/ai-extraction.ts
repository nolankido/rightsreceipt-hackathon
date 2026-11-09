import { z } from "zod";

/** Wire-level schema only. The pure AI runtime additionally checks original-text
 * evidence offsets, value semantics, and calibration policies.
 */
export const AiFieldNameSchema = z.enum([
  "use_purpose", "channels", "paid_advertising", "territories", "start_date",
  "duration_days", "max_impressions", "exclusivity", "modification_scope",
  "attribution", "sublicensing", "ai_use",
]);

export const AiEvidenceSpanSchema = z.object({
  startUtf16: z.number().int().safe().nonnegative(),
  endUtf16: z.number().int().safe().positive(),
  text: z.string().min(1).max(600),
}).strict();

export const AiExtractorIdentitySchema = z.object({
  kind: z.enum(["deterministic", "model"]),
  extractorVersion: z.string().min(1).max(120),
  modelId: z.string().min(1).max(120).nullable(),
  modelVersion: z.string().min(1).max(120).nullable(),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
}).strict();

const evidence = z.array(AiEvidenceSpanSchema).max(4);
const base = { fieldName: AiFieldNameSchema, evidenceSpans: evidence };
const supportedScalarOrArray = z.union([
  z.literal(true),
  z.string(),
  z.number().int().safe(),
  z.array(z.string()).min(1).max(2),
]);

export const AiCandidateFieldSchema = z.discriminatedUnion("resolutionState", [
  z.object({
    ...base,
    resolutionState: z.literal("resolved"),
    normalizedValue: supportedScalarOrArray,
    reasonCode: z.literal("explicit_evidence"),
    reasonNote: z.null(),
    confidenceBasisPoints: z.number().int().min(0).max(10_000).nullable(),
  }).strict(),
  z.object({
    ...base,
    resolutionState: z.literal("unresolved"),
    normalizedValue: z.null(),
    reasonCode: z.enum([
      "not_stated", "ambiguous", "low_confidence", "uncalibrated", "extraction_failed",
    ]),
    reasonNote: z.null(),
    confidenceBasisPoints: z.null(),
  }).strict(),
  z.object({
    ...base,
    resolutionState: z.literal("contradictory"),
    normalizedValue: z.null(),
    reasonCode: z.literal("conflicting_evidence"),
    reasonNote: z.string().trim().min(1).max(300),
    confidenceBasisPoints: z.null(),
  }).strict(),
  z.object({
    ...base,
    resolutionState: z.literal("unsupported"),
    normalizedValue: z.null(),
    reasonCode: z.literal("out_of_scope"),
    reasonNote: z.string().trim().min(1).max(300),
    confidenceBasisPoints: z.null(),
  }).strict(),
]);

export const AiExtractionProposalSchema = z.object({
  contractVersion: z.literal("rights-extraction-v1"),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  extractor: AiExtractorIdentitySchema,
  fields: z.array(AiCandidateFieldSchema).length(12),
}).strict();
export type AiExtractionProposalDto = z.infer<typeof AiExtractionProposalSchema>;

export const AiCalibrationPolicySchema = z.object({
  policyVersion: z.string().min(1).max(120),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  minimumBasisPoints: z.object({
    use_purpose: z.number().int().min(0).max(10_000),
    channels: z.number().int().min(0).max(10_000),
    paid_advertising: z.number().int().min(0).max(10_000),
    territories: z.number().int().min(0).max(10_000),
    start_date: z.number().int().min(0).max(10_000),
    duration_days: z.number().int().min(0).max(10_000),
    max_impressions: z.number().int().min(0).max(10_000),
    exclusivity: z.number().int().min(0).max(10_000),
    modification_scope: z.number().int().min(0).max(10_000),
    attribution: z.number().int().min(0).max(10_000),
    sublicensing: z.number().int().min(0).max(10_000),
    ai_use: z.number().int().min(0).max(10_000),
  }).strict(),
}).strict();
export type AiCalibrationPolicyDto = z.infer<typeof AiCalibrationPolicySchema>;

export const AiExtractionAssessmentSchema = z.object({
  contractVersion: z.literal("rights-extraction-v1"),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  status: z.enum(["review_required", "invalid_proposal"]),
  reviewRequired: z.literal(true),
  quoteEligible: z.literal(false),
  permittedActions: z.array(z.never()).length(0),
  issueCodes: z.array(z.string().min(1).max(120)),
  extractor: AiExtractorIdentitySchema.nullable(),
  fields: z.array(AiCandidateFieldSchema).length(12),
}).strict();
export type AiExtractionAssessmentDto = z.infer<typeof AiExtractionAssessmentSchema>;
