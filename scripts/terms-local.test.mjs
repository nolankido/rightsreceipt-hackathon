import assert from "node:assert/strict";
import test from "node:test";
import {
  RIGHTS_FIELD_NAMES,
  RightsReviewValidationError,
  canonicalizeManualRightsReview,
  deriveTermsResolutionStatus,
  manualRightsReviewCanonicalJson,
} from "../packages/domain/src/rights-terms.ts";
import {
  completeManualReview,
  loadReview,
  openTermsDatabase,
  saveReview,
  sha256,
  tableCounts,
} from "./terms-local.mjs";

test("initial review exposes all twelve material fields as unresolved", () => {
  const database = openTermsDatabase();
  try {
    const review = loadReview(database);
    assert.equal(review.versionNumber, null);
    assert.equal(review.resolutionStatus, "not_started");
    assert.deepEqual(
      review.fields.map((field) => field.fieldName),
      RIGHTS_FIELD_NAMES,
    );
    assert.ok(review.fields.every((field) => field.resolutionState === "unresolved"));
    assert.ok(review.fields.every((field) => field.provenance === "not_set"));
  } finally {
    database.close();
  }
});

test("complete manual review persists all fields with human provenance", () => {
  const database = openTermsDatabase();
  try {
    const revision = saveReview(database, completeManualReview());
    assert.equal(revision.termsVersion.resolutionStatus, "complete");
    const review = loadReview(database);
    assert.equal(review.versionNumber, 1);
    assert.equal(review.resolutionStatus, "complete");
    assert.equal(review.fields.length, 12);
    assert.ok(review.fields.every((field) => field.provenance === "human"));
    assert.ok(review.fields.every((field) => field.confidenceBasisPoints === null));
    assert.ok(review.fields.every((field) => field.evidenceText === null));
    assert.deepEqual(
      review.fields.find((field) => field.fieldName === "channels").value,
      ["instagram_paid", "facebook_paid"],
    );
    assert.deepEqual(
      review.fields.find((field) => field.fieldName === "territories").value,
      ["US", "CA"],
    );
    assert.deepEqual(tableCounts(database), {
      extraction_attempts: 1,
      field_observations: 12,
      terms_versions: 1,
      audit_events: 1,
    });
  } finally {
    database.close();
  }
});

test("every material field accepts a supported manual correction", () => {
  const expected = {
    use_purpose: "commercial",
    channels: ["instagram_paid", "facebook_paid"],
    paid_advertising: true,
    territories: ["US", "CA"],
    start_date: "2026-11-01",
    duration_days: 90,
    max_impressions: 500000,
    exclusivity: "non_exclusive",
    modification_scope: "crop_only",
    attribution: "not_required",
    sublicensing: "prohibited",
    ai_use: "prohibited",
  };
  const canonical = canonicalizeManualRightsReview(completeManualReview());
  for (const field of RIGHTS_FIELD_NAMES) {
    assert.deepEqual(canonical.fields[field].value, expected[field]);
  }
});

test("unsupported, contradictory, and unresolved states remain distinct", () => {
  const database = openTermsDatabase();
  try {
    saveReview(
      database,
      completeManualReview({
        territories: { state: "unsupported", note: "Buyer requested worldwide use." },
        attribution: {
          state: "contradictory",
          note: "The request both requires and waives attribution.",
        },
        ai_use: { state: "unresolved" },
      }),
    );
    const review = loadReview(database);
    assert.equal(review.resolutionStatus, "unsupported");
    const territory = review.fields.find((field) => field.fieldName === "territories");
    const attribution = review.fields.find((field) => field.fieldName === "attribution");
    const aiUse = review.fields.find((field) => field.fieldName === "ai_use");
    assert.equal(territory.resolutionState, "unsupported");
    assert.equal(territory.note, "Buyer requested worldwide use.");
    assert.equal(territory.value, null);
    assert.equal(attribution.resolutionState, "contradictory");
    assert.match(attribution.note, /requires and waives/);
    assert.equal(aiUse.resolutionState, "unresolved");
    assert.equal(aiUse.note, null);
  } finally {
    database.close();
  }
});

