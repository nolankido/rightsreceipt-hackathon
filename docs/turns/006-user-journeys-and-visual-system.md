# Turn 006 Receipt: Design the Core User Journeys and Visual System

- **Status:** Completed
- **Date:** October 25, 2026 HST
- **Priority:** P0
- **Objective:** Convert the frozen product, architecture, and domain contracts into route-level journeys, screen responsibilities, low-fidelity wireframes, responsive tokens, accessibility rules, recovery behavior, and a coherent three-minute judge path.
- **Exit criteria:** The complete request-to-receipt experience is understandable before implementation, and Turn 007 can create route shells and shared UI foundations without inventing product, role, state, or visual decisions.

## Scope completed

- Defined a task-first, role-aware interaction model for creator, buyer, public verifier, and judge surfaces.
- Defined route ownership for public, creator-session, buyer-capability, receipt, audit, verification, and judge-mode surfaces.
- Defined one derived user-facing case-stage presentation without permitting the interface to write domain state.
- Defined the complete cross-role request-to-receipt journey and evidence handoffs.
- Defined 17 screen specifications with purpose, role, required content, primary action, secondary actions, blocked behavior, and status rules.
- Defined six low-fidelity wireframes covering the creator workspace, buyer request, field-level term review, buyer acceptance, payment and permission separation, and public verification.
- Defined wide, medium, small, zoom, and text-reflow behavior.
- Defined form validation, error-summary, stale-version, dependency, reconciliation, reset, and unavailable-state behavior.
- Defined confirmation rules for rejection, cancellation, revocation, capability rotation, and demo reset.
- Defined a baseline accessibility interaction contract covering landmarks, headings, labels, errors, focus, keyboard, touch targets, live regions, motion, zoom, and state announcements.
- Defined preferred product terminology and prohibited overclaiming language.
- Defined persistent and distinct PayPal Sandbox and simulated-mode labeling.
- Locked a timed three-minute judge path that shows the real product value without hiding evidence or consent.
- Defined the Evidence Ledger visual direction.
- Defined semantic color, typography, spacing, layout, breakpoint, border, radius, elevation, and motion tokens.
- Defined 20 reusable component contracts and their accessibility responsibilities.
- Defined button hierarchy, form control behavior, table behavior, document styling, icon rules, focus behavior, live-region behavior, and responsive component transformations.
- Accepted ADR 0009 for the task-first, role-aware interface.
- Updated the product index, decision index, root overview, and live project ledger.

## Accepted interaction decisions

1. Creator, buyer, verifier, and judge surfaces remain visibly separate.
2. Every screen communicates role, current truth, and next available action.
3. AI appears through structured fields, evidence, confidence, and clarification rather than as a general chat persona.
4. Each consequential decision surface has one dominant primary action.
5. Payment state and permission-effective state are shown in separate components.
6. PayPal Sandbox and simulated local mode remain visibly distinct.
7. Progressive disclosure may hide technical detail but not uncertainty, restrictions, versions, or authority.
8. Public verification exposes less data than buyer and creator receipt views.
9. The interface uses a calm Evidence Ledger visual direction rather than crypto, legal-certificate, urgency, or payment-celebration language.
10. The three-minute demo follows the same screen and lifecycle contract as the product.

## Files changed

- `README.md`
- `PROJECT_STATUS.md`
- `docs/product/README.md`
- `docs/product/USER_JOURNEYS.md`
- `docs/product/VISUAL_SYSTEM.md`
- `docs/decisions/README.md`
- `docs/decisions/0009-task-first-role-aware-interface.md`
- `docs/turns/006-user-journeys-and-visual-system.md`

## Commit sequence

The GitHub contents connector writes one file per commit, so this turn is a bounded linear commit sequence:

- `8a0fee51c64d7c76d6a425dd3caaf17c161c355a`: core user journeys and interaction contract
- `5f9e4aab22c9941a766d0d7e540c96e1959d2fdf`: visual system and component contract
- `ecfe2738fa8c3cf942daa75c322dde21179a11f4`: task-first role-aware interface ADR
- `3f7972d2e7b666d775a6d3d9d95eb39a7e1501a8`: product documentation index
- `72f1bfb3b8591e7995963c04f48b4416d29f0ffb`: decision index
- `cd85b0eebf757d7085df345151482a6fdb3e75cb`: root project overview
- `8ff2803ece948f56491c75e87246f6b5de4662f7`: live project ledger

This receipt is the final documentation commit for the turn. The resulting `main` SHA is recorded in the final turn report and repository history.

## Requirements materially advanced

No P0 row passes solely because the interaction and visual contracts exist.

The turn materially advances:

- `RR-P0-006` through `RR-P0-022`;
- `RR-P0-025` through `RR-P0-031`;
- `RR-P0-040` through `RR-P0-046`;
- `RR-P0-052` through `RR-P0-061`;
- `RR-P0-066` through `RR-P0-068`.

Relevant domain invariants include:

