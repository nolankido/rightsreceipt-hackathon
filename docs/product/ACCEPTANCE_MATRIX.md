# RightsReceipt P0 Acceptance Matrix

**Status:** Frozen verification contract  
**Owning turn:** Turn 003  
**Last reviewed:** October 25, 2026 HST  
**P0 requirement count:** 69  
**Related records:** [`PRODUCT_BRIEF.md`](PRODUCT_BRIEF.md), [`MVP_SCOPE.md`](MVP_SCOPE.md)

## 1. Purpose

This matrix converts the frozen MVP scope into traceable requirements. Every P0 requirement has:

- a stable identifier;
- one primary owner turn;
- an objective acceptance method;
- a clear expected result.

The owner turn is responsible for implementation and first evidence. Later verification turns may add broader coverage without changing ownership.

This document defines what must be proven. It does not claim that any requirement is implemented yet.

## 2. Verification conventions

The acceptance evidence may use:

- unit tests for deterministic functions and invariants;
- integration tests for persistence, adapters, and lifecycle behavior;
- browser tests for user-visible flows;
- PayPal Sandbox evidence for real external behavior;
- manual checks only where automation cannot establish visual, accessibility, or account-bound facts;
- clean-clone and signed-out reviews for release evidence.

A requirement passes only when its stated evidence exists and the observed result matches the requirement. A screenshot without repeatable behavior is not sufficient for logic, payment, or security requirements.

## 3. Traceability rules

1. Turn receipts must cite the requirement IDs completed or materially advanced.
2. A changed requirement must keep its identifier unless its meaning is replaced.
3. A removed P0 requirement requires an explicit scope revision, rationale, and status update.
4. A split requirement receives new identifiers and a migration note.
5. P1 and P2 features cannot be used as substitutes for a failing P0 requirement.
6. External sandbox evidence must be redacted and tied to a specific commit.
7. Fake-adapter evidence must be labeled simulated.
8. Final submission claims must trace to passing rows in this matrix.

## 4. Foundation and environment

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-001` | A fresh clone can install dependencies and run one documented local verification command without GitHub Actions. | Turn 007 | On a clean machine or clean workspace, the documented install and verification commands exit 0 and produce the expected build and test artifacts. |
| `RR-P0-002` | Persistence setup, migrations, and reset are deterministic. | Turn 008 | Run setup twice against empty databases and run reset twice; schema version and seeded record identifiers match the documented result without manual database edits. |
| `RR-P0-003` | The seed creates one judge-ready creator workspace and the complete Harbor After Rain scenario. | Turn 008 | After reset, automated integration checks find the expected creator, asset, pricing policy, buyer fixture, and zero stale transaction records. |
| `RR-P0-004` | Local development and automated tests do not require a paid API or production payment account. | Turn 007 | Run the local verification suite with no paid-service keys and with network access disabled for unit tests; all non-sandbox tests pass. |
| `RR-P0-005` | Missing or invalid external-service configuration fails safely and explains the missing setup without exposing secrets. | Turn 021 | Start the application with absent and malformed PayPal variables; fake mode remains usable, real mode refuses to start or act, and logs contain no credential values. |

## 5. Asset workspace

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-006` | The creator can view the seeded Harbor After Rain asset and its metadata. | Turn 009 | A browser test opens the creator asset view and asserts the expected title, type, creator, preview, provenance note, and availability status. |
| `RR-P0-007` | The creator can register metadata for one photograph or illustration without arbitrary public upload. | Turn 009 | Browser and integration tests create each supported asset type, reject an unsupported type, and persist the required metadata. |
| `RR-P0-008` | Each asset has a stable identifier, fingerprint, provenance note, and audit timestamps. | Turn 009 | Integration tests reload the asset, confirm identifier stability, verify fingerprint format, and confirm created and updated timestamps. |

