-- Versioned buyer evidence and explicit creator re-review. No payment authority.
CREATE TABLE clarification_submissions (
  submission_id TEXT PRIMARY KEY CHECK(length(submission_id)=36),
  clarification_round_id TEXT NOT NULL UNIQUE,
  case_id TEXT NOT NULL,
  buyer_capability_id TEXT NOT NULL,
  source_case_version INTEGER NOT NULL CHECK(source_case_version>=1),
  source_terms_version_id TEXT,
  source_creator_decision_id TEXT,
  plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
  plan_hash TEXT NOT NULL CHECK(length(plan_hash)=64),
  answers_hash TEXT NOT NULL CHECK(length(answers_hash)=64),
  request_id TEXT NOT NULL CHECK(length(request_id)=36),
  command_hash TEXT NOT NULL CHECK(length(command_hash)=64),
  copy_version TEXT NOT NULL CHECK(copy_version='buyer-clarification-answers-v1'),
  copy_hash TEXT NOT NULL CHECK(length(copy_hash)=64),
  submitted_at TEXT NOT NULL,
  FOREIGN KEY(clarification_round_id) REFERENCES clarification_rounds(clarification_round_id) ON DELETE CASCADE,
  FOREIGN KEY(case_id) REFERENCES licensing_cases(case_id) ON DELETE CASCADE,
  FOREIGN KEY(buyer_capability_id) REFERENCES buyer_capabilities(buyer_capability_id) ON DELETE RESTRICT,
  FOREIGN KEY(source_terms_version_id) REFERENCES terms_versions(terms_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(source_creator_decision_id) REFERENCES creator_decisions(creator_decision_id) ON DELETE RESTRICT,
  UNIQUE(case_id,request_id)
) STRICT;
CREATE TABLE clarification_reviews (
  review_id TEXT PRIMARY KEY CHECK(length(review_id)=36),
  case_id TEXT NOT NULL,
  submission_id TEXT,
  terms_version_id TEXT NOT NULL,
  quote_id TEXT,
  source_case_version INTEGER NOT NULL CHECK(source_case_version>=1),
  source_review_hash TEXT NOT NULL CHECK(length(source_review_hash)=64),
  request_id TEXT NOT NULL CHECK(length(request_id)=36),
  command_hash TEXT NOT NULL CHECK(length(command_hash)=64),
  actor_reference TEXT NOT NULL,
  copy_version TEXT NOT NULL CHECK(copy_version='creator-clarification-review-v1'),
  copy_hash TEXT NOT NULL CHECK(length(copy_hash)=64),
  created_at TEXT NOT NULL,
  FOREIGN KEY(case_id) REFERENCES licensing_cases(case_id) ON DELETE CASCADE,
  FOREIGN KEY(submission_id) REFERENCES clarification_submissions(submission_id) ON DELETE RESTRICT,
  FOREIGN KEY(terms_version_id) REFERENCES terms_versions(terms_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(quote_id) REFERENCES quotes(quote_id) ON DELETE RESTRICT,
  UNIQUE(case_id,request_id),
  UNIQUE(submission_id)
) STRICT;
CREATE INDEX clarification_submission_case ON clarification_submissions(case_id,source_case_version);
CREATE INDEX clarification_review_case ON clarification_reviews(case_id,source_case_version);
CREATE TRIGGER prevent_clarification_round_update BEFORE UPDATE ON clarification_rounds
BEGIN SELECT RAISE(ABORT,'clarification rounds are immutable'); END;
CREATE TRIGGER prevent_clarification_question_update BEFORE UPDATE ON clarification_questions
BEGIN SELECT RAISE(ABORT,'clarification questions are immutable'); END;
CREATE TRIGGER prevent_clarification_answer_update BEFORE UPDATE ON clarification_answers
BEGIN SELECT RAISE(ABORT,'clarification answers are immutable'); END;
CREATE TRIGGER prevent_clarification_submission_update BEFORE UPDATE ON clarification_submissions
BEGIN SELECT RAISE(ABORT,'clarification submissions are immutable'); END;
CREATE TRIGGER prevent_clarification_review_update BEFORE UPDATE ON clarification_reviews
BEGIN SELECT RAISE(ABORT,'clarification reviews are immutable'); END;
