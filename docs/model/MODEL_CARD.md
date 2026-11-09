# RightsReceipt Local Lexical Model Card v1

**Date:** October 26, 2026 HST
**Owner:** Turn 018
**Status: NOT APPROVED for automatic rights resolution, public deployment, or payment-related decisions.**

## Purpose and permitted use

The learned classifier may rank licensing-rights suggestions for human inspection. It cannot authorize a price, approve terms, accept for a buyer, create a PayPal invoice, confirm payment, or activate permission. It is never authoritative, even for a complete, high-scoring request. The creator must approve exact immutable terms independently of the model.

The model is rightsreceipt-synthetic-lexical, version 2026-10-26-v1, using artifact SHA-256:
6ea099b72fe00ce4643426a2729a84b207ae8eb3460c75488fab3502037e73e2

The source consists of project-authored synthetic licensing requests released under the repository MIT license. No real buyer records, paid API calls, or outside training corpus were used.

## Architecture

The classifier consists of twelve independent one-versus-rest linear heads with 768 binary ASCII unigram/bigram features. The training run used scikit-learn. Portable TypeScript inference uses quantized signed 16-bit weights, per-class scales, and intercepts, and was checked against Python predictions. This model ranks labels but does not extract evidence spans or calculate probabilities.

The dataset has 960 training, 240 validation, and 240 held-out requests. Source-frame template families and scenario-group IDs are separated across splits, but licensing clause vocabulary overlaps substantially. That makes synthetic validation optimistic and limits generalization.

## Validation-only selective abstention

The candidate score is the raw top-class minus runner-up linear margin. It is **not a probability or calibrated confidence**.

Before opening the held-out test, each of twelve thresholds was frozen using only validation. Each threshold is the midpoint between the highest margin of an incorrectly resolved validation label and the lowest margin of a correctly resolved one. For attribution, which had no incorrect resolved prediction in validation, the threshold is half of its minimum correct margin.

Validation without gates: 2,851/2,880 exact field labels, with 26 incorrectly resolved labels. Validation after margin gating: 2,302 diagnostic resolved candidates with zero observed errors. This is a fitted validation result, not independent evidence of perfect precision.

The exact policy is in data/model/v1/validation-margin-gates.json, SHA-bound to the model and validation corpus. It sets automaticResolutionApproved=false, confidenceIsCalibratedProbability=false, evidenceStillRequired=true, quoteEligible=false and permittedActions=[].

## One-time held-out result

The frozen thresholds were applied to the 240 test records once, without adjusting the policy afterward.

| Measure | Held-out |
| --- | ---: |
| Labeled fields | 2,880 |
| Exact raw labels | 2,855 (99.13%) |
| Incorrect raw resolved labels | 17 |
| Candidate labels passing validation gates | 2,303 |
| Correct candidates | 2,300 |
| **Incorrect candidates** | **3** |
| Diagnostic candidate precision | 2,300 / 2,303 (99.87%) |
| Recall on resolved gold fields | 2,300 / 2,304 (99.83%) |
| Injection-pair label agreement | 12 / 12 (fixed synthetic examples only) |

The aggregate score hides the principal risk. Three candidate outputs were incorrectly marked resolved when the original request contained contradictory terms. This is 3 of the 24 contradictory gold field instances. Those errors occurred in impression limits and sublicensing, both consequential rights.

## Per-field results

| Field | Validation raw exact | Held-out raw exact | Held-out wrong raw resolutions | Gated candidates | Wrong gated candidates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Use purpose | 237/240 | 239/240 | 0 | 198 | 0 |
| Channels | 238/240 | 239/240 | 1 | 176 | 0 |
| Paid advertising | 239/240 | 236/240 | 1 | 191 | 0 |
| Territories | 236/240 | 239/240 | 1 | 195 | 0 |
| Start date | 238/240 | 238/240 | 2 | 189 | 0 |
| Duration days | 237/240 | 239/240 | 1 | 188 | 0 |
| Maximum impressions | 234/240 | 236/240 | 3 | 187 | 1 |
| Exclusivity | 237/240 | 238/240 | 1 | 189 | 0 |
| Modification | 238/240 | 238/240 | 2 | 194 | 0 |
| Attribution | 240/240 | 236/240 | 2 | 193 | 0 |
| Sublicensing | 238/240 | 237/240 | 3 | 202 | 2 |
| AI use | 239/240 | 240/240 | 0 | 201 | 0 |

## Documented counterexamples

- rrs-10-02-06: an impression-cap contradiction was incorrectly proposed as 500,000 impressions. Margin 3.681300 was above the 2.907805 validation gate.
- rrs-10-02-10: contradictory sublicensing was incorrectly proposed as prohibited. Margin 8.285758 exceeded the 5.610012 gate.
- rrs-11-02-10: another sublicensing contradiction was incorrectly resolved. Margin 7.509206 also passed.

The source requests and immutable gold labels remain in the versioned held-out corpus. These observations were recorded without fitting new thresholds on those three failures.

## Calibration caveats

Only selective margin thresholding has been performed. No validated mapping of scores to real-world correctness probabilities exists, so confidence basis points remain null. A score margin cannot be reported as a 95% or 99% probability. Field observations from one synthetic request are not statistically independent. Sample-level estimates are not a deployment precision guarantee.

The model lacks adequate evidence on free-form natural requests, misspellings, other languages, implicit rights, legal nuance, and truly novel adversarial text. Its existing confidence-like margins are vulnerable to conflict clauses. There is no human-labeled real-world test set, fairness analysis, or copyright/legal validation.

## Fail-closed release decision

**BLOCKED: model auto-resolution is not approved.** The read-only policy consumer always returns twelve unresolved observation states, null normalized canonical values, null confidence basis points, empty source spans, and no action authority. Diagnostic guesses can be shown for review only and cannot be passed as terms to the deterministic quote engine.

Turn 019 must require exact original-text evidence, deterministic corroboration, and explicit contradiction detection before any proposed value is presented for human correction. Even fully evidenced proposals cannot approve a quote or license rights. A future improved model must receive a new evaluation version rather than tuning against this consumed held-out split.

## Reproduction

Run these commands from the repository root with Node 22:

    node --no-warnings --experimental-strip-types --test scripts/model-calibration-local.test.mjs
    node --no-warnings --experimental-strip-types scripts/evaluate-model-calibration.mjs --validation
    node --no-warnings --experimental-strip-types scripts/evaluate-model-calibration.mjs --heldout

The evaluator checks the committed dataset SHA-256 manifest and the model artifact SHA-256, then scores the exact records. The separate held-out report is data/model/v1/heldout-calibration-report.json. Turn 007's installed-dependency and Gate A browser gates remain open.
