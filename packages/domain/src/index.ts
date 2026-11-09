export * from "./assets";
export * from "./buyer-requests";
export * from "./rights-terms";

export type DomainAuthority = "ai" | "deterministic" | "creator" | "buyer" | "paypal" | "clock";

export type ConsequentialAction =
  | "propose_terms"
  | "calculate_price"
  | "approve_terms"
  | "accept_terms"
  | "confirm_payment"
  | "evaluate_effective_state";

const authorityByAction: Readonly<Record<ConsequentialAction, DomainAuthority>> = {
  propose_terms: "ai",
  calculate_price: "deterministic",
  approve_terms: "creator",
  accept_terms: "buyer",
  confirm_payment: "paypal",
  evaluate_effective_state: "clock",
};

export function authorityFor(action: ConsequentialAction): DomainAuthority {
  return authorityByAction[action];
}

export const DOMAIN_PACKAGE_STATUS = "structured-rights-review" as const;
