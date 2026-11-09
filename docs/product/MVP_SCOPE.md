# RightsReceipt Hackathon MVP Scope

**Status:** Frozen MVP contract  
**Owning turn:** Turn 003  
**Last reviewed:** October 25, 2026 HST  
**Target event:** PayPal AI Hackathon  
**Related records:** [`PRODUCT_BRIEF.md`](PRODUCT_BRIEF.md), [`ACCEPTANCE_MATRIX.md`](ACCEPTANCE_MATRIX.md)

## 1. Purpose and precedence

The product brief explains why RightsReceipt should exist and how it should be positioned. This document defines what the hackathon MVP must and must not implement. The acceptance matrix defines how each P0 requirement will be verified.

When records conflict, use this order:

1. `PROJECT_STATUS.md` for current execution state.
2. `MVP_SCOPE.md` for the frozen hackathon feature boundary.
3. `ACCEPTANCE_MATRIX.md` for requirement ownership and verification.
4. `PRODUCT_BRIEF.md` for product direction and positioning.
5. `DEVELOPMENT_PLAN.md` for the broader management-turn backlog.

Turn 004 will choose the architecture. Turn 005 will define the exact domain state machine and invariants. This scope document intentionally avoids selecting libraries, hosts, database products, or authentication frameworks.

## 2. MVP definition

The MVP is one complete, credible request-to-receipt workflow for a direct license of one visual asset.

A successful P0 path must let a judge:

1. open a seeded creator workspace;
2. select the project-owned `Harbor After Rain` photograph;
3. submit a buyer request in ordinary English;
4. see extracted rights fields with evidence, confidence, and unresolved terms;
5. answer the required clarification questions or correct fields manually;
6. receive an itemized quote calculated by deterministic policy code;
7. approve the terms as the creator;
8. accept the same canonical terms as the buyer;
9. create and send a matching PayPal Sandbox invoice;
10. pay the invoice through PayPal's sandbox flow;
11. process verified payment evidence;
12. activate the permission;
13. issue a tamper-evident rights receipt; and
14. verify the receipt through a public, privacy-minimized route.

The application may offer a fake payment adapter for local development and automated tests. It must never present fake payment as a real PayPal Sandbox result.

## 3. Priority definitions

| Priority | Meaning | Release rule |
| --- | --- | --- |
| P0 | Required for a credible, eligible, end-to-end submission | Must pass before submission |
| P1 | Competitive polish that improves clarity or usefulness | Include only after the P0 path is stable |
| P2 | Optional sponsor or showcase work | Cut first if schedule, access, or reliability is threatened |
| Future | Useful after the hackathon but outside this release | Do not start before submission |

P0 is a complete vertical slice, not a collection of isolated screens. A partially working PayPal integration, AI demo, or receipt page does not satisfy the MVP by itself.

## 4. Actors and access boundary

### 4.1 Creator

The MVP supports one seeded creator workspace for the fictional photographer Maya Chen.

The creator can:

- view the seeded asset;
- register basic metadata for another photograph or illustration;
- review buyer requests;
- correct proposed terms;
- see the deterministic quote;
- approve, edit, or reject the proposed transaction;
- inspect the invoice and permission status;
- view the receipt and audit trail.

The MVP does not require public creator registration, password recovery, social login, teams, roles, or multi-tenant isolation. The deployed judge experience may use a clearly labeled demo session. Any privileged creator route still requires a deliberate access control appropriate to the selected architecture.

### 4.2 Buyer

The buyer uses an asset-specific request route or opaque access token. The buyer can:

- identify the requesting person and organization;
- describe the intended use;
- answer clarifications;
- review the final canonical terms;
- explicitly accept those terms;
- continue to the PayPal-hosted payment flow;
- view the resulting receipt.

The buyer does not receive access to the creator workspace or other requests.

### 4.3 Public verifier

A public verifier can enter or open an opaque receipt identifier and see:

- whether the receipt exists;
- the permitted use and restrictions;
- the effective and expiration dates;
- the current permission status;
- the PayPal invoice reference in a privacy-safe form;
- the receipt verification hash.

The public route must not expose buyer email, private notes, webhook payloads, access tokens, or unnecessary personal data.

### 4.4 Judge and demo operator

The judge path uses synthetic data, a visible sandbox or demo indicator, and a deterministic reset. A local fallback must remain available if external hosting or PayPal becomes temporarily unavailable during judging.

## 5. Locale, money, and data boundary

The P0 release supports:

