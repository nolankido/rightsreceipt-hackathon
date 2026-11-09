# RightsReceipt AI Development Management Plan

**Created:** October 25, 2026  
**Target event:** PayPal AI Hackathon  
**Submission deadline:** November 12, 2026 at 12:00 PM Pacific, 10:00 AM Hawaii time  
**Primary project:** RightsReceipt  
**Plan status:** Active  
**Current completed turn:** Turn 050, P0 history-aware public repository audit, implemented; final release execution pending.

`PROJECT_STATUS.md` is the current completion ledger. The backlog below preserves the original intended sequence; original dashboard, whole-application UX/security and external release gates remain incomplete where the current ledger says so.

## 1. Mission

Build a polished, open-source hackathon entry that turns an informal request to license a creator's visual work into a structured, human-approved, PayPal-paid, verifiable permission record.

The required demonstration flow is:

1. A buyer describes a proposed use of a photograph or illustration.
2. The local AI extracts the requested rights, cites evidence, assigns confidence, and identifies missing terms.
3. Deterministic policy code calculates a quote from the creator's configured rules.
4. The creator reviews and approves, edits, or rejects the proposed terms.
5. The buyer accepts the exact terms.
6. PayPal Sandbox creates and sends the invoice.
7. A verified PayPal webhook confirms payment.
8. RightsReceipt activates the permission and issues a tamper-evident rights receipt with a public verification page.

The program must remain useful as a portfolio project even if it does not win.

## 2. Contest and product constraints

The current official rules require PayPal's developer platform to be central to the project and require use of an AI tool, model, or platform. The project must work as represented in its submission materials. Before final submission, the active rules and Devpost form must be checked again.

Official references:

- Rules: https://paypalaihackathon.devpost.com/rules
- Dates: https://paypalaihackathon.devpost.com/details/dates
- Resources: https://paypalaihackathon.devpost.com/resources
- AG Grid sponsor details: https://paypalaihackathon.devpost.com/details/aggrid

Non-negotiable engineering constraints:

- Use PayPal Sandbox only. Do not enable production payments.
- Do not require a paid AI API.
- Keep money calculations deterministic and use integer minor units, such as cents.
- The AI may extract, classify, summarize, and ask questions. It may not invent prices, approve terms, confirm payment, or activate a license.
- A human creator must approve material terms before invoicing.
- Payment status must come from PayPal or an explicit test adapter, never from an AI response.
- Verify PayPal webhooks and make webhook processing idempotent.
- Never commit credentials, tokens, personal data, or generated secrets.
- Do not present RightsReceipt as legal advice, ownership verification, or a substitute for a lawyer.
- Maintain a complete local verification path. Do not depend on GitHub Actions.
- Each completed management turn must leave the default branch in a runnable or clearly documented state.

## 3. Target judging position

The build should make a credible case across all five judging criteria:

| Criterion | RightsReceipt evidence |
| --- | --- |
| Technological implementation | Central PayPal invoice lifecycle, verified webhooks, local ML inference, policy engine, receipt hashing, tests |
| Design | Clear buyer and creator workflows, explicit uncertainty, accessible responsive interface |
| Potential impact | A concrete workflow for independent creators handling unclear commercial-use requests |
| Innovation | Treats creative permissions as structured, paid, verifiable commercial records |
| Presentation | One coherent end-to-end demonstration that fits comfortably within the video limit |

Primary prize targets:

1. Best Use of PayPal + AI
2. Most Creative
3. Best Demo Delivery
4. Best Use of Agentic Commerce
5. Best Use of AG Grid, only if the optional sponsor track does not endanger the core submission

## 4. Definition of done

RightsReceipt is submission-ready only when all of the following are true:

