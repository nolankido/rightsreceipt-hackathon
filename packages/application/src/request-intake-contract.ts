/** Private request intake has no approval, payment, or permission authority. */
import type { BuyerRequestInput, BuyerRequestSubmissionRecord } from "../../domain/src/buyer-requests";
import type { CreatorPrincipal } from "./consent-contract";
export const INTAKE_VERSION = "request-intake-v1" as const;
export const LINK_COPY_VERSION = "creator-request-link-v1" as const;
export const LINK_COPY = "I confirm this asset may receive a private licensing request. This link lets its holder submit a request, answer clarification questions, review an offer, and view a receipt. Creating or sharing it does not approve use, confirm payment, or grant permission.";
export const INTAKE_ACTIONS = ["submit_request", "clarify", "review", "receipt"] as const;
export const CAPABILITY_LIFETIME_SECONDS = 604800;
export type IntakeFailure = "invalid_command" | "not_authorized" | "not_found" | "source_invalid" | "stale_revision"
  | "decision_locked" | "idempotency_conflict" | "stale_command" | "storage_unavailable" | "request_already_submitted";
export class RequestIntakeError extends Error {
  readonly code: IntakeFailure;
  constructor(code: IntakeFailure) { super("The private request could not be completed."); this.name = "RequestIntakeError"; this.code = code; }
}
export function intakeFail(code: IntakeFailure): never { throw new RequestIntakeError(code); }
export interface IntakeSnapshot { readonly sourceJson: string; readonly root: Readonly<Record<string, unknown>> }
/** The deadline comes from the verified request JWT, never the browser command. */
export interface RequestIntakePrincipal extends CreatorPrincipal { readonly expiresAt: number }
export interface LinkCommand {
  readonly requestId: string; readonly expectedAssetVersion: number; readonly reviewHash: string;
  readonly tokenDigestSha256: string; readonly confirmed: true; readonly copyVersion: typeof LINK_COPY_VERSION;
}
export interface RequestCommand extends BuyerRequestInput {
  readonly requestId: string; readonly expectedCaseVersion: number; readonly reviewHash: string;
  readonly consentAcknowledged: true; readonly copyVersion: "buyer-request-v1";
}
export interface IntakeAuthority {
  readonly version: typeof INTAKE_VERSION; readonly paymentConfirmed: false; readonly permissionGranted: false;
}
export interface IntakeAsset {
  readonly assetId: string; readonly title: string; readonly assetType: "photograph" | "illustration";
  readonly creatorDisplayName: string; readonly provenanceNote: string;
  readonly fingerprintAlgorithm: "sha256"; readonly fingerprintValue: string;
}
export interface CreatorIntakeView extends IntakeAuthority {
  readonly checkedAt: string; readonly assetVersion: number; readonly reviewHash: string; readonly asset: IntakeAsset;
  readonly copyVersion: typeof LINK_COPY_VERSION; readonly copy: typeof LINK_COPY;
  readonly capabilityLifetimeSeconds: typeof CAPABILITY_LIFETIME_SECONDS; readonly allowedActions: typeof INTAKE_ACTIONS;
}
export interface LinkResult extends IntakeAuthority {
  readonly outcome: "issued"; readonly requestId: string; readonly caseId: string; readonly buyerCapabilityId: string;
  readonly assetId: string; readonly assetVersion: number; readonly caseVersion: 1;
  readonly issuedAt: string; readonly expiresAt: string; readonly checkedAt: string; readonly replayed: boolean;
  readonly requestPath: "/buyer/request"; readonly creatorReviewPath: string; readonly allowedActions: typeof INTAKE_ACTIONS;
}
export interface OriginalRequest {
  readonly requestSubmissionId: string; readonly buyerName: string; readonly buyerOrganization: string;
  readonly buyerEmail: string; readonly intendedUseText: string; readonly submittedAt: string; readonly consentCopyVersion: "buyer-request-v1";
}
export interface BuyerIntakeView extends IntakeAuthority {
  readonly checkedAt: string; readonly accessExpiresAt: string; readonly caseId: string; readonly caseVersion: number;
  readonly reviewHash: string; readonly asset: IntakeAsset; readonly alreadySubmitted: boolean; readonly originalRequest: OriginalRequest | null;
  readonly copyVersion: "buyer-request-v1"; readonly copy: string;
  /** Null preserves the recorded request when an archived asset has no available continuation. */
  readonly nextPath: "/buyer/clarification" | "/buyer/review" | null;
}
export interface RequestResult extends IntakeAuthority {
  readonly outcome: "submitted"; readonly requestId: string; readonly requestSubmissionId: string; readonly caseId: string;
  readonly caseVersion: number; readonly submittedAt: string; readonly checkedAt: string; readonly accessExpiresAt: string;
  readonly replayed: boolean; readonly nextPath: "/buyer/clarification";
}
export interface LinkCommit {
  readonly snapshot: IntakeSnapshot; readonly command: LinkCommand; readonly caseId: string; readonly capabilityId: string;
  readonly workspaceId: string; readonly assetId: string; readonly actorReference: string;
  readonly auditPayload: string; readonly at: string; readonly expiresAt: string;
}
export interface RequestCommit {
  readonly snapshot: IntakeSnapshot; readonly command: RequestCommand; readonly record: BuyerRequestSubmissionRecord;
  readonly digest: string; readonly capabilityId: string; readonly workspaceId: string;
  readonly auditPayload: string; readonly at: string; readonly checkAt: string;
}
export interface RequestIntakeStore {
  loadAsset(assetId: string): Promise<IntakeSnapshot | null>;
  checkAsset(snapshot: IntakeSnapshot, assetId: string): Promise<boolean>;
  findBuyerCase(digest: string): Promise<string | null>;
  loadCase(caseId: string, digest: string): Promise<IntakeSnapshot | null>;
  checkCase(snapshot: IntakeSnapshot, caseId: string, digest: string, at: string): Promise<"current" | "stale" | "unauthorized">;
  findCommand(requestId: string): Promise<Readonly<Record<string, unknown>> | null>;
  commitLink(input: LinkCommit): Promise<void>;
  commitRequest(input: RequestCommit): Promise<void>;
}