test("resolution precedence is unsupported then contradictory then incomplete", () => {
  assert.equal(
    deriveTermsResolutionStatus(
      completeManualReview({ ai_use: { state: "unresolved" } }),
    ),
    "incomplete",
  );
  assert.equal(
    deriveTermsResolutionStatus(
      completeManualReview({ ai_use: { state: "contradictory", note: "Conflict." } }),
    ),
    "contradictory",
  );
  assert.equal(
    deriveTermsResolutionStatus(
      completeManualReview({
        ai_use: { state: "contradictory", note: "Conflict." },
        territories: { state: "unsupported", note: "Worldwide." },
      }),
    ),
    "unsupported",
  );
});

test("invalid resolved values fail instead of being coerced", () => {
  assert.throws(
    () => canonicalizeManualRightsReview(
      completeManualReview({ exclusivity: { state: "resolved", value: "exclusive" } }),
    ),
    (error) => {
      assert.ok(error instanceof RightsReviewValidationError);
      assert.ok(
        error.issues.some(
          (issue) => issue.field === "exclusivity"
            && issue.code === "unsupported_resolved_value",
        ),
      );
      return true;
    },
  );
});

test("second material edit creates a new immutable version", () => {
  const database = openTermsDatabase();
  try {
    saveReview(database, completeManualReview());
    const first = loadReview(database);
    saveReview(
      database,
      completeManualReview({
        attribution: { state: "resolved", value: "required" },
      }),
      { expectedRowVersion: first.caseRowVersion },
    );
    const current = loadReview(database);
    assert.equal(current.versionNumber, 2);
    assert.equal(
      current.fields.find((field) => field.fieldName === "attribution").value,
      "required",
    );
    const versions = database
      .prepare(
        "SELECT version_number, attribution FROM terms_versions ORDER BY version_number",
      )
      .all();
    assert.deepEqual(
      versions.map((row) => ({ ...row })),
      [
        { version_number: 1, attribution: "not_required" },
        { version_number: 2, attribution: "required" },
      ],
    );
    assert.throws(
      () => database.prepare(
        "UPDATE terms_versions SET attribution = 'not_required' WHERE version_number = 2",
      ).run(),
      /immutable/u,
    );
  } finally {
    database.close();
  }
});

test("stale expected row version writes no attempt, terms, observation, or audit row", () => {
  const database = openTermsDatabase();
  try {
    assert.throws(
      () => saveReview(database, completeManualReview(), { expectedRowVersion: 1 }),
      /stale_case/u,
    );
    assert.deepEqual(tableCounts(database), {
      extraction_attempts: 0,
      field_observations: 0,
      terms_versions: 0,
      audit_events: 0,
    });
  } finally {
    database.close();
  }
});

test("canonical ordering makes equivalent channel and territory selections hash identically", () => {
  const left = completeManualReview({
    channels: { state: "resolved", value: ["facebook_paid", "instagram_paid"] },
    territories: { state: "resolved", value: ["CA", "US"] },
  });
  const right = completeManualReview({
    channels: { state: "resolved", value: ["instagram_paid", "facebook_paid"] },
    territories: { state: "resolved", value: ["US", "CA"] },
  });
  assert.equal(
    sha256(manualRightsReviewCanonicalJson(left)),
    sha256(manualRightsReviewCanonicalJson(right)),
  );
});

test("a manual save records one atomic audit event tied to the terms version", () => {
  const database = openTermsDatabase();
  try {
    const revision = saveReview(database, completeManualReview());
    const event = database.prepare(
      `SELECT aggregate_id, aggregate_sequence, event_type, actor_type,
              actor_reference, payload_json, idempotency_key
       FROM audit_events`,
    ).get();
    assert.equal(event.aggregate_id, revision.termsVersion.termsVersionId);
    assert.equal(event.aggregate_sequence, 1);
    assert.equal(event.event_type, "terms.manual_revision_saved");
    assert.equal(event.actor_type, "creator");
    assert.equal(event.actor_reference, "demo-creator");
    assert.equal(JSON.parse(event.payload_json).resolution_status, "complete");
    assert.match(event.idempotency_key, /^terms-review:/u);
  } finally {
    database.close();
  }
});
