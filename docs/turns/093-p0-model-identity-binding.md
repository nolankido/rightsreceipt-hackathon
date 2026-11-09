# Turn 093: Bind judge AI results to the verified model identity

**Date:** November 4, 2026
**Priority:** P0, reliable proof of real learned-model execution
**Source:** private `main` after Turn 092

## Issue found

The one-click learned-AI diagnostic successfully generated rows using `model.predict(text)` for its two synthetic requests, but later called `model.predict(CASES[0][1])` **twice more** solely to display the model ID and model version. This was unnecessary work. More importantly, the displayed identity was not necessarily the identity of the two already-validated prediction objects. A stateful or inconsistent predictor could return different metadata on subsequent calls while the report appeared to describe the original rows.

## Changes implemented

1. In `scripts/judge-ai-demo.mjs`, after verifying the committed artifact bytes against the training-report SHA-256, parse `modelId` and `modelVersion` from those same verified artifact bytes. Require nonempty string values within the loader's supported 120-character bound.
2. Validate both actual prediction outputs against this fixed verified identity. A mismatch fails closed with `model_identity_invalid` and no report is returned.
3. Render the verified artifact identity directly instead of making two additional predictor calls. The normal two-case demonstration now performs **exactly two inferences**, one for the explicit request and one for the contradictory request.
4. In `scripts/judge-ai-demo.test.mjs`, update the synthetic artifact fixture to carry its own identity and add four regression tests for exact prediction count, a mismatched ID, a changing version across cases, and missing identity.
5. Adjust the existing HTML-escaping regression so it tests hostile content in a suggestion label rather than using an intentionally mismatched model ID, which correctly fails under the new invariant.

## Verification performed

- Inspected both final changed files through the private GitHub connector. Their JavaScript syntax parsed after removing ESM imports for a static V8 syntax check. Both satisfy the repository's formatting constraints relevant to these files: newline at EOF, no trailing whitespace, no tabs and no em dash.
- Executed the **exact edited `runJudgeAiDemo` function** in an isolated V8 source replay with injected model/extractor and a deterministic hash stub. **Nine of nine targeted assertions passed**: exactly two predictions, two cases and 24 field rows, identity display, incorrect ID refusal, between-case version drift refusal, quote-authority refusal, invalid field order refusal, HTML escaping and absent artifact identity refusal.
- This replay did **not** run the actual Node filesystem/crypto/model import or the complete private repository's test suite. The four added Node regression tests remain unexecuted against the full checkout. No claim of full release acceptance is made.

## Next gating work

The next step remains **a clean full checkout on Node 22 and pnpm 12.8.2**, then `pnpm judge:console:verify` and `pnpm release:verify`. The first must establish actual bundled-model execution in the browser as well as simulated application journeys. Separately obtain genuine Sandbox merchant/buyer invoice settlement, authenticated PAID GET and exact-invoice verified webhook evidence.

Only after those gates should the sanitized one-commit public source be published and the public under-three-minute demo and Devpost entry be finalized. The private development repository must remain private. Internal submission target: **November 9, 2026 at 3:00 p.m. Eastern**; official cutoff: **November 12, 2026 at 3:00 p.m. Eastern**.

No production PayPal calls, paid APIs, GitHub Actions, remote deployment, public publication or Devpost submission occurred in this turn.