- A fresh clone can be installed and run from documented commands.
- A judge can use seeded demo data without creating records manually.
- The buyer request flow accepts natural language and produces structured terms.
- AI output includes evidence, confidence, and safe fallback behavior.
- Missing consequential terms trigger clarification rather than invention.
- The pricing engine produces reproducible quotes from versioned creator policies.
- Creator approval and buyer acceptance are recorded as audit events.
- The PayPal adapter can create and send a Sandbox invoice.
- Verified webhook events move the invoice and permission through valid states.
- Duplicate and out-of-order webhook events cannot duplicate side effects.
- Paid status activates the permission; cancellation or refund follows an explicit policy.
- The rights receipt contains canonical terms, references the PayPal invoice, and has a verification hash.
- A public verification route can distinguish valid, expired, refunded, and revoked records.
- Unit, integration, and browser tests cover the critical path and important failure modes.
- A judge mode can reset the application to a known scenario.
- The public repository has a strong README, architecture notes, model card, security notes, license, and setup instructions.
- The deployed application, demonstration video, screenshots, and Devpost description agree with the actual implementation.
- No secret, unsupported claim, production credential, or unlicensed asset is present.

## 5. Management-turn operating protocol

A management turn is one self-contained AI work cycle with one primary outcome. Future AI sessions should follow this sequence without asking for routine permission:

1. **Inspect:** Read this plan, `PROJECT_STATUS.md` once it exists, recent commits, current tests, and active blockers.
2. **Select:** Choose the first incomplete, unblocked P0 turn. A blocked turn does not block independent work.
3. **State the objective:** Name the selected turn and its exit criteria before editing.
4. **Implement:** Make the smallest coherent set of changes that fully satisfies the turn.
5. **Verify:** Run targeted tests, then the broadest practical local verification command.
6. **Review:** Inspect the diff for scope drift, secrets, broken copy, accessibility regressions, and unsupported claims.
7. **Record:** Update `PROJECT_STATUS.md` and create or update the turn receipt under `docs/turns/`.
8. **Commit:** Commit the verified work with a clear conventional commit message.
9. **Report:** State the commit, files changed, tests run, evidence, blockers, and next eligible turn.

Every turn receipt should use this format:

```markdown
# Turn NNN Receipt: Title

- Status: Completed | Blocked | Deferred
- Date:
- Objective:
- Scope completed:
- Files changed:
- Verification commands:
- Verification results:
- Manual evidence:
- Risks or limitations:
- External blocker, if any:
- Commit:
- Recommended next turn:
```

A turn is not complete merely because code was written. Its exit criteria and verification evidence must exist.

## 6. Priority system and cut rules

- **P0:** Required for a credible, valid submission.
- **P1:** Strong competitive polish. Complete after the P0 path is stable.
- **P2:** Optional sponsor or showcase work. Cut first if schedule or reliability is threatened.
- **USER:** Requires an account owner action, credential, attestation, or final submission action. The AI should prepare everything possible before requesting the narrow handoff.

If progress falls behind, cut work in this order:

1. Additional sponsor integrations
2. AG Studio agent features beyond a polished dashboard
3. Automated notifications
4. Advanced analytics
5. Downloadable PDF generation, while preserving printable HTML and JSON receipt export
6. Multi-workspace support

Never cut the core request, extraction, deterministic quote, approval, PayPal invoice, verified payment, and receipt-verification path.

## 7. Milestones and calendar gates

| Gate | Target date in Hawaii | Required result |
| --- | --- | --- |
| Scope and architecture lock | October 27 | Product contract, data model, architecture, repository scaffold |
| Mock vertical slice | October 31 | Request to approved quote to simulated paid receipt |
| AI integration gate | November 2 | Evaluated local model integrated with safe confidence behavior |
| PayPal vertical slice | November 5 | Sandbox invoice and verified webhook complete end to end |
| Core feature freeze | November 8 | Receipt verification, tests, security, and judge mode complete |
| Release candidate | November 10 | Deployment, documentation, video script, and submission copy ready |
| Internal submission target | November 11 | Public repository and final assets verified, one-day safety buffer |
| Official deadline | November 12, 10:00 AM HST | Devpost submission accepted and independently rechecked |

