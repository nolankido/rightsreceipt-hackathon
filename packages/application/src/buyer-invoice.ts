/** A buyer may read an already delivered accepted invoice, never create/send it. */
import { canonicalHash, canonicalJson } from "../../receipts/src/canonical";
import { consentId, consentRow, type ConsentSnapshot } from "./consent-contract";
import { verifyAcceptedInvoiceSnapshot } from "./human-consent";
import { prepareDeliveryAdoption, sandboxSendRequestId } from "../../paypal/src/delivery-adoption";
import type { InvoiceSendingSnapshot } from "./invoice-sending";
import type { ReceiptSnapshot } from "../../receipts/src/contract";
import type { SandboxMerchant } from "../../paypal/src/sandbox-draft";

export interface BuyerPaymentSnapshot {
  readonly caseId: string;
  readonly consent: ConsentSnapshot;
  readonly invoice: InvoiceSendingSnapshot;
  readonly receipt: ReceiptSnapshot;
}

export async function verifyBuyerInvoice(s: BuyerPaymentSnapshot, clientId: string, merchant: SandboxMerchant, at: string) {
  const { deal, request } = await verifyAcceptedInvoiceSnapshot(s.consent, at);
  const creation = s.invoice.creation, b = consentRow(creation.binding), c = consentRow(s.consent.root.case);
  const create = creation.operations[0], send = s.invoice.operations[0], journal = s.invoice.journal;
  const v = consentRow(creation.verification);
  const bad = () => { throw new Error("Current accepted Sandbox invoice is unavailable."); };
  if (deal.caseId !== s.caseId || c.invoice_binding_id !== b.invoice_binding_id || c.verification_record_id !== v.verification_record_id
    || b.case_id !== s.caseId || b.provider !== "paypal" || b.environment !== "sandbox" || b.invoice_status !== "sent"
    || b.terms_version_id !== request.termsVersionId || b.quote_id !== request.quoteId || b.buyer_acceptance_id !== request.buyerAcceptanceId
    || typeof b.provider_invoice_id !== "string" || !/^INV2-[A-Za-z0-9-]{3,100}$/u.test(b.provider_invoice_id)
    || b.safe_invoice_reference !== b.provider_invoice_id || v.case_id !== s.caseId || v.current_status !== "pending"
    || v.current_receipt_revision_id !== null || c.permission_id !== null || s.consent.root.permissionCount !== 0
    || s.consent.root.receiptCount !== 0 || s.consent.root.invoiceCount !== 1 || s.consent.root.operationCount !== 2
    || creation.operations.length !== 1 || s.invoice.operations.length !== 1 || !create || !send || !journal) bad();
  if (!create || !send || !journal) return bad();
  for (const row of [create, send, b, v]) {
    if (!Number.isSafeInteger(row.row_version) || Number(row.row_version) < 1 || Number(row.row_version) >= Number.MAX_SAFE_INTEGER) bad();
  }
  for (const value of [create.payment_operation_id, send.payment_operation_id, b.invoice_binding_id, v.verification_record_id]) consentId(value);
  const account = await canonicalHash({ provider: "paypal", environment: "sandbox", client_id: clientId, merchant });
  const creationHash = await canonicalHash({ schema: "invoice-creation-v1", account_sha256: account, request });
  if (create.case_id !== s.caseId || create.operation_type !== "create_invoice" || create.operation_key !== `invoice-create:${request.requestId}`
    || create.command_fingerprint !== creationHash || create.provider_request_id !== request.requestId
    || create.provider_reference !== b.provider_invoice_id || create.provider !== "paypal" || create.environment !== "sandbox"
    || create.status !== "succeeded" || create.attempt_count !== 1 || create.error_code !== null) bad();
  const expected = await prepareDeliveryAdoption(request, String(b.provider_invoice_id), clientId, merchant);
  if (journal.sendState !== "confirmed" || canonicalJson({ ...journal, sendState: "not_started" }) !== canonicalJson(expected)) bad();
  const sendKey = await sandboxSendRequestId(expected.merchantHash, String(b.provider_invoice_id));
  const sendingHash = await canonicalHash({ schema: "invoice-send-v1", creation_sha256: creationHash,
    invoice_id: b.provider_invoice_id, journal: expected, confirmation: "send-sandbox-invoice-v1" });
  if (send.case_id !== s.caseId || send.operation_type !== "send_invoice" || send.operation_key !== `invoice-send:${request.requestId}`
    || send.command_fingerprint !== sendingHash || send.provider_request_id !== sendKey || send.provider_reference !== b.provider_invoice_id
    || send.provider !== "paypal" || send.environment !== "sandbox" || send.status !== "succeeded" || send.attempt_count !== 1
    || send.error_code !== null) bad();
  // Existing financial evidence, permissions or receipt revisions must not be
  // bypassed by a stale invoice row that still happens to say sent.
  const evidence = s.receipt.root.evidence, financial = s.receipt.root.financial;
  if (s.receipt.root.permission !== null || s.receipt.chain.length || !Array.isArray(evidence)
    || evidence.some(e => !["draft", "sent"].includes(String(consentRow(e).payment_status)))) bad();
  if (financial !== null) {
    const f = consentRow(financial);
    if (f.conclusion !== "unpaid" || f.paid_cents !== 0 || f.refunded_cents !== 0) bad();
  }
  const recovery = consentRow(s.receipt.root.outbox);
  if (recovery.invoice_binding_id !== b.invoice_binding_id || recovery.lease_token !== null || recovery.blocked_code !== null
    || !Number.isSafeInteger(recovery.requested_generation) || Number(recovery.requested_generation) < 1
    || !Number.isSafeInteger(recovery.completed_generation) || Number(recovery.completed_generation) < 0
    || Number(recovery.completed_generation) > Number(recovery.requested_generation)) bad();
  const licenseEndsAt = Date.parse(`${deal.period.endDateExclusive}T00:00:00.000Z`);
  if (!Number.isFinite(licenseEndsAt) || new Date(at).getTime() >= licenseEndsAt) bad();
  return Object.freeze({ request, entry: Object.freeze({ ...expected, sendState: "confirmed" as const }),
    invoiceId: String(b.provider_invoice_id), licenseEndsAt });
}
