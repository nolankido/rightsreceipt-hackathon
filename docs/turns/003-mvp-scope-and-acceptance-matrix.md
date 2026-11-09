# Turn 003 Receipt: Define MVP Scope, Non-Goals, and Acceptance Matrix

- **Status:** Completed
- **Date:** October 25, 2026 HST
- **Priority:** P0
- **Objective:** Convert the frozen product brief into an exact hackathon MVP boundary with supported values, formal non-goals, feature cut rules, and a traceable acceptance contract.
- **Exit criteria:** Every P0 requirement has one primary owner turn and one objective verification method.

## Scope completed

- Defined one complete request-to-receipt P0 path rather than a collection of disconnected features.
- Defined creator, buyer, public verifier, judge, and demo-operator access boundaries.
- Restricted the MVP to English, USD, integer cents, PayPal Sandbox, one creator workspace, one buyer organization, and one asset per request.
- Defined supported asset types, metadata, fingerprint limits, and the metadata-only registration boundary.
- Defined buyer request fields, validation limits, consent requirements, and immutable original-text preservation.
- Defined the exact P0 rights-term schema and supported values for purpose, channels, advertising, territory, date, duration, impressions, exclusivity, modification, attribution, sublicensing, and AI use.
- Defined unresolved, contradictory, and unsupported behavior and prohibited silent coercion.
- Defined field-level evidence, confidence, clarification, and manual-correction requirements.
- Defined the local AI authority boundary and the required combination of deterministic extraction, a compact learned model, versioning, and abstention.
- Defined one versioned deterministic demo pricing policy with integer-cent line items and the 42,500-cent Harbor After Rain regression case.
- Defined creator approval, buyer acceptance, version invalidation, and audit requirements.
- Defined the required PayPal Sandbox capabilities, fake-adapter boundary, webhook controls, idempotency, ordering, and reconciliation.
- Defined permission lifecycle outcomes and the receipt, export, privacy, and public-verification boundary.
- Defined required product surfaces, accessibility, security, observability, judge mode, and local fallback.
- Classified P1 and P2 work with explicit cut conditions.
- Added 25 formal non-goals and time-based feature-cut rules.
- Added change control for later scope revisions.
- Created a 69-row P0 acceptance matrix with one stable identifier, one primary owner turn, and one objective verification method per requirement.
- Updated the root overview, product index, and live project ledger.

## Files changed

- `README.md`
- `PROJECT_STATUS.md`
- `docs/product/README.md`
- `docs/product/MVP_SCOPE.md`
- `docs/product/ACCEPTANCE_MATRIX.md`
- `docs/turns/003-mvp-scope-and-acceptance-matrix.md`

## Verification

### Checks performed

```text
Scope coverage review: map every Turn 003 work item to the MVP scope or acceptance matrix
Requirement count review: confirm 69 unique P0 identifiers
Owner review: confirm every P0 row names exactly one primary management turn
Evidence review: confirm every P0 row has an objective acceptance method
Traceability review: confirm each future P0 implementation area has requirement ownership
Boundary review: compare supported values with the frozen product brief and demo scenario
Pricing review: recompute the Harbor After Rain total as 42,500 integer cents
Non-goal review: check predictable scope-expansion areas are excluded
Cut review: confirm P2 and P1 work is removed before any core P0 capability
Consistency review: compare README, PROJECT_STATUS, product index, scope, and matrix
Link review: verify every new relative link targets a tracked path
Claims review: remove implementation, legal, ownership, escrow, and production-payment overclaims
Secret review: inspect all changed files for credentials, tokens, private data, and generated secrets
Typography review: confirm changed documents contain no em dash characters
```

### Results

- `MVP_SCOPE.md` defines the exact P0, P1, P2, future, and non-goal boundaries.
- Supported term values and unsupported behavior are explicit enough to drive schemas, forms, pricing, AI labels, and tests.
- The seeded pricing policy reproduces the canonical 42,500-cent quote.
- `ACCEPTANCE_MATRIX.md` contains 69 unique P0 requirement identifiers.
- Every P0 requirement names one primary owner turn.
- Every P0 requirement includes repeatable acceptance evidence.
- The matrix covers foundation, assets, intake, terms, pricing, consent, AI, PayPal, receipts, UX, security, tests, deployment, and submission.
- No application capability is represented as already implemented.
- No credential, access token, private personal data, executable code, or production configuration was added.
- Automated application tests were not applicable because the repository remains documentation-only.

## Manual evidence

- [`../product/MVP_SCOPE.md`](../product/MVP_SCOPE.md) is the canonical hackathon feature boundary.
- [`../product/ACCEPTANCE_MATRIX.md`](../product/ACCEPTANCE_MATRIX.md) is the canonical P0 verification contract.
- The scope names exact supported enumerations and blocks unsupported requests from automatic quoting and invoicing.
- The acceptance matrix assigns the real PayPal Sandbox path to Turns 021 through 027 and does not treat the fake adapter as external proof.
- The project ledger now identifies Turn 004 as the next eligible management turn.

## Risks or limitations

- Architecture, domain types, state names, and selected technologies remain deliberately open for Turns 004 and 005.
- The acceptance methods are planned verification contracts. Test commands and artifacts do not exist until the engineering scaffold and implementation turns.
- The supported-value boundary is intentionally narrow and may reject commercially plausible requests outside the demo wedge.
- The pricing policy is illustrative and is not market-rate or legal guidance.
- The official contest rules and public competitive field can still change before submission.
- No application behavior has been implemented or tested yet.

## External blocker

None.

## Commit

This receipt is included in the self-containing Turn 003 commit. The canonical SHA is recorded in the final turn report and repository history.

## Recommended next turn

Turn 004: Lock architecture and write decision records.