The calendar gates guide prioritization. A turn remains complete only when its exit criteria pass.

## 8. Turn backlog

### Phase A: Product contract and repository foundation

#### Turn 000: Create the master development plan

- **Priority:** P0
- **Status:** Completed
- **Outcome:** This plan exists in the default branch and defines the operating system for later turns.
- **Exit evidence:** `DEVELOPMENT_PLAN.md` committed.

#### Turn 001: Bootstrap the repository and project ledger

- **Priority:** P0
- **Status:** Planned
- **Work:** Add the root README, license, `.gitignore`, editor settings, documentation tree, `PROJECT_STATUS.md`, turn-receipt template, and decision-log structure.
- **Exit criteria:** A fresh visitor understands the product, current phase, and how future AI turns are tracked.

#### Turn 002: Freeze the product brief and competitive position

- **Priority:** P0
- **Status:** Planned
- **Work:** Define target users, jobs to be done, primary pain, value proposition, demo scenario, comparable products, differentiation, prize strategy, and prohibited claims.
- **Exit criteria:** One canonical product brief maps the project to every judging criterion.

#### Turn 003: Define MVP scope, non-goals, and acceptance matrix

- **Priority:** P0
- **Status:** Planned
- **Work:** Convert the definition of done into traceable feature requirements and tests. Separate P0, P1, and P2 work.
- **Exit criteria:** Every P0 requirement has an owner turn and objective verification method.

#### Turn 004: Lock architecture and write decision records

- **Priority:** P0
- **Status:** Planned
- **Work:** Confirm the TypeScript monorepo, React web app, Hono API, SQLite-compatible persistence, local ML training and exported inference model, PayPal adapter, receipt service, and deployment target. Record alternatives and tradeoffs.
- **Exit criteria:** Architecture diagram and ADRs remove major implementation ambiguity.

#### Turn 005: Specify domain model, state machine, and invariants

- **Priority:** P0
- **Status:** Planned
- **Work:** Define creator, buyer, asset, request, extracted terms, quote, approval, acceptance, invoice, webhook event, permission, receipt, policy version, and audit event. Define valid transitions and forbidden transitions.
- **Exit criteria:** Domain types and lifecycle diagrams can drive database schema and tests.

#### Turn 006: Design the core user journeys and visual system

- **Priority:** P0
- **Status:** Planned
- **Work:** Create low-fidelity screens and interaction notes for buyer request, clarification, creator review, buyer acceptance, payment, receipt, verification, and creator dashboard. Define responsive tokens and accessibility baseline.
- **Exit criteria:** The complete demo path is understandable before implementation.

### Phase B: Engineering scaffold and mock vertical slice

#### Turn 007: Create the monorepo and local quality commands

- **Priority:** P0
- **Status:** Planned
- **Work:** Establish package management, TypeScript configuration, web and API apps, shared packages, linting, formatting, type checking, tests, builds, and one local `verify` command.
- **Exit criteria:** Clean install, test, typecheck, and build all pass without GitHub Actions.

#### Turn 008: Implement persistence, migrations, seeds, and reset

- **Priority:** P0
- **Status:** Planned
- **Work:** Create the initial schema, migration system, repository interfaces, test database, seeded judge scenario, and deterministic reset command.
- **Exit criteria:** Database setup and reset are repeatable and covered by integration tests.

#### Turn 009: Build creator workspace and asset registration

- **Priority:** P0
- **Status:** Planned
- **Work:** Add creator profile, asset metadata, safe demo image handling, asset fingerprint, and pricing-policy assignment.
- **Exit criteria:** A creator can view seeded assets and register a new visual asset.

#### Turn 010: Build buyer request intake

