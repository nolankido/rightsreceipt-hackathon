/**
 * Dependency-free read-only inference for the exported lexical classifier.
 * These are uncalibrated ranking scores, NOT an AiExtractionProposal.
 * No pricing, consent, payment, permission, or mutation API is present.
 */
export const PORTABLE_MODEL_SCHEMA = "rightsreceipt-lexical-ovr-v1" as const;

export const PORTABLE_RIGHTS_FIELDS = [
  "use_purpose", "channels", "paid_advertising", "territories", "start_date",
  "duration_days", "max_impressions", "exclusivity", "modification_scope",
  "attribution", "sublicensing", "ai_use",
] as const;
export type PortableRightsField = (typeof PORTABLE_RIGHTS_FIELDS)[number];

export interface LearnedLabel {
  readonly resolutionState: "resolved" | "unresolved" | "contradictory" | "unsupported";
  readonly normalizedValue: unknown | null;
}
export interface UncalibratedFieldRanking {
  readonly fieldName: PortableRightsField;
  readonly label: LearnedLabel;
  /** Independent one-versus-rest decision score; NOT calibrated probability. */
  readonly rawScore: number;
  readonly runnerUpScore: number;
  readonly margin: number;
  readonly confidenceBasisPoints: null;
  readonly evidenceSpans: readonly [];
}
export interface UncalibratedModelRanking {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly artifactSha256: string;
  readonly status: "uncalibrated_review_only";
  readonly reviewRequired: true;
  readonly quoteEligible: false;
  readonly permittedActions: readonly [];
  readonly fields: readonly UncalibratedFieldRanking[];
}

interface Head {
  readonly fieldName: PortableRightsField;
  readonly labels: readonly LearnedLabel[];
  readonly intercepts: readonly number[];
  readonly scales: readonly number[];
  readonly offset: number;
}
interface Artifact {
  readonly schemaVersion: typeof PORTABLE_MODEL_SCHEMA;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly taskContractVersion: "rights-extraction-v1";
  readonly datasetManifestSha256: string;
  readonly trainingFileSha256: string;
  readonly featureSpec: {
    readonly tokenPattern: "[a-z0-9]+";
    readonly binary: true;
    readonly orders: readonly [1, 2];
    readonly maximum: number;
  };
  readonly vocabulary: readonly string[];
  readonly heads: readonly Head[];
  readonly weightsEncoding: "int16-le-row-major-base64";
  readonly weightsBase64: string;
  readonly authority: {
    readonly modelOutputIsProposalOnly: true;
    readonly requiresSourceEvidence: true;
    readonly requiresIndependentCalibration: true;
    readonly permittedActions: readonly [];
  };
}
const VERIFIED_CONSTRUCTION = Symbol("verified-portable-model");
const HASH = /^[0-9a-f]{64}$/u;
const FEATURE = /^(?:u:[a-z0-9]+|b:[a-z0-9]+\/[a-z0-9]+)$/u;

function asRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function invalid(): never { throw new Error("Invalid or untrusted model artifact."); }

function supportedLearnedValue(field: PortableRightsField, value: unknown): boolean {
  const canonicalList = (candidate: unknown, allowed: readonly string[]) =>
    Array.isArray(candidate) && candidate.length > 0 && candidate.length <= allowed.length
    && candidate.every((entry) => typeof entry === "string" && allowed.includes(entry))
    && new Set(candidate).size === candidate.length
    && candidate.every((entry, index) => index === 0 ||
      allowed.indexOf(candidate[index - 1]) < allowed.indexOf(entry));
  switch (field) {
    case "use_purpose": return value === "commercial";
    case "channels": return canonicalList(value, ["instagram_paid", "facebook_paid"]);
    case "paid_advertising": return value === true;
    case "territories": return canonicalList(value, ["US", "CA"]);
    case "start_date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    case "duration_days": return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 365;
    case "max_impressions": return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 500_000;
    case "exclusivity": return value === "non_exclusive";
    case "modification_scope": return value === "none" || value === "crop_only";
    case "attribution": return value === "required" || value === "not_required";
    case "sublicensing": return value === "prohibited";
    case "ai_use": return value === "prohibited";
  }
}

