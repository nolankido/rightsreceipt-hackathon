/** Recovery reuses existing journals and fences adapter-private mutations too. */
import type { InvoiceCreationStore } from "../../application/src/invoice-creation";
import type { InvoiceSendingSnapshot, InvoiceSendingStore } from "../../application/src/invoice-sending";
import { InvoiceRecoveryError } from "../../application/src/invoice-recovery-contract";
import { createD1DeliveryJournal, type DeliveryDatabase, type SandboxDeliveryJournal } from "../../paypal/src/delivery-journal";
import type { ConsentDatabase } from "./human-consent";
import { createD1InvoiceCreationStore } from "./invoice-creation";
import { createD1InvoiceSendingStore, INVOICE_SENDING_STATE_SQL } from "./invoice-sending";

export function createD1InvoiceRecoveryPersistence(db: ConsentDatabase & DeliveryDatabase,
  guard: () => Promise<InvoiceSendingSnapshot>, checkActive: () => void,
  retain: (op: Readonly<Record<string, unknown>>, invoiceId: string) => void) {
  const creation = createD1InvoiceCreationStore(db), sending = createD1InvoiceSendingStore(db), journal = createD1DeliveryJournal(db);
  const denied = () => { throw new InvoiceRecoveryError("recovery_unavailable"); };
  const creationStore: InvoiceCreationStore = {
    load: creation.load, reserve: async () => denied(),
    async claim(s, actor, at) {
      if ((await guard()).creation.stateJson !== s.stateJson) throw new InvoiceRecoveryError("stale_revision");
      checkActive(); await creation.claim(s, actor, at);
    },
    async remember(op, id, at) {
      // A validated provider response is private operational evidence. Retain its
      // identifier after expiry/source drift, while the existing operation fence
      // still prevents adoption, overwrite, duplicate observation, or dispatch.
      retain(op, id); await creation.remember(op, id, at);
    },
    async bind(s, actor, at) {
      if ((await guard()).creation.stateJson !== s.stateJson) throw new InvoiceRecoveryError("stale_revision");
      checkActive(); await creation.bind(s, actor, at);
    },
  };
  const sendingStore: InvoiceSendingStore = {
    load: sending.load, reserve: async () => denied(),
    async claim(s, actor, at) {
      if ((await guard()).stateJson !== s.stateJson) throw new InvoiceRecoveryError("stale_revision");
      checkActive(); await sending.claim(s, actor, at);
    },
    async complete(s, view, actor, at) {
      if ((await guard()).stateJson !== s.stateJson) throw new InvoiceRecoveryError("stale_revision");
      checkActive(); await sending.complete(s, view, actor, at);
    },
  };
  async function journalWrite(id: string, claim: boolean) {
    const s = await guard(), c = s.creation.consent.root.case as Record<string, unknown>;
    if (s.creation.binding?.provider_invoice_id !== id || !s.journal) throw new InvoiceRecoveryError("source_invalid");
    const statement = (db as DeliveryDatabase).prepare(`UPDATE paypal_delivery_journal SET send_state=? WHERE invoice_id=?
      ${claim ? "AND send_state='not_started'" : ""} AND EXISTS(SELECT 1 FROM licensing_cases c,(SELECT NULL AS digest) arg
      WHERE c.case_id=? AND ${INVOICE_SENDING_STATE_SQL}=?)`).bind(claim ? "started" : "confirmed", id, String(c.case_id), s.stateJson);
    checkActive(); const result = await statement.run();
    if (!result.success) throw new InvoiceRecoveryError("storage_unavailable");
    if (!claim && result.meta?.changes !== 1) throw new InvoiceRecoveryError("stale_revision");
    return result.meta?.changes === 1;
  }
  const recoveryJournal: SandboxDeliveryJournal = {
    byInvoice: journal.byInvoice, reserve: async () => denied(), complete: async () => denied(),
    claimSend: id => journalWrite(id, true),
    async confirmSend(id) { await journalWrite(id, false); },
  };
  return { creation: creationStore, sending: sendingStore, journal: recoveryJournal, read: sending };
}
