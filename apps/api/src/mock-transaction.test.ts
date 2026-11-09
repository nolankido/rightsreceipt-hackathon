import { describe, expect, it } from "vitest";
import {
  BuyerRequestLinkResponseSchema, CreatorCaseListResponseSchema,
  MockTransactionViewSchema, MockVerificationViewSchema,
  QuoteViewResponseSchema, TermsReviewResponseSchema,
} from "@rightsreceipt/contracts";
import { app } from "./index";

const assetId = "00000000-0000-4000-8000-000000000003";
const creator = { "x-rightsreceipt-demo-role": "creator" };


describe("complete mock transaction through Hono", () => {
  it("binds one request and quote to both approvals, fake payment, and public verification", async () => {
    const before = CreatorCaseListResponseSchema.parse(await (await app.request("http://local.test/api/creator/cases", { headers: creator })).json());
    const knownCaseIds = new Set(before.cases.map((item) => item.caseId));
    const linkResponse = await app.request(`http://local.test/api/creator/assets/${assetId}/request-links`, { method: "POST", headers: creator });
    expect(linkResponse.status).toBe(201);
    const link = BuyerRequestLinkResponseSchema.parse(await linkResponse.json());
    const capability = String(link.requestPath).split("/").at(-1)!;
    const buyerInput = {
      buyerName: "Jordan Lee", buyerOrganization: "Cedar & Tide Travel",
      buyerEmail: "jordan@example.test", consentAcknowledged: true,
      intendedUseText: "We request paid Instagram and Facebook social ads in the United States and Canada for 90 days, up to 500000 impressions, with crop-only modification and non-exclusive rights. No AI training or sublicensing.",
    };
    expect((await app.request(`http://local.test/api/request/${capability}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buyerInput),
    })).status).toBe(201);

    const casesResponse = await app.request("http://local.test/api/creator/cases", { headers: creator });
    const cases = CreatorCaseListResponseSchema.parse(await casesResponse.json());
    const entry = cases.cases.find((item) => item.assetId === assetId && !knownCaseIds.has(item.caseId));
    expect(entry).toBeDefined();
    const caseId = entry!.caseId;
    const initialTerms = TermsReviewResponseSchema.parse(await (await app.request(`http://local.test/api/creator/cases/${caseId}/terms`, { headers: creator })).json());
    const supported = {
      use_purpose: "commercial", channels: ["instagram_paid", "facebook_paid"],
      paid_advertising: true, territories: ["US", "CA"],
      start_date: "2026-10-25", duration_days: 90, max_impressions: 500000,
      exclusivity: "non_exclusive", modification_scope: "crop_only", attribution: "not_required",
      sublicensing: "prohibited", ai_use: "prohibited",
    };
    const fields = Object.fromEntries(Object.entries(supported).map(([key, value]) => [key, { state: "resolved", value }]));
    const termsResponse = await app.request(`http://local.test/api/creator/cases/${caseId}/terms`, {
      method: "POST", headers: { ...creator, "content-type": "application/json" },
      body: JSON.stringify({ expectedCaseRowVersion: initialTerms.caseRowVersion, fields }),
    });
    expect(termsResponse.status).toBe(200);
    const savedTerms = TermsReviewResponseSchema.parse(await termsResponse.json());
    expect(savedTerms.resolutionStatus).toBe("complete");

    const quoteResponse = await app.request(`http://local.test/api/creator/cases/${caseId}/quote`, {
      method: "POST", headers: { ...creator, "content-type": "application/json" },
      body: JSON.stringify({ expectedCaseRowVersion: savedTerms.caseRowVersion }),
    });
    expect(quoteResponse.status).toBe(201);
    const quote = QuoteViewResponseSchema.parse(await quoteResponse.json());
    expect(quote.quote?.record.amountCents).toBe(42500);
    if (!quote.quote) throw new Error("A deterministic quote must exist.");
    const quoted = quote.quote.record;

    const decision = await app.request(`http://local.test/api/creator/cases/${caseId}/mock/decision`, {
      method: "POST", headers: { ...creator, "content-type": "application/json" },
      body: JSON.stringify({ expectedCaseRowVersion: quote.caseRowVersion, expectedMockRevision: 0,
        quoteId: quoted.quoteId, termsVersionId: quoted.termsVersionId, decision: "approved" }),
    });
    expect(decision.status).toBe(200);
    expect(MockTransactionViewSchema.parse(await decision.json()).stage).toBe("awaiting_buyer");

    const accept = await app.request(`http://local.test/api/request/${capability}/mock/accept`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({expectedMockRevision:1,quoteId:quoted.quoteId,termsVersionId:quoted.termsVersionId,accepted:true}),
    });
    expect(accept.status).toBe(200);
    expect(MockTransactionViewSchema.parse(await accept.json()).stage).toBe("awaiting_simulated_payment");
    const simulate = await app.request(`http://local.test/api/creator/cases/${caseId}/mock/payment`, {
      method: "POST", headers: { ...creator, "content-type": "application/json" },
      body: JSON.stringify({ expectedMockRevision:2,quoteId:quoted.quoteId }),
    });
    expect(simulate.status).toBe(200);
    const paid = MockTransactionViewSchema.parse(await simulate.json());
    expect(paid.payment?.provider).toBe("fake");
    expect(paid.stage).toMatch(/^simulated_/u);
    const publicResponse = await app.request(`http://local.test/api/mock/verify/${paid.publicReceiptId}`);
    expect(publicResponse.status).toBe(200);
    const verified = MockVerificationViewSchema.parse(await publicResponse.json());
    expect(verified.verified).toBe(true);
    expect(verified.payload?.amount_cents).toBe(42500);
    expect(verified.payload?.demonstration_only).toBe(true);
    expect(JSON.stringify(verified)).not.toContain("jordan@example.test");
  });
});
