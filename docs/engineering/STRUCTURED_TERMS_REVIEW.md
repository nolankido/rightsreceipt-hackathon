# Structured Rights-Term Review

**Status:** Implemented and verified through the dependency-free local terms harness
**Owning turn:** Turn 011
**Browser build verification:** Pending the blocked Turn 007 dependency gate
**Live D1 verification:** Pending a configured D1 binding

## Purpose

This record describes the creator-facing structured review for a submitted licensing request. The creator can inspect the immutable buyer evidence, classify all twelve material rights fields, enter supported values, record unresolved or contradictory information, and preserve unsupported requests without silently coercing them.

This turn is deliberately manual. It does not claim that AI extracted any value, does not calculate a price, does not approve rights, and does not create or confirm a payment.

## Material fields

The review always presents these twelve fields in a fixed order:

1. Use purpose
2. Channels
3. Paid advertising
4. Territory
5. Start date
6. Duration
7. Maximum impressions
8. Exclusivity
9. Modification scope
10. Attribution
11. Sublicensing
12. AI use

Every field has one explicit state:

- `resolved`, with a supported P0 value;
- `unresolved`, when the creator cannot yet determine the value;
- `contradictory`, with a required explanation;
- `unsupported`, with a required explanation.

Unsupported values cannot be submitted as resolved values. The creator must record the unsupported condition rather than silently translating it into a supported term.

## Supported values

| Field | Supported P0 value or range |
| --- | --- |
| Use purpose | `commercial` |
| Channels | one or both of `instagram_paid`, `facebook_paid` |
| Paid advertising | `true` |
| Territory | one or both of `US`, `CA` |
| Start date | valid ISO `YYYY-MM-DD` date |
| Duration | integer from 1 through 365 days |
| Maximum impressions | integer from 1 through 500,000 |
| Exclusivity | `non_exclusive` |
| Modification | `none` or `crop_only` |
| Attribution | `required` or `not_required` |
| Sublicensing | `prohibited` |
| AI use | `prohibited` |

Channels and territories are canonicalized into stable ordering. Duplicate selections are rejected.

## Evidence and provenance

The screen displays the original buyer intended-use text beside the structured review. That source text remains immutable.

A manual correction creates twelve field observations with:

- provenance `human`;
- resolver version `manual-review-v1`;
- no model identifier;
- no model confidence;
- no fabricated field-level evidence span.

The UI states that no field-level AI evidence exists in this manual-only turn. Later extraction turns may attach evidence spans, confidence, and model or extractor versions without changing the manual-review authority boundary.

## Versioning and lifecycle

Saving a review creates:

- one completed manual extraction-attempt record;
- twelve append-only field observations;
- one immutable terms version;
- one append-only audit event;
- one guarded update to the licensing case pointer and row version.

The terms version contains a SHA-256 hash of the canonical review. The request input hash is calculated from the original intended-use text. A materially different save creates the next version. An identical current version is rejected as unchanged. A stale case row version creates no partial write.

Resolution precedence is deterministic:

1. any unsupported field makes the version `unsupported`;
2. otherwise, any contradictory field makes it `contradictory`;
3. otherwise, any unresolved field makes it `incomplete`;
4. otherwise, the version is `complete`.

A complete review is only marked `ready_for_pricing`. Turn 011 does not calculate or display a quote.

## API routes

Creator routes require the existing explicit demonstration role header:

```text
x-rightsreceipt-demo-role: creator
```

Routes:

```text
GET  /api/creator/cases
GET  /api/creator/cases/:caseId/terms
POST /api/creator/cases/:caseId/terms
```

The save request includes the expected case row version and all twelve field edits. The server rejects malformed case identifiers, oversized bodies, stale versions, closed cases, unchanged terms, and unsupported values falsely marked as resolved.

## React routes

```text
/creator
/creator/cases
/creator/cases/:caseId
```

The creator workspace now includes the submitted request queue. The full queue shows the asset, buyer organization, current terms version, and review stage. The review route includes:

- immutable buyer evidence;
- all twelve field controls;
- explicit unresolved, contradictory, and unsupported states;
- human provenance and reliability language;
- required explanation fields;
- a quote-readiness gate;
- focused validation summary;
- loading, retry, saving, and error states;
- clear statements that saving does not approve, price, invoice, or activate rights.

## Persistence implementations

The D1-shaped repository provides:

- submitted case listing;
- joined case, asset, request, current terms, and observation loading;
- guarded version and attempt sequence lookup;
- atomic insertion of attempt, observations, terms version, and audit event;
- optimistic case row-version update;
- duplicate-hash and stale-case handling.

The local memory implementation shares the same cases and submissions used by buyer intake. It stores attempts, observations, terms versions, and audit events in append-only collections and advances the case row version after a successful save.

Memory state is used only in local mode and is always identified as memory state. Sandbox and judge modes still require D1.

## Dependency-free verification

Run:

```bash
node --no-warnings --experimental-strip-types --test scripts/terms-local.test.mjs
```

The ten tests cover:

1. all twelve fields initially unresolved;
2. complete human-entered persistence and provenance;
3. supported correction for every material field;
4. distinct unresolved, contradictory, and unsupported states;
5. deterministic resolution precedence;
6. unsupported resolved values failing closed;
7. immutable sequential versions;
8. stale writes producing no partial records;
9. canonical channel and territory ordering;
10. one audit event tied to the saved terms version.

## Verification limitations

- React and Hono have not executed with installed dependencies because Turn 007 remains blocked.
- Vitest, Vite build, Wrangler dry run, and browser automation remain pending.
- D1 repository source has not run against a live binding.
- AI extraction, field evidence spans, confidence calibration, and clarification generation remain later turns.
- Deterministic pricing begins in Turn 012.
- Creator approval, buyer acceptance, invoicing, permission activation, and receipts remain later work.

These limitations remain explicit release blockers. Local manual review evidence is not represented as browser, AI, pricing, PayPal, or live D1 evidence.
