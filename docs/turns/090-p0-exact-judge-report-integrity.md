# Turn 090: Require an exact judge report generated from validated evidence

**Date:** November 4, 2026  
**Priority:** P0, release / public export evidence integrity  
**Previous improvement:** Turn 089

## Concrete defect

The judge artifact gate required canonical `evidence.json` plus a passing source-bound rehearsal, but validated `report.html` using only a handful of required substrings: page title, success statement, simulated-payment disclosure, source revision, and fingerprint. An unrelated or edited HTML page could retain those phrases while adding misleading claims or replacing the judge presentation. The release verifier, sanitized public exporter, and offline submission checker all depended on this gate, so the presentation half of the release evidence was not bound byte-for-byte to the validated data.

## Change implemented

- In `scripts/support/release-judge-evidence.mjs`, import the existing production `renderJudgeRehearsalReport` alongside the canonical JSON projector/serializer.
- After independently validating the saved canonical JSON, require the saved HTML bytes to exactly equal `renderJudgeRehearsalReport(evidence)`. Retain explicit disclosure and source-identity checks as defense in depth.
- In `scripts/support/release-judge-fixture.mjs`, generate test HTML with the same production renderer instead of a short synthetic phrase-only placeholder. This keeps the shared fixture realistic across the standalone evidence suite, the offline submission CLI test, and public export regression tests.
- Add a regression in `scripts/support/release-judge-evidence.test.mjs` confirming that appended markup and an altered success narrative fail even when the expected identifying and simulation-disclosure phrases remain. The unchanged report still passes.

This change does **not** replace the genuine PayPal Sandbox acceptance requirement with local evidence. It only prevents mismatched local presentation artifacts from being certified.

## Verification observed in this turn

1. The earlier mounted Node 22.16.0 standalone judge-artifact suite completed with **13 passed, 0 failed** before this patch. That was the prior source version.
2. The exact updated private GitHub source for the canonical validator, full report renderer, fixture, and gate was evaluated in a focused V8 replay. The replay exercised the real judge report and gate functions with a simulated filesystem and deterministic stub hash. A full 17/20/17-step canonical record passed; appended HTML and an altered success narrative failed; restoring the report passed again.
3. The updated files were saved to private `main`. **The post-edit Node test suite, full private-repo `pnpm release:verify`, public export suite, and genuine PayPal Sandbox acceptance have not been run.** The focused replay does not prove Node filesystem, real SHA-256, deployed behavior, or integration tests.

Do not mark the release green or the submission complete from this turn.

## Critical next sequence

From a clean clone of the latest private `main` on Node 22.13+ and pnpm 12.8.2:

```bash
pnpm submission:candidate:verify
pnpm public:export:verify
pnpm release:verify
```

Then obtain real Sandbox merchant-to-buyer invoice / PAID GET / signature-verified exact-invoice webhook evidence, export a distinct sanitized one-commit public repository, and publish an anonymously viewable functioning YouTube video shorter than three minutes. Submit Devpost before the **internal November 9, 3:00 p.m. Eastern target** and preserve confirmation; official deadline **November 12, 3:00 p.m. Eastern**.

**Execution limitation:** This turn did not use production credentials, paid APIs, remote hosting, public GitHub publication, YouTube, or Devpost.
