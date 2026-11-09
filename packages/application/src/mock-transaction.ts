import type { ClockPort, IdentifierPort } from "./index";
import type { BuyerRequestPersistencePort, CapabilityTokenPort } from "./buyer-requests";
import type { QuoteService, QuoteView } from "./quotes";
import type { Sha256Port, TermsReviewPersistencePort } from "./rights-terms";

export const MOCK_DISCLAIMER =
  "SIMULATED DEMONSTRATION ONLY. No PayPal transaction occurred. This record does not grant a real license.";

export type MockDecision = "approved" | "rejected" | "clarification_requested";
export type MockStage =
  | "awaiting_quote" | "quote_changed" | "awaiting_creator" | "needs_clarification"
  | "rejected" | "awaiting_buyer" | "awaiting_simulated_payment"
  | "simulated_scheduled" | "simulated_active" | "simulated_expired";

export interface MockApproval {
  readonly decision: MockDecision;
  readonly termsVersionId: string;
  readonly quoteId: string;
  readonly actor: "creator";
  readonly at: string;
  readonly reason: string | null;
}

export interface MockAcceptance {
  readonly termsVersionId: string;
  readonly quoteId: string;
  readonly actor: "buyer";
  readonly at: string;
}

export interface MockPayment {
  readonly provider: "fake";
  readonly mode: "simulated";
  readonly reference: string;
  readonly status: "simulated_paid";
  readonly recordedAt: string;
}

export interface MockReceipt {
  readonly publicId: string;
  readonly canonicalJson: string;
  readonly sha256: string;
  readonly issuedAt: string;
}

export interface MockTransactionRecord {
  readonly caseId: string;
  readonly revision: number;
  readonly approval: MockApproval | null;
  readonly acceptance: MockAcceptance | null;
  readonly payment: MockPayment | null;
  readonly receipt: MockReceipt | null;
}

export interface MockTransactionStore {
  get(caseId: string): Promise<MockTransactionRecord | null>;
  getByPublicId(publicId: string): Promise<MockTransactionRecord | null>;
  save(caseId: string, expectedRevision: number, next: MockTransactionRecord): Promise<void>;
}

export interface MockTransactionDependencies {
  readonly terms: Pick<TermsReviewPersistencePort, "getCaseContext">;
  readonly quotes: Pick<QuoteService, "getQuote">;
  readonly buyerRequests: Pick<BuyerRequestPersistencePort, "findByCapabilityDigest">;
  readonly capabilities: CapabilityTokenPort;
  readonly store: MockTransactionStore;
  readonly identifiers: IdentifierPort;
  readonly clock: ClockPort;
  readonly hasher: Sha256Port;
}

export interface MockTransactionView {
  readonly caseId: string;
  readonly caseRowVersion: number;
  readonly mockRevision: number;
  readonly stage: MockStage;
  readonly disclaimer: typeof MOCK_DISCLAIMER;
  readonly asset: { readonly title: string; readonly previewReference: string; readonly fingerprint: string };
  readonly buyerOrganization: string;
  readonly quote: QuoteView["quote"];
  readonly licensePeriod: QuoteView["licensePeriod"];
  readonly approval: MockApproval | null;
  readonly acceptance: MockAcceptance | null;
  readonly payment: MockPayment | null;
  readonly publicReceiptId: string | null;
}

export interface MockVerificationView {
  readonly verified: boolean;
  readonly mode: "simulated";
  readonly provider: "fake";
  readonly disclaimer: typeof MOCK_DISCLAIMER;
  readonly hash: string;
  readonly payload: Record<string, unknown> | null;
  readonly currentPermissionStatus: "simulated_scheduled" | "simulated_active" | "simulated_expired" | "invalid";
}

export class MockTransactionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "MockTransactionError";
  }
}

