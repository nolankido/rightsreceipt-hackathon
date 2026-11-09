import { z } from "zod";
import { AssetStorageModeSchema } from "./assets";
import { RightsFieldNameSchema } from "./rights-terms";

const EvidenceSchema = z.object({
  startUtf16: z.number().int().nonnegative(),
  endUtf16: z.number().int().positive(),
  text: z.string().min(1).max(600),
}).strict();
const QuestionSchema = z.object({
  fieldName: RightsFieldNameSchema,
  label: z.string().min(1),
  reason: z.enum(["missing", "ambiguous", "low_confidence", "contradictory"]),
  question: z.string().min(1).max(500),
  evidenceSpans: z.array(EvidenceSchema).max(4),
}).strict();
const BlockerSchema = z.object({
  fieldName: RightsFieldNameSchema,
  label: z.string().min(1),
  reason: z.literal("unsupported_scope"),
  explanation: z.string().min(1).max(500),
}).strict();
export const ClarificationPlanSchema = z.object({
  version: z.literal("rights-clarification-v1"),
  source: z.enum(["human_corrected", "deterministic_proposal"]),
  status: z.enum(["questions_needed", "unsupported_scope", "human_confirmation_needed", "complete_human_review"]),
  questions: z.array(QuestionSchema).max(12),
  unsupported: z.array(BlockerSchema).max(12),
  resolvedFieldCount: z.number().int().min(0).max(12),
  requiredFieldCount: z.literal(12),
  reviewRequired: z.literal(true),
  quoteEligible: z.literal(false),
  permittedActions: z.tuple([]),
}).strict();
export const CreatorClarificationResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  caseId: z.string().uuid(),
  caseRowVersion: z.number().int().positive(),
  termsVersionNumber: z.number().int().positive().nullable(),
  plan: ClarificationPlanSchema,
}).strict();
export type CreatorClarificationResponse = z.infer<typeof CreatorClarificationResponseSchema>;
export const BuyerClarificationResponseSchema = z.object({
  assetTitle: z.string().min(1).max(200),
  creatorDisplayName: z.string().min(1).max(120),
  plan: ClarificationPlanSchema,
  answersAcceptedOnline: z.literal(false),
}).strict();
export type BuyerClarificationResponse = z.infer<typeof BuyerClarificationResponseSchema>;
