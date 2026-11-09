import { z } from "zod";
import { AssetRecordSchema, AssetStorageModeSchema } from "./assets";

export const BuyerRequestInputSchema = z.object({
  buyerName: z.string().min(2).max(100),
  buyerOrganization: z.string().min(2).max(120),
  buyerEmail: z.string().email().max(254),
  intendedUseText: z.string().min(40).max(4000),
  consentAcknowledged: z.literal(true),
});
export type BuyerRequestInputDto = z.infer<typeof BuyerRequestInputSchema>;

export const BuyerRequestLinkResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  requestPath: z.string().startsWith("/request/"),
  expiresAt: z.string().min(20),
  asset: AssetRecordSchema,
});
export type BuyerRequestLinkResponse = z.infer<
  typeof BuyerRequestLinkResponseSchema
>;

export const BuyerRequestContextResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  asset: AssetRecordSchema,
  consentCopyVersion: z.literal("buyer-request-v1"),
  consentCopy: z.string().min(1),
  expiresAt: z.string().min(20),
  alreadySubmitted: z.boolean(),
});
export type BuyerRequestContextResponse = z.infer<
  typeof BuyerRequestContextResponseSchema
>;

export const BuyerRequestSubmissionResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  received: z.literal(true),
  requestSubmissionId: z.string().uuid(),
  submittedAt: z.string().min(20),
  asset: AssetRecordSchema,
  buyerOrganization: z.string().min(2).max(120),
  consentCopyVersion: z.literal("buyer-request-v1"),
});
export type BuyerRequestSubmissionResponse = z.infer<
  typeof BuyerRequestSubmissionResponseSchema
>;
