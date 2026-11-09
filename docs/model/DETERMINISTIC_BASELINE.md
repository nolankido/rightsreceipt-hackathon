# RightsReceipt Deterministic Extraction Baseline v1

**Owner:** Turn 016  
**Status:** Implemented; 21 dependency-free focused tests and source-level TypeScript checking pass  
**Runtime:** Node 22, pure TypeScript, no model, paid API, or network  
**Contract:** `rights-extraction-v1`  
**Extractor:** `rights-rule-baseline-v1`  
**Evaluation corpus:** `data/synthetic/v1`, project-authored synthetic templates

## Purpose and actual capability

The extractor identifies explicit, narrowly specified licensing clauses, records exact source evidence, and abstains when permission is not unambiguously supported. It intentionally trades coverage of unrestricted language for safe refusal to infer rights from silence. It is a baseline for a later local learned model, not that model itself.

Source:

- `packages/ai-runtime/src/deterministic-rules.ts`: pure, evidence-linked rule engine, no runtime library dependency
- `packages/ai-runtime/src/deterministic.ts`: trusted SHA-256 port and Turn 014 safety assessment wrapper
- `packages/ai-runtime/src/deterministic-rules.test.ts`: additional Vitest source tests, pending installed dependencies
- `scripts/deterministic-local.test.mjs`: native Node regression tests
- `scripts/evaluate-deterministic.mjs`: manifest-verified, per-field and per-category scoring
- `data/deterministic/v1/`: versioned evaluation reports

## Twelve-field behavior

For each material field the rule engine returns exactly one of the Turn 014 field observations:

- `resolved`: a supported value with at least one original UTF-16 evidence span and `explicit_evidence`
- `unresolved`: null value with `not_stated` or `ambiguous`
- `contradictory`: null value, two distinct exact spans, and `conflicting_evidence`
- `unsupported`: null value, source evidence and `out_of_scope`

Fields follow the fixed order: purpose, channels, paid ads, territories, start date, duration, impressions, exclusivity, modification, attribution, sublicensing, AI use.

The parser recognizes specific supported phrases for paid Instagram/Facebook, United States/Canada, dates, day counts, exact impression caps, commercial usage, nonexclusive rights, permitted crop or no modification, creator credit, no sublicensing and no AI training. Only numeric values within 1 to 365 days and 1 to 500,000 impressions may resolve. Dates must be actual ISO calendar dates.

Unsupported clauses including print, worldwide, exclusive licensing, retouching, third-party sublicensing, AI training, or invalid numbers are preserved as unsupported. Conflicting affirmative/negative or different quantity clauses become contradictory. Approximate, relative, negated, or unrecognized language abstains. The original input is never rewritten.

Every source span is a half-open `[startUtf16,endUtf16)` range into the **original buyer string**, not normalized Unicode, bytes, or code-point positions. Exact excerpt matching does not establish that a human intended the licensing meaning. Human review remains required.

## Contract and authority

`assessDeterministicRights(inputText, hasher)` hashes the unmodified text through an injected SHA-256 port, constructs a deterministic proposal, and passes it into the strict Turn 014 validator. The extractor identity contains `modelId=null`, `modelVersion=null`, `artifactSha256=null`, and `confidenceBasisPoints=null` on all fields.

Every assessment remains `reviewRequired=true`, `quoteEligible=false`, and `permittedActions=[]`. No price, consent, invoice, payment state, license permission, or receipt is computed or changed by this module.

This turn does not persist proposed observations into the case or automatically run them during request intake. That integration belongs to Turn 019. It does not train a model or choose confidence thresholds.

## Evaluation design

The exact Turn 015 source corpus was independently reconstructed in the verification workspace. Its train, validation, and test JSONL files matched the committed manifest on SHA-256 digest, size, and row count. All evaluation runs independently verify those file properties again before scoring. The evaluation script also verifies that every predicted field set passes the exact Turn 014 proposal validator.

The rules were developed using **train and validation** only. The held-out test partition was evaluated once after the baseline rules and focused tests were frozen. No rule changes were made after examining held-out results.

Metrics are intentionally reported as:

- **Resolved precision:** correctly resolved gold values / all predicted resolved values
- **Resolved recall:** correctly resolved gold values / gold resolved values
- **Correct abstention:** non-resolved predictions / gold non-resolved fields
- **State agreement:** exact resolved, unresolved, contradictory, or unsupported state matches across all fields
- **False resolutions:** a predicted resolved value when gold is unresolved, contradictory, unsupported, or differently resolved

### Frozen synthetic-corpus results

| Metric | Train + validation | Held-out test |
| --- | ---: | ---: |
| Requests | 1,200 | 240 |
| Field observations | 14,400 | 2,880 |
| Gold resolved fields | 11,520 | 2,304 |
| Correct resolved values | 11,520 | 2,304 |
| False resolved values | 0 | 0 |
| Resolved precision | 100% | 100% |
| Resolved recall | 100% | 100% |
| Correct abstention | 100% | 100% |
| Exact resolution-state agreement | 100% | 100% |
| Malformed proposals | 0 | 0 |

Reports include per-field and per-category results with source and corpus identifiers. SHA-256 for the frozen extractor source is:

`fd9bad462e9e7a852f91e6f1d86bf673e665184f0268c0a41e3ef4b9948ecc95`

This **is not evidence of 100% real-world accuracy.** The authored corpus has disjoint document-frame families but reuses the exact rights-clause vocabulary. The extractor is a lexicon and template recognizer written using those phrases. The held-out result primarily confirms that it handles the fixed clauses under unfamiliar *document frames*. It does not test unfamiliar rights wording, human disagreements, OCR, legal nuance, or production traffic. Independent, non-template and real-world evaluation will be required before any precision or completeness claims.

## Independent safety and boundary tests

The native Node suite covers: no default permissions for omissions; exact source spans with emoji; attribution negation versus required credit; explicit no-AI use; exclusivity, worldwide and print rejection; contradiction between source clauses; invalid February dates; 365 and 366 day boundaries; 500,000 and 500,001 impression boundaries; relative dates, seasons and vague view counts; approximate exact numbers; prompt-like commands remaining inert; and unsupported paraphrases abstaining rather than inventing values.

Twenty-one tests passed with zero failures. Three additional Vitest source tests were authored, but those have not executed due to the blocked Turn 007 dependency install.

## Commands

Dependency-free, from repo root:

```bash
node --no-warnings --experimental-strip-types --test scripts/deterministic-local.test.mjs
node --no-warnings --experimental-strip-types scripts/evaluate-deterministic.mjs
node --no-warnings --experimental-strip-types scripts/evaluate-deterministic.mjs --heldout
```

The root `pnpm deterministic:verify` runs the focused tests and train/validation scoring. `pnpm deterministic:heldout` runs the held-out scoring separately. Both root verification gates include the default deterministic gate but do not accidentally use held-out data for tuning.

## Limitations and next engineering handoff

- No actual learned-model inference or calibration exists.
- No D1 persistence of extracted observations, browser displays, or end-to-end model path exists.
- Generic natural-language requests may correctly abstain on many fields, requiring human correction.
- Original-text matching is not proof of semantic entailment or of copyright/licensing authority.
- A source phrase extracted within a longer, sarcastic or quoted statement may still be misleading. This requires broader adversarial evaluation and human review.
- Turn 017 owns the trained artifact and portable inference weights; Turn 018 owns real evaluation and calibration; Turn 019 owns inference integration; Turn 020 owns stronger adversarial testing.
- Turn 007 install/build and Gate A browser verification remain blocked. No production or PayPal readiness is claimed.