function fail(code: string, message: string): never {
  throw new MockTransactionError(code, message);
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(",")}}`;
  }
  return fail("invalid_receipt_payload", "Receipt payload requires canonical JSON-compatible values.");
}

export function simulatedPermissionState(
  startDate: string, endDateExclusive: string, now: Date,
): "simulated_scheduled" | "simulated_active" | "simulated_expired" {
  const today = now.toISOString().slice(0, 10);
  if (today < startDate) return "simulated_scheduled";
  if (today >= endDateExclusive) return "simulated_expired";
  return "simulated_active";
}

export class MockTransactionService {
  private readonly deps: MockTransactionDependencies;
  constructor(deps: MockTransactionDependencies) { this.deps = deps; }

  private async current(caseId: string) {
    const context = await this.deps.terms.getCaseContext(caseId);
    if (!context || context.caseOutcome !== "open") {
      return fail("case_unavailable", "A submitted, open licensing case is required.");
    }
    const quote = await this.deps.quotes.getQuote(caseId);
    return { context, quote };
  }

  private matching(record: MockTransactionRecord | null, quote: QuoteView) {
    return !!record?.approval && quote.status === "quoted" && !!quote.quote
      && record.approval.quoteId === quote.quote.record.quoteId
      && record.approval.termsVersionId === quote.quote.record.termsVersionId;
  }

  private stage(record: MockTransactionRecord | null, quote: QuoteView): MockStage {
    if (quote.status !== "quoted" || !quote.quote) {
      return record?.approval ? "quote_changed" : "awaiting_quote";
    }
    if (record?.approval && !this.matching(record, quote)) return "quote_changed";
    if (!record?.approval) return "awaiting_creator";
    if (record.approval.decision === "rejected") return "rejected";
    if (record.approval.decision === "clarification_requested") return "needs_clarification";
    if (!record.acceptance) return "awaiting_buyer";
    if (!record.payment) return "awaiting_simulated_payment";
    if (!record.receipt || !quote.licensePeriod) return "quote_changed";
    return simulatedPermissionState(quote.licensePeriod.startDate, quote.licensePeriod.endDateExclusive, this.deps.clock.now());
  }

  async getCreator(caseId: string): Promise<MockTransactionView> {
    const { context, quote } = await this.current(caseId);
    const record = await this.deps.store.get(caseId);
    const stage = this.stage(record, quote);
    return {
      caseId, caseRowVersion: context.caseRowVersion,
      mockRevision: record?.revision ?? 0,
      stage, disclaimer: MOCK_DISCLAIMER,
      asset: { title: context.asset.title, previewReference: context.asset.previewReference,
        fingerprint: context.asset.fingerprintValue },
      buyerOrganization: context.request.buyerOrganization,
      quote: quote.status === "quoted" ? quote.quote : null,
      licensePeriod: quote.status === "quoted" ? quote.licensePeriod : null,
      approval: stage !== "quote_changed" ? record?.approval ?? null : null,
      acceptance: stage !== "quote_changed" ? record?.acceptance ?? null : null,
      payment: stage !== "quote_changed" ? record?.payment ?? null : null,
      publicReceiptId: stage !== "quote_changed" ? record?.receipt?.publicId ?? null : null,
    };
  }

  private async authorizedBuyer(token: string) {
    const digest = await this.deps.capabilities.digest(token);
    const context = await this.deps.buyerRequests.findByCapabilityDigest(digest);
    if (!context || context.revokedAt || Date.parse(context.expiresAt) <= this.deps.clock.now().getTime()
      || !context.allowedActions.includes("review") || !context.requestSubmissionId
      || context.asset.availability !== "active") {
      return fail("buyer_capability_invalid", "This buyer link cannot review or accept the quoted terms.");
    }
    return context;
  }

  async getBuyer(token: string): Promise<MockTransactionView> {
    const context = await this.authorizedBuyer(token);
    return this.getCreator(context.caseId);
  }

  async decide(
    caseId: string,
    input: { expectedCaseRowVersion: number; expectedMockRevision: number; quoteId: string; termsVersionId: string; decision: MockDecision; reason?: string | undefined },
  ): Promise<MockTransactionView> {
    const { context, quote } = await this.current(caseId);
    const old = await this.deps.store.get(caseId);
    if (context.caseRowVersion !== input.expectedCaseRowVersion || (old?.revision ?? 0) !== input.expectedMockRevision) {
      return fail("stale_revision", "The case changed. Reload before making a creator decision.");
    }
    if (quote.status !== "quoted" || !quote.quote || quote.quote.record.status !== "current"
      || quote.quote.record.quoteId !== input.quoteId
      || quote.quote.record.termsVersionId !== input.termsVersionId) {
      return fail("stale_quote", "The decision must bind to the current saved terms and quote.");
    }
    if (old?.payment || (old?.acceptance && this.matching(old, quote))) {
      return fail("decision_locked", "Accepted or simulated-paid terms cannot be silently changed.");
    }
    if (old?.approval?.decision === "rejected" && this.matching(old, quote)) {
      return fail("decision_locked", "A rejected request cannot be reopened without a new case.");
    }
    if (old?.approval?.decision === "clarification_requested" && this.matching(old, quote)) {
      return fail("clarification_required", "Create a new terms and quote version before approval.");
    }
    if (input.decision !== "approved" && (!input.reason?.trim() || input.reason.length > 500)) {
      return fail("reason_required", "A short reason is required for rejection or clarification.");
    }
    if (input.decision === "approved" && old?.approval?.decision === "approved" && this.matching(old, quote)) {
      return this.getCreator(caseId);
    }
    const next: MockTransactionRecord = {
      caseId, revision: (old?.revision ?? 0) + 1,
      approval: {
        decision: input.decision, quoteId: input.quoteId, termsVersionId: input.termsVersionId,
        actor: "creator", at: this.deps.clock.now().toISOString(),
        reason: input.decision === "approved" ? null : input.reason!.trim(),
      },
      acceptance: null, payment: null, receipt: null,
    };
    await this.deps.store.save(caseId, old?.revision ?? 0, next);
    return this.getCreator(caseId);
  }

  async accept(
    token: string,
    input: { expectedMockRevision: number; quoteId: string; termsVersionId: string; accepted: true },
  ): Promise<MockTransactionView> {
    const buyer = await this.authorizedBuyer(token);
    const caseId = buyer.caseId;
    const { quote } = await this.current(caseId);
    const old = await this.deps.store.get(caseId);
    if (!old || old.revision !== input.expectedMockRevision) {
      return fail("stale_revision", "The creator decision changed. Reload the accepted terms.");
    }
    if (quote.status !== "quoted" || !quote.quote || !this.matching(old, quote)
      || quote.quote.record.quoteId !== input.quoteId
      || quote.quote.record.termsVersionId !== input.termsVersionId
      || old.approval?.decision !== "approved") {
      return fail("approval_required", "Only the current creator-approved quote can be accepted.");
    }
    if (input.accepted !== true) return fail("acceptance_required", "The buyer must explicitly accept the exact terms and quote.");
    if (old.acceptance) return this.getCreator(caseId);
    const next: MockTransactionRecord = {
      ...old, revision: old.revision + 1,
      acceptance: { actor: "buyer", quoteId: input.quoteId,
        termsVersionId: input.termsVersionId, at: this.deps.clock.now().toISOString() },
    };
    await this.deps.store.save(caseId, old.revision, next);
    return this.getCreator(caseId);
  }

  async simulatePayment(
    caseId: string,
    input: { expectedMockRevision: number; quoteId: string },
  ): Promise<MockTransactionView> {
    const { context, quote } = await this.current(caseId);
    const old = await this.deps.store.get(caseId);
    if (!old || old.revision !== input.expectedMockRevision) {
      return fail("stale_revision", "Reload the transaction before simulating a payment.");
    }
    if (old.payment) return this.getCreator(caseId);
    if (quote.status !== "quoted" || !quote.quote || !quote.licensePeriod
      || !this.matching(old, quote) || old.approval?.decision !== "approved"
      || !old.acceptance || old.acceptance.quoteId !== input.quoteId
      || old.acceptance.termsVersionId !== old.approval.termsVersionId
      || quote.quote.record.quoteId !== input.quoteId) {
      return fail("acceptance_required", "Current creator approval and matching buyer acceptance are required.");
    }
    const now = this.deps.clock.now();
    const { token: publicId } = await this.deps.capabilities.issue();
    const payment: MockPayment = {
      provider: "fake", mode: "simulated", reference: `SIM-${this.deps.identifiers.create()}`,
      status: "simulated_paid", recordedAt: now.toISOString(),
    };
    const payload = {
      schema_version: "rightsreceipt-simulated-v1", demonstration_only: true,
      provider: "fake", mode: "simulated", public_receipt_id: publicId,
      asset_title: context.asset.title, asset_fingerprint_sha256: context.asset.fingerprintValue,
      terms_version_id: old.approval.termsVersionId,
      quote_id: input.quoteId, amount_cents: quote.quote.record.amountCents, currency: "USD",
      license_start_date: quote.licensePeriod.startDate,
      license_end_date_exclusive: quote.licensePeriod.endDateExclusive,
      payment_reference: payment.reference, issued_at: payment.recordedAt,
      status_at_issue: simulatedPermissionState(quote.licensePeriod.startDate,
        quote.licensePeriod.endDateExclusive, now),
      disclaimer: MOCK_DISCLAIMER,
    };
    const canonicalJson = stableJson(payload);
    const receipt: MockReceipt = {
      publicId, canonicalJson, sha256: await this.deps.hasher.sha256Hex(canonicalJson), issuedAt: now.toISOString(),
    };
    const next: MockTransactionRecord = { ...old, revision: old.revision + 1, payment, receipt };
    await this.deps.store.save(caseId, old.revision, next);
    return this.getCreator(caseId);
  }

  async verify(publicId: string): Promise<MockVerificationView> {
    const record = await this.deps.store.getByPublicId(publicId);
    if (!record?.receipt || !record.payment || record.receipt.publicId !== publicId) {
      return fail("receipt_not_found", "No simulated receipt exists for this identifier.");
    }
    const actual = await this.deps.hasher.sha256Hex(record.receipt.canonicalJson);
    let payload: Record<string, unknown> | null = null;
    let canonical = false;
    try {
      const parsed: unknown = JSON.parse(record.receipt.canonicalJson);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
        canonical = stableJson(payload) === record.receipt.canonicalJson;
      }
    } catch { /* Malformed or noncanonical evidence is invalid. */ }
    const start = payload?.license_start_date;
    const end = payload?.license_end_date_exclusive;
    const validDate = (value: unknown) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
      const timestamp = Date.parse(value + "T00:00:00.000Z");
      return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
    };
    let currentQuote: QuoteView | null = null;
    try {
      currentQuote = await this.deps.quotes.getQuote(record.caseId);
    } catch { /* A missing or unverifiable source quote invalidates verification. */ }
    const matchesQuote = currentQuote?.status === "quoted"
      && currentQuote.quote?.record.status === "current"
      && currentQuote.quote.record.quoteId === payload?.quote_id
      && currentQuote.quote.record.termsVersionId === payload.terms_version_id
      && currentQuote.quote.record.amountCents === payload.amount_cents
      && currentQuote.quote.record.currency === payload.currency
      && currentQuote.licensePeriod?.startDate === start
      && currentQuote.licensePeriod?.endDateExclusive === end;
    const matchesRecordedEvidence = record.approval?.decision === "approved"
      && record.acceptance?.quoteId === record.approval.quoteId
      && record.acceptance.termsVersionId === record.approval.termsVersionId
      && record.payment.provider === "fake"
      && record.payment.mode === "simulated"
      && record.payment.status === "simulated_paid"
      && record.receipt.issuedAt === record.payment.recordedAt
      && payload?.payment_reference === record.payment.reference
      && payload?.issued_at === record.receipt.issuedAt
      && payload?.quote_id === record.approval.quoteId
      && payload?.terms_version_id === record.approval.termsVersionId;
    const valid = canonical && actual === record.receipt.sha256
      && payload?.schema_version === "rightsreceipt-simulated-v1"
      && payload.mode === "simulated"
      && payload.provider === "fake"
      && payload.demonstration_only === true
      && payload.disclaimer === MOCK_DISCLAIMER
      && payload.public_receipt_id === publicId
      && payload.currency === "USD"
      && Number.isSafeInteger(payload.amount_cents)
      && (payload.amount_cents as number) >= 0
      && typeof payload.asset_title === "string"
      && payload.asset_title.length > 0
      && typeof payload.asset_fingerprint_sha256 === "string"
      && /^[a-f0-9]{64}$/u.test(payload.asset_fingerprint_sha256)
      && validDate(start) && validDate(end)
      && (start as string) < (end as string)
      && payload.status_at_issue === simulatedPermissionState(
        start as string, end as string, new Date(record.payment.recordedAt),
      )
      && matchesRecordedEvidence
      && matchesQuote;
    return {
      verified: !!valid, mode: "simulated", provider: "fake", disclaimer: MOCK_DISCLAIMER,
      hash: record.receipt.sha256, payload: valid ? payload : null,
      currentPermissionStatus: valid && typeof start === "string" && typeof end === "string"
        ? simulatedPermissionState(start, end, this.deps.clock.now()) : "invalid",
    };
  }
}