| Dimension | P0 value |
| --- | --- |
| Interface language | English |
| Request language | English |
| Currency | USD only |
| Money representation | Integer cents |
| Date representation | ISO `YYYY-MM-DD` for canonical dates |
| Timestamp representation | UTC storage with a displayed timezone label |
| Asset count per request | Exactly one |
| Creator workspaces | One seeded workspace |
| Buyer organizations per request | One |
| PayPal environment | Sandbox only |
| Personal data | Synthetic demo data and controlled test accounts only |

No currency conversion, tax calculation, VAT handling, foreign-language extraction, or jurisdiction-specific legal interpretation is part of P0.

## 6. Asset scope

### 6.1 Supported asset types

P0 supports metadata records for:

- `photograph`
- `illustration`

The primary demonstration uses the project-owned photograph `Harbor After Rain`.

### 6.2 Required asset metadata

Each asset record must include:

- stable internal identifier;
- title;
- asset type;
- creator display name;
- provenance note;
- content fingerprint or documented deterministic stand-in;
- preview or thumbnail reference;
- active or archived availability state;
- creation and update timestamps.

### 6.3 File handling limit

P0 does not require arbitrary public file upload, cloud media processing, image transformation, watermarking, or digital-rights-management controls. The application may use a project-owned static demo file and metadata-only registration for additional assets.

A fingerprint proves only that a receipt refers to a particular file representation. It does not prove copyright ownership, authorship, identity, or authority to license.

## 7. Buyer request scope

A valid P0 request includes:

| Field | Rule |
| --- | --- |
| Asset | Required and fixed by the request route |
| Buyer name | Required, 2 to 100 characters |
| Buyer organization | Required, 2 to 120 characters |
| Buyer email | Required, syntactically valid, maximum 254 characters |
| Intended-use text | Required, 40 to 4,000 characters |
| Consent acknowledgement | Required before submission |
| Attachments | Not supported |
| Currency selection | Not supported, fixed to USD |

The original request text must be stored unchanged for evidence. A normalized or extracted representation may be stored separately.

Invalid input must receive specific feedback. User text must be treated as untrusted data, not as instructions to the model, policy engine, payment adapter, or lifecycle engine.

## 8. Canonical rights-term schema

Every material term starts in one of three conditions:

- supported value;
- unresolved;
- unsupported for automatic quoting.

The P0 quote path supports the following values.

| Field | Required for quote | Supported P0 value or range | Unsupported examples |
| --- | --- | --- | --- |
| `use_purpose` | Yes | `commercial` | editorial, nonprofit waiver, personal use |
| `channels` | Yes | one or both of `instagram_paid`, `facebook_paid` | print, broadcast, packaging, out-of-home |
| `paid_advertising` | Yes | `yes` | organic-only request |
| `territories` | Yes | one or both of `US`, `CA` | worldwide, EU, other countries |
| `start_date` | Yes | valid ISO date | approximate or impossible date |
| `duration_days` | Yes | integer from 1 through 365 | perpetual, open-ended, more than 365 days |
| `max_impressions` | Yes | integer from 1 through 500,000 | uncapped or more than 500,000 |
| `exclusivity` | Yes | `non_exclusive` | exclusive or category-exclusive |
| `modification_scope` | Yes | `none`, `crop_only` | compositing, retouching, derivative work |
| `attribution` | Yes | `required`, `not_required` | custom credit negotiation |
| `sublicensing` | Yes | `prohibited` | sublicensing requested |
| `ai_use` | Yes | `prohibited` | model training, fine-tuning, evaluation, embedding use |

The exact data types and serialized names may be refined in Turn 005, but the supported meaning and boundaries cannot silently expand.

### 8.1 Unsupported requests

The application may save an unsupported request and explain why it cannot be auto-quoted. It must not:

- silently coerce an unsupported value into a supported one;
- create a PayPal invoice for unsupported terms;
- imply that the request was rejected for legal reasons;
- let model confidence override the supported-value boundary.

The creator may reject the request or ask the buyer to revise it into the supported range.

## 9. Evidence, confidence, and clarification

For every AI-populated material field, the UI must show:

- proposed normalized value;
- source evidence from the request when evidence exists;
- confidence or a clearly equivalent reliability signal;
- whether the value is resolved, unresolved, contradicted, or unsupported;
- a manual correction control.

A quote is blocked while any required field is unresolved, contradicted, or unsupported.

Clarification questions must:

