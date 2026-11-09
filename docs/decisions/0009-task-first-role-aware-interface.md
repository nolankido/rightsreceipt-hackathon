# ADR 0009: Use a Task-First, Role-Aware Interface

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** RightsReceipt project
- **Related turns:** Turn 006
- **Supersedes:** None
- **Superseded by:** None

## Context

RightsReceipt coordinates four different perspectives:

- creator;
- buyer;
- public verifier;
- judge or demo operator.

The product also has several facts that must remain distinct:

- AI-proposed terms versus human-corrected terms;
- creator approval versus buyer acceptance;
- PayPal invoice state versus permission-effective state;
- PayPal Sandbox evidence versus simulated local behavior;
- a public verification record versus an issued rights receipt.

A chat-first interface could make the AI contribution visually prominent, but it would blur evidence, versions, authority, and deterministic rules. A generic step wizard could shorten the happy path, but it could conceal stale versions and make non-linear recovery difficult. A dashboard-first interface could show many metrics while weakening the clear request-to-receipt story required for the hackathon.

The interface needs to be understandable in a three-minute demonstration while remaining honest about uncertainty and state.

## Decision

RightsReceipt will use a task-first, role-aware interaction model.

The model has these binding rules:

1. Creator, buyer, public verifier, and judge surfaces remain visibly distinct.
2. Every screen makes the current role, current truth, and next available action clear.
3. Each decision region has one visually dominant primary action.
4. AI output appears as structured proposed values, evidence, confidence, and clarification needs rather than a general chat persona.
5. Consequential terms, versions, restrictions, quote totals, and mode labels remain visible before approval, acceptance, payment, or verification.
6. Payment state and permission-effective state appear in separate components.
7. PayPal Sandbox and simulated local mode use persistent, distinct labels.
8. A derived progress presentation may summarize the journey, but it cannot write or override domain state.
9. Progressive disclosure may hide technical detail, but it cannot hide authority, uncertainty, restrictions, or blocked conditions.
10. Stale, unsupported, unresolved, dependency, and reconciliation states provide an explicit recovery path.
11. Public verification is privacy-minimized and visually separate from privileged receipt and audit views.
12. The interface uses the accepted Evidence Ledger visual direction and semantic component tokens.

The canonical interaction and visual details are maintained in:

- [`../product/USER_JOURNEYS.md`](../product/USER_JOURNEYS.md)
- [`../product/VISUAL_SYSTEM.md`](../product/VISUAL_SYSTEM.md)

## Consequences

### Positive

- The hackathon story follows one clear request-to-receipt path.
- AI value is visible without implying AI authority.
- Creator and buyer consent remain tied to exact versions.
- Payment and permission cannot be mistaken for the same fact.
- Simulated behavior cannot be presented as PayPal Sandbox evidence.
- The interaction model supports both desktop review and mobile buyer actions.
- The same component language can support screenshots, the final video, and portfolio review.
- Failure and recovery behavior is designed before implementation rather than added at the end.

### Negative and tradeoffs

- Separate role surfaces require more route and component structure than one universal screen.
- Showing evidence and versions adds visual density that must be managed carefully.
- The application cannot rely on a short linear wizard for every case because clarification and stale-version recovery can loop.
- Maintaining separate payment and permission cards uses more screen space.
- A restrained evidence-oriented design may appear less dramatic than a chat-heavy AI demo.
- The interface must implement and test more explicit loading, blocked, and recovery states.

## Alternatives considered

### Chat-first assistant

A chat interface could accept the buyer request and display follow-up questions naturally.

It was not selected because:

- evidence and normalized fields would be harder to compare;
- authority boundaries could appear conversational rather than enforceable;
- creator corrections and exact version binding would be less visible;
- it could make RightsReceipt look like another generic AI assistant;
- a transcript is not the clearest surface for deterministic pricing and receipt verification.

A small conversational clarification treatment may be used within the structured journey, but it cannot replace the field review contract.

### Linear wizard

A wizard could present one stage at a time.

It was not selected as the controlling model because:

- cases can return to clarification;
- material edits invalidate stale consent;
- payment may require reconciliation;
- creator and buyer actions occur in separate contexts;
- hiding completed terms behind earlier steps could weaken informed consent.

Compact progress indicators are still allowed as navigation aids.

### Dashboard-first application

A creator dashboard could lead with metrics, queues, and charts.

It was not selected for P0 because the core value is one licensing case, not broad portfolio analytics. A dashboard remains P1 after the complete P0 path is stable.

### Document-only interface

A document metaphor could show the terms and receipt clearly.

It was not selected as the sole model because request intake, clarification, payment recovery, and role-specific actions require interactive workflow surfaces. The receipt itself still uses a document presentation.

## Validation

The decision is working when:

- a new reviewer can identify role, mode, state, and next action on each required screen;
- the complete judge path can be followed without verbal explanation of hidden state;
- field-level evidence and uncertainty are visible before creator approval;
- the creator and buyer see the same canonical terms and quote version;
- payment and permission states are visually separate;
- simulated mode cannot be confused with PayPal Sandbox;
- desktop and mobile wireframes retain the same authority hierarchy;
- keyboard users can complete the P0 path;
- browser tests can assert the primary action and blocked reason for each case stage;
- the final video can demonstrate the product within the contest limit without skipping required consent or evidence.

Turn 033 will provide the final responsive and accessibility evidence. Turn 036 will provide browser-flow evidence.

## Revisit triggers

Reconsider this decision if:

- user testing shows role separation causes repeated navigation failure;
- the required P0 path cannot fit the contest video without hiding material consent or payment evidence;
- mobile implementation cannot preserve the evidence and action hierarchy;
- accessibility testing shows a selected interaction pattern cannot be made reliable;
- official contest requirements demand a materially different interface;
- a new ADR changes the access, lifecycle, or deployment model in a way that invalidates the route separation.

Any replacement must preserve truthful status, version-bound consent, clear mode labeling, and field-level uncertainty.

## References

- [`../product/USER_JOURNEYS.md`](../product/USER_JOURNEYS.md)
- [`../product/VISUAL_SYSTEM.md`](../product/VISUAL_SYSTEM.md)
- [`../architecture/DOMAIN_MODEL.md`](../architecture/DOMAIN_MODEL.md)
- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md)
- [`../product/MVP_SCOPE.md`](../product/MVP_SCOPE.md)
