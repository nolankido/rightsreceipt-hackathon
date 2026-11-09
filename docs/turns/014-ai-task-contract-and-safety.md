# Turn 014: Define AI Task Contract and Safety Behavior

**Priority:** P0  
**Status:** Implemented and locally verified. Installed-dependency and browser checks remain blocked by Turn 007.  
**Date:** October 26, 2026 HST

## Objective

Freeze and enforce a safe, versioned, twelve-field extraction proposal contract. Require original-text evidence, explicit resolution states, model identity and provenance, supported P0 labels, field-level abstention, and no price, approval, payment, or permission authority.

## Changes

- Added the model-independent TypeScript extraction validator, input hash binding, exact UTF-16 evidence spans, supported-label checks, and strict no-extra-key shape checks.
- Added four resolution states: resolved, unresolved, contradictory, and unsupported.
- Added source model ID, model version, artifact SHA-256, and extractor version requirements; deterministic source metadata is kept separate.
- Added a versioned per-field calibration interface tied to the exact artifact hash. Missing or insufficient calibrated confidence safely abstains.
- Added fail-closed whole-proposal rejection, sanitized codes, immutable snapshots, and twelve-field fallback.
- Hardcoded AI assessment authority as reviewRequired=true, quoteEligible=false, permittedActions=[].
- Added matching strict Zod wire schemas and Vitest source tests for future installed-dependency verification.
- Documented negation, missing provisions, contradictory evidence, unsupported expansion, prompt injection, relative dates, confidence limitations, and data handoff.
- Added the ai:verify command to both root quality gates. No paid inference API or GitHub Actions introduced.

## Verification

    node --no-warnings --experimental-strip-types --test scripts/ai-contract-local.test.mjs
    28 tests, 28 passed, 0 failed

    tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target ES2023 --module ESNext --moduleResolution Bundler packages/ai-runtime/src/contract.ts packages/ai-runtime/src/index.ts
    0 errors

The dependency-free tests cover supported values and bounds, field order and completeness, exact evidence spans, emoji UTF-16 offsets, missing evidence, invalid input hashes, schema versions, forbidden payment and approval keys, unsupported or contradictory terms, uncalibrated and low-confidence abstention, wrong model hash, deterministic source reliability, and immutable assessment snapshots.

## Requirements

- RR-P0-039: authority boundary passing locally, model output has no quote/payment/consent/permission authorization.
- RR-P0-018 and RR-P0-019: future evidence and confidence display groundwork only, not executed model or browser evidence.
- RR-P0-032 through RR-P0-038: future training, inference, dataset, calibration, and adversarial tests remain open.
- RR-P0-001: clean dependency install, full Vitest, build, Wrangler, and browser gate remain blocked.

## Limitations

The validator checks that excerpts match source text, but cannot itself prove semantic entailment. Human approval is still mandatory. No learned model, inference accuracy, calibration report, live D1, PayPal Sandbox behavior, or browser acceptance is claimed. The strict Zod schema and Vitest tests are authored but could not run without the missing dependencies.

## Next work

Turn 015: deterministic synthetic training and held-out datasets, with omission, conflict, unsupported, adversarial, and provenance fixtures. Turn 007 and Gate A verification blockers stay open.