/** Feature set exactly matches the Python binary unigram/bigram implementation. */
export function lexicalFeatures(text: string): ReadonlySet<string> {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/gu) ?? [];
  const result = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    result.add(`u:${tokens[index]}`);
    if (index + 1 < tokens.length) {
      result.add(`b:${tokens[index]}/${tokens[index + 1]}`);
    }
  }
  return result;
}

function parseArtifact(raw: unknown): { artifact: Artifact; weights: Int16Array } {
  if (!asRecord(raw) || !hasKeys(raw, [
    "schemaVersion", "modelId", "modelVersion", "taskContractVersion", "datasetManifestSha256",
    "trainingFileSha256", "featureSpec", "vocabulary", "heads", "weightsEncoding",
    "weightsBase64", "authority",
  ])) invalid();
  if (raw.schemaVersion !== PORTABLE_MODEL_SCHEMA || raw.taskContractVersion !== "rights-extraction-v1"
    || typeof raw.modelId !== "string" || raw.modelId.length < 1 || raw.modelId.length > 120
    || typeof raw.modelVersion !== "string" || raw.modelVersion.length < 1 || raw.modelVersion.length > 120
    || typeof raw.datasetManifestSha256 !== "string" || !HASH.test(raw.datasetManifestSha256)
    || typeof raw.trainingFileSha256 !== "string" || !HASH.test(raw.trainingFileSha256)
    || raw.weightsEncoding !== "int16-le-row-major-base64") invalid();
  const features = raw.featureSpec;
  if (!asRecord(features) || !hasKeys(features, ["tokenPattern", "binary", "orders", "maximum"])
    || features.tokenPattern !== "[a-z0-9]+" || features.binary !== true
    || !Array.isArray(features.orders) || features.orders.length !== 2
    || features.orders[0] !== 1 || features.orders[1] !== 2) invalid();
  const vocab = raw.vocabulary;
  if (!Array.isArray(vocab) || vocab.length < 1 || vocab.length > 2048
    || features.maximum !== vocab.length
    || vocab.some((item) => typeof item !== "string" || !FEATURE.test(item))
    || new Set(vocab).size !== vocab.length) invalid();
  const authority = raw.authority;
  if (!asRecord(authority) || !hasKeys(authority, [
    "modelOutputIsProposalOnly", "requiresSourceEvidence", "requiresIndependentCalibration", "permittedActions",
  ]) || authority.modelOutputIsProposalOnly !== true || authority.requiresSourceEvidence !== true
    || authority.requiresIndependentCalibration !== true || !Array.isArray(authority.permittedActions)
    || authority.permittedActions.length !== 0) invalid();
  const heads = raw.heads;
  if (!Array.isArray(heads) || heads.length !== PORTABLE_RIGHTS_FIELDS.length) invalid();
  let expectedOffset = 0;
  for (let i = 0; i < heads.length; i += 1) {
    const head: unknown = heads[i];
    if (!asRecord(head) || !hasKeys(head, ["fieldName", "labels", "intercepts", "scales", "offset"])
      || head.fieldName !== PORTABLE_RIGHTS_FIELDS[i]
      || !Array.isArray(head.labels) || head.labels.length < 2 || head.labels.length > 20
      || !Array.isArray(head.intercepts) || head.intercepts.length !== head.labels.length
      || !Array.isArray(head.scales) || head.scales.length !== head.labels.length
      || head.offset !== expectedOffset) invalid();
    for (const label of head.labels) {
      if (!asRecord(label) || !hasKeys(label, ["resolutionState", "normalizedValue"])
        || !["resolved", "unresolved", "contradictory", "unsupported"].includes(String(label.resolutionState))
        || (label.resolutionState !== "resolved" && label.normalizedValue !== null)
        || (label.resolutionState === "resolved"
          && !supportedLearnedValue(head.fieldName as PortableRightsField, label.normalizedValue))) invalid();
    }
    if (head.intercepts.some((number) => typeof number !== "number" || !Number.isFinite(number))
      || head.scales.some((number) => typeof number !== "number" || !Number.isFinite(number)
        || number <= 0 || number > 1)) invalid();
    expectedOffset += head.labels.length * vocab.length;
  }
  if (expectedOffset > 2048 * 250 || typeof raw.weightsBase64 !== "string"
    || !/^[A-Za-z0-9+/]*={0,2}$/u.test(raw.weightsBase64)) invalid();
  let binary: string;
  try { binary = atob(raw.weightsBase64); } catch { invalid(); }
  if (binary.length !== expectedOffset * 2) invalid();
  const weights = new Int16Array(expectedOffset);
  for (let index = 0; index < weights.length; index += 1) {
    const low = binary.charCodeAt(index * 2);
    const high = binary.charCodeAt(index * 2 + 1);
    const integer = low | (high << 8);
    weights[index] = integer < 32768 ? integer : integer - 65536;
  }
  return { artifact: raw as unknown as Artifact, weights };
}

