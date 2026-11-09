import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  SEED_POLICY_VERSION,
  PRICING_RULE_CODES,
  PricingValidationError,
  calculateQuote,
  formatUsdCents,
  parseAndValidatePricingPolicy,
} from "../packages/pricing/src/index.ts";

const baseline = Object.freeze({
  termsVersionId: "20000000-0000-4000-8000-000000000002",
  caseId: "10000000-0000-4000-8000-000000000001",
  versionNumber: 1,
  resolutionStatus: "complete",
  usePurpose: "commercial",
  channels: ["instagram_paid", "facebook_paid"],
  paidAdvertising: true,
  territories: ["US", "CA"],
  startDate: "2026-11-01",
  durationDays: 90,
  maxImpressions: 500_000,
  exclusivity: "non_exclusive",
  modificationScope: "crop_only",
  attribution: "not_required",
  sublicensing: "prohibited",
  aiUse: "prohibited",
  sourceKind: "human_corrected",
  termsHash: "b".repeat(64),
  createdByActor: "creator",
  createdAt: "2026-10-26T12:00:00.000Z",
});

function assertBlocked(terms, expectedCode) {
  assert.throws(() => calculateQuote(terms, SEED_POLICY_VERSION), (error) => {
    assert.ok(error instanceof PricingValidationError);
    if (expectedCode) assert.equal(error.code, expectedCode);
    return true;
  });
}

test("seed policy matches immutable SQL seed hash and defines eleven distinct rules", () => {
  assert.equal(createHash("sha256").update(SEED_POLICY_VERSION.rulesJson).digest("hex"), SEED_POLICY_VERSION.policyHash);
  const rules = parseAndValidatePricingPolicy(SEED_POLICY_VERSION);
  assert.deepEqual(Object.keys(rules).sort(), [...PRICING_RULE_CODES].sort());
  assert.equal(rules.none, 0);
});

test("Harbor After Rain produces exactly five lines and $425.00", () => {
  const quote = calculateQuote(baseline, SEED_POLICY_VERSION);
  assert.equal(quote.totalCents, 42_500);
  assert.deepEqual(quote.lineItems.map((line) => [line.code, line.amountCents]), [
    ["base_commercial_digital", 20_000],
    ["paid_social", 10_000],
    ["territory_us_ca", 5_000],
    ["duration_31_90", 5_000],
    ["crop_only", 2_500],
  ]);
  assert.equal(quote.lineItems.reduce((sum, line) => sum + line.amountCents, 0), quote.totalCents);
  assert.equal(quote.licenseStartDate, "2026-11-01");
  assert.equal(quote.licenseEndDateExclusive, "2027-01-30");
  assert.equal(quote.lastPermittedDate, "2027-01-29");
  assert.equal(formatUsdCents(quote.totalCents), "$425.00");
});

test("identical rights and policy yield byte-identical quote calculations", () => {
  const first = calculateQuote(baseline, SEED_POLICY_VERSION);
  const second = calculateQuote({ ...baseline }, { ...SEED_POLICY_VERSION });
  assert.equal(first.calculationCanonicalJson, second.calculationCanonicalJson);
});

test("channel and territory ordering does not change price or calculation hash", () => {
  const canonical = calculateQuote(baseline, SEED_POLICY_VERSION);
  const shuffled = calculateQuote({
    ...baseline,
    channels: [...baseline.channels].reverse(),
    territories: [...baseline.territories].reverse(),
  }, SEED_POLICY_VERSION);
  assert.equal(shuffled.totalCents, canonical.totalCents);
  assert.equal(shuffled.calculationCanonicalJson, canonical.calculationCanonicalJson);
});

test("every non-resolved terms status fails closed", () => {
  for (const resolutionStatus of ["incomplete", "contradictory", "unsupported"]) {
    assertBlocked({ ...baseline, resolutionStatus }, `terms_${resolutionStatus}`);
  }
});

test("every one of twelve material rights fields rejects invalid or absent values", () => {
  const overrides = {
    usePurpose: [null, "editorial"],
    channels: [[], ["instagram_paid", "instagram_paid"], ["print"], null],
    paidAdvertising: [false, null],
    territories: [[], ["US", "US"], ["worldwide"], null],
    startDate: [null, "2026-02-30", "tomorrow"],
    durationDays: [0, 366, 2.5, null],
    maxImpressions: [0, 500_001, 7.2, null],
    exclusivity: ["exclusive", null],
    modificationScope: ["unrestricted", null],
    attribution: ["unknown", null],
    sublicensing: ["allowed", null],
    aiUse: ["allowed", null],
  };
  let count = 0;
  for (const [field, invalidValues] of Object.entries(overrides)) {
    for (const value of invalidValues) {
      const candidate = { ...baseline, [field]: value };
      assertBlocked(candidate, "unsupported_terms");
      count += 1;
    }
  }
  assert.ok(count >= 30);
});