- **Priority:** P0
- **Status:** Planned
- **Work:** Add the asset-specific request form, natural-language intent input, buyer details, consent copy, validation, and request persistence.
- **Exit criteria:** A valid request is stored and invalid or unsafe input receives usable feedback.

#### Turn 011: Build structured rights-term review components

- **Priority:** P0
- **Status:** Planned
- **Work:** Render media, territory, duration, commercial use, paid advertising, modification, attribution, exclusivity, sublicensing, AI-training rights, start date, and evidence fields.
- **Exit criteria:** Terms can be reviewed and corrected without AI or PayPal integration.

#### Turn 012: Implement the deterministic policy and pricing engine

- **Priority:** P0
- **Status:** Planned
- **Work:** Create versioned creator policies, integer-cent calculations, explainable line items, validation, and boundary tests.
- **Exit criteria:** The same terms and policy version always produce the same amount and explanation.

#### Turn 013: Complete a mock end-to-end vertical slice

- **Priority:** P0
- **Status:** Planned
- **Work:** Connect request intake, placeholder extraction, term correction, quote, creator approval, buyer acceptance, simulated payment, and placeholder receipt.
- **Exit criteria:** A browser test completes the entire product story using only local adapters.

#### Gate A: Mock vertical slice review

- **Priority:** P0
- **Status:** Planned
- **Work:** Evaluate coherence, scope, state transitions, accessibility, and test evidence. Fix blocking defects before beginning external integrations.
- **Exit criteria:** The core story works locally and remains understandable without narration.

### Phase C: Local AI engine

#### Turn 014: Define the AI task contract and safety behavior

- **Priority:** P0
- **Status:** Planned
- **Work:** Specify structured output, evidence spans, confidence, abstention rules, supported labels, ambiguity classes, and deterministic fallbacks.
- **Exit criteria:** The AI contract explicitly prevents invented consequential terms.

#### Turn 015: Create synthetic training and evaluation data

- **Priority:** P0
- **Status:** Planned
- **Work:** Generate varied licensing requests with controlled labels, paraphrases, omissions, conflicts, adversarial phrasing, and train, validation, and held-out splits.
- **Exit criteria:** Dataset generation is reproducible and includes documented limitations and license provenance.

#### Turn 016: Implement deterministic extraction baselines

- **Priority:** P0
- **Status:** Planned
- **Work:** Add parsing for dates, durations, quantities, currencies, platforms, territories, and explicit yes or no clauses.
- **Exit criteria:** High-precision baseline behavior is tested independently of the learned model.

#### Turn 017: Train and export the local classification model

- **Priority:** P0
- **Status:** Planned
- **Work:** Train a compact multi-label model, save reproducible configuration, export inference weights to a portable format, and record metrics.
- **Exit criteria:** Training can be repeated and produces a versioned artifact without a paid API.

#### Turn 018: Evaluate, calibrate, and document the model

- **Priority:** P0
- **Status:** Planned
- **Work:** Measure per-label precision and recall, define confidence thresholds, inspect common errors, test ambiguity and negation, and write the model card.
- **Exit criteria:** Thresholds favor safe clarification over unsupported completion, with evidence recorded.

#### Turn 019: Integrate TypeScript inference into the request flow

- **Priority:** P0
- **Status:** Planned
- **Work:** Load the exported model in the application, combine it with deterministic extraction, attach evidence and confidence, and persist model version.
- **Exit criteria:** Real request text produces structured terms that can be reviewed and corrected.

#### Turn 020: Implement clarification generation and adversarial tests

- **Priority:** P0
- **Status:** Planned
- **Work:** Ask only questions needed to complete consequential fields. Add tests for prompt-like text, contradictory instructions, missing terms, overlong input, and malicious payloads.
- **Exit criteria:** The system abstains safely, asks concise questions, and never lets text bypass policy or payment rules.

#### Gate B: AI readiness review

