/** Derive an adapter journal entry for an ALREADY canonical-bound draft.
 * This pure helper never creates or sends a provider invoice.
 */
import { validateAuthorizedInvoiceSnapshot } from "./adapter";
import { mapSandboxDraftInvoice, type SandboxMerchant } from "./sandbox-draft";
import { sha256Hex } from "../../receipts/src/canonical";
import type { AuthorizedInvoiceSnapshot, PaymentInvoiceView } from "./contract";
import type { DeliveryEntry } from "./delivery-journal";
export async function prepareDeliveryAdoption(
  request: AuthorizedInvoiceSnapshot, invoiceId: string, clientId: string, merchant: SandboxMerchant,
): Promise<DeliveryEntry> {
  const r = validateAuthorizedInvoiceSnapshot(request);
  if (!/^INV2-[A-Za-z0-9-]{3,100}$/u.test(invoiceId) || typeof clientId !== "string"
    || !clientId.length || clientId.length > 256 || /[\s:]/u.test(clientId)) throw new Error("Invalid Sandbox delivery identity.");
  const mapped = await mapSandboxDraftInvoice(r, merchant), detail = mapped.detail as Record<string, unknown>;
  const draft: PaymentInvoiceView = { invoiceId, mode: "paypal_sandbox", provider: "paypal", environment: "sandbox",
    caseId: r.caseId, quoteId: r.quoteId, termsVersionId: r.termsVersionId, buyerAcceptanceId: r.buyerAcceptanceId,
    amountCents: r.amountCents, currency: "USD", status: "DRAFT", simulated: false, authoritativePaymentEvidence: false };
  return { requestId: r.requestId, caseId: r.caseId, snapshotHash: await sha256Hex(JSON.stringify(r)),
    merchantHash: await sha256Hex(`${clientId}\n${merchant.email.toLowerCase()}`), sendState: "not_started",
    binding: { draft, assetId: r.assetId, creatorDecisionId: r.creatorDecisionId,
      invoiceNumber: String(detail.invoice_number), recipientHash: await sha256Hex(r.recipientEmail.toLowerCase()),
      merchantEmailHash: await sha256Hex(merchant.email.toLowerCase()), noteHash: await sha256Hex(String(detail.note)),
      summaryHash: await sha256Hex(r.rightsSummary) } };
}
/** Same durable key in the operation record and the actual send request header. */
export async function sandboxSendRequestId(merchantHash: string, invoiceId: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/u.test(merchantHash) || !/^INV2-[A-Za-z0-9-]{3,100}$/u.test(invoiceId)) {
    throw new Error("Invalid Sandbox send key context.");
  }
  return `rr-send-${(await sha256Hex(`${merchantHash}:${invoiceId}`)).slice(0, 30)}`;
}