## 6. Buyer request intake

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-009` | A buyer request is bound to exactly one known asset. | Turn 010 | Submitting a valid asset-specific route stores the expected asset identifier; missing, archived, or unknown asset identifiers are rejected. |
| `RR-P0-010` | Buyer name, organization, and email are required and validated. | Turn 010 | Parameterized request tests accept boundary-valid values and reject missing, malformed, overlong, or unsafe values with field-specific errors. |
| `RR-P0-011` | Intended-use text accepts 40 through 4,000 characters and rejects content outside that range. | Turn 010 | Boundary tests cover 39, 40, 4,000, and 4,001 characters and verify exact acceptance or rejection. |
| `RR-P0-012` | The buyer must acknowledge the request and demo-payment consent copy before submission. | Turn 010 | A browser test confirms submission is blocked until acknowledgement is checked and records the accepted copy version. |
| `RR-P0-013` | The original request text is preserved unchanged alongside any normalized representation. | Turn 010 | Integration tests submit punctuation, line breaks, and mixed case, then compare the stored original byte-for-byte with the submitted value. |
| `RR-P0-014` | Invalid or unsafe buyer input receives usable feedback and cannot execute instructions or markup. | Turn 010 | Negative tests submit script tags, template syntax, oversized payloads, and prompt-like commands; output is safely rendered, no command executes, and the user sees a specific error where applicable. |

## 7. Structured terms and clarification

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-015` | The structured review exposes every material rights field required by the frozen scope. | Turn 011 | A component or browser test asserts visible controls for purpose, channels, paid advertising, territory, start date, duration, impressions, exclusivity, modification, attribution, sublicensing, and AI use. |
| `RR-P0-016` | Each material field accepts only the supported P0 values or an explicit unresolved or unsupported condition. | Turn 011 | Schema tests enumerate all allowed values and reject unrecognized values; the UI distinguishes unresolved from unsupported. |
| `RR-P0-017` | Any unresolved, contradictory, or unsupported required field blocks automatic quoting. | Turn 012 | Parameterized pricing tests vary each required field through unresolved, contradictory, and unsupported states and assert that no quote is produced. |
| `RR-P0-018` | AI-populated fields display source evidence when evidence exists. | Turn 019 | Integration and browser tests submit the canonical request, then assert that each extracted supported field links to the correct source span. |
| `RR-P0-019` | AI-populated fields display confidence or an equivalent reliability signal and preserve the model version. | Turn 019 | The stored extraction and review UI include per-field reliability data and the exact model or extractor version used. |
| `RR-P0-020` | A creator can manually correct every material field without invoking the model again. | Turn 011 | A browser test edits each field, saves the correction, reloads the page, and confirms the value and human-entered provenance persist. |
| `RR-P0-021` | Clarification asks only for unresolved or contradictory required fields and stops when the quote contract is complete. | Turn 020 | Scenario tests cover complete, incomplete, and contradictory requests and compare the generated question set with the expected missing-field set. |
| `RR-P0-022` | Unsupported terms can be recorded and explained but cannot be silently coerced or invoiced. | Turn 012 | Tests submit exclusive, worldwide, perpetual, print, sublicensable, and AI-training requests; each is flagged, no quote or invoice action is available, and no supported value is substituted. |

## 8. Deterministic pricing

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-023` | Pricing uses one explicit creator policy with a stable identifier and version. | Turn 012 | Unit tests load the seeded policy, assert its identifier and version, and show that a new version does not mutate historical quotes. |
| `RR-P0-024` | All monetary calculations use integer cents and are deterministic. | Turn 012 | Property and boundary tests run identical inputs repeatedly, prohibit floating-point amount storage, and assert identical line items and totals. |
| `RR-P0-025` | Every quote shows explainable line items whose sum equals the stored total. | Turn 012 | Unit and browser tests sum the line amounts, compare them with the total, and verify a description exists for every non-zero line. |
| `RR-P0-026` | The canonical Harbor After Rain terms produce exactly 42,500 cents. | Turn 012 | A named regression test evaluates the frozen demo terms and asserts the five expected line items and total of 42,500 cents. |
| `RR-P0-027` | Out-of-range duration, impression count, territory, channel, modification, or rights values fail closed. | Turn 012 | Boundary tests cover every supported range edge and at least one value beyond each edge; invalid inputs never return a quote. |

## 9. Creator approval and buyer acceptance

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-028` | The creator can approve, edit, reject, or return a request for clarification. | Turn 013 | Browser tests complete each action and assert the expected record, status, actor, timestamp, and next available actions. |
| `RR-P0-029` | The buyer explicitly accepts the exact canonical terms and quote version before invoicing. | Turn 013 | A browser test compares the displayed and stored version identifiers and confirms invoice creation remains unavailable before acceptance. |
| `RR-P0-030` | A material edit invalidates stale approval, acceptance, and invoice eligibility. | Turn 013 | An end-to-end test approves and accepts, changes one material field, then asserts a new version is created and prior consent cannot create an invoice. |
| `RR-P0-031` | Consequential actions preserve actor, timestamp, canonical version, and outcome in the audit history. | Turn 028 | Integration tests inspect the full seeded lifecycle and assert an ordered audit event for request, correction, approval, acceptance, payment transition, and receipt creation. |