test("single-territory and duration tiers are selected exactly", () => {
  const tiers = [
    [1, "duration_1_30", 2_500], [30, "duration_1_30", 2_500],
    [31, "duration_31_90", 5_000], [90, "duration_31_90", 5_000],
    [91, "duration_91_180", 10_000], [180, "duration_91_180", 10_000],
    [181, "duration_181_365", 17_500], [365, "duration_181_365", 17_500],
  ];
  for (const [days, expectedCode, amount] of tiers) {
    const q = calculateQuote({ ...baseline, durationDays: days, territories: ["US"], modificationScope: "none" }, SEED_POLICY_VERSION);
    assert.equal(q.lineItems.find((line) => line.code === expectedCode)?.amountCents, amount);
    assert.equal(q.lineItems.find((line) => line.code === "territory_us")?.amountCents, 2_500);
    assert.equal(q.lineItems.some((line) => line.code === "crop_only"), false);
    assert.equal(q.totalCents, 30_000 + 2_500 + amount);
  }
  const canada = calculateQuote({ ...baseline, territories: ["CA"], channels: ["facebook_paid"] }, SEED_POLICY_VERSION);
  assert.equal(canada.lineItems.find((line) => line.code === "territory_ca")?.amountCents, 2_500);
  assert.equal(canada.totalCents, 40_000);
});

test("all valid impression bounds stay the same creator policy amount", () => {
  for (const maxImpressions of [1, 250_000, 500_000]) {
    const q = calculateQuote({ ...baseline, maxImpressions }, SEED_POLICY_VERSION);
    assert.equal(q.totalCents, 42_500);
  }
});

test("policy tampering, incomplete and extra rules fail closed", () => {
  const original = JSON.parse(SEED_POLICY_VERSION.rulesJson);
  const variants = [
    { ...SEED_POLICY_VERSION, currency: "EUR" },
    { ...SEED_POLICY_VERSION, status: "superseded" },
    { ...SEED_POLICY_VERSION, rulesJson: "not json" },
    { ...SEED_POLICY_VERSION, rulesJson: JSON.stringify({ ...original, rules: original.rules.slice(1) }) },
    { ...SEED_POLICY_VERSION, rulesJson: JSON.stringify({ ...original, rules: [...original.rules, original.rules[0]] }) },
    { ...SEED_POLICY_VERSION, rulesJson: JSON.stringify({ ...original, rules: [...original.rules, { code: "forged", amount_cents: 1 }] }) },
    { ...SEED_POLICY_VERSION, rulesJson: JSON.stringify({ ...original, rules: original.rules.map((rule) => rule.code === "paid_social" ? { ...rule, amount_cents: 3.5 } : rule) }) },
    { ...SEED_POLICY_VERSION, rulesJson: JSON.stringify({ ...original, rules: original.rules.map((rule) => rule.code === "paid_social" ? { ...rule, amount_cents: -1 } : rule) }) },
    { ...SEED_POLICY_VERSION, rulesJson: JSON.stringify({ ...original, rules: original.rules.map((rule) => rule.code === "none" ? { ...rule, amount_cents: 2 } : rule) }) },
    { ...SEED_POLICY_VERSION, rulesJson: JSON.stringify({ ...original, version: 2 }) },
  ];
  for (const policy of variants) {
    assert.throws(() => calculateQuote(baseline, policy), PricingValidationError);
  }
});

test("changed immutable policy version changes the calculation content, not prior results", () => {
  const earlier = calculateQuote(baseline, SEED_POLICY_VERSION);
  const revised = JSON.parse(SEED_POLICY_VERSION.rulesJson);
  revised.version = 2;
  revised.rules.find((rule) => rule.code === "paid_social").amount_cents += 1_000;
  const rulesJson = JSON.stringify(revised);
  const newPolicy = {
    ...SEED_POLICY_VERSION,
    versionNumber: 2,
    rulesJson,
    policyHash: createHash("sha256").update(rulesJson).digest("hex"),
  };
  const latest = calculateQuote(baseline, newPolicy);
  assert.equal(latest.totalCents, 43_500);
  assert.notEqual(latest.calculationCanonicalJson, earlier.calculationCanonicalJson);
  assert.equal(earlier.totalCents, 42_500);
});

test("money formatter rejects unsafe, fractional, and negative cents", () => {
  for (const value of [-1, 1.1, NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatUsdCents(value), PricingValidationError);
  }
});

test("date intervals use exact UTC calendar days even across daylight saving changes", () => {
  const q = calculateQuote({ ...baseline, startDate: "2026-03-07", durationDays: 3 }, SEED_POLICY_VERSION);
  assert.equal(q.licenseEndDateExclusive, "2026-03-10");
  assert.equal(q.lastPermittedDate, "2026-03-09");
});
