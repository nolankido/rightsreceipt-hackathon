import { z } from "zod";
import { AssetStorageModeSchema } from "./assets";

const cents = z.number().int().safe().nonnegative();

export const GenerateQuoteRequestSchema = z.object({
  expectedCaseRowVersion: z.number().int().positive(),
}).strict();
export type GenerateQuoteRequest = z.infer<typeof GenerateQuoteRequestSchema>;

export const QuoteLineSchema = z.object({
  quoteLineId: z.string().uuid(),
  quoteId: z.string().uuid(),
  linePosition: z.number().int().positive(),
  lineCode: z.string().min(1),
  description: z.string().min(1),
  amountCents: cents,
  createdAt: z.string().min(20),
});

export const QuoteRecordSchema = z.object({
  quoteId: z.string().uuid(),
  caseId: z.string().uuid(),
  quoteVersionNumber: z.number().int().positive(),
  termsVersionId: z.string().uuid(),
  pricingPolicyId: z.string().uuid(),
  pricingPolicyVersion: z.number().int().positive(),
  amountCents: cents,
  currency: z.literal("USD"),
  status: z.enum(["current", "superseded"]),
  calculationHash: z.string().regex(/^[0-9a-f]{64}$/u),
  createdAt: z.string().min(20),
});

export const QuoteViewResponseSchema = z.object({
  storageMode: AssetStorageModeSchema,
  caseId: z.string().uuid(),
  caseRowVersion: z.number().int().positive(),
  termsVersionNumber: z.number().int().positive().nullable(),
  status: z.enum(["blocked", "ready_for_pricing", "quoted", "stale_quote"]),
  reason: z.string().min(1),
  policy: z.object({
    pricingPolicyId: z.string().uuid(),
    versionNumber: z.number().int().positive(),
    policyName: z.string().min(1),
    currency: z.literal("USD"),
  }).nullable(),
  quote: z.object({
    record: QuoteRecordSchema,
    lines: z.array(QuoteLineSchema).min(4).max(5),
  }).nullable(),
  licensePeriod: z.object({
    startDate: z.string(),
    endDateExclusive: z.string(),
    lastPermittedDate: z.string(),
  }).nullable(),
});
export type QuoteViewResponse = z.infer<typeof QuoteViewResponseSchema>;
