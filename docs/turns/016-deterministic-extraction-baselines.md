# Turn 016: High-Precision Deterministic Extraction Baselines

**Priority:** P0  
**Status:** Implemented and locally verified; full installed-library and browser gate still blocked  
**Date:** October 26, 2026 HST

## Objective

Build a model-free, conservative rights extractor for supported dates, durations, impression quantities, paid social platforms, territories, and explicit rights clauses. Return original-text evidence, unsupported states, contradiction and ambiguity signals, and abstention without assuming unspecified permissions.

## Implemented

- `packages/ai-runtime/src/deterministic-rules.ts`: exact-clause and anchored numeric rules for the twelve P0 rights fields, with only supported resolved values.
- `packages/ai-runtime/src/deterministic.ts`: injected SHA-256 context binding and safe Turn 014 proposal assessment.
- `packages/ai-runtime/src/deterministic-rules.test.ts`: three authored Vitest cases, not yet executed.
- `scripts/deterministic-local.test.mjs`: twenty-one independent source/evidence/adversarial tests.
- `scripts/evaluate-deterministic.mjs`: dependency-free dataset scorer that first checks committed corpus hashes and row counts.
- `data/deterministic/v1/train-validation-metrics.json` and `heldout-metrics.json`: exact aggregate, per-field, per-category verification counts.
- `docs/model/DETERMINISTIC_BASELINE.md`: behavior, evaluation, limits, provenance and next handoff.
- Updated root verification commands, AI exports, model index, README and project status.

## Objective verification performed

- 21 native Node tests passed with zero failures.
- Strict offline TypeScript checking passed for the pure rule engine, wrapper, and contract.
- The synthetic Turn 015 train/validation/test JSONL byte hashes, sizes, and row counts matched the GitHub manifest exactly after independent reproduction of its generator.
- Each generated proposal passed the strict `rights-extraction-v1` shape and original evidence validator.
- On train+validation: 1,200 requests, 11,520 correct resolved values, zero false resolved values, 100% exact resolution-state agreement and correct abstention on the authored corpus.
- On the once-evaluated held-out test: 240 requests, 2,304 correctly resolved values, zero false resolved values, 100% exact state agreement and correct abstention.
- No rule changes were made after held-out evaluation.
- Code preserves model ID/version/artifact hash and numerical confidence as null for deterministic observations.
- No AI action is permitted to create a quote, accept rights, mark paid, or issue a license.
- No secrets, paid API, user data, GitHub Actions, or production PayPal endpoints were introduced.

**Crucial limit:** These figures reflect a small, templated, project-authored data set with repeated licensing-clause vocabulary. They do not establish true real-world accuracy or independent semantic generalization. Future model and adversarial evaluations must use genuinely novel expressions and error analysis.

## Acceptance relationship

- `RR-P0-033`: deterministic parsing and field-level safe abstention verified locally; broader natural-language evaluation remains open.
- `RR-P0-037`: omission, vague terms, unsupported rights and conflict safety advanced through field-state tests.
- `RR-P0-038`: injection commands are inert on the deterministic proposal path, with larger adversarial suite owned by Turn 020.
- `RR-P0-039`: AI task validator retains no price, consent, payment, or license authority.
- `RR-P0-032`: no learned model yet, belongs to Turn 017.
- `RR-P0-001`: full clean pnpm install and browser verification remain blocked.

## Verification commands

```bash
node --no-warnings --experimental-strip-types --test scripts/deterministic-local.test.mjs
node --no-warnings --experimental-strip-types scripts/evaluate-deterministic.mjs
node --no-warnings --experimental-strip-types scripts/evaluate-deterministic.mjs --heldout

tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes \
  --target ES2023 --module ESNext --moduleResolution Bundler \
  packages/ai-runtime/src/contract.ts \
  packages/ai-runtime/src/deterministic-rules.ts \
  packages/ai-runtime/src/deterministic.ts
```

## Remaining blockers

The existing Turn 007 npm registry DNS blocker still prevents clean dependency install, installed-library types, Vitest, Vite build, Wrangler dry run, and browser acceptance. Gate A remains unpassed. The baseline is not wired to the buyer form or D1 records; that belongs to Turn 019.

## Next independent turn

Turn 017: Train and export a portable local classification model, with reproducible seed and weights, honest evaluation and no paid inference API. Model threshold selection and independent evaluation remain with Turn 018.
