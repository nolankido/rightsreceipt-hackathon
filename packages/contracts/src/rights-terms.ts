import { z } from "zod";
import { AssetRecordSchema, AssetStorageModeSchema } from "./assets";

export const RightsFieldNameSchema = z.enum([
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
]);
export type RightsFieldNameDto = z.infer<typeof RightsFieldNameSchema>;

export const RightsResolutionStateSchema = z.enum([
  "resolved",
  "unresolved",
  "contradictory",
  "unsupported",
]);

const unresolvedEdit = z.object({ state: z.literal("unresolved") }).strict();
const unsupportedEdit = z
  .object({
    state: z.literal("unsupported"),
    note: z.string().trim().min(1).max(500),
  })
  .strict();
const contradictoryEdit = z
  .object({
    state: z.literal("contradictory"),
    note: z.string().trim().min(1).max(500),
  })
  .strict();

function fieldEdit<TSchema extends z.ZodTypeAny>(valueSchema: TSchema) {
  return z.discriminatedUnion("state", [
    z.object({ state: z.literal("resolved"), value: valueSchema }).strict(),
    unresolvedEdit,
    unsupportedEdit,
    contradictoryEdit,
  ]);
}

const channelSchema = z.enum(["instagram_paid", "facebook_paid"]);
const territorySchema = z.enum(["US", "CA"]);

function uniqueArray<TSchema extends z.ZodTypeAny>(itemSchema: TSchema, maximum: number) {
  return z
    .array(itemSchema)
    .min(1)
    .max(maximum)
    .refine(
      (values) => new Set(values).size === values.length,
      "Select each supported value at most once.",
    );
}
const canonicalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime())
      && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid ISO calendar date.");

export const ManualRightsReviewFieldsSchema = z
  .object({
    use_purpose: fieldEdit(z.literal("commercial")),
    channels: fieldEdit(uniqueArray(channelSchema, 2)),
    paid_advertising: fieldEdit(z.literal(true)),
    territories: fieldEdit(uniqueArray(territorySchema, 2)),
    start_date: fieldEdit(canonicalDateSchema),
    duration_days: fieldEdit(z.number().int().min(1).max(365)),
    max_impressions: fieldEdit(z.number().int().min(1).max(500_000)),
    exclusivity: fieldEdit(z.literal("non_exclusive")),
    modification_scope: fieldEdit(z.enum(["none", "crop_only"])),
    attribution: fieldEdit(z.enum(["required", "not_required"])),
    sublicensing: fieldEdit(z.literal("prohibited")),
    ai_use: fieldEdit(z.literal("prohibited")),
  })
  .strict();

export const ManualTermsReviewSaveRequestSchema = z
  .object({
    expectedCaseRowVersion: z.number().int().positive(),
    fields: ManualRightsReviewFieldsSchema,
  })
  .strict();
export type ManualTermsReviewSaveRequest = z.infer<
  typeof ManualTermsReviewSaveRequestSchema
>;

export const RightsFieldReviewViewSchema = z.object({
  fieldName: RightsFieldNameSchema,
  label: z.string().min(1),
  resolutionState: RightsResolutionStateSchema,
  value: z.unknown().nullable(),
  note: z.string().nullable(),
  provenance: z.enum(["not_set", "human", "deterministic", "model"]),
  confidenceBasisPoints: z.number().int().min(0).max(10_000).nullable(),
  evidenceText: z.string().nullable(),
  resolverVersion: z.string().nullable(),
});
export type RightsFieldReviewViewDto = z.infer<
  typeof RightsFieldReviewViewSchema
>;

export const TermsResolutionStatusSchema = z.enum([
  "not_started",
  "complete",
  "incomplete",
  "contradictory",
  "unsupported",
]);

export const QuoteReadinessSchema = z.object({
  status: z.enum(["blocked", "ready_for_pricing"]),
  reasons: z.array(z.string().min(1)).min(1),
});

export const TermsReviewResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  caseId: z.string().uuid(),
  caseRowVersion: z.number().int().positive(),
  caseOutcome: z.enum(["open", "rejected", "canceled"]),
  asset: AssetRecordSchema,
  buyer: z.object({
    name: z.string().min(2).max(100),
    organization: z.string().min(2).max(120),
    email: z.string().email().max(254),
  }),
  request: z.object({
    originalText: z.string().min(40).max(4000),
    submittedAt: z.string().min(20),
  }),
  currentTermsVersion: z.number().int().positive().nullable(),
  resolutionStatus: TermsResolutionStatusSchema,
  fields: z.array(RightsFieldReviewViewSchema).length(12),
  quoteReadiness: QuoteReadinessSchema,
});
export type TermsReviewResponse = z.infer<typeof TermsReviewResponseSchema>;

export const CreatorCaseSummarySchema = z.object({
  caseId: z.string().uuid(),
  caseRowVersion: z.number().int().positive(),
  assetId: z.string().uuid(),
  assetTitle: z.string().min(1),
  assetPreviewReference: z.string().min(1),
  buyerOrganization: z.string().min(2).max(120),
  submittedAt: z.string().min(20),
  termsVersionNumber: z.number().int().positive().nullable(),
  resolutionStatus: z
    .enum(["complete", "incomplete", "contradictory", "unsupported"])
    .nullable(),
  stage: z.enum([
    "review_not_started",
    "needs_resolution",
    "unsupported",
    "contradictory",
    "ready_for_pricing",
  ]),
});

export const CreatorCaseListResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  cases: z.array(CreatorCaseSummarySchema),
});
export type CreatorCaseListResponse = z.infer<
  typeof CreatorCaseListResponseSchema
>;
