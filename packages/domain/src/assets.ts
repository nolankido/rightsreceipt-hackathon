export type AssetType = "photograph" | "illustration";
export type AssetAvailability = "active" | "archived";
export type FingerprintAlgorithm = "sha256";

export interface WorkspaceRecord {
  readonly workspaceId: string;
  readonly displayName: string;
  readonly mode: "demo";
  readonly defaultPricingPolicyId: string | null;
  readonly defaultPricingPolicyVersion: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface AssetRecord {
  readonly assetId: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly assetType: AssetType;
  readonly creatorDisplayName: string;
  readonly provenanceNote: string;
  readonly fingerprintAlgorithm: FingerprintAlgorithm;
  readonly fingerprintValue: string;
  readonly previewReference: string;
  readonly availability: AssetAvailability;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface AssetPreviewOption {
  readonly key: string;
  readonly label: string;
  readonly previewReference: string;
  readonly altText: string;
  readonly compatibleAssetType: AssetType;
  readonly fingerprintAlgorithm: FingerprintAlgorithm;
  readonly fingerprintValue: string;
}

export const SAFE_ASSET_PREVIEWS = Object.freeze({
  "harbor-after-rain": Object.freeze({
    key: "harbor-after-rain",
    label: "Harbor After Rain demo preview",
    previewReference: "/demo/harbor-after-rain.svg",
    altText: "Stylized harbor after rainfall with water, hills, and distant lights.",
    compatibleAssetType: "photograph",
    fingerprintAlgorithm: "sha256",
    fingerprintValue: "aeae6d66d7b96a628239e1802ee5e0cd180ddccc6cc924f8fb125f9da5db0345",
  }),
  "studio-lines": Object.freeze({
    key: "studio-lines",
    label: "Studio Lines demo preview",
    previewReference: "/demo/studio-lines.svg",
    altText: "Abstract project-owned illustration with layered curved lines.",
    compatibleAssetType: "illustration",
    fingerprintAlgorithm: "sha256",
    fingerprintValue: "6e60fa6b9c5bf5ab98dec4ddd39cd8eb80c4a90d82865a26e94825c2bbce5d52",
  }),
} satisfies Readonly<Record<string, AssetPreviewOption>>);

export type AssetPreviewKey = keyof typeof SAFE_ASSET_PREVIEWS;

export interface AssetRegistrationInput {
  readonly title: string;
  readonly assetType: string;
  readonly creatorDisplayName: string;
  readonly provenanceNote: string;
  readonly previewKey: string;
}

export interface AssetRegistrationContext {
  readonly assetId: string;
  readonly workspaceId: string;
  readonly now: string;
}

export interface AssetRegistrationIssue {
  readonly field:
    | "assetId"
    | "workspaceId"
    | "title"
    | "assetType"
    | "creatorDisplayName"
    | "provenanceNote"
    | "previewKey"
    | "now";
  readonly code: string;
  readonly message: string;
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export class AssetRegistrationError extends Error {
  readonly issues: readonly AssetRegistrationIssue[];

  constructor(issues: readonly AssetRegistrationIssue[]) {
    super("Asset metadata did not pass validation.");
    this.name = "AssetRegistrationError";
    this.issues = issues;
  }
}

function trimmed(value: string) {
  return value.trim();
}

function validateLength(
  issues: AssetRegistrationIssue[],
  field: "title" | "creatorDisplayName" | "provenanceNote",
  value: string,
  minimum: number,
  maximum: number,
  label: string,
) {
  const length = trimmed(value).length;
  if (length < minimum || length > maximum) {
    issues.push({
      field,
      code: "invalid_length",
      message: `${label} must contain ${minimum} through ${maximum} characters.`,
    });
  }
}

export function previewOptionFor(key: string): AssetPreviewOption | null {
  return Object.prototype.hasOwnProperty.call(SAFE_ASSET_PREVIEWS, key)
    ? SAFE_ASSET_PREVIEWS[key as AssetPreviewKey]
    : null;
}

export function validateAssetRegistration(
  input: AssetRegistrationInput,
  context: AssetRegistrationContext,
): readonly AssetRegistrationIssue[] {
  const issues: AssetRegistrationIssue[] = [];

  if (!UUID_V4_PATTERN.test(context.assetId)) {
    issues.push({
      field: "assetId",
      code: "invalid_uuid_v4",
      message: "Asset identifier must be a canonical lowercase UUID version 4.",
    });
  }

  if (!UUID_PATTERN.test(context.workspaceId)) {
    issues.push({
      field: "workspaceId",
      code: "invalid_uuid",
      message: "Workspace identifier must be a canonical lowercase UUID.",
    });
  }

  validateLength(issues, "title", input.title, 1, 200, "Title");
  validateLength(
    issues,
    "creatorDisplayName",
    input.creatorDisplayName,
    1,
    120,
    "Creator display name",
  );
  validateLength(
    issues,
    "provenanceNote",
    input.provenanceNote,
    1,
    2000,
    "Provenance note",
  );

  if (input.assetType !== "photograph" && input.assetType !== "illustration") {
    issues.push({
      field: "assetType",
      code: "unsupported_asset_type",
      message: "Asset type must be photograph or illustration.",
    });
  }

  const preview = previewOptionFor(input.previewKey);
  if (!preview) {
    issues.push({
      field: "previewKey",
      code: "unsupported_preview",
      message: "Choose one of the controlled project preview options.",
    });
  } else if (preview.compatibleAssetType !== input.assetType) {
    issues.push({
      field: "previewKey",
      code: "preview_type_mismatch",
      message: `The selected preview is reserved for ${preview.compatibleAssetType} metadata.`,
    });
  }

  const parsedNow = Date.parse(context.now);
  if (!Number.isFinite(parsedNow) || !context.now.endsWith("Z")) {
    issues.push({
      field: "now",
      code: "invalid_timestamp",
      message: "Creation time must be an ISO 8601 UTC instant.",
    });
  }

  return issues;
}

export function createAssetRecord(
  input: AssetRegistrationInput,
  context: AssetRegistrationContext,
): AssetRecord {
  const issues = validateAssetRegistration(input, context);
  if (issues.length > 0) {
    throw new AssetRegistrationError(issues);
  }

  const preview = previewOptionFor(input.previewKey);
  if (!preview) {
    throw new AssetRegistrationError([
      {
        field: "previewKey",
        code: "unsupported_preview",
        message: "Choose one of the controlled project preview options.",
      },
    ]);
  }

  return Object.freeze({
    assetId: context.assetId,
    workspaceId: context.workspaceId,
    title: trimmed(input.title),
    assetType: input.assetType as AssetType,
    creatorDisplayName: trimmed(input.creatorDisplayName),
    provenanceNote: trimmed(input.provenanceNote),
    fingerprintAlgorithm: preview.fingerprintAlgorithm,
    fingerprintValue: preview.fingerprintValue,
    previewReference: preview.previewReference,
    availability: "active",
    createdAt: context.now,
    updatedAt: context.now,
    rowVersion: 1,
  });
}

export function shortenedFingerprint(value: string) {
  return value.length <= 20 ? value : `${value.slice(0, 12)}...${value.slice(-8)}`;
}
