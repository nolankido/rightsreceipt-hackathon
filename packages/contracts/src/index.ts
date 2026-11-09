import { z } from "zod";

export * from "./assets";
export * from "./buyer-requests";
export * from "./rights-terms";
export * from "./quotes";
export * from "./mock-transaction";
export * from "./ai-extraction";
export * from "./extraction";
export * from "./clarification";

export const AppModeSchema = z.enum(["local", "sandbox", "judge"]);
export type AppMode = z.infer<typeof AppModeSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("rightsreceipt"),
  phase: z.enum([
    "scaffold",
    "asset-workspace",
    "buyer-request-intake",
    "structured-rights-review",
    "deterministic-pricing",
    "mock-vertical-slice",
  ]),
  mode: AppModeSchema,
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function createHealthResponse(mode: AppMode): HealthResponse {
  return {
    status: "ok",
    service: "rightsreceipt",
    phase: "mock-vertical-slice",
    mode,
  };
}

export interface AuthorityBoundary {
  actor: "AI" | "Deterministic code" | "People" | "PayPal";
  responsibility: string;
}

export const APP_AUTHORITY_BOUNDARIES: readonly AuthorityBoundary[] = [
  {
    actor: "AI",
    responsibility: "Structures requests, cites evidence, reports confidence, and asks for clarification.",
  },
  {
    actor: "Deterministic code",
    responsibility: "Validates scope, calculates integer-cent quotes, and enforces lifecycle rules.",
  },
  {
    actor: "People",
    responsibility: "Creators approve and buyers accept the same immutable version.",
  },
  {
    actor: "PayPal",
    responsibility: "Provides authoritative Sandbox invoice payment state.",
  },
] as const;