## 10. Local AI engine

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-032` | The learned AI component runs locally and does not require a paid inference API. | Turn 017 | The documented inference test runs with no external model credentials or network call and returns the expected versioned output. |
| `RR-P0-033` | High-precision deterministic extractors handle supported dates, durations, quantities, platforms, territories, and explicit yes or no clauses. | Turn 016 | A fixture suite covers positive, negative, boundary, and ambiguous examples for every deterministic extractor and reports per-field results. |
| `RR-P0-034` | The compact model artifact and training configuration are versioned and reproducible. | Turn 017 | Run the documented training or export process from the fixed dataset and configuration; resulting metrics and artifact metadata match the documented tolerance. |
| `RR-P0-035` | Synthetic training, validation, and held-out datasets are generated reproducibly with documented provenance and limitations. | Turn 015 | Generate the dataset twice with the fixed seed; file hashes or canonical record hashes match and split membership remains stable. |
| `RR-P0-036` | Model thresholds are selected from held-out evidence and favor abstention over unsupported completion. | Turn 018 | The evaluation report records per-label precision and recall, chosen thresholds, error analysis, and an abstention check for ambiguous examples. |
| `RR-P0-037` | Low-confidence, missing, or contradictory terms remain unresolved rather than being fabricated. | Turn 018 | Evaluation fixtures assert unresolved output for selected ambiguity, negation, omission, and conflict cases. |
| `RR-P0-038` | Prompt-like or malicious buyer text cannot override extraction, pricing, approval, or payment rules. | Turn 020 | Adversarial tests include instruction injection, markup, contradictory commands, and payment claims; no test changes protected state or produces an unauthorized quote. |
| `RR-P0-039` | AI output cannot set price, approve terms, accept for the buyer, confirm payment, or change permission state. | Turn 014 | Contract tests reject AI payload fields or actions that attempt any prohibited authority and record no protected side effect. |

## 11. PayPal Sandbox integration

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-040` | A clearly labeled fake PayPal adapter supports deterministic local development and tests. | Turn 021 | Adapter contract tests run the complete simulated path offline and the UI and logs label every result as simulated. |
| `RR-P0-041` | The real PayPal adapter uses sandbox endpoints only and rejects production configuration. | Turn 021 | Configuration tests accept the documented sandbox base URL, reject production endpoints, and display a sandbox indicator. |
| `RR-P0-042` | The application obtains and safely caches a PayPal Sandbox OAuth token. | Turn 022 | A sanitized integration test obtains a sandbox token, reuses it within its safe lifetime, refreshes it when required, and never writes it to logs or persistence. |
| `RR-P0-043` | One creator-approved and buyer-accepted quote creates one matching PayPal Sandbox invoice. | Turn 022 | Sandbox evidence and an integration test compare amount, currency, recipient, asset reference, rights summary, and internal reference with the accepted canonical version. |
| `RR-P0-044` | Invoice creation is idempotent and cannot duplicate an invoice for the same accepted version. | Turn 022 | Repeat the same creation request and simulate a timeout retry; exactly one local invoice binding and one intended PayPal invoice remain. |
| `RR-P0-045` | The application sends the invoice, stores PayPal identifiers, and exposes the PayPal-hosted payment path. | Turn 023 | A sandbox test sends the invoice, reloads local state, and confirms the invoice identifier, status, and payment link are available without a duplicate send. |
| `RR-P0-046` | The application retrieves current PayPal invoice status and translates failures into safe user-facing states. | Turn 023 | Integration tests cover sent, paid, canceled, refunded, not-found, authentication failure, rate limit, and transient network responses using sanitized fixtures or sandbox evidence. |
| `RR-P0-047` | Webhook intake verifies authenticity before accepting or acting on an event. | Turn 024 | Valid sandbox events pass verification; forged signatures, malformed bodies, missing headers, and altered payloads fail with no state transition. |
| `RR-P0-048` | Accepted webhook metadata is stored with redaction and can be correlated to the invoice and request. | Turn 024 | Integration tests inspect stored event records and logs, confirm correlation identifiers, and confirm secrets and unnecessary personal data are absent. |
| `RR-P0-049` | Webhook processing deduplicates retries and isolates side effects. | Turn 025 | Replay every accepted fixture multiple times and assert one transition, one receipt action, and one audit result. |
| `RR-P0-050` | Out-of-order PayPal events cannot regress state or create duplicate activation. | Turn 025 | Permutation tests process sent, paid, canceled, and refunded fixtures in different orders and assert the documented final state and side-effect count. |
| `RR-P0-051` | A missed webhook or transient PayPal failure can be recovered through reconciliation without database edits. | Turn 026 | Start from intentionally stale local state, run reconciliation, and assert that local invoice and permission state converge to the current sandbox or fixture state. |
| `RR-P0-052` | Only confirmed paid status activates permission, while canceled and fully refunded outcomes leave it non-active. | Turn 027 | Lifecycle integration tests cover paid, canceled before payment, refund after payment, and repeated events and assert the exact permission and audit outcomes. |

