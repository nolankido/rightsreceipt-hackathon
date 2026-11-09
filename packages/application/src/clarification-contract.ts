/** Buyer answers are immutable evidence. Only a creator can save human terms. */
import type { ManualRightsReviewInput, ManualTermsRevision, RightsFieldName, TermsVersionRecord } from "../../domain/src/rights-terms";
import type { QuoteCalculation } from "../../pricing/src/index";
export const ANSWER_COPY_VERSION = "buyer-clarification-answers-v1" as const;
export const REVIEW_COPY_VERSION = "creator-clarification-review-v1" as const;
export const ANSWER_COPY = "I confirm these answers describe my requested use. They are evidence for creator review, not approved terms, payment confirmation, or permission.";
export const REVIEW_COPY = "I reviewed the original request and saved buyer answers, and confirm every displayed rights field. Saving creates or reuses human-confirmed terms and a deterministic quote when complete. Separate creator approval and buyer acceptance are still required.";
export type ClarificationField = RightsFieldName | "additional_context";
export interface Answer { readonly fieldName: ClarificationField; readonly answerText: string }
export interface Question { readonly fieldName: ClarificationField; readonly label: string; readonly question: string; readonly reason: string }
export type ClarificationFailure = "invalid_command" | "not_authorized" | "not_found" | "source_invalid" | "stale_revision"
  | "decision_locked" | "idempotency_conflict" | "stale_command" | "storage_unavailable" | "answers_not_requested"
  | "review_pending" | "terms_unchanged" | "limit_reached" | "policy_unavailable";
export class ClarificationError extends Error {
  readonly code: ClarificationFailure;
  constructor(code: ClarificationFailure) { super("The clarification could not be completed."); this.name = "ClarificationError"; this.code = code; }
}
export function clarificationFail(code: ClarificationFailure): never { throw new ClarificationError(code); }
export interface ClarificationSnapshot { readonly sourceJson: string; readonly root: Readonly<Record<string, unknown>> }
export interface AnswerCommand {
  readonly requestId: string; readonly expectedCaseVersion: number; readonly reviewHash: string;
  readonly answers: readonly Answer[]; readonly confirmed: true; readonly copyVersion: typeof ANSWER_COPY_VERSION;
}
export interface ReviewCommand {
  readonly requestId: string; readonly expectedCaseVersion: number; readonly reviewHash: string;
  readonly submissionId: string | null; readonly fields: ManualRightsReviewInput["fields"];
  readonly confirmed: true; readonly copyVersion: typeof REVIEW_COPY_VERSION;
}
export interface ClarificationCommitBase {
  readonly snapshot: ClarificationSnapshot; readonly caseId: string; readonly workspaceId: string;
  readonly digest: string | null; readonly capabilityId: string | null; readonly actorReference: string;
  readonly resultId: string; readonly commandHash: string; readonly auditId: string; readonly auditPayload: string;
  readonly copyHash: string; readonly at: string;
}
export interface AnswerCommit extends ClarificationCommitBase {
  readonly command: AnswerCommand; readonly roundId: string; readonly roundNumber: number;
  readonly sourceTermsVersionId: string | null; readonly sourceCreatorDecisionId: string | null;
  readonly questions: readonly Question[]; readonly planJson: string; readonly planHash: string; readonly answersHash: string;
}
export interface ReviewCommit extends ClarificationCommitBase {
  readonly command: ReviewCommand; readonly revision: ManualTermsRevision | null; readonly terms: TermsVersionRecord;
  readonly quote: null | { readonly quoteId: string; readonly quoteVersion: number; readonly calculated: QuoteCalculation;
    readonly calculationHash: string; readonly reuse: boolean };
}
export interface ClarificationStore {
  findBuyerCase(digest: string): Promise<string | null>;
  load(caseId: string, digest: string | null): Promise<ClarificationSnapshot | null>;
  check(snapshot: ClarificationSnapshot, caseId: string, digest: string | null, at: string): Promise<"current" | "stale" | "unauthorized">;
  commitAnswers(input: AnswerCommit): Promise<void>;
  commitReview(input: ReviewCommit): Promise<void>;
}
