import { CreatorClarificationResponseSchema, BuyerClarificationResponseSchema, type CreatorClarificationResponse, type BuyerClarificationResponse } from "@rightsreceipt/contracts";
import {
  MockTransactionViewSchema,
  MockVerificationViewSchema,
  type MockTransactionViewDto,
  type MockVerificationViewDto,
  type MockDecisionRequest,
  type MockBuyerAcceptanceRequest,
  type MockPaymentRequest,
} from "@rightsreceipt/contracts";
import { QuoteViewResponseSchema, type QuoteViewResponse, CreatorExtractionViewSchema, type CreatorExtractionResponse } from "@rightsreceipt/contracts";
import {
  AssetRegistrationResponseSchema,
  BuyerRequestContextResponseSchema,
  BuyerRequestLinkResponseSchema,
  BuyerRequestSubmissionResponseSchema,
  CreatorAssetDetailResponseSchema,
  CreatorCaseListResponseSchema,
  CreatorWorkspaceResponseSchema,
  SafeApiErrorSchema,
  TermsReviewResponseSchema,
  type AssetRegistrationInputDto,
  type AssetRegistrationResponse,
  type BuyerRequestContextResponse,
  type BuyerRequestInputDto,
  type BuyerRequestLinkResponse,
  type BuyerRequestSubmissionResponse,
  type CreatorAssetDetailResponse,
  type CreatorCaseListResponse,
  type CreatorWorkspaceResponse,
  type ManualTermsReviewSaveRequest,
  type SafeApiError,
  type TermsReviewResponse,
} from "@rightsreceipt/contracts";

const creatorHeaders = {
  "x-rightsreceipt-demo-role": "creator",
} as const;

export class RightsReceiptApiError extends Error {
  readonly code: string;
  readonly issues: SafeApiError["issues"];

  constructor(error: SafeApiError) {
    super(error.message);
    this.name = "RightsReceiptApiError";
    this.code = error.code;
    this.issues = error.issues;
  }
}

export { RightsReceiptApiError as BuyerRequestApiError };
export { RightsReceiptApiError as CreatorApiError };

