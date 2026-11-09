/** Creator recovery describes existing durable operations; it cannot grant rights. */
import type { CreatorPrincipal } from "./consent-contract";

export interface InvoiceRecoveryPrincipal extends CreatorPrincipal { readonly expiresAt: number }
export type InvoiceRecoveryAction = "resume_creation" | "record_draft" | "resume_sending" | "check_delivery";
export type InvoiceRecoveryState = "none" | "creation_reserved" | "draft_observed" | "creation_unresolved"
  | "sending_reserved" | "delivery_unresolved" | "complete";
export interface InvoiceRecoveryCommand {
  readonly expectedCaseVersion: number; readonly operationId: string; readonly sourceHash: string;
  readonly action: InvoiceRecoveryAction; readonly confirmed: true;
}
/** Internal exact-source fence. Browser hashes are verified before this is constructed. */
export interface InvoiceExecutionFence {
  readonly stateJson: string; readonly operationId: string; readonly action: InvoiceRecoveryAction;
}
export type InvoiceRecoveryFailure = "invalid_command" | "not_authorized" | "not_found" | "source_invalid"
  | "stale_revision" | "recovery_unavailable" | "storage_unavailable" | "transport_unavailable";
export class InvoiceRecoveryError extends Error {
  readonly code: InvoiceRecoveryFailure;
  constructor(code: InvoiceRecoveryFailure) { super("Invoice recovery could not be completed."); this.name = "InvoiceRecoveryError"; this.code = code; }
}