- **Priority:** P0
- **Status:** Audited locally; exit BLOCKED on browser and model evidence
- **Work:** Review model evidence, runtime reliability, latency, failure behavior, and user-facing explanation.
- **Exit criteria:** The AI adds demonstrable value and does not control money or authority.

### Phase D: PayPal Sandbox integration

#### Turn 021: Establish the PayPal adapter and sandbox setup contract

- **Priority:** P0 and USER
- **Status:** Completed locally; Sandbox transport pending Turn 022
- **Work:** Create real and fake adapter interfaces, environment validation, sandbox setup documentation, redacted example configuration, and credential handoff instructions.
- **Exit criteria:** Local development works with the fake adapter; the real adapter fails safely when credentials are absent.

#### Turn 022: Implement OAuth and invoice creation

- **Priority:** P0
- **Status:** Planned
- **Work:** Add token acquisition, safe token caching, invoice request mapping, idempotency, API error translation, and integration tests with sanitized fixtures.
- **Exit criteria:** A creator-approved quote can create one matching PayPal Sandbox invoice.

#### Turn 023: Implement invoice sending and status retrieval

- **Priority:** P0
- **Status:** Planned
- **Work:** Send the invoice, store PayPal identifiers, expose the payment link, retrieve status, and prevent duplicate sends.
- **Exit criteria:** The buyer can move from accepted terms to the PayPal-hosted payment experience.

#### Turn 024: Implement verified webhook intake

- **Priority:** P0
- **Status:** Planned
- **Work:** Preserve the required request body, verify authenticity using PayPal's supported mechanism, reject invalid events, redact logs, and store accepted event metadata.
- **Exit criteria:** Valid sandbox events pass and forged or malformed events fail without state changes.

#### Turn 025: Make webhook processing idempotent and order-safe

- **Priority:** P0
- **Status:** Planned
- **Work:** Deduplicate events, enforce valid transitions, handle retries and out-of-order delivery, and isolate side effects.
- **Exit criteria:** Replaying any accepted event cannot duplicate an invoice, receipt, or audit action.

#### Turn 026: Add reconciliation and failure recovery

- **Priority:** P0
- **Status:** Planned
- **Work:** Compare local state to PayPal status, expose safe retry paths, add useful creator-facing errors, and test network and partial-failure scenarios.
- **Exit criteria:** A missed webhook or transient API failure can be recovered without manual database edits.

#### Turn 027: Complete paid, canceled, and refunded lifecycle behavior

- **Priority:** P0
- **Status:** Planned
- **Work:** Activate permissions on confirmed payment, define cancellation behavior, apply refund or revocation policy, and record all transitions.
- **Exit criteria:** PayPal state changes produce correct, auditable permission states.

#### Gate C: PayPal end-to-end review

- **Priority:** P0 and USER
- **Status:** Planned
- **Work:** Run the complete Sandbox flow from request through payment and receipt using a dedicated demo account and capture redacted evidence.
- **Exit criteria:** PayPal is central, functional, secure enough for a hackathon demo, and accurately documented.

### Phase E: Rights receipt, verification, and competitive polish

#### Turn 028: Implement canonical terms, audit trail, and receipt hashing

- **Priority:** P0
- **Status:** Planned
- **Work:** Canonicalize approved terms, include policy and model versions, hash the receipt payload, and connect the complete audit history.
- **Exit criteria:** Any material alteration changes the verification hash and the audit trail explains the lifecycle.

#### Turn 029: Build receipt and public verification experiences

- **Priority:** P0
- **Status:** Planned
- **Work:** Create the buyer receipt, creator record, printable view, JSON export, QR verification link, and public status page.
- **Exit criteria:** A third party can verify the record's status without seeing unnecessary personal information.

#### Turn 030: Add expiration and status visibility

- **Priority:** P1
- **Status:** Planned
- **Work:** Calculate effective and expiration states, highlight upcoming expirations, and show valid, expired, canceled, refunded, and revoked states consistently.
- **Exit criteria:** Time-based lifecycle behavior is deterministic and testable.