## 12. Receipt and verification

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-053` | Approved terms, policy version, model versions, payment reference, and lifecycle data are canonicalized before hashing. | Turn 028 | Unit tests serialize logically identical data identically and include every required version and reference in the canonical payload. |
| `RR-P0-054` | Any material alteration to the canonical receipt payload changes its verification hash. | Turn 028 | Mutation tests change each material field one at a time and assert a different hash, while non-canonical display formatting does not affect the hash. |
| `RR-P0-055` | The receipt shows the required scope, restrictions, dates, amount, versions, PayPal reference, and current status. | Turn 029 | A browser test opens the canonical receipt and asserts every field listed in the MVP scope is visible in the correct privacy context. |
| `RR-P0-056` | Public verification uses an opaque identifier and exposes no unnecessary personal or operational data. | Turn 029 | Signed-out tests verify a valid receipt, inspect the response for forbidden fields, and confirm sequential or guessable identifiers are not used. |
| `RR-P0-057` | Verification distinguishes active, expired, canceled, refunded, revoked, invalid, and not-found outcomes. | Turn 029 | Parameterized tests freeze time and load one fixture per outcome, then assert status text, machine-readable status, and permitted next action. |
| `RR-P0-058` | A valid receipt has printable HTML and a canonical JSON export. | Turn 029 | Automated tests request both representations, validate required fields and content type, and confirm they reference the same receipt hash. |
| `RR-P0-059` | The audit trail explains the lifecycle without exposing webhook secrets or raw sensitive payloads. | Turn 028 | A creator-view browser test follows the seeded lifecycle and a data-leak assertion confirms forbidden fields are absent. |

## 13. UX, security, verification, deployment, and submission

| ID | P0 requirement | Primary owner | Objective acceptance evidence |
| --- | --- | --- | --- |
| `RR-P0-060` | The complete judge path works at common desktop and mobile widths with keyboard access and visible focus. | Turn 033 | Browser tests run the happy path at selected desktop and mobile viewports, automated accessibility checks pass the chosen threshold, and a manual keyboard checklist has no blocking defect. |
| `RR-P0-061` | Every required surface has clear role, next action, loading, empty, success, and error states. | Turn 033 | A state-coverage checklist and component or browser fixtures render each state and verify accessible names and recovery guidance. |
| `RR-P0-062` | Exposed routes enforce input validation, capability or authorization checks, rate limits, opaque identifiers, output safety, and redacted logs. | Turn 034 | Threat-model tests attempt unauthorized cross-role actions, identifier guessing, payload abuse, replay, and log leakage; high-risk attempts fail without protected side effects. |
| `RR-P0-063` | Critical domain, pricing, model runtime, adapter, migration, webhook, idempotency, and receipt logic has deterministic automated coverage. | Turn 035 | The local verification report lists passing suites for every named critical area and includes meaningful negative cases, not only line coverage. |
| `RR-P0-064` | Browser tests cover the seeded happy path and correction, rejection, duplicate webhook, and invalid receipt failures. | Turn 036 | One documented browser command executes all required scenarios and produces readable failure artifacts. |
| `RR-P0-065` | Structured redacted logs, health checks, correlation identifiers, safe error boundaries, and deterministic demo reset are available. | Turn 037 | Operational tests confirm health status, trace one scenario across components, inspect redaction, force an error boundary, and reset to the known seed. |
| `RR-P0-066` | The deployed release candidate completes the signed-out judge path and retains a documented local fallback. | Turn 038 | Deployment smoke evidence records the stable URL, reset state, buyer path, PayPal sandbox handoff, receipt verification, and local fallback instructions. |
| `RR-P0-067` | Repository documentation lets a reviewer understand, install, run, test, and evaluate the real project and its limitations. | Turn 039 | A clean-clone review follows only the README and linked records, completes setup and verification, and finds architecture, model, security, privacy, testing, and limitation notes. |
| `RR-P0-068` | The public demonstration stays within the contest limit and shows real implemented behavior that maps to the judging criteria. | Turn 041 | The final video duration is checked, every shown claim is traced to a release-candidate behavior, captions are reviewed, and no simulated event is represented as sandbox evidence. |
| `RR-P0-069` | The final public repository, deployment, video, Devpost entry, license, and preserved evidence all refer to the same release. | Turn 044 | A signed-out release audit verifies the tag and commit, public links, license, video, deployment, submitted form, and archived confirmation before the deadline. |

## 14. Coverage by management turn

| Turn | Primary acceptance responsibility |
| --- | --- |
| 007 | Repository scaffold, local verification, no paid dependency |
| 008 | Persistence, migrations, deterministic seed and reset |
| 009 | Creator asset workspace, registration, fingerprint |
| 010 | Buyer request intake and validation |
| 011 | Structured rights-term review and correction |
| 012 | Supported-value enforcement and deterministic pricing |
| 013 | Mock approval and acceptance vertical slice |
| 014 | AI authority and structured-output contract |
| 015 | Reproducible synthetic dataset |
| 016 | Deterministic extraction baselines |
| 017 | Local learned model and versioned artifact |
| 018 | Evaluation, thresholds, and abstention |
| 019 | Evidence, confidence, and TypeScript inference integration |
| 020 | Clarification and adversarial behavior |
| 021 | Fake and real PayPal adapter contract, sandbox-only configuration |
| 022 | OAuth, invoice mapping, and idempotent creation |
| 023 | Invoice sending, payment handoff, and status retrieval |
| 024 | Verified webhook intake and redacted event evidence |
| 025 | Deduplication, order safety, and side-effect isolation |
| 026 | Reconciliation and failure recovery |
| 027 | Paid, canceled, and refunded permission outcomes |
| 028 | Canonical payload, audit trail, and hashing |
| 029 | Receipt, export, and public verification |
| 033 | Responsive, accessible, and complete UI states |
| 034 | Security, privacy, authorization, and abuse controls |
| 035 | Broad unit and integration verification |
| 036 | Judge-path browser suite |
| 037 | Observability, health, error boundaries, and reset |
| 038 | Release deployment and signed-out judge verification |
| 039 | Portfolio-grade documentation |
| 041 | Public demonstration evidence |
| 044 | Final release and submission integrity |

Turns 030 through 032 are P1 or P2 polish and therefore do not own a P0 row. Turns 040, 042, and 043 prepare or review evidence but do not replace the implementation owners listed above.

## 15. Minimum gate evidence

### Gate A: Mock vertical slice

Before external integration begins, rows `RR-P0-001` through `RR-P0-030` that are owned by Turns 007 through 013 must pass against local adapters, except rows explicitly owned by later AI turns.

### Gate B: AI readiness

Rows `RR-P0-032` through `RR-P0-039` must pass with recorded model and extractor versions. The AI may still be imperfect, but unsafe completion and prohibited authority are blockers.

### Gate C: PayPal end to end

Rows `RR-P0-040` through `RR-P0-052` must pass, including real sandbox evidence for OAuth, invoice creation, sending, payment status, and webhook verification.

### Core feature freeze

Rows `RR-P0-053` through `RR-P0-065` must pass before the project can enter release-candidate deployment.

### Final submission

Rows `RR-P0-066` through `RR-P0-069` must pass against one identified release commit.

## 16. Current implementation state

As of Turn 003:

- 69 P0 requirements are defined;
- every P0 requirement has one primary owner turn;
- every P0 requirement has an objective acceptance method;
- no P0 requirement is represented as implemented;
- automated product verification does not yet exist because the engineering scaffold begins in Turn 007.

The live completion state remains in the root `PROJECT_STATUS.md`. Future turn receipts provide the evidence behind that status.
