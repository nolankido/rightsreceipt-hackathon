import type { SupportedRightsValues, TermsVersionRecord } from "@rightsreceipt/domain";

const CHANNEL_VALUES = ["instagram_paid", "facebook_paid"] as const;
const TERRITORY_VALUES = ["US", "CA"] as const;

export const PRICING_RULE_CODES = [
  "base_commercial_digital",
  "paid_social",
  "territory_us",
  "territory_ca",
  "territory_us_ca",
  "duration_1_30",
  "duration_31_90",
  "duration_91_180",
  "duration_181_365",
  "crop_only",
  "none",
] as const;

export type PricingRuleCode = (typeof PRICING_RULE_CODES)[number];

export interface PricingRule {
  readonly code: PricingRuleCode;
  readonly amount_cents: number;
}

export interface PolicyRulesDocument {
  readonly currency: "USD";
  readonly version: number;
  readonly rules: readonly PricingRule[];
}

export interface PricingPolicyVersion {
  readonly pricingPolicyId: string;
  readonly workspaceId: string;
  readonly versionNumber: number;
  readonly policyName: string;
  readonly currency: "USD";
  readonly rulesJson: string;
  readonly policyHash: string;
  readonly status: "active" | "superseded";
}

export interface QuoteLine {
  readonly code: PricingRuleCode;
  readonly description: string;
  readonly amountCents: number;
}

export interface QuoteCalculation {
  readonly termsVersionId: string;
  readonly termsHash: string;
  readonly pricingPolicyId: string;
  readonly pricingPolicyVersion: number;
  readonly policyHash: string;
  readonly currency: "USD";
  readonly licenseStartDate: string;
  readonly licenseEndDateExclusive: string;
  readonly lastPermittedDate: string;
  readonly lineItems: readonly QuoteLine[];
  readonly totalCents: number;
  readonly calculationCanonicalJson: string;
}

export class PricingValidationError extends Error {
  readonly code: string;
  readonly fields: readonly string[];
  constructor(code: string, message: string, fields: readonly string[] = []) {
    super(message);
    this.name = "PricingValidationError";
    this.code = code;
    this.fields = fields;
  }
}

const RULE_DESCRIPTIONS: Readonly<Record<PricingRuleCode, string>> = {
  base_commercial_digital: "Base commercial digital license",
  paid_social: "Paid social advertising",
  territory_us: "United States territory",
  territory_ca: "Canada territory",
  territory_us_ca: "United States and Canada territory",
  duration_1_30: "License duration: 1 to 30 days",
  duration_31_90: "License duration: 31 to 90 days",
  duration_91_180: "License duration: 91 to 180 days",
  duration_181_365: "License duration: 181 to 365 days",
  crop_only: "Crop permission",
  none: "No modification surcharge",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SHA_PATTERN = /^[0-9a-f]{64}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: string, message: string, fields: readonly string[] = []): never {
  throw new PricingValidationError(code, message, fields);
}

function canonicalArray<const T extends string>(value: unknown, allowed: readonly T[]): readonly T[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > allowed.length) return null;
  if (!value.every((entry) => typeof entry === "string" && allowed.includes(entry as T))) return null;
  if (new Set(value).size !== value.length) return null;
  return allowed.filter((entry) => value.includes(entry));
}

function dateToUtc(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? parsed
    : null;
}