#### Turn 031: Build the creator rights-portfolio dashboard

- **Priority:** P1
- **Status:** Planned
- **Work:** Add useful metrics, filters, request queues, revenue by asset and use type, active and expiring permissions, and refund history. Use AG Grid or AG Studio only through authorized terms.
- **Exit criteria:** The dashboard improves the creator workflow and is not a decorative sponsor integration.

#### Turn 032: Add AG Studio agent features if the core is green

- **Priority:** P2
- **Status:** Planned
- **Work:** Evaluate sponsor access and implement a narrowly useful natural-language dashboard action or custom agent integration.
- **Exit criteria:** The feature is polished, documented, and removable without affecting the core product.
- **Cut condition:** Defer immediately if access, licensing, reliability, or schedule threatens P0 work.

#### Turn 033: Perform a complete UX, responsive, and accessibility pass

- **Priority:** P0
- **Status:** Planned
- **Work:** Improve hierarchy, copy, loading and error states, keyboard navigation, focus behavior, contrast, reduced motion, mobile layout, and empty states.
- **Exit criteria:** The demo path is coherent on desktop and mobile and passes the selected accessibility checks.

#### Turn 034: Perform security, privacy, and threat-model review

- **Priority:** P0
- **Status:** Planned
- **Work:** Document trust boundaries, validate all inputs, review authorization, rate-limit exposed routes, protect identifiers, minimize public data, redact logs, and scan history for secrets.
- **Exit criteria:** High-risk findings are fixed or explicitly mitigated before deployment.

### Phase F: Verification, deployment, and submission

#### Turn 035: Expand unit and integration verification

- **Priority:** P0
- **Status:** Planned
- **Work:** Cover domain invariants, pricing, model runtime, adapters, migrations, webhook verification, idempotency, receipt hashing, and negative cases.
- **Exit criteria:** Critical business logic has meaningful deterministic tests, not superficial line coverage.

#### Turn 036: Build the judge-path browser test suite

- **Priority:** P0
- **Status:** Planned
- **Work:** Add browser tests for the seeded happy path and key failures, including correction, rejected approval, duplicate webhook, and invalid verification record.
- **Exit criteria:** The local mock path is repeatable with one command and produces clear artifacts on failure.

#### Turn 037: Add observability, resilience, and demo reset

- **Priority:** P0
- **Status:** Planned
- **Work:** Add structured redacted logs, correlation identifiers, health checks, safe error boundaries, seeded reset, and a visible demo-mode indicator.
- **Exit criteria:** Demo failures can be diagnosed quickly and the environment can be restored to a known state.

#### Turn 038: Deploy the release candidate and verify judge mode

- **Priority:** P0 and USER
- **Status:** Planned
- **Work:** Configure the selected host, database, environment variables, webhook URL, domain or stable URL, and deployment notes. Run smoke tests against the deployed system.
- **Exit criteria:** The deployed application completes the documented judge path and has a local fallback.

#### Turn 039: Finish portfolio-grade documentation

- **Priority:** P0
- **Status:** Planned
- **Work:** Complete README, architecture, setup, demo, API notes, security policy, privacy notes, model card, testing guide, known limitations, screenshots, and contribution guidance.
- **Exit criteria:** A reviewer can understand, run, evaluate, and discuss the project from the repository alone.

#### Turn 040: Create the final demo scenario and storyboard

- **Priority:** P0
- **Status:** Planned
- **Work:** Freeze the sample asset, buyer request, extracted terms, clarification, quote, approval, PayPal event, receipt, dashboard view, narration, and shot list.
- **Exit criteria:** The planned video demonstrates the complete product and maps directly to judging criteria.

#### Turn 041: Produce demonstration assets

