import { z } from "zod";
import { QuoteLineSchema, QuoteRecordSchema } from "./quotes";

const uuid = z.string().uuid();
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
export const MockStageSchema = z.enum([
  "awaiting_quote", "quote_changed", "awaiting_creator", "needs_clarification",
  "rejected", "awaiting_buyer", "awaiting_simulated_payment", "simulated_scheduled",
  "simulated_active", "simulated_expired",
]);
export const MockDecisionRequestSchema = z.object({
  expectedCaseRowVersion: z.number().int().positive(),
  expectedMockRevision: z.number().int().nonnegative(),
  quoteId: uuid,
  termsVersionId: uuid,
  decision: z.enum(["approved", "rejected", "clarification_requested"]),
  reason: z.string().max(500).optional(),
}).strict();
export type MockDecisionRequest = z.infer<typeof MockDecisionRequestSchema>;

export const MockBuyerAcceptanceRequestSchema = z.object({
  expectedMockRevision: z.number().int().nonnegative(),
  quoteId: uuid,
  termsVersionId: uuid,
  accepted: z.literal(true),
}).strict();
export type MockBuyerAcceptanceRequest = z.infer<typeof MockBuyerAcceptanceRequestSchema>;

export const MockPaymentRequestSchema = z.object({
  expectedMockRevision: z.number().int().nonnegative(),
  quoteId: uuid,
}).strict();
export type MockPaymentRequest = z.infer<typeof MockPaymentRequestSchema>;

export const MockTransactionViewSchema = z.object({
  caseId: uuid, caseRowVersion: z.number().int().positive(),
  mockRevision: z.number().int().nonnegative(),
  stage: MockStageSchema, disclaimer: z.string().min(40),
  asset: z.object({ title: z.string(), previewReference: z.string(), fingerprint: sha }),
  buyerOrganization: z.string(),
  quote: z.object({ record: QuoteRecordSchema, lines: z.array(QuoteLineSchema) }).nullable(),
  licensePeriod: z.object({
    startDate: z.string(), endDateExclusive: z.string(), lastPermittedDate: z.string(),
  }).nullable(),
  approval: z.object({
    decision: z.enum(["approved", "rejected", "clarification_requested"]),
    termsVersionId: uuid, quoteId: uuid, actor: z.literal("creator"),
    at: z.string(), reason: z.string().nullable(),
  }).nullable(),
  acceptance: z.object({
    termsVersionId: uuid, quoteId: uuid, actor: z.literal("buyer"), at: z.string(),
  }).nullable(),
  payment: z.object({
    provider: z.literal("fake"), mode: z.literal("simulated"), reference: z.string(),
    status: z.literal("simulated_paid"), recordedAt: z.string(),
  }).nullable(),
  publicReceiptId: z.string().nullable(),
});
export type MockTransactionViewDto = z.infer<typeof MockTransactionViewSchema>;

export const MockVerificationViewSchema = z.object({
  verified: z.boolean(), mode: z.literal("simulated"), provider: z.literal("fake"),
  disclaimer: z.string().min(40), hash: sha,
  payload: z.record(z.string(), z.unknown()).nullable(),
  currentPermissionStatus: z.enum(["simulated_scheduled", "simulated_active", "simulated_expired", "invalid"]),
});
export type MockVerificationViewDto = z.infer<typeof MockVerificationViewSchema>;
