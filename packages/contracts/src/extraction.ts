import { z } from "zod";
import { AssetStorageModeSchema } from "./assets";
import { RightsFieldNameSchema } from "./rights-terms";
export const RunExtractionRequestSchema = z.object({
  expectedCaseRowVersion: z.number().int().positive(),
}).strict();
export type RunExtractionRequest = z.infer<typeof RunExtractionRequestSchema>;
const EvidenceSpanSchema = z.object({
  startUtf16: z.number().int().nonnegative(),
  endUtf16: z.number().int().positive(),
  text: z.string().min(1).max(600),
}).strict();
const CandidateFieldSchema = z.object({
  fieldName: RightsFieldNameSchema,
  resolutionState: z.enum(["resolved","unresolved","contradictory","unsupported"]),
  normalizedValue: z.unknown().nullable(),
  evidenceSpans: z.array(EvidenceSpanSchema).max(4),
  reasonCode: z.enum(["explicit_evidence","not_stated","ambiguous","low_confidence",
    "uncalibrated","extraction_failed","conflicting_evidence","out_of_scope"]),
  reasonNote: z.string().nullable(),
  confidenceBasisPoints: z.number().int().min(0).max(10000).nullable(),
}).strict();
const DeterministicAssessmentSchema = z.object({
  contractVersion: z.literal("rights-extraction-v1"),
  inputSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  status: z.literal("review_required"),
  reviewRequired: z.literal(true),
  quoteEligible: z.literal(false),
  permittedActions: z.tuple([]),
  issueCodes: z.array(z.string()),
  extractor: z.object({
    kind:z.literal("deterministic"),
    extractorVersion:z.literal("rights-rule-baseline-v1"),
    modelId:z.null(), modelVersion:z.null(),artifactSha256:z.null(),
  }).strict(),
  fields:z.array(CandidateFieldSchema).length(12),
}).strict();
const LearnedFieldSchema = z.object({
  fieldName: RightsFieldNameSchema,
  gate:z.enum(["candidate_unverified","abstained_margin","abstained_nonresolved"]),
  candidateLabel:z.object({resolutionState:z.literal("resolved"),normalizedValue:z.unknown()}).strict().nullable(),
  margin:z.number().finite().nonnegative(),requiredMargin:z.number().finite().positive(),
  confidenceBasisPoints:z.null(),resolutionState:z.literal("unresolved"),
  normalizedValue:z.null(),evidenceSpans:z.tuple([]),
}).strict();
export const CreatorExtractionViewSchema = z.object({
  storageMode:AssetStorageModeSchema,caseId:z.string().uuid(),
  caseRowVersion:z.number().int().positive(),
  originalText:z.string().min(40).max(4000),
  status:z.enum(["not_started","proposals_saved"]),executedAt:z.string().nullable(),
  deterministic:DeterministicAssessmentSchema.nullable(),
  learned:z.object({
    modelId:z.string().min(1),modelVersion:z.string().min(1),
    artifactSha256:z.string().regex(/^[0-9a-f]{64}$/u),
    assessment:z.object({
      status:z.literal("not_approved_for_automatic_resolution"),
      policyVersion:z.string().min(1),
      artifactSha256:z.string().regex(/^[0-9a-f]{64}$/u),
      reviewRequired:z.literal(true),quoteEligible:z.literal(false),
      permittedActions:z.tuple([]),
      confidenceIsCalibratedProbability:z.literal(false),
      fields:z.array(LearnedFieldSchema).length(12),
    }).strict(),
  }).strict().nullable(),
  modelStatus:z.enum(["unavailable","review_only"]),
  termsVersionNumber:z.number().int().positive().nullable(),
  reviewRequired:z.literal(true),quoteEligible:z.literal(false),
  permittedActions:z.tuple([]),
}).strict();
export type CreatorExtractionResponse = z.infer<typeof CreatorExtractionViewSchema>;