- **Priority:** P0 and USER
- **Status:** Planned
- **Work:** Prepare the final script, recording checklist, cursor path, captions, screenshots, thumbnail, and backup footage. Record account-bound footage with the user's authorized session.
- **Exit criteria:** A public video within the contest limit clearly shows the real application working end to end.

#### Turn 042: Prepare and audit the Devpost submission

- **Priority:** P0
- **Status:** Planned
- **Work:** Draft project title, tagline, problem, solution, technology, PayPal integration, AI method, challenges, accomplishments, lessons, next steps, links, prize selections, and disclosures. Recheck the active rules and form.
- **Exit criteria:** Every statement is supported by the repository, deployment, or video.

#### Turn 043: Run the release-candidate rubric review

- **Priority:** P0
- **Status:** Planned
- **Work:** Score the entry against implementation, design, impact, innovation, and presentation. Perform clean-clone installation, sandbox smoke, mobile review, accessibility review, secret scan, link check, and video comparison.
- **Exit criteria:** No P0 defect remains and unresolved limitations are disclosed clearly.

#### Turn 044: Freeze, publish, submit, and preserve evidence

- **Priority:** P0 and USER
- **Status:** Planned
- **Work:** Tag the release, confirm repository visibility and license, preserve commit and deployment identifiers, submit Devpost, reopen the entry to verify all fields, and archive confirmation evidence.
- **Exit criteria:** Devpost shows a valid submitted entry before the deadline and all public links work in a signed-out session.

## 9. External handoffs

The AI should defer user involvement until the narrow action is actually needed. Expected account-owner handoffs are:

- Join the PayPal AI Hackathon on Devpost.
- Create or select a PayPal Developer Sandbox application.
- Provide sandbox credentials through a private environment, never chat-visible repository content.
- Approve any sponsor-tool account or license terms before use.
- Approve hosting or service charges before any paid resource is enabled.
- Change repository visibility to public when the release candidate is safe to publish.
- Sign in to YouTube and Devpost for account-bound upload and submission steps.
- Review and affirm ownership, eligibility, and legal attestations.

A missing handoff should be recorded as a blocker for that turn while independent turns continue.

## 10. Release scorecard

Before Turn 044, the project should reach these minimum internal scores:

| Area | Minimum |
| --- | ---: |
| End-to-end reliability | 9/10 |
| PayPal integration depth | 9/10 |
| AI usefulness and honesty | 8/10 |
| Product coherence | 9/10 |
| Visual polish | 8/10 |
| Accessibility | 8/10 |
| Security and privacy discipline | 8/10 |
| Documentation | 9/10 |
| Demo clarity | 9/10 |
| Portfolio value | 9/10 |

A low score requires either repair or an explicit scope cut. It must not be hidden by presentation copy.

## 11. Immediate next turn

Proceed with **Turn 051 P0: Execute the release candidate gates**.

Feature work remains frozen. Turns 048 through 050 have prepared the release verifier, genuine PayPal Sandbox acceptance harness and public-repository history audit.

The remaining path is execution:

1. On a networked development machine, generate `pnpm-lock.yaml` with pinned pnpm 12.8.2, review it and commit it.
2. From one clean candidate commit, run `pnpm release:verify`. This now includes the history-aware publication audit, frozen installation, complete verification suite and canonical judge rehearsal.
3. Resolve every audit, dependency, typecheck, lint, Vitest, Vite, Wrangler or deterministic-regression failure before proceeding.
4. Execute the genuine Sandbox acceptance commands against that exact candidate, pay the USD 425.00 test invoice using the separate Sandbox buyer, require the authenticated financial `paid` conclusion and verify a genuine invoicing webhook.
5. If all evidence is green, run `pnpm public:export`, create the public submission repository from that one-commit sanitized export, verify it signed out, then record the under-three-minute public YouTube demo and finalize Devpost. Keep the private development repository private.

Do not add optional product, dashboard or sponsor features before these release gates close. The official deadline remains November 12, 2026 at 12:00 PM Pacific, with the internal target on November 11.
