/** Read-only receipt presentation boundary. Public data is an explicit allowlist,
 * never a spread of the canonical payload or database snapshot.
 */
import { ReceiptError, type ReceiptPayload, type ReceiptSnapshot, type ReceiptStore, type StoredReceipt } from "./contract";
import { id, instant, prepareReceipt, row } from "./material";
import { verifyStoredReceiptChain } from "./service";
import { licenseTiming, type LicenseTiming } from "./temporal";

export type VerificationStatus = "active" | "scheduled" | "expired" | "refunded" | "revoked"
  | "pending_payment" | "pending_receipt" | "canceled" | "rejected" | "review_required" | "invalid" | "not_found";
export interface PublicVerification {
  readonly schemaVersion: "rightsreceipt-public-verification-v1";
  readonly environment: "sandbox";
  readonly status: VerificationStatus;
  readonly integrity: "verified" | "not_verified";
  readonly checkedAt: string;
  readonly receipt: null | {
    readonly revision: number; readonly sha256: string;
    readonly asset: { readonly title: string; readonly type: string; readonly fingerprint: string };
    readonly timing: LicenseTiming;
    readonly period: { readonly startDate: string; readonly lastPermittedDate: string; readonly endDateExclusive: string };
  };
}
/** Server-only result. Its payload/record must never be used for public JSON. */
export interface ReceiptReadResult {
  readonly publicView: PublicVerification;
  readonly payload: ReceiptPayload | null;
  readonly record: StoredReceipt | null;
}
export function validPublicReceiptId(value: string): boolean {
  // reserveReceiptVerification generates 24 random bytes -> 32 base64url chars.
  // Numeric IDs and UUIDs are never a substitute for an opaque reference.
  return /^[A-Za-z0-9_-]{32}$/u.test(value) && !/^\d+$/u.test(value);
}
export function emptyVerification(status: VerificationStatus, at: string): PublicVerification {
  return Object.freeze({ schemaVersion: "rightsreceipt-public-verification-v1", environment: "sandbox",
    status, integrity: "not_verified", checkedAt: at, receipt: null });
}
function empty(status: VerificationStatus, at: string): ReceiptReadResult {
  return { publicView: emptyVerification(status, at), payload: null, record: null };
}
function checkIdentity(s: ReceiptSnapshot, caseId: string, publicId?: string): void {
  const c = row(s.root.case), v = row(s.root.verification);
  if (id(c.case_id) !== caseId || id(v.case_id) !== caseId || id(v.verification_record_id) !== c.verification_record_id
    || typeof v.public_verification_id !== "string" || !validPublicReceiptId(v.public_verification_id)
    || (publicId !== undefined && publicId !== v.public_verification_id)) throw new ReceiptError("source_invalid");
  if (s.root.binding !== null) {
    const b = row(s.root.binding);
    if (b.provider !== "paypal" || b.environment !== "sandbox" || b.case_id !== caseId
      || b.invoice_binding_id !== c.invoice_binding_id) throw new ReceiptError("source_invalid");
  }
}
function nonIssued(s: ReceiptSnapshot): VerificationStatus | null {
  if (s.chain.length || s.root.permission !== null) return null;
  const c = row(s.root.case), v = row(s.root.verification);
  if (v.current_receipt_revision_id !== null || v.current_status === "invalid") return "invalid";
  const b = s.root.binding === null ? null : row(s.root.binding);
  if (c.case_outcome === "rejected" && v.current_status === "rejected") return "rejected";
  if ((c.case_outcome === "canceled" || b?.invoice_status === "canceled")
    && ["pending", "canceled"].includes(String(v.current_status))) return "canceled";
  if (c.case_outcome !== "open" || c.permission_id !== null) return "invalid";
  if (b?.invoice_status === "reconciliation_required") return "review_required";
  if (b && ["paid", "fully_refunded"].includes(String(b.invoice_status))) return "pending_receipt";
  return v.current_status === "pending" ? "pending_payment" : "invalid";
}
/** No creation, status refresh, invalidation or payment side effects on a GET.
 * Hashes, source material, audit anchors and pointer are all checked every time.
 */
export function createReceiptReader(store: Pick<ReceiptStore, "load">, clock: () => Date = () => new Date()) {
  const proofs = new WeakMap<ReceiptReadResult, { caseId: string; snapshot: ReceiptSnapshot; day: string }>();
  return Object.freeze({
    async unchanged(result: ReceiptReadResult): Promise<boolean> {
      const proof = proofs.get(result);
      if (!proof) return false;
      const fresh = await store.load(proof.caseId);
      return !!fresh && fresh.sourceJson === proof.snapshot.sourceJson && fresh.chainJson === proof.snapshot.chainJson
        && clock().toISOString().slice(0, 10) === proof.day;
    },
    async read(caseId: string, publicId?: string): Promise<ReceiptReadResult> {
      id(caseId);
      const at = instant(clock().toISOString());
      const snapshot = await store.load(caseId);
      if (!snapshot) return empty("not_found", at);
      let result: ReceiptReadResult;
      try {
        checkIdentity(snapshot, caseId, publicId);
        const chain = await verifyStoredReceiptChain(snapshot);
        const preliminary = nonIssued(snapshot);
        if (preliminary) result = empty(preliminary, at);
        else {
          const prepared = await prepareReceipt(snapshot, at);
          const last = snapshot.chain.at(-1), payload = chain.at(-1);
          if (!last || !payload) result = empty("pending_receipt", at);
          else {
            if (last.materialHash !== prepared.materialHash || last.id !== prepared.currentReceiptId
              || prepared.verificationStatus !== prepared.state) throw new ReceiptError("integrity_failed");
            result = { payload, record: last, publicView: Object.freeze({
              schemaVersion: "rightsreceipt-public-verification-v1", environment: "sandbox",
              status: prepared.state, integrity: "verified", checkedAt: at,
              receipt: Object.freeze({ revision: last.revision, sha256: last.hash,
                timing: licenseTiming(prepared.state, String(payload.period.start_date), String(payload.period.end_date_exclusive), at),
                asset: Object.freeze({ title: String(payload.asset.title), type: String(payload.asset.asset_type),
                  fingerprint: String(payload.asset.fingerprint_value) }),
                period: Object.freeze({ startDate: String(payload.period.start_date),
                  lastPermittedDate: String(payload.period.last_permitted_date), endDateExclusive: String(payload.period.end_date_exclusive) }),
              }),
            }) };
          }
        }
      } catch (error) {
        result = empty(error instanceof ReceiptError && ["review_required", "temporal_refresh_required"].includes(error.code)
          ? "review_required" : "invalid", at);
      }
      // Protect even error/pending presentations against a concurrent state change.
      const fresh = await store.load(caseId);
      if (!fresh || fresh.sourceJson !== snapshot.sourceJson || fresh.chainJson !== snapshot.chainJson
        || clock().toISOString().slice(0, 10) !== at.slice(0, 10)) return empty("review_required", at);
      proofs.set(result, { caseId, snapshot, day: at.slice(0, 10) });
      return result;
    },
  });
}
