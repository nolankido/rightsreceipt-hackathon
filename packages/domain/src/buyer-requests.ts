import type { AssetRecord } from "./assets";

export const BUYER_REQUEST_CONSENT_COPY_VERSION = "buyer-request-v1" as const;
export const BUYER_REQUEST_CONSENT_COPY =
  "I confirm that this is a request for licensing terms. Submission does not grant permission, approve use, or confirm payment." as const;

export const BUYER_CAPABILITY_ACTIONS = [
  "submit_request",
  "clarify",
  "review",
  "receipt",
] as const;

export type BuyerCapabilityAction = (typeof BUYER_CAPABILITY_ACTIONS)[number];

export interface BuyerRequestInput {
  readonly buyerName: string;
  readonly buyerOrganization: string;
  readonly buyerEmail: string;
  readonly intendedUseText: string;
  readonly consentAcknowledged: boolean;
}

export interface BuyerRequestValidationIssue {
  readonly field:
    | "buyerName"
    | "buyerOrganization"
    | "buyerEmail"
    | "intendedUseText"
    | "consentAcknowledged";
  readonly code: string;
  readonly message: string;
}

export interface LicensingCaseDraftRecord {
  readonly caseId: string;
  readonly workspaceId: string;
  readonly assetId: string;
  readonly caseOutcome: "open";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: 1;
}

