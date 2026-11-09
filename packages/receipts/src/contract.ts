import type { Json } from "./canonical";
export const RECEIPT_SCHEMA = "rightsreceipt-receipt-v1" as const;
export type ReceiptState = "scheduled" | "active" | "expired" | "refunded" | "revoked";
/** Exact SQL snapshot is server-only. Never return it from a public endpoint. */
export interface ReceiptSnapshot {
  readonly sourceJson: string;
  readonly chainJson: string;
  readonly root: Record<string, unknown>;
  readonly chain: readonly StoredReceipt[];
}
export interface StoredReceipt {
  readonly id: string; readonly verificationId: string; readonly permissionId: string;
  readonly revision: number; readonly schema: string; readonly previousHash: string | null;
  readonly canonical: string; readonly hash: string; readonly materialHash: string | null;
  readonly auditRootHash: string | null; readonly createdAt: string;
}
export interface AuditAnchor {
  readonly event_count: number;
  readonly root_sha256: string;
  readonly events: readonly { readonly audit_event_id: string; readonly sha256: string }[];
}
export interface ReceiptMaterial {
  readonly case_id: string;
  readonly asset: Readonly<Record<string, Json>>;
  readonly creator: Readonly<Record<string, Json>>;
  readonly buyer: Readonly<Record<string, Json>>;
  readonly terms: Readonly<Record<string, Json>>;
  readonly period: Readonly<Record<string, Json>>;
  readonly quote: Readonly<Record<string, Json>>;
  readonly consent: Readonly<Record<string, Json>>;
  readonly ai_provenance: Readonly<Record<string, Json>>;
  readonly payment: Readonly<Record<string, Json>>;
  readonly permission: Readonly<Record<string, Json>>;
}
export interface ReceiptPayload extends ReceiptMaterial {
  readonly schema_version: typeof RECEIPT_SCHEMA;
  readonly receipt_chain_id: string;
  readonly revision_number: number;
  readonly previous_revision_hash: string | null;
  readonly verification_public_id: string;
  readonly material_sha256: string;
  readonly audit_anchor: AuditAnchor;
  readonly created_at: string;
}
export interface PreparedReceipt {
  readonly material: ReceiptMaterial; readonly materialHash: string;
  readonly anchor: AuditAnchor; readonly verificationId: string;
  readonly publicId: string; readonly permissionId: string; readonly state: ReceiptState;
  readonly verificationStatus: string; readonly currentReceiptId: string | null;
}
export interface ReceiptCommit {
  readonly caseId: string; readonly sourceJson: string; readonly expectedChainJson: string;
  readonly record: StoredReceipt; readonly state: ReceiptState; readonly auditId: string;
  readonly publicId: string;
}
export interface ReceiptStore {
  load(caseId: string): Promise<ReceiptSnapshot | null>;
  commit(input: ReceiptCommit): Promise<void>;
  restore(caseId: string, snapshot: ReceiptSnapshot, record: StoredReceipt, state: ReceiptState, at: string): Promise<void>;
  invalidate(caseId: string, snapshot: ReceiptSnapshot, code: string, at: string): Promise<void>;
}
export type ReceiptFailure = "not_eligible" | "source_invalid" | "review_required"
  | "temporal_refresh_required" | "integrity_failed" | "stale_source" | "not_found";
export class ReceiptError extends Error {
  readonly code: ReceiptFailure;
  constructor(code: ReceiptFailure) { super("Receipt validation or issuance is blocked."); this.name = "ReceiptError"; this.code = code; }
}