/** Hash verification uses a trusted digest separate from the untrusted artifact. */
export async function loadVerifiedPortableModel(
  originalArtifactJson: string,
  expectedSha256: string,
): Promise<PortableRightsModel> {
  if (typeof expectedSha256 !== "string" || !HASH.test(expectedSha256)
    || typeof originalArtifactJson !== "string" || originalArtifactJson.length > 1_000_000) invalid();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(originalArtifactJson));
  const actual = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
  if (actual !== expectedSha256) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(originalArtifactJson); } catch { invalid(); }
  const { artifact, weights } = parseArtifact(parsed);
  return new PortableRightsModel(artifact, weights, expectedSha256, VERIFIED_CONSTRUCTION);
}

export class PortableRightsModel {
  readonly #artifact: Artifact;
  readonly #weights: Int16Array;
  readonly #vocabularyIndex: ReadonlyMap<string, number>;
  readonly #digest: string;

  constructor(artifact: Artifact, weights: Int16Array, digest: string, token: symbol) {
    // Construction outside the verified loader is forbidden at runtime.
    if (token !== VERIFIED_CONSTRUCTION || !HASH.test(digest)) invalid();
    this.#artifact = artifact;
    this.#weights = weights;
    this.#digest = digest;
    this.#vocabularyIndex = new Map(artifact.vocabulary.map((item, i) => [item, i]));
  }

  predict(text: string): UncalibratedModelRanking {
    if (typeof text !== "string" || [...text].length < 40 || [...text].length > 4000) {
      throw new Error("Model inference requires an eligible, length-checked buyer request.");
    }
    const indices = [...lexicalFeatures(text)]
      .map((feature) => this.#vocabularyIndex.get(feature))
      .filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b);
    const width = this.#artifact.vocabulary.length;
    const fields: UncalibratedFieldRanking[] = this.#artifact.heads.map((head) => {
      const scores: number[] = [];
      for (let classIndex = 0; classIndex < head.labels.length; classIndex += 1) {
        let score = head.intercepts[classIndex]!;
        const rowStart = head.offset + classIndex * width;
        const scale = head.scales[classIndex]!;
        for (const index of indices) {
          score += this.#weights[rowStart + index]! * scale;
        }
        scores.push(score);
      }
      // Stable class-order tie break, never use a randomly sorted score list.
      let best = 0;
      let runner = 1;
      if (scores[1]! > scores[0]!) { best = 1; runner = 0; }
      for (let i = 2; i < scores.length; i += 1) {
        if (scores[i]! > scores[best]!) { runner = best; best = i; }
        else if (scores[i]! > scores[runner]!) runner = i;
      }
      return Object.freeze({
        fieldName: head.fieldName,
        label: Object.freeze({ ...head.labels[best]! }),
        rawScore: scores[best]!,
        runnerUpScore: scores[runner]!,
        margin: scores[best]! - scores[runner]!,
        confidenceBasisPoints: null,
        evidenceSpans: Object.freeze([]) as readonly [],
      });
    });
    return Object.freeze({
      modelId: this.#artifact.modelId,
      modelVersion: this.#artifact.modelVersion,
      artifactSha256: this.#digest,
      status: "uncalibrated_review_only" as const,
      reviewRequired: true as const,
      quoteEligible: false as const,
      permittedActions: Object.freeze([]) as readonly [],
      fields: Object.freeze(fields),
    });
  }
}
