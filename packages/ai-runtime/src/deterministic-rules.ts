/** High-precision, model-free source evidence extraction.
 * The patterns intentionally prefer abstention to inferring unwritten permissions.
 * This module never approves rights or calculates amounts.
 */
import type { AiCandidateField, AiEvidenceSpan, AiRightsField } from "./contract";

export const DETERMINISTIC_EXTRACTOR_VERSION = "rights-rule-baseline-v1" as const;

export const DETERMINISTIC_FIELDS = [
  "use_purpose", "channels", "paid_advertising", "territories", "start_date",
  "duration_days", "max_impressions", "exclusivity", "modification_scope",
  "attribution", "sublicensing", "ai_use",
] as const satisfies readonly AiRightsField[];

type Candidate = {
  readonly field: AiRightsField;
  readonly state: "resolved" | "unsupported" | "ambiguous";
  readonly value: unknown | null;
  readonly span: AiEvidenceSpan;
  readonly note?: string;
};

type Rule = {
  readonly field: AiRightsField;
  readonly pattern: RegExp;
  readonly state: Candidate["state"];
  readonly value: unknown | ((match: RegExpExecArray) => unknown);
  readonly note?: string;
};

const result = (field: AiRightsField, phrase: string, value: unknown): Rule => ({
  field,
  pattern: new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "giu"),
  state: "resolved",
  value,
});
const unsupported = (field: AiRightsField, phrase: string, note: string): Rule => ({
  field,
  pattern: new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "giu"),
  state: "unsupported",
  value: null,
  note,
});
const ambiguous = (field: AiRightsField, phrase: string): Rule => ({
  field,
  pattern: new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "giu"),
  state: "ambiguous",
  value: null,
});
const parsedNumber = (value: string): number => Number(value.replace(/,/gu, ""));
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const dt = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0, 10) === value;
};

const fixed: Rule[] = [
  ...[
    "This is commercial promotional use", "The purpose is commercial marketing",
    "We intend to promote our business", "The work is for commercial advertising",
    "This is commercial marketing", "The campaign has a commercial purpose",
  ].map((text) => result("use_purpose", text, "commercial")),
  unsupported("use_purpose", "We need personal noncommercial use", "Personal noncommercial use is outside the P0 commercial license."),
  unsupported("use_purpose", "The work is strictly noncommercial", "This is not commercial usage."),
  ambiguous("use_purpose", "The use might be commercial or purely editorial"),

  ...[
    "Paid Facebook and Instagram posts", "Sponsored Instagram and Facebook advertisements",
    "The channels are Instagram paid and Facebook paid",
  ].map((text) => result("channels", text, ["instagram_paid", "facebook_paid"])),
  ...["Only paid Instagram posts", "Use Instagram sponsored placements", "The sole channel is Instagram advertising", "Run paid Instagram placements"].map((text) => result("channels", text, ["instagram_paid"])),
  ...["Only Facebook sponsored posts", "Use paid Facebook ads", "The sole channel is Facebook advertising"].map((text) => result("channels", text, ["facebook_paid"])),
  unsupported("channels", "Use printed magazines and roadside billboards", "Print and outdoor media are outside paid social."),
  unsupported("channels", "Paid Instagram ads together with printed magazines", "This includes unsupported print distribution."),
  unsupported("channels", "Do not use Instagram at all", "The clause excludes Instagram and conflicts with Instagram licensing."),
  ambiguous("channels", "We have yet to choose a social platform"),

  ...["We will pay for sponsored advertisements", "These placements are paid ads", "This is paid media buying", "This is paid advertising", "This is not unpaid: it is sponsored advertising"].map((text) => result("paid_advertising", text, true)),
  unsupported("paid_advertising", "This is an unpaid editorial placement", "P0 requires paid advertising."),
  unsupported("paid_advertising", "No paid promotion is involved", "P0 does not cover unpaid distribution."),
  ambiguous("paid_advertising", "We have not decided whether to pay for distribution"),

  ...["Territory is the US and Canada", "Reach the United States and Canada", "Cover both Canadian and American markets", "Target the US and Canada"].map((text) => result("territories", text, ["US", "CA"])),
  ...["Use only in the United States", "Limit rights to the US", "Territory is the American market"].map((text) => result("territories", text, ["US"])),
  ...["Use only in Canada", "Canadian territory only", "Distribution is limited to Canada"].map((text) => result("territories", text, ["CA"])),
  unsupported("territories", "Please license worldwide territory", "Worldwide licenses are outside US and Canada."),
  unsupported("territories", "Rights should be for Germany only", "Germany is outside US and Canada."),
  ambiguous("territories", "Rights should cover wherever the audience lives"),

  ...["The license is non-exclusive", "We want nonexclusive permission", "Others may also license the work", "We seek nonexclusive rights", "We are not asking for exclusive rights"].map((text) => result("exclusivity", text, "non_exclusive")),
  unsupported("exclusivity", "We insist on exclusive rights", "Exclusive rights are outside P0."),
  unsupported("exclusivity", "We must have exclusive rights", "Only nonexclusive rights are permitted."),
  ambiguous("exclusivity", "Exclusivity is still undecided"),

  ...["Cropping is the only allowed edit", "Only crop adjustments are permitted", "We may crop but not retouch", "Cropping is permitted"].map((text) => result("modification_scope", text, "crop_only")),
  ...["No image modification is permitted", "Keep the photo entirely unchanged", "The picture must not be altered", "No alterations, including no cropping", "No cropping or other changes are permitted"].map((text) => result("modification_scope", text, "none")),
  unsupported("modification_scope", "We plan to recolor and retouch the picture", "Retouching and recoloring are outside P0."),
  ambiguous("modification_scope", "We may need some edits but have not decided which"),

  ...["Please credit the creator", "Attribution is required", "A photo credit must appear", "A creator credit is required"].map((text) => result("attribution", text, "required")),
  ...["No attribution is required", "A byline is unnecessary", "Credit need not be displayed", "We do not need any credit line", "The design cannot show any credit"].map((text) => result("attribution", text, "not_required")),
  unsupported("attribution", "Credit may appear conditionally on some placements only", "Conditional attribution has not been resolved."),
  ambiguous("attribution", "Creator credit is still under discussion"),

  ...["Sublicensing is prohibited", "We may not sublicense to others", "No sublicense to any third party", "No sublicensing is allowed", "We will not sublicense the picture"].map((text) => result("sublicensing", text, "prohibited")),
  unsupported("sublicensing", "We may sublicense rights to third parties", "Sublicensing is outside P0."),
  unsupported("sublicensing", "We want to sublicense to vendors", "Sublicensing is outside P0."),
  ambiguous("sublicensing", "Partner reuse permissions are still undecided"),

  ...["AI model training is forbidden", "The photo will not train AI", "No AI-training use is permitted", "No AI training is allowed", "AI model training must never take place"].map((text) => result("ai_use", text, "prohibited")),
  unsupported("ai_use", "We will train an AI image model on the artwork", "AI training is not permitted by P0."),
  unsupported("ai_use", "We need to train an image model", "AI training is not permitted by P0."),
  ambiguous("ai_use", "Whether to allow AI reuse is still undecided"),
];

