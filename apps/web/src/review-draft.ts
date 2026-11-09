/** Creator decisions must be explicit, never seeded from example licensing terms. */
export const REVIEW_FIELD_ORDER = [
  "use_purpose", "channels", "paid_advertising", "territories", "start_date",
  "duration_days", "max_impressions", "exclusivity", "modification_scope",
  "attribution", "sublicensing", "ai_use",
] as const;

export type ReviewFieldName = (typeof REVIEW_FIELD_ORDER)[number];
export interface ReviewDraftField {
  readonly state: "resolved" | "unresolved" | "contradictory" | "unsupported";
  readonly value?: unknown;
  readonly note?: string;
}

/** Selecting 'Supported value' alone does not accept any specific permission. */
export function beginExplicitResolution(): { readonly state: "resolved"; readonly value: null } {
  return { state: "resolved", value: null };
}

/** Safe even for a previously stored resolved field missing its actual value. */
export function fieldsAwaitingExplicitChoice(
  fields: Readonly<Record<ReviewFieldName, ReviewDraftField>>,
): readonly ReviewFieldName[] {
  return REVIEW_FIELD_ORDER.filter((name) => {
    const field = fields[name];
    if (!field || field.state !== "resolved") return false;
    const value = field.value;
    return value === null || value === undefined || value === ""
      || (Array.isArray(value) && value.length === 0);
  });
}
