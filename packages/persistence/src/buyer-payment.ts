/** Read-only source bundle and one combined capability/source/receipt fence. */
import { createD1HumanConsentStore, CONSENT_ROOT_SQL, type ConsentDatabase } from "./human-consent";
import { createD1InvoiceSendingStore, INVOICE_SENDING_STATE_SQL } from "./invoice-sending";
import { createD1ReceiptStore, RECEIPT_SNAPSHOT_GUARD, type ReceiptDatabase } from "../../receipts/src/store";
import type { BuyerPaymentSnapshot } from "../../application/src/buyer-invoice";
export function createD1BuyerPaymentStore(db: ConsentDatabase & ReceiptDatabase) {
  const consent = createD1HumanConsentStore(db), invoices = createD1InvoiceSendingStore(db), receipts = createD1ReceiptStore(db);
  return Object.freeze({
    consent, receipts,
    async load(digest: string): Promise<BuyerPaymentSnapshot | null> {
      const caseId = await consent.findBuyerCase(digest); if (!caseId) return null;
      const [c, i, r] = await Promise.all([consent.load(caseId, digest), invoices.load(caseId), receipts.load(caseId)]);
      return c && i && r ? { caseId, consent: c, invoice: i, receipt: r } : null;
    },
    async unchanged(s: BuyerPaymentSnapshot, digest: string, capabilityId: string, at: string): Promise<boolean> {
      const found = await db.prepare(`SELECT 1 AS ok FROM licensing_cases c
        WHERE c.case_id=? AND EXISTS(SELECT 1 FROM buyer_capabilities k WHERE k.case_id=c.case_id
          AND k.token_digest_sha256=? AND k.buyer_capability_id=? AND k.revoked_at IS NULL
          AND k.issued_at<=? AND k.expires_at>? AND EXISTS(SELECT 1 FROM json_each(k.allowed_actions_json) WHERE value='review'))
        AND (SELECT ${INVOICE_SENDING_STATE_SQL} FROM licensing_cases c,(SELECT NULL AS digest) arg WHERE c.case_id=?)=?
        AND (SELECT ${CONSENT_ROOT_SQL} FROM licensing_cases c,(SELECT ? AS digest) arg WHERE c.case_id=?)=?
        AND ${RECEIPT_SNAPSHOT_GUARD}`)
        .bind(s.caseId, digest, capabilityId, at, at, s.caseId, s.invoice.stateJson,
          digest, s.caseId, s.consent.sourceJson, s.caseId, s.receipt.sourceJson, s.caseId, s.receipt.chainJson)
        .first<{ ok: number }>();
      return found?.ok === 1;
    },
  });
}
