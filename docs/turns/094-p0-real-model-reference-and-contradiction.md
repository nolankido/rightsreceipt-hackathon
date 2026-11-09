# Turn 094: Verify the real bundled AI model and disclose a missed contradiction

**Date:** November 4, 2026  
**Priority:** P0 judge credibility and executable AI evidence  
**Previous change:** Turn 093, artifact-bound model identity

## Actual finding, not a synthetic fixture pass

The bundled `data/model/v1/artifact.json` was retrieved from the private GitHub source and its SHA-256 independently computed in JavaScript. The digest matched `trainingArtifactSha256` in the committed training report:

```text
6ea099b72fe00ce4643426a2729a84b207ae8eb3460c75488fab3502037e73e2
```

The model is `rightsreceipt-synthetic-lexical`, version `2026-10-26-v1`, containing 12 field heads, a 768-feature lexical vocabulary and 55,296 signed integer weights.

I decoded the **real committed weights** and executed their published quantized linear scoring algorithm against all six frozen examples in `data/model/v1/reference-predictions.json`. All **72 label decisions** and **72 pairs of raw best/runner-up scores** matched within 1e-9. This calculation ran in isolated JavaScript, not through an imported Node TypeScript module. It is independent corroboration of the real trained artifact, not a green end-to-end release check.

The current synthetic judge example is:

- **Complete:** `Territory is the US and Canada.`
- **Contradictory:** `Target the US and Canada. Rights should be for Germany only.`

The current classifier returns `territories = ['US', 'CA']` with `resolutionState: 'resolved'` for **both**, missing the contradiction. This is a real model limitation, not a mock failure. The learned output is always advisory, with `quoteEligible: false` and no permitted actions. The judge demonstration must not imply that this model reliably detects conflicting rights.

## Implemented correction

- Updated `scripts/judge-ai-demo.mjs` to place an explicit **Conflicting territories: human decision required** warning next to the contradictory case. It explains the competing geographic claims and that a seemingly resolved learned suggestion is not evidence of agreed terms.
- Added a structural guard ensuring the synthetic contradictory case actually retains both `US and Canada` and `Germany only` before the report can be generated.
- Added `scripts/judge-ai-live-local.test.mjs` with executable Node 22 tests that load the **actual bundled model**, verify its SHA-256 and identity, reproduce all 72 frozen reference labels and scores, inspect the known contradiction and no-authority constraints, execute the complete AI report, and launch the actual CLI without inherited provider credentials.
- Added this real-artifact integration test to the normal `judge:console:verify` script, which is included in `pnpm release:verify`.
- Updated the mock AI demo regression to require the conflict warning and the real judge-console smoke to reject reports missing it.
- Updated the video storyboard to show the **observed incorrect suggestion** and explain why human approval is needed. No fake or corrected model results should be substituted in the video.

## What was and was not verified

**Verified in this turn:** The committed model artifact SHA, six reference examples and all 72 label and numeric score comparisons via independent JavaScript evaluation of the actual weights; the model's observed US/Canada prediction on contradictory input; the presence of updated source, tests and release script in the private repository. The Node 22.16.0 runtime accepts the `--experimental-strip-types --test` flags.

**Not verified:** The added real-artifact Node tests have **not** been executed in a complete private checkout, nor has the full pnpm release, actual end-to-end browser console, PayPal Sandbox merchant-to-buyer payment and verified webhook, sanitized public repository, public YouTube upload or Devpost submission. The private repository is not accessible for cloning from this container. Do not mark these gates as passed.

## Follow-up sequence

Run from one final clean commit using Node 22.13+ and pnpm 12.8.2:

```bash
pnpm judge:console:verify
pnpm release:verify
```

The first must pass the new real model tests, the browser AI route and the simulated transaction rehearsal. Then establish real Sandbox invoice/payment/webhook evidence with different merchant/buyer accounts, export the sanitized one-commit public repository, record a truthful public video under three minutes, and submit Devpost.

**Internal submission goal:** November 9, 2026 at 3:00 p.m. Eastern. **Official cutoff:** November 12, 2026 at 3:00 p.m. Eastern. No live payment, paid API, GitHub Actions, public repository visibility change or external submission occurred during this turn.
