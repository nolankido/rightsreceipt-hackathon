# ADR 0004: Train Offline and Run a Portable Local Model in TypeScript

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** RightsReceipt project
- **Related turns:** Turn 004, implemented in Turns 014 through 020
- **Supersedes:** None
- **Superseded by:** None

## Context

The hackathon requires a real AI contribution, but RightsReceipt must not depend on paid inference, network availability, or a third-party model key. The deployed runtime is a Cloudflare Worker, where starting a Python service or loading arbitrary serialized Python objects is inappropriate.

The product needs a narrow, inspectable model that classifies supported licensing terms, preserves evidence and confidence, and abstains when it is uncertain. Deterministic extraction remains necessary for dates, quantities, platforms, territories, and explicit clauses.

## Decision

Use an offline Python training and evaluation pipeline and export a portable, schema-versioned JSON artifact that is interpreted by pure TypeScript in the Worker.

The architecture fixes these boundaries:

- synthetic dataset generation, splitting, training, calibration, export, and evaluation run in Python;
- the initial learned model family is a compact linear multi-label text classifier compatible with explicit numeric export;
- the artifact contains the vectorizer configuration, vocabulary or feature map, coefficients, intercepts, labels, thresholds, schema version, model version, and provenance hashes;
- the TypeScript runtime implements the matching normalization, vectorization, scoring, thresholding, and output contract;
- deterministic TypeScript extractors run alongside the learned model;
- no pickle, joblib, arbitrary Python object, remote LLM, or Python server is required at runtime;
- a corrupt or incompatible artifact fails closed;
- exact labels, feature design, estimator settings, thresholds, and metric targets remain owned by Turns 014 through 018.

## Consequences

### Positive

- Inference works offline and has no paid API cost.
- The deployed Worker has no Python runtime or model server dependency.
- A JSON artifact is reviewable, hashable, versionable, and testable across languages.
- Linear inference is small, fast, and explainable enough for the narrow task.
- Training and evaluation can use mature Python tooling while the product runtime remains TypeScript.
- The repository can prove which dataset and configuration produced the artifact.

### Negative and tradeoffs

- The TypeScript runtime must exactly reproduce Python preprocessing and scoring.
- Portable JSON can be larger than a binary model format.
- A compact linear model may not understand every paraphrase or complex context.
- The project must maintain cross-language equivalence tests.
- This approach is intentionally less general than a large language model.

## Alternatives considered

### A paid hosted language model API

Rejected because it adds cost, credentials, rate limits, availability risk, and a weaker claim of local reproducibility. It would also make authority boundaries harder to demonstrate.

### A local large language model

Rejected because model size, runtime compatibility, deployment limits, and latency are disproportionate to the narrow classification task.

### A Python inference service

Rejected because it adds a second runtime and deployment, network calls, service health, and credential management.

### ONNX runtime in the Worker

Considered but not selected for the initial model. ONNX is a valid portable format, but it introduces binary tooling and runtime weight for a model simple enough to implement directly. It remains a revisit option if the selected estimator cannot be exported safely as JSON.

### Deterministic rules only

Rejected because the project needs a genuine learned component and rules alone are weaker for paraphrase classification. Rules remain a high-precision complement.

## Validation

Turns 015 through 019 must demonstrate:

- deterministic dataset generation and split hashes;
- repeatable training and export;
- a schema-validated artifact;
- Python and TypeScript predictions that match within documented tolerance;
- per-label held-out metrics and thresholds;
- abstention on selected ambiguous and contradictory cases;
- inference without network access or external credentials;
- an artifact size and latency acceptable for the Worker build.

## Revisit triggers

- Python and TypeScript inference cannot be made equivalent.
- The artifact exceeds Worker size or latency limits.
- Held-out evidence shows the linear model cannot reach a safe usefulness threshold.
- ONNX or another portable format materially reduces risk without adding deployment instability.

## References

- [scikit-learn model persistence](https://scikit-learn.org/stable/model_persistence.html)
- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md)