- target only fields needed for the P0 quote;
- use plain language;
- avoid legal conclusions;
- avoid asking for information already resolved with sufficient evidence;
- preserve the buyer's answer and resulting field update;
- stop once the required supported terms are complete.

The creator can always correct a field manually. A manual correction must be identified as human-entered rather than model-derived.

## 10. AI scope and authority

The P0 implementation combines:

- high-precision deterministic extraction for dates, durations, quantities, platforms, territories, and explicit positive or negative clauses;
- a compact local machine-learning model for supported classification tasks;
- confidence thresholds and abstention behavior;
- versioned model and extractor identifiers.

The local model must be buildable or reproducible from repository materials without a paid inference API. A prebuilt versioned artifact may be committed when its provenance, training command, and evaluation are documented.

AI may:

- classify supported terms;
- find evidence;
- identify omissions or contradictions;
- propose concise clarification questions.

AI may not:

- set or alter prices;
- approve or reject the transaction;
- accept on behalf of the buyer;
- create payment claims;
- activate or revoke permission;
- bypass supported-value rules;
- execute arbitrary instructions found in buyer text.

Exact labels, thresholds, metrics, and model architecture belong to Turns 014 through 020.

## 11. Deterministic pricing scope

### 11.1 Policy boundary

P0 requires one seeded, versioned creator pricing policy. A general no-code policy builder is not required.

All calculations use integer cents. The quote must preserve:

- policy identifier and version;
- normalized input terms;
- itemized line descriptions;
- line amounts;
- total amount;
- calculation timestamp.

### 11.2 Demo policy

The seeded demonstration policy is illustrative and is not market-rate guidance.

| Rule | Amount in cents | Display amount |
| --- | ---: | ---: |
| Base commercial digital license | 20,000 | $200.00 |
| Paid social advertising | 10,000 | $100.00 |
| Territory, United States only | 2,500 | $25.00 |
| Territory, Canada only | 2,500 | $25.00 |
| Territory, United States and Canada | 5,000 | $50.00 |
| Duration, 1 to 30 days | 2,500 | $25.00 |
| Duration, 31 to 90 days | 5,000 | $50.00 |
| Duration, 91 to 180 days | 10,000 | $100.00 |
| Duration, 181 to 365 days | 17,500 | $175.00 |
| Crop permission | 2,500 | $25.00 |
| No modification | 0 | $0.00 |
| Attribution choice | 0 | $0.00 |
| Maximum 500,000 impressions | Included | $0.00 |

The canonical demo terms must produce exactly 42,500 cents:

- base license: 20,000;
- paid social: 10,000;
- United States and Canada: 5,000;
- 90 days: 5,000;
- crop permission: 2,500.

### 11.3 Quote controls

The pricing engine must:

- reject non-integer or out-of-range inputs;
- produce the same result for the same terms and policy version;
- explain every non-zero line item;
- refuse to quote unresolved or unsupported terms;
- never use model output as a direct monetary amount;
- preserve prior quote versions rather than mutating accepted history.

## 12. Approval and acceptance scope

The creator can:

- edit proposed terms before approval;
- approve the supported terms and quote;
- reject the request with a plain-language reason;
- return the request for buyer clarification.

The buyer must explicitly accept:

- the exact canonical term version;
- the exact quote amount;
- the permission restrictions;
- the fact that payment is processed in PayPal Sandbox for the demonstration.

Any material edit after creator approval or buyer acceptance invalidates the affected approval or acceptance and requires a new canonical version. An invoice must not be created from a stale acceptance.

Every consequential action records actor, timestamp, canonical version, and result.

The MVP records operational consent and traceability. It does not claim to provide a jurisdictionally sufficient electronic signature or legal agreement.

## 13. PayPal Sandbox scope

### 13.1 Required real integration

P0 must use the PayPal Sandbox to:

- obtain OAuth authorization;
- create one invoice from an accepted quote;
- send the invoice;
- store PayPal invoice identifiers;
- expose the PayPal-hosted payment path;
- retrieve current invoice status;
- receive and verify relevant invoice webhook events;
- reconcile local state with PayPal state after missed or delayed events;
- respond to paid, canceled, and refunded outcomes.

### 13.2 Required controls

The integration must:

- use sandbox endpoints only;
- fail safely when credentials are missing;
- avoid logging secrets or full sensitive payloads;
- make create and send operations idempotent;
- reject malformed or unauthenticated webhook events without state changes;
- deduplicate retries;
- tolerate out-of-order delivery;
- isolate side effects;
- preserve redacted evidence for the demo and tests.

