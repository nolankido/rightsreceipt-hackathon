/** Offline sample only. No real PayPal credentials, endpoint calls, or actual payments. */
import { createFakePaymentAdapter } from "../packages/paypal/src/adapter.ts";

const fake = createFakePaymentAdapter();
const snapshot = {
  caseId: "00000001-0000-4000-8000-000000000001",
  assetId: "00000002-0000-4000-8000-000000000002",
  termsVersionId: "00000003-0000-4000-8000-000000000003",
  quoteId: "00000004-0000-4000-8000-000000000004",
  creatorDecisionId: "00000005-0000-4000-8000-000000000005",
  buyerAcceptanceId: "00000006-0000-4000-8000-000000000006",
  amountCents: 42500,
  currency: "USD",
  recipientEmail: "buyer@example.test",
  rightsSummary: "Commercial paid Instagram and Facebook use in US and Canada, 90 days, crop only.",
  requestId: "rr-example-accepted-v1",
};
const draft = await fake.createDraftInvoice(snapshot);
const sent = await fake.sendInvoice(draft.invoiceId);
const paid = await fake.simulatePaidForTests(draft.invoiceId);
if ([draft, sent, paid].some(r => r.environment !== "simulated" || r.authoritativePaymentEvidence !== false)) {
  throw new Error("Fake invoices must remain explicitly simulated.");
}
console.log(JSON.stringify({
  label: "SIMULATED ONLY - NO PAYPAL PAYMENT OR LICENSE",
  invoiceId: paid.invoiceId,
  statuses: [draft.status, sent.status, paid.status],
  amountCents: paid.amountCents,
  authoritativePaymentEvidence: false,
}, null, 2));
