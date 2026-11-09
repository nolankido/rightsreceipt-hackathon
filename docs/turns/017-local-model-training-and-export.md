# Turn 017: Train and Export the Local Classification Model

**Priority:** P0  
**Date:** October 26, 2026 HST  
**Status:** Completed for reproducible local training, quantized export and dependency-free inference; external build and calibration gates remain open.

## Objective and exit

Train a compact learned multi-field licensing classifier from the frozen training partition, preserve a versioned reproducible training configuration and evidence, export pure-TypeScript readable weights, and verify numerical parity. Do not use paid APIs or touch the held-out test partition.

## Implementation

- Trained twelve independent logistic-loss one-versus-rest classifiers on training records only.
- Selected the 768-feature shared binary unigram/bigram vocabulary from the training split only.
- Exported 55,296 learned weights as quantized signed 16-bit little-endian base64 with a per-class scale and unquantized class intercepts.
- Stored class-label value dictionaries that preserve canonical supported rights values and explicit non-resolved states.
- Stored SHA-256 bindings for training input, dataset manifest, training source, and exported artifact.
- Implemented a pure TypeScript loader verifying trusted artifact SHA-256, exact schema/rights allowlists, artifact authority restrictions, and packed dimensions before inferencing.
- Returned uncalibrated ranks only, with no spans, confidence, authority, quote eligibility or side-effect methods.
- Added six Python-to-TypeScript reference vectors, eight portable inference tests, a native Node validation-only audit, and six Python training tests.
- Added `model:verify` and `model:repro` root commands and included the dependency-free model gate in static and full local verification.

## Local verification

```text
python training/train_local_model.py
python training/train_local_model.py --check
python -m unittest training/test_train_local_model.py
node --no-warnings --experimental-strip-types --test scripts/portable-model-local.test.mjs
node --no-warnings --experimental-strip-types scripts/evaluate-portable-local.mjs --check
tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM packages/ai-runtime/src/portable-model.ts
```

The model was trained and reproducibility verified twice in the current environment using Python 3.13.5, NumPy 2.3.5, SciPy 1.17.0 and scikit-learn 1.8.0. Six Python-vs-TypeScript validation reference examples yielded matching class labels and raw scores within `1e-9`. Native Node tests and strict TypeScript checks passed. The generated report is checked byte-for-byte.

## Measured truth

- Training: 960 synthetic records and 11,520 field labels.
- Validation: 240 synthetic records and 2,880 field labels, with disjoint template families.
- Held-out test: untouched by training, scoring, and threshold selection.
- 768 shared feature columns, twelve class heads, and 55,296 learned coefficient entries.
- Training exact-label agreement: 11,520 / 11,520.
- Validation exact-label agreement: 2,851 / 2,880 (98.99%).
- Validation incorrectly resolved labels: **26**. These explicitly prevent any production inference or automatic material decisions.
- Injection baseline/attack pair agreement on validation: 12 / 12.
- Confidence calibration: **not implemented**. Raw scores are not calibrated probabilities.

The synthetic corpus reuses substantial clause vocabulary across template-family splits. These metrics do not establish real-world precision, safe automated permissions, or legal correctness.

## Acceptance relationship

- `RR-P0-034`: Reproducible versioned model training and portable export implemented and checked locally.
- `RR-P0-032`: No paid inference API required; actual application-model flow remains Turn 019.
- `RR-P0-035`: Training uses the committed reproducible, provenance-documented Turn 015 corpus.
- `RR-P0-036`: Validation evidence exists, but thresholds and held-out calibration remain Turn 018.
- `RR-P0-037`: Abstention safety remains enforced by the Turn 014 boundary; classification output is uncalibrated and not a structured proposal.
- `RR-P0-039`: Hardcoded read-only/no-authority interface, no quote/payment/approval actions.
- `RR-P0-001`: Installed pnpm, Vitest, Vite, Wrangler and browser gates remain blocked.

## Outstanding risks

- The training results are from authored templates and heavily correlated phrasing. There are 26 incorrect resolved labels even in validation.
- Python repeatability is pinned to the documented installed library versions; portability to other Python/library environments is not proven.
- The type-safe browser/Worker project has not been built with installed pnpm dependencies.
- Full held-out, calibration, model card, model safety evaluation and adversarial robustness remain open.

## Next

Turn 018: independently evaluate the committed model on the held-out set once, inspect per-class failures, calibrate selective per-field abstention thresholds from validation, produce the model card, and measure whether it adds value beyond deterministic extraction. Do not relax the authority boundary to achieve a high nominal accuracy.