The invoice amount, currency, asset reference, rights summary, and internal request reference must match the buyer-accepted canonical version.

### 13.3 Local fake adapter

A fake adapter is allowed for:

- local development;
- deterministic automated tests;
- offline fallback demonstration.

The UI and logs must label fake-adapter results as simulated. Fake events cannot be represented in the submission as proof that the PayPal Sandbox integration works.

## 14. Permission lifecycle scope

The exact state machine will be frozen in Turn 005. P0 behavior must still satisfy these outcomes:

- a draft request is not a permission;
- a quote is not active permission;
- creator approval alone does not activate permission;
- buyer acceptance alone does not activate permission;
- invoice creation or sending does not activate permission;
- verified paid status activates the permission;
- a canceled invoice cannot activate permission;
- a full refund makes the permission non-active under the configured demo policy;
- creator revocation, when used, is explicit, auditable, and distinct from PayPal refund state;
- reaching the calculated end date makes the permission expired;
- duplicate or out-of-order events cannot produce duplicate activation, receipts, or audit entries.

## 15. Rights receipt scope

The active receipt must include:

- receipt identifier;
- asset identifier, title, type, and fingerprint;
- creator display name;
- buyer organization display name;
- canonical supported rights terms;
- explicit restrictions;
- effective and expiration dates;
- quote amount and currency;
- creator policy version;
- AI model and extractor versions;
- creator approval timestamp;
- buyer acceptance timestamp;
- PayPal invoice reference and payment-derived status;
- current permission status;
- canonical payload hash;
- creation and update timestamps.

P0 requires:

- creator receipt view;
- buyer receipt view;
- privacy-minimized public verification view;
- printable HTML;
- JSON export;
- invalid-record behavior;
- status values for active, expired, canceled, refunded, revoked, and invalid.

A QR link is P1. Downloadable PDF generation is P2.

The hash is tamper-evident. It must not be described as immutable, blockchain-backed, legally conclusive, or proof of ownership.

## 16. Required screens and product surfaces

P0 requires a coherent path across these surfaces:

1. creator workspace and asset list;
2. asset registration or metadata form;
3. buyer request intake;
4. extracted-term review with evidence and confidence;
5. clarification and manual correction;
6. deterministic quote explanation;
7. creator approval or rejection;
8. buyer review and acceptance;
9. PayPal invoice status and payment handoff;
10. receipt for creator and buyer;
11. public receipt verification;
12. audit history;
13. judge reset and demo status;
14. error, loading, empty, and unavailable states.

A broad analytics dashboard is not required for P0.

## 17. Accessibility and responsive baseline

The P0 judge path must:

- work at common desktop and mobile widths;
- use semantic headings, labels, and controls;
- support keyboard navigation;
- show visible focus;
- maintain readable contrast;
- avoid color-only status communication;
- expose validation errors programmatically and visually;
- respect reduced-motion preferences where animation exists;
- use plain status language;
- keep role and next action clear on every step.

The selected automated accessibility checks and manual review procedure will be defined in Turn 033.

## 18. Security and privacy baseline

P0 must include:

- server-side validation for all consequential inputs;
- authorization or capability checks for creator-only and buyer-only actions;
- opaque public identifiers;
- minimal public receipt data;
- rate limiting or equivalent abuse controls for exposed routes;
- output encoding and safe rendering of buyer text;
- safe request-size limits;
- secret-safe environment configuration;
- redacted structured logs;
- webhook authenticity verification;
- idempotency and replay controls;
- dependency and repository-history secret review before publication;
- synthetic or controlled data in screenshots and seeds.

The exact threat model and controls belong to Turn 034.

## 19. Reliability, observability, and judge mode

P0 requires:

- one documented local verification command;
- deterministic migrations and seed/reset behavior;
- a health check;
- correlation identifiers across the request, invoice, webhook, permission, and receipt flow;
- clear operator errors without secret leakage;
- a visible sandbox or simulated-mode indicator;
- a one-command or one-control demo reset;
- a local fake-adapter fallback;
- browser tests for the seeded happy path and key failure paths.

A demo that depends on manually editing a database does not satisfy P0.

## 20. P1 scope

P1 work begins only after the full P0 path passes.

| P1 feature | Intended owner | Cut condition |
| --- | --- | --- |
| Upcoming-expiration indicators and richer status presentation | Turn 030 | Cut if core receipt status is unstable |
| Creator rights-portfolio dashboard | Turn 031 | Cut if PayPal, tests, or receipt work remains |
| Useful filters and summary metrics | Turn 031 | Cut with the dashboard |
| QR link to public verification | Turn 029 or 031 | Cut if public verification works without it |
| Additional visual polish beyond the accessibility baseline | Turn 033 | Cut only after required usability fixes |
| Additional creator-facing recovery guidance | Turn 026 | Cut if core reconciliation remains incomplete |

