import { z } from "zod";

export const AssetTypeSchema = z.enum(["photograph", "illustration"]);
export const AssetAvailabilitySchema = z.enum(["active", "archived"]);
export const AssetPreviewKeySchema = z.enum(["harbor-after-rain", "studio-lines"]);

export const AssetRegistrationInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  assetType: AssetTypeSchema,
  creatorDisplayName: z.string().trim().min(1).max(120),
  provenanceNote: z.string().trim().min(1).max(2000),
  previewKey: AssetPreviewKeySchema,
});
export type AssetRegistrationInputDto = z.infer<typeof AssetRegistrationInputSchema>;

export const WorkspaceRecordSchema = z.object({
  workspaceId: z.string().uuid(),
  displayName: z.string().min(1).max(120),
  mode: z.literal("demo"),
  defaultPricingPolicyId: z.string().uuid().nullable(),
  defaultPricingPolicyVersion: z.number().int().positive().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  rowVersion: z.number().int().positive(),
});

export const AssetRecordSchema = z.object({
  assetId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(200),
  assetType: AssetTypeSchema,
  creatorDisplayName: z.string().min(1).max(120),
  provenanceNote: z.string().min(1).max(2000),
  fingerprintAlgorithm: z.literal("sha256"),
  fingerprintValue: z.string().regex(/^[0-9a-f]{64}$/u),
  previewReference: z.string().min(1).max(500),
  availability: AssetAvailabilitySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  rowVersion: z.number().int().positive(),
});

export const PricingPolicyAssignmentSchema = z.object({
  pricingPolicyId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  policyName: z.string().min(1),
  currency: z.literal("USD"),
});

export const AssetPreviewOptionSchema = z.object({
  key: AssetPreviewKeySchema,
  label: z.string().min(1),
  previewReference: z.string().min(1),
  altText: z.string().min(1),
  compatibleAssetType: AssetTypeSchema,
  fingerprintAlgorithm: z.literal("sha256"),
  fingerprintValue: z.string().regex(/^[0-9a-f]{64}$/u),
});

export const AssetStorageModeSchema = z.enum(["d1", "memory"]);

export const CreatorWorkspaceResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  workspace: WorkspaceRecordSchema,
  assets: z.array(AssetRecordSchema),
  pricingPolicy: PricingPolicyAssignmentSchema,
  previewOptions: z.array(AssetPreviewOptionSchema),
});
export type CreatorWorkspaceResponse = z.infer<typeof CreatorWorkspaceResponseSchema>;

export const CreatorAssetDetailResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  asset: AssetRecordSchema,
  relatedCaseCount: z.number().int().nonnegative(),
  fingerprintNotice: z.string().min(1),
});
export type CreatorAssetDetailResponse = z.infer<typeof CreatorAssetDetailResponseSchema>;

export const AssetRegistrationResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  asset: AssetRecordSchema,
  created: z.literal(true),
});
export type AssetRegistrationResponse = z.infer<typeof AssetRegistrationResponseSchema>;

export const SafeApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  issues: z
    .array(
      z.object({
        field: z.string().min(1),
        code: z.string().min(1),
        message: z.string().min(1),
      }),
    )
    .optional(),
});
export type SafeApiError = z.infer<typeof SafeApiErrorSchema>;
