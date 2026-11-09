/** Canonical human decisions, never a payment, permission, or simulated approval. */
export const CREATOR_CONSENT_VERSION = "creator-rights-decision-v1" as const;
export const BUYER_CONSENT_VERSION = "buyer-license-acceptance-v1" as const;
export const CREATOR_CONSENT_TEXT = "I confirm this decision applies to the exact displayed licensing rights and USD quote. Approval alone does not grant permission or confirm payment.";
export const BUYER_CONSENT_TEXT = "I accept the exact displayed licensing rights, restrictions, dates, and USD price approved by the creator. This Sandbox acceptance does not confirm payment or grant permission. Permission requires independently verified payment and an eligible licensing period.";
export type ConsentDecision = "approved" | "rejected" | "clarification_requested";
export type ConsentFailure = "invalid_command" | "not_authorized" | "not_found" | "source_invalid"
  | "stale_revision" | "decision_locked" | "approval_required" | "clarification_required"
  | "idempotency_conflict" | "stale_command" | "storage_unavailable";
export class ConsentError extends Error {
  readonly code: ConsentFailure;
  constructor(code: ConsentFailure) { super("The licensing decision could not be completed."); this.name = "ConsentError"; this.code = code; }
}
export interface ConsentSnapshot {
  readonly sourceJson: string;
  readonly root: Readonly<Record<string, unknown>>;
}
export interface CreatorPrincipal {
  readonly workspaceId: string;
  readonly actorReference: string;
}
export interface ConsentCommandBase {
  readonly requestId: string;
  readonly expectedCaseVersion: number;
  readonly termsVersionId: string;
  readonly quoteId: string;
  readonly reviewHash: string;
}
export interface CreatorConsentCommand extends ConsentCommandBase {
  readonly decision: ConsentDecision;
  readonly reason: string | null;
  readonly confirmed: true;
  readonly copyVersion: typeof CREATOR_CONSENT_VERSION;
}
export interface BuyerConsentCommand extends ConsentCommandBase {
  readonly creatorDecisionId: string;
  readonly acknowledged: true;
  readonly copyVersion: typeof BUYER_CONSENT_VERSION;
}
export interface ConsentCommit {
  readonly snapshot: ConsentSnapshot;
  readonly caseId: string;
  readonly workspaceId: string;
  readonly capabilityDigest: string | null;
  readonly capabilityId: string | null;
  readonly role: "creator" | "buyer";
  readonly actorReference: string;
  readonly resultId: string;
  readonly auditId: string;
  readonly idempotencyKey: string;
  readonly commandHash: string;
  readonly command: CreatorConsentCommand | BuyerConsentCommand;
  readonly auditPayload: string;
  readonly at: string;
}
export interface ConsentStore {
  load(caseId: string, capabilityDigest: string | null): Promise<ConsentSnapshot | null>;
  findBuyerCase(capabilityDigest: string): Promise<string | null>;
  commit(input: ConsentCommit): Promise<void>;
}
export const CONSENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function consentFail(code: ConsentFailure): never { throw new ConsentError(code); }
export function consentRow(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return consentFail("source_invalid");
  return value as Record<string, unknown>;
}
export function consentId(value: unknown): string {
  if (typeof value !== "string" || !CONSENT_UUID.test(value)) return consentFail("invalid_command");
  return value;
}
export function consentTime(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return consentFail("source_invalid");
  return value;
}