async function parseError(response: Response) {
  const fallback: SafeApiError = {
    code: "request_failed",
    message: `Request failed with status ${response.status}.`,
  };

  try {
    const parsed = SafeApiErrorSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

async function getJson<T>(
  path: string,
  parse: (input: unknown) => T,
  headers?: HeadersInit,
): Promise<T> {
  const response = await fetch(path, headers ? { headers } : undefined);
  if (!response.ok) throw new RightsReceiptApiError(await parseError(response));
  return parse(await response.json());
}

export function loadCreatorWorkspace(): Promise<CreatorWorkspaceResponse> {
  return getJson(
    "/api/creator/workspace",
    (input) => CreatorWorkspaceResponseSchema.parse(input),
    creatorHeaders,
  );
}

export function loadCreatorAsset(
  assetId: string,
): Promise<CreatorAssetDetailResponse> {
  return getJson(
    `/api/creator/assets/${encodeURIComponent(assetId)}`,
    (input) => CreatorAssetDetailResponseSchema.parse(input),
    creatorHeaders,
  );
}

export async function registerCreatorAsset(
  input: AssetRegistrationInputDto,
): Promise<AssetRegistrationResponse> {
  const response = await fetch("/api/creator/assets", {
    method: "POST",
    headers: {
      ...creatorHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new RightsReceiptApiError(await parseError(response));
  return AssetRegistrationResponseSchema.parse(await response.json());
}

export async function createBuyerRequestLink(
  assetId: string,
): Promise<BuyerRequestLinkResponse> {
  const response = await fetch(
    `/api/creator/assets/${encodeURIComponent(assetId)}/request-links`,
    { method: "POST", headers: creatorHeaders },
  );
  if (!response.ok) throw new RightsReceiptApiError(await parseError(response));
  return BuyerRequestLinkResponseSchema.parse(await response.json());
}

export function loadBuyerRequestContext(
  capability: string,
): Promise<BuyerRequestContextResponse> {
  return getJson(
    `/api/request/${encodeURIComponent(capability)}`,
    (input) => BuyerRequestContextResponseSchema.parse(input),
  );
}

export async function submitBuyerRequest(
  capability: string,
  input: BuyerRequestInputDto,
): Promise<BuyerRequestSubmissionResponse> {
  const response = await fetch(`/api/request/${encodeURIComponent(capability)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new RightsReceiptApiError(await parseError(response));
  return BuyerRequestSubmissionResponseSchema.parse(await response.json());
}

export function loadCreatorCases(): Promise<CreatorCaseListResponse> {
  return getJson(
    "/api/creator/cases",
    (input) => CreatorCaseListResponseSchema.parse(input),
    creatorHeaders,
  );
}

export function loadTermsReview(caseId: string): Promise<TermsReviewResponse> {
  return getJson(
    `/api/creator/cases/${encodeURIComponent(caseId)}/terms`,
    (input) => TermsReviewResponseSchema.parse(input),
    creatorHeaders,
  );
}

export async function saveManualTermsReview(
  caseId: string,
  input: ManualTermsReviewSaveRequest,
): Promise<TermsReviewResponse> {
  const response = await fetch(
    `/api/creator/cases/${encodeURIComponent(caseId)}/terms`,
    {
      method: "POST",
      headers: {
        ...creatorHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw new RightsReceiptApiError(await parseError(response));
  return TermsReviewResponseSchema.parse(await response.json());
}

export function loadCreatorQuote(caseId: string): Promise<QuoteViewResponse> {
  return getJson(
    `/api/creator/cases/${encodeURIComponent(caseId)}/quote`,
    (input) => QuoteViewResponseSchema.parse(input),
    creatorHeaders,
  );
}

export function loadCreatorExtraction(caseId: string): Promise<CreatorExtractionResponse> {
  return getJson(
    `/api/creator/cases/${encodeURIComponent(caseId)}/extraction`,
    input => CreatorExtractionViewSchema.parse(input), creatorHeaders,
  );
}
export async function runCreatorExtraction(
  caseId: string, expectedCaseRowVersion: number,
): Promise<CreatorExtractionResponse> {
  const response = await fetch(`/api/creator/cases/${encodeURIComponent(caseId)}/extraction`, {
    method:"POST",headers:{...creatorHeaders,"content-type":"application/json"},
    body:JSON.stringify({expectedCaseRowVersion}),
  });
  if(!response.ok) throw new RightsReceiptApiError(await parseError(response));
  return CreatorExtractionViewSchema.parse(await response.json());
}

export async function generateCreatorQuote(
  caseId: string,
  expectedCaseRowVersion: number,
): Promise<QuoteViewResponse> {
  const response = await fetch(`/api/creator/cases/${encodeURIComponent(caseId)}/quote`, {
    method: "POST",
    headers: { ...creatorHeaders, "content-type": "application/json" },
    body: JSON.stringify({ expectedCaseRowVersion }),
  });
  if (!response.ok) throw new RightsReceiptApiError(await parseError(response));
  return QuoteViewResponseSchema.parse(await response.json());
}

export function loadCreatorMock(caseId: string): Promise<MockTransactionViewDto> {
  return getJson(`/api/creator/cases/${encodeURIComponent(caseId)}/mock`,
    (data) => MockTransactionViewSchema.parse(data), creatorHeaders);
}

export function loadBuyerMock(token: string): Promise<MockTransactionViewDto> {
  return getJson(`/api/request/${encodeURIComponent(token)}/mock`,
    (data) => MockTransactionViewSchema.parse(data));
}

async function postMock(path: string, input: unknown, creator = false) {
  const response = await fetch(path, {
    method: "POST",
    headers: { ...(creator ? creatorHeaders : {}),
      "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new RightsReceiptApiError(await parseError(response));
  return MockTransactionViewSchema.parse(await response.json());
}

export function decideMockQuote(caseId: string, input: MockDecisionRequest) {
  return postMock(`/api/creator/cases/${encodeURIComponent(caseId)}/mock/decision`, input, true);
}

export function acceptMockQuote(token: string, input: MockBuyerAcceptanceRequest) {
  return postMock(`/api/request/${encodeURIComponent(token)}/mock/accept`, input);
}

export function simulateMockPayment(caseId: string, input: MockPaymentRequest) {
  return postMock(`/api/creator/cases/${encodeURIComponent(caseId)}/mock/payment`, input, true);
}

export function loadMockVerification(publicId: string): Promise<MockVerificationViewDto> {
  return getJson(`/api/mock/verify/${encodeURIComponent(publicId)}`,
    (data) => MockVerificationViewSchema.parse(data));
}

export function loadCreatorClarification(caseId: string): Promise<CreatorClarificationResponse> {
  return getJson(`/api/creator/cases/${encodeURIComponent(caseId)}/clarification`,
    (data) => CreatorClarificationResponseSchema.parse(data), creatorHeaders);
}
export function loadBuyerClarification(capability: string): Promise<BuyerClarificationResponse> {
  return getJson(`/api/request/${encodeURIComponent(capability)}/clarify`,
    (data) => BuyerClarificationResponseSchema.parse(data));
}