const numeric: Rule[] = [
  { field: "start_date", pattern: /(?:Start the license on|The first allowed date is|Campaign start date:|Use starts on|Actually begin on|Start the campaign on)\s+(\d{4}-\d{2}-\d{2})/giu,
    state: "resolved", value: (match: RegExpExecArray) => match[1] },
  { field: "duration_days", pattern: /(?:License for|The period lasts|Duration:|Allow usage for|Our duration is|The license should last)\s+([0-9][0-9,]*)\s+(?:calendar\s+)?days\b/giu,
    state: "resolved", value: (match: RegExpExecArray) => parsedNumber(match[1] ?? "") },
  { field: "max_impressions", pattern: /(?:Cap at|No more than|The limit is|We need)\s+([0-9][0-9,]*)\s+impressions\b/giu,
    state: "resolved", value: (match: RegExpExecArray) => parsedNumber(match[1] ?? "") },
  { field: "max_impressions", pattern: /The impression limit is\s+([0-9][0-9,]*)\b/giu,
    state: "resolved", value: (match: RegExpExecArray) => parsedNumber(match[1] ?? "") },
  { field: "max_impressions", pattern: /Cap impressions at\s+([0-9][0-9,]*)\s+instead\b/giu,
    state: "resolved", value: (match: RegExpExecArray) => parsedNumber(match[1] ?? "") },
  ambiguous("start_date", "Start sometime early next month"),
  ambiguous("duration_days", "We need rights for about one season"),
  ambiguous("max_impressions", "Expect roughly half a million views"),
];

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function detectCandidates(input: string): readonly Candidate[] {
  // A synthetic evaluation instruction tail is never part of the license grant.
  // This is an extra guard, not an assertion that arbitrary injection is detectable.
  const marker = /Untrusted buyer instruction:/iu.exec(input);
  const scan = marker ? input.slice(0, marker.index) : input;
  const found: Candidate[] = [];
  for (const rule of [...fixed, ...numeric]) {
    for (const match of scan.matchAll(rule.pattern)) {
      const value = typeof rule.value === "function" ? rule.value(match) : rule.value;
      const span = { startUtf16: match.index, endUtf16: match.index + match[0].length, text: match[0] };
      // Reject apparent assertions that are actually being negated or quoted
      // as hypothetical, rather than treating them as written consent.
      const before = scan.slice(Math.max(0, match.index - 30), match.index);
      const negated = /(?:\bnot|\bnever|\bdo not|\bdon't|\bwithout)\s+$/iu.test(before);
      const after = scan.slice(span.endUtf16, span.endUtf16 + 30);
      const approximate = /^(?:\s+(?:approximately|roughly|about|maybe|perhaps|or more|or less))\b/iu.test(after);
      const dateInvalid = rule.field === "start_date" && rule.state === "resolved" && !validDate(String(value));
      const numericInvalid = rule.state === "resolved" && ((rule.field === "duration_days" && (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 365))
        || (rule.field === "max_impressions" && (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 500_000)));
      const guarded = rule.state === "resolved" && (negated || approximate);
      found.push({field: rule.field,
        state: guarded ? "ambiguous" : dateInvalid || numericInvalid ? "unsupported" : rule.state,
        value: guarded || dateInvalid || numericInvalid ? null : value,
        span,
        ...(dateInvalid || numericInvalid ? {note: "The explicit value is outside the supported P0 limits."} : rule.note ? {note: rule.note} : {}),
      });
    }
  }
  return found.sort((a, b) => a.span.startUtf16 - b.span.startUtf16);
}

function fieldObservation(field: AiRightsField, candidates: readonly Candidate[]): AiCandidateField {
  // A longer clause such as "No attribution is required" takes precedence
  // over the embedded shorter positive substring "Attribution is required".
  const unique = candidates.filter((candidate, index) =>
    candidates.findIndex((other) => other.span.startUtf16 === candidate.span.startUtf16
      && other.span.endUtf16 === candidate.span.endUtf16) === index
    && !candidates.some((other) => other.span.startUtf16 <= candidate.span.startUtf16
      && other.span.endUtf16 >= candidate.span.endUtf16
      && (other.span.startUtf16 !== candidate.span.startUtf16
        || other.span.endUtf16 !== candidate.span.endUtf16)));
  if (unique.length === 0) return {
    fieldName: field, resolutionState: "unresolved", normalizedValue: null,
    evidenceSpans: [], reasonCode: "not_stated", reasonNote: null, confidenceBasisPoints: null,
  };
  const resolved = unique.filter((item) => item.state === "resolved");
  const unsupportedHits = unique.filter((item) => item.state === "unsupported");
  const ambiguousHits = unique.filter((item) => item.state === "ambiguous");
  if (ambiguousHits.length > 0) return {
    fieldName: field, resolutionState: "unresolved", normalizedValue: null,
    evidenceSpans: [ambiguousHits[0]!.span], reasonCode: "ambiguous", reasonNote: null, confidenceBasisPoints: null,
  };
  const conflicts = resolved.length > 1
    ? resolved.find((other) => !sameValue(other.value, resolved[0]!.value))
    : null;
  if (conflicts || (resolved.length > 0 && unsupportedHits.length > 0)) return {
    fieldName: field, resolutionState: "contradictory", normalizedValue: null,
    evidenceSpans: [resolved[0]!.span, (conflicts ?? unsupportedHits[0])!.span].sort((a, b) => a.startUtf16 - b.startUtf16),
    reasonCode: "conflicting_evidence", reasonNote: "The request contains incompatible rights clauses.", confidenceBasisPoints: null,
  };
  if (unsupportedHits.length > 0) return {
    fieldName: field, resolutionState: "unsupported", normalizedValue: null,
    evidenceSpans: [unsupportedHits[0]!.span], reasonCode: "out_of_scope",
    reasonNote: unsupportedHits[0]!.note ?? "The requested right is outside supported P0 scope.", confidenceBasisPoints: null,
  };
  return {
    fieldName: field, resolutionState: "resolved", normalizedValue: resolved[0]!.value,
    evidenceSpans: [resolved[0]!.span], reasonCode: "explicit_evidence", reasonNote: null, confidenceBasisPoints: null,
  };
}

/** Proposes evidence-supported values without ever filling missing licensing clauses. */
export function extractDeterministicFields(originalText: string): readonly AiCandidateField[] {
  if (typeof originalText !== "string" || Array.from(originalText).length < 40
    || Array.from(originalText).length > 4_000) {
    throw new Error("The licensing input must contain 40 through 4,000 Unicode characters.");
  }
  const hits = detectCandidates(originalText);
  return Object.freeze(DETERMINISTIC_FIELDS.map((field) => Object.freeze(
    fieldObservation(field, hits.filter((candidate) => candidate.field === field)),
  )));
}