export interface BuyerCapabilityRecord {
  readonly buyerCapabilityId: string;
  readonly caseId: string;
  readonly tokenDigestSha256: string;
  readonly allowedActions: readonly BuyerCapabilityAction[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: null;
  readonly rotationNumber: 1;
}

export interface BuyerRequestSubmissionRecord {
  readonly requestSubmissionId: string;
  readonly caseId: string;
  readonly buyerName: string;
  readonly buyerOrganization: string;
  readonly buyerEmail: string;
  readonly intendedUseText: string;
  readonly normalizedText: string;
  readonly consentCopyVersion: typeof BUYER_REQUEST_CONSENT_COPY_VERSION;
  readonly consentAcknowledged: true;
  readonly submittedAt: string;
}

export interface BuyerRequestLinkContext {
  readonly caseId: string;
  readonly asset: AssetRecord;
  readonly allowedActions: readonly BuyerCapabilityAction[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly requestSubmissionId: string | null;
}

export interface BuyerRequestLinkRecordContext {
  readonly caseId: string;
  readonly buyerCapabilityId: string;
  readonly tokenDigestSha256: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface BuyerRequestSubmissionContext {
  readonly requestSubmissionId: string;
  readonly caseId: string;
  readonly submittedAt: string;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const UNSAFE_MARKUP_PATTERNS = [
  /<\s*\/?\s*(?:script|iframe|object|embed|style|link|meta|svg|math)\b/iu,
  /\bon[a-z]+\s*=/iu,
  /javascript\s*:/iu,
  /\{\{[\s\S]*?\}\}/u,
  /<%[\s\S]*?%>/u,
  /\$\{[\s\S]*?\}/u,
] as const;

export class BuyerRequestValidationError extends Error {
  readonly issues: readonly BuyerRequestValidationIssue[];

  constructor(issues: readonly BuyerRequestValidationIssue[]) {
    super("Buyer request did not pass validation.");
    this.name = "BuyerRequestValidationError";
    this.issues = issues;
  }
}

export class BuyerRequestLinkError extends Error {
  readonly code:
    | "invalid_case_id"
    | "invalid_capability_id"
    | "invalid_capability_digest"
    | "invalid_issued_at"
    | "invalid_expires_at"
    | "asset_unavailable";

  constructor(code: BuyerRequestLinkError["code"], message: string) {
    super(message);
    this.name = "BuyerRequestLinkError";
    this.code = code;
  }
}

function characterCount(value: string) {
  return Array.from(value).length;
}

function isIsoUtcInstant(value: string) {
  return value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

function unsafeMarkupDetected(value: string) {
  return UNSAFE_MARKUP_PATTERNS.some((pattern) => pattern.test(value));
}

function validatePlainText(
  issues: BuyerRequestValidationIssue[],
  field: "buyerName" | "buyerOrganization",
  value: string,
  minimum: number,
  maximum: number,
  label: string,
) {
  const trimmed = value.trim();
  const length = characterCount(trimmed);
  if (length < minimum || length > maximum) {
    issues.push({
      field,
      code: "invalid_length",
      message: `${label} must contain ${minimum} through ${maximum} characters.`,
    });
  }
  if (CONTROL_CHARACTER_PATTERN.test(value) || unsafeMarkupDetected(value)) {
    issues.push({
      field,
      code: "unsafe_text",
      message: `${label} must be plain text without executable markup or template syntax.`,
    });
  }
}

export function normalizeIntendedUseText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trimEnd())
    .join("\n")
    .trim();
}

export function validateBuyerRequestInput(
  input: BuyerRequestInput,
): readonly BuyerRequestValidationIssue[] {
  const issues: BuyerRequestValidationIssue[] = [];

  validatePlainText(issues, "buyerName", input.buyerName, 2, 100, "Buyer name");
  validatePlainText(
    issues,
    "buyerOrganization",
    input.buyerOrganization,
    2,
    120,
    "Buyer organization",
  );

  const email = input.buyerEmail.trim();
  if (
    characterCount(email) < 3
    || characterCount(email) > 254
    || !EMAIL_PATTERN.test(email)
  ) {
    issues.push({
      field: "buyerEmail",
      code: "invalid_email",
      message: "Enter a valid buyer email address no longer than 254 characters.",
    });
  }
  if (CONTROL_CHARACTER_PATTERN.test(email) || unsafeMarkupDetected(email)) {
    issues.push({
      field: "buyerEmail",
      code: "unsafe_text",
      message: "Buyer email must not contain markup, templates, or control characters.",
    });
  }

  const intendedUseLength = characterCount(input.intendedUseText);
  if (intendedUseLength < 40 || intendedUseLength > 4000) {
    issues.push({
      field: "intendedUseText",
      code: "invalid_length",
      message: "Intended use must contain 40 through 4,000 characters.",
    });
  }
  if (normalizeIntendedUseText(input.intendedUseText).length === 0) {
    issues.push({
      field: "intendedUseText",
      code: "required",
      message: "Describe the intended use in plain language.",
    });
  }
  if (
    CONTROL_CHARACTER_PATTERN.test(input.intendedUseText)
    || unsafeMarkupDetected(input.intendedUseText)
  ) {
    issues.push({
      field: "intendedUseText",
      code: "unsafe_markup",
      message:
        "Intended use must be plain text without executable markup or template syntax.",
    });
  }

  if (!input.consentAcknowledged) {
    issues.push({
      field: "consentAcknowledged",
      code: "consent_required",
      message: "Acknowledge the request and demonstration-payment consent copy.",
    });
  }

  return issues;
}

export function createBuyerRequestLinkRecords(
  asset: AssetRecord,
  context: BuyerRequestLinkRecordContext,
): {
  readonly licensingCase: LicensingCaseDraftRecord;
  readonly capability: BuyerCapabilityRecord;
} {
  if (asset.availability !== "active") {
    throw new BuyerRequestLinkError(
      "asset_unavailable",
      "Archived assets cannot receive new buyer requests.",
    );
  }
  if (!UUID_V4_PATTERN.test(context.caseId)) {
    throw new BuyerRequestLinkError(
      "invalid_case_id",
      "Case identifier must be a canonical lowercase UUID version 4.",
    );
  }
  if (!UUID_V4_PATTERN.test(context.buyerCapabilityId)) {
    throw new BuyerRequestLinkError(
      "invalid_capability_id",
      "Capability identifier must be a canonical lowercase UUID version 4.",
    );
  }
  if (!SHA256_PATTERN.test(context.tokenDigestSha256)) {
    throw new BuyerRequestLinkError(
      "invalid_capability_digest",
      "Capability digest must be lowercase SHA-256 hexadecimal.",
    );
  }
  if (!isIsoUtcInstant(context.issuedAt)) {
    throw new BuyerRequestLinkError(
      "invalid_issued_at",
      "Capability issue time must be an ISO 8601 UTC instant.",
    );
  }
  if (
    !isIsoUtcInstant(context.expiresAt)
    || Date.parse(context.expiresAt) <= Date.parse(context.issuedAt)
  ) {
    throw new BuyerRequestLinkError(
      "invalid_expires_at",
      "Capability expiration must be later than its issue time.",
    );
  }

  return {
    licensingCase: Object.freeze({
      caseId: context.caseId,
      workspaceId: asset.workspaceId,
      assetId: asset.assetId,
      caseOutcome: "open",
      createdAt: context.issuedAt,
      updatedAt: context.issuedAt,
      rowVersion: 1,
    }),
    capability: Object.freeze({
      buyerCapabilityId: context.buyerCapabilityId,
      caseId: context.caseId,
      tokenDigestSha256: context.tokenDigestSha256,
      allowedActions: BUYER_CAPABILITY_ACTIONS,
      issuedAt: context.issuedAt,
      expiresAt: context.expiresAt,
      revokedAt: null,
      rotationNumber: 1,
    }),
  };
}

export function createBuyerRequestSubmissionRecord(
  input: BuyerRequestInput,
  context: BuyerRequestSubmissionContext,
): BuyerRequestSubmissionRecord {
  const issues = validateBuyerRequestInput(input);
  if (issues.length > 0) {
    throw new BuyerRequestValidationError(issues);
  }
  if (!UUID_V4_PATTERN.test(context.requestSubmissionId)) {
    throw new Error("Request submission identifier must be a UUID version 4.");
  }
  if (!UUID_V4_PATTERN.test(context.caseId)) {
    throw new Error("Licensing case identifier must be a UUID version 4.");
  }
  if (!isIsoUtcInstant(context.submittedAt)) {
    throw new Error("Submission time must be an ISO 8601 UTC instant.");
  }

  return Object.freeze({
    requestSubmissionId: context.requestSubmissionId,
    caseId: context.caseId,
    buyerName: input.buyerName.trim(),
    buyerOrganization: input.buyerOrganization.trim(),
    buyerEmail: input.buyerEmail.trim().toLowerCase(),
    intendedUseText: input.intendedUseText,
    normalizedText: normalizeIntendedUseText(input.intendedUseText),
    consentCopyVersion: BUYER_REQUEST_CONSENT_COPY_VERSION,
    consentAcknowledged: true,
    submittedAt: context.submittedAt,
  });
}