P1 features must not introduce new claims, external dependencies, or data exposure that weaken P0.

## 21. P2 scope

| P2 feature | Intended owner | Cut condition |
| --- | --- | --- |
| AG Grid or AG Studio sponsor dashboard enhancement | Turn 032 | Cut immediately if access, licensing, reliability, or schedule is uncertain |
| Natural-language dashboard action | Turn 032 | Cut with sponsor work |
| Downloadable PDF receipt | Later polish | Cut while printable HTML and JSON remain |
| Automated email notifications beyond PayPal's invoice flow | Future | Do not begin before submission |
| Additional analytics and cohort views | Future | Do not begin before submission |
| Multiple pricing policies or policy builder | Future | Do not begin before submission |

## 22. Formal non-goals

The hackathon MVP will not attempt:

1. production PayPal transactions;
2. holding funds or providing escrow;
3. a creator marketplace or asset discovery catalog;
4. copyright, identity, or authority verification;
5. legal advice or jurisdiction-specific contract drafting;
6. a guarantee of enforceability, compliance, or infringement prevention;
7. autonomous negotiation;
8. AI-set prices, AI approval, or AI-confirmed payment;
9. more than one asset per request;
10. audio, video, written work, software, trademarks, or merchandise licensing;
11. exclusive, perpetual, worldwide, print, broadcast, packaging, or sublicensable rights;
12. AI-training or model-evaluation permission;
13. currencies other than USD;
14. tax, VAT, withholding, or accounting treatment;
15. arbitrary public image upload and media processing;
16. content moderation or infringement detection;
17. digital-rights-management enforcement or watermark monitoring;
18. public user registration, teams, role administration, or multi-tenant billing;
19. e-signature certification;
20. dispute resolution, chargeback adjudication, or collections;
21. native mobile applications;
22. multilingual extraction or localization;
23. blockchain, NFTs, or immutable-ledger claims;
24. a general-purpose assistant or chatbot;
25. a fully configurable no-code pricing engine.

A non-goal may be reconsidered after the hackathon. It cannot be added during the sprint without an explicit scope revision and a corresponding acceptance-matrix update.

## 23. Feature cut rules

When schedule pressure appears, apply cuts in this order:

1. Remove all P2 sponsor and showcase work.
2. Remove the P1 dashboard and advanced analytics.
3. Remove QR and downloadable PDF while preserving public verification, printable HTML, and JSON.
4. Remove notifications and extra recovery copy.
5. Keep asset registration metadata-only and use the included project-owned demo image.
6. Keep one seeded pricing policy and remove policy editing.
7. Keep only the exact supported enumerations in Section 8.
8. Preserve the local fake adapter for tests, but do not substitute it for the required PayPal Sandbox evidence.
9. Preserve the local model, safe abstention, deterministic quote, human approvals, verified payment, receipt hash, public verification, and critical tests.

Hard schedule rules:

- If the PayPal Sandbox vertical slice is not passing by November 5 HST, stop all P1 and P2 work.
- If the seeded browser path is not stable by November 8 HST, stop visual embellishment and focus only on P0 reliability.
- If the release candidate is not green by November 10 HST, no new capability may enter the build.
- No feature may be retained solely because it looks impressive in the video if it weakens truthful behavior or testability.

## 24. Change control

The P0 boundary is frozen by Turn 003.

A later change to supported values, authority boundaries, money behavior, PayPal requirements, public receipt data, or P0 status requires:

1. an explicit scope change in this document;
2. an updated acceptance-matrix row;
3. a turn receipt explaining the reason and schedule impact;
4. an architecture or domain decision record when tradeoffs are material.

Minor copy edits and implementation details that preserve the requirement meaning do not require a scope revision.

## 25. Turn 003 completion test

Turn 003 is complete when:

- the P0 path is described without architecture ambiguity masquerading as product scope;
- supported term values and out-of-range behavior are explicit;
- P1 and P2 work have clear cut conditions;
- formal non-goals prevent predictable scope expansion;
- every P0 requirement has one owner turn and one objective verification method in `ACCEPTANCE_MATRIX.md`;
- root and status records point to the frozen contract;
- no document claims that unimplemented behavior already exists.