export function validateQuoteableTerms(
  terms: TermsVersionRecord,
): SupportedRightsValues {
  if (terms.resolutionStatus !== "complete") {
    fail(
      `terms_${terms.resolutionStatus}`,
      "Quoting requires complete, supported terms. Unresolved, contradictory, and unsupported terms cannot be priced.",
    );
  }
  const issues: string[] = [];
  if (!UUID_PATTERN.test(terms.termsVersionId) || !SHA_PATTERN.test(terms.termsHash)) {
    issues.push("terms_version");
  }
  if (terms.usePurpose !== "commercial") issues.push("use_purpose");
  const channels = canonicalArray(terms.channels, CHANNEL_VALUES);
  if (!channels) issues.push("channels");
  if (terms.paidAdvertising !== true) issues.push("paid_advertising");
  const territories = canonicalArray(terms.territories, TERRITORY_VALUES);
  if (!territories) issues.push("territories");
  const date = dateToUtc(terms.startDate);
  if (!date) issues.push("start_date");
  if (!Number.isInteger(terms.durationDays) || terms.durationDays! < 1 || terms.durationDays! > 365) {
    issues.push("duration_days");
  }
  if (!Number.isInteger(terms.maxImpressions) || terms.maxImpressions! < 1 || terms.maxImpressions! > 500_000) {
    issues.push("max_impressions");
  }
  if (terms.exclusivity !== "non_exclusive") issues.push("exclusivity");
  if (terms.modificationScope !== "none" && terms.modificationScope !== "crop_only") {
    issues.push("modification_scope");
  }
  if (terms.attribution !== "required" && terms.attribution !== "not_required") issues.push("attribution");
  if (terms.sublicensing !== "prohibited") issues.push("sublicensing");
  if (terms.aiUse !== "prohibited") issues.push("ai_use");
  if (issues.length > 0) {
    fail("unsupported_terms", `These fields cannot be priced: ${issues.join(", ")}.`, issues);
  }
  return {
    use_purpose: "commercial",
    channels: channels!,
    paid_advertising: true,
    territories: territories! as readonly ("US" | "CA")[],
    start_date: terms.startDate!,
    duration_days: terms.durationDays!,
    max_impressions: terms.maxImpressions!,
    exclusivity: "non_exclusive",
    modification_scope: terms.modificationScope!,
    attribution: terms.attribution!,
    sublicensing: "prohibited",
    ai_use: "prohibited",
  };
}