- `RR-DOM-001` through `RR-DOM-013`;
- `RR-DOM-019` through `RR-DOM-044`;
- `RR-DOM-047` through `RR-DOM-050`.

Future implementation receipts should cite the requirement, invariant, and screen or component that provides the evidence.

## Verification

### Repository checks

```text
Branch check: confirm main began at Turn 005 commit 6205bad87bf32ce397978d84f780ce0e4199934d
Changed-file check: confirm only intended product, decision, status, overview, and receipt paths changed
Link check: confirm every new relative link points to a tracked path
ADR check: confirm accepted ADR numbering is continuous through 0009
Status check: confirm PROJECT_STATUS.md identifies Turn 007 as next and makes no implementation claim
```

### Interaction coverage checks

```text
Actor review: trace creator, buyer, verifier, and judge boundaries
Route review: trace public, creator, capability, receipt, audit, and verification route families
Screen review: map every required MVP surface to a detailed screen specification
Action review: confirm one primary action and explicit blocked reason per consequential surface
State review: trace unresolved, unsupported, stale, preparing, awaiting payment, reconciliation, scheduled, active, expired, canceled, rejected, refunded, revoked, invalid, and simulated behavior
Authority review: confirm AI, people, deterministic code, PayPal, and clock responsibilities remain distinct
Demo review: trace the complete three-minute path without inventing a missing screen
```

### Visual and accessibility checks

```text
Token review: inspect semantic color, typography, spacing, layout, border, radius, elevation, motion, and breakpoint coverage
Contrast precheck: confirm selected strong text and action colors have calculated white-text contrast above 5.9:1
Component review: confirm 20 component contracts cover all required screen patterns
Responsive review: inspect wide, medium, small, zoom, and reflow rules
Accessibility review: inspect headings, labels, error associations, focus, keyboard, touch, live regions, reduced motion, and non-color status behavior
Copy review: inspect terminology and prohibited legal, ownership, escrow, autonomous, immutable, and PayPal-endorsement claims
Mode review: confirm simulated and PayPal Sandbox treatments cannot be confused
```

### Results

- Four actor contexts and their prohibited access boundaries are defined.
- Public, creator, buyer-capability, and judge route families are defined.
- The interaction contract contains 17 screen specifications.
- Six wireframes cover the essential judge path.
- Every consequential surface has a role, purpose, current-state rule, and primary action.
- Payment and permission are represented as separate facts.
- Field-level evidence, confidence, provenance, correction, unresolved, contradictory, and unsupported behavior are explicit.
- Stale versions, delayed webhooks, unknown invoice outcomes, dependency failures, invalid capabilities, hash mismatches, and demo reset have safe recovery behavior.
- The visual contract contains semantic token values and 20 component responsibilities.
- The chosen action and semantic strong colors have calculated white-text contrast ratios above 5.9:1, subject to final browser verification in Turn 033.
- The final video path can show the product inside three minutes without skipping creator approval, buyer acceptance, payment evidence, or verification.
- Future-dated paid permission is shown as scheduled rather than active.
- The interaction design does not expand P0 into accounts, a marketplace, a general chatbot, analytics-first dashboard, legal certification, or production payments.
- No credential, secret, capability token, private personal data, executable code, database configuration, or production endpoint was added.
- No automated application test was applicable because the executable scaffold begins in Turn 007.

## Manual evidence

- [`../product/USER_JOURNEYS.md`](../product/USER_JOURNEYS.md) is the canonical route, journey, screen, state, and wireframe contract.
- [`../product/VISUAL_SYSTEM.md`](../product/VISUAL_SYSTEM.md) is the canonical token, component, responsive, and accessibility baseline.
- [`../decisions/0009-task-first-role-aware-interface.md`](../decisions/0009-task-first-role-aware-interface.md) records the durable interaction decision and rejected alternatives.
- [`../product/README.md`](../product/README.md) provides the updated reading order.
- `PROJECT_STATUS.md` marks scope and architecture lock complete and identifies Turn 007 as next.

## Risks or limitations

- The visual tokens have not yet been rendered in a browser or checked by automated accessibility tooling.
- Exact component library selection and dependency versions remain open until Turn 007.
- Wireframes establish hierarchy, not final pixel design.
- User testing has not yet occurred.
- The buyer capability route pattern requires careful logging and referrer controls during implementation.
- The shared creator session is appropriate for judging, not production identity management.
- The final recording date may require a fixture-date adjustment so the shown permission state remains truthful.
- Dark mode is not part of P0.
- Final WCAG conformance cannot be claimed before Turn 033 testing.

## External blocker

None.

No account, credential, paid service, sponsor access, or user attestation was required for this turn.

## Recommended next turn

Turn 007: Create the monorepo and local quality commands. Pin compatible runtime and dependency versions, implement the pnpm workspace, React and Hono shells, Cloudflare Worker and Vite configuration, strict TypeScript boundaries, shared contracts and UI foundations, Vitest configuration, build scripts, and one root local verification command. Keep business behavior as clearly labeled scaffold work and do not claim any P0 feature is complete until its owning turn provides objective evidence.
