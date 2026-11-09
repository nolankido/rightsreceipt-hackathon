/** Public references are lookup identifiers, not authorization capabilities. */
import { sha256Hex } from "./canonical";
import { validPublicReceiptId } from "./experience";
export interface ReceiptAccessStatement {
  bind(...values: readonly (string | number | null)[]): ReceiptAccessStatement;
  first<T>(): Promise<T | null>;
}
export interface ReceiptAccessDatabase { prepare(sql: string): ReceiptAccessStatement; }
export interface ReceiptDirectory {
  byPublicId(publicId: string): Promise<string | null>;
  byBuyerToken(token: string, at: string): Promise<string | null>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function validReceiptCaseId(id: string): boolean { return UUID.test(id); }
export function createD1ReceiptDirectory(db: ReceiptAccessDatabase): ReceiptDirectory {
  return {
    async byPublicId(publicId) {
      if (!validPublicReceiptId(publicId)) return null;
      const r = await db.prepare(`SELECT v.case_id AS caseId FROM verification_records v
        JOIN licensing_cases c ON c.case_id=v.case_id AND c.verification_record_id=v.verification_record_id
        LEFT JOIN invoice_bindings b ON b.invoice_binding_id=c.invoice_binding_id
        WHERE v.public_verification_id=? AND (c.invoice_binding_id IS NULL OR (b.provider='paypal' AND b.environment='sandbox'))`)
        .bind(publicId).first<{ caseId: string }>();
      return r && UUID.test(r.caseId) ? r.caseId : null;
    },
    async byBuyerToken(token, at) {
      if (!/^[A-Za-z0-9_-]{43}$/u.test(token) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(at)) return null;
      const digest = await sha256Hex(token);
      const r = await db.prepare(`SELECT k.case_id AS caseId,k.allowed_actions_json AS actions,k.issued_at AS issuedAt,
        k.expires_at AS expiresAt,k.revoked_at AS revokedAt FROM buyer_capabilities k
        JOIN licensing_cases c ON c.case_id=k.case_id WHERE k.token_digest_sha256=?
          AND k.revoked_at IS NULL AND k.issued_at<=? AND k.expires_at>?`).bind(digest, at, at)
        .first<{ caseId: string; actions: string; issuedAt: string; expiresAt: string; revokedAt: string | null }>();
      if (!r || !UUID.test(r.caseId) || r.revokedAt !== null) return null;
      for (const value of [at, r.issuedAt, r.expiresAt]) {
        if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return null;
      }
      let actions: unknown;
      try { actions = JSON.parse(r.actions); } catch { return null; }
      return Array.isArray(actions) && actions.length <= 4 && actions.every(x => typeof x === "string")
        && actions.includes("receipt") ? r.caseId : null;
    },
  };
}