export function parseAndValidatePricingPolicy(
  policy: PricingPolicyVersion,
): Readonly<Record<PricingRuleCode, number>> {
  if (!UUID_PATTERN.test(policy.pricingPolicyId) || !UUID_PATTERN.test(policy.workspaceId)) {
    fail("invalid_policy_identity", "The pricing policy identifier is invalid.");
  }
  if (!Number.isInteger(policy.versionNumber) || policy.versionNumber < 1) {
    fail("invalid_policy_version", "The pricing policy version must be a positive integer.");
  }
  if (!SHA_PATTERN.test(policy.policyHash) || policy.currency !== "USD") {
    fail("invalid_policy_header", "The pricing policy hash or currency is invalid.");
  }
  if (policy.status !== "active") {
    fail("inactive_policy", "The selected pricing policy is not active.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(policy.rulesJson);
  } catch {
    fail("invalid_policy_json", "The pricing policy rules are not valid JSON.");
  }
  if (!record(parsed) || parsed.currency !== "USD" || parsed.version !== policy.versionNumber || !Array.isArray(parsed.rules)) {
    fail("invalid_policy_schema", "The pricing policy rules do not match the assigned USD policy version.");
  }
  if (Object.keys(parsed).sort().join(",") !== "currency,rules,version") {
    fail("invalid_policy_schema", "Unexpected pricing policy fields were found.");
  }
  const amounts: Record<string, number> = {};
  for (const rule of parsed.rules) {
    if (!record(rule) || Object.keys(rule).sort().join(",") !== "amount_cents,code") {
      fail("invalid_policy_rule", "Each pricing rule must have exactly a code and amount_cents.");
    }
    if (typeof rule.code !== "string" || !PRICING_RULE_CODES.includes(rule.code as PricingRuleCode)) {
      fail("unknown_policy_rule", "The policy contains an unknown pricing rule.");
    }
    if (Object.prototype.hasOwnProperty.call(amounts, rule.code)) {
      fail("duplicate_policy_rule", "The policy contains a duplicate pricing rule.");
    }
    if (typeof rule.amount_cents !== "number" || !Number.isSafeInteger(rule.amount_cents)
      || rule.amount_cents < 0 || rule.amount_cents > 1_000_000_000) {
      fail("invalid_policy_amount", "Pricing rule amounts must be safe nonnegative integer cents.");
    }
    amounts[rule.code] = rule.amount_cents;
  }
  if (Object.keys(amounts).length !== PRICING_RULE_CODES.length
    || PRICING_RULE_CODES.some((code) => !(code in amounts))) {
    fail("incomplete_policy", "A pricing policy must define every named P0 rule exactly once.");
  }
  if (amounts.none !== 0) fail("invalid_zero_rule", "The no-modification rule must be zero cents.");
  return Object.freeze(amounts) as Readonly<Record<PricingRuleCode, number>>;
}

export function calculateQuote(
  terms: TermsVersionRecord,
  policy: PricingPolicyVersion,
): QuoteCalculation {
  const rights = validateQuoteableTerms(terms);
  if (policy.workspaceId.length === 0 || policy.pricingPolicyId.length === 0) {
    fail("invalid_policy", "The assigned policy is incomplete.");
  }
  const amounts = parseAndValidatePricingPolicy(policy);
  const territoryCode: PricingRuleCode = rights.territories.length === 2
    ? "territory_us_ca"
    : rights.territories[0] === "US" ? "territory_us" : "territory_ca";
  const durationCode: PricingRuleCode = rights.duration_days <= 30
    ? "duration_1_30"
    : rights.duration_days <= 90 ? "duration_31_90"
      : rights.duration_days <= 180 ? "duration_91_180" : "duration_181_365";
  const ruleCodes: PricingRuleCode[] = [
    "base_commercial_digital",
    "paid_social",
    territoryCode,
    durationCode,
  ];
  if (rights.modification_scope === "crop_only") ruleCodes.push("crop_only");
  const lineItems = ruleCodes.map((code) => Object.freeze({
    code,
    description: RULE_DESCRIPTIONS[code],
    amountCents: amounts[code],
  }));
  let totalCents = 0;
  for (const line of lineItems) {
    totalCents += line.amountCents;
    if (!Number.isSafeInteger(totalCents)) {
      fail("total_overflow", "The total exceeds the safe integer-cent range.");
    }
  }
  const start = dateToUtc(rights.start_date);
  if (!start) fail("invalid_start_date", "The license start date is invalid.");
  const end = new Date(start!.getTime() + rights.duration_days * 86_400_000);
  const last = new Date(end.getTime() - 86_400_000);
  const endExclusive = end.toISOString().slice(0, 10);
  if (endExclusive.length !== 10 || !DATE_PATTERN.test(endExclusive)) {
    fail("unsupported_end_date", "The license end date is outside the supported calendar.");
  }
  const canonical = {
    schema_version: "quote-calculation-v1",
    terms_version_id: terms.termsVersionId,
    terms_hash: terms.termsHash,
    pricing_policy_id: policy.pricingPolicyId,
    pricing_policy_version: policy.versionNumber,
    policy_hash: policy.policyHash,
    currency: "USD" as const,
    license_start_date: rights.start_date,
    license_end_date_exclusive: endExclusive,
    line_items: lineItems.map(({ code, description, amountCents }) => ({
      code, description, amount_cents: amountCents,
    })),
    total_cents: totalCents,
  };
  return Object.freeze({
    termsVersionId: terms.termsVersionId,
    termsHash: terms.termsHash,
    pricingPolicyId: policy.pricingPolicyId,
    pricingPolicyVersion: policy.versionNumber,
    policyHash: policy.policyHash,
    currency: "USD",
    licenseStartDate: rights.start_date,
    licenseEndDateExclusive: endExclusive,
    lastPermittedDate: last.toISOString().slice(0, 10),
    lineItems: Object.freeze(lineItems),
    totalCents,
    calculationCanonicalJson: JSON.stringify(canonical),
  });
}

export function formatUsdCents(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    fail("invalid_money", "Money must be a safe nonnegative integer number of cents.");
  }
  const cents = BigInt(amountCents);
  return `$${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export const SEED_POLICY_RULES_JSON = JSON.stringify({
  currency: "USD",
  rules: [
    { amount_cents: 20000, code: "base_commercial_digital" },
    { amount_cents: 10000, code: "paid_social" },
    { amount_cents: 2500, code: "territory_us" },
    { amount_cents: 2500, code: "territory_ca" },
    { amount_cents: 5000, code: "territory_us_ca" },
    { amount_cents: 2500, code: "duration_1_30" },
    { amount_cents: 5000, code: "duration_31_90" },
    { amount_cents: 10000, code: "duration_91_180" },
    { amount_cents: 17500, code: "duration_181_365" },
    { amount_cents: 2500, code: "crop_only" },
    { amount_cents: 0, code: "none" },
  ],
  version: 1,
});

export const SEED_POLICY_VERSION: PricingPolicyVersion = Object.freeze({
  pricingPolicyId: "00000000-0000-4000-8000-000000000002",
  workspaceId: "00000000-0000-4000-8000-000000000001",
  versionNumber: 1,
  policyName: "Harbor demo policy",
  currency: "USD",
  rulesJson: SEED_POLICY_RULES_JSON,
  policyHash: "33d8c85a963b9b12c1dc61bc5f3d6dd8ae186a8bef47f5ac4a6c1ccc10163916",
  status: "active",
});
