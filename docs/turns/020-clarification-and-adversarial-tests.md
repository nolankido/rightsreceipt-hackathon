# Turn 020: Clarification generation and adversarial verification

**Priority:** P0
**Date:** October 26, 2026 HST
**Status:** Implemented and locally verified. Full browser and release acceptance remain blocked.

## Objective

Generate only necessary P0 rights clarification questions, preserve evidence, keep unsupported terms blocked, and prove prompt-injection text cannot bypass the licensing authority boundaries.

## Implementation completed

- Added `rights-clarification-v1` as a pure, bounded twelve-field question planner.
- Added fixed, accessible question wording with zero insertion of untrusted buyer instructions.
- Distinguished missing, ambiguous, low-confidence, contradictory, unsupported, resolved, and complete-human-review cases.
- Prevented unsupported rights from being replaced by allowed values or falsely becoming request questions.
- Validated original UTF-16 evidence spans, allowed normalized values, field ordering, resolution reasons, and no-extra-key authority surface.
- Added read-only creator clarification service that prefers current human-saved observations and verifies terms-status consistency.
- Added capability-scoped, privacy-reduced buyer clarification reads with expiry, revocation, request and action checks.
- Added shared strict response contracts, creator and buyer API routes, accessible React views, question-copy action, and navigation.
- Added two dependency-free test suites, one of them using the actual deterministic extractor from Turn 016.
- Added `clarification:verify` to the root static and full verification commands.

## Verification receipt

```text
node --no-warnings --experimental-strip-types --test scripts/clarification-local.test.mjs scripts/clarification-adversarial-local.test.mjs
42 tests passed, 0 failed
```

Local strict type checking for the pure planner and application service passed using temporary stub types that are not committed. Browser build, full Hono tests, installed dependency checks, Playwright and live D1 remain unverified.

## Invariants retained

- Original intended-use text is never overwritten.
- Learned suggestions are not treated as evidence or as canonical rights.
- No server-side write, approval, quote, invoice, payment, permission or receipt is initiated by question generation.
- A complete human-confirmed version stops question generation.
- Unsupported rights block licensing rather than being silently coerced.
- The buyer capability never exposes another case or creator controls.
- Buyer answers are not accepted or persisted yet. The route is explicitly labeled read-only.

## Acceptance relationship

- `RR-P0-021`: local generator scenarios pass, browser and buyer-answer roundtrip are still open.
- `RR-P0-038`: expanded adversarial source and caller tests pass locally; system-wide deployed security not established.
- `RR-P0-039`: no AI authority for consequential state.
- `RR-P0-001`: Turn 007 dependency gate still blocks formal completion.

## Next work

Gate B, AI readiness review. Treat the Turn 018 held-out false resolutions, dataset bias, installed-browser test gap, source semantics, and incomplete clarification-answer persistence as open deficiencies, not successful acceptance evidence.

No paid API, GitHub Actions, production payment, secret, or user handoff was introduced.
