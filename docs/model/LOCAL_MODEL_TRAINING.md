# Local Learned Model v1: Training and Portable Inference

**Owner:** Turn 017  
**Status:** Trained from the frozen synthetic training partition; exported and locally verified; calibration and held-out evaluation are deliberately pending Turn 018.  
**Task:** Rank a proposed state and supported label for each of the twelve RightsReceipt fields. The model does not provide evidence spans or authorize actions.

## Design

A small **learned** binary lexical n-gram classifier complements, but does not replace, the conservative deterministic extractor. Training fits twelve independent one-versus-rest logistic-loss models with scikit-learn `SGDClassifier`. Each head ranks a finite set of labels drawn from the Turn 015 training data. The shared vocabulary consists of 768 high-document-frequency unigram and bigram features learned from **training only**. Features are binary. The tokenizer uses lowercased ASCII sequences matching `[a-z0-9]+`; UTF-16 evidence spans are not inferred by this model.

This is a supervised learned classifier with trained intercepts and coefficients, not a renamed set of hand-authored rules. Model training uses no network services, external LLM, real buyer information, or paid API.

Every coefficient is quantized to signed int16 with a separate positive scale per class. The portable artifact contains a vocabulary, a class-label dictionary for each field, intercepts, scales, packed little-endian weights, immutable identity, dataset binding, and an explicit no-authority policy. TypeScript loads the model through a SHA-256 checked loader using the native Web Crypto API and runs inference with no Python or machine-learning dependency. Model bytes are approximately 165 KB and intended for same-origin, read-only serving.

## Reproducibility

Pinned development environment:

- Python 3.13.5
- NumPy 2.3.5
- SciPy 1.17.0
- scikit-learn 1.8.0
- Single-thread BLAS configuration
- `SGDClassifier(loss='log_loss', penalty='l2', alpha=0.0003, random_state=171017, max_iter=400, tol=1e-6)`

The trainer has **no timestamp, randomness from system state, or held-out evaluation** in the output. Its outputs must reproduce byte-for-byte in the pinned environment. It authenticates input file SHA-256 and row counts against the committed Turn 015 dataset manifest. No labels, text, or vocabulary statistics from `test.jsonl` are read while training.

Commands from repository root:

```bash
python -m pip install -r training/requirements-model.txt
python training/train_local_model.py
python training/train_local_model.py --check
python training/export_reference_predictions.py
python -m unittest training/test_train_local_model.py
node --no-warnings --experimental-strip-types --test scripts/portable-model-local.test.mjs
node --no-warnings --experimental-strip-types scripts/evaluate-portable-local.mjs --check
```

`python training/train_local_model.py --check` retrains and verifies the exact committed artifact and training report. An independent TypeScript runtime reads the packed model, checks its trusted SHA-256, and predicts six frozen **validation-only** reference examples with less than `1e-9` raw-score difference from Python quantized reference math. `model:verify` runs the dependency-free Node tests and validation report check. Python is required only for retraining, not browser/Worker inference. `model:repro` reruns the reproducibility training check when the Python dependencies are installed.

## Results and risk

The uncalibrated learned head rankings matched the synthetic gold labels on **11,520 / 11,520** training field labels and **2,851 / 2,880** validation field labels (98.99 percent exploratory validation agreement). The exported quantized TypeScript runner also matched **2,851 / 2,880** labels on the same validation partition. It generated **26 falsely resolved labels** in validation. Injection/control-text baseline pairs matched on all **12 of 12** held-in-validation pairs. These numbers are measured only against repeated, project-authored synthetic phrase families. Do not extrapolate them to real buyer requests or characterize ranking scores as probabilities or thresholds.

Most classes, especially contradictory and unsupported examples, have very few samples. The model may generalize poorly to unfamiliar syntax, languages other than English, Unicode words beyond ASCII feature tokenization, negation, legal nuance, and requests combining more than one conflicting clause. It cannot detect copyright ownership or verify user intent.

**Turn 018 must inspect class-specific confusion, false resolutions, abstention, and held-out performance before setting any per-field threshold.** The 240-record held-out partition is not opened during Turn 017. Later evaluation must not adjust training hyperparameters based on that held-out data.

## Safety contract

The portable runner returns `status='uncalibrated_review_only'`, no confidence basis points, no evidence spans, `reviewRequired=true`, `quoteEligible=false`, and an empty permitted-action set. Its raw logits and margins are uncalibrated ranking signals. Even when a class ranks first, it is not a valid `AiExtractionProposal`: it lacks exact buyer-text evidence and trusted independent calibration.

A trusted separate artifact hash must match before loading. The runtime rejects malformed/oversized artifacts, unsupported values, changed permission flags, unrecognized field ordering, invalid weight packing, and identity tampering. Downstream services must first use the deterministic extractor to establish exact spans, then pass the strict Turn 014 proposal validator with independently set Turn 018 thresholds. No model output can set prices, authorize creator or buyer acceptance, claim PayPal payment, or issue permission.

The trained artifact must not be presented as a licensed rights decision. This build is a hackathon prototype using only synthetic training data.

## Versioned files

- `training/train_local_model.py`: reproducible trainer, dataset checks and 12-head export.
- `training/export_reference_predictions.py`: six validation-only Python quantized parity vectors.
- `training/test_train_local_model.py`: dataset integrity, lexical features and byte-for-byte retraining checks.
- `training/requirements-model.txt`: pinned optional Python retraining environment.
- `data/model/v1/artifact.json`: portable classifier weights and metadata.
- `data/model/v1/training-report.json`: exact training and validation metrics, hashes, runtime.
- `data/model/v1/reference-predictions.json`: independent Python-vs-TypeScript numerical parity fixtures.
- `data/model/v1/portable-validation-report.json`: validation-only exported-runner field and category counts, false resolutions, injection pair agreement.
- `packages/ai-runtime/src/portable-model.ts`: dependency-free typed reader and uncalibrated inference.
- `scripts/portable-model-local.test.mjs`: artifact identity, no authority, tampering, parity and deterministic runtime tests.
- `scripts/evaluate-portable-local.mjs`: validation-only scoring script.

## Release gates not closed

- Turn 018 calibration and held-out evaluation are not complete.
- Turn 019 application persistence, model integration, and evidence display are not complete.
- Turn 007 clean pnpm/Vitest/Vite/Worker build and Gate A browser acceptance remain blocked.
- No live D1 or PayPal Sandbox evidence exists.
